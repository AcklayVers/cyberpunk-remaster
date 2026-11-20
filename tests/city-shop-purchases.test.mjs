import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";

const MID = "cyberpunk-remaster";
let imports = 0;
async function setup({
  credits = 100,
  per = 1,
  price = 12,
  type = "equipment",
} = {}) {
  const env = cityTestEnv();
  const createJournal = JournalEntry.create;
  JournalEntry.create = async (data) => {
    const doc = await createJournal(data);
    doc._stats = { lastModifiedBy: game.user.id };
    const update = doc.update.bind(doc);
    doc.update = async (changes) => {
      await update(changes);
      doc._stats = { lastModifiedBy: game.user.id };
      return doc;
    };
    return doc;
  };
  const actor = game.actors.get("aa");
  actor.items = new Map();
  let balance = credits;
  const calls = { debit: 0, refund: 0, create: 0 };
  actor.inventory = {
    get currency() {
      return { credits: balance, upb: 1000 };
    },
    async removeCurrency(value, options) {
      assert.deepEqual(options, { byValue: false });
      assert.deepEqual(Object.keys(value), ["credits"]);
      calls.debit++;
      if (balance < value.credits) return false;
      balance -= value.credits;
      return true;
    },
    async addCurrency(value) {
      assert.deepEqual(Object.keys(value), ["credits"]);
      calls.refund++;
      balance += value.credits;
    },
  };
  actor.createEmbeddedDocuments = async (type, sources) => {
    assert.equal(type, "Item");
    calls.create++;
    return sources.map((source) => {
      const item = {
        ...structuredClone(source),
        id: `item${actor.items.size}`,
      };
      actor.items.set(item.id, item);
      return item;
    });
  };
  globalThis.CONFIG = {
    Item: {
      documentClass: class {
        constructor(source) {
          if (!source.name || source.type !== type)
            throw new Error("Invalid Item source");
          if (!Array.isArray(source.system?.rules))
            throw new Error("Invalid Item rules schema");
        }
        validate() {
          return true;
        }
      },
    },
  };
  const source = {
    name: "Med kit",
    type,
    img: "icons/svg/item-bag.svg",
    system: {
      quantity: 1,
      level: { value: 0 },
      price: { value: { sp: 12 }, per },
      rules: [{ key: "FlatModifier", value: 2 }],
    },
  };
  const shop = {
    id: "shop",
    name: "Clinic",
    version: 4,
    type: "general",
    hidden: false,
    market: false,
    seed: 1,
    size: 16,
    level: 20,
    markup: 1,
    customOffers: [
      {
        id: "custom:med",
        name: source.name,
        type: source.type,
        img: source.img,
        description: "",
        uuid: "",
        priceCredits: price,
        quantityPerPurchase: per,
        source,
      },
    ],
  };
  await JournalEntry.create({
    ownership: { default: 0 },
    flags: { [MID]: { cityShop: shop } },
  });
  env.settings.set(
    "cityServicesV1",
    JSON.stringify({ version: 1, jobs: [], shops: [shop] }),
  );
  env.settings.set(
    "worldCityMap",
    JSON.stringify({
      version: 5,
      markers: [],
      clock: { anchorDate: "2045-07-14T22:00:00Z", anchorWorldTime: 100 },
    }),
  );
  game.packs = new Map();
  const api = await import(
    `../runtime/city-shop-purchases.mjs?test=${++imports}`
  ).catch(() => null);
  assert.ok(api, "authenticated purchase service must exist");
  async function request(overrides = {}, userId = "a") {
    game.user = env.users.get(userId);
    const doc = await ChatMessage.create({
      content: "purchase",
      whisper: [userId, "g"],
      flags: {
        [MID]: {
          cityShopPurchaseRequest: {
            shopId: "shop",
            offerId: "custom:med",
            actorId: "aa",
            quantity: 1,
            shopVersion: 4,
            expectedPriceCredits: price,
            operationId: "operation-1",
            ...overrides,
          },
        },
      },
    });
    game.user = env.users.get("g");
    return doc;
  }
  return { ...env, api, actor, shop, calls, request, balance: () => balance };
}

test("purchase charges native Credits and delivers canonical mechanics in pack quantities", async () => {
  const e = await setup({ per: 10 });
  const result = await e.api.processCityShopPurchase(
    await e.request({
      quantity: 3,
      source: { name: "forged" },
      userId: "b",
      expectedPriceCredits: 12,
    }),
  );
  assert.equal(result.status, "committed");
  assert.equal(result.totalCredits, 36);
  assert.equal(e.balance(), 64);
  const item = [...e.actor.items.values()][0];
  assert.equal(item.name, "Med kit");
  assert.equal(item.system.quantity, 30);
  assert.deepEqual(item.system.rules, [{ key: "FlatModifier", value: 2 }]);
  assert.equal(item.flags[MID].cityShopPurchase.operationId, "operation-1");
  const ledger = [...e.journals.values()].find(
    (d) => d.flags[MID].cityShopPurchase,
  );
  assert.equal(ledger.ownership.default, 0);
  assert.equal(ledger.flags[MID].cityShopPurchase.userId, "a");
  const receipt = [...e.messages.values()].find(
    (d) => d.flags[MID].cityShopPurchaseReceipt,
  );
  assert.deepEqual(receipt.whisper.sort(), ["a", "g"]);
  assert.equal(receipt.author.id, "g");
});

test("insufficient Credits cannot spend UPB or create an item", async () => {
  const e = await setup({ credits: 11 });
  const result = await e.api.processCityShopPurchase(await e.request());
  assert.equal(result.status, "rejected");
  assert.equal(e.balance(), 11);
  assert.equal(e.actor.items.size, 0);
});

test("ammunition packs can be bought through the same physical Item checkout", async () => {
  const e = await setup({ type: "ammo", per: 10, price: 40 });
  const result = await e.api.processCityShopPurchase(
    await e.request({ quantity: 2 }),
  );
  assert.equal(result.status, "committed");
  assert.equal(e.balance(), 20);
  const item = [...e.actor.items.values()][0];
  assert.equal(item.type, "ammo");
  assert.equal(item.system.quantity, 20);
});

test("a shop hidden while debit intent is saved cannot charge its pending buyer", async () => {
  const e = await setup();
  const createJournal = JournalEntry.create;
  JournalEntry.create = async (data) => {
    const doc = await createJournal(data);
    if (!data.flags?.[MID]?.cityShopPurchase) return doc;
    const update = doc.update.bind(doc);
    doc.update = async (changes) => {
      await update(changes);
      if (changes.flags?.[MID]?.cityShopPurchase?.phase === "debit-pending") {
        const shop = [...e.journals.values()].find(
          (j) => j.flags[MID].cityShop,
        );
        shop.flags[MID].cityShop.hidden = true;
        shop.flags[MID].cityShop.version++;
      }
      return doc;
    };
    return doc;
  };
  const result = await e.api.processCityShopPurchase(await e.request());
  assert.equal(result.status, "rejected");
  assert.equal(e.balance(), 100);
  assert.equal(e.calls.debit, 0);
  assert.equal(e.calls.create, 0);
});

test("actual author ownership defeats buyer-supplied user and source fields", async () => {
  const e = await setup();
  const result = await e.api.processCityShopPurchase(
    await e.request({ actorId: "bb", userId: "b" }),
  );
  assert.equal(result.status, "rejected");
  assert.equal(e.calls.debit, 0);
  assert.equal(e.actor.items.size, 0);
});

test("changed version, changed price, unknown price and invalid quantities never debit", async () => {
  for (const overrides of [
    { shopVersion: 3 },
    { expectedPriceCredits: 1 },
    { quantity: 0 },
    { quantity: 100 },
    { quantity: 1.5 },
  ]) {
    const e = await setup();
    assert.equal(
      (await e.api.processCityShopPurchase(await e.request(overrides))).status,
      "rejected",
    );
    assert.equal(e.calls.debit, 0);
  }
  for (const price of [null, -1, NaN, Infinity, 1.5]) {
    const e = await setup({ price });
    assert.equal(
      (await e.api.processCityShopPurchase(await e.request())).status,
      "rejected",
    );
    assert.equal(e.calls.debit, 0);
  }
});

test("closed and revoked markets use current campaign time and authenticated invitation", async () => {
  const e = await setup();
  e.shop.market = true;
  e.shop.opens = 21;
  e.shop.closes = 6;
  const shopDoc = [...e.journals.values()][0];
  shopDoc.flags[MID].cityShop = e.shop;
  await ChatMessage.create({
    whisper: ["a", "g"],
    flags: {
      [MID]: {
        cityMarketInvitation: {
          shopId: "shop",
          userId: "a",
          allowed: true,
          version: 4,
          shop: e.shop,
        },
      },
    },
  });
  const closed = await e.request();
  game.time.worldTime += 8 * 3600;
  assert.equal(
    (await e.api.processCityShopPurchase(closed)).status,
    "rejected",
  );
  game.time.worldTime = 100;
  await ChatMessage.create({
    whisper: ["a", "g"],
    flags: {
      [MID]: {
        cityMarketInvitation: {
          shopId: "shop",
          userId: "a",
          allowed: false,
          version: 4,
        },
      },
    },
  });
  assert.equal(
    (
      await e.api.processCityShopPurchase(
        await e.request({ operationId: "revoked" }),
      )
    ).status,
    "rejected",
  );
  assert.equal(e.calls.debit, 0);
});

test("deleted shops reject new purchases while earlier receipts remain readable", async () => {
  const e = await setup();
  await e.api.processCityShopPurchase(await e.request());
  e.shop.deleted = true;
  [...e.journals.values()][0].flags[MID].cityShop = e.shop;
  assert.equal(
    (
      await e.api.processCityShopPurchase(
        await e.request({ operationId: "after-delete" }),
      )
    ).status,
    "rejected",
  );
  game.user = e.users.get("a");
  assert.ok(
    e.api
      .listCityShopPurchaseReceipts({ shopId: "shop", actorId: "aa" })
      .some((r) => r.status === "committed"),
  );
  assert.equal(e.balance(), 88);
});

test("parallel replay and reused operation bindings cannot duplicate debit or delivery", async () => {
  const e = await setup();
  const doc = await e.request();
  const results = await Promise.all([
    e.api.processCityShopPurchase(doc),
    e.api.processCityShopPurchase(doc),
    e.api.processCityShopPurchase(doc),
  ]);
  assert.ok(results.every((r) => r.status === "committed"));
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
  assert.equal(e.calls.debit, 1);
  const changed = await e.request({ quantity: 2 });
  assert.equal(
    (await e.api.processCityShopPurchase(changed)).status,
    "rejected",
  );
  assert.equal(e.balance(), 88);
});

test("two different purchases serialize against the fresh wallet balance", async () => {
  const e = await setup({ credits: 20 });
  const docs = [
    await e.request(),
    await e.request({ operationId: "operation-2" }),
  ];
  const results = await Promise.all(
    docs.map((d) => e.api.processCityShopPurchase(d)),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ["committed", "rejected"],
  );
  assert.equal(e.balance(), 8);
  assert.equal(e.actor.items.size, 1);
});

test("known empty creation veto refunds once and never repeats on replay", async () => {
  const e = await setup();
  e.actor.createEmbeddedDocuments = async () => [];
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "refunded");
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "refunded");
  assert.equal(e.balance(), 100);
  assert.equal(e.calls.refund, 1);
  assert.equal(e.calls.debit, 1);
});

test("creation validation rejects malformed source before any debit", async () => {
  const e = await setup();
  [...e.journals.values()][0].flags[
    MID
  ].cityShop.customOffers[0].source.system.rules = "invalid rules";
  assert.equal(
    (await e.api.processCityShopPurchase(await e.request())).status,
    "rejected",
  );
  assert.equal(e.balance(), 100);
  assert.equal(e.calls.debit, 0);
});

test("unknown debit outcome blocks reload replay and automatic refunds", async () => {
  const e = await setup();
  const nativeRemove = e.actor.inventory.removeCurrency;
  e.actor.inventory.removeCurrency = async (...args) => {
    await nativeRemove(...args);
    throw new Error("connection lost");
  };
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  const reloaded = await import(
    `../runtime/city-shop-purchases.mjs?reload=${++imports}`
  );
  await reloaded.resumeCityShopPurchases();
  assert.equal(
    (await reloaded.processCityShopPurchase(doc)).status,
    "uncertain",
  );
  assert.equal(e.balance(), 88);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.calls.refund, 0);
  assert.equal(e.actor.items.size, 0);
});

test("lost creation response commits through the persisted exact operation item flag", async () => {
  const e = await setup();
  const create = e.actor.createEmbeddedDocuments;
  e.actor.createEmbeddedDocuments = async (...args) => {
    await create(...args);
    throw new Error("response lost");
  };
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "committed");
  await e.api.resumeCityShopPurchases();
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
  assert.equal(e.calls.refund, 0);
});

test("unknown delivery without an item blocks replay and never auto refunds", async () => {
  const e = await setup();
  e.actor.createEmbeddedDocuments = async () => {
    throw new Error("transport timeout");
  };
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  assert.equal(e.balance(), 88);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.calls.refund, 0);
});

test("receipt acknowledgement failure retries only the private receipt publication", async () => {
  const e = await setup();
  const doc = await e.request();
  const createMessage = ChatMessage.create;
  ChatMessage.create = async (data) => {
    if (data.flags[MID].cityShopPurchaseReceipt) throw new Error("ack failure");
    return createMessage(data);
  };
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "committed");
  ChatMessage.create = createMessage;
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "committed");
  game.user = e.users.get("a");
  assert.equal(
    e.api.listCityShopPurchaseReceipts({ actorId: "aa" })[0].status,
    "committed",
  );
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
});

test("receipts accept only actual GM authors and the named buyer whisper", async () => {
  const e = await setup();
  await e.api.processCityShopPurchase(await e.request());
  game.user = e.users.get("a");
  await ChatMessage.create({
    whisper: ["a"],
    flags: {
      [MID]: {
        cityShopPurchaseReceipt: {
          id: "forged",
          userId: "a",
          operationId: "fake",
          status: "committed",
        },
      },
    },
  });
  assert.equal(e.api.listCityShopPurchaseReceipts({}).length, 1);
  game.user = e.users.get("b");
  assert.equal(e.api.listCityShopPurchaseReceipts({}).length, 0);
});

test("request transport fixes author and whispers to buyer plus GMs without price or source substitution", async () => {
  const e = await setup();
  game.user = e.users.get("a");
  assert.equal(
    (
      await e.api.requestCityShopPurchase({
        shopId: "shop",
        offerId: "custom:med",
        actorId: "aa",
        quantity: 1,
        shopVersion: 4,
        expectedPriceCredits: 12,
        operationId: "request-api",
      })
    ).status,
    "pending",
  );
  const doc = [...e.messages.values()][0];
  assert.equal(doc.author.id, "a");
  assert.deepEqual(doc.whisper.sort(), ["a", "g"]);
  await assert.rejects(
    () =>
      e.api.requestCityShopPurchase({
        shopId: "shop",
        offerId: "custom:med",
        actorId: "bb",
        quantity: 1,
        shopVersion: 4,
        expectedPriceCredits: 12,
        operationId: "forged-owner",
      }),
    /персонаж|прав/iu,
  );
});

test("inactive GM cannot purchase and the new active GM resumes queued requests once", async () => {
  const e = await setup();
  const secondGM = { ...e.users.get("g"), id: "g2" };
  e.users.set("g2", secondGM);
  const doc = await e.request();
  game.users.activeGM = secondGM;
  await assert.rejects(() => e.api.processCityShopPurchase(doc), /активн/iu);
  game.user = secondGM;
  await e.api.resumeCityShopPurchases();
  await e.api.resumeCityShopPurchases();
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
});

test("explicit zero price delivers without changing any wallet currency", async () => {
  const e = await setup({ credits: 0, price: 0 });
  assert.equal(
    (await e.api.processCityShopPurchase(await e.request())).status,
    "committed",
  );
  assert.equal(e.balance(), 0);
  assert.equal(e.calls.debit, 0);
  assert.equal(e.actor.items.size, 1);
});

test("uncertain refund response cannot credit the buyer twice after reload", async () => {
  const e = await setup();
  e.actor.createEmbeddedDocuments = async () => [];
  const add = e.actor.inventory.addCurrency;
  e.actor.inventory.addCurrency = async (...args) => {
    await add(...args);
    throw new Error("refund response lost");
  };
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  const reloaded = await import(
    `../runtime/city-shop-purchases.mjs?refund=${++imports}`
  );
  await reloaded.resumeCityShopPurchases();
  assert.equal(e.balance(), 100);
  assert.equal(e.calls.refund, 1);
  assert.equal(e.calls.debit, 1);
});

test("lost journal acknowledgement after debit blocks all further wallet actions", async () => {
  const e = await setup();
  const doc = await e.request();
  const create = JournalEntry.create;
  JournalEntry.create = async (data) => {
    const entry = await create(data);
    const update = entry.update.bind(entry);
    entry.update = async (changes) => {
      await update(changes);
      if (changes.flags[MID].cityShopPurchase?.phase === "creation-pending")
        throw new Error("journal ack lost");
      return entry;
    };
    return entry;
  };
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  await e.api.resumeCityShopPurchases();
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 0);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.calls.refund, 0);
});

test("late authoritative item arrival reconciles an uncertain creation without further payment", async () => {
  const e = await setup();
  let delayed;
  e.actor.createEmbeddedDocuments = async (_type, sources) => {
    delayed = structuredClone(sources[0]);
    throw new Error("response timeout");
  };
  const doc = await e.request();
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  e.actor.items.set("late-item", { ...delayed, id: "late-item" });
  const reloaded = await import(
    `../runtime/city-shop-purchases.mjs?late=${++imports}`
  );
  await reloaded.resumeCityShopPurchases();
  assert.equal(
    (await reloaded.processCityShopPurchase(doc)).status,
    "committed",
  );
  assert.equal(e.balance(), 88);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.calls.refund, 0);
});

test("registration handles a new active GM and does not republish for unrelated user updates", async () => {
  const e = await setup();
  const doc = await e.request();
  const secondGM = { ...e.users.get("g"), id: "g2" };
  e.users.set("g2", secondGM);
  game.user = secondGM;
  e.api.registerCityShopPurchases();
  e.api.registerCityShopPurchases();
  game.users.activeGM = secondGM;
  Hooks.callAll("userConnected", e.users.get("g"), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
  const receiptCount = () =>
    [...e.messages.values()].filter((m) => m.flags[MID].cityShopPurchaseReceipt)
      .length;
  const before = receiptCount();
  Hooks.callAll("updateUser", e.users.get("a"), { name: "renamed" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(receiptCount(), before);
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "committed");
});

test("Agent starts before Users exist and a late GM processes a pending purchase exactly once", async (t) => {
  const e = await setup();
  const gm = e.users.get("g");
  const player = e.users.get("a");
  const module = { api: {} };
  game.modules.set(MID, module);
  t.mock.method(console, "error", (...args) => errors.push(args));
  const errors = [];
  globalThis.ui = { notifications: { error: (error) => errors.push(error) } };
  globalThis.document = { getElementById: () => null };
  const keys = new Map();
  game.keybindings = {
    register: (_module, key, binding) => keys.set(key, binding),
  };
  game.users.activeGM = null;
  gm.active = false;

  async function init(client) {
    const callbacks = new Map();
    let next = 0;
    globalThis.Hooks = {
      on(name, fn) {
        callbacks.set(++next, { name, fn });
        return next;
      },
      once(name, fn) {
        const id = this.on(name, (...args) => {
          callbacks.delete(id);
          return fn(...args);
        });
      },
      callAll(name, ...args) {
        for (const cb of [...callbacks.values()])
          if (cb.name === name) cb.fn(...args);
      },
    };
    delete game.users;
    delete game.user;
    await import(
      `../runtime/city-agent-runtime.mjs?shop-lifecycle=${client.id}`
    );
    assert.doesNotThrow(() => Hooks.callAll("init"));
    assert.equal(e.settings.get("agentAutoOpen"), false);
    assert.equal(e.settings.get("agentNotifySound"), true);
    assert.equal(keys.get("agent").editable[0].key, "KeyA");
    assert.equal(keys.get("cityMap").editable[0].key, "KeyM");
    assert.equal(typeof module.api.agent.open, "function");
    assert.equal(
      [...callbacks.values()].filter((cb) => cb.name === "userConnected")
        .length,
      0,
    );
    game.users = e.users;
    game.user = client;
    return callbacks;
  }

  const playerHooks = await init(player);
  Hooks.callAll("ready");
  assert.equal(
    [...playerHooks.values()].filter((cb) => cb.name === "userConnected")
      .length,
    1,
  );
  const shopAPI = await import("../runtime/city-shop-purchases.mjs");
  const request = {
    shopId: "shop",
    offerId: "custom:med",
    actorId: "aa",
    shopVersion: 4,
    expectedPriceCredits: 12,
    operationId: "player-waited-for-gm",
  };
  assert.equal(
    (await shopAPI.requestCityShopPurchase(request)).status,
    "pending",
  );
  assert.deepEqual(e.calls, { debit: 0, refund: 0, create: 0 });
  assert.equal(e.balance(), 100);
  const message = [...e.messages.values()].find(
    (doc) =>
      doc.flags[MID].cityShopPurchaseRequest?.operationId ===
      request.operationId,
  );
  assert.deepEqual(message.whisper, [player.id, gm.id]);

  const gmHooks = await init(gm);
  game.users.activeGM = gm;
  gm.active = true;
  const purchaseLedger = () =>
    [...e.journals.values()].filter(
      (doc) =>
        doc.flags[MID].cityShopPurchase?.operationId === request.operationId,
    );
  const receipts = () =>
    [...e.messages.values()].filter(
      (doc) =>
        doc.flags[MID].cityShopPurchaseReceipt?.operationId ===
        request.operationId,
    );
  const debit = e.actor.inventory.removeCurrency.bind(e.actor.inventory);
  e.actor.inventory.removeCurrency = (...args) => {
    assert.equal(
      [...gmHooks.values()].filter((cb) => cb.name === "userConnected").length,
      1,
    );
    return debit(...args);
  };
  Hooks.callAll("ready");
  Hooks.callAll("userConnected", gm, true);
  Hooks.callAll("updateUser", gm, { active: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(e.calls, { debit: 1, refund: 0, create: 1 });
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
  assert.equal(purchaseLedger().length, 1);
  assert.equal(receipts().length, 1);
  assert.equal(
    receipts()[0].flags[MID].cityShopPurchaseReceipt.status,
    "committed",
  );
  Hooks.callAll("ready");
  Hooks.callAll("userConnected", gm, true);
  Hooks.callAll("updateUser", player, { name: "Renamed" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(e.calls, { debit: 1, refund: 0, create: 1 });
  assert.equal(receipts().length, 1);
  assert.deepEqual(errors, []);
});

test("player-created private journal flags cannot authorize a charge for another buyer", async () => {
  const e = await setup();
  game.user = e.users.get("b");
  await JournalEntry.create({
    ownership: { default: 0 },
    flags: {
      [MID]: {
        cityShopPurchase: {
          id: "forged",
          userId: "a",
          operationId: "forged-operation",
          actorId: "aa",
          shopId: "shop",
          offerId: "custom:med",
          quantity: 1,
          shopVersion: 4,
          expectedPriceCredits: 12,
          status: "pending",
          phase: "prepared",
        },
      },
    },
  });
  game.user = e.users.get("g");
  await e.api.resumeCityShopPurchases();
  assert.equal(e.balance(), 100);
  assert.equal(e.actor.items.size, 0);
  assert.equal(e.api.listCityShopPurchaseReceipts({}).length, 0);
});

test("tampered provenance blocks replay of an earlier charge instead of creating a new ledger", async () => {
  const e = await setup();
  const doc = await e.request();
  await e.api.processCityShopPurchase(doc);
  const ledger = [...e.journals.values()].find(
    (d) => d.flags[MID].cityShopPurchase,
  );
  ledger._stats.lastModifiedBy = "b";
  assert.equal((await e.api.processCityShopPurchase(doc)).status, "uncertain");
  assert.equal(e.balance(), 88);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.actor.items.size, 1);
});

test("only active GM can record a verified uncertain outcome without any wallet or item repair", async () => {
  const e = await setup();
  const remove = e.actor.inventory.removeCurrency;
  e.actor.inventory.removeCurrency = async (...args) => {
    await remove(...args);
    throw new Error("unknown debit outcome");
  };
  const result = await e.api.processCityShopPurchase(await e.request());
  assert.equal(result.status, "uncertain");
  game.user = e.users.get("a");
  await assert.rejects(
    () =>
      e.api.resolveCityShopPurchase({
        receiptId: result.id,
        status: "refunded",
        note: "Verified externally",
      }),
    /ведущ/iu,
  );
  game.user = e.users.get("g");
  await assert.rejects(
    () =>
      e.api.resolveCityShopPurchase({
        receiptId: result.id,
        status: "refunded",
        note: "",
      }),
    /сверк|примечан|опиш|провер/iu,
  );
  const resolved = await e.api.resolveCityShopPurchase({
    receiptId: result.id,
    status: "refunded",
    note: "GM manually checked native Credits and inventory",
  });
  assert.equal(resolved.status, "refunded");
  assert.equal(e.balance(), 88);
  assert.equal(e.calls.debit, 1);
  assert.equal(e.calls.refund, 0);
  assert.equal(e.actor.items.size, 0);
  const ledger = [...e.journals.values()].find(
    (d) => d.flags[MID].cityShopPurchase,
  );
  const audit = ledger.flags[MID].cityShopPurchase.manualResolution;
  assert.equal(audit.userId, "g");
  assert.equal(audit.status, "refunded");
  assert.equal(audit.note, "GM manually checked native Credits and inventory");
  assert.ok(Number.isFinite(Date.parse(audit.at)));
  assert.equal(
    (
      await e.api.resolveCityShopPurchase({
        receiptId: result.id,
        status: "refunded",
        note: "Retry acknowledgement",
      })
    ).status,
    "refunded",
  );
  await assert.rejects(
    () =>
      e.api.resolveCityShopPurchase({
        receiptId: result.id,
        status: "committed",
        note: "Cannot rewrite terminal decision",
      }),
    /неопредел|заверш|решен/iu,
  );
  assert.equal(e.calls.refund, 0);
});

test("manual resolution cannot overwrite an ordinary completed purchase", async () => {
  const e = await setup();
  const result = await e.api.processCityShopPurchase(await e.request());
  await assert.rejects(
    () =>
      e.api.resolveCityShopPurchase({
        receiptId: result.id,
        status: "rejected",
        note: "Attempt to override a completed receipt",
      }),
    /неопредел|заверш|решен/iu,
  );
  assert.equal(e.balance(), 88);
  assert.equal(e.actor.items.size, 1);
});
