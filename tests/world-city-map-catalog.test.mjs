import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorldCityMap,
  createWorldMapMarker,
} from "../runtime/world-city-map.mjs";

function environment(gm = true) {
  let stored = JSON.stringify({ version: 5, markers: [], regions: [] });
  globalThis.game = {
    user: { isGM: gm },
    settings: {
      register() {},
      get() {
        return stored;
      },
      async set(_module, _key, value) {
        stored = value;
      },
    },
  };
  globalThis.Hooks = { callAll() {} };
}

test("catalog placement uses the selected map coordinate and preserves existing points", async () => {
  environment();
  await createWorldMapMarker({ x: 0.1, y: 0.2, title: "Моя точка" });
  const service = await import("../runtime/world-city-map-catalog.mjs");
  const created = await service.placeWorldMapCatalogLocation("p1", {
    x: 0.6,
    y: 0.7,
  });
  assert.equal(created.title, "Университет Найт-Сити");
  assert.equal(created.x, 0.6);
  assert.equal(created.y, 0.7);
  assert.ok(created.description.includes("Кампус"));
  assert.equal(getWorldCityMap().markers[0].title, "Моя точка");
});

test("repeated simultaneous catalog placement reuses the existing point", async () => {
  environment();
  const service = await import("../runtime/world-city-map-catalog.mjs");
  const points = await Promise.all([
    service.placeWorldMapCatalogLocation("p1", { x: 0.2, y: 0.3 }),
    service.placeWorldMapCatalogLocation("p1", { x: 0.4, y: 0.5 }),
  ]);
  assert.equal(points[0].id, points[1].id);
  assert.equal(getWorldCityMap().markers.length, 1);
  assert.equal(getWorldCityMap().markers[0].x, 0.2);
});

test("catalog edits remain GM-only and missing entries do not create points", async () => {
  environment(false);
  const service = await import("../runtime/world-city-map-catalog.mjs");
  await assert.rejects(
    () => service.placeWorldMapCatalogLocation("p1", { x: 0.2, y: 0.3 }),
    /GM/u,
  );
  globalThis.game.user.isGM = true;
  await assert.rejects(
    () => service.placeWorldMapCatalogLocation("missing", { x: 0.2, y: 0.3 }),
    /каталог/u,
  );
  assert.equal(getWorldCityMap().markers.length, 0);
});

test("district card lists only points inside its actual polygon", async () => {
  const service = await import("../runtime/world-city-map-catalog.mjs");
  const region = {
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ],
  };
  assert.deepEqual(
    service
      .worldMapMarkersInRegion(region, [
        { id: "inside", x: 0.5, y: 0.4 },
        { id: "outside", x: 0.9, y: 0.8 },
      ])
      .map((marker) => marker.id),
    ["inside"],
  );
});
