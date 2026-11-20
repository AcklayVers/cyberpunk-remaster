import test from "node:test";
import assert from "node:assert/strict";
const url = new URL("../runtime/world-city-map-runtime.mjs", import.meta.url);
test("standalone opens once without character and reuses window with focus", async () => {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  let count = 0,
    closeCount = 0;
  class App {
    constructor() {
      count++;
      this.position = {};
    }
    async render() {
      await new Promise((r) => setTimeout(r, 5));
      this.rendered = true;
      return this;
    }
    bringToFront() {
      this.front = true;
    }
    async close() {
      closeCount++;
      this.rendered = false;
    }
  }
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2: App, HandlebarsApplicationMixin: (c) => c },
    },
  };
  globalThis.Hooks = { once() {}, on() {} };
  globalThis.game = {
    system: { id: "sf2e" },
    user: { id: "u", isGM: false },
    actors: new Map(),
    modules: new Map(),
    settings: { register() {} },
  };
  const m = await import(url.href).catch(() => null);
  assert.ok(m, "standalone runtime must exist");
  const [a, b] = await Promise.all([
    m.openWorldCityMap(),
    m.openWorldCityMap(),
  ]);
  assert.equal(a, b);
  assert.equal(count, 1);
  let focused = "";
  a.mapController = {
    focusMarker(id) {
      focused = id;
    },
    setActiveActor() {},
  };
  const c = await m.openWorldCityMap({
    focusMarkerId: "bar",
    activeActorId: "foreign",
  });
  assert.equal(c, a);
  assert.equal(focused, "bar");
  assert.equal(a.activeActorId, "");
  assert.equal(closeCount, 0);
});

test("explicit empty Actor opens group even when character is assigned", async () => {
  const m = await import(url.href);
  const old = await m.openWorldCityMap();
  await old.close();
  game.user.character = { id: "hero" };
  game.actors.set("hero", {
    id: "hero",
    testUserPermission() {
      return true;
    },
  });
  const app = await m.openWorldCityMap({ activeActorId: "" });
  assert.equal(app.activeActorId, "");
});
