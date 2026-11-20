import assert from "node:assert/strict";
import test from "node:test";

const storeModule = await import("../runtime/neuro-archive-store.mjs?2102-neuro-player-routing");

function user(id, { isGM = false, active = true } = {}) {
  return { id, isGM, active, name: id };
}

function actor(id, ownerIds = []) {
  return {
    id,
    uuid: `Actor.${id}`,
    name: id,
    img: `${id}.webp`,
    type: "character",
    testUserPermission(target, level) {
      return level === "OWNER" && ownerIds.includes(target?.id);
    },
  };
}

test("player contact route targets the owning player and keeps GM observing the same channel", () => {
  assert.equal(typeof storeModule.resolveUnifiedNeuroContactRoute, "function");
  const a = user("user-a");
  const b = user("user-b");
  const gm = user("gm", { isGM: true });
  const route = storeModule.resolveUnifiedNeuroContactRoute({
    users: [a, b, gm],
    senderUserId: a.id,
    sourceActor: actor("actor-a", [a.id]),
    contactActor: actor("actor-b", [b.id]),
  });

  assert.equal(route.mode, "player-to-player");
  assert.deepEqual(route.targetUserIds, [b.id]);
  assert.deepEqual(route.recipientUserIds, [a.id, b.id, gm.id]);
  assert.equal(route.targetActorId, "actor-b");
  assert.equal(route.threadId, "nc-neuro-p2p:actor-a:actor-b");
});

test("NPC contact route falls back to GM without pretending there is a player recipient", () => {
  const a = user("user-a");
  const gm = user("gm", { isGM: true });
  const route = storeModule.resolveUnifiedNeuroContactRoute({
    users: [a, gm],
    senderUserId: a.id,
    sourceActor: actor("actor-a", [a.id]),
    contactActor: actor("npc-contact", []),
  });

  assert.equal(route.mode, "player-to-gm");
  assert.deepEqual(route.targetUserIds, []);
  assert.deepEqual(route.recipientUserIds, [a.id, gm.id]);
});

test("incoming player message creates a replyable mirrored contact once in the recipient archive", () => {
  assert.equal(typeof storeModule.ingestUnifiedNeuroContactMessage, "function");
  const store = storeModule.mergeArchiveStores({ notebooks: {} });
  const targetActor = actor("actor-b", ["user-b"]);
  const sourceActor = actor("actor-a", ["user-a"]);
  const payload = {
    id: "msg-1",
    body: "Проверка связи",
    createdAt: "2026-09-21T12:00:00.000Z",
    senderUserId: "user-a",
    senderName: "Игрок A",
    sourceActorId: "actor-a",
    sourceActorName: "Альфа",
    sourceActorUuid: "Actor.actor-a",
    targetActorId: "actor-b",
    targetUserIds: ["user-b"],
    threadId: "nc-neuro-p2p:actor-a:actor-b",
    routeMode: "player-to-player",
  };

  const first = storeModule.ingestUnifiedNeuroContactMessage(store, {
    currentUserId: "user-b",
    targetActor,
    sourceActor,
    payload,
  });
  const second = storeModule.ingestUnifiedNeuroContactMessage(store, {
    currentUserId: "user-b",
    targetActor,
    sourceActor,
    payload,
  });

  assert.equal(first.changed, true);
  assert.equal(first.createdContact, true);
  assert.equal(second.changed, false);
  const book = store.notebooks["actor-b"];
  assert.equal(book.entries.people.length, 1);
  const contact = book.entries.people[0];
  assert.equal(contact.title, "Альфа");
  assert.equal(contact.sourceActorId, "actor-a");
  assert.equal(contact.sourceActorUuid, "Actor.actor-a");
  assert.equal(contact.neuroConversationId, "nc-neuro-p2p:actor-a:actor-b");
  assert.equal(contact.messages.length, 1);
  assert.equal(contact.messages[0].direction, "in");
  assert.equal(contact.messages[0].body, "Проверка связи");
});

import { readFileSync } from "node:fs";

for (const controllerName of ["neuro-archive-controller.mjs", "cyber-archive-controller.mjs", "neo-archive-controller.mjs"]) {
  test(`${controllerName} routes player contacts through the unified player-to-player neuro channel`, () => {
    const source = readFileSync(new URL(`../runtime/${controllerName}`, import.meta.url), "utf8");
    assert.match(source, /resolveUnifiedNeuroContactRoute/u);
    assert.match(source, /ingestUnifiedNeuroContactMessage/u);
    assert.match(source, /routeMode/u);
    assert.match(source, /targetUserIds/u);
  });
}
