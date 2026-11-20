import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";
import { createCityJob, listCityJobs } from "../runtime/city-jobs.mjs";
import { saveCityShop, saveCityShopOffer } from "../runtime/city-shops.mjs";
import {
  sendCityContactMessage,
  cityContactPayload,
} from "../runtime/city-messaging.mjs";
import {
  createClueConnection,
  normalizeClueConnections,
} from "../runtime/archive-clue-connections.mjs";

const uuid4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function withoutNativeUUID(run) {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis.crypto,
    "randomUUID",
  );
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  try {
    return await run();
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis.crypto, "randomUUID", descriptor);
    else delete globalThis.crypto.randomUUID;
  }
}
async function helper() {
  const mod = await import("../runtime/runtime-id.mjs").catch(() => null);
  assert.equal(
    typeof mod?.createRuntimeId,
    "function",
    "a shared compatible ID generator must exist",
  );
  return mod.createRuntimeId;
}

test("runtime IDs use native UUIDs without changing the Crypto object", async () => {
  const createId = await helper();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const cryptoApi = {
    randomUUID() {
      assert.equal(this, cryptoApi);
      return "native-uuid";
    },
  };
  Object.defineProperty(globalThis, "crypto", {
    value: cryptoApi,
    configurable: true,
  });
  try {
    assert.equal(createId(), "native-uuid");
    assert.equal(globalThis.crypto, cryptoApi);
    assert.deepEqual(Object.keys(cryptoApi), ["randomUUID"]);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

test("without randomUUID, cryptographic UUIDv4 IDs remain unique and do not install a polyfill", async () => {
  const createId = await helper();
  await withoutNativeUUID(() => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId()));
    assert.equal(ids.size, 1000);
    for (const id of ids) assert.match(id, uuid4);
    assert.equal(globalThis.crypto.randomUUID, undefined);
    assert.equal(typeof globalThis.crypto.getRandomValues, "function");
  });
});

test("existing city order creation works when randomUUID is absent", async () => {
  cityTestEnv();
  await withoutNativeUUID(async () => {
    const a = await createCityJob({ title: "Первый заказ", status: "offer" });
    const b = await createCityJob({ title: "Второй заказ", status: "offer" });
    assert.match(a.id, uuid4);
    assert.notEqual(a.id, b.id);
    assert.equal(listCityJobs().length, 2);
  });
});

test("shop creation and manual goods work without randomUUID and retain IDs when edited", async () => {
  cityTestEnv();
  await withoutNativeUUID(async () => {
    const shop = await saveCityShop({ name: "Киоск" });
    const offer = await saveCityShopOffer({
      shopId: shop.id,
      name: "Медпатч",
      priceCredits: 25,
    });
    assert.match(shop.id, uuid4);
    assert.match(offer.id.slice("custom:".length), uuid4);
    const updated = await saveCityShopOffer({
      shopId: shop.id,
      offerId: offer.id,
      name: "Медпатч 2",
      priceCredits: 30,
    });
    assert.equal(updated.id, offer.id);
    assert.equal(updated.priceCredits, 30);
  });
});

test("contact messages generate operation IDs without randomUUID", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  await withoutNativeUUID(async () => {
    const doc = await sendCityContactMessage({
      ownerUserId: "a",
      actorId: "aa",
      contactId: "c",
      body: "Сообщение",
    });
    assert.match(cityContactPayload(doc).id, /^city-message:a:/);
    assert.deepEqual(new Set(doc.whisper), new Set(["a", "b", "g"]));
  });
});

test("Archive connections create and repair unique IDs without randomUUID, preserving existing IDs", async () => {
  await withoutNativeUUID(() => {
    const first = createClueConnection();
    const rows = normalizeClueConnections([
      { id: first.id },
      { id: first.id },
      { title: "Новая связь" },
    ]);
    assert.equal(rows[0].id, first.id);
    assert.equal(new Set(rows.map((row) => row.id)).size, 3);
    for (const row of rows) assert.match(row.id, uuid4);
  });
});
