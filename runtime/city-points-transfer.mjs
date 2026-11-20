import {
  normalizeWorldCityMap,
  updateWorldCityMap,
} from "./world-city-map.mjs";
function validate(payload) {
  if (
    payload?.app !== "cyberpunk-remaster-world-city-map-points" ||
    payload.version !== 1 ||
    !Array.isArray(payload.markers)
  )
    throw new Error("Неверный файл переноса точек.");
  const ids = new Set();
  for (const m of payload.markers) {
    if (!m?.id || ids.has(m.id))
      throw new Error(
        "В файле отсутствует ID или повторяется идентификатор точки.",
      );
    ids.add(m.id);
    if (
      !["x", "y"].every((k) => Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 1)
    )
      throw new Error("Повреждены координаты точки.");
  }
}
function incoming(state, payload) {
  validate(payload);
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  for (const c of payload.categories || [])
    if (!cats.has(c.id)) cats.set(c.id, c);
  const normalized = normalizeWorldCityMap({
    ...state,
    categories: [...cats.values()],
    markers: payload.markers,
  });
  const known = new Set(normalized.categories.map((c) => c.id));
  if (payload.markers.some((m) => m.categoryId && !known.has(m.categoryId)))
    throw new Error(
      "Неизвестная категория точки: добавьте её определение в файл.",
    );
  return normalized;
}
const signature = (m) => {
  const v = { ...m };
  delete v.createdAt;
  delete v.updatedAt;
  return JSON.stringify(v);
};
export function previewCityPointsTransfer(state, payload) {
  const source = incoming(state, payload),
    current = new Map(state.markers.map((m) => [m.id, m]));
  const summary = {
    added: [],
    unchanged: [],
    conflicts: [],
    categories: source.categories.filter(
      (c) => !state.categories.some((x) => x.id === c.id),
    ),
  };
  for (const m of source.markers) {
    const old = current.get(m.id);
    if (!old) summary.added.push(m);
    else if (signature(old) === signature(m)) summary.unchanged.push(m.id);
    else summary.conflicts.push({ id: m.id, current: old, incoming: m });
  }
  return summary;
}
export function mergeCityPointsTransfer(
  state,
  payload,
  { replaceIds = [] } = {},
) {
  const p = previewCityPointsTransfer(state, payload),
    replace = new Set(replaceIds),
    updates = new Map(
      p.conflicts
        .filter((c) => replace.has(c.id))
        .map((c) => [c.id, c.incoming]),
    );
  return {
    ...state,
    categories: [...state.categories, ...p.categories],
    markers: [...state.markers.map((m) => updates.get(m.id) || m), ...p.added],
  };
}
export async function applyCityPointsTransfer(payload, options = {}) {
  let summary;
  await updateWorldCityMap((state) => {
    summary = previewCityPointsTransfer(state, payload);
    Object.assign(state, mergeCityPointsTransfer(state, payload, options));
  });
  return summary;
}
