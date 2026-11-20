import { createRuntimeId } from "./runtime-id.mjs";
import {
  CITY_MID as MID,
  CITY_SERVICES_HOOK,
  cityPrivateDocuments,
  cityPrivateJournal,
  cityWritePrivate,
  cityServices,
  cityValues,
  requireCityGM,
} from "./city-services-state.mjs";
import { getWorldCityMap } from "./world-city-map.mjs";
import { cityShopPhysicalItem } from "./city-shop-catalog.mjs";
import { listCityShops, cityMarketAccess } from "./city-shops.mjs";
import {
  campaignTimeAt,
  DEFAULT_WORLD_MAP_DATE,
} from "./world-city-map-clock.mjs";

const RECORD = "cityShopPurchase";
const REQUEST = "cityShopPurchaseRequest";
const RECEIPT = "cityShopPurchaseReceipt";
const terminal = new Set(["committed", "rejected", "refunded", "uncertain"]);
const bindingFields = [
  "userId",
  "operationId",
  "actorId",
  "shopId",
  "offerId",
  "quantity",
  "shopVersion",
  "expectedPriceCredits",
];
let queue = Promise.resolve();
const registrations = new WeakMap();
const gmIds = () =>
  cityValues(game.users)
    .filter((u) => u.isGM)
    .map((u) => u.id);
const activeGM = () =>
  game.user?.isGM &&
  (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const actualAuthor = (doc) =>
  game.users.get(doc?.author?.id || doc?.author || doc?.user?.id || doc?.user);
const recordOf = (doc) => doc?.flags?.[MID]?.[RECORD];
const requestOf = (doc) => doc?.flags?.[MID]?.[REQUEST];
function trustedRecord(doc) {
  if (
    doc.ownership?.default !== 0 ||
    !game.users.get(doc._stats?.lastModifiedBy)?.isGM
  )
    return false;
  return Object.entries(doc.ownership).every(
    ([id, level]) => id === "default" || level <= 0 || game.users.get(id)?.isGM,
  );
}
const purchaseDocuments = () =>
  cityPrivateDocuments(RECORD).filter(trustedRecord);
const sameBinding = (a, b) =>
  bindingFields.every((field) => a[field] === b[field]);
const validId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const creditPrice = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function binding(request, userId) {
  return Object.fromEntries(
    bindingFields.map((field) => [
      field,
      field === "userId"
        ? userId
        : (request[field] ?? (field === "quantity" ? 1 : null)),
    ]),
  );
}

function receipt(record) {
  return Object.fromEntries(
    [
      "id",
      "shopId",
      "actorId",
      "userId",
      "offerId",
      "itemName",
      "quantity",
      "deliveredQuantity",
      "totalCredits",
      "status",
      "message",
      "operationId",
      "updatedAt",
    ].map((field) => [field, record[field]]),
  );
}

async function write(doc, changes) {
  requireCityGM();
  const next = {
    ...structuredClone(recordOf(doc)),
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  await cityWritePrivate(doc, RECORD, next);
  return next;
}

async function publish(record) {
  const result = receipt(record);
  try {
    requireCityGM();
    await ChatMessage.create({
      content: "<p>АГЕНТ · Квитанция покупки</p>",
      whisper: [...new Set([record.userId, ...gmIds()])],
      flags: { [MID]: { [RECEIPT]: result } },
    });
  } catch {
    // The durable private receipt remains authoritative if its whisper cannot be acknowledged.
  }
  Hooks.callAll(CITY_SERVICES_HOOK);
  return result;
}

async function finish(doc, status, message, changes = {}) {
  const record = await write(doc, {
    ...changes,
    status,
    phase: status,
    message,
  });
  return publish(record);
}

async function uncertain(doc) {
  const message =
    "Исход операции не подтверждён. Нужна сверка ведущего; повторное списание и возврат заблокированы.";
  try {
    const current = recordOf(doc);
    return await finish(doc, "uncertain", message, {
      uncertainPhase: current.uncertainPhase || current.phase,
    });
  } catch {
    // Any persisted financial intent also blocks replay when the status write itself failed.
    return receipt({ ...recordOf(doc), status: "uncertain", message });
  }
}

function operationItem(record, items) {
  return cityValues(items).find((item) => {
    const flag = item.flags?.[MID]?.[RECORD];
    return (
      flag?.operationId === record.operationId &&
      flag.userId === record.userId &&
      flag.receiptId === record.id
    );
  });
}

function validateRequest(record) {
  if (
    ![record.operationId, record.actorId, record.shopId, record.offerId].every(
      validId,
    )
  )
    throw new Error("Неверные идентификаторы покупки.");
  if (
    !Number.isInteger(record.quantity) ||
    record.quantity < 1 ||
    record.quantity > 99
  )
    throw new Error("Количество упаковок должно быть от 1 до 99.");
  if (
    !Number.isSafeInteger(record.shopVersion) ||
    record.shopVersion < 1 ||
    !creditPrice(record.expectedPriceCredits)
  )
    throw new Error("Условия покупки устарели или цена не задана.");
}

function validateSource(source, actor) {
  if (!source || !source.name || !cityShopPhysicalItem(source))
    throw new Error("Предмет недоступен для покупки.");
  const ItemClass = globalThis.CONFIG?.Item?.documentClass;
  if (ItemClass) {
    const item = new ItemClass(source, { parent: actor, strict: true });
    if (item.validate?.({ strict: true }) === false)
      throw new Error("Данные предмета не прошли проверку.");
  }
}

function assertCurrentAccess(record, actor, shop) {
  requireCityGM();
  const user = game.users.get(record.userId);
  if (
    !user ||
    !actor ||
    game.actors.get(record.actorId) !== actor ||
    (!user.isGM && !actor.testUserPermission?.(user, "OWNER"))
  )
    throw new Error("Нет прав на персонажа.");
  if (
    !shop ||
    shop.deleted ||
    shop.hidden ||
    cityServices().deletedShopIds?.includes(record.shopId)
  )
    throw new Error("Магазин удалён или недоступен.");
  if (shop.version !== record.shopVersion)
    throw new Error("Ассортимент изменился. Обновите магазин.");
  const worldTime = Number(game.time?.worldTime) || 0;
  const clock = getWorldCityMap().clock || {
    anchorDate: DEFAULT_WORLD_MAP_DATE,
    anchorWorldTime: worldTime,
  };
  const date = new Date(campaignTimeAt(clock, worldTime).iso);
  const access = cityMarketAccess(shop, {
    user,
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  });
  if (!access.allowed)
    throw new Error(access.reason || "Магазин сейчас недоступен.");
}

async function validatePurchase(record) {
  validateRequest(record);
  const actor = game.actors.get(record.actorId);
  const { getCityShopOfferSource } = await import("./city-shops.mjs");
  const {
    shop,
    offer,
    source: canonicalSource,
  } = await getCityShopOfferSource({
    shopId: record.shopId,
    offerId: record.offerId,
  });
  assertCurrentAccess(record, actor, shop);
  if (
    !offer ||
    !creditPrice(offer.priceCredits) ||
    offer.priceCredits !== record.expectedPriceCredits
  )
    throw new Error("Цена изменилась или не задана. Обновите магазин.");
  const per = offer.quantityPerPurchase;
  if (
    !Number.isSafeInteger(per) ||
    per < 1 ||
    !Number.isSafeInteger(per * record.quantity) ||
    !Number.isSafeInteger(offer.priceCredits * record.quantity)
  )
    throw new Error("Неверное количество или цена упаковки.");
  if (
    !actor.inventory?.removeCurrency ||
    !actor.inventory?.addCurrency ||
    !Number.isFinite(actor.inventory.currency?.credits)
  )
    throw new Error("Кошелёк Credits SF2E недоступен.");
  const totalCredits = offer.priceCredits * record.quantity;
  if (actor.inventory.currency.credits < totalCredits)
    throw new Error("Недостаточно Credits.");
  const source = structuredClone(canonicalSource);
  delete source._id;
  delete source.uuid;
  delete source.folder;
  delete source.ownership;
  delete source._stats;
  source.system ??= {};
  source.system.quantity = per * record.quantity;
  source.flags ??= {};
  source.flags[MID] = {
    ...(source.flags[MID] || {}),
    [RECORD]: {
      operationId: record.operationId,
      userId: record.userId,
      receiptId: record.id,
    },
  };
  validateSource(source, actor);
  return {
    actor,
    source,
    totalCredits,
    deliveredQuantity: per * record.quantity,
    itemName: offer.name || source.name,
  };
}

async function execute(doc) {
  let record = recordOf(doc);
  let purchase;
  try {
    purchase = await validatePurchase(record);
  } catch (error) {
    return finish(doc, "rejected", error.message);
  }
  const { actor, source, totalCredits, deliveredQuantity, itemName } = purchase;
  try {
    // Persist intent before every native financial call. Neither a timeout nor a reload repeats it.
    record = await write(doc, {
      source,
      totalCredits,
      deliveredQuantity,
      itemName,
      phase: "debit-pending",
    });
    // A shop or ownership can change while the durable journal write awaits the server.
    try {
      assertCurrentAccess(
        record,
        actor,
        listCityShops().find((shop) => shop.id === record.shopId),
      );
    } catch (error) {
      return await finish(doc, "rejected", error.message);
    }
    requireCityGM();
    if (totalCredits > 0) {
      const removed = await actor.inventory.removeCurrency(
        { credits: totalCredits },
        { byValue: false },
      );
      if (removed === false)
        return await finish(doc, "rejected", "Недостаточно Credits.");
      if (removed !== true) return uncertain(doc);
    }
    record = await write(doc, { phase: "creation-pending" });
    requireCityGM();
    let created;
    try {
      created = await actor.createEmbeddedDocuments("Item", [source]);
    } catch {
      if (operationItem(record, actor.items))
        return await finish(doc, "committed", "Покупка завершена.");
      return uncertain(doc);
    }
    const delivered =
      operationItem(record, actor.items) || operationItem(record, created);
    if (delivered) return await finish(doc, "committed", "Покупка завершена.");
    if (!Array.isArray(created) || created.length !== 0) return uncertain(doc);
    // An explicit empty native result is a known creation veto, unlike a rejected promise.
    await write(doc, { phase: "refund-pending" });
    requireCityGM();
    if (totalCredits > 0)
      await actor.inventory.addCurrency({ credits: totalCredits });
    return await finish(
      doc,
      "refunded",
      "Выдача предмета отклонена. Credits возвращены.",
    );
  } catch {
    return uncertain(doc);
  }
}

async function recover(doc) {
  const record = recordOf(doc);
  const actor = game.actors.get(record.actorId);
  const creationUncertain =
    record.status === "uncertain" &&
    ["creation-pending", "committed"].includes(record.uncertainPhase);
  if (
    (creationUncertain || record.phase === "creation-pending") &&
    operationItem(record, actor?.items)
  ) {
    try {
      return await finish(doc, "committed", "Покупка завершена.");
    } catch {
      return uncertain(doc);
    }
  }
  if (terminal.has(record.status)) return publish(record);
  if (record.phase === "prepared") return execute(doc);
  return uncertain(doc);
}

function serialize(action) {
  const next = queue.catch(() => {}).then(action);
  queue = next;
  return next;
}

export function processCityShopPurchase(message) {
  return serialize(async () => {
    requireCityGM();
    // Resolve the stored document; flags cannot supply the authenticated buyer identity.
    const doc = game.messages.get(message?.id);
    const request = requestOf(doc);
    const user = actualAuthor(doc);
    if (!request || !user || !validId(request.operationId))
      return {
        status: "rejected",
        operationId: request?.operationId,
        message: "Запрос покупки недоступен.",
      };
    const wanted = binding(request, user.id);
    const matching = cityPrivateDocuments(RECORD).filter((entry) => {
      const record = recordOf(entry);
      return (
        record.userId === user.id && record.operationId === wanted.operationId
      );
    });
    const existing = matching.find(trustedRecord);
    if (existing) {
      if (!sameBinding(recordOf(existing), wanted))
        return {
          status: "rejected",
          operationId: wanted.operationId,
          message: "Эта операция уже связана с другими условиями покупки.",
        };
      return recover(existing);
    }
    if (matching.length)
      return publish({
        ...wanted,
        id: `blocked:${user.id}:${wanted.operationId}`,
        status: "uncertain",
        message:
          "Подлинность записи операции не подтверждена. Нужна сверка ведущего.",
      });
    const record = {
      ...wanted,
      id: createRuntimeId(),
      status: "pending",
      phase: "prepared",
      itemName: "",
      totalCredits: null,
      deliveredQuantity: null,
      message: "Покупка ожидает обработки.",
      updatedAt: new Date().toISOString(),
    };
    const entry = await cityPrivateJournal(
      "Торговля · операция покупки",
      RECORD,
      record,
    );
    if (!entry)
      return {
        status: "rejected",
        operationId: record.operationId,
        message: "Не удалось сохранить квитанцию покупки.",
      };
    return execute(entry);
  });
}

export function resolveCityShopPurchase({ receiptId, status, note }) {
  return serialize(async () => {
    requireCityGM();
    if (!["committed", "refunded", "rejected"].includes(status))
      throw new Error("Неверное решение по покупке.");
    if (typeof note !== "string" || !note.trim() || note.length > 2000)
      throw new Error(
        "Опишите ручную сверку кошелька и предметов в примечании.",
      );
    const doc = purchaseDocuments().find(
      (entry) => recordOf(entry).id === receiptId,
    );
    if (!doc) throw new Error("Квитанция покупки недоступна.");
    const record = recordOf(doc);
    if (record.manualResolution?.status === status && record.status === status)
      return publish(record);
    if (record.status !== "uncertain")
      throw new Error(
        "Решение доступно только для неопределённой операции; завершённая квитанция сохраняется.",
      );
    // The GM verifies and repairs native documents separately; this API only records that decision.
    return finish(
      doc,
      status,
      "Исход покупки подтверждён ведущим после ручной сверки.",
      {
        manualResolution: {
          userId: game.user.id,
          status,
          note: note.trim(),
          at: new Date().toISOString(),
        },
      },
    );
  });
}

export async function requestCityShopPurchase({
  shopId,
  offerId,
  actorId,
  quantity = 1,
  shopVersion,
  expectedPriceCredits,
  operationId = createRuntimeId(),
}) {
  const actor = game.actors.get(actorId);
  if (
    !actor ||
    (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
  )
    throw new Error("Нет прав на персонажа.");
  const request = {
    shopId,
    offerId,
    actorId,
    quantity,
    shopVersion,
    expectedPriceCredits,
    operationId,
  };
  validateRequest(request);
  const userId = game.user.id;
  const existing = cityValues(game.messages).find(
    (doc) =>
      actualAuthor(doc)?.id === userId &&
      requestOf(doc)?.operationId === operationId,
  );
  if (
    existing &&
    !sameBinding(binding(requestOf(existing), userId), binding(request, userId))
  )
    throw new Error("Эта операция уже связана с другими условиями покупки.");
  const result = listCityShopPurchaseReceipts({ shopId, actorId }).find(
    (entry) => entry.operationId === operationId && entry.userId === userId,
  );
  if (result && terminal.has(result.status)) return result;
  const doc =
    existing ||
    (await ChatMessage.create({
      content: "<p>АГЕНТ · Запрос покупки</p>",
      whisper: [...new Set([userId, ...gmIds()])],
      flags: { [MID]: { [REQUEST]: request } },
    }));
  if (activeGM()) return processCityShopPurchase(doc);
  return {
    status: "pending",
    operationId,
    message: "Покупка ожидает активного ведущего.",
  };
}

export function listCityShopPurchaseReceipts({ shopId, actorId } = {}) {
  const results = new Map();
  if (game.user.isGM) {
    for (const doc of purchaseDocuments()) {
      const record = recordOf(doc);
      results.set(record.id, receipt(record));
    }
  } else {
    for (const doc of cityValues(game.messages)) {
      const record = doc.flags?.[MID]?.[RECEIPT];
      if (
        record?.id &&
        actualAuthor(doc)?.isGM &&
        record.userId === game.user.id &&
        doc.whisper?.includes(game.user.id)
      )
        results.set(record.id, structuredClone(record));
    }
  }
  return [...results.values()]
    .filter(
      (entry) =>
        (!shopId || entry.shopId === shopId) &&
        (!actorId || entry.actorId === actorId),
    )
    .reverse();
}

export async function resumeCityShopPurchases() {
  requireCityGM();
  const seen = new Set();
  for (const doc of purchaseDocuments()) {
    const record = recordOf(doc);
    seen.add(JSON.stringify([record.userId, record.operationId]));
    await serialize(() => {
      requireCityGM();
      return recover(doc);
    });
  }
  for (const doc of cityValues(game.messages)) {
    const request = requestOf(doc);
    if (!request) continue;
    const key = JSON.stringify([actualAuthor(doc)?.id, request.operationId]);
    if (seen.has(key)) continue;
    seen.add(key);
    await processCityShopPurchase(doc);
  }
}

export function registerCityShopPurchases() {
  if (registrations.has(Hooks)) return registrations.get(Hooks);
  const created = Hooks.on("createChatMessage", (doc) => {
    if (requestOf(doc) && activeGM())
      void processCityShopPurchase(doc).catch(console.error);
    if (doc.flags?.[MID]?.[RECEIPT] && actualAuthor(doc)?.isGM)
      Hooks.callAll(CITY_SERVICES_HOOK);
  });
  const authority = () =>
    `${game.users.activeGM?.id || ""}:${Boolean(activeGM())}`;
  let lastAuthority = authority();
  const authorityChanged = () => {
    const current = authority();
    if (current === lastAuthority) return;
    lastAuthority = current;
    if (activeGM()) void resumeCityShopPurchases().catch(console.error);
  };
  const users = Hooks.on("updateUser", authorityChanged);
  const connected = Hooks.on("userConnected", authorityChanged);
  const handles = { created, users, connected };
  registrations.set(Hooks, handles);
  return handles;
}
