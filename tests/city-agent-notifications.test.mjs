import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";

const MID = "cyberpunk-remaster";
async function setup() {
  const env = cityTestEnv({ gm: false });
  const notices = [],
    sounds = [];
  globalThis.ui = { notifications: { info: (value) => notices.push(value) } };
  globalThis.document = { getElementById: () => null };
  globalThis.foundry = {
    audio: { AudioHelper: { play: (...args) => sounds.push(args) } },
  };
  const { initializeCityAgent } = await import(
    `../runtime/city-agent-runtime.mjs?notice=${Date.now()}-${Math.random()}`
  );
  initializeCityAgent();
  const handler = [...env.callbacks.values()]
    .filter((c) => c.n === "createChatMessage")
    .at(-1).f;
  const offer = (id, timestamp = 100) => ({
    id,
    author: env.users.get("g"),
    timestamp,
    whisper: ["a"],
    flags: { [MID]: { cityJobOffer: { id, title: id } } },
  });
  env.messages.set("old", offer("old"));
  return { env, handler, notices, sounds, offer };
}

test("old unread Agent messages do not ring again for an ordinary Foundry chat message", async () => {
  const e = await setup();
  const ordinary = {
    id: "dice",
    timestamp: 200,
    author: e.env.users.get("g"),
    flags: {},
    whisper: [],
  };
  e.env.messages.set(ordinary.id, ordinary);
  e.handler(ordinary);
  assert.deepEqual(e.notices, []);
  assert.deepEqual(e.sounds, []);
});

test("Agent notifications only ring for a new incoming visible unread city message", async () => {
  const e = await setup();
  for (const doc of [
    { ...e.offer("self"), author: game.user },
    { ...e.offer("other"), whisper: ["b"] },
    { ...e.offer("read", 1) },
  ]) {
    game.user.flags[MID] = { cityAgentReadAt: 50 };
    e.env.messages.set(doc.id, doc);
    e.handler(doc);
  }
  assert.equal(e.notices.length, 0);
  const incoming = e.offer("new", 300);
  e.env.messages.set(incoming.id, incoming);
  e.handler(incoming);
  assert.equal(e.notices.length, 1);
  assert.equal(e.sounds.length, 1);
});

test("a new crew-independent city job acceptance request is unread for its GM recipient", async () => {
  const e = cityTestEnv();
  game.user.flags[MID] = { cityAgentReadAt: 10 };
  e.messages.set("acceptance", {
    id: "acceptance",
    timestamp: 20,
    author: e.users.get("a"),
    whisper: ["g", "a"],
    flags: { [MID]: { cityJobRequest: { jobId: "job", actorId: "aa" } } },
  });
  const { cityAgentUnread } = await import("../runtime/city-agent-view.mjs");
  assert.equal(cityAgentUnread(), 1);
});
