import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";

const item = (id, price) => ({
  _id: id,
  uuid: `Compendium.cyberpunk-equipment-library.gear.Item.${id}`,
  name: id,
  img: `icons/${id}.webp`,
  type: "equipment",
  system: { level: { value: 2 }, price: { value: price, per: 10 } },
});
const shop = {
  id: "shop",
  version: 3,
  name: "Market",
  type: "general",
  seed: 1,
  size: 20,
  level: 4,
  markup: 1,
};

test("shop browsing shows owned character balance, Credits, pack size and item image", async () => {
  cityTestEnv({ gm: false });
  game.actors.get("aa").inventory = { currency: { credits: 87 } };
  const { cityServicesHtml } = await import("../runtime/city-services-ui.mjs");
  const html = cityServicesHtml({
    tab: "shops",
    shopId: "shop",
    shops: [shop],
    actorId: "aa",
    items: [item("Cable", { gp: 2, sp: 5 })],
  });
  assert.match(html, /data-service-field="buyerActorId"/);
  assert.match(html, /87 Credits/);
  assert.doesNotMatch(html, /<option value="bb"/);
  assert.match(html, /src="icons\/Cable.webp"/);
  assert.match(html, /25 Credits/);
  assert.match(html, /10 ед/);
  assert.match(html, /data-service-action="item-buy"/);
  assert.doesNotMatch(html, /data-service-action="item-give"/);
});

test("unknown-priced offers cannot be bought while GM sees offer and shop editors", async () => {
  cityTestEnv();
  const { cityServicesHtml } = await import("../runtime/city-services-ui.mjs");
  const html = cityServicesHtml({
    tab: "shops",
    shopId: "shop",
    shops: [shop],
    items: [item("Unknown", {})],
  });
  assert.match(html, /Цена не задана/);
  assert.match(html, /data-service-action="item-buy"[^>]*disabled/);
  for (const action of [
    "shop-delete",
    "shop-refresh",
    "offer-new",
    "offer-edit",
    "offer-delete",
    "image-pick",
  ])
    assert.match(html, new RegExp(`data-service-action="${action}"`));
  assert.match(html, /Обновить карточку/);
  assert.match(html, /Бесплатно выдать/);
  assert.match(html, /data-service-image-file="shopImg"/);
  assert.match(html, /data-service-field="offerSourceUuid"/);
});

test("deleted-shop purchase history remains visible and uncertain receipts can still be reviewed", async () => {
  const env = cityTestEnv();
  const receipt = {
    id: "past-receipt",
    shopId: "deleted-shop",
    actorId: "aa",
    userId: "a",
    offerId: "custom:past",
    itemName: "Past purchase",
    quantity: 1,
    totalCredits: 40,
    status: "uncertain",
  };
  await JournalEntry.create({
    ownership: { default: 0 },
    flags: { "cyberpunk-remaster": { cityShopPurchase: receipt } },
  });
  await ChatMessage.create({
    whisper: ["a", "g"],
    flags: { "cyberpunk-remaster": { cityShopPurchaseReceipt: receipt } },
  });
  const { cityServicesHtml } = await import("../runtime/city-services-ui.mjs");
  const context = { tab: "shops", shops: [], shopId: "", actorId: "aa" };
  const gm = cityServicesHtml(context);
  assert.match(gm, /Past purchase/);
  assert.match(gm, /data-receipt-id="past-receipt"/);
  game.user = env.users.get("a");
  const player = cityServicesHtml(context);
  assert.match(player, /Past purchase/);
  assert.doesNotMatch(player, /data-service-action="purchase-resolve"/);
});

const appListeners = new Map();
function appEnvironment() {
  const env = cityTestEnv();
  game.packs = new Map();
  const listeners = appListeners;
  listeners.clear();
  class ApplicationV2 {
    constructor() {
      this.element = {
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: (name, listener) => listeners.set(name, listener),
      };
    }
    get form() {
      return null;
    }
    async render() {
      this.context = await this._prepareContext();
      await this._onRender(this.context, {});
      this.rendered = true;
      return this;
    }
    _onRender() {}
    bringToFront() {}
    _onClose() {
      this.rendered = false;
    }
    async close() {
      this._onClose({});
    }
  }
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: (Base) => Base,
        DialogV2: { confirm: async () => true },
      },
    },
  };
  return { ...env, listeners };
}

test("switching shops preserves each shop draft without overwriting another shop", async () => {
  const { listeners } = appEnvironment();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const first = await saveCityShop({ name: "First" }),
    second = await saveCityShop({ name: "Second" });
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops", shopId: first.id });
  listeners.get("input")({
    target: { dataset: { serviceField: "shopName" }, value: "First unsaved" },
  });
  listeners.get("change")({
    target: {
      dataset: { serviceField: "shopId" },
      value: second.id,
      matches: () => false,
    },
  });
  await app.render(true);
  listeners.get("input")({
    target: { dataset: { serviceField: "shopName" }, value: "Second unsaved" },
  });
  listeners.get("change")({
    target: {
      dataset: { serviceField: "shopId" },
      value: first.id,
      matches: () => false,
    },
  });
  await app.render(true);
  assert.match(app.context.bodyHtml, /value="First unsaved"/);
  assert.doesNotMatch(app.context.bodyHtml, /value="Second unsaved"/);
  assert.equal(app.form, null);
  await app.close();
});

test("image upload uses native FilePicker world storage and keeps its result in the selected draft", async () => {
  appEnvironment();
  const calls = [];
  foundry.applications.apps = {
    FilePicker: {
      implementation: class {
        static async browse(source, path) {
          calls.push(["browse", source, path]);
          return { target: path };
        }
        static async upload(source, path, file) {
          calls.push(["upload", source, path, file.name]);
          return { path: `${path}/photo.png` };
        }
      },
    },
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops" });
  await app.uploadImage("offerImg", {
    type: "image/png",
    name: "photo.png",
    size: 120,
  });
  assert.deepEqual(calls[1], [
    "upload",
    "data",
    "worlds/qa/city-shops",
    "photo.png",
  ]);
  assert.equal(app.draftFields.offerImg, "worlds/qa/city-shops/photo.png");
  assert.match(app.context.bodyHtml, /src="worlds\/qa\/city-shops\/photo.png"/);
  await app.close();
});

test("a manually entered image path previews before the custom item is saved", async () => {
  const { listeners } = appEnvironment();
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops" });
  listeners.get("change")({
    target: {
      dataset: { serviceField: "offerImg" },
      value: "worlds/qa/custom.webp",
      matches: () => false,
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.context.bodyHtml, /src="worlds\/qa\/custom.webp"/);
  await app.close();
});

test("saving shop details preserves an unfinished custom item draft", async () => {
  appEnvironment();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "First" });
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops", shopId: shop.id });
  app.draftFields = {
    shopName: "Updated",
    offerName: "Unsaved equipment",
    offerPriceCredits: "33",
  };
  await app.action({ dataset: { serviceAction: "shop-save" } });
  assert.match(app.context.bodyHtml, /value="Updated"/);
  assert.match(app.context.bodyHtml, /value="Unsaved equipment"/);
  await app.close();
});

test("opening another shop externally keeps each shop draft attached to its identity", async () => {
  appEnvironment();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const first = await saveCityShop({ name: "First" }),
    second = await saveCityShop({ name: "Second" });
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops", shopId: first.id });
  app.draftFields = { offerName: "First draft" };
  await openCityServices({ tab: "shops", shopId: second.id });
  assert.doesNotMatch(app.context.bodyHtml, /value="First draft"/);
  app.draftFields = { offerName: "Second draft" };
  await openCityServices({ tab: "shops", shopId: first.id });
  assert.match(app.context.bodyHtml, /value="First draft"/);
  await app.close();
});

test("checkout confirms the exact pack total then debits Credits and delivers native items", async () => {
  appEnvironment();
  const { saveCityShop, saveCityShopOffer } =
    await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "Clinic" });
  globalThis.fromUuid = async (uuid) => ({
    documentName: "Item",
    uuid,
    toObject: () => ({
      name: "Pack",
      img: "icons/pack.webp",
      type: "equipment",
      system: {
        quantity: 1,
        level: { value: 1 },
        price: { value: { sp: 7 }, per: 10 },
        rules: [],
      },
    }),
  });
  const offer = await saveCityShopOffer({
    shopId: shop.id,
    sourceUuid: "Item.pack",
    priceCredits: 7,
  });
  const actor = game.actors.get("aa");
  let balance = 100;
  actor.items = new Map();
  actor.inventory = {
    get currency() {
      return { credits: balance };
    },
    async removeCurrency(value) {
      balance -= value.credits;
      return true;
    },
    async addCurrency(value) {
      balance += value.credits;
    },
  };
  actor.createEmbeddedDocuments = async (_type, sources) =>
    sources.map((source, index) => {
      const item = { ...source, id: `i${index}` };
      actor.items.set(item.id, item);
      return item;
    });
  let confirmation;
  foundry.applications.api.DialogV2.confirm = async (options) => {
    confirmation = options.content;
    return true;
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  app.draftFields = { buyerActorId: "aa", [`quantity:${offer.id}`]: "3" };
  await app.action({
    dataset: { serviceAction: "item-buy", itemId: offer.id },
  });
  assert.match(confirmation, /Итого: 21 Credits/);
  assert.match(confirmation, /30 ед/);
  assert.equal(balance, 79);
  assert.equal([...actor.items.values()][0].system.quantity, 30);
  assert.match(app.context.bodyHtml, /Покупка завершена/);
  await app.close();
});

test("a second click during confirmation cannot submit a second purchase", async () => {
  appEnvironment();
  const { saveCityShop, saveCityShopOffer } =
    await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "Test" });
  const offer = await saveCityShopOffer({
    shopId: shop.id,
    name: "Cable",
    priceCredits: 10,
  });
  let resolveConfirm,
    confirmations = 0;
  foundry.applications.api.DialogV2.confirm = () => {
    confirmations++;
    return new Promise((resolve) => {
      resolveConfirm = resolve;
    });
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  const first = app.action({
    dataset: { serviceAction: "item-buy", itemId: offer.id },
  });
  await app.action({
    dataset: { serviceAction: "item-buy", itemId: offer.id },
  });
  assert.equal(confirmations, 1);
  resolveConfirm(false);
  await first;
  assert.equal(
    [...game.messages.values()].filter(
      (doc) => doc.flags?.["cyberpunk-remaster"]?.cityShopPurchaseRequest,
    ).length,
    0,
  );
  await app.close();
});

test("a finished image upload cannot write into a different shop draft", async () => {
  appEnvironment();
  const { saveCityShop } = await import("../runtime/city-shops.mjs");
  const first = await saveCityShop({ name: "First" }),
    second = await saveCityShop({ name: "Second" });
  let finishUpload;
  foundry.applications.apps = {
    FilePicker: {
      implementation: class {
        static async browse() {
          return {};
        }
        static upload() {
          return new Promise((resolve) => {
            finishUpload = resolve;
          });
        }
      },
    },
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({ tab: "shops", shopId: first.id });
  const upload = app.uploadImage("offerImg", {
    type: "image/png",
    name: "photo.png",
  });
  await new Promise((resolve) => setImmediate(resolve));
  app.switchShop(second.id);
  app.draftFields.offerName = "Second draft";
  finishUpload({ path: "worlds/qa/city-shops/first.png" });
  await upload;
  assert.equal(app.draftFields.offerImg, undefined);
  assert.equal(app.draftFields.offerName, "Second draft");
  await app.close();
});

test("changing quantity updates a pending button to describe the newly selected purchase", async () => {
  appEnvironment();
  const { saveCityShop, saveCityShopOffer, listCityShops } =
    await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "Test" });
  const offer = await saveCityShopOffer({
    shopId: shop.id,
    name: "Cable",
    priceCredits: 10,
  });
  const current = listCityShops().find((entry) => entry.id === shop.id);
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  app.purchaseOperations.set(
    JSON.stringify([shop.id, offer.id, "aa", 1, current.version, 10]),
    { operationId: "pending", status: "pending" },
  );
  const total = { textContent: "" },
    buy = { textContent: "Ожидает ведущего", disabled: true };
  const row = {
    dataset: { shopOffer: offer.id },
    querySelector: (selector) =>
      selector === "[data-shop-total]" ? total : buy,
  };
  app.updateCheckout({ value: "2", closest: () => row });
  assert.equal(total.textContent, "Итого: 20 Credits");
  assert.equal(buy.disabled, false);
  assert.equal(buy.textContent, "Купить");
  await app.close();
});

test("an uncertain receipt blocks another purchase of that offer after a quantity change or reopen", async () => {
  appEnvironment();
  const { saveCityShop, saveCityShopOffer } =
    await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "Test" });
  const offer = await saveCityShopOffer({
    shopId: shop.id,
    name: "Cable",
    priceCredits: 10,
  });
  await JournalEntry.create({
    ownership: { default: 0 },
    flags: {
      "cyberpunk-remaster": {
        cityShopPurchase: {
          id: "review",
          operationId: "unknown",
          shopId: shop.id,
          actorId: "aa",
          userId: "g",
          offerId: offer.id,
          itemName: "Cable",
          quantity: 1,
          totalCredits: 10,
          status: "uncertain",
          message: "Review required",
        },
      },
    },
  });
  let confirmations = 0;
  foundry.applications.api.DialogV2.confirm = async () => {
    confirmations++;
    return true;
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  app.draftFields = { [`quantity:${offer.id}`]: "2" };
  await app.render(true);
  assert.match(
    app.context.bodyHtml,
    /data-service-action="item-buy"[^>]*disabled[^>]*>Требуется сверка ведущего/,
  );
  assert.equal(
    (
      app.context.bodyHtml.match(/data-service-action="purchase-resolve"/g) ||
      []
    ).length,
    3,
  );
  await app.action({
    dataset: { serviceAction: "item-buy", itemId: offer.id },
  });
  assert.equal(confirmations, 0);
  await app.close();
});

test("GM receipt review records a verified outcome without touching wallet or inventory", async () => {
  appEnvironment();
  const { saveCityShop, saveCityShopOffer } =
    await import("../runtime/city-shops.mjs");
  const shop = await saveCityShop({ name: "Test" });
  const offer = await saveCityShopOffer({
    shopId: shop.id,
    name: "Cable",
    priceCredits: 10,
  });
  const doc = await JournalEntry.create({
    ownership: { default: 0 },
    flags: {
      "cyberpunk-remaster": {
        cityShopPurchase: {
          id: "review",
          operationId: "unknown",
          shopId: shop.id,
          actorId: "aa",
          userId: "g",
          offerId: offer.id,
          itemName: "Cable",
          quantity: 1,
          totalCredits: 10,
          status: "uncertain",
          phase: "uncertain",
        },
      },
    },
  });
  let reviewContent;
  foundry.applications.api.DialogV2.prompt = async (options) => {
    reviewContent = options.content;
    return "Checked wallet and native Item; refund already applied manually.";
  };
  const actor = game.actors.get("aa");
  actor.inventory = {
    currency: { credits: 100 },
    removeCurrency: () => {
      throw new Error("Unexpected debit");
    },
    addCurrency: () => {
      throw new Error("Unexpected refund");
    },
  };
  actor.createEmbeddedDocuments = () => {
    throw new Error("Unexpected item delivery");
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "shops",
    shopId: shop.id,
    actorId: "aa",
  });
  await app.action({
    dataset: {
      serviceAction: "purchase-resolve",
      receiptId: "review",
      status: "refunded",
    },
  });
  assert.match(reviewContent, /вручную проверь кошелёк Credits и инвентарь/);
  assert.equal(
    doc.flags["cyberpunk-remaster"].cityShopPurchase.status,
    "refunded",
  );
  assert.match(
    doc.flags["cyberpunk-remaster"].cityShopPurchase.manualResolution.note,
    /Checked wallet/,
  );
  assert.equal(actor.inventory.currency.credits, 100);
  assert.doesNotMatch(
    app.context.bodyHtml,
    /data-service-action="purchase-resolve"/,
  );
  await app.close();
});
