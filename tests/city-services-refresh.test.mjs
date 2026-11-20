import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";

function setup() {
  const env = cityTestEnv();
  game.packs = new Map();
  class ApplicationV2 {
    constructor() {
      this.element = {
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
      };
    }
    get form() {
      return null;
    }
    async render() {
      this.context = await this._prepareContext();
      await this._onRender(this.context, {});
      this.rendered = true;
      this.renderCount = (this.renderCount || 0) + 1;
      return this;
    }
    async close() {
      this._onClose({});
      this.rendered = false;
    }
  }
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2, HandlebarsApplicationMixin: (Base) => Base },
    },
  };
  return env;
}

test("ordinary shops ignore clock-only updates while actor/balance updates still refresh the view", async () => {
  setup();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const shop = await saveCityShop({ name: "Ordinary shop" });
  game.actors.get("aa").inventory = { currency: { credits: 90 } };
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  try {
    const count = app.renderCount;
    await game.time.advance(1);
    Hooks.callAll("updateWorldTime", game.time.worldTime, 1);
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(app.renderCount, count);
    game.actors.get("aa").inventory.currency.credits = 81;
    Hooks.callAll("updateActor", game.actors.get("aa"), {
      "system.currency": true,
    });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(app.renderCount, count + 1);
    assert.match(app.context.bodyHtml, /81 Credits/);
  } finally {
    await app.close();
  }
});

test("night-market clock keys change at opening/closing but remain stable within an access interval", async () => {
  const env = setup();
  const { saveCityShop, grantCityMarketAccess, listCityShops } =
    await import("../runtime/city-shops.mjs");
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const shop = await saveCityShop({
    name: "Night Market",
    market: true,
    opens: 21,
    closes: 6,
  });
  await grantCityMarketAccess({ shopId: shop.id, userId: "a", allowed: true });
  game.user = env.users.get("a");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  try {
    const key = (hour, minute = 0) =>
      app.clockRenderKey(listCityShops(), { hour, minute });
    assert.notEqual(key(20, 59), key(21));
    assert.equal(key(21), key(23, 58));
    assert.equal(key(21), key(1));
    assert.notEqual(key(5, 59), key(6));
    assert.equal(key(6), key(20));
  } finally {
    await app.close();
  }
});

test("calendar clock updates remain live and non-time city tabs have no clock refresh dependency", async () => {
  setup();
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "calendar" });
  try {
    const count = app.renderCount;
    await game.time.advance(1);
    Hooks.callAll("updateWorldTime", game.time.worldTime, 1);
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(app.renderCount, count + 1);
    for (const tab of ["jobs", "npcs", "transfer"]) {
      app.tab = tab;
      assert.equal(app.clockRenderKey(), "");
    }
  } finally {
    await app.close();
  }
});

test("shop refresh follows the selected buyer while background events preserve unsaved editor text", async () => {
  setup();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const shop = await saveCityShop({ name: "Two buyers" });
  game.actors.get("aa").inventory = { currency: { credits: 90 } };
  game.actors.get("bb").inventory = { currency: { credits: 200 } };
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  try {
    app.draftFields.buyerActorId = "bb";
    await app.render(true);
    assert.match(app.context.bodyHtml, /200 Credits/);
    const count = app.renderCount;
    app.draftFields.offerName = "Unsaved product text";
    Hooks.callAll("updateUser", game.user, { "flags.otherModule": 1 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(
      app.renderCount,
      count,
      "typing alone must not invalidate the background key",
    );
    game.actors.get("bb").inventory.currency.credits = 123;
    Hooks.callAll("updateActor", game.actors.get("bb"), {
      "system.currency": true,
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.match(app.context.bodyHtml, /123 Credits/);
    assert.match(app.context.bodyHtml, /Unsaved product text/);
  } finally {
    await app.close();
  }
});

test("remote market invitations and revocations refresh access without unrelated events", async () => {
  const env = setup();
  const { saveCityShop, listCityShops, cityMarketAccess } =
    await import("../runtime/city-shops.mjs");
  const { registerCityJobs } = await import("../runtime/city-jobs.mjs");
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const shop = await saveCityShop({
    name: "Remote invite market",
    market: true,
    opens: 0,
    closes: 0,
  });
  registerCityJobs();
  game.user = env.users.get("a");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  try {
    for (const allowed of [true, false]) {
      const message = {
        id: `remote-invite-${allowed}`,
        whisper: ["a"],
        timestamp: allowed ? 1 : 2,
        author: env.users.get("g"),
        flags: {
          "cyberpunk-remaster": {
            cityMarketInvitation: {
              shopId: shop.id,
              userId: "a",
              allowed,
              version: shop.version,
              shop,
            },
          },
        },
      };
      game.messages.set(message.id, message);
      Hooks.callAll("createChatMessage", message);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const current = listCityShops().find((entry) => entry.id === shop.id);
      assert.equal(cityMarketAccess(current, { hour: 12 }).allowed, allowed);
      assert.equal(app.context.bodyHtml.includes("city-shop-buyer"), allowed);
    }
  } finally {
    await app.close();
  }
});

test("local compendium search and selection do not cause an unrelated full panel refresh", async () => {
  setup();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const shop = await saveCityShop({ name: "Compendium typing" });
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  try {
    const count = app.renderCount;
    const picker = app.ensureCompendiumPicker();
    picker.query = "Ammo";
    picker.selected.add("Compendium.example.items.Item.ammo");
    Hooks.callAll("updateUser", game.user, { "flags.otherModule": 1 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(app.renderCount, count);
    assert.equal(picker.query, "Ammo");
    assert.equal(picker.selected.size, 1);
  } finally {
    await app.close();
  }
});
