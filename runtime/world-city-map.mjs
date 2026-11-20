import {normalizeWorldMapMedia} from "./world-city-map-media.mjs";
const MODULE_ID = "cyberpunk-remaster";
const SETTING_KEY = "worldCityMap";
export const WORLD_CITY_MAP_VERSION = 5;
export const WORLD_CITY_MAP_HOOK = "cyberpunkRemasterWorldCityMapChanged";

export const WORLD_MAP_THREATS = Object.freeze({
  unknown: "Не задана", corporate: "Корпоративная охрана", moderate: "Умеренная",
  suburbs: "Неспокойные пригороды", combat: "Боевая зона", hot: "Зона поражения",
});

export function normalizeWorldMapPosition(raw) {
  if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number"
    || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  return { x: Math.max(0, Math.min(1, raw.x)), y: Math.max(0, Math.min(1, raw.y)), visible: raw.visible !== false };
}

export const REMOVED_WORLD_MAP_CATEGORY_IDS = new Set([
  "contact",
  "gig",
  "clue",
  "cyberpsycho",
  "melee",
  "netrunner",
  "fast-travel",
  "drop-point",
  "npc",
  "district",
]);

export const WORLD_MAP_ICON_PRESETS = Object.freeze([
  { id: "district", label: "Район", icon: "fa:fa-map-location-dot" },
  { id: "shelter", label: "Убежище", icon: "fa:fa-shield" },
  { id: "quest", label: "Задание", icon: "fa:fa-clipboard-list" },
  { id: "contact", label: "Контакт", icon: "fa:fa-address-card" },
  { id: "fixer", label: "Фиксер", icon: "fa:fa-user-tie" },
  { id: "gig", label: "Заказ", icon: "fa:fa-briefcase" },
  { id: "clue", label: "Зацепка", icon: "fa:fa-magnifying-glass" },
  { id: "ncpd", label: "NCPD", icon: "fa:fa-shield-halved" },
  { id: "cyberpsycho", label: "Киберпсих", icon: "fa:fa-skull" },
  { id: "clothing", label: "Одежда", icon: "fa:fa-shirt" },
  { id: "food", label: "Еда", icon: "fa:fa-utensils" },
  { id: "medpoint", label: "Медпункт", icon: "fa:fa-kit-medical" },
  { id: "shop", label: "Магазин", icon: "fa:fa-bag-shopping" },
  { id: "night-market", label: "Ночной рынок", icon: "fa:fa-store" },
  { id: "technician", label: "Техник", icon: "fa:fa-screwdriver-wrench" },
  { id: "entertainment", label: "Развлечения", icon: "fa:fa-masks-theater" },
  { id: "education", label: "Образование", icon: "fa:fa-graduation-cap" },
  { id: "public-service", label: "Госслужбы", icon: "fa:fa-building-columns" },
  { id: "industry", label: "Промышленность", icon: "fa:fa-industry" },
  { id: "warehouse", label: "Склад", icon: "fa:fa-warehouse" },
  { id: "weapon", label: "Оружие", icon: "fa:fa-gun" },
  { id: "melee", label: "Ближний бой", icon: "fa:fa-hand-fist" },
  { id: "junkshop", label: "Скупщик", icon: "fa:fa-recycle" },
  { id: "netrunner", label: "Нетраннер", icon: "fa:fa-laptop-code" },
  { id: "ripperdoc", label: "Риппер", icon: "fa:fa-user-doctor" },
  { id: "fast-travel", label: "Быстрое перемещение", icon: "fa:fa-train-subway" },
  { id: "bar", label: "Бар", icon: "fa:fa-martini-glass" },
  { id: "tarot", label: "Таро", icon: "fa:fa-eye" },
  { id: "drop-point", label: "Drop Point", icon: "fa:fa-box-open" },
  { id: "landmark", label: "Достопримечательность", icon: "fa:fa-camera" },
  { id: "corporation", label: "Корпорация", icon: "fa:fa-building" },
  { id: "megabuilding", label: "Мегабашня", icon: "fa:fa-city" },
  { id: "organization", label: "Организация", icon: "fa:fa-people-group" },
  { id: "apartment", label: "Квартира", icon: "fa:fa-house" },
  { id: "vehicle", label: "Транспорт", icon: "fa:fa-car" },
  { id: "npc", label: "NPC", icon: "fa:fa-user" },
  { id: "faction", label: "Фракция", icon: "fa:fa-users" },
  { id: "gang", label: "Банда", icon: "fa:fa-skull-crossbones" },
  { id: "poi", label: "Интерес", icon: "fa:fa-location-dot" },
  { id: "star", label: "Особая точка", icon: "fa:fa-star" },
  { id: "danger", label: "Опасность", icon: "fa:fa-triangle-exclamation" },
  { id: "tech", label: "Технологии", icon: "fa:fa-microchip" },
  { id: "data", label: "Данные", icon: "fa:fa-database" },
  { id: "bolt", label: "Событие", icon: "fa:fa-bolt" },
]);

export const DEFAULT_WORLD_MAP_CATEGORIES = Object.freeze([
  { id: "fixer", label: "Фиксеры", icon: "fa:fa-user-tie", color: "#f4a261" },
  { id: "ncpd", label: "NCPD", icon: "fa:fa-shield-halved", color: "#4d96ff" },
  { id: "clothing", label: "Одежда", icon: "fa:fa-shirt", color: "#d17bff" },
  { id: "food", label: "Еда", icon: "fa:fa-utensils", color: "#ffb347" },
  { id: "medpoint", label: "Медпункты", icon: "fa:fa-kit-medical", color: "#3ddc97" },
  { id: "shop", label: "Магазины", icon: "fa:fa-bag-shopping", color: "#ffd166" },
  { id: "night-market", label: "Ночные рынки", icon: "fa:fa-store", color: "#7b2cbf" },
  { id: "technician", label: "Техники", icon: "fa:fa-screwdriver-wrench", color: "#00b4d8" },
  { id: "entertainment", label: "Развлечения", icon: "fa:fa-masks-theater", color: "#ff4d6d" },
  { id: "education", label: "Образование", icon: "fa:fa-graduation-cap", color: "#80ed99" },
  { id: "public-service", label: "Госслужбы", icon: "fa:fa-building-columns", color: "#5e60ce" },
  { id: "industry", label: "Промышленность", icon: "fa:fa-industry", color: "#adb5bd" },
  { id: "warehouse", label: "Склады", icon: "fa:fa-warehouse", color: "#bc6c25" },
  { id: "weapon", label: "Оружие", icon: "fa:fa-gun", color: "#ff6b6b" },
  { id: "junkshop", label: "Скупщики", icon: "fa:fa-recycle", color: "#a3b18a" },
  { id: "ripperdoc", label: "Рипперы", icon: "fa:fa-user-doctor", color: "#2ec4b6" },
  { id: "bar", label: "Бары", icon: "fa:fa-martini-glass", color: "#ff4ecd" },
  { id: "tarot", label: "Таро", icon: "fa:fa-eye", color: "#9b5de5" },
  { id: "landmark", label: "Достопримечательности", icon: "fa:fa-camera", color: "#06d6a0" },
  { id: "corporation", label: "Корпорации", icon: "fa:fa-building", color: "#7bdff2" },
  { id: "megabuilding", label: "Мегабашни", icon: "fa:fa-city", color: "#b2f7ef" },
  { id: "organization", label: "Организации", icon: "fa:fa-people-group", color: "#f7aef8" },
  { id: "apartment", label: "Квартиры", icon: "fa:fa-house", color: "#cdb4db" },
  { id: "shelter", label: "Убежища", icon: "fa:fa-shield", color: "#8ecae6" },
  { id: "quest", label: "Задания", icon: "fa:fa-clipboard-list", color: "#ffd166" },
  { id: "vehicle", label: "Транспорт", icon: "fa:fa-car", color: "#90be6d" },
  { id: "faction", label: "Фракции", icon: "fa:fa-users", color: "#f72585" },
  { id: "gang", label: "Банды", icon: "fa:fa-skull-crossbones", color: "#ef233c" },
  { id: "poi", label: "Интерес", icon: "fa:fa-location-dot", color: "#f8f9fa" },
]);

const ARCHIVE_SECTIONS = new Set([
  "people",
  "gangs",
  "corporations",
  "fixers",
  "rippers",
  "lawmen",
  "noosphere",
  "nomads",
  "subscriptions",
  "locations",
  "quests",
  "clues",
  "books",
  "sessions",
  "notes",
]);

const clone = (value) => {
  if (value === undefined) return undefined;
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
};

const text = (value, fallback = "") => String(value ?? fallback).trim();
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clampRange = (value, min, max, fallback = min) => {
  const numeric = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
};
const now = () => new Date().toISOString();
const uid = (prefix = "map") => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
};

function normalizeLink(raw) {
  const actorId = text(raw?.actorId);
  const section = text(raw?.section);
  const entryId = text(raw?.entryId);
  if (!actorId || !entryId || !ARCHIVE_SECTIONS.has(section)) return null;
  return { actorId, section, entryId, ...(text(raw?.ownerUserId) ? {ownerUserId:text(raw.ownerUserId)} : {}) };
}

function sameLink(a, b) {
  return (
    String(a?.actorId || "") === String(b?.actorId || "")
    && String(a?.section || "") === String(b?.section || "")
    && String(a?.entryId || "") === String(b?.entryId || "")
    && String(a?.ownerUserId || "") === String(b?.ownerUserId || "")
  );
}

const DEFAULT_CATEGORY_COLOR = "#f6c85f";

const LEGACY_WORLD_MAP_CATEGORY_ALIASES = new Map([
  ["убежище", "shelter"],
  ["убежища", "shelter"],
  ["укрытие", "shelter"],
  ["укрытия", "shelter"],
  ["safehouse", "shelter"],
  ["safe-house", "shelter"],
]);

function normalizedCategoryId(value) {
  const id = text(value).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase();
  return LEGACY_WORLD_MAP_CATEGORY_ALIASES.get(id) || id;
}

function normalizeHexColor(value, fallback = "") {
  const raw = text(value).toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/u.test(raw)) return `#${raw.slice(1).split("").map((part) => part + part).join("")}`;
  return fallback;
}

export function normalizeWorldMapRegion(raw = {}, fallbackId = "") {
  const points = [];
  for (const candidate of Array.isArray(raw?.points) ? raw.points : []) {
    const point = { x: clamp01(candidate?.x), y: clamp01(candidate?.y) };
    if (!points.some((existing) => existing.x === point.x && existing.y === point.y)) points.push(point);
  }
  if (points.length < 3) return null;
  return {
    id: text(raw?.id, fallbackId) || uid("region"),
    name: text(raw?.name, "Новый регион") || "Новый регион",
    description: text(raw?.description),
    districtId: text(raw?.districtId),
    controller: text(raw?.controller),
    threat: Object.hasOwn(WORLD_MAP_THREATS, raw?.threat ?? "") ? raw.threat : "unknown",
    services: [...new Set((Array.isArray(raw?.services) ? raw.services : String(raw?.services ?? "").split(/[,;\n]/u))
      .map((service) => text(service).slice(0, 80)).filter(Boolean))].slice(0, 32),
    color: normalizeHexColor(raw?.color, "#ef233c"),
    fillOpacity: clampRange(raw?.fillOpacity, 0, 1, 0.22),
    borderOpacity: clampRange(raw?.borderOpacity, 0, 1, 0.9),
    borderWidth: clampRange(raw?.borderWidth, 1, 8, 2),
    visible: raw?.visible !== false,
    zOrder: Number.isFinite(Number(raw?.zOrder)) ? Number(raw.zOrder) : 0,
    points,
    createdAt: text(raw?.createdAt, now()),
    updatedAt: text(raw?.updatedAt, now()),
  };
}

function normalizeCategory(raw, fallbackId = "", fallback = null) {
  const id = normalizedCategoryId(text(raw?.id, fallbackId));
  if (!id) return null;
  return {
    id,
    label: text(raw?.label, fallback?.label || id),
    icon: text(raw?.icon, fallback?.icon || "fa:fa-location-dot").slice(0, 64) || "fa:fa-location-dot",
    color: normalizeHexColor(raw?.color, fallback?.color || DEFAULT_CATEGORY_COLOR),
  };
}

function normalizedCategories(raw, { sourceVersion = WORLD_CITY_MAP_VERSION } = {}) {
  const categories = new Map();
  for (const source of DEFAULT_WORLD_MAP_CATEGORIES) {
    const category = normalizeCategory(source);
    if (category) categories.set(category.id, category);
  }
  for (const source of Array.isArray(raw) ? raw : []) {
    const rawId = text(source?.id);
    const normalizedRawId = rawId.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase();
    const probe = normalizeCategory(source);
    if (!probe || REMOVED_WORLD_MAP_CATEGORY_IDS.has(probe.id)) continue;
    const base = categories.get(probe.id);
    const migratedAlias = Boolean(base && normalizedRawId && normalizedCategoryId(normalizedRawId) !== normalizedRawId);
    const migratedShelterIcon = Boolean(base && probe.id === "shelter" && text(source?.icon) === "fa:fa-house-shield");
    if (migratedAlias || (sourceVersion < 2 && base && DEFAULT_WORLD_MAP_CATEGORIES.some((category) => category.id === probe.id))) {
      categories.set(probe.id, base);
      continue;
    }
    if (migratedShelterIcon) {
      const category = normalizeCategory({ ...source, icon: base.icon }, probe.id, base);
      categories.set(category.id, category);
      continue;
    }
    const category = normalizeCategory(source, probe.id, base);
    categories.set(category.id, category);
  }
  return [...categories.values()];
}

const LEGACY_DEFAULT_MARKER_ICONS = new Set(["⌖", "◉", "▤", "◇", "◆"]);

function normalizeMarker(raw, categories, fallbackId = "", { sourceVersion = WORLD_CITY_MAP_VERSION } = {}) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const links = [];
  for (const candidate of Array.isArray(raw?.links) ? raw.links : []) {
    const link = normalizeLink(candidate);
    if (link && !links.some((existing) => sameLink(existing, link))) links.push(link);
  }
  const requestedCategoryId = normalizedCategoryId(raw?.categoryId);
  const categoryId = categoryIds.has(requestedCategoryId) ? requestedCategoryId : "poi";
  return {
    id: text(raw?.id, fallbackId) || uid("poi"),
    x: clamp01(raw?.x),
    y: clamp01(raw?.y),
    title: text(raw?.title, "Новая точка"),
    description: text(raw?.description),
    showLinkedInDetail: raw?.showLinkedInDetail !== false,
    ...(text(raw?.catalogId) ? { catalogId: text(raw.catalogId) } : {}),
    ...(raw?.media ? {media:normalizeWorldMapMedia(raw.media)} : {}),
    categoryId,
    icon: sourceVersion < 2 && LEGACY_DEFAULT_MARKER_ICONS.has(text(raw?.icon))
      ? ""
      : text(raw?.icon).slice(0, 64),
    color: normalizeHexColor(raw?.color, ""),
    links,
    createdAt: text(raw?.createdAt, now()),
    updatedAt: text(raw?.updatedAt, now()),
  };
}

export function normalizeWorldCityMap(raw = {}) {
  const sourceVersion = Number(raw?.version) || 1;
  const categories = normalizedCategories(raw?.categories, { sourceVersion });
  const markers = [];
  const ids = new Set();
  for (const source of Array.isArray(raw?.markers) ? raw.markers : []) {
    const marker = normalizeMarker(source, categories, "", { sourceVersion });
    if (ids.has(marker.id)) marker.id = uid("poi");
    ids.add(marker.id);
    markers.push(marker);
  }
  const regions = [];
  const regionIds = new Set();
  for (const source of Array.isArray(raw?.regions) ? raw.regions : []) {
    const region = normalizeWorldMapRegion(source);
    if (!region) continue;
    if (regionIds.has(region.id)) region.id = uid("region");
    regionIds.add(region.id);
    regions.push(region);
  }
  return {
    version: WORLD_CITY_MAP_VERSION,
    title: text(raw?.title, "Карта Найт-Сити") || "Карта Найт-Сити",
    tileset: text(raw?.tileset, "night-city-2045") || "night-city-2045",
    // v2 stored only an image path. v3 keeps that path for rollback/custom use,
    // but migrates existing worlds to the embedded tiled atlas by default.
    backgroundMode: sourceVersion >= 3 && raw?.backgroundMode === "image" && String(raw?.image ?? "").trim() ? "image" : "tiles",
    image: String(raw?.image ?? "").trim(),
    notes: String(raw?.notes ?? "").trim(),
    categories,
    markers,
    regions,
    partyPosition: normalizeWorldMapPosition(raw?.partyPosition),
    ...(raw?.clock && Number.isFinite(Date.parse(raw.clock.anchorDate)) && Number.isFinite(raw.clock.anchorWorldTime) ? {clock:{anchorDate:String(raw.clock.anchorDate),anchorWorldTime:raw.clock.anchorWorldTime}} : {}),
    updatedAt: text(raw?.updatedAt),
  };
}

export function defaultWorldCityMap() {
  return normalizeWorldCityMap({});
}

export const WORLD_MAP_POINTS_EXPORT_APP = "cyberpunk-remaster-world-city-map-points";
export const WORLD_MAP_POINTS_EXPORT_VERSION = 1;

export function createWorldMapPointsExport(state = getWorldCityMap(), { exportedAt = now(), worldId = globalThis.game?.world?.id ?? "" } = {}) {
  const normalized = normalizeWorldCityMap(state);
  const defaultIds = new Set(DEFAULT_WORLD_MAP_CATEGORIES.map((category) => category.id));
  const usedCategoryIds = new Set(normalized.markers.map((marker) => marker.categoryId));
  const categories = normalized.categories
    .filter((category) => usedCategoryIds.has(category.id) && !defaultIds.has(category.id))
    .map(clone);
  return {
    app: WORLD_MAP_POINTS_EXPORT_APP,
    version: WORLD_MAP_POINTS_EXPORT_VERSION,
    mapVersion: WORLD_CITY_MAP_VERSION,
    exportedAt: text(exportedAt, now()),
    worldId: text(worldId),
    categories,
    markers: normalized.markers.map(clone),
  };
}

function assertWorldMapPointsPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.app !== WORLD_MAP_POINTS_EXPORT_APP || !Array.isArray(payload.markers)) {
    throw new Error("Неверный формат файла переноса точек карты Найт-Сити.");
  }
  if (Number(payload.version) !== WORLD_MAP_POINTS_EXPORT_VERSION) {
    throw new Error(`Неподдерживаемая версия файла точек карты: ${payload.version ?? "?"}.`);
  }
}

export async function importWorldMapPointsPayload(payload) {
  assertWorldMapPointsPayload(payload);
  const summary = { importedMarkers: 0, addedCategories: 0, remappedMarkerIds: 0 };
  await updateWorldCityMap((state) => {
    const categoryIds = new Set(state.categories.map((category) => category.id));
    for (const rawCategory of Array.isArray(payload.categories) ? payload.categories : []) {
      const category = normalizeCategory(rawCategory);
      if (!category || REMOVED_WORLD_MAP_CATEGORY_IDS.has(category.id) || categoryIds.has(category.id)) continue;
      state.categories.push(category);
      categoryIds.add(category.id);
      summary.addedCategories += 1;
    }

    const markerIds = new Set(state.markers.map((marker) => marker.id));
    for (const rawMarker of payload.markers) {
      const candidate = clone(rawMarker) ?? {};
      const requestedId = text(candidate.id);
      let markerId = requestedId || uid("poi");
      if (markerIds.has(markerId)) {
        markerId = uid("poi");
        while (markerIds.has(markerId)) markerId = uid("poi");
        summary.remappedMarkerIds += 1;
      }
      const marker = normalizeMarker({ ...candidate, id: markerId }, state.categories, markerId, {
        sourceVersion: Number(payload.mapVersion) || WORLD_CITY_MAP_VERSION,
      });
      markerIds.add(marker.id);
      state.markers.push(marker);
      summary.importedMarkers += 1;
    }
  });
  return summary;
}

export function worldMapMarkerDisplayLabel(state, marker) {
  const categoryId = text(marker?.categoryId, "poi") || "poi";
  const presetLabel = WORLD_MAP_ICON_PRESETS.find((preset) => preset.id === categoryId)?.label;
  const categoryLabel = text(presetLabel)
    || text(state?.categories?.find?.((category) => category.id === categoryId)?.label, "Точка")
    || "Точка";
  const title = text(marker?.title, "Без названия") || "Без названия";
  return `${categoryLabel} — ${title}`;
}

function parseStored(value) {
  if (value && typeof value === "object") return normalizeWorldCityMap(value);
  try { return normalizeWorldCityMap(JSON.parse(String(value || "{}"))); }
  catch { return defaultWorldCityMap(); }
}

let settingRegistered = false;
let writeQueue = Promise.resolve();

export function registerWorldCityMapSetting() {
  if (settingRegistered) return;
  const settings = globalThis.game?.settings;
  if (!settings?.register) return;
  try {
    settings.register(MODULE_ID, SETTING_KEY, {
      name: "Night City World Map",
      hint: "Shared interactive map data for the Cyberpunk Remaster archives.",
      scope: "world",
      config: false,
      type: String,
      default: JSON.stringify(defaultWorldCityMap()),
      onChange: (value) => {
        globalThis.Hooks?.callAll?.(WORLD_CITY_MAP_HOOK, parseStored(value));
      },
    });
    settingRegistered = true;
  } catch (error) {
    // Foundry throws if a development hot-reload registers the same key twice.
    if (!/already|registered/i.test(String(error?.message || error))) throw error;
    settingRegistered = true;
  }
}

export function getWorldCityMap() {
  registerWorldCityMapSetting();
  return parseStored(globalThis.game?.settings?.get?.(MODULE_ID, SETTING_KEY));
}

function assertGM() {
  if (!globalThis.game?.user?.isGM) throw new Error("Только GM может изменять общую карту Найт-Сити.");
}

export function updateWorldCityMap(mutator) {
  assertGM();
  const task = async () => {
    const current = getWorldCityMap();
    const draft = clone(current);
    const result = typeof mutator === "function" ? await mutator(draft) : mutator;
    const next = normalizeWorldCityMap(result && typeof result === "object" ? result : draft);
    next.updatedAt = now();
    await globalThis.game?.settings?.set?.(MODULE_ID, SETTING_KEY, JSON.stringify(next));
    return next;
  };
  const queued = writeQueue.then(task, task);
  writeQueue = queued.catch(() => undefined);
  return queued;
}

export async function setWorldMapImage(image, { title = null } = {}) {
  return updateWorldCityMap((state) => {
    state.image = String(image ?? "").trim();
    state.backgroundMode = state.image ? "image" : "tiles";
    if (title !== null) state.title = text(title, state.title);
  });
}

export async function useBuiltInWorldMapTiles() {
  return updateWorldCityMap((state) => {
    state.backgroundMode = "tiles";
    state.tileset = "night-city-2045";
  });
}

export async function createWorldMapMarker(input = {}) {
  let created = null;
  await updateWorldCityMap((state) => {
    created = normalizeMarker({
      ...input,
      id: input.id || uid("poi"),
      createdAt: now(),
      updatedAt: now(),
    }, state.categories);
    state.markers.push(created);
  });
  return clone(created);
}

export async function updateWorldMapMarker(id, patch = {}) {
  let updated = null;
  await updateWorldCityMap((state) => {
    const index = state.markers.findIndex((marker) => marker.id === String(id));
    if (index < 0) return;
    updated = normalizeMarker({ ...state.markers[index], ...clone(patch), id: state.markers[index].id, createdAt: state.markers[index].createdAt, updatedAt: now() }, state.categories);
    state.markers[index] = updated;
  });
  return clone(updated);
}

export async function deleteWorldMapMarker(id) {
  let removed = false;
  await updateWorldCityMap((state) => {
    const before = state.markers.length;
    state.markers = state.markers.filter((marker) => marker.id !== String(id));
    removed = state.markers.length !== before;
  });
  return removed;
}

export async function createWorldMapRegion(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "name") && !text(input.name)) throw new Error("Название региона не может быть пустым.");
  let created = null;
  await updateWorldCityMap((state) => {
    const maxZ = state.regions.reduce((max, region) => Math.max(max, Number(region.zOrder) || 0), 0);
    created = normalizeWorldMapRegion({
      ...clone(input),
      id: input.id || uid("region"),
      zOrder: Number.isFinite(Number(input.zOrder)) ? Number(input.zOrder) : maxZ + 1,
      createdAt: now(),
      updatedAt: now(),
    });
    if (!created) throw new Error("Регион должен содержать минимум 3 вершины.");
    state.regions.push(created);
  });
  return clone(created);
}

export async function updateWorldMapRegion(id, patch = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, "name") && !text(patch.name)) throw new Error("Название региона не может быть пустым.");
  let updated = null;
  await updateWorldCityMap((state) => {
    const index = state.regions.findIndex((region) => region.id === String(id));
    if (index < 0) return;
    updated = normalizeWorldMapRegion({
      ...state.regions[index],
      ...clone(patch),
      id: state.regions[index].id,
      createdAt: state.regions[index].createdAt,
      updatedAt: now(),
    });
    if (!updated) throw new Error("Регион должен содержать минимум 3 вершины.");
    if (!text(updated.name)) throw new Error("Название региона не может быть пустым.");
    state.regions[index] = updated;
  });
  return clone(updated);
}

export async function deleteWorldMapRegion(id) {
  let removed = false;
  await updateWorldCityMap((state) => {
    const before = state.regions.length;
    state.regions = state.regions.filter((region) => region.id !== String(id));
    removed = state.regions.length !== before;
  });
  return removed;
}

export async function moveWorldMapRegionToFront(id) {
  let updated = null;
  await updateWorldCityMap((state) => {
    const region = state.regions.find((candidate) => candidate.id === String(id));
    if (!region) return;
    const maxZ = state.regions.reduce((max, candidate) => Math.max(max, Number(candidate.zOrder) || 0), 0);
    region.zOrder = maxZ + 1;
    region.updatedAt = now();
    updated = normalizeWorldMapRegion(region);
    Object.assign(region, updated);
  });
  return clone(updated);
}

export async function moveWorldMapRegionToBack(id) {
  let updated = null;
  await updateWorldCityMap((state) => {
    const region = state.regions.find((candidate) => candidate.id === String(id));
    if (!region) return;
    const minZ = state.regions.reduce((min, candidate) => Math.min(min, Number(candidate.zOrder) || 0), 0);
    region.zOrder = minZ - 1;
    region.updatedAt = now();
    updated = normalizeWorldMapRegion(region);
    Object.assign(region, updated);
  });
  return clone(updated);
}

export async function upsertWorldMapCategory(input = {}) {
  let category = null;
  await updateWorldCityMap((state) => {
    category = normalizeCategory(input, uid("cat"));
    if (!category) return;
    const index = state.categories.findIndex((item) => item.id === category.id);
    if (index >= 0) state.categories[index] = category;
    else state.categories.push(category);
  });
  return clone(category);
}

export async function deleteWorldMapCategory(id) {
  const key = text(id);
  if (DEFAULT_WORLD_MAP_CATEGORIES.some((category) => category.id === key)) return false;
  let removed = false;
  await updateWorldCityMap((state) => {
    const before = state.categories.length;
    state.categories = state.categories.filter((category) => category.id !== key);
    removed = before !== state.categories.length;
    if (removed) for (const marker of state.markers) if (marker.categoryId === key) marker.categoryId = "poi";
  });
  return removed;
}

function linkMatches(candidate, requested) {return (
    sameLink(candidate,requested) || (!candidate.ownerUserId && sameLink({...candidate,ownerUserId:requested.ownerUserId},requested)));}

export function markersForArchiveEntry(link, state = getWorldCityMap()) {
  const normalized = normalizeLink(link);
  if (!normalized) return [];
  return state.markers.filter((marker) => marker.links.some((candidate) => linkMatches(candidate, normalized))).map(clone);
}

export async function linkMarkerToArchiveEntry(markerId, link) {
  const normalized = normalizeLink(link);
  if (!normalized) throw new Error("Некорректная ссылка на запись архива.");
  return updateWorldMapMarker(markerId, {
    links: (() => {
      const marker = getWorldCityMap().markers.find((item) => item.id === String(markerId));
      if (!marker) return [];
      const links = [...marker.links];
      if (!links.some((candidate) => linkMatches(candidate, normalized))) links.push(normalized);
      return links;
    })(),
  });
}

export async function unlinkMarkerFromArchiveEntry(markerId, link) {
  const normalized = normalizeLink(link);
  if (!normalized) return null;
  const marker = getWorldCityMap().markers.find((item) => item.id === String(markerId));
  if (!marker) return null;
  return updateWorldMapMarker(markerId, {
    links: marker.links.filter((candidate) => !linkMatches(candidate, normalized)),
  });
}

export function archiveLinkKey(link) {
  const normalized = normalizeLink(link);
  return normalized ? `${normalized.actorId}:${normalized.section}:${normalized.entryId}` : "";
}

export function isArchiveLink(value) {
  return Boolean(normalizeLink(value));
}
