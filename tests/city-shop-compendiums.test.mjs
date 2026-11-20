import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
import * as shops from "../runtime/city-shops.mjs";

const MID = "cyberpunk-remaster",
  LIB = "cyberpunk-equipment-library",
  PACK = "extra.gear";
const uuid = (id) => `Compendium.${PACK}.Item.${id}`;
const source = (id, level = 1, type = "equipment") => ({
  _id: id,
  name: `Extra ${id}`,
  type,
  img: "icons/item.webp",
  system: {
    quantity: 1,
    level: { value: level },
    description: { value: "Extra item" },
    price: { value: { sp: 12 }, per: 10 },
    rules: [{ key: "FlatModifier", value: 2 }],
  },
});
function setup() {
  const env = cityTestEnv(),
    docs = [
      source("a"),
      source("b"),
      source("high", 15),
      source("fx", 0, "effect"),
    ];
  game.modules.set(LIB, { active: true });
  game.packs = new Map([
    ...["implants", "weapons", "gear"].map((name) => [
      `${LIB}.${name}`,
      { documentName: "Item", getDocuments: async () => [] },
    ]),
    [
      PACK,
      {
        collection: PACK,
        documentName: "Item",
        metadata: { label: "Extra gear", type: "Item" },
        getDocuments: async () =>
          docs.map((d) => ({
            ...structuredClone(d),
            id: d._id,
            documentName: "Item",
            toObject: () => structuredClone(d),
          })),
        getDocument: async (id) => {
          const d = docs.find((d) => d._id === id);
          return d
            ? {
                ...structuredClone(d),
                id,
                documentName: "Item",
                toObject: () => structuredClone(d),
              }
            : null;
        },
      },
    ],
    ["extra.actors", { documentName: "Actor", metadata: { label: "Actors" } }],
  ]);
  return { ...env, docs };
}
async function catalog() {
  const mod = await import("../runtime/city-shop-compendiums.mjs").catch(
    () => null,
  );
  assert.equal(
    typeof mod?.listCityShopCompendiums,
    "function",
    "GM needs an Item-compendium picker",
  );
  return mod;
}
async function add(args) {
  assert.equal(
    typeof shops.addCityShopCompendiumItems,
    "function",
    "shops need compendium batch selection",
  );
  return shops.addCityShopCompendiumItems(args);
}

test("GM picker lists Item packs, filters effects and keeps full UUIDs, price and packaging", async () => {
  setup();
  const c = await catalog();
  assert.ok(c.listCityShopCompendiums().some((p) => p.id === PACK));
  assert.ok(!c.listCityShopCompendiums().some((p) => p.id === "extra.actors"));
  const rows = await c.loadCityShopCompendium(PACK);
  assert.deepEqual(
    rows.map((r) => r.uuid),
    [uuid("a"), uuid("b"), uuid("high")],
  );
  assert.equal(rows[0].priceCredits, 12);
  assert.equal(rows[0].quantityPerPurchase, 10);
  await assert.rejects(
    () => c.loadCityShopCompendium("extra.actors"),
    /компенд|Item/iu,
  );
});

test("selected compendium goods persist in random pool across rerolls, without duplicate entries or public Item sources", async () => {
  setup();
  const shop = await shops.saveCityShop({
    name: "Medicine",
    type: "medicine",
    size: 10,
    level: 4,
    markup: 2,
  });
  await add({
    shopId: shop.id,
    uuids: [uuid("a"), uuid("a"), uuid("b")],
    mode: "random",
  });
  await add({ shopId: shop.id, uuids: [uuid("a")], mode: "random" });
  const saved = await shops.saveCityShop({ id: shop.id, seed: 44 });
  assert.equal(saved.randomOffers.length, 2);
  const rows = shops.cityShopStock(saved, []);
  assert.equal(rows.length, 2, "explicit selections bypass keyword filter");
  assert.ok(
    rows.every((r) => r.priceCredits === 24 && r.quantityPerPurchase === 10),
  );
  const canonical = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: uuid("a"),
  });
  assert.deepEqual(canonical.source.system.rules, [
    { key: "FlatModifier", value: 2 },
  ]);
  assert.equal(canonical.source._id, undefined);
  const publicData = JSON.parse(game.settings.get(MID, "cityServicesV1"))
    .shops[0];
  assert.doesNotMatch(JSON.stringify(publicData), /"source"|FlatModifier/);
  assert.deepEqual(shops.cityShopStock(publicData, []), rows);
});

test("random compendium pool participates in seeded size-limited selection and respects max level, markup and UUID deduplication", () => {
  setup();
  const extra = [source("a"), source("b"), source("high", 15)].map((s) => ({
    id: uuid(s._id),
    uuid: uuid(s._id),
    name: s.name,
    type: s.type,
    img: s.img,
    level: s.system.level.value,
    basePrice: s.system.price,
    quantityPerPurchase: 10,
  }));
  const shop = {
    type: "general",
    level: 3,
    size: 1,
    markup: 1.5,
    randomOffers: extra,
  };
  const library = [{ ...source("a"), uuid: uuid("a") }];
  const selected = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const rows = shops.cityShopStock({ ...shop, seed }, library);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priceCredits, 18);
    assert.notEqual(rows[0].id, uuid("high"));
    selected.add(rows[0].id);
    assert.deepEqual(rows, shops.cityShopStock({ ...shop, seed }, library));
  }
  assert.equal(
    selected.size,
    2,
    "pool goods should be sampled, not permanently appended",
  );
  assert.equal(shops.cityShopStock({ ...shop, size: 10 }, library).length, 2);
});

test("fixed compendium additions preserve item mechanics and repeated import does not clone them again", async () => {
  setup();
  const shop = await shops.saveCityShop({ name: "Fixed" });
  await add({ shopId: shop.id, uuids: [uuid("a"), uuid("b")], mode: "fixed" });
  await add({ shopId: shop.id, uuids: [uuid("a")], mode: "fixed" });
  const saved = shops.listCityShops()[0];
  assert.equal(saved.customOffers.length, 2);
  assert.equal(
    shops.cityShopStock({ ...saved, size: 1, level: 0 }, []).length,
    2,
    "fixed goods remain permanently available",
  );
  const resolved = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: saved.customOffers[0].id,
  });
  assert.equal(resolved.source.system.rules[0].value, 2);
});

test("invalid compendium batches are atomic and player mutations are rejected", async () => {
  const e = setup(),
    shop = await shops.saveCityShop({ name: "Store" });
  await assert.rejects(
    () =>
      add({ shopId: shop.id, uuids: [uuid("a"), uuid("fx")], mode: "random" }),
    /физическ|предмет/iu,
  );
  assert.equal(shops.listCityShops()[0].randomOffers?.length || 0, 0);
  await assert.rejects(
    () => add({ shopId: shop.id, uuids: ["Item.world"], mode: "random" }),
    /компенд/iu,
  );
  await assert.rejects(
    () => add({ shopId: shop.id, uuids: [uuid("a")], mode: "bad" }),
    /режим/iu,
  );
  game.user = e.users.get("a");
  const c = await catalog();
  assert.throws(() => c.listCityShopCompendiums(), /ведущ/iu);
  await assert.rejects(
    () => add({ shopId: shop.id, uuids: [uuid("a")], mode: "random" }),
    /ведущ/iu,
  );
});

test("batch re-reads shop after asynchronous compendium loading, preserving other edits and rejecting deletion", async () => {
  setup();
  const shop = await shops.saveCityShop({ name: "Before" });
  const pack = game.packs.get(PACK),
    original = pack.getDocument;
  let release, entered;
  const ready = new Promise((r) => {
    entered = r;
  });
  pack.getDocument = async (id) => {
    entered();
    await new Promise((r) => {
      release = r;
    });
    return original(id);
  };
  const pending = add({ shopId: shop.id, uuids: [uuid("a")], mode: "random" });
  await ready;
  await shops.saveCityShop({ id: shop.id, name: "After" });
  release();
  await pending;
  assert.equal(shops.listCityShops()[0].name, "After");
  let releaseDeleted, enteredDeleted;
  const deletedReady = new Promise((r) => {
    enteredDeleted = r;
  });
  pack.getDocument = async (id) => {
    enteredDeleted();
    await new Promise((r) => {
      releaseDeleted = r;
    });
    return original(id);
  };
  const deleted = add({ shopId: shop.id, uuids: [uuid("b")], mode: "random" });
  await deletedReady;
  await shops.deleteCityShop(shop.id);
  releaseDeleted();
  await assert.rejects(() => deleted, /удалён|недоступен/iu);
});

test("random pool removal persists and copied goods can be bought without the source pack or Library", async () => {
  setup();
  const shop = await shops.saveCityShop({ name: "Extra only", size: 10 });
  await add({ shopId: shop.id, uuids: [uuid("a"), uuid("b")], mode: "random" });
  game.packs.delete(PACK);
  game.modules.get(LIB).active = false;
  const r = await shops.getCityShopOfferSource({
    shopId: shop.id,
    offerId: uuid("a"),
  });
  assert.equal(r.source.type, "equipment");
  assert.equal(typeof shops.removeCityShopRandomItem, "function");
  await shops.removeCityShopRandomItem({ shopId: shop.id, uuid: uuid("a") });
  const saved = await shops.saveCityShop({ id: shop.id, seed: 20 });
  assert.deepEqual(
    saved.randomOffers.map((r) => r.uuid),
    [uuid("b")],
  );
  await assert.rejects(
    () => shops.getCityShopOfferSource({ shopId: shop.id, offerId: uuid("a") }),
    /ассортимент|удалён|Library/iu,
  );
});

test("only GM sees the searchable multi-select compendium picker and random-pool removal controls", async () => {
  const e = setup();
  const { cityServicesHtml } = await import("../runtime/city-services-ui.mjs");
  const shop = {
    id: "shop",
    name: "Store",
    type: "general",
    randomOffers: [
      { id: uuid("a"), uuid: uuid("a"), name: "Extra a", level: 1 },
    ],
  };
  const state = { tab: "shops", shops: [shop], shopId: "shop", items: [] };
  const html = cityServicesHtml(state);
  assert.match(html, /data-service-compendium-pack/);
  assert.match(html, /data-service-compendium-query/);
  assert.match(html, /data-service-action="compendium-add-random"/);
  assert.match(html, /data-service-action="compendium-add-fixed"/);
  assert.match(html, /data-service-action="compendium-remove"/);
  game.user = e.users.get("a");
  assert.doesNotMatch(
    cityServicesHtml(state),
    /data-service-compendium-pack|data-service-action="compendium-remove"/,
  );
});

test("late compendium loads and saves cannot erase choices made in another pack", async () => {
  setup();
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
      await this._onRender({}, {});
      this.rendered = true;
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
  const pack = game.packs.get(PACK),
    getDocuments = pack.getDocuments;
  const fastId = "extra.fast",
    fastUuid = `Compendium.${fastId}.Item.a`;
  const fast = { ...pack, collection: fastId };
  game.packs.set(fastId, fast);
  const shop = await shops.saveCityShop({ name: "Async store" });
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops", shopId: shop.id });
  try {
    let releaseLoad, enteredLoad;
    const loaded = new Promise((r) => {
      enteredLoad = r;
    });
    pack.getDocuments = async () => {
      enteredLoad();
      await new Promise((r) => {
        releaseLoad = r;
      });
      return getDocuments();
    };
    const oldLoad = app.loadCompendium(PACK);
    await loaded;
    await app.loadCompendium(fastId);
    app.compendium.selected.add(fastUuid);
    releaseLoad();
    await oldLoad;
    assert.equal(app.compendium.packId, fastId);
    assert.ok(
      app.compendium.selected.has(fastUuid),
      "late load cannot replace new pack choices",
    );
    pack.getDocuments = getDocuments;
    let releaseSave, enteredSave;
    const saving = new Promise((r) => {
      enteredSave = r;
    });
    const getDocument = fast.getDocument;
    fast.getDocument = async (id) => {
      enteredSave();
      await new Promise((r) => {
        releaseSave = r;
      });
      return getDocument(id);
    };
    const oldSave = app.action({
      dataset: { serviceAction: "compendium-add-random" },
    });
    await saving;
    await app.loadCompendium(PACK);
    app.compendium.selected.add(uuid("b"));
    releaseSave();
    await oldSave;
    assert.ok(
      app.compendium.selected.has(uuid("b")),
      "late save cannot clear choices made after changing packs",
    );
    assert.equal(
      shops.listCityShops()[0].randomOffers[0].uuid,
      fastUuid,
      "the approved original batch still saves to the original shop",
    );
  } finally {
    await app.close();
  }
});

test("an explicit snapshot overrides the same Library UUID even when its saved level is above the shop limit", () => {
  setup();
  const shop = {
    type: "general",
    level: 3,
    size: 10,
    randomOffers: [
      {
        id: uuid("a"),
        uuid: uuid("a"),
        name: "High-level snapshot",
        type: "equipment",
        level: 15,
        basePrice: { value: { sp: 100 } },
      },
    ],
  };
  const live = { ...source("a", 1), uuid: uuid("a") };
  assert.equal(
    shops.cityShopStock(shop, [live]).length,
    0,
    "do not offer live low-level terms but deliver the different stored snapshot",
  );
});
