import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeContactThreadMessages,
  resolveContactChatPayload,
} from "../runtime/neuro-archive-controller.mjs?2103-shared-history";

function chatMessage({ canonical = null, field = null } = {}) {
  return {
    id: `chat-${Math.random()}`,
    author: { id: (canonical || field?.contactPayload)?.senderUserId },
    flags: {
      ...(canonical
        ? {
            "cyberpunk-remaster": {
              neuroArchive: { contactMessage: canonical },
            },
          }
        : {}),
      ...(field ? { cyberpunkRemaster: { fieldArchiveNeuroLink: field } } : {}),
    },
  };
}

const THREAD = "nc-neuro-p2p:actor-a:actor-b";

function payload(id, senderUserId, targetUserIds, body, createdAt) {
  return {
    id,
    archiveMessageId: id,
    routeMode: "player-to-player",
    threadId: THREAD,
    senderUserId,
    targetUserIds,
    sourceActorId: senderUserId === "user-a" ? "actor-a" : "actor-b",
    sourceActorName: senderUserId === "user-a" ? "Альфа" : "Бета",
    targetActorId: senderUserId === "user-a" ? "actor-b" : "actor-a",
    body,
    createdAt,
  };
}

test("red neuro archive merges both players' chat messages into one thread without duplicates", () => {
  globalThis.game = {
    user: { id: "user-a" },
    actors: new Map(
      ["actor-a", "actor-b"].map((id) => [
        id,
        {
          testUserPermission: (user) =>
            user.id === (id === "actor-a" ? "user-a" : "user-b"),
        },
      ]),
    ),
  };
  assert.equal(typeof mergeContactThreadMessages, "function");

  const aToB = payload(
    "msg-a",
    "user-a",
    ["user-b"],
    "Привет",
    "2026-09-21T14:00:00.000Z",
  );
  const bToA = payload(
    "msg-b",
    "user-b",
    ["user-a"],
    "Ответ",
    "2026-09-21T14:01:00.000Z",
  );
  const stored = [{ ...aToB, direction: "out" }];
  const messages = [
    chatMessage({ canonical: aToB }),
    chatMessage({ canonical: bToA }),
  ];

  const merged = mergeContactThreadMessages({
    storedMessages: stored,
    chatMessages: messages,
    threadId: THREAD,
    currentUserId: "user-a",
  });

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["msg-a", "msg-b"],
  );
  assert.deepEqual(
    merged.map((entry) => entry.direction),
    ["out", "in"],
  );
  assert.deepEqual(
    merged.map((entry) => entry.body),
    ["Привет", "Ответ"],
  );
});

test("fieldArchive contactPayload is accepted when canonical neuroArchive payload is absent", () => {
  const incoming = payload(
    "msg-field",
    "user-b",
    ["user-a"],
    "Через fallback",
    "2026-09-21T14:02:00.000Z",
  );
  const message = chatMessage({
    field: {
      threadId: THREAD,
      routeMode: "player-to-player",
      archiveMessageId: incoming.id,
      contactPayload: incoming,
      text: incoming.body,
    },
  });

  assert.deepEqual(resolveContactChatPayload(message), incoming);
});
