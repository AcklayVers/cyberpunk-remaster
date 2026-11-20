import {worldMapMediaHtml,handleWorldMapMediaAction,bindWorldMapImageErrors,saveWorldMapImageCaption} from "./world-city-map-media.mjs";
import {openWorldMapDossier,publishWorldMapDossier} from "./world-city-map-dossier.mjs";
import { NIGHT_CITY_DISTRICTS, placeWorldMapCatalogLocation } from "./world-city-map-catalog.mjs";
import { getWorldMapActorPosition, worldMapActorOwned, getWorldMapPositionMarkers, setWorldMapActorPosition, setWorldMapPartyPosition } from "./world-city-map-positions.mjs";
import { worldMapCityCatalogHtml, worldMapCityCatalogRows, worldMapDistrictFieldsHtml, worldMapDistrictDetailHtml, worldMapPositionControlsHtml } from "./world-city-map-city-ui.mjs";
import { chooseArchiveImage } from "./archive-file-picker.mjs";
import { createWorldCityLeafletMap } from "./world-city-map-leaflet.mjs";
import { personalLinksForMarker } from "./world-city-map-user-links.mjs";
import {
  WORLD_CITY_MAP_HOOK,
  DEFAULT_WORLD_MAP_CATEGORIES,
  WORLD_MAP_ICON_PRESETS,
  createWorldMapMarker,
  createWorldMapPointsExport,
  createWorldMapRegion,
  deleteWorldMapCategory,
  deleteWorldMapMarker,
  deleteWorldMapRegion,
  getWorldCityMap,
  importWorldMapPointsPayload,
  linkMarkerToArchiveEntry,
  setWorldMapImage,
  useBuiltInWorldMapTiles,
  unlinkMarkerFromArchiveEntry,
  updateWorldMapMarker,
  updateWorldMapRegion,
  moveWorldMapRegionToFront,
  moveWorldMapRegionToBack,
  upsertWorldMapCategory,
} from "./world-city-map.mjs";

const MODULE_ID = "cyberpunk-remaster";
const HIDDEN_KEY = `${MODULE_ID}.world-city-map-hidden-categories.v1`;
const HIDDEN_MARKERS_KEY = `${MODULE_ID}.world-city-map-hidden-markers.v1`;
const HIDDEN_REGIONS_KEY = `${MODULE_ID}.world-city-map-hidden-regions.v1`;
const GM_PANEL_COLLAPSED_KEY = `${MODULE_ID}.world-city-map-gm-panel-collapsed.v1`;
const SIDEBAR_COLLAPSED_KEY = `${MODULE_ID}.world-city-map-sidebar-collapsed.v1`;
const INTEREST_PANEL_COLLAPSED_KEY = `${MODULE_ID}.world-city-map-interest-panel-collapsed.v1`;
const REGION_PANEL_COLLAPSED_KEY = `${MODULE_ID}.world-city-map-region-panel-collapsed.v1`;
const MARKER_GROUPS_KEY = `${MODULE_ID}.world-city-map-marker-groups.v1`;
const MARKER_OPACITY_KEY = `${MODULE_ID}.world-city-map-marker-opacity.v1`;
const DETAIL_LINKS_COLLAPSED_KEY = `${MODULE_ID}.world-city-map-detail-links-collapsed.v1`;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
export const WORLD_MAP_ARCHIVE_FOCUS_ZOOM = 5;

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const clone = (value) => {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
};

const clean = (value) => String(value ?? "").trim();
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const DEFAULT_CATEGORY_IDS = new Set(DEFAULT_WORLD_MAP_CATEGORIES.map((category) => category.id));

export function worldMapDetailLinksCollapseStorageKey(userId = null) {
  const resolvedUserId = clean(userId ?? globalThis.game?.user?.id) || "client";
  return `${DETAIL_LINKS_COLLAPSED_KEY}.${resolvedUserId}`;
}

export function worldMapIconHtml(icon, { className = "" } = {}) {
  const value = clean(icon);
  if (value.startsWith("fa:")) {
    const faClass = value.slice(3).replace(/[^a-z0-9_-]/giu, "");
    return `<i class="fa-solid ${esc(faClass)} ${esc(className)}" aria-hidden="true"></i>`;
  }
  return `<span class="${esc(className)}" aria-hidden="true">${esc(value || "◆")}</span>`;
}

function iconPresetLabel(icon) {
  const value = clean(icon);
  return (
    WORLD_MAP_ICON_PRESETS.find((preset) => preset.icon === value)?.label || (value ? "Пользовательская иконка" : "Иконка категории")
  );
}

function iconPickerHtml({ target, value = "", inherit = false, effectiveIcon = "" } = {}) {
  const selected = clean(value);
  const inheritedIcon = clean(effectiveIcon) || "fa:fa-location-dot";
  const shownIcon = selected || inheritedIcon;
  const inputAttr = target === "marker" ? 'data-world-map-field="icon"' : 'data-world-map-new-category-icon';
  const triggerAttr = target === "marker" ? 'data-world-map-icon-trigger="marker"' : 'data-world-map-icon-trigger="category"';
  const gridAttr = target === "marker" ? 'data-world-map-icon-grid="marker"' : 'data-world-map-icon-grid="category"';
  const inheritChoice = inherit
    ? `<button type="button" class="world-city-map-icon-choice inherit ${selected ? "" : "selected"}" data-world-map-icon-choice="" title="Иконка категории">${worldMapIconHtml(inheritedIcon, { className: "world-city-map-icon-choice-glyph" })}</button>`
    : "";
  const choices = WORLD_MAP_ICON_PRESETS.map((preset) => `<button type="button" class="world-city-map-icon-choice ${preset.icon === selected ? "selected" : ""}" data-world-map-icon-choice="${esc(preset.icon)}" title="${esc(preset.label)}">${worldMapIconHtml(preset.icon, { className: "world-city-map-icon-choice-glyph" })}</button>`).join("");
  const customChoice = selected && !WORLD_MAP_ICON_PRESETS.some((preset) => preset.icon === selected)
    ? `<button type="button" class="world-city-map-icon-choice selected" data-world-map-icon-choice="${esc(selected)}" title="Текущая пользовательская иконка">${worldMapIconHtml(selected, { className: "world-city-map-icon-choice-glyph" })}</button>`
    : "";
  const title = selected ? iconPresetLabel(selected) : "Иконка категории";
  return `<div class="world-city-map-icon-picker" data-world-map-icon-picker="${esc(target)}" data-world-map-effective-icon="${esc(inheritedIcon)}"><input type="hidden" ${inputAttr} value="${esc(selected)}"><button type="button" class="world-city-map-icon-trigger" ${triggerAttr} title="${esc(title)}">${worldMapIconHtml(shownIcon, { className: "world-city-map-icon-trigger-glyph" })}<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div class="world-city-map-icon-grid" ${gridAttr} hidden>${inheritChoice}${choices}${customChoice}</div></div>`;
}

function setIconPickerValue(picker, value, { effectiveIcon = null } = {}) {
  if (!picker) return;
  if (effectiveIcon !== null) picker.dataset.worldMapEffectiveIcon = clean(effectiveIcon) || "fa:fa-location-dot";
  const input = picker.querySelector?.('[data-world-map-field="icon"], [data-world-map-new-category-icon]');
  if (input) input.value = clean(value);
  const inheritedIcon = clean(picker.dataset.worldMapEffectiveIcon) || "fa:fa-location-dot";
  const shownIcon = clean(value) || inheritedIcon;
  const trigger = picker.querySelector?.("[data-world-map-icon-trigger]");
  if (trigger) {
    trigger.innerHTML = `${worldMapIconHtml(shownIcon, { className: "world-city-map-icon-trigger-glyph" })}<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;
    trigger.title = clean(value) ? iconPresetLabel(value) : "Иконка категории";
  }
  for (const button of picker.querySelectorAll?.("[data-world-map-icon-choice]") ?? []) {
    button.classList.toggle("selected", clean(button.dataset.worldMapIconChoice) === clean(value));
  }
}


export function clampWorldMapZoom(value) {
  const numeric = Number(value);
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(numeric) ? numeric : 1));
}

export function normalizeWorldMapMarkerOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  return Math.max(0.2, Math.min(1, numeric));
}

function markerOpacityStorageKey() {
  const userId = clean(globalThis.game?.user?.id) || "client";
  return `${MARKER_OPACITY_KEY}.${userId}`;
}

function readWorldMapMarkerOpacity() {
  try {
    const raw = globalThis.localStorage?.getItem?.(markerOpacityStorageKey());
    if (raw === null || raw === undefined || raw === "") return 0.7;
    return normalizeWorldMapMarkerOpacity(raw);
  } catch {
    return 0.7;
  }
}

function saveWorldMapMarkerOpacity(value) {
  const normalized = normalizeWorldMapMarkerOpacity(value);
  try {
    globalThis.localStorage?.setItem?.(markerOpacityStorageKey(), String(normalized));
  } catch {
    // Purely local preference; map data shared with the world is untouched.
  }
  return normalized;
}

export function viewportPointToNormalized({
  clientX = 0,
  clientY = 0,
  rectLeft = 0,
  rectTop = 0,
  panX = 0,
  panY = 0,
  zoom = 1,
  width = 1,
  height = 1,
} = {}) {
  const safeZoom = Math.max(0.0001, Number(zoom) || 1);
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const sceneX = (Number(clientX) - Number(rectLeft) - Number(panX)) / safeZoom;
  const sceneY = (Number(clientY) - Number(rectTop) - Number(panY)) / safeZoom;
  return {
    x: clamp01(sceneX / safeWidth),
    y: clamp01(sceneY / safeHeight),
  };
}

function categoryLabel(state, categoryId) {
  return (
    state.categories?.find((category) => category.id === categoryId)?.label ?? categoryId ?? ""
  );
}

export function filterWorldMapMarkers(state, {
  hiddenCategories = new Set(),
  hiddenMarkers = new Set(),
  query = "",
  recordTitleByLink = null,
} = {}) {
  const hidden = hiddenCategories instanceof Set ? hiddenCategories : new Set(hiddenCategories ?? []);
  const hiddenPoints = hiddenMarkers instanceof Set ? hiddenMarkers : new Set(hiddenMarkers ?? []);
  const needle = clean(query).toLocaleLowerCase("ru");
  return (state?.markers ?? []).filter((marker) => {
    if (hidden.has(marker.categoryId)) return false;
    if (hiddenMarkers instanceof Set && hiddenMarkers.has(marker.id)) return false;
    if (hiddenPoints.has(marker.id)) return false;
    if (!needle) return true;
    const linked = typeof recordTitleByLink === "function"
      ? (marker.links ?? []).map((link) => recordTitleByLink(link)).join(" ")
      : "";
    const haystack = [
      marker.title,
      marker.description,
      marker.icon,
      categoryLabel(state, marker.categoryId),
      linked,
    ].join(" ").toLocaleLowerCase("ru");
    return haystack.includes(needle);
  });
}

function readClientSet(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem?.(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveClientSet(key, values) {
  try {
    globalThis.localStorage?.setItem?.(key, JSON.stringify([...values]));
  } catch {
    // Client-only convenience. The shared map itself does not depend on this.
  }
}

function readHiddenCategories() { return readClientSet(HIDDEN_KEY); }
function saveHiddenCategories(hidden) { saveClientSet(HIDDEN_KEY, hidden); }
function readHiddenMarkers() { return readClientSet(HIDDEN_MARKERS_KEY); }
function saveHiddenMarkers(hidden) { saveClientSet(HIDDEN_MARKERS_KEY, hidden); }
function readHiddenRegions() { return readClientSet(HIDDEN_REGIONS_KEY); }
function saveHiddenRegions(hidden) { saveClientSet(HIDDEN_REGIONS_KEY, hidden); }
function readCollapsedDetailLinks() { return readClientSet(worldMapDetailLinksCollapseStorageKey()); }
function saveCollapsedDetailLinks(collapsed) { saveClientSet(worldMapDetailLinksCollapseStorageKey(), collapsed); }

function readClientFlag(key, fallback = false) {
  try {
    const value = globalThis.localStorage?.getItem?.(key);
    if (value === null || value === undefined || value === "") return Boolean(fallback);
    return value === "1" || value === "true";
  } catch {
    return Boolean(fallback);
  }
}

function saveClientFlag(key, value) {
  try {
    globalThis.localStorage?.setItem?.(key, value ? "1" : "0");
  } catch {
    // Client-only convenience.
  }
}

function linkKey(link) {
  return `${String(link?.actorId ?? "")}|${String(link?.section ?? "")}|${String(link?.entryId ?? "")}|${String(link?.ownerUserId ?? "")}`;
}

function parseLinkKey(value) {
  const [actorId = "", section = "", entryId = "", ownerUserId = ""] = String(value || "").split("|");
  return actorId && section && entryId ? { actorId, section, entryId, ...(ownerUserId ? {ownerUserId} : {}) } : null;
}

function markerCategory(state, marker) {
  return (
    state.categories.find((category) => category.id === marker?.categoryId)
    ?? state.categories.find((category) => category.id === "poi")
    ?? { id: "poi", label: "Интерес", icon: "fa:fa-location-dot", color: "#f8f9fa" }
  );
}

function iconForMarker(state, marker) {
  return (
    clean(marker?.icon) || markerCategory(state, marker).icon || "fa:fa-location-dot"
  );
}

function colorForMarker(state, marker) {
  return (
    clean(marker?.color) || markerCategory(state, marker).color || "#f6c85f"
  );
}

const RECORD_TYPE_LABELS = Object.freeze({
  people: "КОНТАКТ",
  gangs: "БАНДА",
  corporations: "КОРПОРАЦИЯ",
  fixers: "ФИКСЕР",
  rippers: "РИППЕР",
  lawmen: "ЗАКОННИК",
  noosphere: "НООСФЕРА",
  nomads: "КОЧЕВНИК",
  subscriptions: "ПОДПИСКА",
  locations: "МЕСТО",
  quests: "ЗАКАЗ",
  clues: "ЗАЦЕПКА",
  books: "ФАЙЛ",
  sessions: "СЕССИЯ",
  notes: "ЗАМЕТКА",
});

function recordTypeLabel(recordOrLink) {
  const section = clean(recordOrLink?.section);
  return (
    RECORD_TYPE_LABELS[section]
    || clean(recordOrLink?.sectionLabel).toLocaleUpperCase("ru")
    || section.toLocaleUpperCase("ru")
    || "ЗАПИСЬ"
  );
}

function recordLinkLabel(record, fallbackLink = null) {
  const source = record || fallbackLink || {};
  const type = recordTypeLabel(source);
  const title = clean(record?.title) || clean(fallbackLink?.entryId) || "Без названия";
  return `${type} — ${title}`;
}

function recordLabel(record) {
  const actor = clean(record?.actorName);
  return [actor, recordLinkLabel(record)].filter(Boolean).join(" · ");
}

function markerLinkSummary(marker, recordsByKey) {
  const links = Array.isArray(marker?.links) ? marker.links : [];
  if (!links.length) return "";
  const first = links[0];
  const record = recordsByKey.get(linkKey(first));
  const label = recordLinkLabel(record, first);
  return `${label}${links.length > 1 ? ` +${links.length - 1}` : ""}`;
}

function markerButtonHtml(state, marker, selected) {
  const color = colorForMarker(state, marker);
  const tooltip = clean(marker.title) || categoryLabel(state, marker.categoryId) || "Точка интереса";
  return `<button type="button" class="world-city-map-marker ${selected ? "selected" : ""}" data-world-map-marker="${esc(marker.id)}" data-category="${esc(marker.categoryId)}" data-world-map-tooltip="${esc(tooltip)}" aria-label="${esc(tooltip)}" style="--world-map-marker-color:${esc(color)}" title="${esc(tooltip)}">${worldMapIconHtml(iconForMarker(state, marker), { className: "world-city-map-marker-icon" })}</button>`;
}

function emptyHtml() {
  return `<div class="world-city-map-empty world-city-map-loading"><b>⌖</b><h2>Загрузка карты Найт-Сити</h2><p>Инициализация локального Leaflet и слоёв карты…</p></div>`;
}

function shellHtml(isGM, markerOpacity = 0.7, groupMarkers = true) {
  return `<section class="world-city-map-shell" data-world-map-shell>
    <aside class="world-city-map-sidebar">
      <header><span class="world-city-map-sidebar-title"><small>WORLD // NIGHT CITY</small><h2 data-world-map-title>Карта Найт-Сити</h2></span><button type="button" class="world-city-map-sidebar-toggle" data-world-map-action="toggle-sidebar" title="Свернуть или развернуть панель карты"><i class="fa-solid fa-panel-left" aria-hidden="true"></i></button></header>
      <label class="world-city-map-search"><span>⌕</span><input type="search" data-world-map-search placeholder="Поиск по точкам и связям"><button type="button" data-world-map-action="find-search-marker" title="Найти точку и перейти к ней"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>Найти</span></button></label>
      <div class="world-city-map-sidebar-scroll" data-world-map-sidebar-scroll>
        <div data-city-position-controls></div>
        <section class="world-city-map-interest-panel" data-world-map-interest-panel><header><button type="button" class="world-city-map-interest-toggle" data-world-map-action="toggle-interest-panel" title="Свернуть или развернуть точки интереса"><span><b>Точки интереса</b><small data-world-map-interest-count>0</small></span><i class="fa-solid fa-chevron-up" data-world-map-interest-chevron aria-hidden="true"></i></button></header><div class="world-city-map-interest-body" data-world-map-interest-body><div class="world-city-map-filter-tools"><button type="button" data-world-map-action="show-all-categories" title="Показать все отключённые точки на карте"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Показать все</span></button><button type="button" data-world-map-action="hide-all-categories" title="Скрыть все точки на карте"><i class="fa-solid fa-square-minus" aria-hidden="true"></i><span>Скрыть все</span></button></div><div class="world-city-map-categories" data-world-map-categories></div></div></section>
        <section class="world-city-map-regions-panel" data-world-map-regions-panel><header><button type="button" class="world-city-map-regions-toggle" data-world-map-action="toggle-regions-panel" title="Свернуть или развернуть регионы"><span><b>Регионы</b><small data-world-map-region-count>0</small></span><i class="fa-solid fa-chevron-up" data-world-map-regions-chevron aria-hidden="true"></i></button></header><div class="world-city-map-regions" data-world-map-regions></div></section>
      </div>
      ${isGM ? `<section class="world-city-map-gm" data-world-map-gm><header><span><b>GM CONTROL</b><small>Общие данные мира</small></span><button type="button" class="world-city-map-gm-toggle" data-world-map-action="toggle-gm" title="Свернуть или развернуть блок GM"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button></header><div class="world-city-map-gm-body" data-world-map-gm-body><div class="world-city-map-gm-actions"><button type="button" data-world-map-action="city-catalog">Каталог города</button><button type="button" data-world-map-action="add-marker">+ Точка</button><button type="button" data-world-map-action="pick-image">Карта</button><button type="button" data-world-map-action="clear-image">Очистить</button><button type="button" data-world-map-action="export-points" title="Сохранить точки карты в переносимый JSON"><i class="fa-solid fa-file-export" aria-hidden="true"></i> Экспорт точек</button><button type="button" data-world-map-action="import-points" title="Добавить точки из переносимого JSON"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Импорт точек</button><input type="file" accept=".json,application/json" data-world-map-points-import hidden></div><small data-world-map-category-editing>Новая категория</small><div class="world-city-map-category-create"><input data-world-map-new-category-label placeholder="Название категории">${iconPickerHtml({ target: "category", value: "fa:fa-location-dot" })}<input type="color" data-world-map-new-category-color value="#f6c85f" title="Цвет иконки"><button type="button" data-world-map-action="add-category" title="Сохранить категорию">✓</button><button type="button" data-world-map-action="cancel-category-edit" title="Сбросить">×</button></div></div></section>` : ""}
    </aside>
    <div class="world-city-map-main">
      <div class="world-city-map-toolbar"><button type="button" data-world-map-action="zoom-out">−</button><button type="button" data-world-map-action="reset-view">Вписать</button><button type="button" data-world-map-action="zoom-in">+</button><label class="world-city-map-marker-opacity-control" title="Личная прозрачность точек только для этого пользователя"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><b>Точки</b><input type="range" min="20" max="100" step="1" value="${Math.round(normalizeWorldMapMarkerOpacity(markerOpacity) * 100)}" data-world-map-marker-opacity><output data-world-map-marker-opacity-output>${Math.round(normalizeWorldMapMarkerOpacity(markerOpacity) * 100)}%</output></label><label class="world-city-map-group-control" title="Объединять близкие точки на общем масштабе для плавного перемещения"><input type="checkbox" data-world-map-group-points ${groupMarkers ? "checked" : ""}>Группы точек</label><div class="world-city-map-region-drawing-controls" data-world-map-region-drawing-controls hidden><button type="button" class="primary" data-world-map-action="finish-region-drawing">Завершить</button><button type="button" data-world-map-action="cancel-region-drawing">Отмена</button></div><span data-world-map-mode></span></div>
      <div class="world-city-map-viewport" data-world-map-viewport tabindex="0">
        <div class="world-city-map-leaflet" data-world-map-leaflet></div>
        <div data-world-map-empty></div>
      </div>
      <div class="world-city-map-context-menu" data-world-map-context-menu hidden></div>
      <div class="world-city-map-inspector" data-world-map-inspector></div>
    </div>
  </section>`;
}

export function renderWorldCityMap(host, context = {}) {
  if (!host) return { destroy() {}, refresh() {}, focusMarker() {} };
  const domEvents = new AbortController();
  const isGM = Boolean(globalThis.game?.user?.isGM);
  let activeActorId = clean(context.activeActorId);
  const hiddenCategories = readHiddenCategories();
  const hiddenMarkers = readHiddenMarkers();
  const hiddenRegions = readHiddenRegions();
  const collapsedDetailLinks = readCollapsedDetailLinks();
  const expandedCategories = new Set();
  let gmPanelCollapsed = readClientFlag(GM_PANEL_COLLAPSED_KEY, false);
  let sidebarCollapsed = readClientFlag(SIDEBAR_COLLAPSED_KEY, false);
  let interestPanelCollapsed = readClientFlag(INTEREST_PANEL_COLLAPSED_KEY, false);
  let regionsPanelCollapsed = readClientFlag(REGION_PANEL_COLLAPSED_KEY, false);
  let markerOpacity = readWorldMapMarkerOpacity();
  let groupMarkers = readClientFlag(MARKER_GROUPS_KEY, true);
  let state = getWorldCityMap();
  let query = "";
  let selectedMarkerId = clean(context.focusMarkerId);
  let editorMarkerId = "";
  let categoryEditId = "";
  let selectedCategoryId = "poi";
  let placementMode = false;
  let positionPick = "";
  let pendingCatalogLocation = "";
  let cityCatalogOpen = false;
  let cityCatalogTab = "locations";
  let cityCatalogQuery = "";
  let districtProfile = null;
  let actorPositionShared = false;
  let partyPositionVisible = true;
  const actorHookIds = [];
  let selectedRegionId = "";
  let regionMode = "idle";
  let regionEditorMode = "";
  let editingRegionId = "";
  let regionDraftPoints = [];
  let contextMenuPoint = null;
  let contextMenuRegionIds = [];
  let destroyed = false;
  let mapController = null;
  let mapSourceKey = "";
  let mapInitSerial = 0;
  let mapPendingKey="",pendingMapSync=false;
  let hookId = null;
  const catalog = () => Array.isArray(context.listArchiveRecords?.()) ? context.listArchiveRecords() : [];
  const recordMap = () => {const records=catalog();const map=new Map(records.map((record) =>[linkKey(record),record]));for(const record of records){const legacy=linkKey({...record,ownerUserId:""});if(records.filter((r) =>linkKey({...r,ownerUserId:""})===legacy).length===1)map.set(legacy,record);}return map;};
  const pickImage = typeof context.pickImage === "function" ? context.pickImage : chooseArchiveImage;

  host.innerHTML = shellHtml(isGM, markerOpacity, groupMarkers);
  bindWorldMapImageErrors(host,domEvents.signal);
  const shell = host.querySelector("[data-world-map-shell]");
  const titleEl = host.querySelector("[data-world-map-title]");
  const categoriesEl = host.querySelector("[data-world-map-categories]");
  const interestPanel = host.querySelector("[data-world-map-interest-panel]");
  const interestToggle = host.querySelector('[data-world-map-action="toggle-interest-panel"]');
  const interestCountEl = host.querySelector("[data-world-map-interest-count]");
  const regionsPanel = host.querySelector("[data-world-map-regions-panel]");
  const regionsToggle = host.querySelector('[data-world-map-action="toggle-regions-panel"]');
  const regionsEl = host.querySelector("[data-world-map-regions]");
  const regionCountEl = host.querySelector("[data-world-map-region-count]");
  const resultsEl = host.querySelector("[data-world-map-results]");
  const gmSection = host.querySelector("[data-world-map-gm]");
  const gmToggle = host.querySelector('[data-world-map-action="toggle-gm"]');
  const sidebarToggle = host.querySelector('[data-world-map-action="toggle-sidebar"]');
  const viewport = host.querySelector("[data-world-map-viewport]");
  const mapHost = host.querySelector("[data-world-map-leaflet]");
  const empty = host.querySelector("[data-world-map-empty]");
  const inspector = host.querySelector("[data-world-map-inspector]");
  const contextMenuEl = host.querySelector("[data-world-map-context-menu]");
  const drawingControls = host.querySelector("[data-world-map-region-drawing-controls]");
  const modeEl = host.querySelector("[data-world-map-mode]");
  const markerOpacityInput = host.querySelector("[data-world-map-marker-opacity]");
  const markerOpacityOutput = host.querySelector("[data-world-map-marker-opacity-output]");
  const applyMarkerOpacity = (value, { persist = false } = {}) => {
    markerOpacity = normalizeWorldMapMarkerOpacity(value);
    shell?.style?.setProperty?.("--world-map-marker-opacity", String(markerOpacity));
    if (markerOpacityInput) markerOpacityInput.value = String(Math.round(markerOpacity * 100));
    if (markerOpacityOutput) markerOpacityOutput.textContent = `${Math.round(markerOpacity * 100)}%`;
    if (persist) saveWorldMapMarkerOpacity(markerOpacity);
    return markerOpacity;
  };
  applyMarkerOpacity(markerOpacity);
  viewport?.addEventListener?.("contextmenu", (event) => event.preventDefault(), { signal: domEvents.signal });

  function recordTitleByLink(link) {
    return recordLabel(recordMap().get(linkKey(link)));
  }

  const cityCatalogOptions = () => ({ tab: cityCatalogTab, query: cityCatalogQuery, state, selectedRegionId });

  function renderCityPositions() {
    const container = host.querySelector("[data-city-position-controls]");
    const wasOpen = container?.querySelector("details")?.open ?? true;
    if (container) {
      container.innerHTML = worldMapPositionControlsHtml({ actorId: activeActorId, state, mode: positionPick, actorShared: actorPositionShared, partyVisible: partyPositionVisible });
      const details = container.querySelector("details");
      if (details) details.open = wasOpen;
    }
    mapController?.setPositionMarkers?.(getWorldMapPositionMarkers(state));
  }

  function cityError(error) {
    console.error("Cyberpunk Remaster | city map action failed", error);
    globalThis.ui?.notifications?.error?.(String(error?.message || error));
  }

  async function placePositionAt(point) {
    const target = positionPick;
    positionPick = "";
    try {
      if (target === "party") await setWorldMapPartyPosition({ ...point, visible: partyPositionVisible });
      else if (target === "actor") await setWorldMapActorPosition(activeActorId, { ...point, shared: actorPositionShared });
    } catch (error) { cityError(error); }
    refresh();
  }

  function visibleMarkers() {
    return filterWorldMapMarkers(state, { hiddenCategories, hiddenMarkers, query, recordTitleByLink });
  }

  function fitMap() {
    mapController?.fit?.();
  }

  function centerMarker(markerId) {
    return mapController?.focusMarker?.(markerId) ?? false;
  }

  function centerRegion(regionId) {
    return mapController?.focusRegion?.(regionId, { maxZoom: 5 }) ?? false;
  }

  function visibleRegions() {
    return (state.regions ?? []).filter((region) => region.visible !== false && !hiddenRegions.has(region.id));
  }

  function renderRegions() {
    if (!regionsEl) return;
    const regions = [...(state.regions ?? [])].sort((a, b) => (Number(b.zOrder) || 0) - (Number(a.zOrder) || 0));
    if (regionCountEl) regionCountEl.textContent = String(regions.length);
    regionsEl.innerHTML = regions.length ? regions.map((region) => {
      const localHidden = hiddenRegions.has(region.id);
      const worldHidden = region.visible === false;
      const selected = selectedRegionId === region.id;
      const hiddenForViewer = isGM ? worldHidden : localHidden || worldHidden;
      const visibilityTitle = isGM
        ? worldHidden ? "Показать регион всем" : "Скрыть регион для всех"
              : worldHidden
          ? "Регион скрыт GM"
          : localHidden ? "Показать этот регион у себя" : "Скрыть этот регион у себя";
      const visibilityDisabled = !isGM && worldHidden ? " disabled" : "";
      const editControls = isGM
        ? `<span class="world-city-map-region-controls"><button type="button" data-world-map-edit-region="${esc(region.id)}" title="Изменить свойства"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" data-world-map-delete-region="${esc(region.id)}" title="Удалить регион"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span>`
        : "";
      return `<div class="world-city-map-region-row ${hiddenForViewer ? "map-off" : ""} ${selected ? "selected" : ""}" data-world-map-region-row="${esc(region.id)}" style="--world-map-region-color:${esc(region.color || "#ef233c")}"><button type="button" class="world-city-map-region-focus" data-world-map-focus-region="${esc(region.id)}" title="Показать регион на карте"><span class="world-city-map-region-swatch"></span><span><b>${esc(region.name || "Без названия")}</b>${region.description ? `<small>${esc(region.description)}</small>` : ""}</span></button><button type="button" class="world-city-map-region-visibility" data-world-map-toggle-region="${esc(region.id)}" title="${esc(visibilityTitle)}"${visibilityDisabled}><i class="fa-solid ${hiddenForViewer ? "fa-square" : "fa-square-check"}" aria-hidden="true"></i></button>${editControls}</div>`;
    }).join("") : '<p class="world-city-map-no-regions">Регионы ещё не созданы.</p>';
  }

  function renderRegionsOnMap() {
    mapController?.setRegions?.(visibleRegions());
  }

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.hidden = true;
    contextMenuEl.innerHTML = "";
  }

  function positionContextMenu(event) {
    if (!contextMenuEl) return;
    const main = host.querySelector?.(".world-city-map-main");
    const rect = main?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    const original = event?.originalEvent ?? event ?? {};
    let x = Number(original?.clientX) - Number(rect.left || 0);
    let y = Number(original?.clientY) - Number(rect.top || 0);
    if (!Number.isFinite(x) && event?.containerPoint) x = Number(event.containerPoint.x) || 0;
    if (!Number.isFinite(y) && event?.containerPoint) y = Number(event.containerPoint.y) || 0;
    const maxX = Math.max(8, Number(rect.width || 0) - 280);
    const maxY = Math.max(8, Number(rect.height || 0) - 320);
    contextMenuEl.style.left = `${Math.max(8, Math.min(maxX, Number.isFinite(x) ? x : 8))}px`;
    contextMenuEl.style.top = `${Math.max(8, Math.min(maxY, Number.isFinite(y) ? y : 8))}px`;
  }

  function createActionsHtml() {
    if (!isGM) return "";
    return `<button type="button" data-world-map-context-action="add-marker-here"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>Добавить точку здесь</span></button><button type="button" data-world-map-context-action="draw-region"><i class="fa-solid fa-draw-polygon" aria-hidden="true"></i><span>Нарисовать регион</span></button>`;
  }

  function regionActionsHtml(regionId) {
    const region = state.regions?.find((candidate) => candidate.id === regionId);
    if (!region) return createActionsHtml();
    if (!isGM) return `<header><b>${esc(region.name)}</b></header><button type="button" data-world-map-context-action="focus-region" data-region-id="${esc(region.id)}">Показать регион</button>`;
    return `<header><span class="world-city-map-region-swatch" style="--world-map-region-color:${esc(region.color || "#ef233c")}"></span><b>${esc(region.name)}</b></header><button type="button" data-world-map-context-action="edit-region-geometry" data-region-id="${esc(region.id)}">Редактировать границу</button><button type="button" data-world-map-context-action="edit-region-properties" data-region-id="${esc(region.id)}">Изменить свойства</button><button type="button" data-world-map-context-action="region-front" data-region-id="${esc(region.id)}">На передний план</button><button type="button" data-world-map-context-action="region-back" data-region-id="${esc(region.id)}">На задний план</button><button type="button" data-world-map-context-action="region-global-toggle" data-region-id="${esc(region.id)}">${region.visible === false ? "Показать" : "Скрыть"}</button><button type="button" class="danger" data-world-map-context-action="delete-region" data-region-id="${esc(region.id)}">Удалить</button><hr>${createActionsHtml()}`;
  }

  function showMapContextMenu(point, event, regionIds = []) {
    if (!contextMenuEl) return;
    contextMenuPoint = point ? { x: clamp01(point.x), y: clamp01(point.y) } : null;
    contextMenuRegionIds = (Array.isArray(regionIds) ? regionIds : []).filter((id) => state.regions?.some((region) => region.id === id));
    if (!isGM && contextMenuRegionIds.length === 0) {
      hideContextMenu();
      return;
    }
    if (contextMenuRegionIds.length > 1) {
      const choices = contextMenuRegionIds.map((id) => state.regions.find((region) => region.id === id)).filter(Boolean);
      contextMenuEl.innerHTML = `<header><b>Выберите регион</b></header>${choices.map((region) => `<button type="button" data-world-map-context-region="${esc(region.id)}"><span class="world-city-map-region-swatch" style="--world-map-region-color:${esc(region.color || "#ef233c")}"></span><span>${esc(region.name)}</span></button>`).join("")}${isGM ? `<hr>${createActionsHtml()}` : ""}`;
    } else if (contextMenuRegionIds.length === 1) {
      contextMenuEl.innerHTML = regionActionsHtml(contextMenuRegionIds[0]);
    } else {
      contextMenuEl.innerHTML = `<header><b>Карта Найт-Сити</b></header>${createActionsHtml()}<button type="button" data-world-map-context-action="close-context">Отмена</button>`;
    }
    positionContextMenu(event);
    contextMenuEl.hidden = false;
  }

  function startRegionDrawing(profile = null) {
    if (!isGM) return;
    districtProfile = profile;
    cityCatalogOpen = false;
    pendingCatalogLocation = "";
    positionPick = "";
    placementMode = false;
    selectedMarkerId = "";
    editorMarkerId = "";
    selectedRegionId = "";
    editingRegionId = "";
    regionEditorMode = "";
    regionMode = "drawing";
    regionDraftPoints = [];
    hideContextMenu();
    mapController?.setPlacementMode?.(false);
    mapController?.setRegionDrawingMode?.(true, regionDraftPoints);
    refresh();
  }

  function openRegionProperties(regionId, { create = false, profile = null } = {}) {
    if (!isGM) return;
    districtProfile = profile || (create ? districtProfile : null);
    positionPick = "";
    pendingCatalogLocation = "";
    placementMode = false;
    mapController?.setPlacementMode?.(false);
    cityCatalogOpen = false;
    const region = create ? null : state.regions?.find((candidate) => candidate.id === regionId);
    if (!create && !region) return;
    selectedMarkerId = "";
    editorMarkerId = "";
    selectedRegionId = region?.id || "";
    editingRegionId = region?.id || "";
    regionEditorMode = create ? "create" : "properties";
    regionMode = "idle";
    if (!create) regionDraftPoints = clone(region.points ?? []);
    mapController?.setRegionDrawingMode?.(false);
    if (create) mapController?.setRegionDraft?.(regionDraftPoints);
    refresh();
  }

  function startRegionGeometryEdit(regionId) {
    if (!isGM) return;
    const region = state.regions?.find((candidate) => candidate.id === regionId);
    if (!region) return;
    cityCatalogOpen = false;
    positionPick = "";
    pendingCatalogLocation = "";
    districtProfile = null;
    placementMode = false;
    selectedMarkerId = "";
    editorMarkerId = "";
    selectedRegionId = region.id;
    editingRegionId = region.id;
    regionEditorMode = "geometry";
    regionMode = "editing";
    regionDraftPoints = clone(region.points ?? []);
    hideContextMenu();
    mapController?.setPlacementMode?.(false);
    mapController?.setRegionEditMode?.(region.id, regionDraftPoints);
    refresh();
  }

  function cancelRegionWork() {
    districtProfile = null;
    regionMode = "idle";
    regionEditorMode = "";
    editingRegionId = "";
    regionDraftPoints = [];
    mapController?.clearRegionDraft?.();
    refresh();
  }

  function finishRegionDrawing() {
    if (regionMode !== "drawing") return;
    if (regionDraftPoints.length < 3) {
      globalThis.ui?.notifications?.error?.("Регион должен содержать минимум 3 вершины.");
      return;
    }
    regionMode = "idle";
    mapController?.setRegionDrawingMode?.(false);
    mapController?.setRegionDraft?.(regionDraftPoints);
    openRegionProperties("", { create: true });
  }

  function regionEditorHtml() {
    if (!isGM || !regionEditorMode) return "";
    if (regionEditorMode === "geometry") {
      const region = state.regions?.find((candidate) => candidate.id === editingRegionId);
      return `<div class="world-city-map-region-editor geometry" data-world-map-region-editor="geometry"><header><div><small>GM // ГРАНИЦА РЕГИОНА</small><h3>${esc(region?.name || "Регион")}</h3></div><button type="button" data-world-map-action="cancel-region-editor">×</button></header><p>Перетаскивайте вершины. ЛКМ по границе добавляет новую вершину, ПКМ по вершине удаляет её. Минимум — 3 вершины.</p><div class="world-city-map-region-vertex-count">Вершин: <b>${regionDraftPoints.length}</b></div><footer><button type="button" data-world-map-action="cancel-region-editor">Отмена</button><button type="button" class="primary" data-world-map-action="save-region-geometry">Сохранить границу</button></footer></div>`;
    }
    const region = regionEditorMode === "properties"
      ? state.regions?.find((candidate) => candidate.id === editingRegionId)
      : null;
    const draft = { ...(region ?? {
      name: "Новый регион", description: "", color: "#ef233c",
      fillOpacity: 0.22, borderOpacity: 0.9, borderWidth: 2,
    }), ...(districtProfile ? { name: districtProfile.name, description: districtProfile.description,
      threat: districtProfile.threat, districtId: districtProfile.id } : {}) };
    return `<div class="world-city-map-region-editor" data-world-map-region-editor="${esc(regionEditorMode)}"><header><div><small>GM // РЕГИОН</small><h3>${esc(draft.name || "Новый регион")}</h3></div><button type="button" data-world-map-action="cancel-region-editor">×</button></header><label class="wide"><span>Название</span><input data-world-map-region-field="name" value="${esc(draft.name || "")}"></label><label class="wide"><span>Короткое описание</span><textarea data-world-map-region-field="description" rows="3">${esc(draft.description || "")}</textarea></label><label><span>Цвет</span><input type="color" data-world-map-region-field="color" value="${esc(draft.color || "#ef233c")}"></label><label><span>Толщина границы</span><input type="number" min="1" max="8" step="1" data-world-map-region-field="borderWidth" value="${esc(draft.borderWidth ?? 2)}"></label><label><span>Прозрачность заливки</span><input type="range" min="0" max="100" step="1" data-world-map-region-field="fillOpacity" value="${Math.round((Number(draft.fillOpacity) || 0) * 100)}"><output data-world-map-region-output="fillOpacity">${Math.round((Number(draft.fillOpacity) || 0) * 100)}%</output></label><label><span>Прозрачность границы</span><input type="range" min="0" max="100" step="1" data-world-map-region-field="borderOpacity" value="${Math.round((Number(draft.borderOpacity) || 0) * 100)}"><output data-world-map-region-output="borderOpacity">${Math.round((Number(draft.borderOpacity) || 0) * 100)}%</output></label>${worldMapDistrictFieldsHtml(draft)}<footer>${region ? '<button type="button" class="danger" data-world-map-action="delete-region-editor">Удалить</button>' : ""}<button type="button" data-world-map-action="cancel-region-editor">Отмена</button><button type="button" class="primary" data-world-map-action="save-region-properties">Сохранить</button></footer></div>`;
  }

  function regionDetailHtml(region) {
    if (!region) return "";
    return `<article class="world-city-map-detail world-city-map-region-detail" style="--world-map-region-color:${esc(region.color || "#ef233c")}"><header><b class="world-city-map-region-swatch"></b><div><small>РЕГИОН</small><h3>${esc(region.name || "Без названия")}</h3></div>${isGM ? '<button type="button" data-world-map-action="edit-selected-region">✎</button>' : ""}</header>${region.description ? `<p>${esc(region.description).replaceAll("\n", "<br>")}</p>` : '<p class="muted">Описание не добавлено.</p>'}${worldMapDistrictDetailHtml(region, state.markers)}</article>`;
  }

  function renderCategories() {
    if (!categoriesEl) return;
    const recordsByKey = recordMap();
    categoriesEl.innerHTML = state.categories.map((category) => {
      const hidden = hiddenCategories.has(category.id);
      const categoryMarkers = state.markers.filter((marker) => marker.categoryId === category.id);
      const visibleCount = categoryMarkers.filter((marker) => !hidden && !hiddenMarkers.has(marker.id)).length;
      const hasHiddenPoints = categoryMarkers.some((marker) => hiddenMarkers.has(marker.id));
      const countLabel = hidden || hasHiddenPoints ? `${visibleCount}/${categoryMarkers.length}` : String(categoryMarkers.length);
      const deletable = isGM && !DEFAULT_CATEGORY_IDS.has(category.id);
      const controls = isGM
        ? `<span class="world-city-map-category-controls"><button type="button" data-world-map-edit-category="${esc(category.id)}" title="Изменить категорию"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>${deletable ? `<button type="button" data-world-map-delete-category="${esc(category.id)}" title="Удалить категорию"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}</span>`
        : "";
      const selected = category.id === selectedCategoryId;
      const expanded = expandedCategories.has(category.id);
      const visibilityTitle = hidden ? "Показать точки этой категории на карте" : "Отключить точки этой категории на карте";
      const visibilityIcon = hidden ? "fa-square" : "fa-square-check";
      const pointRows = expanded
        ? `<div class="world-city-map-category-points" data-world-map-category-points="${esc(category.id)}">${categoryMarkers.length ? categoryMarkers.map((marker) => {
            const pointHidden = hiddenMarkers.has(marker.id);
            const effectiveHidden = hidden || pointHidden;
            const linkSummary = markerLinkSummary(marker, recordsByKey);
            return `<div class="world-city-map-category-point ${effectiveHidden ? "map-off" : ""}" data-world-map-category-marker="${esc(marker.id)}" style="--world-map-marker-color:${esc(colorForMarker(state, marker))}"><button type="button" class="world-city-map-category-point-main" data-world-map-focus-marker="${esc(marker.id)}" title="Показать «${esc(marker.title)}» на карте">${worldMapIconHtml(iconForMarker(state, marker), { className: "world-city-map-category-point-icon" })}<span><b>${esc(marker.title || "Без названия")}</b>${linkSummary ? `<small>${esc(linkSummary)}</small>` : ""}</span></button><button type="button" class="world-city-map-category-point-visibility" data-world-map-toggle-marker="${esc(marker.id)}" title="${pointHidden ? "Показать эту точку на карте" : "Отключить эту точку на карте"}"><i class="fa-solid ${pointHidden ? "fa-square" : "fa-square-check"}" aria-hidden="true"></i></button></div>`;
          }).join("") : '<p class="world-city-map-category-empty">В этой категории пока нет точек.</p>'}</div>`
        : "";
      return `<div class="world-city-map-category ${hidden ? "map-off" : ""} ${selected ? "selected" : ""} ${expanded ? "expanded" : ""}" style="--world-map-category-color:${esc(category.color || "#f6c85f")}"><div class="world-city-map-category-main"><button type="button" class="world-city-map-category-expand" data-world-map-expand-category="${esc(category.id)}" title="${expanded ? "Свернуть список точек" : "Развернуть список точек"}"><i class="fa-solid ${expanded ? "fa-chevron-down" : "fa-chevron-right"}" aria-hidden="true"></i></button><button type="button" class="world-city-map-category-select" data-world-map-select-category="${esc(category.id)}" title="Выбрать категорию для новой точки"><span class="world-city-map-category-name">${worldMapIconHtml(category.icon, { className: "world-city-map-category-icon" })}<b class="world-city-map-category-label">${esc(category.label)}</b></span><i>${esc(countLabel)}</i></button><button type="button" class="world-city-map-category-visibility" data-world-map-toggle-category="${esc(category.id)}" title="${visibilityTitle}"><i class="fa-solid ${visibilityIcon}" aria-hidden="true"></i></button>${controls}</div>${pointRows}</div>`;
    }).join("");
  }

  function renderMarkers() {
    if (!mapController) return;
    const markers = visibleMarkers().map((marker) => ({
      ...marker,
      selected: marker.id === selectedMarkerId,
      html: markerButtonHtml(state, marker, marker.id === selectedMarkerId),
    }));
    markers.push(...(context.listServiceMarkers?.()||[]).map((marker) =>({...marker,html:`<button type="button" class="world-city-map-marker" data-city-rumor="${esc(marker.cityJobId)}" style="--world-map-marker-color:#74e8d4"><span>?</span><small>${esc(marker.title)}</small></button>`})));
    mapController.setMarkers(markers);
    mapController.setPositionMarkers?.(getWorldMapPositionMarkers(state));
  }


  function renderResults() {
    if (!resultsEl) return;
    const markers = visibleMarkers();
    resultsEl.innerHTML = markers.length
      ? markers.map((marker) => {
          const category = markerCategory(state, marker);
          const linkSummary = markerLinkSummary(marker, recordMap());
          return `<button type="button" class="world-city-map-result ${marker.id === selectedMarkerId ? "selected" : ""}" data-world-map-result="${esc(marker.id)}" style="--world-map-marker-color:${esc(colorForMarker(state, marker))}"><b>${worldMapIconHtml(iconForMarker(state, marker), { className: "world-city-map-result-icon" })}</b><span><strong>${esc(marker.title)}</strong><small>${esc(category.label)}${linkSummary ? ` · ${esc(linkSummary)}` : ""}</small></span></button>`;
        }).join("")
      : `<p class="world-city-map-no-results">Нет точек по текущему фильтру.</p>`;
  }

  function editorHtml(marker) {
    const records = catalog();
    const linked = new Set((marker.links ?? []).map(linkKey));
    const availableOptions = records.filter((record) => !linked.has(linkKey(record))).map((record) => `<option value="${esc(linkKey(record))}">${esc(recordLabel(record))}</option>`).join("");
    const linkedRows = (marker.links ?? []).map((link) => {
      const record = recordMap().get(linkKey(link));
      return `<div class="world-city-map-link-row"><span><b>${esc(recordTypeLabel(record || link))}</b><i>${esc(recordLinkLabel(record, link).replace(/^.*? — /u, ""))}</i></span><button type="button" data-world-map-unlink="${esc(linkKey(link))}" title="Удалить связь">×</button></div>`;
    }).join("") || '<p class="muted">Связей пока нет.</p>';
    const category = markerCategory(state, marker);
    return `<div class="world-city-map-editor" data-world-map-editor="${esc(marker.id)}"><header><div><small>GM // ТОЧКА ИНТЕРЕСА</small><h3>${esc(marker.title)}</h3></div><button type="button" data-world-map-action="close-editor">×</button></header><label><span>Название</span><input data-world-map-field="title" value="${esc(marker.title)}"></label><label><span>Категория</span><select data-world-map-field="categoryId">${state.categories.map((categoryItem) => `<option value="${esc(categoryItem.id)}" ${categoryItem.id === marker.categoryId ? "selected" : ""}>${esc(categoryItem.label)}</option>`).join("")}</select></label><label><span>Иконка</span>${iconPickerHtml({ target: "marker", value: marker.icon, inherit: true, effectiveIcon: category.icon })}</label><label><span>Цвет</span><span class="world-city-map-color-field"><input type="color" data-world-map-field="color" value="${esc(marker.color || category.color || "#f6c85f")}"><label><input type="checkbox" data-world-map-color-inherit ${marker.color ? "" : "checked"}> Цвет категории</label></span></label><label class="wide"><span>Описание</span><textarea data-world-map-field="description" rows="4">${esc(marker.description)}</textarea></label><section class="world-city-map-editor-links"><h4>Связанные записи</h4>${linkedRows}<div class="world-city-map-link-add"><select data-world-map-link-select><option value="">Выберите запись архива…</option>${availableOptions}</select><button type="button" data-world-map-action="add-link" ${availableOptions ? "" : "disabled"}>+ Связь</button></div></section><footer><button type="button" class="danger" data-world-map-action="delete-marker">Удалить</button><button type="button" class="primary" data-world-map-action="save-marker">Сохранить</button></footer></div>`;
  }

  function detailLinksForMarker(marker) {
    const merged = new Map();
    for (const link of Array.isArray(marker?.links) ? marker.links : []) merged.set(linkKey(link), link);
    if (activeActorId && marker?.id) {
      for (const personal of personalLinksForMarker({ actorId: activeActorId, markerId: marker.id })) {
        const link = { actorId: activeActorId, section: personal.section, entryId: personal.entryId };
        if (!merged.has(linkKey(link))) merged.set(linkKey(link), link);
      }
    }
    return [...merged.values()];
  }

  function detailHtml(marker) {
    if (!marker) return "";
    const category = markerCategory(state, marker);
    const detailLinks = detailLinksForMarker(marker);
    const collapsed = collapsedDetailLinks.has(marker.id);
    const detailLinksClass = collapsed ? "world-city-map-detail-links collapsed" : "world-city-map-detail-links";
    const links = detailLinks.map((link) => {
      const record = recordMap().get(linkKey(link));
      const label = recordLinkLabel(record, link);
      return `<button type="button" data-world-map-open-link="${esc(linkKey(link))}" title="Открыть связанную запись"><span><b>${esc(recordTypeLabel(record || link))}</b><i>${esc(label.replace(/^.*? — /u, ""))}</i></span><strong>→</strong></button>`;
    }).join("");
    const linkedBlock = links
      ? `<section class="world-city-map-detail-links-section"><button type="button" class="world-city-map-detail-links-toggle" data-world-map-action="toggle-detail-links" aria-expanded="${collapsed ? "false" : "true"}" title="${collapsed ? "Развернуть связанные записи" : "Свернуть связанные записи"}"><span>Связанные записи · ${detailLinks.length}</span><i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}" aria-hidden="true"></i></button><div class="${detailLinksClass}">${links}</div></section>`
      : "";
    return `<article class="world-city-map-detail" style="--world-map-marker-color:${esc(colorForMarker(state, marker))}"><header><b>${worldMapIconHtml(iconForMarker(state, marker), { className: "world-city-map-detail-icon" })}</b><div><small>${esc(category.label)}</small><h3>${esc(marker.title)}</h3></div>${isGM ? '<button type="button" data-world-map-action="edit-marker" title="Редактировать точку">✎</button>' : ""}<button type="button" class="world-city-map-detail-close" data-world-map-action="close-detail" title="Закрыть карточку" aria-label="Закрыть карточку">×</button></header>${worldMapMediaHtml(marker,{isGM})}<div class="city-dossier-actions"><button type="button" data-city-dossier-action="expand">Досье места</button>${isGM?'<button type="button" data-city-dossier-action="publish">Опубликовать карточку</button>':""}</div>${marker.description ? `<p>${esc(marker.description).replaceAll("\n", "<br>")}</p>` : '<p class="muted">Описание не добавлено.</p>'}${linkedBlock}<div class="city-dossier-actions"><button type="button" data-city-location-services="jobs">Заказы места</button><button type="button" data-city-location-services="shops">Торговля</button></div></article>`;
  }

  function closeMarkerDetail() {
    selectedMarkerId = "";
    editorMarkerId = "";
    renderResults();
    renderMarkers();
    renderInspector();
  }

  function renderInspector() {
    if (!inspector) return;
    if (cityCatalogOpen && isGM) {
      inspector.innerHTML = worldMapCityCatalogHtml(cityCatalogOptions());
      return;
    }
    if (regionEditorMode && isGM) {
      inspector.innerHTML = regionEditorHtml();
      return;
    }
    const marker = state.markers.find((item) => item.id === (editorMarkerId || selectedMarkerId));
    if (marker) {
      inspector.innerHTML = editorMarkerId && isGM ? editorHtml(marker) : detailHtml(marker);
      return;
    }
    const region = state.regions?.find((item) => item.id === selectedRegionId);
    inspector.innerHTML = region ? regionDetailHtml(region) : "";
  }

  function syncRegionControllerState() {
    if (!mapController) return;
    if (regionMode === "drawing") {
      mapController.setRegionDrawingMode?.(true, regionDraftPoints);
      return;
    }
    if (regionMode === "editing" && editingRegionId) {
      mapController.setRegionEditMode?.(editingRegionId, regionDraftPoints);
      return;
    }
    mapController.clearRegionDraft?.();
    if (regionEditorMode === "create" && regionDraftPoints.length >= 2) mapController.setRegionDraft?.(regionDraftPoints);
  }

  async function syncLeafletMap() {
    if (destroyed || !mapHost) return;
    const useCustomImage = state.backgroundMode === "image" && Boolean(state.image);
    const sourceKey = useCustomImage ? `image:${state.image}` : `tileset:${state.tileset || "night-city-2045"}`;

    if (mapController && mapSourceKey === sourceKey) {
      mapController.setPlacementMode(Boolean(placementMode || positionPick));
      renderMarkers();
      renderRegionsOnMap();
      syncRegionControllerState();
      return;
    }

    if(mapPendingKey){pendingMapSync=true;return;}
    mapPendingKey=sourceKey;pendingMapSync=false;
    const serial = ++mapInitSerial;
    mapController?.destroy?.();
    mapController = null;
    mapSourceKey = sourceKey;
    if (empty) empty.innerHTML = emptyHtml();

    try {
      const controller = await createWorldCityLeafletMap(mapHost, {
        image: useCustomImage ? state.image : "",
        isGM,
        groupMarkers,
        onMarkerClick(markerId) {
          if (destroyed) return;
          const service=(context.listServiceMarkers?.()||[]).find(
            (m) =>m.id===markerId);
          if(service){context.onServiceMarker?.(service);return;}
          selectedMarkerId = clean(markerId);
          editorMarkerId = "";
          renderResults();
          renderMarkers();
          renderInspector();
        },
        onMarkerDragEnd(markerId, point) {
          if (!isGM || destroyed || String(markerId).startsWith("city-job:")) return;
          void updateWorldMapMarker(markerId, point).then(() => {
            if (destroyed) return;
            selectedMarkerId = clean(markerId);
            editorMarkerId = "";
            refresh();
          }).catch((error) => {
            console.error("Cyberpunk Remaster | world map marker drag failed", error);
            globalThis.ui?.notifications?.error?.(`Не удалось переместить точку: ${error?.message || error}`);
          });
        },
        onMapClick(point) {
          if (destroyed) return;
          if (positionPick) { void placePositionAt(point); return; }
          if (!placementMode || !isGM) return;
          void createMarkerAt(point);
        },
        onRegionClick(regionId) {
          if (destroyed) return;
          selectedRegionId = clean(regionId);
          selectedMarkerId = "";
          editorMarkerId = "";
          regionEditorMode = "";
          renderRegions();
          renderMarkers();
          renderInspector();
        },
        onMapContextMenu(point, event, regionIds) {
          if (destroyed || regionMode === "drawing" || regionMode === "editing") return;
          showMapContextMenu(point, event, regionIds);
        },
        onRegionDraftPoint(point) {
          if (!isGM || destroyed || regionMode !== "drawing") return;
          const next = { x: clamp01(point?.x), y: clamp01(point?.y) };
          const last = regionDraftPoints.at(-1);
          if (!last || Math.abs(last.x - next.x) > 0.000001 || Math.abs(last.y - next.y) > 0.000001) regionDraftPoints.push(next);
          mapController?.setRegionDraft?.(regionDraftPoints);
          renderInspector();
        },
        onRegionDraftFinish() {
          if (!isGM || destroyed || regionMode !== "drawing") return;
          finishRegionDrawing();
        },
        onRegionVertexMove(index, point) {
          if (!isGM || destroyed || regionMode !== "editing") return;
          if (index < 0 || index >= regionDraftPoints.length) return;
          regionDraftPoints[index] = { x: clamp01(point?.x), y: clamp01(point?.y) };
          renderInspector();
        },
        onRegionEdgeInsert(index, point) {
          if (!isGM || destroyed || regionMode !== "editing") return;
          if (index < 1 || index > regionDraftPoints.length) return;
          regionDraftPoints.splice(index, 0, { x: clamp01(point?.x), y: clamp01(point?.y) });
          mapController?.setRegionDraft?.(regionDraftPoints);
          renderInspector();
        },
        onRegionVertexContextMenu(index) {
          if (!isGM || destroyed || regionMode !== "editing") return;
          if (regionDraftPoints.length <= 3) {
            globalThis.ui?.notifications?.error?.("У региона должно остаться минимум 3 вершины.");
            return;
          }
          if (index < 0 || index >= regionDraftPoints.length) return;
          regionDraftPoints.splice(index, 1);
          mapController?.setRegionDraft?.(regionDraftPoints);
          renderInspector();
        },
        onImageError() {
          if (!useCustomImage || !empty) return;
          empty.innerHTML = `<div class="world-city-map-empty"><b>!</b><h2>Не удалось открыть пользовательскую карту</h2><p>${esc(state.image)}</p>${isGM ? '<button type="button" data-world-map-action="clear-image">Вернуть встроенный тайловый атлас</button>' : ""}</div>`;
        },
      });

      if (destroyed || serial !== mapInitSerial) {
        controller.destroy();
        return;
      }

      mapController = controller;
      if (empty) empty.innerHTML = "";
      mapController.setPlacementMode(Boolean(placementMode || positionPick));
      renderMarkers();
      renderRegionsOnMap();
      syncRegionControllerState();
      if (selectedMarkerId) mapController.focusMarker(selectedMarkerId, { zoom: context.focusZoom });
      else if (selectedRegionId) mapController.focusRegion?.(selectedRegionId, { maxZoom: 5 });
    } catch (error) {
      if (destroyed || serial !== mapInitSerial) return;
      console.error("Cyberpunk Remaster | Leaflet world map initialization failed", error);
      if (empty) {
        empty.innerHTML = `<div class="world-city-map-empty"><b>!</b><h2>Не удалось запустить карту Найт-Сити</h2><p>${esc(error?.message || error)}</p>${isGM && state.image ? '<button type="button" data-world-map-action="clear-image">Вернуть встроенную карту</button>' : ""}</div>`;
      }
    } finally {
      mapPendingKey="";
      if(pendingMapSync&&!destroyed){pendingMapSync=false;void syncLeafletMap();}
    }
  }

  function refresh(nextState = null) {
    if (destroyed) return;
    state = nextState ? clone(nextState) : getWorldCityMap();
    titleEl && (titleEl.textContent = state.title || "Карта Найт-Сити");
    const modeText = positionPick ? "КЛИКНИТЕ ПО КАРТЕ — " + (positionPick === "party" ? "ПОЛОЖЕНИЕ ГРУППЫ" : "ПОЛОЖЕНИЕ ПЕРСОНАЖА")
      : pendingCatalogLocation ? "КЛИКНИТЕ ПО КАРТЕ — МЕСТО ИЗ КАТАЛОГА"
      : regionMode === "drawing"
      ? `РИСОВАНИЕ РЕГИОНА // ВЕРШИН: ${regionDraftPoints.length}`
      : regionMode === "editing"
        ? `РЕДАКТИРОВАНИЕ ГРАНИЦЫ // ВЕРШИН: ${regionDraftPoints.length}`
        : placementMode
          ? `КЛИКНИТЕ ПО КАРТЕ — ${categoryLabel(state, selectedCategoryId) || "НОВАЯ ТОЧКА"}`
          : isGM ? "GM // EDIT" : "VIEW";
    modeEl && (modeEl.textContent = modeText);
    if (drawingControls) drawingControls.hidden = regionMode !== "drawing";
    viewport?.classList?.toggle?.("placing", Boolean(placementMode || positionPick));
    viewport?.classList?.toggle?.("drawing-region", regionMode === "drawing");
    viewport?.classList?.toggle?.("editing-region", regionMode === "editing");
    const addMarkerButton = host.querySelector?.('[data-world-map-action="add-marker"]');
    if (addMarkerButton) {
      addMarkerButton.classList.toggle("active", placementMode);
      addMarkerButton.textContent = placementMode ? "× Отмена" : "+ Точка";
      addMarkerButton.title = placementMode ? "Отменить постановку точки" : `Поставить точку категории «${categoryLabel(state, selectedCategoryId) || "Интерес"}»`;
    }
    shell?.classList?.toggle?.("sidebar-collapsed", sidebarCollapsed);
    if (sidebarToggle) {
      sidebarToggle.title = sidebarCollapsed ? "Развернуть панель карты" : "Свернуть панель карты";
      sidebarToggle.innerHTML = `<i class="fa-solid ${sidebarCollapsed ? "fa-angles-right" : "fa-angles-left"}" aria-hidden="true"></i>`;
    }
    gmSection?.classList?.toggle?.("collapsed", gmPanelCollapsed);
    gmToggle?.setAttribute?.("title", gmPanelCollapsed ? "Развернуть блок GM" : "Свернуть блок GM");
    if (gmToggle) gmToggle.innerHTML = `<i class="fa-solid ${gmPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}" aria-hidden="true"></i>`;
    if (interestCountEl) interestCountEl.textContent = String(state.markers?.length ?? 0);
    interestPanel?.classList?.toggle?.("collapsed", interestPanelCollapsed);
    if (interestToggle) {
      interestToggle.title = interestPanelCollapsed ? "Развернуть точки интереса" : "Свернуть точки интереса";
      const chevron = interestToggle.querySelector?.("[data-world-map-interest-chevron]");
      if (chevron) chevron.className = `fa-solid ${interestPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
    }
    regionsPanel?.classList?.toggle?.("collapsed", regionsPanelCollapsed);
    if (regionsToggle) {
      regionsToggle.title = regionsPanelCollapsed ? "Развернуть регионы" : "Свернуть регионы";
      const chevron = regionsToggle.querySelector?.("[data-world-map-regions-chevron]");
      if (chevron) chevron.className = `fa-solid ${regionsPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
    }
    renderCategories();
    renderRegions();
    renderResults();
    renderMarkers();
    renderRegionsOnMap();
    renderInspector();
    renderCityPositions();
    mapController?.setPlacementMode?.(Boolean(placementMode || positionPick));
    syncRegionControllerState();
    void syncLeafletMap();
  }

  async function createMarkerAt(point, { requirePlacement = true } = {}) {
    if (!isGM || (requirePlacement && !placementMode)) return null;
    const categoryId = state.categories.some((category) => category.id === selectedCategoryId) ? selectedCategoryId : "poi";
    try {
      const fromCatalog = Boolean(pendingCatalogLocation);
      const marker = pendingCatalogLocation
        ? await placeWorldMapCatalogLocation(pendingCatalogLocation, point)
        : await createWorldMapMarker({ x: point?.x, y: point?.y, title: "Новая точка", categoryId });
      pendingCatalogLocation = "";
      if (!marker?.id) throw new Error("Маркер не был создан");
      if (fromCatalog) revealCityMarker(marker);
      placementMode = false;
      selectedMarkerId = marker.id;
      editorMarkerId = marker.id;
      selectedRegionId = "";
      regionEditorMode = "";
      refresh();
      return marker;
    } catch (error) {
      console.error("Cyberpunk Remaster | world map marker creation failed", error);
      globalThis.ui?.notifications?.error?.(`Не удалось создать точку на карте: ${error?.message || error}`);
      refresh();
      return null;
    }
  }

  function revealCityMarker(marker) {
    hiddenCategories.delete(marker.categoryId);
    hiddenMarkers.delete(marker.id);
    saveHiddenCategories(hiddenCategories);
    saveHiddenMarkers(hiddenMarkers);
    query = "";
    const input = host.querySelector("[data-world-map-search]");
    if (input) input.value = "";
  }


  function focusMarkerFromFilter(markerId) {
    return (
      mapController?.focusMarker?.(markerId, { zoom: WORLD_MAP_ARCHIVE_FOCUS_ZOOM }) ?? false
    );
  }

  function findVisibleMarkerByQuery(searchText) {
    const normalizedQuery = clean(searchText).toLocaleLowerCase("ru");
    if (!normalizedQuery) return null;
    const markers = visibleMarkers();
    const exact = markers.find((marker) => {
      const normalizedTitle = clean(marker?.title).toLocaleLowerCase("ru");
      return normalizedTitle === normalizedQuery;
    });
    return exact ?? markers.find((marker) => {
      const normalizedTitle = clean(marker?.title).toLocaleLowerCase("ru");
      return normalizedTitle.includes(normalizedQuery);
    }) ?? null;
  }

  function executeMapSearch() {
    const searchInput = host.querySelector?.("[data-world-map-search]");
    const searchText = clean(searchInput?.value ?? query);
    if (!searchText) return false;
    query = searchText;
    const marker = findVisibleMarkerByQuery(searchText);
    if (!marker) {
      globalThis.ui?.notifications?.warn?.("Точка не найдена");
      return false;
    }
    selectedMarkerId = marker.id;
    editorMarkerId = "";
    selectedRegionId = "";
    regionEditorMode = "";
    renderResults();
    renderRegions();
    renderMarkers();
    renderInspector();
    focusMarkerFromFilter(marker.id);
    return true;
  }


  host.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-city-catalog-search]")) {
      cityCatalogQuery = event.target.value;
      const list = inspector?.querySelector("[data-city-catalog-list]");
      if (list) list.innerHTML = worldMapCityCatalogRows(cityCatalogOptions());
      return;
    }
    if (event.target.matches?.("[data-world-map-group-points]")) {
      groupMarkers = !!event.target.checked;
      saveClientFlag(MARKER_GROUPS_KEY, groupMarkers);
      mapController?.setMarkerGrouping?.(groupMarkers);
      return;
    }
    if (event.target.matches?.("[data-world-map-marker-opacity]")) {
      applyMarkerOpacity((Number(event.target.value) || 70) / 100, { persist: true });
      return;
    }
    if (event.target.matches?.('[data-world-map-region-field="fillOpacity"], [data-world-map-region-field="borderOpacity"]')) {
      const key = event.target.dataset.worldMapRegionField;
      const output = inspector?.querySelector?.(`[data-world-map-region-output="${key}"]`);
      if (output) output.textContent = `${Math.round(Number(event.target.value) || 0)}%`;
      return;
    }
    if (event.target.matches?.("[data-world-map-search]")) {
      query = event.target.value;
      renderResults();
      renderMarkers();
      return;
    }
    if (event.target.matches?.('[data-world-map-field="color"]')) {
      const editor = event.target.closest?.("[data-world-map-editor]");
      const inherit = editor?.querySelector?.("[data-world-map-color-inherit]");
      if (inherit) inherit.checked = false;
    }
  }, { signal: domEvents.signal });

  host.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.matches?.("[data-city-position-focus]")) {
      const point = getWorldMapPositionMarkers(state).find((position) => position.id === target.value);
      if (point) mapController?.focusPoint?.(point);
      return;
    }
    if (target.matches?.("[data-city-actor-shared]")) {
      actorPositionShared = target.checked;
      const point = getWorldMapActorPosition(activeActorId);
      if (point) try { await setWorldMapActorPosition(activeActorId, { ...point, shared: actorPositionShared }); } catch (error) { cityError(error); }
      renderCityPositions();
      return;
    }
    if (target.matches?.("[data-city-party-visible]") && isGM) {
      partyPositionVisible = target.checked;
      if (state.partyPosition) try { await setWorldMapPartyPosition({ ...state.partyPosition, visible: partyPositionVisible }); } catch (error) { cityError(error); }
      refresh();
      return;
    }
    if (target.matches?.("[data-world-map-points-import]")) {
      const file = target.files?.[0];
      target.value = "";
      if (!file || !isGM) return;
      try {
        const payload = JSON.parse(await file.text());
        const result = await importWorldMapPointsPayload(payload);
        refresh();
        const remapped = result.remappedMarkerIds ? `, новых ID: ${result.remappedMarkerIds}` : "";
        globalThis.ui?.notifications?.info?.(`Импортировано точек: ${result.importedMarkers}, категорий: ${result.addedCategories}${remapped}.`);
      } catch (error) {
        console.error("Cyberpunk Remaster | world map points import failed", error);
        globalThis.ui?.notifications?.error?.(`Импорт точек не выполнен: ${error?.message || error}`);
      }
      return;
    }
    if (target.matches?.('[data-world-map-field="categoryId"]')) {
      const category = state.categories.find((item) => item.id === target.value);
      const picker = inspector?.querySelector?.('[data-world-map-icon-picker="marker"]');
      const iconInput = picker?.querySelector?.('[data-world-map-field="icon"]');
      const editor = inspector?.querySelector?.("[data-world-map-editor]");
      const inheritColor = editor?.querySelector?.("[data-world-map-color-inherit]");
      const colorInput = editor?.querySelector?.('[data-world-map-field="color"]');
      if (picker && category) {
        picker.dataset.worldMapEffectiveIcon = category.icon || "fa:fa-location-dot";
        if (!clean(iconInput?.value)) setIconPickerValue(picker, "", { effectiveIcon: category.icon });
      }
      if (category && inheritColor?.checked && colorInput) colorInput.value = category.color || "#f6c85f";
      return;
    }
    if (target.matches?.("[data-world-map-color-inherit]")) {
      const editor = target.closest?.("[data-world-map-editor]");
      const categoryId = editor?.querySelector?.('[data-world-map-field="categoryId"]')?.value;
      const category = state.categories.find((item) => item.id === categoryId);
      const colorInput = editor?.querySelector?.('[data-world-map-field="color"]');
      if (target.checked && colorInput) colorInput.value = category?.color || "#f6c85f";
    }
  }, { signal: domEvents.signal });

  host.addEventListener("click", async (event) => {
    const contextRegion = event.target.closest?.("[data-world-map-context-region]");
    if (contextRegion) {
      const id = clean(contextRegion.dataset.worldMapContextRegion);
      if (contextMenuEl && state.regions?.some((region) => region.id === id)) {
        contextMenuEl.innerHTML = regionActionsHtml(id);
        contextMenuEl.hidden = false;
      }
      return;
    }

    const contextAction = event.target.closest?.("[data-world-map-context-action]");
    if (contextAction) {
      const action = clean(contextAction.dataset.worldMapContextAction);
      const regionId = clean(contextAction.dataset.regionId);
      if (action === "close-context") { hideContextMenu(); return; }
      if (action === "add-marker-here" && isGM && contextMenuPoint) {
        const point = clone(contextMenuPoint);
        hideContextMenu();
        await createMarkerAt(point, { requirePlacement: false });
        return;
      }
      if (action === "draw-region" && isGM) { startRegionDrawing(); return; }
      if (action === "focus-region" && regionId) {
        selectedRegionId = regionId;
        selectedMarkerId = "";
        editorMarkerId = "";
        regionEditorMode = "";
        hideContextMenu();
        renderRegions(); renderMarkers(); renderInspector(); centerRegion(regionId);
        return;
      }
      if (action === "edit-region-properties" && isGM && regionId) { hideContextMenu(); openRegionProperties(regionId); return; }
      if (action === "edit-region-geometry" && isGM && regionId) { hideContextMenu(); startRegionGeometryEdit(regionId); return; }
      if (action === "region-front" && isGM && regionId) { hideContextMenu(); await moveWorldMapRegionToFront(regionId); refresh(); return; }
      if (action === "region-back" && isGM && regionId) { hideContextMenu(); await moveWorldMapRegionToBack(regionId); refresh(); return; }
      if (action === "region-global-toggle" && isGM && regionId) {
        const region = state.regions?.find((candidate) => candidate.id === regionId);
        hideContextMenu();
        if (region) await updateWorldMapRegion(regionId, { visible: region.visible === false });
        refresh();
        return;
      }
      if (action === "delete-region" && isGM && regionId) {
        const region = state.regions?.find((candidate) => candidate.id === regionId);
        hideContextMenu();
        if (region && globalThis.confirm?.(`Удалить регион «${region.name || "Без названия"}»?`)) {
          await deleteWorldMapRegion(regionId);
          if (selectedRegionId === regionId) selectedRegionId = "";
          refresh();
        }
        return;
      }
    }

    const regionFocus = event.target.closest?.("[data-world-map-focus-region]");
    if (regionFocus) {
      const id = clean(regionFocus.dataset.worldMapFocusRegion);
      if (state.regions?.some((region) => region.id === id)) {
        selectedRegionId = id;
        selectedMarkerId = "";
        editorMarkerId = "";
        regionEditorMode = "";
        hiddenRegions.delete(id);
        saveHiddenRegions(hiddenRegions);
        renderRegions(); renderMarkers(); renderRegionsOnMap(); renderInspector(); centerRegion(id);
      }
      return;
    }

    const regionToggle = event.target.closest?.("[data-world-map-toggle-region]");
    if (regionToggle) {
      const id = clean(regionToggle.dataset.worldMapToggleRegion);
      if (isGM) {
        const region = state.regions?.find((candidate) => candidate.id === id);
        if (region) await updateWorldMapRegion(id, { visible: region.visible === false });
        refresh();
      } else {
        if (hiddenRegions.has(id)) hiddenRegions.delete(id); else hiddenRegions.add(id);
        saveHiddenRegions(hiddenRegions);
        renderRegions();
        renderRegionsOnMap();
      }
      return;
    }

    const regionEdit = event.target.closest?.("[data-world-map-edit-region]");
    if (regionEdit && isGM) { openRegionProperties(clean(regionEdit.dataset.worldMapEditRegion)); return; }

    const regionDelete = event.target.closest?.("[data-world-map-delete-region]");
    if (regionDelete && isGM) {
      const id = clean(regionDelete.dataset.worldMapDeleteRegion);
      const region = state.regions?.find((candidate) => candidate.id === id);
      if (region && globalThis.confirm?.(`Удалить регион «${region.name || "Без названия"}»?`)) {
        await deleteWorldMapRegion(id);
        if (selectedRegionId === id) selectedRegionId = "";
        refresh();
      }
      return;
    }

    if (contextMenuEl && !contextMenuEl.hidden && !event.target.closest?.("[data-world-map-context-menu]")) hideContextMenu();

    const iconTrigger = event.target.closest?.("[data-world-map-icon-trigger]");
    if (iconTrigger) {
      const picker = iconTrigger.closest?.("[data-world-map-icon-picker]");
      const grid = picker?.querySelector?.("[data-world-map-icon-grid]");
      for (const other of host.querySelectorAll?.("[data-world-map-icon-grid]") ?? []) {
        if (other !== grid) other.hidden = true;
      }
      if (grid) grid.hidden = !grid.hidden;
      return;
    }
    const iconChoice = event.target.closest?.("[data-world-map-icon-choice]");
    if (iconChoice) {
      const picker = iconChoice.closest?.("[data-world-map-icon-picker]");
      setIconPickerValue(picker, iconChoice.dataset.worldMapIconChoice ?? "");
      const grid = picker?.querySelector?.("[data-world-map-icon-grid]");
      if (grid) grid.hidden = true;
      return;
    }
    const expandCategory = event.target.closest?.("[data-world-map-expand-category]");
    if (expandCategory) {
      const id = clean(expandCategory.dataset.worldMapExpandCategory);
      if (expandedCategories.has(id)) expandedCategories.delete(id); else expandedCategories.add(id);
      renderCategories();
      return;
    }
    const markerVisibility = event.target.closest?.("[data-world-map-toggle-marker]");
    if (markerVisibility) {
      const id = clean(markerVisibility.dataset.worldMapToggleMarker);
      if (hiddenMarkers.has(id)) hiddenMarkers.delete(id); else hiddenMarkers.add(id);
      saveHiddenMarkers(hiddenMarkers);
      renderCategories();
      renderResults();
      renderMarkers();
      if (selectedMarkerId === id) renderInspector();
      return;
    }
    const markerFocus = event.target.closest?.("[data-world-map-focus-marker]");
    if (markerFocus) {
      const id = clean(markerFocus.dataset.worldMapFocusMarker);
      const marker = state.markers.find((item) => item.id === id);
      if (marker) {
        hiddenCategories.delete(marker.categoryId);
        hiddenMarkers.delete(id);
        saveHiddenCategories(hiddenCategories);
        saveHiddenMarkers(hiddenMarkers);
        selectedMarkerId = id;
        editorMarkerId = "";
        selectedRegionId = "";
        regionEditorMode = "";
        renderCategories(); renderRegions(); renderResults(); renderMarkers(); renderInspector(); focusMarkerFromFilter(id);
      }
      return;
    }
    const categorySelect = event.target.closest?.("[data-world-map-select-category]");
    if (categorySelect) {
      const id = clean(categorySelect.dataset.worldMapSelectCategory);
      if (state.categories.some((category) => category.id === id)) {
        selectedCategoryId = id;
        hiddenCategories.delete(id);
        saveHiddenCategories(hiddenCategories);
        renderCategories();
        renderResults();
        renderMarkers();
      }
      return;
    }
    const categoryToggle = event.target.closest?.("[data-world-map-toggle-category]");
    if (categoryToggle) {
      const id = clean(categoryToggle.dataset.worldMapToggleCategory);
      if (hiddenCategories.has(id)) hiddenCategories.delete(id); else hiddenCategories.add(id);
      saveHiddenCategories(hiddenCategories);
      renderCategories();
      renderResults();
      renderMarkers();
      return;
    }
    const resultButton = event.target.closest?.("[data-world-map-result]");
    if (resultButton) {
      selectedMarkerId = resultButton.dataset.worldMapResult;
      editorMarkerId = "";
      selectedRegionId = "";
      regionEditorMode = "";
      renderResults(); renderRegions(); renderMarkers(); renderInspector(); centerMarker(selectedMarkerId);
      return;
    }
    const openLink = event.target.closest?.("[data-world-map-open-link]");
    if (openLink) {
      const link = parseLinkKey(openLink.dataset.worldMapOpenLink);
      if (link) await context.openArchiveLink?.(link);
      return;
    }
    const unlink = event.target.closest?.("[data-world-map-unlink]");
    if (unlink && isGM && editorMarkerId) {
      const link = parseLinkKey(unlink.dataset.worldMapUnlink);
      if (link) await unlinkMarkerFromArchiveEntry(editorMarkerId, link);
      refresh();
      return;
    }
    const editCategory = event.target.closest?.("[data-world-map-edit-category]");
    if (editCategory && isGM) {
      const category = state.categories.find((item) => item.id === editCategory.dataset.worldMapEditCategory);
      if (category) {
        categoryEditId = category.id;
        const labelInput = host.querySelector?.("[data-world-map-new-category-label]");
        const iconInput = host.querySelector?.("[data-world-map-new-category-icon]");
        const colorInput = host.querySelector?.("[data-world-map-new-category-color]");
        const editingLabel = host.querySelector?.("[data-world-map-category-editing]");
        if (labelInput) labelInput.value = category.label;
        if (iconInput) iconInput.value = category.icon;
        setIconPickerValue(host.querySelector?.('[data-world-map-icon-picker="category"]'), category.icon);
        if (colorInput) colorInput.value = category.color || "#f6c85f";
        if (editingLabel) editingLabel.textContent = `Редактирование: ${category.label}`;
      }
      return;
    }
    const deleteCategory = event.target.closest?.("[data-world-map-delete-category]");
    if (deleteCategory && isGM) {
      const id = deleteCategory.dataset.worldMapDeleteCategory;
      if (globalThis.confirm?.(`Удалить категорию «${categoryLabel(state, id)}»?`)) await deleteWorldMapCategory(id);
      refresh();
      return;
    }
    const catalogLocation = event.target.closest?.("[data-city-catalog-location]");
    if (catalogLocation && isGM) {
      const id = catalogLocation.dataset.cityCatalogLocation;
      const placed = state.markers.find((marker) => marker.catalogId === `ncm:${id}`);
      cityCatalogOpen = false;
      positionPick = "";
      if (placed) {
        revealCityMarker(placed);
        selectedRegionId = ""; regionEditorMode = "";
        selectedMarkerId = placed.id; editorMarkerId = ""; refresh(); centerMarker(placed.id);
      } else {
        if (regionMode !== "idle" || regionEditorMode) cancelRegionWork();
        pendingCatalogLocation = id; placementMode = true;
        selectedMarkerId = ""; editorMarkerId = ""; selectedRegionId = "";
        refresh();
      }
      return;
    }
    const catalogDistrict = event.target.closest?.("[data-city-catalog-district]");
    if (catalogDistrict && isGM) {
      const profile = NIGHT_CITY_DISTRICTS.find((district) => district.id === catalogDistrict.dataset.cityCatalogDistrict);
      if (profile) {
        if (selectedRegionId) { openRegionProperties(selectedRegionId, { profile }); refresh(); }
        else startRegionDrawing(profile);
      }
      return;
    }
    const button = event.target.closest?.("[data-world-map-action]");
    if (!button) return;
    const action = button.dataset.worldMapAction;
    if (action === "city-catalog" && isGM) {
      if (regionMode !== "idle" || regionEditorMode) cancelRegionWork();
      cityCatalogOpen = true; positionPick = ""; placementMode = false; pendingCatalogLocation = "";
      refresh(); return;
    }
    if (action === "close-city-catalog") { cityCatalogOpen = false; renderInspector(); return; }
    if ((action === "catalog-locations" || action === "catalog-districts") && isGM) {
      cityCatalogTab = action === "catalog-districts" ? "districts" : "locations";
      renderInspector(); return;
    }
    if (action === "pick-party-position" || action === "pick-actor-position") {
      if (action === "pick-party-position" && !isGM) return;
      const mode = action === "pick-party-position" ? "party" : "actor";
      if (regionMode !== "idle" || regionEditorMode) cancelRegionWork();
      positionPick = positionPick === mode ? "" : mode;
      actorPositionShared = getWorldMapActorPosition(activeActorId)?.shared ?? actorPositionShared;
      partyPositionVisible = state.partyPosition?.visible ?? partyPositionVisible;
      cityCatalogOpen = false; pendingCatalogLocation = ""; placementMode = false;
      refresh(); return;
    }
    if (action === "clear-party-position" || action === "clear-actor-position") {
      try {
        if (action === "clear-party-position") await setWorldMapPartyPosition(null);
        else await setWorldMapActorPosition(activeActorId, null);
      } catch (error) { cityError(error); }
      positionPick = ""; refresh(); return;
    }
    if (action === "find-search-marker") {
      executeMapSearch();
      return;
    }
    if (action === "toggle-sidebar") {
      sidebarCollapsed = !sidebarCollapsed;
      saveClientFlag(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
      refresh();
      setTimeout(() => mapController?.invalidateSize?.(), 0);
      return;
    }
    if (action === "toggle-interest-panel") {
      interestPanelCollapsed = !interestPanelCollapsed;
      saveClientFlag(INTEREST_PANEL_COLLAPSED_KEY, interestPanelCollapsed);
      interestPanel?.classList?.toggle?.("collapsed", interestPanelCollapsed);
      if (interestToggle) {
        interestToggle.title = interestPanelCollapsed ? "Развернуть точки интереса" : "Свернуть точки интереса";
        const chevron = interestToggle.querySelector?.("[data-world-map-interest-chevron]");
        if (chevron) chevron.className = `fa-solid ${interestPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
      }
      return;
    }
    if (action === "toggle-regions-panel") {
      regionsPanelCollapsed = !regionsPanelCollapsed;
      saveClientFlag(REGION_PANEL_COLLAPSED_KEY, regionsPanelCollapsed);
      regionsPanel?.classList?.toggle?.("collapsed", regionsPanelCollapsed);
      if (regionsToggle) {
        regionsToggle.title = regionsPanelCollapsed ? "Развернуть регионы" : "Свернуть регионы";
        const chevron = regionsToggle.querySelector?.("[data-world-map-regions-chevron]");
        if (chevron) chevron.className = `fa-solid ${regionsPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
      }
      return;
    }
    if (action === "toggle-gm" && isGM) {
      gmSection?.classList?.toggle?.("collapsed");
      gmPanelCollapsed = Boolean(gmSection?.classList?.contains?.("collapsed"));
      saveClientFlag(GM_PANEL_COLLAPSED_KEY, gmPanelCollapsed);
      if (gmToggle) {
        gmToggle.title = gmPanelCollapsed ? "Развернуть блок GM" : "Свернуть блок GM";
        gmToggle.innerHTML = `<i class="fa-solid ${gmPanelCollapsed ? "fa-chevron-down" : "fa-chevron-up"}" aria-hidden="true"></i>`;
      }
      return;
    }
    if (action === "zoom-in") { mapController?.zoomIn?.(); return; }
    if (action === "zoom-out") { mapController?.zoomOut?.(); return; }
    if (action === "reset-view") { fitMap(); return; }
    if (action === "finish-region-drawing" && isGM) { finishRegionDrawing(); return; }
    if (action === "cancel-region-drawing" && isGM) { cancelRegionWork(); return; }
    if (action === "edit-selected-region" && isGM && selectedRegionId) { openRegionProperties(selectedRegionId); return; }
    if (action === "cancel-region-editor" && isGM) { cancelRegionWork(); return; }
    if (action === "save-region-properties" && isGM && regionEditorMode) {
      const editor = inspector?.querySelector?.("[data-world-map-region-editor]");
      const fieldValue = (name) => editor?.querySelector?.(`[data-world-map-region-field="${name}"]`)?.value;
      const name = clean(fieldValue("name"));
      if (!name) {
        globalThis.ui?.notifications?.error?.("Название региона не может быть пустым.");
        return;
      }
      const patch = {
        name,
        description: clean(fieldValue("description")),
        districtId: clean(fieldValue("districtId")),
        threat: clean(fieldValue("threat")),
        controller: clean(fieldValue("controller")),
        services: clean(fieldValue("services")),
        color: clean(fieldValue("color")) || "#ef233c",
        fillOpacity: Math.max(0, Math.min(1, (Number(fieldValue("fillOpacity")) || 0) / 100)),
        borderOpacity: Math.max(0, Math.min(1, (Number(fieldValue("borderOpacity")) || 0) / 100)),
        borderWidth: Math.max(1, Math.min(8, Number(fieldValue("borderWidth")) || 2)),
      };
      try {
        let saved;
        if (regionEditorMode === "create") {
          if (regionDraftPoints.length < 3) throw new Error("Регион должен содержать минимум 3 вершины.");
          saved = await createWorldMapRegion({ ...patch, points: clone(regionDraftPoints) });
        } else if (regionEditorMode === "properties" && editingRegionId) {
          saved = await updateWorldMapRegion(editingRegionId, patch);
        }
        if (saved?.id) selectedRegionId = saved.id;
        regionMode = "idle";
        regionEditorMode = "";
        editingRegionId = "";
        regionDraftPoints = [];
        mapController?.clearRegionDraft?.();
        refresh();
        if (selectedRegionId) centerRegion(selectedRegionId);
      } catch (error) {
        console.error("Cyberpunk Remaster | world map region save failed", error);
        globalThis.ui?.notifications?.error?.(`Не удалось сохранить регион: ${error?.message || error}`);
      }
      return;
    }
    if (action === "save-region-geometry" && isGM && regionEditorMode === "geometry" && editingRegionId) {
      if (regionDraftPoints.length < 3) {
        globalThis.ui?.notifications?.error?.("Регион должен содержать минимум 3 вершины.");
        return;
      }
      try {
        await updateWorldMapRegion(editingRegionId, { points: clone(regionDraftPoints) });
        selectedRegionId = editingRegionId;
        regionMode = "idle";
        regionEditorMode = "";
        editingRegionId = "";
        regionDraftPoints = [];
        mapController?.clearRegionDraft?.();
        refresh();
      } catch (error) {
        console.error("Cyberpunk Remaster | world map region geometry save failed", error);
        globalThis.ui?.notifications?.error?.(`Не удалось сохранить границу: ${error?.message || error}`);
      }
      return;
    }
    if (action === "delete-region-editor" && isGM && editingRegionId) {
      const region = state.regions?.find((candidate) => candidate.id === editingRegionId);
      if (region && globalThis.confirm?.(`Удалить регион «${region.name || "Без названия"}»?`)) {
        await deleteWorldMapRegion(editingRegionId);
        selectedRegionId = "";
        regionMode = "idle";
        regionEditorMode = "";
        editingRegionId = "";
        regionDraftPoints = [];
        mapController?.clearRegionDraft?.();
        refresh();
      }
      return;
    }
    if (action === "show-all-categories") {
      hiddenCategories.clear();
      hiddenMarkers.clear();
      hiddenRegions.clear();
      saveHiddenCategories(hiddenCategories);
      saveHiddenMarkers(hiddenMarkers);
      saveHiddenRegions(hiddenRegions);
      renderCategories();
      renderRegions();
      renderResults();
      renderMarkers();
      renderRegionsOnMap();
      return;
    }
    if (action === "hide-all-categories") {
      hiddenCategories.clear();
      for (const category of state.categories ?? []) {
        hiddenCategories.add(category.id);
      }
      hiddenMarkers.clear();
      hiddenRegions.clear();
      saveHiddenCategories(hiddenCategories);
      saveHiddenMarkers(hiddenMarkers);
      saveHiddenRegions(hiddenRegions);
      renderCategories();
      renderRegions();
      renderResults();
      renderMarkers();
      renderRegionsOnMap();
      return;
    }
    if (action === "add-marker" && isGM) {
      pendingCatalogLocation = ""; positionPick = ""; cityCatalogOpen = false;
      if (regionMode !== "idle" || regionEditorMode) {
        regionMode = "idle";
        regionEditorMode = "";
        editingRegionId = "";
        regionDraftPoints = [];
        mapController?.clearRegionDraft?.();
      }
      placementMode = !placementMode;
      if (placementMode) {
        hiddenCategories.delete(selectedCategoryId);
        saveHiddenCategories(hiddenCategories);
      }
      refresh();
      return;
    }
    if (action === "pick-image" && isGM) {
      await pickImage(state.image, async (path) => { if (path) { await setWorldMapImage(path); refresh(); } });
      return;
    }
    if (action === "clear-image" && isGM) {
      if (globalThis.confirm?.("Вернуться к встроенному тайловому атласу Найт-Сити? Точки интереса сохранятся.")) { await useBuiltInWorldMapTiles(); refresh(); }
      return;
    }
    if (action === "export-points" && isGM) {
      try {
        const payload = createWorldMapPointsExport(state, { worldId: globalThis.game?.world?.id ?? "" });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `night-city-map-points-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        globalThis.ui?.notifications?.info?.(`Экспортировано точек: ${payload.markers.length}.`);
      } catch (error) {
        console.error("Cyberpunk Remaster | world map points export failed", error);
        globalThis.ui?.notifications?.error?.(`Экспорт точек не выполнен: ${error?.message || error}`);
      }
      return;
    }
    if (action === "import-points" && isGM) {
      host.querySelector?.("[data-world-map-points-import]")?.click?.();
      return;
    }
    if (action === "toggle-detail-links" && selectedMarkerId) {
      if (collapsedDetailLinks.has(selectedMarkerId)) collapsedDetailLinks.delete(selectedMarkerId);
      else collapsedDetailLinks.add(selectedMarkerId);
      saveCollapsedDetailLinks(collapsedDetailLinks);
      renderInspector();
      return;
    }
    if (action === "edit-marker" && isGM && selectedMarkerId) { selectedRegionId = ""; regionEditorMode = ""; editorMarkerId = selectedMarkerId; renderInspector(); return; }
    if (action === "close-detail") { closeMarkerDetail(); return; }
    if (action === "close-editor") { editorMarkerId = ""; renderInspector(); return; }
    if (action === "save-marker" && isGM && editorMarkerId) {
      const editor = inspector.querySelector?.("[data-world-map-editor]");
      const patch = {};
      for (const field of editor?.querySelectorAll?.("[data-world-map-field]") ?? []) patch[field.dataset.worldMapField] = field.value;
      if (editor?.querySelector?.("[data-world-map-color-inherit]")?.checked) patch.color = "";
      await updateWorldMapMarker(editorMarkerId, patch);
      editorMarkerId = ""; refresh(); return;
    }
    if (action === "delete-marker" && isGM && editorMarkerId) {
      const marker = state.markers.find((item) => item.id === editorMarkerId);
      if (globalThis.confirm?.(`Удалить точку «${marker?.title || "Без названия"}»?`)) {
        await deleteWorldMapMarker(editorMarkerId);
        selectedMarkerId = ""; editorMarkerId = ""; refresh();
      }
      return;
    }
    if (action === "add-link" && isGM && editorMarkerId) {
      const select = inspector.querySelector?.("[data-world-map-link-select]");
      const link = parseLinkKey(select?.value);
      if (link) await linkMarkerToArchiveEntry(editorMarkerId, link);
      refresh(); return;
    }
    if (action === "add-category" && isGM) {
      const labelInput = host.querySelector?.("[data-world-map-new-category-label]");
      const iconInput = host.querySelector?.("[data-world-map-new-category-icon]");
      const colorInput = host.querySelector?.("[data-world-map-new-category-color]");
      const editingLabel = host.querySelector?.("[data-world-map-category-editing]");
      const label = clean(labelInput?.value);
      if (!label) return;
      const id = categoryEditId || label.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "") || `cat-${Date.now().toString(36)}`;
      await upsertWorldMapCategory({ id, label, icon: clean(iconInput?.value) || "fa:fa-location-dot", color: clean(colorInput?.value) || "#f6c85f" });
      categoryEditId = "";
      if (labelInput) labelInput.value = "";
      if (iconInput) iconInput.value = "fa:fa-location-dot";
      setIconPickerValue(host.querySelector?.('[data-world-map-icon-picker="category"]'), "fa:fa-location-dot");
      if (colorInput) colorInput.value = "#f6c85f";
      if (editingLabel) editingLabel.textContent = "Новая категория";
      refresh();
      return;
    }
    if (action === "cancel-category-edit" && isGM) {
      categoryEditId = "";
      const labelInput = host.querySelector?.("[data-world-map-new-category-label]");
      const iconInput = host.querySelector?.("[data-world-map-new-category-icon]");
      const colorInput = host.querySelector?.("[data-world-map-new-category-color]");
      const editingLabel = host.querySelector?.("[data-world-map-category-editing]");
      if (labelInput) labelInput.value = "";
      if (iconInput) iconInput.value = "fa:fa-location-dot";
      setIconPickerValue(host.querySelector?.('[data-world-map-icon-picker="category"]'), "fa:fa-location-dot");
      if (colorInput) colorInput.value = "#f6c85f";
      if (editingLabel) editingLabel.textContent = "Новая категория";
      return;
    }
  }, { signal: domEvents.signal });

  host.addEventListener("keydown", (event) => {
    if (event.target.matches?.("[data-world-map-search]") && event.key === "Enter") {
      event.preventDefault();
      executeMapSearch();
      return;
    }
    if (event.key === "Escape" && (positionPick || pendingCatalogLocation || cityCatalogOpen)) {
      event.preventDefault(); positionPick = ""; pendingCatalogLocation = ""; placementMode = false; cityCatalogOpen = false;
      refresh(); return;
    }
    if (event.key === "Escape" && selectedMarkerId && !editorMarkerId && !regionEditorMode) {
      event.preventDefault();
      closeMarkerDetail();
    }
  }, { signal: domEvents.signal });

  host.addEventListener("click",
    (event) =>{const button=event.target.closest?.("[data-city-media-action],[data-city-dossier-action]");if(!button)return;const marker=state.markers.find(
        (m) =>m.id===(editorMarkerId||selectedMarkerId));if(!marker)return;event.preventDefault();void(async()=>{if(button.dataset.cityMediaAction){await handleWorldMapMediaAction(button,marker,refresh);return;}const action=button.dataset.cityDossierAction;if(action==="expand")await openWorldMapDossier(marker.id,{
            onArchiveLink:context.openArchiveLink,getArchiveContext:(current)=>({links:detailLinksForMarker(current),archiveRecords:catalog()})});if(action==="publish")await publishWorldMapDossier(marker.id);})().catch(cityError);},{signal:domEvents.signal});
  host.addEventListener("click",
    (e) =>{const b=e.target.closest("[data-city-location-services]");if(!b) return;
      e.preventDefault();
      const options = {tab:b.dataset.cityLocationServices,markerId: editorMarkerId || selectedMarkerId,
        actorId: activeActorId,
      };
      void (async () => {
        if (context.onCityServices) await context.onCityServices(options);
        else {
          const { openCityServices } = await import("./city-services-ui.mjs");
          await openCityServices(options);
        }
      })().catch(cityError);},{signal:domEvents.signal});
  host.addEventListener("change",
    (event) =>{if(!event.target.matches?.("[data-city-media-caption]"))return;const marker=state.markers.find(
        (m) =>m.id===(editorMarkerId||selectedMarkerId));if(marker)void saveWorldMapImageCaption(marker,event.target.dataset.cityMediaCaption,event.target.value).then(refresh).catch(cityError);
    },{signal:domEvents.signal});
  const onMapChanged = (next) => refresh(next);
  if (globalThis.Hooks?.on) hookId = globalThis.Hooks.on(WORLD_CITY_MAP_HOOK, onMapChanged);

  if (globalThis.Hooks?.on) {
    for (const name of ["updateActor", "createActor", "deleteActor"]) {
      actorHookIds.push([name, globalThis.Hooks.on(name, () => { if (!destroyed) renderCityPositions(); })]);
    }
  }
  refresh();
  if (selectedMarkerId) centerMarker(selectedMarkerId);

  return {
    refresh,
    closeDetails(){selectedRegionId="";closeMarkerDetail();},
    selection(){return {markerId:selectedMarkerId,regionId:selectedRegionId};},
    getMarker(id){return state.markers.find((m) =>m.id===id);},
    setActiveActor(actorId) { activeActorId=clean(actorId);positionPick="";refresh(); },
    focusPoint(point){mapController?.focusPoint?.(point);},
    beginActorPosition(){if(!worldMapActorOwned(game.actors.get(activeActorId)))return;positionPick="actor";placementMode=false;cityCatalogOpen=false;pendingCatalogLocation="";cancelRegionWork();refresh();},
    focusMarker(markerId, {zoom = null} = {}) {
      selectedMarkerId = clean(markerId);
      editorMarkerId = "";
      selectedRegionId = "";
      regionEditorMode = "";
      refresh();
      if (zoom != null) mapController?.focusMarker?.(selectedMarkerId,{zoom});
      else centerMarker(selectedMarkerId);
    },
    destroy() {
      destroyed = true;
      domEvents.abort();
      mapInitSerial += 1;
      mapController?.destroy?.();
      mapController = null;
      if (hookId !== null && globalThis.Hooks?.off) globalThis.Hooks.off(WORLD_CITY_MAP_HOOK, hookId);
      for (const [name, id] of actorHookIds) globalThis.Hooks?.off?.(name, id);
      host.innerHTML = "";
    },
  };
}
