import assert from "node:assert/strict";
import test from "node:test";

function environment() {
  const actors = new Map(
    ["owned", "foreign"].map((id) => [
      id,
      {
        id,
        name: id === "owned" ? "Соло" : "Нетраннер",
        flags: {},
        testUserPermission(user) {
          return user.isGM || (id === "owned" && user.id === "u1");
        },
        getFlag(scope, key) {
          return this.flags[scope]?.[key];
        },
        async setFlag(scope, key, value) {
          (this.flags[scope] ??= {})[key] = structuredClone(value);
        },
        async unsetFlag(scope, key) {
          delete this.flags[scope]?.[key];
        },
      },
    ]),
  );
  let world = JSON.stringify({ version: 5, markers: [], regions: [] });
  globalThis.game = {
    user: { id: "u1", isGM: false },
    actors,
    settings: {
      register() {},
      get() {
        return world;
      },
      async set(_scope, _key, value) {
        world = value;
      },
    },
  };
  globalThis.Hooks = { callAll() {} };
  return actors;
}

test("position is stored on the owned Actor and survives switching characters", async () => {
  const actors = environment();
  const service = await import("../runtime/world-city-map-positions.mjs");
  await service.setWorldMapActorPosition("owned", {
    x: 0.2,
    y: 0.3,
    shared: true,
  });
  const saved = actors
    .get("owned")
    .getFlag("cyberpunk-remaster", "worldCityMapPositionV1");
  assert.equal(saved.x, 0.2);
  assert.equal(saved.y, 0.3);
  assert.equal(saved.shared, true);
  assert.equal(service.getWorldMapPositionMarkers()[0].title, "Соло");
  assert.equal(
    actors
      .get("foreign")
      .getFlag("cyberpunk-remaster", "worldCityMapPositionV1"),
    undefined,
  );
});

test("players cannot move another Actor or the party", async () => {
  environment();
  const service = await import("../runtime/world-city-map-positions.mjs");
  await assert.rejects(
    () => service.setWorldMapActorPosition("foreign", { x: 0.2, y: 0.3 }),
    /владеете/u,
  );
  await assert.rejects(
    () => service.setWorldMapPartyPosition({ x: 0.2, y: 0.3 }),
    /GM/u,
  );
});

test("unshared positions are omitted for other players and visible to GM", async () => {
  environment();
  const service = await import("../runtime/world-city-map-positions.mjs");
  await service.setWorldMapActorPosition("owned", { x: 0.2, y: 0.3 });
  globalThis.game.user = { id: "u2", isGM: false };
  assert.deepEqual(service.getWorldMapPositionMarkers(), []);
  globalThis.game.user.isGM = true;
  assert.equal(service.getWorldMapPositionMarkers()[0].id, "actor:owned");
  await service.setWorldMapPartyPosition({ x: 0.5, y: 0.6, visible: false });
  globalThis.game.user.isGM = false;
  assert.deepEqual(service.getWorldMapPositionMarkers(), []);
});

test("invalid coordinates cannot replace a saved position and clearing removes it", async () => {
  environment();
  const service = await import("../runtime/world-city-map-positions.mjs");
  await service.setWorldMapActorPosition("owned", { x: 0, y: 1 });
  await assert.rejects(
    () => service.setWorldMapActorPosition("owned", { x: Infinity, y: 0.3 }),
    /координат/u,
  );
  assert.equal(service.getWorldMapPositionMarkers()[0].y, 1);
  await service.setWorldMapActorPosition("owned", null);
  assert.deepEqual(service.getWorldMapPositionMarkers(), []);
});
