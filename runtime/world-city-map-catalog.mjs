import {
  NIGHT_CITY_LOCATIONS,
  NIGHT_CITY_DISTRICTS,
} from "../data/night-city-catalog.mjs";
import {
  updateWorldCityMap,
  normalizeWorldMapPosition,
} from "./world-city-map.mjs";
import { worldMapPointInPolygon } from "./world-city-map-leaflet.mjs";

export { NIGHT_CITY_LOCATIONS, NIGHT_CITY_DISTRICTS };

export async function placeWorldMapCatalogLocation(catalogId, rawPoint) {
  if (!globalThis.game?.user?.isGM)
    throw new Error("Только GM может добавлять места из каталога.");
  const location = NIGHT_CITY_LOCATIONS.find((entry) => entry.id === catalogId);
  if (!location) throw new Error("Место не найдено в каталоге Найт-Сити.");
  const point = normalizeWorldMapPosition(rawPoint);
  if (!point) throw new Error("Некорректные координаты места.");
  const sourceId = `ncm:${location.id}`;
  const next = await updateWorldCityMap((state) => {
    if (state.markers.some((marker) => marker.catalogId === sourceId)) return;
    let id = `catalog-${location.id}`;
    if (state.markers.some((marker) => marker.id === id))
      id += `-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    state.markers.push({
      id,
      x: point.x,
      y: point.y,
      title: location.name,
      description: location.description,
      categoryId: location.categoryId,
      catalogId: sourceId,
    });
  });
  return next.markers.find((marker) => marker.catalogId === sourceId);
}

export function worldMapMarkersInRegion(region, markers = []) {
  return markers.filter((marker) =>
    worldMapPointInPolygon(marker, region?.points),
  );
}
