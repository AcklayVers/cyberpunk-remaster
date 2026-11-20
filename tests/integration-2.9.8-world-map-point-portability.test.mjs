import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mapUrl = new URL("../runtime/world-city-map.mjs", import.meta.url);
const viewUrl = new URL("../runtime/world-city-map-view.mjs", import.meta.url);
const viewSource = fs.readFileSync(viewUrl, "utf8");

function mockFoundry({ initial = null, gm = true } = {}) {
  let stored = initial ? JSON.stringify(initial) : "";
  let registration = null;
  globalThis.game = {
    user: { isGM: gm },
    world: { id: "night-city-test" },
    settings: {
      register(_module, _key, config) {
        registration = config;
        if (!stored) stored = config.default;
      },
      get() { return stored; },
      async set(_module, _key, value) {
        stored = value;
        registration?.onChange?.(value);
        return value;
      },
    },
  };
  globalThis.Hooks = { callAll() {} };
  return { get stored() { return stored; } };
}

test("2.9.8 point export contains markers plus only used custom categories and excludes map/regions", async () => {
  mockFoundry();
  const mod = await import(`${mapUrl.href}?v298-export=${Date.now()}`);
  const state = mod.normalizeWorldCityMap({
    version: mod.WORLD_CITY_MAP_VERSION,
    image: "world/night-city.webp",
    backgroundMode: "image",
    regions: [{ id: "region-a", name: "Watson", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
    categories: [{ id: "safe-flat", label: "Мои убежища", icon: "fa:fa-key", color: "#123456" }],
    markers: [
      { id: "m-custom", x: 0.1, y: 0.2, title: "Квартира", categoryId: "safe-flat", links: [{ actorId: "a1", section: "people", entryId: "p1" }] },
      { id: "m-default", x: 0.3, y: 0.4, title: "Бар", categoryId: "bar" },
    ],
  });

  const payload = mod.createWorldMapPointsExport(state, { exportedAt: "2026-09-19T01:00:00.000Z", worldId: "night-city" });
  assert.equal(payload.app, "cyberpunk-remaster-world-city-map-points");
  assert.equal(payload.version, 1);
  assert.equal(payload.exportedAt, "2026-09-19T01:00:00.000Z");
  assert.equal(payload.worldId, "night-city");
  assert.deepEqual(payload.categories, [{ id: "safe-flat", label: "Мои убежища", icon: "fa:fa-key", color: "#123456" }]);
  assert.equal(payload.markers.length, 2);
  assert.deepEqual(payload.markers[0].links, [{ actorId: "a1", section: "people", entryId: "p1" }]);
  assert.equal("regions" in payload, false);
  assert.equal("image" in payload, false);
  assert.equal("backgroundMode" in payload, false);
});

test("2.9.8 point import appends markers, preserves existing data, remaps duplicate ids and adds missing categories", async () => {
  const initial = {
    version: 5,
    title: "Current map",
    categories: [{ id: "old-custom", label: "Старая", icon: "fa:fa-star", color: "#abcdef" }],
    markers: [{ id: "collision", x: 0.9, y: 0.9, title: "Existing", categoryId: "poi" }],
    regions: [{ id: "keep-region", name: "Keep", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
  };
  mockFoundry({ initial });
  const mod = await import(`${mapUrl.href}?v298-import=${Date.now()}`);
  mod.registerWorldCityMapSetting();

  const result = await mod.importWorldMapPointsPayload({
    app: "cyberpunk-remaster-world-city-map-points",
    version: 1,
    categories: [{ id: "new-custom", label: "Новая", icon: "fa:fa-bolt", color: "#112233" }],
    markers: [
      { id: "collision", x: 0.1, y: 0.2, title: "Imported A", categoryId: "new-custom" },
      { id: "free-id", x: 0.2, y: 0.3, title: "Imported B", categoryId: "bar" },
    ],
  });

  const state = mod.getWorldCityMap();
  assert.equal(result.importedMarkers, 2);
  assert.equal(result.addedCategories, 1);
  assert.equal(state.markers.length, 3);
  assert.equal(state.markers.find((marker) => marker.title === "Existing")?.id, "collision");
  assert.notEqual(state.markers.find((marker) => marker.title === "Imported A")?.id, "collision");
  assert.equal(state.markers.find((marker) => marker.title === "Imported B")?.id, "free-id");
  assert.ok(state.categories.some((category) => category.id === "old-custom"));
  assert.ok(state.categories.some((category) => category.id === "new-custom"));
  assert.equal(state.regions.length, 1);
  assert.equal(state.regions[0].id, "keep-region");
});

test("2.9.8 rejects unrelated JSON instead of mutating the shared map", async () => {
  mockFoundry({ initial: { version: 5, markers: [{ id: "keep", x: 0.5, y: 0.5, title: "Keep", categoryId: "poi" }] } });
  const mod = await import(`${mapUrl.href}?v298-invalid=${Date.now()}`);
  mod.registerWorldCityMapSetting();
  await assert.rejects(() => mod.importWorldMapPointsPayload({ app: "other", markers: [] }), /формат|карты|точек/iu);
  assert.equal(mod.getWorldCityMap().markers.length, 1);
});

test("2.9.8 GM controls expose point export/import buttons and a hidden JSON file input", () => {
  assert.match(viewSource, /data-world-map-action="export-points"/u);
  assert.match(viewSource, /data-world-map-action="import-points"/u);
  assert.match(viewSource, /data-world-map-points-import/u);
  assert.match(viewSource, /accept="\.json,application\/json"/u);
  assert.match(viewSource, /createWorldMapPointsExport/u);
  assert.match(viewSource, /importWorldMapPointsPayload/u);
});
