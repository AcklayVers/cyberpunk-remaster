import { WORLD_MAP_THREATS } from "./world-city-map.mjs";
import {
  NIGHT_CITY_LOCATIONS,
  NIGHT_CITY_DISTRICTS,
  worldMapMarkersInRegion,
} from "./world-city-map-catalog.mjs";
import {
  getWorldMapActorPosition,
  getWorldMapPositionMarkers,
  worldMapActorOwned,
} from "./world-city-map-positions.mjs";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function worldMapDistrictFieldsHtml(draft) {
  return `<input type="hidden" data-world-map-region-field="districtId" value="${esc(draft.districtId)}">
    <label><span>Опасность района</span><select data-world-map-region-field="threat">${Object.entries(
      WORLD_MAP_THREATS,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === (draft.threat || "unknown") ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label>
    <label><span>Контролирующая фракция</span><input data-world-map-region-field="controller" value="${esc(draft.controller)}" placeholder="Банда, корпорация, NCPD…"></label>
    <label class="wide"><span>Услуги — через запятую</span><input data-world-map-region-field="services" value="${esc((draft.services || []).join(", "))}" placeholder="Риппер, ремонт, оружие…"></label>`;
}

export function worldMapDistrictDetailHtml(region, markers) {
  const points = worldMapMarkersInRegion(region, markers);
  return `<dl class="world-city-map-district-facts"><div><dt>Опасность</dt><dd>${esc(WORLD_MAP_THREATS[region.threat] || WORLD_MAP_THREATS.unknown)}</dd></div>
    <div><dt>Контроль</dt><dd>${esc(region.controller || "Не указан")}</dd></div>
    ${region.services?.length ? `<div><dt>Услуги</dt><dd>${region.services.map(esc).join(" · ")}</dd></div>` : ""}</dl>
    <section class="world-city-map-district-places"><h4>Места в районе · ${points.length}</h4>${
      points.length
        ? points
            .map(
              (point) =>
                `<button type="button" data-world-map-focus-marker="${esc(point.id)}">${esc(point.title)} <span>→</span></button>`,
            )
            .join("")
        : '<p class="muted">В границах района пока нет точек.</p>'
    }</section>`;
}

export function worldMapCityCatalogRows({
  tab = "locations",
  query = "",
  state = {},
  selectedRegionId = "",
} = {}) {
  const needle = query.trim().toLocaleLowerCase("ru");
  const entries = (
    tab === "districts" ? NIGHT_CITY_DISTRICTS : NIGHT_CITY_LOCATIONS
  ).filter((entry) =>
    `${entry.name} ${entry.description}`
      .toLocaleLowerCase("ru")
      .includes(needle),
  );
  return (
    entries
      .map((entry) => {
        const placed = state.markers?.some(
          (marker) => marker.catalogId === `ncm:${entry.id}`,
        );
        return `<article><h4>${esc(entry.name)}</h4><p>${esc(entry.description)}</p><button type="button" ${
          tab === "districts"
            ? `data-city-catalog-district="${esc(entry.id)}"`
            : `data-city-catalog-location="${esc(entry.id)}"`
        }>${
          tab === "districts"
            ? selectedRegionId
              ? "Заполнить карточку выбранного региона"
              : "Нарисовать район"
            : placed
              ? "Открыть на карте"
              : "Поставить на карту"
        }</button></article>`;
      })
      .join("") || '<p class="muted">Ничего не найдено.</p>'
  );
}

export function worldMapCityCatalogHtml(options) {
  const districts = options.tab === "districts";
  return `<section class="world-city-map-city-catalog"><header><div><small>НОЧНОЙ ГОРОД // КАТАЛОГ</small><h3>Места и районы</h3></div>
    <button type="button" data-world-map-action="close-city-catalog" aria-label="Закрыть каталог">×</button></header>
    <nav><button type="button" data-world-map-action="catalog-locations" aria-pressed="${!districts}">Места · ${NIGHT_CITY_LOCATIONS.length}</button>
    <button type="button" data-world-map-action="catalog-districts" aria-pressed="${districts}">Районы · ${NIGHT_CITY_DISTRICTS.length}</button></nav>
    <input type="search" data-city-catalog-search value="${esc(options.query)}" placeholder="Поиск по каталогу" aria-label="Поиск по каталогу">
    <p class="world-city-map-catalog-hint">${districts ? "Выбери район и обозначь его границы на карте. Для выбранного региона можно применить описание через редактор." : "Выбери место, затем нажми на карте там, где его нужно поставить."}</p>
    <div data-city-catalog-list>${worldMapCityCatalogRows(options)}</div>
    <footer>Описания: Verlierboy · Night City Map. Координаты задаёт ведущий.</footer></section>`;
}

export function worldMapPositionControlsHtml({
  actorId,
  state,
  mode = "",
  actorShared = false,
  partyVisible = true,
}) {
  const actor = globalThis.game?.actors?.get?.(actorId);
  const owned = worldMapActorOwned(actor);
  const point = owned ? getWorldMapActorPosition(actorId) : null;
  const positions = getWorldMapPositionMarkers(state);
  return `<details class="world-city-map-position-controls" open><summary>Положение</summary>
    ${
      globalThis.game?.user?.isGM
        ? `<div class="world-city-map-position-row"><button type="button" data-world-map-action="pick-party-position" class="${mode === "party" ? "active" : ""}">${mode === "party" ? "Отмена" : "Мы здесь"}</button>
      <button type="button" data-world-map-action="clear-party-position" title="Убрать метку группы" aria-label="Убрать метку группы" ${state.partyPosition ? "" : "disabled"}>×</button></div>
      <label><input type="checkbox" data-city-party-visible ${(state.partyPosition?.visible ?? partyVisible) ? "checked" : ""}> Показывать группу игрокам</label>`
        : ""
    }
    ${
      owned
        ? `<small>${esc(actor.name)}</small><div class="world-city-map-position-row"><button type="button" data-world-map-action="pick-actor-position" class="${mode === "actor" ? "active" : ""}">${mode === "actor" ? "Отмена" : "Я здесь"}</button>
      <button type="button" data-world-map-action="clear-actor-position" title="Убрать мою метку" aria-label="Убрать мою метку" ${point ? "" : "disabled"}>×</button></div>
      <label><input type="checkbox" data-city-actor-shared ${(point?.shared ?? actorShared) ? "checked" : ""}> Показывать другим игрокам</label>`
        : ""
    }
    ${positions.length ? `<select data-city-position-focus aria-label="Перейти к позиции"><option value="">Перейти к позиции…</option>${positions.map((position) => `<option value="${esc(position.id)}">${esc(position.title)}</option>`).join("")}</select>` : '<p class="muted">Позиции ещё не указаны.</p>'}</details>`;
}
