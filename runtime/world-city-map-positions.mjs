import {
  getWorldCityMap,
  normalizeWorldMapPosition,
  updateWorldCityMap,
} from "./world-city-map.mjs";

const MODULE_ID = "cyberpunk-remaster";
const FLAG_KEY = "worldCityMapPositionV1";

export function worldMapActorOwned(actor) {
  const user = globalThis.game?.user;
  if (!actor || !user) return false;
  return (
    user.isGM ||
    Boolean(actor.testUserPermission?.(user, "OWNER") ?? actor.isOwner)
  );
}

export function getWorldMapActorPosition(actorId) {
  const actor = globalThis.game?.actors?.get?.(String(actorId));
  const raw = actor?.getFlag?.(MODULE_ID, FLAG_KEY);
  if (raw?.shared !== true && !worldMapActorOwned(actor)) return null;
  const point = normalizeWorldMapPosition(raw);
  if (!point) return null;
  return { x: point.x, y: point.y, shared: raw.shared === true };
}

export async function setWorldMapActorPosition(actorId, raw) {
  const actor = globalThis.game?.actors?.get?.(String(actorId));
  if (!worldMapActorOwned(actor))
    throw new Error("Нельзя перемещать персонажа, которым вы не владеете.");
  if (raw === null) {
    await actor.unsetFlag(MODULE_ID, FLAG_KEY);
    return null;
  }
  const point = normalizeWorldMapPosition(raw);
  if (!point) throw new Error("Некорректные координаты позиции персонажа.");
  const position = { x: point.x, y: point.y, shared: raw.shared === true };
  await actor.setFlag(MODULE_ID, FLAG_KEY, position);
  return position;
}

export async function setWorldMapPartyPosition(raw) {
  if (!globalThis.game?.user?.isGM)
    throw new Error("Только GM может перемещать группу.");
  const point = raw === null ? null : normalizeWorldMapPosition(raw);
  if (raw !== null && !point)
    throw new Error("Некорректные координаты позиции группы.");
  await updateWorldCityMap((state) => {
    state.partyPosition = point;
  });
  return point;
}

export function getWorldMapPositionMarkers(state = getWorldCityMap()) {
  const markers = [];
  const user = globalThis.game?.user;
  const party = normalizeWorldMapPosition(state.partyPosition);
  if (party && (party.visible || user?.isGM)) {
    markers.push({
      id: "party",
      title: "Группа",
      ...party,
      color: "#ffd166",
      glyph: "◈",
    });
  }
  const collection = globalThis.game?.actors;
  const actors =
    collection?.contents ??
    (collection?.values ? [...collection.values()] : []);
  for (const actor of actors) {
    const point = getWorldMapActorPosition(actor.id);
    if (!point || (!point.shared && !worldMapActorOwned(actor))) continue;
    markers.push({
      id: `actor:${actor.id}`,
      title: String(actor.name || "Персонаж"),
      ...point,
      color: "#43d9c2",
      glyph: "●",
    });
  }
  return markers;
}
