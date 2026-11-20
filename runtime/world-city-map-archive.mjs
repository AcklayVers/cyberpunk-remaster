import {
  canonicalLocalKey,
  mergeArchiveStores,
  readUnifiedLocalData,
  readUnifiedServerData,
} from "./neuro-archive-store.mjs";
const bridges = new Set();
const bridgeBases = new WeakMap();
const clean = (v) => String(v ?? "").trim();
const canRead = (id) =>
  !!globalThis.game?.user && (id === game.user.id || game.user.isGM);
export function registerWorldMapArchiveBridge(bridge) {
  bridges.add(bridge);
  const snapshot = bridge.getSnapshot?.();
  if (snapshot) bridgeBases.set(bridge, structuredClone(snapshot));
  return () => bridges.delete(bridge);
}
export function cityArchiveBridgeBase(bridge) {
  const current = bridge.getSnapshot?.();
  let base = bridgeBases.get(bridge);
  if (current && base?.ownerUserId !== current.ownerUserId) {
    base = structuredClone(current);
    bridgeBases.set(bridge, base);
  }
  return base?.store;
}
export function acknowledgeCityArchiveBridge(bridge, store) {
  bridgeBases.set(bridge, {
    ownerUserId: bridge.getSnapshot?.()?.ownerUserId,
    store: structuredClone(store),
  });
}
function users() {
  return Array.from(
    globalThis.game?.users?.values?.() ?? globalThis.game?.users ?? [],
  );
}
function readStore(ownerId) {
  if (!canRead(ownerId)) return null;
  for (const bridge of [...bridges].reverse()) {
    const snap = bridge.getSnapshot?.();
    if (snap?.ownerUserId === ownerId) return snap.store;
  }
  const owner =
    globalThis.game?.users?.get?.(ownerId) ??
    (ownerId === game.user.id ? game.user : null);
  if (!owner) return null;
  const server = readUnifiedServerData(owner);
  if (ownerId !== game.user.id) return server;
  const worldId = String(game.world?.id ?? "world");
  const local = readUnifiedLocalData(globalThis.localStorage, {
    canonicalKey: canonicalLocalKey({
      worldId,
      ownerId,
      currentUserId: game.user.id,
    }),
    legacyKeys: [
      `personal-chronicle-macro:${worldId}:${ownerId}`,
      `night-city-field-archive:${worldId}:${ownerId}`,
    ],
  });
  return local ? mergeArchiveStores(server, local) : server;
}
export function cityArchiveBridges(ownerId) {
  if (!canRead(ownerId)) return [];
  return [...bridges].filter((b) => b.getSnapshot?.()?.ownerUserId === ownerId);
}
export function readCityArchiveSnapshot(ownerId) {
  return readStore(ownerId);
}
export function listWorldMapArchiveRecords({
  ownerUserId = globalThis.game?.user?.id,
  actorId = "",
} = {}) {
  const store = readStore(clean(ownerUserId));
  const records = [];
  for (const [id, book] of Object.entries(store?.notebooks ?? {})) {
    if (actorId && actorId !== id) continue;
    for (const [section, entries] of Object.entries(book?.entries ?? {}))
      for (const e of Array.isArray(entries) ? entries : []) {
        if (e?.id)
          records.push({
            ownerUserId: clean(ownerUserId),
            actorId: id,
            actorName: clean(book.actorName) || "Персонаж",
            section,
            sectionLabel: section,
            entryId: clean(e.id),
            title: clean(e.title) || "Без названия",
          });
      }
  }
  return records;
}
export function resolveWorldMapArchiveLink(link, { ownerUserId } = {}) {
  const requested = clean(link?.ownerUserId || ownerUserId);
  const base = { record: null, candidates: [] };
  if (requested && !canRead(requested)) return { ...base, status: "forbidden" };
  const owners = requested
    ? [requested]
    : game.user.isGM
      ? users().map((u) => u.id)
      : [game.user.id];
  const candidates = owners
    .flatMap((id) => listWorldMapArchiveRecords({ ownerUserId: id }))
    .filter(
      (r) =>
        r.actorId === clean(link?.actorId) &&
        r.section === clean(link?.section) &&
        r.entryId === clean(link?.entryId),
    );
  return {
    status:
      candidates.length > 1
        ? "ambiguous"
        : candidates.length
          ? "ready"
          : "missing",
    record: candidates.length === 1 ? candidates[0] : null,
    candidates,
  };
}
