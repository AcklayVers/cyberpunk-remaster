import {
  listCityShopCompendiums,
  loadCityShopCompendium,
} from "./city-shop-compendiums.mjs";
import { createRuntimeId } from "./runtime-id.mjs";
import { createCityRefreshQueue } from "./city-refresh-queue.mjs";
import {
  getWorldCityMap,
  createWorldMapPointsExport,
  updateWorldMapMarker,
} from "./world-city-map.mjs";
import { cityEsc as esc } from "./world-city-map-media.mjs";
import {
  cityValues,
  CITY_MID as MID,
  CITY_SERVICES_HOOK,
  requireCityGM,
} from "./city-services-state.mjs";
import {
  listCityJobs,
  createCityJob,
  setCityJobStatus,
  requestCityJobAcceptance,
  deleteCityJob,
  openCityJobInNetwork,
  setCityJobMarker,
} from "./city-jobs.mjs";
import { generateCityGig } from "../data/city-gig-tables.mjs";
import { CITY_SHOP_PROFILES } from "../data/city-shop-profiles.mjs";
import {
  listCityShops,
  saveCityShop,
  cityShopStock,
  loadCityShopItems,
  cityMarketAccess,
  grantCityMarketAccess,
  requestCityMarketAccess,
  giveCityShopItem,
  deleteCityShop,
  saveCityShopOffer,
  deleteCityShopOffer,
  getCityShopOfferSource,
  addCityShopCompendiumItems,
  removeCityShopRandomItem,
} from "./city-shops.mjs";
import {
  requestCityShopPurchase,
  listCityShopPurchaseReceipts,
} from "./city-shop-purchases.mjs";
import {
  getCityCampaignTime,
  cityCalendarStatus,
  setCityCalendarMode,
  setupCityCalendar,
} from "./city-calendar.mjs";
import { CITY_NPC_ROSTER } from "../data/city-npc-roster.mjs";
import { NIGHT_CITY_LOCATIONS } from "../data/night-city-catalog.mjs";
import {
  previewCityPointsTransfer,
  applyCityPointsTransfer,
} from "./city-points-transfer.mjs";
import { mutateCityArchive } from "./city-archive-service.mjs";
const button = (action, label, attrs = "") =>
  `<button type="button" data-service-action="${action}" ${attrs}>${label}</button>`;
const select = (name, values, value) =>
  `<select name="${esc(name)}" data-service-field="${name}">${values.map(([id, label]) => `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
const input = (name, label, value = "", type = "text") =>
  `<label>${esc(label)}<input type="${type}" name="${esc(name)}" data-service-field="${name}" value="${esc(value)}"></label>`;
const textarea = (name, label, value = "") =>
  `<label>${esc(label)}<textarea rows="3" name="${esc(name)}" data-service-field="${name}">${esc(value)}</textarea></label>`;
const credits = (value) =>
  Number.isFinite(value)
    ? `${value.toLocaleString("ru-RU")} Credits`
    : "— Credits";
const ownedBuyers = () =>
  cityValues(game.actors).filter(
    (actor) =>
      actor.type === "character" &&
      (game.user.isGM || actor.testUserPermission?.(game.user, "OWNER")),
  );
const buyerId = (s, f) => {
  const actors = ownedBuyers();
  return (
    actors.find((actor) => actor.id === (f.buyerActorId || s.actorId))?.id ||
    actors[0]?.id ||
    ""
  );
};
const purchaseKey = ({
  shopId,
  offerId,
  actorId,
  quantity,
  shopVersion,
  expectedPriceCredits,
}) =>
  JSON.stringify([
    shopId,
    offerId,
    actorId,
    quantity,
    shopVersion,
    expectedPriceCredits,
  ]);
const purchaseLabels = {
  confirming: "Подтверждение",
  pending: "Ожидает ведущего",
  committed: "Покупка завершена",
  rejected: "Отклонено",
  refunded: "Средства возвращены",
  uncertain: "Требуется сверка ведущего",
  retry: "Повторить запрос",
};
const resolutionLabels = {
  committed: "Покупка проверена",
  refunded: "Возврат проверен",
  rejected: "Не исполнено",
};
const purchaseOperation = (state, request, receipts = []) => {
  const uncertain = [
    ...receipts,
    ...(state.purchaseOperations?.values() || []),
  ].find(
    (operation) =>
      operation.status === "uncertain" &&
      operation.shopId === request.shopId &&
      operation.offerId === request.offerId &&
      operation.actorId === request.actorId,
  );
  return uncertain || state.purchaseOperations?.get(purchaseKey(request));
};
const offerFields = [
  "offerName",
  "offerImg",
  "offerDescription",
  "offerPriceCredits",
  "offerSourceUuid",
];
const shopFields = [
  "shopId",
  "shopMarkerId",
  "shopName",
  "shopImg",
  "shopType",
  "shopLevel",
  "shopSize",
  "markup",
  "market",
  "hidden",
  "opens",
  "closes",
  "shopFixer",
  "requiredReputation",
  "decorative",
];
const imageEditor = (field, label, value = "") =>
  `<div class="city-shop-image-editor" data-service-image-target="${field}">${input(field, label, value)}<div class="city-service-actions">${button("image-pick", "Выбрать файл", `data-field="${field}"`)}<label class="city-shop-upload">Загрузить изображение<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" data-service-image-file="${field}"></label></div><small>URL / путь, файл или вставка изображения из буфера в это поле.</small>${value ? `<img class="city-shop-image-preview" src="${esc(value)}" alt="Предпросмотр изображения">` : ""}</div>`;

function shopReceiptHistory(receipts, gm) {
  const visible = receipts
    .filter((entry) => entry.status === "uncertain")
    .concat(
      receipts.filter((entry) => entry.status !== "uncertain").slice(0, 8),
    );
  return `<details data-sync="shop-receipts" class="city-shop-receipts" ${visible.length ? "open" : ""}><summary>Покупки и квитанции</summary>${button("purchase-refresh", "Обновить статус")}${
    visible
      .map(
        (receipt) =>
          `<p><strong>${esc(receipt.itemName || "Покупка")}</strong> · ${esc(receipt.quantity)} уп. · ${esc(credits(receipt.totalCredits))}<br>${esc(purchaseLabels[receipt.status] || receipt.status)}${receipt.message ? ` · ${esc(receipt.message)}` : ""}</p>${
            gm && receipt.status === "uncertain"
              ? `<div class="city-service-actions">${Object.entries(
                  resolutionLabels,
                )
                  .map(([status, label]) =>
                    button(
                      "purchase-resolve",
                      label,
                      `data-receipt-id="${esc(receipt.id)}" data-status="${status}"`,
                    ),
                  )
                  .join("")}</div>`
              : ""
          }`,
      )
      .join("") || "<p>Квитанций пока нет.</p>"
  }</details>`;
}

function compendiumMatches(picker = {}) {
  const query = String(picker.query || "")
    .trim()
    .toLocaleLowerCase("ru");
  return (picker.rows || []).filter((row) =>
    `${row.name} ${row.type}`.toLocaleLowerCase("ru").includes(query),
  );
}
function compendiumResultsHtml(picker = {}) {
  if (picker.loading) return "<p>Загрузка компендия…</p>";
  if (picker.message)
    return `<p class="city-service-warning">${esc(picker.message)}</p>`;
  const matches = compendiumMatches(picker),
    shown = matches.slice(0, 80);
  return `<p>Найдено: ${matches.length}. Показано: ${shown.length}. Выбор сохраняется при поиске.</p>${shown.map((row) => `<label class="city-shop-compendium-item"><input type="checkbox" name="compendium:${esc(row.uuid)}" data-service-compendium-item="${esc(row.uuid)}" ${picker.selected?.has(row.uuid) ? "checked" : ""}><img src="${esc(row.img)}" alt=""><span><b>${esc(row.name)}</b><small>ур.${esc(row.level)} · ${esc(row.type)} · ${esc(credits(row.priceCredits))} · ${esc(row.quantityPerPurchase)} ед. / уп.</small></span></label>`).join("") || "<p>Выбери компендий или измени запрос.</p>"}`;
}
function compendiumPickerHtml(s, shop) {
  const picker = s.compendium || {},
    count = picker.selected?.size || 0;
  return `<details data-sync="shop-compendiums" class="city-shop-editor city-shop-compendiums" ${picker.packId ? "open" : ""}><summary>Предметы из компендиев</summary><p>Выбери физические предметы: выставить постоянно или включить в случайный ассортимент этого магазина вместе с профилем Library. Для случайных товаров действуют уровень, число позиций и наценка; они выпадают не при каждом обновлении.</p><label>Item-компендий<select name="compendiumPack" data-service-compendium-pack><option value="">Выбери компендий</option>${listCityShopCompendiums()
    .map(
      (pack) =>
        `<option value="${esc(pack.id)}" ${pack.id === picker.packId ? "selected" : ""}>${esc(pack.name)} · ${esc(pack.id)}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Поиск предмета<input type="search" name="compendiumQuery" data-service-compendium-query value="${esc(picker.query || "")}" placeholder="Название или тип"></label><div class="city-service-actions">${button("compendium-select-shown", "Выбрать показанные")}${button("compendium-clear", "Снять выбор")}<span data-compendium-count>Выбрано: ${count} / 200</span></div><div class="city-shop-compendium-results" data-compendium-results>${compendiumResultsHtml(picker)}</div><div class="city-service-actions">${button("compendium-add-random", picker.adding ? "Сохранение…" : "В случайный ассортимент", !count || picker.loading || picker.adding ? "disabled" : "")}${button("compendium-add-fixed", "Выставить постоянно", !count || picker.loading || picker.adding ? "disabled" : "")}</div><details data-sync="shop-random-pool" class="city-shop-random-pool"><summary>Добавлено в случайный пул: ${(shop.randomOffers || []).length}</summary>${(shop.randomOffers || []).map((offer) => `<div class="city-shop-pool-item"><span>${esc(offer.name)} · ур.${esc(offer.level)}</span>${button("compendium-remove", "Исключить из пула", `data-uuid="${esc(offer.uuid)}"`)}</div>`).join("") || "<p>Дополнительных кандидатов пока нет.</p>"}</details></details>`;
}

function cityShopsHtml({ s, f, shops, gm, markers, now }) {
  const shop = shops.find((entry) => entry.id === s.shopId);
  let html = `<section class="city-shop-workspace"><label>Место торговли${select("shopId", [["", gm ? "Новая торговая карточка" : "Выбери магазин"], ...shops.map((entry) => [entry.id, entry.name])], s.shopId)}</label>`;
  if (shop) {
    const access = cityMarketAccess(shop, {
      hour: now.hour,
      minute: now.minute,
    });
    const selectedActorId = buyerId(s, f),
      actors = ownedBuyers(),
      actor = actors.find((entry) => entry.id === selectedActorId);
    const balance = actor?.inventory?.currency?.credits;
    const receipts = listCityShopPurchaseReceipts({
      shopId: shop.id,
      actorId: selectedActorId,
    });
    html += `<article class="city-service-card city-shop-card">${shop.img ? `<img class="city-shop-cover" src="${esc(shop.img)}" alt="${esc(shop.name)}">` : ""}<header><div><h3>${esc(shop.name)}</h3><p>${shop.market ? "Ночной рынок" : "Магазин"} · ${esc(CITY_SHOP_PROFILES[shop.type]?.name || "Ассортимент")}</p></div></header>${shop.requiredReputation ? `<p>Репутация: ${esc(shop.requiredReputation)} · подтверждает ведущий</p>` : ""}<div class="city-service-actions">${button("shop-map", "На карте")}${!access.allowed ? button("market-ask", "Запросить приглашение") : ""}${gm ? button("shop-refresh", "Обновить каталог") + button("shop-reroll", "Новый ассортимент") + button("shop-delete", "Удалить магазин") : ""}</div>`;
    if (access.allowed) {
      html += `<div class="city-shop-buyer"><label>Покупатель${select(
        "buyerActorId",
        actors.map((entry) => [entry.id, entry.name]),
        selectedActorId,
      )}</label><p class="city-shop-balance">Баланс: <strong>${Number.isFinite(balance) ? esc(credits(balance)) : "недоступен"}</strong></p>${!actors.length ? `<p class="city-service-warning">Нет доступного персонажа с правом владельца.</p>` : ""}</div><p class="city-shop-catalog-note">Library и выбранные предметы компендиев · цена за упаковку. Количество — число упаковок.</p>${s.catalogMessage ? `<p class="city-service-warning">${esc(s.catalogMessage)}</p>` : ""}<div class="city-shop-stock">`;
      html +=
        cityShopStock(shop, s.items || [])
          .map((offer) => {
            const quantity = Number(f[`quantity:${offer.id}`] ?? 1),
              knownPrice =
                Number.isFinite(offer.priceCredits) && offer.priceCredits >= 0;
            const total =
              knownPrice &&
              Number.isInteger(quantity) &&
              quantity >= 1 &&
              quantity <= 99
                ? offer.priceCredits * quantity
                : null;
            const operation = purchaseOperation(
              s,
              {
                shopId: shop.id,
                offerId: offer.id,
                actorId: selectedActorId,
                quantity,
                shopVersion: shop.version,
                expectedPriceCredits: offer.priceCredits,
              },
              receipts,
            );
            const locked = ["confirming", "pending", "uncertain"].includes(
              operation?.status,
            );
            return `<article class="city-shop-offer" data-shop-offer="${esc(offer.id)}"><img class="city-shop-item-image" src="${esc(offer.img || "icons/svg/item-bag.svg")}" alt=""><div class="city-shop-offer-main">${button("item-open", esc(offer.name), `data-item-id="${esc(offer.id)}" class="city-shop-item-link"`)}<small>ур.${esc(offer.level)} · ${esc(offer.quantityPerPurchase || 1)} ед. / уп.</small><strong class="city-shop-price">${knownPrice ? esc(credits(offer.priceCredits)) : "Цена не задана · ведущий задаст цену"}</strong>${gm ? `<div class="city-service-actions">${button("offer-edit", "Изменить", `data-item-id="${esc(offer.id)}"`)}${button("offer-delete", "Убрать", `data-item-id="${esc(offer.id)}"`)}${button("item-give", "Бесплатно выдать", `data-item-id="${esc(offer.id)}"`)}</div>` : ""}</div><div class="city-shop-checkout"><label>Упаковок<input type="number" min="1" max="99" step="1" name="${esc(`quantity:${offer.id}`)}" data-service-field="${esc(`quantity:${offer.id}`)}" value="${esc(quantity)}"></label><small data-shop-total>${total === null ? "—" : `Итого: ${esc(credits(total))}`}</small>${button("item-buy", locked ? purchaseLabels[operation.status] : operation?.status === "retry" ? "Повторить запрос" : "Купить", `data-item-id="${esc(offer.id)}" ${!knownPrice || !selectedActorId || total === null || locked ? "disabled" : ""}`)}</div></article>`;
          })
          .join("") ||
        `<p>Подходящих товаров пока нет. Ведущий может изменить профиль или добавить свой товар.</p>`;
      html += `</div>${(shop.services || []).map((row) => `<p>${esc(row.name)} · ${esc(row.price || "По договорённости")}</p>`).join("")}`;
      html += shopReceiptHistory(receipts, gm);
    } else
      html +=
        `<p class="city-service-warning">${esc(access.reason)}</p>` +
        shopReceiptHistory(receipts, gm);
    html += `</article>`;
    if (gm && shop.market)
      html += `<label>Приглашение игроку${select(
        "marketUser",
        cityValues(game.users)
          .filter((user) => !user.isGM)
          .map((user) => [user.id, user.name]),
        f.marketUser,
      )}</label><div class="city-service-actions">${button("market-grant", "Выдать пропуск")}${button("market-revoke", "Отозвать пропуск")}</div>`;
  }
  if (!shop) {
    const past = listCityShopPurchaseReceipts();
    if (past.length) html += shopReceiptHistory(past, gm);
  }
  if (gm) {
    html += `<details data-sync="shop-editor" class="city-shop-editor" open><summary>Торговая карточка</summary><label>Привязка к существующей точке${select("shopMarkerId", [["", "Без точки"], ...markers.map((marker) => [marker.id, marker.title])], f.shopMarkerId ?? shop?.markerId ?? s.markerId)}</label>${input("shopName", "Название", f.shopName ?? shop?.name ?? "Магазин")}${imageEditor("shopImg", "Изображение магазина", f.shopImg ?? shop?.img ?? "")}<label>Ассортимент${select(
      "shopType",
      Object.entries(CITY_SHOP_PROFILES).map(([id, profile]) => [
        id,
        profile.name,
      ]),
      f.shopType ?? shop?.type ?? "general",
    )}</label>${input("shopLevel", "Максимальный уровень предметов", f.shopLevel ?? shop?.level ?? 4, "number")}${input("shopSize", "Позиций случайного ассортимента", f.shopSize ?? shop?.size ?? 16, "number")}${input("markup", "Наценка случайного ассортимента", f.markup ?? shop?.markup ?? 1, "number")}<label>Формат${select(
      "market",
      [
        ["false", "Обычный магазин"],
        ["true", "Ночной рынок"],
      ],
      f.market ?? String(shop?.market || false),
    )}</label>${input("opens", "Открытие: час", f.opens ?? shop?.opens ?? 21, "number")}${input("closes", "Закрытие: час", f.closes ?? shop?.closes ?? 6, "number")}${input("requiredReputation", "Условие репутации", f.requiredReputation ?? shop?.requiredReputation ?? "")}${input("shopFixer", "Фиксер рынка", f.shopFixer ?? shop?.fixer ?? "Фиксер")}${textarea("decorative", "Услуги и прочие товары: название | цена, по строке", f.decorative ?? (shop?.services || []).map((row) => `${row.name} | ${row.price || ""}`).join("\n"))}<label>Видимость${select(
      "hidden",
      [
        ["false", "Показан игрокам"],
        ["true", "Скрыт"],
      ],
      f.hidden ?? String(shop?.hidden || false),
    )}</label>${button("shop-save", shop ? "Обновить карточку" : "Создать магазин")}</details>`;
    if (shop) html += compendiumPickerHtml(s, shop);
    html += `<details data-sync="shop-offer-editor" class="city-shop-editor city-shop-offer-editor" open><summary>${s.offerId ? "Изменить товар" : "Свой товар"}</summary>${shop ? button("offer-new", "Новый товар") : "<p>Сначала сохрани магазин.</p>"}<p>Создай предмет снаряжения или перетащи настоящий Item из Foundry. Копия Item сохраняет его игровые параметры.</p><div class="city-shop-drop" data-service-item-drop>${input("offerSourceUuid", "UUID исходного Item (необязательно)", f.offerSourceUuid ?? "")}${button("offer-source", "Загрузить Item по UUID")}</div>${input("offerName", "Название товара", f.offerName ?? "")}${imageEditor("offerImg", "Изображение товара", f.offerImg ?? "")}${textarea("offerDescription", "Описание", f.offerDescription ?? "")}${input("offerPriceCredits", "Цена за упаковку, Credits (0 — бесплатно)", f.offerPriceCredits ?? "", "number")}${button("offer-save", s.offerId ? "Сохранить изменения товара" : "Добавить товар", shop ? "" : "disabled")}</details>`;
  }
  return `${html}</section>`;
}
export function downloadCityJSON(data, name) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function cityServicesHtml(s) {
  const gm = !!game.user.isGM,
    f = s.form || {},
    map = getWorldCityMap(),
    markers = map.markers,
    now = getCityCampaignTime(),
    jobs = (s.jobs || listCityJobs()).filter(
      (j) => !s.markerId || j.markerId === s.markerId,
    ),
    shops = (s.shops || listCityShops()).filter(
      (shop) => !s.markerId || shop.markerId === s.markerId,
    );
  let html = `<header><small>NCNET // CITY SERVICES</small><h2>Городские возможности</h2></header><nav class="city-service-tabs">${[["jobs", "Заказы"], ["shops", "Торговля"], ["calendar", "Календарь"], ["npcs", "Персонажи"], ...(gm ? [["transfer", "Перенос точек"]] : [])].map(([tab, label]) => button("tab", label, `data-tab="${tab}"`)).join("")}${button("agent", "Агент")}</nav>`;
  if (s.markerId)
    html += `<p class="city-service-location">Место: <b>${esc(markers.find((m) => m.id === s.markerId)?.title || "Точка удалена")}</b> ${button("all-locations", "Все места")}</p>`;
  if (s.tab === "jobs") {
    html +=
      jobs
        .map(
          (j) =>
            `<article class="city-service-card" data-city-job="${esc(j.id)}"><header><strong>${esc(j.title)}</strong><span>${esc(j.status)}</span></header>${j.commLinkGroupName ? `<p class="city-job-crew">Команда: ${esc(j.commLinkGroupName)}</p>` : ""}<p>${esc(j.description)}</p><small>${esc(j.fixer)} · ${esc(j.reward)}</small><div class="city-service-actions">${j.commLinkGroupId ? button("job-network", "В Сети", `data-id="${esc(j.id)}"`) : ""}${j.markerId ? button("job-map", "На карте", `data-id="${esc(j.id)}"`) : ""}${gm ? button("job-link-map", j.markerId ? "Изменить точку" : "Связать с точкой", `data-id="${esc(j.id)}"`) : ""}${j.status === "offer" ? button("job-take", "Принять", `data-id="${esc(j.id)}"`) : ""}${gm ? ["offer", "active", "done", "failed", ...(j.commLinkGroupId && !j.cityJobId ? ["cancelled"] : ["hidden"])].map((st) => button("job-status", { offer: "Предложить", active: "В работе", done: "Выполнен", failed: "Провален", hidden: "Скрыть", cancelled: "Отменить" }[st], `data-id="${esc(j.id)}" data-status="${st}"`)).join("") + button("job-delete", "Удалить", `data-id="${esc(j.id)}"`) : ""}</div>${gm && j.gmText ? `<details data-sync="job-note:${esc(j.id)}"><summary>Для ведущего</summary><p>${esc(j.gmText)}</p></details>` : ""}</article>`,
        )
        .join("") || "<p>Доступных заказов пока нет.</p>";
    if (gm)
      html += `<details data-sync="job-editor" open><summary>Создать заказ / слух</summary>${button("job-generate", "Сгенерировать заготовку")}${input("title", "Название", f.title)}${textarea("description", "Предложение игрокам", f.description)}${input("fixer", "Фиксер", f.fixer || "Фиксер")}${input("reward", "Вознаграждение", f.reward || "По договорённости")}<label>Цель / точка слуха${select("markerId", [["", "Без точки"], ...markers.map((m) => [m.id, m.title])], f.markerId ?? s.markerId)}</label><label>Кому${select(
        "audience",
        [
          ["", "Всем игрокам"],
          ...cityValues(game.users)
            .filter((u) => !u.isGM)
            .map((u) => [u.id, u.name]),
        ],
        f.audience,
      )}</label>${textarea("gmText", "Осложнение и заметки ведущего", f.gmText)}<label>Состояние${select(
        "jobStatus",
        [
          ["offer", "Предложение со знаком ?"],
          ["hidden", "Скрытый черновик"],
        ],
        f.jobStatus || "offer",
      )}</label>${button("job-create", "Сохранить заказ")}</details>`;
  } else if (s.tab === "shops") {
    html += cityShopsHtml({ s, f, shops, gm, markers, now });
  } else if (s.tab === "calendar") {
    const status = cityCalendarStatus();
    html += `<h3>${esc(new Date(now.iso).toLocaleString("ru-RU", { timeZone: "UTC" }))}</h3><p>Источник: ${now.source === "simple-calendar" ? "Simple Calendar" : "часы Remaster"}</p><p>${esc(status.available ? `Календарь: ${status.iso}` : status.reason)}</p>${now.warning ? `<p class="city-service-warning">${esc(now.warning)}</p>` : ""}`;
    if (gm)
      html += `<label>Источник времени${select(
        "calendarMode",
        [
          ["internal", "Часы Remaster"],
          ["simple-calendar", "Simple Calendar"],
        ],
        f.calendarMode || now.source,
      )}</label>${button("calendar-mode", "Применить источник времени")}<details><summary>Календарь «Найт-Сити2045»</summary><p>Настроить григорианский календарь и четыре праздника. Перед настройкой будет скачан снимок текущих параметров.</p>${button("calendar-setup", "Настроить календарь")}</details>`;
  } else if (s.tab === "npcs")
    html += `<p>24 личности из Night City Map, адаптированные через Кузницу для SF2E.</p>${CITY_NPC_ROSTER.map((n) => `<article class="city-service-card"><header><strong>${esc(n.name)}</strong><span>ур.${n.level}</span></header><div class="city-service-actions">${button("npc-open", "Досье NPC", `data-id="${esc(n.id)}"`)}${gm ? button("npc-import", "Добавить в мир", `data-id="${esc(n.id)}"`) + button("npc-contact", "Добавить контакт", `data-id="${esc(n.id)}"`) : ""}</div></article>`).join("")}`;
  else if (s.tab === "transfer" && gm) {
    html += `<p>На карте ${markers.length} точек. Выбери JSON переноса: координаты и ID сохраняются.</p><input type="file" accept="application/json,.json" data-service-points-file>${s.transfer ? `<p data-transfer-summary>${s.transfer.added.length} новых · ${s.transfer.unchanged.length} совпадают · ${s.transfer.conflicts.length} конфликтов</p>${s.transfer.conflicts.map((c) => `<label><input type="checkbox" data-transfer-replace="${esc(c.id)}"> Обновить «${esc(c.current.title)}» из файла (по умолчанию сохраняется текущая запись)</label>`).join("")}${button("transfer-apply", "Применить перенос и скачать резервную копию")}` : ""}<details><summary>Назначить фото каталога существующей точке</summary><label>Точка${select(
      "photoMarkerId",
      markers.map((m) => [m.id, m.title]),
      f.photoMarkerId,
    )}</label><label>Место каталога${select(
      "catalogId",
      NIGHT_CITY_LOCATIONS.map((m) => [m.id, m.name]),
      f.catalogId,
    )}</label>${button("photo-associate", "Связать фото с точкой")}</details>`;
  }
  return html;
}
let instance = null,
  pending = null,
  AppClass;
function appClass() {
  if (AppClass) return AppClass;
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  AppClass = class extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "cyberpunk-city-services",
      classes: ["city-services-application"],
      position: { width: 840, height: 820 },
      window: { title: "Найт-Сити · городские возможности", resizable: true },
    };
    static PARTS = {
      main: {
        template: `modules/${MID}/templates/city-services.hbs`,
        scrollable: ["", ".city-shop-compendium-results"],
      },
    };
    constructor(options = {}) {
      super(options);
      this.tab = options.tab || "jobs";
      this.actorId = options.actorId || game.user.character?.id || "";
      this.draftFields = {};
      this.locationForms = new Map();
      this.shopForms = new Map();
      this.purchaseOperations = new Map();
      this.shopId = options.shopId || "";
      this.shopSelectionExplicit = options.shopId !== undefined;
      this.markerId = options.markerId || "";
      this.jobId = options.jobId || "";
      this.pendingJobFocus = this.jobId;
      this.hooks = [];
      this.refreshQueue = createCityRefreshQueue(
        async () => {
          if (!this.rendered || this.busy) return;
          const context = await this._prepareContext({
            cityBackgroundRefresh: true,
          });
          if (
            this.rendered &&
            !this.busy &&
            context.cityServicesRefreshKey !== this.lastRefreshKey
          )
            await this.render(true);
        },
        { onError: this.error },
      );
    }
    async _prepareContext(options = {}) {
      const shops = listCityShops();
      if (!this.shopId && this.markerId && !this.shopSelectionExplicit)
        this.shopId = shops.find((s) => s.markerId === this.markerId)?.id || "";
      const identity = this.shopIdentity();
      let items = [];
      const shop = shops.find((s) => s.id === this.shopId),
        time = getCityCampaignTime();
      if (
        this.tab === "shops" &&
        shop &&
        cityMarketAccess(shop, { hour: time.hour, minute: time.minute }).allowed
      )
        try {
          items = await loadCityShopItems();
          if (identity === this.shopIdentity()) this.catalogMessage = "";
        } catch (e) {
          if (identity === this.shopIdentity()) this.catalogMessage = e.message;
        }
      if (identity !== this.shopIdentity())
        return this._prepareContext(options);
      this.catalogItems = items;
      if (game.user.isGM && this.tab === "shops" && shop)
        this.ensureCompendiumPicker();
      if (this.tab === "shops" && shop) {
        const receipts = listCityShopPurchaseReceipts({ shopId: shop.id });
        for (const operation of this.purchaseOperations.values()) {
          const receipt = receipts.find(
            (entry) => entry.operationId === operation.operationId,
          );
          if (receipt) Object.assign(operation, receipt);
        }
      }
      const sameBackgroundView =
        options.cityBackgroundRefresh &&
        this.renderedViewKey === this.viewKey();
      const refreshFields = sameBackgroundView
        ? this.lastRefreshFields || {}
        : { ...this.draftFields };
      const refreshPicker = sameBackgroundView
        ? this.lastRefreshPicker
        : this.compendium
          ? { ...this.compendium, selected: new Set(this.compendium.selected) }
          : undefined;
      return {
        cityServicesRefreshFields: refreshFields,
        cityServicesRefreshPicker: refreshPicker,
        cityServicesRefreshKey: JSON.stringify([
          this.viewKey(),
          this.actorId,
          game.user.id,
          game.user.isGM,
          this.clockRenderKey(shops, time),
          cityServicesHtml({
            ...this,
            form: refreshFields,
            compendium: refreshPicker,
            shops,
            items,
          }),
          this.message || "",
        ]),
        cityServicesClockKey: this.clockRenderKey(shops, time),
        bodyHtml:
          cityServicesHtml({ ...this, form: this.draftFields, shops, items }) +
          (this.message
            ? `<p class="city-service-summary">${esc(this.message)}</p>`
            : ""),
      };
    }
    viewKey() {
      return JSON.stringify([this.tab, this.markerId, this.shopId]);
    }
    clockRenderKey(shops = listCityShops(), time = getCityCampaignTime()) {
      if (this.tab === "calendar")
        return JSON.stringify([time.source, time.iso, time.warning]);
      const shop = shops.find((entry) => entry.id === this.shopId);
      if (this.tab !== "shops" || !shop?.market) return "";
      const access = cityMarketAccess(shop, {
        hour: time.hour,
        minute: time.minute,
      });
      return JSON.stringify([access.allowed, access.reason]);
    }
    _preSyncPartState(partId, next, prior, state) {
      super._preSyncPartState(partId, next, prior, state);
      state.cityServicesSameView = this.renderedViewKey === this.viewKey();
      if (!state.cityServicesSameView) {
        delete state.focus;
        state.scrollPositions = [];
        state.details = {};
        return;
      }
      const focused = prior.querySelector(":focus"),
        outer = this.element.querySelector(".window-content");
      if (typeof focused?.selectionStart === "number")
        state.cityServicesSelection = [
          focused.selectionStart,
          focused.selectionEnd,
          focused.selectionDirection,
        ];
      if (outer) state.cityServicesOuter = [outer.scrollTop, outer.scrollLeft];
      for (const field of next.querySelectorAll("[data-service-field]")) {
        if (Object.hasOwn(this.draftFields, field.dataset.serviceField))
          field.value = this.draftFields[field.dataset.serviceField];
      }
    }
    _syncPartState(partId, next, prior, state) {
      super._syncPartState(partId, next, prior, state);
      const outer = this.element.querySelector(".window-content");
      if (!state.cityServicesSameView) {
        next.scrollTop = 0;
        if (outer) outer.scrollTop = 0;
        return;
      }
      const focused = next.ownerDocument.activeElement;
      if (
        state.cityServicesSelection &&
        next.contains(focused) &&
        typeof focused.setSelectionRange === "function"
      )
        focused.setSelectionRange(...state.cityServicesSelection);
      if (outer && state.cityServicesOuter)
        [outer.scrollTop, outer.scrollLeft] = state.cityServicesOuter;
    }
    revealOfferEditor() {
      this.pendingOfferFocus = this.viewKey();
      return this.render(true);
    }
    async _onRender(c, o) {
      await super._onRender?.(c, o);
      this.lastRefreshKey = c.cityServicesRefreshKey;
      this.lastRefreshFields = c.cityServicesRefreshFields;
      this.lastRefreshPicker = c.cityServicesRefreshPicker;
      this.renderedViewKey = this.viewKey();
      this.lastClockKey = c.cityServicesClockKey ?? this.clockRenderKey();
      if (this.pendingJobFocus && this.tab === "jobs") {
        this.element
          .querySelector(`[data-city-job="${this.pendingJobFocus}"]`)
          ?.scrollIntoView({ block: "nearest" });
        this.pendingJobFocus = "";
      }
      if (this.pendingOfferFocus === this.viewKey()) {
        this.pendingOfferFocus = "";
        const editor = this.element.querySelector(".city-shop-offer-editor"),
          field = editor?.querySelector('[data-service-field="offerName"]');
        if (editor) {
          editor.open = true;
          editor.scrollIntoView({ block: "start" });
        }
        field?.focus({ preventScroll: true });
      }
      this.events?.abort();
      this.events = new AbortController();
      const signal = this.events.signal;
      this.element.addEventListener(
        "input",
        (e) => {
          if (e.target.matches?.("[data-service-compendium-query]")) {
            this.ensureCompendiumPicker().query = e.target.value;
            this.updateCompendiumResults();
          }
          if (e.target.dataset.serviceField)
            this.draftFields[e.target.dataset.serviceField] = e.target.value;
          if (e.target.dataset.serviceField?.startsWith("quantity:"))
            this.updateCheckout(e.target);
        },
        { signal },
      );
      this.element.addEventListener(
        "change",
        (e) => {
          if (e.target.matches?.("[data-service-compendium-pack]"))
            void this.loadCompendium(e.target.value).catch(this.error);
          if (e.target.dataset.serviceCompendiumItem) {
            const picker = this.ensureCompendiumPicker(),
              uuid = e.target.dataset.serviceCompendiumItem;
            if (e.target.checked && picker.selected.size < 200)
              picker.selected.add(uuid);
            else {
              picker.selected.delete(uuid);
              e.target.checked = false;
            }
            this.updateCompendiumCount();
          }
          if (e.target.dataset.serviceField) {
            if (e.target.dataset.serviceField === "shopId") {
              this.switchShop(e.target.value);
              void this.render(true);
            } else {
              this.draftFields[e.target.dataset.serviceField] = e.target.value;
              if (
                ["buyerActorId", "shopImg", "offerImg"].includes(
                  e.target.dataset.serviceField,
                )
              )
                void this.render(true);
            }
          }
          if (e.target.dataset.serviceImageFile && e.target.files?.[0])
            void this.uploadImage(
              e.target.dataset.serviceImageFile,
              e.target.files[0],
            ).catch(this.error);
          if (e.target.matches("[data-service-points-file]"))
            void (async () => {
              this.payload = JSON.parse(await e.target.files[0].text());
              this.transfer = previewCityPointsTransfer(
                getWorldCityMap(),
                this.payload,
              );
              await this.render(true);
            })().catch(this.error);
        },
        { signal },
      );
      this.element.addEventListener(
        "paste",
        (e) => {
          const target = e.target.closest?.("[data-service-image-target]");
          const file = [...(e.clipboardData?.items || [])]
            .find((item) => item.type.startsWith("image/"))
            ?.getAsFile();
          if (target && file && game.user.isGM) {
            e.preventDefault();
            void this.uploadImage(
              target.dataset.serviceImageTarget,
              file,
            ).catch(this.error);
          }
        },
        { signal },
      );
      this.element.addEventListener(
        "dragover",
        (e) => {
          if (game.user.isGM && e.target.closest?.("[data-service-item-drop]"))
            e.preventDefault();
        },
        { signal },
      );
      this.element.addEventListener(
        "drop",
        (e) => {
          if (
            !game.user.isGM ||
            !e.target.closest?.("[data-service-item-drop]")
          )
            return;
          e.preventDefault();
          void (async () => {
            const textEditor =
              globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
            const data = textEditor?.getDragEventData
              ? textEditor.getDragEventData(e)
              : JSON.parse(e.dataTransfer?.getData("text/plain") || "{}");
            if (data.type !== "Item" || !data.uuid)
              throw new Error("Перетащи Item с UUID из Foundry.");
            await this.loadOfferSource(data.uuid);
          })().catch(this.error);
        },
        { signal },
      );
      this.element.addEventListener(
        "click",
        (e) => {
          const b = e.target.closest("[data-service-action]");
          if (b) void this.action(b).catch(this.error);
        },
        { signal },
      );
      if (!this.hooks.length)
        for (const name of [
          CITY_SERVICES_HOOK,
          "updateUser",
          "updateWorldTime",
          "updateActor",
        ])
          this.hooks.push([
            name,
            Hooks.on(name, () => {
              if (
                name === "updateWorldTime" &&
                this.clockRenderKey() === this.lastClockKey
              )
                return;
              this.refreshQueue.request();
            }),
          ]);
    }
    error = (e) => {
      ui.notifications?.error?.(e.message || e);
    };
    fields() {
      return {
        ...this.draftFields,
        ...Object.fromEntries(
          [...this.element.querySelectorAll("[data-service-field]")].map(
            (e) => [e.dataset.serviceField, e.value],
          ),
        ),
      };
    }
    shopIdentity() {
      return JSON.stringify([this.markerId, this.shopId]);
    }
    cacheShopDraft() {
      this.shopForms.set(this.shopIdentity(), {
        fields: { ...this.draftFields },
        offerId: this.offerId,
      });
    }
    switchShop(id) {
      this.cacheShopDraft();
      this.shopId = id;
      this.shopSelectionExplicit = true;
      const draft = this.shopForms.get(this.shopIdentity());
      this.draftFields = { ...draft?.fields };
      delete this.draftFields.shopId;
      this.offerId = draft?.offerId || "";
      this.message = "";
    }
    ensureCompendiumPicker() {
      const identity = this.shopIdentity();
      if (this.compendium?.identity !== identity)
        this.compendium = {
          identity,
          rows: [],
          packId: "",
          query: "",
          selected: new Set(),
        };
      return this.compendium;
    }
    async loadCompendium(packId) {
      requireCityGM();
      this.draftFields = this.fields();
      const picker = this.ensureCompendiumPicker(),
        token = Symbol();
      Object.assign(picker, {
        token,
        packId,
        rows: [],
        query: "",
        selected: new Set(),
        loading: !!packId,
        message: "",
      });
      await this.render(true);
      if (!packId) return;
      const current = () =>
        this.compendium === picker &&
        picker.token === token &&
        picker.identity === this.shopIdentity();
      try {
        const rows = await loadCityShopCompendium(packId);
        if (current()) picker.rows = rows;
      } catch (error) {
        if (current()) picker.message = error.message;
      } finally {
        if (current()) {
          picker.loading = false;
          await this.render(true);
        }
      }
    }
    updateCompendiumCount() {
      const picker = this.ensureCompendiumPicker(),
        counter = this.element.querySelector("[data-compendium-count]");
      if (counter)
        counter.textContent = `Выбрано: ${picker.selected.size} / 200`;
      for (const control of this.element.querySelectorAll(
        '[data-service-action="compendium-add-random"], [data-service-action="compendium-add-fixed"]',
      ))
        control.disabled =
          !picker.selected.size || picker.loading || picker.adding;
    }
    updateCompendiumResults() {
      const host = this.element.querySelector("[data-compendium-results]");
      if (host)
        host.innerHTML = compendiumResultsHtml(this.ensureCompendiumPicker());
      this.updateCompendiumCount();
    }
    updateCheckout(field) {
      const row = field.closest?.("[data-shop-offer]");
      if (!row) return;
      const shop = listCityShops().find((entry) => entry.id === this.shopId);
      const offer =
        shop &&
        cityShopStock(shop, this.catalogItems || []).find(
          (entry) => entry.id === row.dataset.shopOffer,
        );
      if (!offer) return;
      const quantity = Number(field.value),
        valid =
          Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= 99 &&
          Number.isFinite(offer.priceCredits);
      const actorId = buyerId(this, this.draftFields),
        operation = purchaseOperation(
          this,
          {
            shopId: shop.id,
            offerId: offer.id,
            actorId,
            quantity,
            shopVersion: shop.version,
            expectedPriceCredits: offer.priceCredits,
          },
          listCityShopPurchaseReceipts({ shopId: shop.id, actorId }),
        );
      row.querySelector("[data-shop-total]").textContent = valid
        ? `Итого: ${credits(offer.priceCredits * quantity)}`
        : "От 1 до 99 целых упаковок";
      const control = row.querySelector('[data-service-action="item-buy"]'),
        locked = ["confirming", "pending", "uncertain"].includes(
          operation?.status,
        );
      control.disabled = !valid || !actorId || locked;
      control.textContent = locked
        ? purchaseLabels[operation.status]
        : operation?.status === "retry"
          ? "Повторить запрос"
          : "Купить";
    }
    filePicker() {
      const picker =
        globalThis.foundry?.applications?.apps?.FilePicker ||
        globalThis.FilePicker;
      const implementation = picker?.implementation || picker;
      if (!implementation) throw new Error("FilePicker Foundry недоступен.");
      return implementation;
    }
    async uploadImage(field, file) {
      requireCityGM();
      if (
        !["shopImg", "offerImg"].includes(field) ||
        !/^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/i.test(file.type || "")
      )
        throw new Error(
          "Выбери файл изображения PNG, JPEG, WebP, GIF, AVIF или SVG.",
        );
      const identity = this.shopIdentity(),
        draft = this.draftFields,
        Picker = this.filePicker();
      const worldId = String(game.world?.id || "");
      if (!/^[a-z0-9_-]+$/i.test(worldId))
        throw new Error("Мир Foundry недоступен для загрузки.");
      const path = `worlds/${worldId}/city-shops`;
      try {
        await Picker.browse("data", path);
      } catch {
        try {
          await Picker.createDirectory("data", path, { notify: false });
        } catch {
          await Picker.browse("data", path);
        }
      }
      const response = await Picker.upload(
        "data",
        path,
        file,
        {},
        { notify: false },
      );
      if (!response?.path || response.error)
        throw new Error(response?.error || "Foundry не загрузил изображение.");
      if (identity !== this.shopIdentity() || draft !== this.draftFields)
        return;
      this.draftFields[field] = response.path;
      this.message =
        "Изображение загружено. Сохрани изменения товара или магазина.";
      await this.render(true);
    }
    async loadOfferSource(uuid) {
      requireCityGM();
      const identity = this.shopIdentity(),
        draft = this.draftFields;
      const document = await globalThis.fromUuid?.(String(uuid || "").trim());
      if (!document || document.documentName !== "Item")
        throw new Error("Item с таким UUID не найден.");
      if (identity !== this.shopIdentity() || draft !== this.draftFields)
        return;
      const source = document.toObject();
      this.offerId = "";
      this.draftFields = {
        ...this.fields(),
        offerSourceUuid: document.uuid || uuid,
        offerName: source.name,
        offerImg: source.img || "",
        offerDescription: source.system?.description?.value || "",
      };
      this.message =
        "Item выбран. Укажи цену в Credits и сохрани товар; игровые параметры сохранятся.";
      return this.revealOfferEditor();
    }
    async buyOffer(offerId, fields, control) {
      const identity = this.shopIdentity(),
        shop = listCityShops().find((entry) => entry.id === this.shopId);
      const offer =
        shop &&
        cityShopStock(shop, this.catalogItems || []).find(
          (entry) => entry.id === offerId,
        );
      const actorId = buyerId(this, fields),
        actor = ownedBuyers().find((entry) => entry.id === actorId),
        quantity = Number(fields[`quantity:${offerId}`] ?? 1);
      if (!shop || !offer)
        throw new Error("Товар или магазин изменился. Обнови каталог.");
      if (!actor) throw new Error("Выбери принадлежащего тебе персонажа.");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
        throw new Error("Количество: от 1 до 99 целых упаковок.");
      if (!Number.isFinite(offer.priceCredits) || offer.priceCredits < 0)
        throw new Error("Ведущий должен задать цену товара в Credits.");
      const request = {
        shopId: shop.id,
        offerId,
        actorId,
        quantity,
        shopVersion: shop.version,
        expectedPriceCredits: offer.priceCredits,
      };
      const key = purchaseKey(request),
        previous = purchaseOperation(
          this,
          request,
          listCityShopPurchaseReceipts({ shopId: shop.id, actorId }),
        );
      if (["confirming", "pending", "uncertain"].includes(previous?.status))
        return;
      const operation = {
        ...request,
        operationId:
          previous?.status === "retry"
            ? previous.operationId
            : createRuntimeId(),
        status: "confirming",
      };
      this.purchaseOperations.set(key, operation);
      control.disabled = true;
      this.busy = true;
      try {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Подтвердить покупку" },
          content: `<p><strong>${esc(offer.name)}</strong> · ${esc(shop.name)}</p><p>Покупатель: ${esc(actor.name)}</p><p>${quantity} уп. × ${esc(credits(offer.priceCredits))} · ${quantity * (offer.quantityPerPurchase || 1)} ед.</p><p><strong>Итого: ${esc(credits(offer.priceCredits * quantity))}</strong></p><p>Credits спишутся с персонажа после проверки ведущим, товар поступит в инвентарь.</p>`,
          yes: { label: "Купить" },
          no: { label: "Отмена" },
        });
        if (!confirmed || identity !== this.shopIdentity()) {
          if (previous?.status === "retry")
            this.purchaseOperations.set(key, previous);
          else this.purchaseOperations.delete(key);
          return;
        }
        try {
          const result = await requestCityShopPurchase({
            ...request,
            operationId: operation.operationId,
          });
          Object.assign(operation, result);
          if (identity === this.shopIdentity())
            this.message =
              result.message ||
              purchaseLabels[result.status] ||
              "Запрос покупки отправлен.";
        } catch (error) {
          operation.status = "retry";
          operation.message = error.message;
          if (identity === this.shopIdentity())
            this.message = `${error.message} Повтор отправит тот же запрос покупки.`;
        }
      } finally {
        if (operation.status === "confirming")
          this.purchaseOperations.delete(key);
        this.busy = false;
        control.disabled = false;
        if (identity === this.shopIdentity()) await this.render(true);
      }
    }
    async action(b) {
      const action = b.dataset.serviceAction;
      if (action === "all-locations") {
        if (this.tab === "shops") this.cacheShopDraft();
        else
          this.locationForms.set(
            this.markerId,
            structuredClone(this.draftFields),
          );
        this.markerId = "";
        this.shopId = "";
        this.shopSelectionExplicit = true;
        const draft = this.shopForms.get(this.shopIdentity());
        this.draftFields =
          this.tab === "shops"
            ? { ...draft?.fields }
            : { ...this.locationForms.get("") };
        this.offerId = draft?.offerId || "";
        return this.render(true);
      }
      const f = this.fields();
      this.draftFields = f;
      if (action === "tab") {
        if (this.tab === "shops") this.cacheShopDraft();
        else this.locationForms.set(this.markerId, { ...this.draftFields });
        this.tab = b.dataset.tab;
        this.message = "";
        this.draftFields =
          this.tab === "shops"
            ? { ...this.shopForms.get(this.shopIdentity())?.fields }
            : { ...this.locationForms.get(this.markerId) };
        if (this.tab === "shops")
          this.offerId = this.shopForms.get(this.shopIdentity())?.offerId || "";
        return this.render(true);
      }
      if (action === "agent") {
        const { openCityAgent } = await import("./city-agent-runtime.mjs");
        return openCityAgent({ actorId: this.actorId });
      }
      if (action === "job-map" || action === "shop-map") {
        const markerId =
          action === "job-map"
            ? listCityJobs().find((j) => j.id === b.dataset.id)?.markerId
            : listCityShops().find((s) => s.id === this.shopId)?.markerId;
        const { openWorldCityMap } =
          await import("./world-city-map-runtime.mjs");
        return openWorldCityMap({
          focusMarkerId: markerId,
          activeActorId: this.actorId,
        });
      }
      if (action === "job-take")
        return requestCityJobAcceptance({
          jobId: b.dataset.id,
          actorId: this.actorId,
        });
      if (action === "job-network")
        return openCityJobInNetwork(b.dataset.id, { actorId: this.actorId });
      if (action === "market-ask") {
        await requestCityMarketAccess(this.shopId, this.actorId);
        this.message = "Запрос приглашения отправлен в Агент ведущего.";
        return this.render(true);
      }
      if (action === "item-open") {
        const shop = listCityShops().find((entry) => entry.id === this.shopId);
        const offer =
          shop &&
          cityShopStock(shop, this.catalogItems || []).find(
            (entry) => entry.id === b.dataset.itemId,
          );
        if (!offer) throw new Error("Товар больше недоступен.");
        const document = offer.uuid
          ? await globalThis.fromUuid?.(offer.uuid)
          : null;
        if (document?.sheet) return document.sheet.render(true);
        return foundry.applications.api.DialogV2.confirm({
          window: { title: offer.name },
          content: `<p>${esc(offer.description || "Описание не добавлено.")}</p>`,
          yes: { label: "Закрыть" },
          no: { label: "Закрыть" },
        });
      }
      if (action === "item-buy") return this.buyOffer(b.dataset.itemId, f, b);
      if (action === "purchase-refresh") return this.render(true);
      if (action === "npc-open") {
        if (!game.user.isGM) {
          ui.notifications?.info?.("Досье NPC открывает ведущий.");
          return;
        }
        const doc = await game.packs
          .get(`${MID}.city-npcs`)
          ?.getDocument(b.dataset.id);
        if (!doc) throw new Error("Компендий NPC недоступен.");
        return doc.sheet?.render?.(true);
      }
      requireCityGM();
      if (action.startsWith("compendium-")) {
        const picker = this.ensureCompendiumPicker();
        if (
          action === "compendium-select-shown" ||
          action === "compendium-clear"
        ) {
          if (action === "compendium-clear") picker.selected.clear();
          else
            for (const row of compendiumMatches(picker).slice(0, 80))
              if (picker.selected.size < 200) picker.selected.add(row.uuid);
          this.updateCompendiumResults();
          return;
        }
        const shopId = this.shopId,
          identity = this.shopIdentity();
        if (action === "compendium-remove") {
          await removeCityShopRandomItem({ shopId, uuid: b.dataset.uuid });
          if (identity === this.shopIdentity()) {
            this.message = "Предмет исключён из дополнительного пула.";
            await this.render(true);
          }
          return;
        }
        if (
          action === "compendium-add-random" ||
          action === "compendium-add-fixed"
        ) {
          if (picker.adding || picker.loading || !picker.selected.size) return;
          picker.adding = true;
          const uuids = [...picker.selected],
            token = picker.token,
            mode = action.endsWith("random") ? "random" : "fixed";
          try {
            await this.render(true);
            const result = await addCityShopCompendiumItems({
              shopId,
              uuids,
              mode,
            });
            if (
              this.compendium === picker &&
              picker.token === token &&
              identity === this.shopIdentity()
            ) {
              for (const uuid of uuids) picker.selected.delete(uuid);
              this.message = `Добавлено: ${result.added}. ${mode === "random" ? "Предметы участвуют в случайном ассортименте; нажми «Новый ассортимент» для нового выбора." : "Предметы выставлены постоянно."}`;
            }
          } finally {
            picker.adding = false;
            if (this.compendium === picker && identity === this.shopIdentity())
              await this.render(true);
          }
          return;
        }
      }
      if (action === "job-link-map") {
        const jobId = b.dataset.id,
          job = listCityJobs().find((entry) => entry.id === jobId);
        if (!job) throw new Error("Заказ удалён.");
        const markers = getWorldCityMap().markers;
        const choices = [
          ["", "Без точки · снять связь"],
          ...markers.map((marker) => [
            marker.id,
            markers.some(
              (other) => other.id !== marker.id && other.title === marker.title,
            )
              ? `${marker.title} · ${marker.id}`
              : marker.title,
          ]),
        ];
        if (
          job.markerId &&
          !markers.some((marker) => marker.id === job.markerId)
        )
          choices.push([
            job.markerId,
            "Прежняя точка удалена — выберите другую",
          ]);
        const markerId = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Точка заказа на карте" },
          content: `<p>${esc(job.title)}</p><label>Существующая точка<select name="markerId">${choices.map(([id, title]) => `<option value="${esc(id)}" ${id === job.markerId ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label><p>Сохраняется связь с существующей точкой; новая точка не создаётся.</p>`,
          ok: {
            label: "Сохранить связь",
            callback: (_event, control) => control.form.elements.markerId.value,
          },
        });
        if (markerId === null || markerId === undefined || markerId === false)
          return;
        await setCityJobMarker(jobId, markerId);
        this.message = markerId
          ? "Заказ связан с точкой карты."
          : "Связь с точкой снята.";
        return this.render(true);
      }
      if (action === "purchase-resolve") {
        const status = b.dataset.status,
          receiptId = b.dataset.receiptId,
          identity = this.shopIdentity();
        const receipt = listCityShopPurchaseReceipts().find(
          (entry) => entry.id === receiptId,
        );
        if (!resolutionLabels[status] || receipt?.status !== "uncertain")
          throw new Error("Квитанция больше не требует сверки. Обнови статус.");
        const note = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Сверка покупки ведущим" },
          content: `<p><strong>${esc(receipt.itemName || "Покупка")}</strong> · ${esc(game.actors.get(receipt.actorId)?.name || receipt.actorId)} · ${esc(credits(receipt.totalCredits))}</p><p>Сначала вручную проверь кошелёк Credits и инвентарь персонажа. При необходимости самостоятельно исправь их и только затем подтверди результат проверки.</p><p>«${esc(resolutionLabels[status])}» меняет только отметку квитанции. Это действие не списывает и не возвращает Credits, не выдаёт и не удаляет предметы.</p><label>Что проверено и исправлено<textarea name="note" rows="3" required></textarea></label>`,
          ok: {
            label: resolutionLabels[status],
            callback: (_event, control) =>
              control.form.elements.note.value.trim(),
          },
        });
        if (note === null || note === undefined || note === false) return;
        if (!String(note).trim())
          throw new Error(
            "Добавь комментарий о проверке кошелька и инвентаря.",
          );
        const { resolveCityShopPurchase } =
          await import("./city-shop-purchases.mjs");
        await resolveCityShopPurchase({
          receiptId,
          status,
          note: String(note).trim(),
        });
        if (identity !== this.shopIdentity()) return;
        this.message = "Результат ручной сверки записан в квитанцию.";
        return this.render(true);
      }
      if (action === "image-pick") {
        const field = b.dataset.field;
        if (!["shopImg", "offerImg"].includes(field)) return;
        const identity = this.shopIdentity(),
          draft = this.draftFields,
          Picker = this.filePicker();
        const picker = new Picker({
          type: "image",
          current: f[field] || "",
          callback: async (path) => {
            if (identity !== this.shopIdentity() || draft !== this.draftFields)
              return;
            this.draftFields[field] = path;
            await this.render(true);
          },
        });
        return picker.render(true);
      }
      if (action === "offer-source")
        return this.loadOfferSource(f.offerSourceUuid);
      if (action === "offer-new") {
        this.offerId = "";
        for (const field of offerFields) delete this.draftFields[field];
        return this.revealOfferEditor();
      }
      if (action === "offer-edit") {
        const identity = this.shopIdentity(),
          draft = this.draftFields;
        const { offer } = await getCityShopOfferSource({
          shopId: this.shopId,
          offerId: b.dataset.itemId,
        });
        if (identity !== this.shopIdentity() || draft !== this.draftFields)
          return;
        this.offerId = offer.id;
        this.draftFields = {
          ...f,
          offerName: offer.name,
          offerImg: offer.img || "",
          offerDescription: offer.description || "",
          offerPriceCredits: offer.priceCredits ?? "",
          offerSourceUuid: "",
        };
        return this.revealOfferEditor();
      }
      if (action === "offer-save") {
        const identity = this.shopIdentity(),
          draft = this.draftFields,
          offerId = this.offerId;
        await saveCityShopOffer({
          shopId: this.shopId,
          ...(offerId ? { offerId } : {}),
          name: f.offerName,
          img: f.offerImg,
          description: f.offerDescription,
          priceCredits:
            f.offerPriceCredits === "" || f.offerPriceCredits === undefined
              ? null
              : Number(f.offerPriceCredits),
          ...(String(f.offerSourceUuid || "").trim()
            ? { sourceUuid: String(f.offerSourceUuid).trim() }
            : {}),
        });
        if (identity !== this.shopIdentity() || draft !== this.draftFields)
          return;
        this.offerId = "";
        for (const field of offerFields) delete this.draftFields[field];
        this.message = "Товар сохранён.";
        return this.render(true);
      }
      if (action === "offer-delete") {
        const shopId = this.shopId,
          identity = this.shopIdentity(),
          offerId = b.dataset.itemId;
        if (
          !(await foundry.applications.api.DialogV2.confirm({
            window: { title: "Убрать товар" },
            content:
              "<p>Убрать это предложение из магазина? Покупки и квитанции сохранятся.</p>",
          }))
        )
          return;
        await deleteCityShopOffer({ shopId, offerId });
        if (identity !== this.shopIdentity()) return;
        if (this.offerId === offerId) {
          this.offerId = "";
          for (const field of offerFields) delete this.draftFields[field];
        }
        this.message = "Товар убран из магазина.";
        return this.render(true);
      }
      if (action === "shop-delete") {
        const shopId = this.shopId,
          identity = this.shopIdentity(),
          shop = listCityShops().find((entry) => entry.id === shopId);
        if (!shop) throw new Error("Магазин удалён.");
        if (
          !(await foundry.applications.api.DialogV2.confirm({
            window: { title: "Удалить магазин" },
            content: `<p>Удалить «${esc(shop.name)}»? Приглашения станут недействительны. Квитанции покупок сохранятся.</p>`,
          }))
        )
          return;
        await deleteCityShop(shopId);
        this.shopForms.delete(identity);
        if (identity !== this.shopIdentity()) return;
        this.shopId = "";
        this.shopSelectionExplicit = true;
        this.draftFields = {};
        this.offerId = "";
        this.message = "Магазин удалён.";
        return this.render(true);
      }
      if (action === "shop-refresh") {
        const identity = this.shopIdentity();
        await loadCityShopItems({ refresh: true });
        if (identity !== this.shopIdentity()) return;
        this.message =
          "Каталог Cyberpunk Equipment Library обновлён. Свои товары и правки сохранены.";
        return this.render(true);
      }
      if (action === "job-delete") {
        const job = listCityJobs().find((j) => j.id === b.dataset.id);
        if (!job) throw new Error("Заказ удалён.");
        if (
          !(await foundry.applications.api.DialogV2.confirm({
            window: { title: "Удалить заказ" },
            content: `<p>Удалить заказ «${esc(job.title)}» из города и связанных команд? Личные заметки и квитанции выплат сохранятся.</p>`,
          }))
        )
          return;
        await deleteCityJob(job.id);
        this.message = "Заказ удалён.";
        return this.render(true);
      }
      if (action === "job-generate") {
        this.draftFields = {
          ...f,
          ...generateCityGig(getWorldCityMap().markers, {
            fixer: f.fixer || "Фиксер",
          }),
        };
        return this.render(true);
      }
      if (action === "job-create") {
        await createCityJob({
          ...f,
          status: f.jobStatus || "offer",
          audience: f.audience ? [f.audience] : [],
        });
        this.draftFields = {};
        this.locationForms = new Map();
        this.message = "Заказ сохранён.";
        return this.render(true);
      }
      if (action === "job-status") {
        await setCityJobStatus(b.dataset.id, b.dataset.status);
        return this.render(true);
      }
      if (action === "shop-save") {
        const identity = this.shopIdentity(),
          draft = this.draftFields;
        const shop = await saveCityShop({
          id: this.shopId || undefined,
          markerId: f.shopMarkerId,
          name: f.shopName,
          img: f.shopImg,
          type: f.shopType,
          level: Number(f.shopLevel),
          size: Number(f.shopSize),
          markup: Number(f.markup),
          market: f.market === "true",
          hidden: f.hidden === "true",
          opens: Number(f.opens),
          closes: Number(f.closes),
          fixer: f.shopFixer,
          requiredReputation: f.requiredReputation,
          services: String(f.decorative || "")
            .split("\n")
            .filter(Boolean)
            .map((l) => {
              const [name, price] = l.split("|");
              return { name: name.trim(), price: price?.trim() || "" };
            }),
        });
        if (identity !== this.shopIdentity() || draft !== this.draftFields)
          return;
        this.shopId = shop.id;
        this.draftFields = Object.fromEntries(
          Object.entries(f).filter(([field]) => !shopFields.includes(field)),
        );
        this.shopForms.delete(identity);
        this.cacheShopDraft();
        this.message = "Торговая карточка обновлена.";
        return this.render(true);
      }
      if (action === "shop-reroll") {
        const old = listCityShops().find((s) => s.id === this.shopId);
        await saveCityShop({ ...old, seed: Math.floor(Math.random() * 1e9) });
        return this.render(true);
      }
      if (action === "market-grant" || action === "market-revoke") {
        await grantCityMarketAccess({
          shopId: this.shopId,
          userId: f.marketUser,
          allowed: action === "market-grant",
        });
        return this.render(true);
      }
      if (action === "item-give") {
        const shopId = this.shopId;
        const options = cityValues(game.actors)
          .map(
            (a) =>
              `<option value="${esc(a.id)}" ${a.id === this.actorId ? "selected" : ""}>${esc(a.name)}</option>`,
          )
          .join("");
        const value = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Бесплатная выдача ведущим" },
          content: `<label>Персонаж<select name="actorId">${options}</select></label><label>Упаковок<input name="quantity" type="number" min="1" max="99" value="1"></label><p>Бесплатная выдача: Credits не списываются.</p>`,
          ok: {
            label: "Бесплатно выдать",
            callback: (_e, b) => ({
              actorId: b.form.elements.actorId.value,
              quantity: Number(b.form.elements.quantity.value),
            }),
          },
        });
        if (value)
          await giveCityShopItem({
            shopId,
            itemId: b.dataset.itemId,
            ...value,
          });
        return;
      }
      if (action === "calendar-mode") {
        const status = cityCalendarStatus();
        if (
          f.calendarMode === "simple-calendar" &&
          !(await foundry.applications.api.DialogV2.confirm({
            window: { title: "Источник времени" },
            content: `<p>Переключить дату города на Simple Calendar: ${esc(status.iso || status.reason)}?</p>`,
          }))
        )
          return;
        await setCityCalendarMode(f.calendarMode);
        return this.render(true);
      }
      if (action === "calendar-setup") {
        if (
          !(await foundry.applications.api.DialogV2.confirm({
            window: { title: "Настроить календарь" },
            content:
              "<p>Настроить григорианский календарь «Найт-Сити2045» и добавить четыре праздника? Текущие параметры будут скачаны перед изменением.</p>",
          }))
        )
          return;
        await setupCityCalendar({
          backup: (data) =>
            downloadCityJSON(data, "simple-calendar-before-night-city.json"),
        });
        return this.render(true);
      }
      if (action === "npc-import") {
        const doc = await game.packs
          .get(`${MID}.city-npcs`)
          ?.getDocument(b.dataset.id);
        if (!doc) throw new Error("Компендий NPC недоступен.");
        const source = doc.toObject();
        delete source._id;
        delete source.folder;
        await globalThis.Actor.create(source);
        this.message = "NPC добавлен в мир.";
        return this.render(true);
      }
      if (action === "npc-contact") {
        const n = CITY_NPC_ROSTER.find((n) => n.id === b.dataset.id),
          actor = game.actors.get(this.actorId);
        if (!actor) throw new Error("Выбери персонажа на карте.");
        const owner =
          cityValues(game.users).find(
            (u) => !u.isGM && actor.testUserPermission?.(u, "OWNER"),
          ) || game.user;
        await mutateCityArchive(owner.id, (s) => {
          const book = s.notebooks?.[actor.id];
          if (!book)
            throw new Error(
              "Открой Архив получателя один раз, чтобы создать блокнот.",
            );
          const people = (book.entries.people ??= []);
          if (!people.some((p) => p.cityNpcId === n.id))
            people.push({
              id: `city-contact-${n.id}`,
              type: "people",
              title: n.name,
              image: n.img,
              summary: "Контакт Найт-Сити",
              content: n.description,
              cityNpcId: n.id,
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
        });
        this.message = `Контакт добавлен: ${owner.name}.`;
        return this.render(true);
      }
      if (action === "transfer-apply") {
        const replaceIds = [
          ...this.element.querySelectorAll("[data-transfer-replace]:checked"),
        ].map((e) => e.dataset.transferReplace);
        downloadCityJSON(
          createWorldMapPointsExport(getWorldCityMap()),
          `night-city-before-transfer-${Date.now()}.json`,
        );
        await applyCityPointsTransfer(this.payload, { replaceIds });
        this.transfer = previewCityPointsTransfer(
          getWorldCityMap(),
          this.payload,
        );
        this.message = "Перенос выполнен. Совпадающие точки не дублируются.";
        return this.render(true);
      }
      if (action === "photo-associate") {
        await updateWorldMapMarker(f.photoMarkerId, {
          catalogId: `ncm:${f.catalogId}`,
        });
        this.message = "Фотография каталога связана с существующей точкой.";
        return this.render(true);
      }
    }
    _onClose(o) {
      this.compendium = null;
      this.events?.abort();
      this.refreshQueue.cancel();
      for (const [n, id] of this.hooks) Hooks.off(n, id);
      this.hooks = [];
      if (instance === this) instance = null;
      return super._onClose?.(o);
    }
  };
  return AppClass;
}
export async function openCityServices(options = {}) {
  options = { ...options, markerId: options.markerId ?? "" };
  if (pending) await pending;
  if (instance?.rendered) {
    const nextTab = options.tab || instance.tab;
    const markerChanged = options.markerId !== instance.markerId;
    const shopChanged =
      options.shopId !== undefined && options.shopId !== instance.shopId;
    const contextChanged =
      nextTab !== instance.tab || markerChanged || shopChanged;
    if (contextChanged) {
      if (instance.tab === "shops") instance.cacheShopDraft();
      else
        instance.locationForms.set(
          instance.markerId,
          structuredClone(instance.draftFields),
        );
    }
    if (options.actorId !== undefined) instance.actorId = options.actorId;
    if (markerChanged) {
      instance.markerId = options.markerId;
      instance.shopId = options.shopId || "";
      instance.shopSelectionExplicit = options.shopId !== undefined;
      if (!instance.shopSelectionExplicit && instance.markerId)
        instance.shopId =
          listCityShops().find((shop) => shop.markerId === instance.markerId)
            ?.id || "";
    } else if (shopChanged) {
      instance.shopId = options.shopId;
      instance.shopSelectionExplicit = true;
    }
    instance.tab = nextTab;
    if (contextChanged) {
      const draft = instance.shopForms.get(instance.shopIdentity());
      instance.draftFields =
        nextTab === "shops"
          ? { ...draft?.fields }
          : { ...instance.locationForms.get(instance.markerId) };
      instance.offerId = draft?.offerId || "";
      instance.message = "";
    }
    if (options.jobId) {
      instance.jobId = options.jobId;
      instance.pendingJobFocus = options.jobId;
    }
    await instance.render(true);
    instance.bringToFront();
    return instance;
  }
  instance = new (appClass())(options);
  pending = instance.render(true);
  try {
    await pending;
  } catch (e) {
    instance = null;
    throw e;
  } finally {
    pending = null;
  }
  return instance;
}
