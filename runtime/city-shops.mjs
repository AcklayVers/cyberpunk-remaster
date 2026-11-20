import { resolveCityShopCompendiumItem } from "./city-shop-compendiums.mjs";
import { createRuntimeId } from "./runtime-id.mjs";
import { CITY_SHOP_PROFILES } from "../data/city-shop-profiles.mjs";
import {
  cityShopPhysicalItem,
  cityShopImage,
  cityShopPriceCredits,
  cityShopPackQuantity,
  cityShopItemSource,
  loadCityShopItems,
} from "./city-shop-catalog.mjs";
export { loadCityShopItems } from "./city-shop-catalog.mjs";
import {
  CITY_MID as MID,
  CITY_SERVICES_HOOK,
  cityServices,
  updateCityServices,
  requireCityGM,
  cityPrivateDocuments,
  cityPrivateJournal,
  cityWritePrivate,
  cityValues,
  cityAuthor,
} from "./city-services-state.mjs";
const key = "cityShop";
const trustedShopDocument = (doc) => {
  const ownership = doc.ownership;
  // Flags and caller-supplied creator IDs are not provenance. Foundry maintains
  // lastModifiedBy on the server even when a player gives up document ownership.
  return (
    ownership?.default === 0 &&
    !!game.users.get(doc._stats?.lastModifiedBy)?.isGM &&
    Object.entries(ownership).every(
      ([userId, level]) =>
        userId === "default" || level === 0 || game.users.get(userId)?.isGM,
    )
  );
};
const trustedShops = () =>
  cityPrivateDocuments(key).filter(trustedShopDocument);
const privateShop = (id) =>
  trustedShops().find((d) => d.flags[MID][key].id === id);
const isDeleted = (id) =>
  !!privateShop(id)?.flags[MID][key].deleted ||
  (cityServices().deletedShopIds || []).includes(id);
const canonicalShop = (id) => {
  const shop = privateShop(id)?.flags[MID][key];
  if (!shop || isDeleted(id)) throw new Error("Магазин удалён или недоступен.");
  return structuredClone(shop);
};
const publicShop = (shop) => {
  const visible = structuredClone(shop);
  visible.customOffers = (visible.customOffers || []).map(
    ({ source: _source, ...offer }) => offer,
  );
  visible.randomOffers = (visible.randomOffers || []).map(
    ({ source: _source, ...offer }) => offer,
  );
  return visible;
};
const gmIds = () =>
  cityValues(game.users)
    .filter((u) => u.isGM)
    .map((u) => u.id);
export function cityMarketGrant(shopId, user = game.user) {
  if (isDeleted(shopId)) return null;
  let grant = null;
  for (const doc of cityValues(game.messages)) {
    const g = doc.flags?.[MID]?.cityMarketInvitation;
    if (
      cityAuthor(doc)?.isGM &&
      g?.shopId === shopId &&
      g.userId === user.id &&
      doc.whisper?.includes(user.id)
    )
      grant = g;
  }
  return grant;
}
export function cityShopStock(shop, items = []) {
  if (shop.deleted) return [];
  const p = CITY_SHOP_PROFILES[shop.type] || CITY_SHOP_PROFILES.general;
  let n = Number(shop.seed) || 1;
  const random = () =>
    (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
  const candidates = items.filter(
    (i) =>
      cityShopPhysicalItem(i) &&
      p.types.includes(i.type) &&
      !!i.uuid &&
      Number(i.system?.level?.value || 0) <= Number(shop.level ?? 20) &&
      (!p.words || new RegExp(p.words, "iu").test(i.name)) &&
      (!p.chrome ||
        JSON.stringify(i.flags || {}).includes("cyberware") ||
        /имплант|кибер|ПКТ|нейро/iu.test(i.name)),
  );
  const extra = (shop.randomOffers || []).filter(
    (offer) =>
      cityShopPhysicalItem(offer) &&
      Number(offer.level || 0) <= Number(shop.level ?? 20),
  );
  const extraIds = new Set((shop.randomOffers || []).map((offer) => offer.id));
  const pool = [
    ...candidates
      .filter((item) => !extraIds.has(item.uuid))
      .map((i) => ({
        id: i.uuid,
        uuid: i.uuid,
        name: i.name,
        img: i.img,
        type: i.type,
        level: Number(i.system?.level?.value || 0),
        description: String(i.system?.description?.value || ""),
        priceCredits: cityShopPriceCredits(
          i.system?.price,
          Math.max(0.01, Number(shop.markup) || 1),
        ),
        quantityPerPurchase: cityShopPackQuantity(i.system?.price),
      })),
    ...extra.map(({ source: _source, basePrice, ...offer }) => ({
      ...offer,
      priceCredits: cityShopPriceCredits(
        basePrice,
        Math.max(0.01, Number(shop.markup) || 1),
      ),
    })),
  ];
  const ranked = pool
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((offer) => ({ offer, rank: random() }))
    .sort((a, b) => a.rank - b.rank);
  const generated = ranked
    .slice(0, Math.max(1, Math.min(100, Number(shop.size) || 16)))
    .map(({ offer }) => ({
      ...offer,
      ...(shop.offerOverrides?.[offer.id] || {}),
    }));
  return [
    ...generated,
    ...(shop.customOffers || []).map(({ source: _source, ...offer }) => offer),
  ]
    .filter((offer) => !(shop.excludedOfferIds || []).includes(offer.id))
    .map((offer) => ({
      ...structuredClone(offer),
      price: {
        value: { credits: offer.priceCredits },
        per: offer.quantityPerPurchase,
      },
    }));
}
export function listCityShops() {
  if (game.user.isGM)
    return trustedShops()
      .map((d) => d.flags[MID][key])
      .filter((s) => !isDeleted(s.id))
      .map((s) => structuredClone(s));
  return cityServices()
    .shops.filter((s) => !s.hidden && !isDeleted(s.id))
    .map((s) => ({
      ...s,
      ...(cityMarketGrant(s.id)?.allowed ? cityMarketGrant(s.id).shop : {}),
    }));
}
export function cityMarketAccess(
  shop,
  { user = game.user, hour = 21, minute = 0 } = {},
) {
  if (!shop || shop.deleted || isDeleted(shop.id))
    return { allowed: false, reason: "Магазин удалён" };
  if (shop.hidden) return { allowed: false, reason: "Место недоступно" };
  if (user.isGM) return { allowed: true, reason: "Ведущий" };
  if (!shop.market) return { allowed: true, reason: "" };
  const t = hour + minute / 60,
    start = Number(shop.opens ?? 21),
    end = Number(shop.closes ?? 6),
    open =
      start === end ||
      (start > end ? t >= start || t < end : t >= start && t < end);
  if (!open)
    return { allowed: false, reason: `Закрыто · ${start}:00–${end}:00` };
  const grant = cityMarketGrant(shop.id, user);
  if (!grant?.allowed || grant.version !== shop.version)
    return { allowed: false, reason: "Требуется приглашение фиксера" };
  return { allowed: true, reason: "" };
}
export async function saveCityShop(data) {
  requireCityGM();
  const old = data.id ? privateShop(data.id) : null;
  if (data.id && isDeleted(data.id)) throw new Error("Магазин удалён.");
  const previous = old?.flags[MID][key] || {};
  const values = { ...previous, ...data };
  const shop = {
    id: data.id || createRuntimeId(),
    version: (old?.flags[MID][key].version || 0) + 1,
    markerId: String(values.markerId || ""),
    name: String(values.name || "Магазин"),
    img: cityShopImage(values.img || ""),
    type: CITY_SHOP_PROFILES[values.type] ? values.type : "general",
    market: !!values.market,
    hidden: !!values.hidden,
    seed: Number(values.seed) || Math.floor(Math.random() * 1e9),
    level: Math.max(0, Math.min(20, Number(values.level ?? 4))),
    size: Math.max(1, Math.min(100, Number(values.size) || 16)),
    markup: Math.max(0.01, Math.min(100, Number(values.markup) || 1)),
    opens: Math.max(0, Math.min(23, Number(values.opens ?? 21))),
    closes: Math.max(0, Math.min(23, Number(values.closes ?? 6))),
    fixer: String(values.fixer || "Фиксер"),
    requiredReputation: String(values.requiredReputation || ""),
    services: Array.isArray(values.services)
      ? structuredClone(values.services)
      : [],
    randomOffers: structuredClone(previous.randomOffers || []),
    customOffers: structuredClone(previous.customOffers || []),
    offerOverrides: structuredClone(previous.offerOverrides || {}),
    excludedOfferIds: [...(previous.excludedOfferIds || [])],
  };
  if (old) await cityWritePrivate(old, key, shop);
  else await cityPrivateJournal(`Торговля: ${shop.name}`, key, shop);
  const publicFields = [
    "id",
    "version",
    "markerId",
    "name",
    "img",
    "type",
    "market",
    "hidden",
    "opens",
    "closes",
    "fixer",
    "requiredReputation",
  ];
  await updateCityServices((s) => {
    s.shops = s.shops.filter((x) => x.id !== shop.id);
    if (!shop.hidden)
      s.shops.push(
        shop.market
          ? Object.fromEntries(publicFields.map((k) => [k, shop[k]]))
          : publicShop(shop),
      );
  });
  // A reroll updates the assortment for existing invitations without granting new users access.
  for (const u of cityValues(game.users))
    if (cityMarketGrant(shop.id, u)?.allowed)
      await grantCityMarketAccess({
        shopId: shop.id,
        userId: u.id,
        allowed: true,
      });
  return structuredClone(shop);
}
export async function deleteCityShop(id) {
  requireCityGM();
  const doc = privateShop(id);
  const shop = canonicalShop(id);
  const tombstone = {
    id,
    version: (shop.version || 0) + 1,
    name: shop.name,
    deleted: true,
  };
  await cityWritePrivate(doc, key, tombstone);
  await updateCityServices((s) => {
    s.shops = s.shops.filter((x) => x.id !== id);
    s.deletedShopIds = [...new Set([...(s.deletedShopIds || []), id])];
  });
  return tombstone;
}

function offerPrice(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Цена должна быть целым неотрицательным числом Credits.");
  return value;
}
function applyOfferPresentation(source, offer) {
  source.name = offer.name;
  source.img = offer.img;
  source.system ??= {};
  source.system.description ??= {};
  source.system.description.value = offer.description;
  return source;
}
async function persistOffers(shop) {
  const doc = privateShop(shop.id);
  await cityWritePrivate(doc, key, shop);
  return saveCityShop({ id: shop.id });
}
export async function saveCityShopOffer(data) {
  requireCityGM();
  let shop = canonicalShop(data.shopId);
  const custom = (shop.customOffers || []).find((o) => o.id === data.offerId);
  if (data.offerId && !custom) {
    const items = await offerCatalog(shop, data.offerId);
    shop = canonicalShop(data.shopId);
    const row = cityShopStock({ ...shop, excludedOfferIds: [] }, items).find(
      (o) => o.id === data.offerId,
    );
    if (!row) throw new Error("Предмета нет в ассортименте.");
    const override = {
      name: String(data.name ?? row.name),
      img: cityShopImage(data.img ?? row.img),
      description: String(data.description ?? row.description),
      priceCredits: offerPrice(data.priceCredits, row.priceCredits),
    };
    shop.offerOverrides ??= {};
    shop.offerOverrides[row.id] = override;
    shop.excludedOfferIds = (shop.excludedOfferIds || []).filter(
      (id) => id !== row.id,
    );
    const saved = await persistOffers(shop);
    return cityShopStock(saved, await offerCatalog(saved, data.offerId)).find(
      (o) => o.id === row.id,
    );
  }
  let source = custom?.source ? cityShopItemSource(custom.source) : null;
  const sourceUuid = String(data.sourceUuid || "").trim();
  if (sourceUuid) {
    const doc = await globalThis.fromUuid?.(sourceUuid);
    if (!doc) throw new Error("Исходный предмет удалён или недоступен.");
    source = cityShopItemSource(doc);
  }
  source ??= {
    name: "Новый товар",
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      quantity: 1,
      level: { value: 0 },
      description: { value: "" },
      price: { value: {} },
      rules: [],
    },
  };
  const offer = {
    id: custom?.id || `custom:${createRuntimeId()}`,
    name: String(data.name ?? custom?.name ?? source.name),
    img: cityShopImage(data.img ?? custom?.img ?? source.img),
    type: source.type,
    level: Number(source.system?.level?.value || 0),
    description: String(
      data.description ??
        custom?.description ??
        source.system?.description?.value ??
        "",
    ),
    uuid: sourceUuid || custom?.uuid || "",
    priceCredits: offerPrice(
      data.priceCredits,
      custom?.priceCredits ?? cityShopPriceCredits(source.system?.price),
    ),
    quantityPerPurchase: cityShopPackQuantity(source.system?.price),
  };
  if (!offer.uuid)
    source.system.price = {
      value: offer.priceCredits === null ? {} : { sp: offer.priceCredits },
      per: 1,
    };
  offer.source = applyOfferPresentation(source, offer);
  shop.customOffers = [
    ...(shop.customOffers || []).filter((o) => o.id !== offer.id),
    offer,
  ];
  await persistOffers(shop);
  const row = structuredClone(offer);
  delete row.source;
  return {
    ...row,
    price: {
      value: { credits: row.priceCredits },
      per: row.quantityPerPurchase,
    },
  };
}
export async function deleteCityShopOffer({ shopId, offerId }) {
  requireCityGM();
  const shop = canonicalShop(shopId);
  if ((shop.customOffers || []).some((o) => o.id === offerId))
    shop.customOffers = shop.customOffers.filter((o) => o.id !== offerId);
  else {
    if (
      !cityShopStock(shop, await offerCatalog(shop, offerId)).some(
        (o) => o.id === offerId,
      )
    )
      throw new Error("Предмета нет в ассортименте.");
    shop.excludedOfferIds = [
      ...new Set([...(shop.excludedOfferIds || []), offerId]),
    ];
  }
  await persistOffers(shop);
}
export async function getCityShopOfferSource({ shopId, offerId }) {
  requireCityGM();
  let shop = canonicalShop(shopId);
  let custom = (shop.customOffers || []).find((o) => o.id === offerId);
  const items = custom
    ? []
    : await offerCatalog(shop, offerId, { refresh: true });
  // Loading compendiums yields to edits and deletion of the selected shop.
  shop = canonicalShop(shopId);
  custom = (shop.customOffers || []).find((o) => o.id === offerId);
  const offer = cityShopStock(shop, items).find((o) => o.id === offerId);
  if (!offer) throw new Error("Предмета нет в ассортименте или он удалён.");
  const original =
    custom?.source ||
    (shop.randomOffers || []).find((o) => o.id === offerId)?.source ||
    items.find((i) => i.uuid === offer.uuid);
  const source = applyOfferPresentation(cityShopItemSource(original), offer);
  return { shop, offer, source };
}
async function offerCatalog(shop, offerId, options) {
  try {
    return await loadCityShopItems(options);
  } catch (error) {
    if ((shop.randomOffers || []).some((offer) => offer.id === offerId))
      return [];
    throw error;
  }
}
export async function addCityShopCompendiumItems({
  shopId,
  uuids,
  mode = "random",
}) {
  requireCityGM();
  canonicalShop(shopId);
  if (!["random", "fixed"].includes(mode))
    throw new Error("Неизвестный режим добавления товаров.");
  if (!Array.isArray(uuids) || !uuids.length || uuids.length > 200)
    throw new Error("Выберите от 1 до 200 предметов компендия.");
  const selected = [...new Set(uuids.map(String))];
  const resolved = await Promise.all(
    selected.map(resolveCityShopCompendiumItem),
  );
  requireCityGM();
  const shop = canonicalShop(shopId);
  let added = 0;
  for (const offer of resolved) {
    if (mode === "random") {
      shop.randomOffers ??= [];
      if (!shop.randomOffers.some((row) => row.uuid === offer.uuid)) {
        shop.randomOffers.push(offer);
        added++;
      }
      shop.excludedOfferIds = (shop.excludedOfferIds || []).filter(
        (id) => id !== offer.id,
      );
    } else {
      shop.customOffers ??= [];
      if (!shop.customOffers.some((row) => row.uuid === offer.uuid)) {
        const fixed = { ...offer };
        delete fixed.basePrice;
        shop.customOffers.push({ ...fixed, id: `custom:${createRuntimeId()}` });
        added++;
      }
    }
  }
  await persistOffers(shop);
  return { added, selected: selected.length, mode };
}
export async function removeCityShopRandomItem({ shopId, uuid }) {
  requireCityGM();
  const shop = canonicalShop(shopId);
  shop.randomOffers = (shop.randomOffers || []).filter(
    (offer) => offer.uuid !== uuid,
  );
  await persistOffers(shop);
}
export async function grantCityMarketAccess({ shopId, userId, allowed }) {
  requireCityGM();
  const doc = privateShop(shopId),
    u = game.users.get(userId);
  if (!doc || isDeleted(shopId) || !u)
    throw new Error("Рынок или получатель удалён.");
  const shop = doc.flags[MID][key],
    grants = structuredClone(u.getFlag?.(MID, "cityMarketGrants") || {});
  delete grants[shopId];
  await u.setFlag(MID, "cityMarketGrants", grants);
  await ChatMessage.create({
    content: `<p>АГЕНТ · ${allowed ? "Приглашение на Ночной рынок получено" : "Приглашение отозвано"}</p>`,
    whisper: [...new Set([userId, ...gmIds()])],
    flags: {
      [MID]: {
        cityMarketInvitation: {
          shopId,
          userId,
          allowed,
          version: shop.version,
          name: shop.name,
          ...(allowed ? { shop: publicShop(shop) } : {}),
        },
      },
    },
  });
  Hooks.callAll(CITY_SERVICES_HOOK);
}
export async function clearCityMarketCaches() {
  requireCityGM();
  for (const user of cityValues(game.users))
    if (Object.keys(user.getFlag?.(MID, "cityMarketGrants") || {}).length)
      await user.setFlag(MID, "cityMarketGrants", {});
}
export async function requestCityMarketAccess(shopId, actorId) {
  const shop = listCityShops().find((s) => s.id === shopId),
    actor = game.actors.get(actorId);
  if (
    !shop ||
    !actor ||
    (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
  )
    throw new Error("Место или персонаж недоступны.");
  return ChatMessage.create({
    content: "<p>АГЕНТ · Запрос приглашения на Ночной рынок</p>",
    whisper: [...new Set([game.user.id, ...gmIds()])],
    flags: {
      [MID]: {
        cityMarketRequest: {
          shopId,
          actorId,
          operationId: createRuntimeId(),
        },
      },
    },
  });
}
export async function giveCityShopItem({
  shopId,
  itemId,
  actorId,
  quantity = 1,
}) {
  requireCityGM();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
    throw new Error("Количество должно быть от1до99.");
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error("Магазин или персонаж удалён.");
  const { offer, source } = await getCityShopOfferSource({
    shopId,
    offerId: itemId,
  });
  source.system ??= {};
  source.system.quantity = quantity * offer.quantityPerPurchase;
  return actor.createEmbeddedDocuments("Item", [source]);
}
