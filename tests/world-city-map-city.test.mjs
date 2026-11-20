import assert from "node:assert/strict";
import test from "node:test";
import * as map from "../runtime/world-city-map.mjs";

function environment({ gm = true } = {}) {
  let value = JSON.stringify({ version: 5, markers: [], regions: [] });
  globalThis.game = {
    user: { id: "u1", isGM: gm },
    settings: {
      register() {},
      get() {
        return value;
      },
      async set(_scope, _key, next) {
        value = next;
      },
    },
  };
  globalThis.Hooks = { callAll() {} };
}

const triangle = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.5, y: 0.9 },
];

test("saving district properties preserves geometry, controller and services", async () => {
  environment();
  const region = await map.createWorldMapRegion({
    name: "Доковый район",
    points: triangle,
  });
  await map.updateWorldMapRegion(region.id, {
    threat: "combat",
    controller: "  Мальстрём  ",
    services: "Риппер, Рынок, Риппер",
    districtId: "docks",
  });
  const saved = map.getWorldCityMap().regions[0];
  assert.equal(saved.threat, "combat");
  assert.equal(saved.controller, "Мальстрём");
  assert.deepEqual(saved.services, ["Риппер", "Рынок"]);
  assert.equal(saved.districtId, "docks");
  assert.deepEqual(saved.points, triangle);
});

test("unknown district threat falls back without discarding legacy region data", () => {
  const saved = map.normalizeWorldMapRegion({
    name: "Legacy",
    points: triangle,
    threat: "invalid",
  });
  assert.equal(saved.threat, "unknown");
  assert.equal(saved.name, "Legacy");
  assert.deepEqual(saved.services, []);
});

test("catalog provenance survives point export and import", async () => {
  environment();
  await map.createWorldMapMarker({
    x: 0.2,
    y: 0.3,
    title: "Бар",
    catalogId: "ncm:p42",
  });
  const payload = map.createWorldMapPointsExport();
  assert.equal(payload.markers[0].catalogId, "ncm:p42");
  await map.importWorldMapPointsPayload(payload);
  assert.equal(map.getWorldCityMap().markers[1].catalogId, "ncm:p42");
});

test("party position survives unrelated map updates and only GM can change it", async () => {
  environment();
  await map.updateWorldCityMap((state) => {
    state.partyPosition = { x: 0.25, y: 0.75, visible: true };
  });
  await map.createWorldMapMarker({ x: 0.2, y: 0.3, title: "Бар" });
  assert.deepEqual(map.getWorldCityMap().partyPosition, {
    x: 0.25,
    y: 0.75,
    visible: true,
  });
  globalThis.game.user.isGM = false;
  assert.throws(
    () =>
      map.updateWorldCityMap((state) => {
        state.partyPosition = null;
      }),
    /GM/u,
  );
});
