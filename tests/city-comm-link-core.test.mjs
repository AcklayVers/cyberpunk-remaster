import test from "node:test";
import assert from "node:assert/strict";
const core = await import("../runtime/city-comm-link-core.mjs").catch(
  () => null,
);
const api = () => {
  assert.ok(core, "COMM-LINK core implementation is missing");
  return core;
};
const user = { id: "p", isGM: false, character: { id: "a" } };
const actor = {
  id: "a",
  name: "V",
  testUserPermission: (u, level) => u.id === "p" && level === "OWNER",
};
test("request authentication uses the document author and OWNER, never assigned character", () => {
  const { authenticateCommLinkRequest } = api();
  const group = { memberActorIds: ["a"] };
  const request = {
    id: "op",
    actorId: "a",
    groupId: "crew",
    userId: "p",
    action: "thread-reply",
    payload: { body: "Hi" },
  };
  const doc = { author: user };
  assert.equal(authenticateCommLinkRequest(doc, request, actor, group).id, "p");
  assert.throws(
    () =>
      authenticateCommLinkRequest(
        doc,
        { ...request, userId: "other" },
        actor,
        group,
      ),
    /author|автор/i,
  );
  assert.throws(
    () =>
      authenticateCommLinkRequest(
        doc,
        request,
        { ...actor, testUserPermission: () => false },
        group,
      ),
    /OWNER/,
  );
  assert.throws(
    () =>
      authenticateCommLinkRequest(doc, request, actor, { memberActorIds: [] }),
    /групп|crew/i,
  );
});
test("NPC crew replies require an authenticated GM even when the player owns the member Actor", () => {
  const { authenticateCommLinkRequest } = api();
  const group = { memberActorIds: ["a"] };
  const request = {
    id: "gm-reply",
    actorId: "a",
    groupId: "crew",
    userId: "p",
    action: "gm-contact-reply",
    payload: { contactId: "fixer", body: "Offer" },
  };
  assert.throws(
    () => authenticateCommLinkRequest({ author: user }, request, actor, group),
    /GM|MASTER/i,
  );
  const gm = { id: "g2", isGM: true };
  assert.equal(
    authenticateCommLinkRequest(
      { author: gm },
      { ...request, userId: "g2" },
      actor,
      group,
    ).id,
    "g2",
  );
});
test("anonymous public DTO has no actor, portrait, contact or identifying thread reference", () => {
  const { publicCommLinkPublication } = api();
  const result = publicCommLinkPublication(
    {
      id: "m",
      body: "job",
      senderActorId: "secret",
      senderImage: "secret.webp",
      image: "secret.webp",
      senderName: "Hanako",
      contactId: "secret-contact",
      threadId: "secret-contact:hanako",
    },
    "message",
    false,
  );
  assert.equal(result.senderName, "UNKNOWN");
  assert.equal(result.body, "job");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(result.threadId, "anonymous:m");
});
test("group projections use stable source IDs and preserve private Archive notes", () => {
  const { projectCommLinkGroupIntoStore } = api();
  const store = { notebooks: {} };
  const group = {
    groupId: "crew",
    groupName: "Crew",
    memberActorIds: ["a"],
    contacts: [
      { id: "c1", name: "Fixer", summary: "network", tags: ["fixer"] },
      { id: "c2", name: "Fixer" },
    ],
    messages: [
      {
        id: "m1",
        contactId: "c1",
        threadId: "t",
        body: "Offer",
        sender: "npc",
      },
    ],
    jobs: [
      {
        id: "j",
        title: "Delivery",
        status: "accepted",
        pay: "100",
        cityMarkerId: "bar",
      },
    ],
  };
  projectCommLinkGroupIntoStore(store, { actor, group });
  const book = store.notebooks.a;
  assert.equal(book.entries.people.length, 2, "same-name people stay distinct");
  const person = book.entries.people.find((c) => c.commLinkContactId === "c1");
  person.content = "private notes";
  person.summary = "my conclusion";
  book.entries.quests[0].tasks = [{ id: "my-task", text: "personal" }];
  group.contacts[0].summary = "changed";
  projectCommLinkGroupIntoStore(store, { actor, group });
  assert.equal(person.content, "private notes");
  assert.equal(person.summary, "my conclusion");
  assert.equal(person.messages.length, 1);
  assert.equal(person.commLinkGroupId, "crew");
  assert.equal(book.entries.quests.length, 1);
  assert.equal(book.entries.quests[0].tasks[0].id, "my-task");
  assert.equal(book.entries.quests[0].cityMarkerId, "bar");
  group.jobs[0].cityMarkerId = "";
  projectCommLinkGroupIntoStore(store, { actor, group });
  assert.equal(book.entries.quests[0].cityMarkerId, "");
});
test("native wallet rejects field and credstick write fallbacks", async () => {
  const { nativeCommLinkWallet } = api();
  assert.throws(
    () => nativeCommLinkWallet({ system: { credits: 300 }, update() {} }),
    /native|SF2E/i,
  );
  let balance = 10;
  const a = {
    inventory: {
      get currency() {
        return { credits: balance };
      },
      async addCurrency(value) {
        assert.deepEqual(value, { credits: 7 });
        balance += value.credits;
      },
    },
  };
  const receipt = await nativeCommLinkWallet(a).credit(7);
  assert.equal(balance, 17);
  assert.equal(receipt.before, 10);
  assert.equal(receipt.after, 17);
});
test("payout persists reservation before native credit and retry cannot pay twice", async () => {
  const { settleCommLinkPayout } = api();
  let saved = {},
    balance = 10,
    sawReservation = false;
  const a = {
    id: "a",
    inventory: {
      get currency() {
        return { credits: balance };
      },
      async addCurrency({ credits }) {
        sawReservation = saved.receipts.a.status === "reserved";
        balance += credits;
      },
    },
  };
  const options = {
    ledger: {},
    shares: [{ actorId: "a", amount: 11 }],
    getActor: () => a,
    persist: async (v) => {
      saved = structuredClone(v);
    },
    operationId: "pay:j",
    isPrimaryGM: () => true,
  };
  const result = await settleCommLinkPayout(options);
  assert.equal(sawReservation, true);
  assert.equal(result.status, "paid");
  await settleCommLinkPayout({ ...options, ledger: saved });
  assert.equal(balance, 21);
  await assert.rejects(
    () =>
      settleCommLinkPayout({
        ...options,
        ledger: {},
        isPrimaryGM: () => false,
      }),
    /GM|MASTER/i,
  );
});
test("an interrupted reserved payout never repeats the uncertain native transfer", async () => {
  const { settleCommLinkPayout } = api();
  let balance = 10,
    saved;
  const a = {
    inventory: {
      currency: { credits: 10 },
      async addCurrency({ credits }) {
        balance += credits;
        throw new Error("connection lost after credit");
      },
    },
  };
  const options = {
    ledger: {},
    shares: [{ actorId: "a", amount: 5 }],
    getActor: () => a,
    persist: async (v) => {
      saved = structuredClone(v);
    },
    operationId: "pay:j",
    isPrimaryGM: () => true,
  };
  await assert.rejects(() => settleCommLinkPayout(options), /connection lost/);
  assert.equal(balance, 15);
  assert.equal(saved.receipts.a.status, "uncertain");
  await assert.rejects(
    () => settleCommLinkPayout({ ...options, ledger: saved }),
    /uncertain|неопредел|провер/i,
  );
  assert.equal(balance, 15);
});
test("durable operation receipts suppress duplicate mutations while acknowledgements can retry", async () => {
  const { createCommLinkOperationProcessor } = api();
  const receipts = new Map();
  let changed = 0,
    acknowledgements = 0;
  const processor = createCommLinkOperationProcessor({
    isPrimaryGM: () => true,
    authenticate: async () => user,
    readReceipt: async (key) => receipts.get(key),
    commit: async (_request, key) => {
      changed++;
      const r = { status: "applied" };
      receipts.set(key, r);
      return r;
    },
    acknowledge: async () => {
      acknowledgements++;
      if (acknowledgements === 1) throw new Error("ack offline");
    },
  });
  const request = { id: "op", userId: "p" };
  await assert.rejects(
    () => processor({ author: user }, request),
    /ack offline/,
  );
  await processor({ author: user }, request);
  assert.equal(changed, 1);
  assert.equal(acknowledgements, 2);
});
test("profile PIN hashing keeps the same SHA-256 when WebCrypto is unavailable", async () => {
  const { hashCommLinkPin } = api();
  assert.equal(
    typeof hashCommLinkPin,
    "function",
    "secure PIN adapter is required",
  );
  const hash = await hashCommLinkPin("1234");
  assert.equal(await hashCommLinkPin("1234", {}), hash);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "fallback:1234");
  assert.notEqual(hash, await hashCommLinkPin("4321"));
});
