import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
import * as shops from "../runtime/city-shops.mjs";

const MID = "cyberpunk-remaster";
const LIB = "cyberpunk-equipment-library";
const uuid = (pack, id) => `Compendium.${LIB}.${pack}.Item.${id}`;
const item = (id, type = "equipment", price = { sp: 10 }, extra = {}) => ({
  _id: id,
  uuid: uuid("gear", id),
  name: `Item ${id}`,
  img: "icons/item.webp",
  type,
  system: {
    quantity: 1,
    level: { value: 0 },
    description: { value: "Original description" },
    price: { value: price, per: 1 },
    rules: [{ key: "FlatModifier", value: 2 }],
  },
  ...extra,
});
function library(packs = {}) {
  const env = cityTestEnv();
  game.modules.set(LIB, { active: true });
  game.packs = new Map(
    ["implants", "weapons", "gear"].map((name) => [
      `${LIB}.${name}`,
      {
        documentName: "Item",
        async getDocuments() {
          return structuredClone(packs[name] || []);
        },
        async getDocument(id) {
          return structuredClone((packs[name] || []).find((i) => i._id === id));
        },
      },
    ]),
  );
  return env;
}

test("catalog loads only active Library physical Item packs with full UUID identities", async () => {
  library({
    implants: [item("same", "weapon"), item("fx", "effect")],
    weapons: [item("same", "weapon"), item("act", "action")],
    gear: [item("bag", "backpack")],
  });
  game.packs.set(`${MID}.cyberpunk-items`, {
    async getDocuments() {
      return [item("wrong")];
    },
  });
  const rows = await shops.loadCityShopItems({ refresh: true });
  assert.deepEqual(
    rows.map((i) => i.uuid),
    [uuid("implants", "same"), uuid("weapons", "same"), uuid("gear", "bag")],
  );
  assert.equal(
    shops.cityShopStock({ type: "general", size: 10 }, rows).length,
    3,
  );
});

test("catalog refresh replaces cached Library documents and inactive Library never falls back", async () => {
  const packs = { gear: [item("old")] };
  library(packs);
  assert.equal(
    (await shops.loadCityShopItems({ refresh: true }))[0]._id,
    "old",
  );
  packs.gear = [item("new")];
  assert.equal((await shops.loadCityShopItems())[0]._id, "old");
  assert.equal(
    (await shops.loadCityShopItems({ refresh: true }))[0]._id,
    "new",
  );
  game.modules.get(LIB).active = false;
  await assert.rejects(() => shops.loadCityShopItems(), /Library|библиотек/iu);
});

test("canonical resolution discards a shop deleted while its Library documents load", async () => {
  library({ gear: [item("a")] });
  const shop = await shops.saveCityShop({
    name: "Store",
    type: "general",
    size: 10,
  });
  let loaded;
  const waiting = new Promise((resolve) => {
    loaded = resolve;
  });
  let release;
  game.packs.get(`${LIB}.gear`).getDocuments = async () => {
    loaded();
    await new Promise((resolve) => {
      release = resolve;
    });
    return [item("a")];
  };
  const pending = shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: uuid("gear", "a"),
  });
  await waiting;
  await shops.deleteCityShop(shop.id);
  release();
  await assert.rejects(pending, /удалён|недоступен/);
});

test("stock converts serialized coin values once, marks unknown prices, and preserves pack size", () => {
  cityTestEnv();
  const inputs = [
    item("mix", "equipment", { sp: 2, gp: 3, pp: 1, cp: 5, credits: 4 }),
    item("empty", "equipment", {}),
    item("unknown", "equipment", { upb: 5 }),
    item("free", "equipment", { sp: 0 }),
    item("bad", "equipment", { sp: -1 }),
    item("pack", "ammo", { cp: 3 }),
  ];
  inputs.at(-1).system.price.per = 10;
  const rows = shops.cityShopStock(
    { type: "general", size: 20, markup: 1.2 },
    inputs,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(uuid("gear", "mix")).priceCredits, 164);
  assert.equal(byId.get(uuid("gear", "empty")).priceCredits, null);
  assert.equal(byId.get(uuid("gear", "unknown")).priceCredits, null);
  assert.equal(byId.get(uuid("gear", "free")).priceCredits, 0);
  assert.equal(byId.get(uuid("gear", "bad")).priceCredits, null);
  assert.equal(byId.get(uuid("gear", "pack")).priceCredits, 1);
  assert.equal(byId.get(uuid("gear", "pack")).quantityPerPurchase, 10);
  assert.deepEqual(byId.get(uuid("gear", "mix")).price.value, { credits: 164 });
});

test("partial shop edits preserve custom offers, overrides, exclusions and image across rerolls", async () => {
  library({ gear: [item("a"), item("b")] });
  const shop = await shops.saveCityShop({
    name: "Store",
    type: "general",
    size: 10,
    level: 0,
    img: "https://example.test/shop.webp",
  });
  await shops.saveCityShopOffer({
    shopId: shop.id,
    offerId: uuid("gear", "a"),
    name: "Edited",
    priceCredits: 42,
  });
  await shops.deleteCityShopOffer({
    shopId: shop.id,
    offerId: uuid("gear", "b"),
  });
  const custom = await shops.saveCityShopOffer({
    shopId: shop.id,
    name: "Own gear",
    description: "Own text",
    priceCredits: 3,
    img: "worlds/test/own.webp",
  });
  const edited = await shops.saveCityShop({ id: shop.id, seed: 99 });
  assert.equal(edited.name, "Store");
  assert.equal(edited.level, 0);
  assert.equal(edited.img, "https://example.test/shop.webp");
  const rows = shops.cityShopStock(edited, await shops.loadCityShopItems());
  assert.equal(rows.find((r) => r.id === uuid("gear", "a")).priceCredits, 42);
  assert.equal(
    rows.some((r) => r.id === uuid("gear", "b")),
    false,
  );
  assert.equal(rows.find((r) => r.id === custom.id).name, "Own gear");
  const resolved = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: custom.id,
  });
  assert.equal(resolved.source.type, "equipment");
  assert.equal(resolved.source.system.description.value, "Own text");
  assert.doesNotMatch(
    JSON.stringify(JSON.parse(game.settings.get(MID, "cityServicesV1"))),
    /FlatModifier|"source"/u,
  );
});

test("custom UUID copies preserve mechanics while canonical resolver rejects spoofed or removed offers", async () => {
  library({ gear: [item("a")] });
  const original = item("world", "weapon", { gp: 2 });
  globalThis.fromUuid = async (id) =>
    id === "Item.world"
      ? { documentName: "Item", toObject: () => structuredClone(original) }
      : null;
  const shop = await shops.saveCityShop({ name: "Store", size: 10 });
  const copy = await shops.saveCityShopOffer({
    shopId: shop.id,
    sourceUuid: "Item.world",
    name: "Custom weapon",
    priceCredits: 25,
  });
  await shops.saveCityShopOffer({
    shopId: shop.id,
    offerId: copy.id,
    img: "icons/new.webp",
    sourceUuid: "",
  });
  const resolved = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: copy.id,
    source: { type: "effect" },
  });
  assert.equal(resolved.source.type, "weapon");
  assert.deepEqual(resolved.source.system.rules, [
    { key: "FlatModifier", value: 2 },
  ]);
  assert.equal(resolved.source.name, "Custom weapon");
  assert.equal(resolved.source.img, "icons/new.webp");
  assert.equal(resolved.source._id, undefined);
  resolved.source.system.rules[0].value = 100;
  assert.equal(
    (await shops.getCityShopOfferSource({ shopId: shop.id, offerId: copy.id }))
      .source.system.rules[0].value,
    2,
  );
  await shops.deleteCityShopOffer({ shopId: shop.id, offerId: copy.id });
  await assert.rejects(
    () => shops.getCityShopOfferSource({ shopId: shop.id, offerId: copy.id }),
    /ассортимент|удал/iu,
  );
});

test("deleted shops retain tombstones and suppress old market invitations without removing receipts", async () => {
  const e = library();
  const shop = await shops.saveCityShop({ name: "Market", market: true });
  await shops.grantCityMarketAccess({
    shopId: shop.id,
    userId: "a",
    allowed: true,
  });
  const receipt = {
    flags: { [MID]: { cityShopPurchase: { shopId: shop.id } } },
  };
  e.journals.set("receipt", receipt);
  await shops.deleteCityShop(shop.id);
  assert.equal(shops.listCityShops().length, 0);
  assert.equal(shops.cityMarketAccess(shop).allowed, false);
  assert.equal(e.journals.get("receipt"), receipt);
  game.user = e.users.get("a");
  assert.equal(shops.listCityShops().length, 0);
  assert.equal(shops.cityMarketGrant(shop.id), null);
  assert.equal(shops.cityMarketAccess(shop, { hour: 21 }).allowed, false);
  game.user = e.users.get("g");
  await assert.rejects(
    () => shops.saveCityShop({ id: shop.id, name: "Resurrect" }),
    /удал/iu,
  );
});

test("manual equipment edits update native Item price and remain usable without Library", async () => {
  const e = cityTestEnv();
  const shop = await shops.saveCityShop({ name: "Independent store" });
  const row = await shops.saveCityShopOffer({
    shopId: shop.id,
    name: "Own gear",
    priceCredits: 1,
  });
  await shops.saveCityShopOffer({
    shopId: shop.id,
    offerId: row.id,
    priceCredits: 7,
  });
  const resolved = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: row.id,
  });
  assert.equal(resolved.offer.priceCredits, 7);
  assert.deepEqual(resolved.source.system.price, { value: { sp: 7 }, per: 1 });
  game.user = e.users.get("a");
  await assert.rejects(
    () => shops.getCityShopOfferSource({ shopId: shop.id, offerId: row.id }),
    /ведущ/iu,
  );
});

test("GM gifting resolves Library packs and custom sources in units per purchase", async () => {
  const pack = item("pack", "ammo");
  pack.system.price.per = 10;
  library({ gear: [pack] });
  const shop = await shops.saveCityShop({
    name: "Store",
    type: "weapon",
    size: 10,
  });
  const custom = await shops.saveCityShopOffer({
    shopId: shop.id,
    name: "Own",
    priceCredits: 1,
  });
  const gifts = await shops.giveCityShopItem({
    shopId: shop.id,
    itemId: uuid("gear", "pack"),
    actorId: "aa",
    quantity: 3,
  });
  assert.equal(gifts[0].system.quantity, 30);
  assert.equal(gifts[0]._id, undefined);
  game.modules.get(LIB).active = false;
  const ownGift = await shops.giveCityShopItem({
    shopId: shop.id,
    itemId: custom.id,
    actorId: "aa",
    quantity: 2,
  });
  assert.equal(ownGift[0].system.quantity, 2);
});

test("shop and offer writes require active GM and reject executable images or nonphysical UUID sources", async () => {
  const e = library({ gear: [item("a")] });
  const shop = await shops.saveCityShop({ name: "Store" });
  await assert.rejects(
    () => shops.saveCityShop({ id: shop.id, img: "javascript:alert(1)" }),
    /изображен|путь/iu,
  );
  await assert.rejects(
    () =>
      shops.saveCityShopOffer({
        shopId: shop.id,
        name: "Unsafe",
        img: "data:image/svg+xml,bad",
        priceCredits: 1,
      }),
    /изображен|путь/iu,
  );
  globalThis.fromUuid = async () => ({
    documentName: "Item",
    toObject: () => item("effect", "effect"),
  });
  await assert.rejects(
    () =>
      shops.saveCityShopOffer({ shopId: shop.id, sourceUuid: "Item.effect" }),
    /физическ|предмет/iu,
  );
  await assert.rejects(
    () =>
      shops.saveCityShopOffer({
        shopId: shop.id,
        name: "Invalid price",
        priceCredits: -1,
      }),
    /цен/iu,
  );
  game.user = e.users.get("a");
  await assert.rejects(
    () =>
      shops.saveCityShopOffer({
        shopId: shop.id,
        name: "Cheat",
        priceCredits: 0,
      }),
    /ведущ/iu,
  );
  await assert.rejects(() => shops.deleteCityShop(shop.id), /ведущ/iu);
  game.user = { id: "other-gm", isGM: true };
  await assert.rejects(
    () =>
      shops.deleteCityShopOffer({
        shopId: shop.id,
        offerId: uuid("gear", "a"),
      }),
    /активн/iu,
  );
});

for (const [kind, ownership, lastModifiedBy] of [
  ["player-owned", { default: 0, a: 3 }, "g"],
  ["player-created", { default: 0 }, "a"],
  ["public", { default: 1 }, "g"],
  ["missing-native-provenance", { default: 0 }, undefined],
]) {
  test(`${kind} flagged Journal cannot supply shop stock to the active GM`, async () => {
    const e = cityTestEnv();
    const forged = {
      id: "forged-journal",
      ownership,
      _stats: { lastModifiedBy },
      flags: {
        [MID]: {
          cityShop: {
            id: "forged-shop",
            name: "Forged shop",
            version: 1,
            customOffers: [
              {
                id: "custom:free",
                name: "Free forged weapon",
                type: "weapon",
                img: "icons/item.webp",
                description: "",
                priceCredits: 0,
                quantityPerPurchase: 1,
                uuid: "",
                source: item("free", "weapon"),
              },
            ],
          },
        },
      },
    };
    e.journals.set(forged.id, forged);
    assert.equal(
      shops.listCityShops().some((s) => s.id === "forged-shop"),
      false,
    );
    await assert.rejects(
      () =>
        shops.getCityShopOfferSource({
          shopId: "forged-shop",
          offerId: "custom:free",
        }),
      /удал|недоступен/iu,
    );
    await assert.rejects(
      () => shops.deleteCityShop("forged-shop"),
      /удал|недоступен/iu,
    );
  });
}

test("forged tombstones cannot shadow canonical private shops during resolve, update or delete", async () => {
  const e = cityTestEnv();
  const shop = await shops.saveCityShop({ name: "Trusted" });
  const row = await shops.saveCityShopOffer({
    shopId: shop.id,
    name: "Trusted offer",
    priceCredits: 5,
  });
  const [nativeId, native] = [...e.journals.entries()][0];
  native.ownership = { default: 0, a: 0, g: 3 };
  native._stats = { lastModifiedBy: "g" };
  const forged = {
    id: "forged-tombstone",
    ownership: { default: 0, a: 3 },
    _stats: { lastModifiedBy: "a" },
    flags: { [MID]: { cityShop: { id: shop.id, deleted: true } } },
  };
  e.journals.delete(nativeId);
  e.journals.set(forged.id, forged);
  e.journals.set(nativeId, native);
  assert.equal(
    (await shops.getCityShopOfferSource({ shopId: shop.id, offerId: row.id }))
      .offer.name,
    "Trusted offer",
  );
  await shops.saveCityShop({ id: shop.id, name: "Updated trusted" });
  assert.equal(native.flags[MID].cityShop.name, "Updated trusted");
  assert.equal(forged.flags[MID].cityShop.name, undefined);
  await shops.deleteCityShop(shop.id);
  assert.equal(native.flags[MID].cityShop.deleted, true);
  assert.equal(shops.listCityShops().length, 0);
});
