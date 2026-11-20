import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
const runtime =
  await import("../runtime/city-comm-link-runtime.mjs?background-only").catch(
    () => null,
  );
test("initializing the background service never creates world documents or a phone root", async () => {
  assert.ok(runtime, "embedded COMM-LINK runtime is missing");
  let created = 0,
    bodyWrites = 0;
  globalThis.game = {
    user: { id: "g", isGM: true, flags: {} },
    users: new Map(),
    actors: new Map(),
    journal: new Map(),
    messages: new Map(),
  };
  game.users.set("g", game.user);
  game.user.active = true;
  globalThis.Hooks = {
    on() {
      return 1;
    },
    off() {},
    callAll() {},
  };
  globalThis.JournalEntry = {
    async create() {
      created++;
    },
  };
  globalThis.document = {
    body: {
      append() {
        bodyWrites++;
      },
    },
  };
  await runtime.initializeCityCommLink();
  assert.equal(created, 0);
  assert.equal(bodyWrites, 0);
  assert.equal(typeof runtime.mountCityCommLink, "function");
  assert.equal(typeof runtime.sendCommLinkContactMessage, "function");
});
test("real crew send is durable, projected to every member and rejects a forged relay author", async () => {
  const e = cityTestEnv();
  game.user.character = game.actors.get("aa");
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.document = { activeElement: null };
  const MID = "cyberpunk-remaster";
  const group = {
    version: 8,
    revision: 0,
    groupId: "crew",
    groupName: "Crew",
    memberActorIds: ["aa", "bb"],
    memberRoster: [],
    leaderActorId: "aa",
    contacts: [{ id: "fixer", name: "Wakako", summary: "source", tags: [] }],
    messages: [],
    calls: [],
    jobs: [],
    events: [],
    payments: [],
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
  const makeDoc = (id, data) => ({
    id,
    name: id,
    ownership: { default: 0, g: 3, a: 2, b: 2 },
    flags: { [MID]: { commLink: data } },
    testUserPermission: () => true,
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        let current = this;
        const keys = path.split(".");
        for (const key of keys.slice(0, -1)) current = current[key] ??= {};
        current[keys.at(-1)] = structuredClone(value);
      }
      Hooks.callAll("updateJournalEntry", this, changes);
      return this;
    },
  });
  const groupDoc = makeDoc("group", { data: group });
  e.journals.set("group", groupDoc);
  e.journals.set(
    "control",
    makeDoc("control", {
      control: {
        groups: [
          {
            id: "crew",
            name: "Crew",
            journalId: "group",
            actorIds: ["aa", "bb"],
            leaderActorId: "aa",
          },
        ],
      },
    }),
  );
  const m = await import("../runtime/city-comm-link-runtime.mjs");
  const service = m.initializeCityCommLink();
  await service.refresh();
  const contactId = "comm-link-contact:crew:fixer";
  const { sendCityContactMessage } =
    await import("../runtime/city-messaging.mjs");
  const args = {
    ownerUserId: "g",
    actorId: "aa",
    contactId,
    body: "Crew message",
    operationId: "stable-op",
  };
  await sendCityContactMessage(args);
  await sendCityContactMessage(args);
  assert.equal(groupDoc.flags[MID].commLink.data.messages.length, 1);
  assert.equal(
    groupDoc.flags[MID].commLink.data.operations["g:stable-op"].status,
    "applied",
  );
  for (const [userId, actorId, direction] of [
    ["a", "aa", "out"],
    ["b", "bb", "in"],
  ]) {
    const c = e.users
      .get(userId)
      .flags.cyberpunkRemaster.neuroArchive.data.notebooks[
        actorId
      ].entries.people.find((p) => p.id === contactId);
    assert.equal(c.messages.length, 1);
    assert.equal(c.messages[0].body, "Crew message");
    assert.equal(c.messages[0].direction, direction);
    assert.equal(c.messages[0].routeMode, "comm-link-crew");
  }
  const ack = [...e.messages.values()].find(
    (d) => d.flags?.[MID]?.commLink?.response?.requestId === "stable-op",
  );
  assert.deepEqual(
    new Set(ack.whisper),
    new Set(["g"]),
    "ack is private; the protected crew Journal is the shared transport",
  );
  const gmReply = {
    ownerUserId: "a",
    actorId: "aa",
    contactId,
    body: "Wakako replies to the crew",
    operationId: "gm-reply",
  };
  await sendCityContactMessage(gmReply);
  await sendCityContactMessage(gmReply);
  const replied = groupDoc.flags[MID].commLink.data.messages.find(
    (message) => message.id === "gm-reply",
  );
  assert.equal(
    replied.sender,
    "npc",
    "GM replying in a player's Archive speaks as the contact",
  );
  assert.equal(replied.senderName, "Wakako");
  assert.notEqual(
    replied.senderActorId,
    "aa",
    "the target player's Actor is not the NPC sender",
  );
  assert.equal(replied.threadId, "contact:fixer");
  assert.equal(
    groupDoc.flags[MID].commLink.data.messages.length,
    2,
    "GM reply retry is idempotent",
  );
  assert.equal(
    groupDoc.flags[MID].commLink.data.operations["g:gm-reply"].status,
    "applied",
  );
  for (const [userId, actorId] of [
    ["a", "aa"],
    ["b", "bb"],
  ]) {
    const projected = e.users
      .get(userId)
      .flags.cyberpunkRemaster.neuroArchive.data.notebooks[
        actorId
      ].entries.people.find((p) => p.id === contactId).messages;
    const reply = projected.find(
      (message) => message.commLinkMessageId === "gm-reply",
    );
    assert.equal(reply.sender, "npc");
    assert.equal(reply.direction, "in");
    assert.equal(
      projected.filter((message) => message.commLinkMessageId === "gm-reply")
        .length,
      1,
    );
  }
  const forged = {
    id: "forged",
    author: e.users.get("a"),
    flags: {
      [MID]: {
        commLink: {
          runnerMutationRequest: {
            id: "forged-op",
            userId: "b",
            actorId: "aa",
            groupId: "crew",
            action: "contact-message",
            payload: { contactId: "fixer", body: "Forged" },
          },
        },
      },
    },
  };
  e.messages.set(forged.id, forged);
  await service.refresh();
  assert.equal(groupDoc.flags[MID].commLink.data.messages.length, 2);
  assert.equal(
    e.messages.has("forged"),
    true,
    "failed request remains for diagnosis/retry",
  );
  groupDoc.flags[MID].commLink.data.jobs.push({
    id: "contract",
    title: "Delivery",
    status: "available",
    risk: 2,
    pay: "50",
  });
  groupDoc.flags[MID].commLink.data.calls.push({
    id: "call",
    name: "Fixer",
    status: "ringing",
    transcript: [],
  });
  const request = async (id, userId, actorId, action, payload) => {
    e.messages.set(id, {
      id,
      author: e.users.get(userId),
      flags: {
        [MID]: {
          commLink: {
            runnerMutationRequest: {
              id,
              userId,
              actorId,
              groupId: "crew",
              action,
              payload,
            },
          },
        },
      },
    });
    await service.refresh();
  };
  await request("forged-npc", "a", "aa", "gm-contact-reply", {
    contactId: "fixer",
    body: "Forged NPC",
  });
  assert.equal(groupDoc.flags[MID].commLink.data.messages.length, 2);
  assert.equal(
    groupDoc.flags[MID].commLink.data.operations["a:forged-npc"],
    undefined,
  );
  assert.ok(
    [...e.messages.values()].some(
      (doc) =>
        doc.author.isGM &&
        doc.flags?.[MID]?.commLink?.response?.requestId === "forged-npc" &&
        doc.flags[MID].commLink.response.status === "error",
    ),
  );
  await request("non-leader", "b", "bb", "job-status", {
    id: "contract",
    status: "accepted",
  });
  assert.equal(groupDoc.flags[MID].commLink.data.jobs[0].status, "available");
  await request("leader", "a", "aa", "job-status", {
    id: "contract",
    status: "accepted",
  });
  assert.equal(groupDoc.flags[MID].commLink.data.jobs[0].status, "accepted");
  await request("answer", "b", "bb", "call-status", {
    id: "call",
    status: "accepted",
  });
  await request("line", "b", "bb", "call-line", {
    id: "call",
    body: "Copy that",
  });
  await request("end", "a", "aa", "call-end", { id: "call" });
  await request("line", "b", "bb", "call-line", {
    id: "call",
    body: "Copy that",
  });
  const call = groupDoc.flags[MID].commLink.data.calls[0];
  assert.equal(call.status, "ended");
  assert.equal(
    call.transcript.length,
    1,
    "retry after call ended acknowledges its original receipt",
  );
  assert.equal(call.transcript[0].body, "Copy that");
  assert.equal(call.transcript[0].actorId, "bb");

  groupDoc.flags[MID].commLink.data.messages.push({
    id: "anonymous-first",
    contactId: "",
    threadId: "anonymous:safe",
    sender: "npc",
    senderName: "UNKNOWN",
    body: "Private channel",
    createdAt: "2026-10-15T00:00:01.000Z",
  });
  await service.refresh();
  const anonymousReply = {
    ownerUserId: "a",
    actorId: "aa",
    contactId: "comm-link-contact:crew:thread:anonymous:safe",
    body: "Anonymous reply",
    operationId: "gm-anonymous-reply",
  };
  await sendCityContactMessage(anonymousReply);
  await sendCityContactMessage(anonymousReply);
  const anonymous = groupDoc.flags[MID].commLink.data.messages.filter(
    (message) => message.id === "gm-anonymous-reply",
  );
  assert.equal(anonymous.length, 1);
  assert.equal(anonymous[0].sender, "npc");
  assert.equal(anonymous[0].senderName, "UNKNOWN");
  assert.equal(anonymous[0].threadId, "anonymous:safe");

  const secondGM = {
    id: "g2",
    name: "Second GM",
    isGM: true,
    active: true,
    flags: {},
  };
  e.users.set("g2", secondGM);
  game.user = secondGM;
  const forwarded = sendCityContactMessage({
    ...gmReply,
    body: "Relayed NPC reply",
    operationId: "gm-forwarded",
  });
  const forwardedRequest = () =>
    [...e.messages.values()].find(
      (doc) =>
        doc.flags?.[MID]?.commLink?.runnerMutationRequest?.id ===
        "gm-forwarded",
    );
  for (let tick = 0; tick < 20 && !forwardedRequest(); tick++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(forwardedRequest()?.author.id, "g2");
  assert.equal(
    forwardedRequest()?.flags[MID].commLink.runnerMutationRequest.action,
    "gm-contact-reply",
  );
  assert.equal(
    groupDoc.flags[MID].commLink.data.messages.some(
      (message) => message.id === "gm-forwarded",
    ),
    false,
    "non-elected GM queues the request instead of writing the crew",
  );
  game.user = e.users.get("g");
  await service.refresh();
  const forwardedAck = [...e.messages.values()].find(
    (doc) =>
      doc.author.isGM &&
      doc.flags?.[MID]?.commLink?.response?.requestId === "gm-forwarded",
  );
  assert.equal(forwardedAck.flags[MID].commLink.response.status, "applied");
  game.user = secondGM;
  Hooks.callAll("createChatMessage", forwardedAck);
  await forwarded;
  game.user = e.users.get("g");
  assert.equal(
    groupDoc.flags[MID].commLink.data.operations["g2:gm-forwarded"].status,
    "applied",
  );
  const relayed = groupDoc.flags[MID].commLink.data.messages.filter(
    (message) => message.id === "gm-forwarded",
  );
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].sender, "npc");
  assert.equal(relayed[0].senderName, "Wakako");
  for (const [userId, actorId] of [
    ["a", "aa"],
    ["b", "bb"],
  ]) {
    const projection = e.users
      .get(userId)
      .flags.cyberpunkRemaster.neuroArchive.data.notebooks[
        actorId
      ].entries.people.find((p) => p.id === contactId);
    assert.equal(
      projection.messages.find(
        (message) => message.commLinkMessageId === "gm-forwarded",
      ).direction,
      "in",
    );
  }
});
