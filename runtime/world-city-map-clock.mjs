import { setCityCampaignDate } from "./city-calendar.mjs";
import { getWorldCityMap, updateWorldCityMap } from "./world-city-map.mjs";
export const DEFAULT_WORLD_MAP_DATE = "2045-07-14T20:00:00Z";
function authority() {
  if (!game.user?.isGM)
    throw new Error("Изменение времени доступно только ведущему.");
  if (game.users?.activeGM && game.users.activeGM.id !== game.user.id)
    throw new Error("Время изменяет активный ведущий Foundry.");
}
export function campaignTimeAt(clock, worldTimeSeconds) {
  const anchor = Date.parse(clock?.anchorDate),
    base = Number(clock?.anchorWorldTime);
  if (
    !Number.isFinite(anchor) ||
    !Number.isFinite(base) ||
    !Number.isFinite(worldTimeSeconds)
  )
    throw new Error("Неверная игровая дата.");
  const date = new Date(anchor + (worldTimeSeconds - base) * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Дата вне диапазона.");
  return {
    iso: date.toISOString(),
    time: date.toISOString().slice(11, 16),
    night: date.getUTCHours() < 6 || date.getUTCHours() >= 20,
  };
}
export async function initializeWorldMapClock() {
  authority();
  if (getWorldCityMap().clock) return getWorldCityMap().clock;
  const clock = {
    anchorDate: DEFAULT_WORLD_MAP_DATE,
    anchorWorldTime: Number(game.time?.worldTime) || 0,
  };
  await updateWorldCityMap((s) => {
    if (!s.clock) s.clock = clock;
  });
  return getWorldCityMap().clock;
}
export async function setWorldMapCampaignDate(isoDate) {
  authority();
  await setCityCampaignDate(isoDate);
  return getWorldCityMap().clock;
}
export async function advanceWorldMapTime(minutes) {
  authority();
  if (!Number.isFinite(minutes) || minutes < 0)
    throw new Error("Неверная длительность.");
  return game.time.advance(Math.round(minutes * 60));
}
