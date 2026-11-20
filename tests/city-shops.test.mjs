import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
test("shop stock uses real item prices, seeded order and markup", async () => {
  cityTestEnv();
  const m = await import("../runtime/city-shops.mjs").catch(() => null);
  assert.ok(m, "shop service must exist");
  const items = Array.from({ length: 30 }, (_, i) => ({
    _id: `i${i}`,
    uuid: `Compendium.cyberpunk-equipment-library.weapons.Item.i${i}`,
    name: `Weapon${i}`,
    type: "weapon",
    system: { level: { value: 1 }, price: { value: { sp: 10 } } },
  }));
  const shop = {
    id: "s",
    type: "weapon",
    seed: 42,
    markup: 1.2,
    level: 4,
    size: 8,
  };
  const stock = m.cityShopStock(shop, items);
  assert.equal(stock.length, 8);
  assert.equal(stock[0].priceCredits, 12);
  assert.equal(stock[0].price.value.credits, 12);
  assert.deepEqual(stock, m.cityShopStock(shop, items));
  assert.equal(items[0].system.price.value.sp, 10);
});
test("night market hours, invitation and GM item transfer permissions are enforced", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-shops.mjs").catch(() => null);
  assert.ok(m);
  const shop = await m.saveCityShop({
    markerId: "p",
    name: "Market",
    market: true,
    type: "weapon",
    seed: 1,
    opens: 21,
    closes: 6,
  });
  game.user = e.users.get("a");
  assert.equal(m.cityMarketAccess(shop, { hour: 21 }).allowed, false);
  await game.user.setFlag("cyberpunk-remaster", "cityMarketGrants", {
    [shop.id]: { allowed: true, version: shop.version, shop },
  });
  assert.equal(
    m.cityMarketAccess(shop, { hour: 21 }).allowed,
    false,
    "self-written flag is not a GM invitation",
  );
  game.user = e.users.get("g");
  await m.grantCityMarketAccess({
    shopId: shop.id,
    userId: "a",
    allowed: true,
  });
  assert.doesNotMatch(
    JSON.stringify(
      e.users.get("a").getFlag("cyberpunk-remaster", "cityMarketGrants"),
    ),
    /"seed"|"shop"/,
  );
  game.user = e.users.get("a");
  assert.equal(
    m.cityMarketAccess(shop, { hour: 20, minute: 59 }).allowed,
    false,
  );
  assert.equal(m.cityMarketAccess(shop, { hour: 21 }).allowed, true);
  assert.equal(m.cityMarketAccess(shop, { hour: 5, minute: 59 }).allowed, true);
  assert.equal(m.cityMarketAccess(shop, { hour: 6 }).allowed, false);
  await assert.rejects(
    () =>
      m.giveCityShopItem({
        shopId: shop.id,
        itemId: "x",
        actorId: "aa",
        quantity: 1,
      }),
    /ведущ/,
  );
  game.user = e.users.get("g");
  await m.grantCityMarketAccess({
    shopId: shop.id,
    userId: "a",
    allowed: false,
  });
  game.user = e.users.get("a");
  assert.equal(m.cityMarketAccess(shop, { hour: 21 }).allowed, false);
  assert.doesNotMatch(
    JSON.stringify(e.settings.get("cityServicesV1")),
    /"seed"/,
  );
});
test("GM startup clears old full-shop User caches without altering native invitations", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-shops.mjs");
  await e.users.get("a").setFlag("cyberpunk-remaster", "cityMarketGrants", {
    old: { allowed: true, shop: { seed: 123, services: ["secret"] } },
  });
  assert.equal(typeof m.clearCityMarketCaches, "function");
  await m.clearCityMarketCaches();
  assert.deepEqual(
    e.users.get("a").getFlag("cyberpunk-remaster", "cityMarketGrants"),
    {},
  );
});
