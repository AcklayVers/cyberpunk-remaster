import {
  canonicalLocalKey,
  writeUnifiedServerData,
  readUnifiedServerData,
} from "./neuro-archive-store.mjs";
import {
  cityArchiveBridges,
  cityArchiveBridgeBase,
  acknowledgeCityArchiveBridge,
  readCityArchiveSnapshot,
} from "./world-city-map-archive.mjs";
export const CITY_ARCHIVE_HOOK = "cyberpunkRemasterCityArchive";
const queues = new Map();
const clone = (v) => structuredClone(v);
function owner(id) {
  if (!game.user || (!game.user.isGM && id !== game.user.id))
    throw new Error("Недостаточно прав для чужого Архива.");
  const u = game.users.get(id);
  if (!u) throw new Error("Владелец Архива не найден.");
  return u;
}
export function readCityArchive(id = game.user.id) {
  owner(id);
  const bridges = cityArchiveBridges(id);
  const server = readUnifiedServerData(owner(id));
  let store = clone(
    bridges.length && Object.keys(server?.notebooks || {}).length
      ? server
      : readCityArchiveSnapshot(id) || { version: 3, notebooks: {} },
  );
  for (const bridge of bridges) {
    const current = bridge.getSnapshot?.()?.store;
    const base = cityArchiveBridgeBase(bridge);
    if (base && current) store = mergeDelta(base, current, store);
  }
  return store;
}
// Apply only this transaction's changes to the newest live draft.
function mergeDelta(base, desired, latest) {
  if (JSON.stringify(base) === JSON.stringify(desired)) return clone(latest);
  if (
    Array.isArray(base) &&
    Array.isArray(desired) &&
    Array.isArray(latest) &&
    [...base, ...desired, ...latest].every(
      (x) => x && typeof x === "object" && x.id,
    )
  ) {
    const old = new Map(base.map((x) => [x.id, x])),
      next = new Map(desired.map((x) => [x.id, x])),
      present = new Set(latest.map((x) => x.id));
    return [
      ...latest
        .filter((x) => !old.has(x.id) || next.has(x.id))
        .map((x) =>
          next.has(x.id) && old.has(x.id)
            ? mergeDelta(old.get(x.id), next.get(x.id), x)
            : clone(x),
        ),
      ...desired.filter((x) => !old.has(x.id) && !present.has(x.id)).map(clone),
    ];
  }
  if (
    base &&
    desired &&
    typeof base === "object" &&
    typeof desired === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(desired)
  ) {
    const result = clone(latest || {});
    for (const k of new Set([...Object.keys(base), ...Object.keys(desired)])) {
      if (!(k in desired)) {
        delete result[k];
        continue;
      }
      if (JSON.stringify(base[k]) !== JSON.stringify(desired[k]))
        result[k] = mergeDelta(base[k], desired[k], result[k]);
    }
    return result;
  }
  return clone(desired);
}
export function mutateCityArchive(id, mutator) {
  const previous = queues.get(id) || Promise.resolve();
  const work = previous
    .catch(() => {})
    .then(async () => {
      const user = owner(id),
        bridges = cityArchiveBridges(id);
      for (const bridge of bridges)
        if ((await bridge.beforeExternalMutation?.()) === false)
          throw new Error("Не удалось сохранить открытый Архив.");
      const before = readCityArchive(id),
        store = clone(before);
      await mutator(store);
      store.updatedAt = new Date().toISOString();
      let saved,
        next = store;
      for (let attempt = 0; attempt < 8; attempt++) {
        saved = await writeUnifiedServerData(user, next);
        const merged = mergeDelta(before, saved, readCityArchive(id));
        if (JSON.stringify(saved) === JSON.stringify(merged)) break;
        if (attempt === 7)
          throw new Error(
            "Архив продолжает изменяться. Черновик сохранён локально; повтори синхронизацию.",
          );
        next = merged;
      }
      if (id === game.user.id)
        try {
          localStorage.setItem(
            canonicalLocalKey({ ownerId: id }),
            JSON.stringify(saved),
          );
        } catch {}
      for (const bridge of bridges) {
        acknowledgeCityArchiveBridge(bridge, saved);
        bridge.applyExternalStore?.(clone(saved));
      }
      globalThis.Hooks?.callAll(CITY_ARCHIVE_HOOK, id);
      return saved;
    });
  queues.set(id, work);
  return work.finally(() => {
    if (queues.get(id) === work) queues.delete(id);
  });
}
export function persistCityArchiveSnapshot(id, snapshot) {
  return mutateCityArchive(id, (store) => {
    if (!cityArchiveBridges(id).length) Object.assign(store, clone(snapshot));
  });
}
