import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";

test("GM can explicitly reply as a contact in the GM's own Archive", async () => {
  const e = cityTestEnv();
  e.users.get("g").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive("") } },
  };
  const m = await import("../runtime/city-messaging.mjs");
  const doc = await m.sendCityContactMessage({
    ownerUserId: "g", actorId: "aa", contactId: "c",
    body: "Contact reply", operationId: "own-contact", asContact: true,
  });
  const p = m.cityContactPayload(doc);
  assert.equal(p.routeMode, "gm-to-player");
  assert.equal(p.sourceActorName, "Contact");
  assert.equal(p.targetActorName, "aa");
  assert.equal(m.cityThread({ ownerUserId: "g", actorId: "aa", contactId: "c" })[0].direction, "in");
  assert.equal(doc.speaker.alias, "Contact");
});

test("players cannot impersonate a contact or send through another Archive", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  const m = await import("../runtime/city-messaging.mjs");
  const args = { ownerUserId: "a", actorId: "aa", contactId: "c", body: "Forged", operationId: "forged-contact" };
  await assert.rejects(() => m.sendCityContactMessage({ ...args, asContact: true }), /GM|ведущ/i);
  assert.equal(e.messages.size, 0);
  await assert.rejects(() => m.sendCityContactMessage({ ...args, ownerUserId: "b", operationId: "forged-owner" }), /Архив/);
});
test("an authenticated sender cannot select another owner's Archive or an unknown route", async () => {
  const e = cityTestEnv({ gm: false });
  const m = await import("../runtime/city-messaging.mjs");
  const payload = {
    id: "misrouted",
    senderUserId: "a",
    sourceActorId: "aa",
    archiveUserId: "b",
    archiveActorId: "bb",
    routeMode: "player-to-gm",
  };
  const doc = {
    author: e.users.get("a"),
    flags: {
      "cyberpunk-remaster": { neuroArchive: { contactMessage: payload } },
    },
  };
  assert.equal(m.cityMessageAuthenticated(doc), false);
  payload.archiveUserId = "a";
  payload.archiveActorId = "aa";
  payload.routeMode = "unrecognized";
  assert.equal(m.cityMessageAuthenticated(doc), false);
  payload.routeMode = "player-to-gm";
  assert.equal(m.cityMessageAuthenticated(doc), true);
  game.user = e.users.get("b");
  assert.equal(
    m.cityMessageAuthenticated(doc),
    false,
    "a different player is not a recipient of the GM channel",
  );
});
test("phone sends canonical P2P history with private recipients and retry idempotence", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  const m = await import("../runtime/city-messaging.mjs").catch(() => null);
  assert.ok(m, "shared messaging must exist");
  const args = {
    ownerUserId: "a",
    actorId: "aa",
    contactId: "c",
    body: "<b>Hello</b>",
    operationId: "op1",
  };
  await m.sendCityContactMessage(args);
  await m.sendCityContactMessage(args);
  assert.equal(e.messages.size, 1);
  const doc = [...e.messages.values()][0];
  assert.deepEqual(new Set(doc.whisper), new Set(["a", "b", "g"]));
  assert.doesNotMatch(doc.content, /<b>Hello/);
  assert.equal(
    doc.flags["cyberpunk-remaster"].neuroArchive.contactMessage.threadId,
    "nc-neuro-p2p:aa:bb",
  );
  assert.equal(m.cityThread(args).length, 1);
  game.actors.get("aa").testUserPermission = () => false;
  await assert.rejects(
    () => m.sendCityContactMessage({ ...args, operationId: "op2" }),
    /персонаж/,
  );
});
test("GM replies keep the old thread and both canonical and Field Archive wire formats", async () => {
  const e = cityTestEnv();
  const store = cityArchive();
  store.notebooks.aa.entries.people[0].neuroConversationId = "legacy-thread";
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: store } },
  };
  const m = await import("../runtime/city-messaging.mjs");
  const doc = await m.sendCityContactMessage({
      ownerUserId: "a",
      actorId: "aa",
      contactId: "c",
      body: "GM reply",
      operationId: "reply1",
    }),
    f = doc.flags.cyberpunkRemaster.fieldArchiveNeuroLink;
  assert.equal(f.direction, "gm-to-player");
  assert.equal(f.contactPayload.direction, "in");
  assert.equal(f.threadId, "legacy-thread");
  const second = await m.sendCityContactMessage({
    ownerUserId: "a",
    actorId: "aa",
    contactId: "c",
    body: "Second reply",
    operationId: "reply2",
  });
  assert.equal(
    second.flags.cyberpunkRemaster.fieldArchiveNeuroLink.threadId,
    "legacy-thread",
  );
  assert.deepEqual(new Set(doc.whisper), new Set(["a", "g"]));
  assert.equal(
    e.users.get("a").flags.cyberpunkRemaster.neuroArchive.data.notebooks.aa
      .entries.people[0].messages[0].body,
    "GM reply",
  );
});
test("offline contact messages replay into phone contacts once before an Archive opens", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  const m = await import("../runtime/city-messaging.mjs");
  await m.sendCityContactMessage({
    ownerUserId: "a",
    actorId: "aa",
    contactId: "c",
    body: "While offline",
    operationId: "offline",
  });
  game.user = e.users.get("b");
  assert.equal(typeof m.syncCityMessagesInbox, "function");
  await m.syncCityMessagesInbox();
  await m.syncCityMessagesInbox();
  const contacts = m.cityContacts({ ownerUserId: "b", actorId: "bb" });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].messages.length, 1);
  assert.equal(contacts[0].messages[0].body, "While offline");
  const { mutateCityArchive } =
    await import("../runtime/city-archive-service.mjs");
  await mutateCityArchive("b", (s) => {
    s.notebooks.bb.entries.people = [];
  });
  await m.syncCityMessagesInbox();
  assert.equal(
    m.cityContacts({ ownerUserId: "b", actorId: "bb" }).length,
    0,
    "reopening must not recreate an already processed deleted contact",
  );
});
test("valid authors cannot deliver to a recipient whose Actor ownership was revoked", async () => {
  const e = cityTestEnv({ gm: false });
  const m = await import("../runtime/city-messaging.mjs");
  const payload = {
    id: "revoked",
    senderUserId: "b",
    sourceActorId: "bb",
    targetActorId: "aa",
    targetUserIds: ["a"],
    routeMode: "player-to-player",
  };
  const doc = {
    author: e.users.get("b"),
    flags: {
      "cyberpunk-remaster": { neuroArchive: { contactMessage: payload } },
    },
  };
  assert.equal(m.cityMessageAuthenticated(doc), true);
  game.actors.get("aa").testUserPermission = () => false;
  assert.equal(m.cityMessageAuthenticated(doc), false);
});
test("legacy Field Archive GM replies without contactPayload authenticate by actual document author", async () => {
  const e = cityTestEnv({ gm: false });
  const m = await import("../runtime/city-messaging.mjs");
  const doc = {
    author: e.users.get("g"),
    flags: {
      cyberpunkRemaster: {
        fieldArchiveNeuroLink: {
          direction: "gm-to-player",
          archiveMessageId: "legacy",
          playerUserId: "a",
          playerActorId: "aa",
          contactId: "c",
          text: "Legacy reply",
          threadId: "old-thread",
        },
      },
    },
  };
  assert.equal(m.cityMessageAuthenticated(doc), true);
  assert.equal(m.cityContactPayload(doc).threadId, "old-thread");
  doc.author = e.users.get("b");
  assert.equal(m.cityMessageAuthenticated(doc), false);
});
test("forged GM author in a player message does not enter canonical history", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  const m = await import("../runtime/city-messaging.mjs");
  const payload = {
    id: "fake",
    routeMode: "gm-to-player",
    archiveUserId: "a",
    archiveActorId: "aa",
    contactId: "c",
    body: "FORGED",
    senderUserId: "g",
  };
  await m.ingestCityMessage({
    author: e.users.get("b"),
    flags: {
      "cyberpunk-remaster": { neuroArchive: { contactMessage: payload } },
    },
  });
  assert.equal(
    m.cityThread({ ownerUserId: "a", actorId: "aa", contactId: "c" }).length,
    0,
  );
});
