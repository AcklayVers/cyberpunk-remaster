import test from "node:test";
import assert from "node:assert/strict";
import { projectCommLinkGroupIntoStore } from "../runtime/city-comm-link-core.mjs";
import { readUnifiedServerData } from "../runtime/neuro-archive-store.mjs";
import { readCityAgentContacts } from "../runtime/city-agent-contacts.mjs";
import { cityTestEnv } from "./fixtures/city-services.mjs";

const actor = { id: "aa", name: "Runner" };
const crew = (contacts = [], messages = []) => ({
  groupId: "crew",
  groupName: "Crew",
  memberActorIds: [actor.id],
  contacts,
  messages,
});
const project = (store, group) => {
  projectCommLinkGroupIntoStore(store, { actor, group });
  return store.notebooks.aa.entries.people;
};

test("message-only contacts retain the NPC portrait and latest published identity, never the runner reply", () => {
  const store = { notebooks: {} };
  const group = crew(
    [],
    [
      {
        id: "reply",
        threadId: "manual-fixer",
        sender: "player",
        senderName: "Runner",
        image: "runner.webp",
        createdAt: "2026-01-03",
      },
      {
        id: "old",
        threadId: "manual-fixer",
        sender: "npc",
        senderName: "Old alias",
        senderImage: "old.webp",
        createdAt: "2026-01-01",
      },
      {
        id: "new",
        threadId: "manual-fixer",
        sender: "npc",
        senderName: "Fixer",
        senderImage: "portrait.webp",
        image: "other.webp",
        createdAt: "2026-01-02",
      },
    ],
  );
  const [contact] = project(store, group);
  assert.equal(contact.title, "Fixer");
  assert.equal(contact.image, "portrait.webp");
  assert.equal(contact.messages.length, 3);
  assert.equal(project(store, group).length, 1);
});

test("published contact changes propagate, while custom Archive fields and deliberate clearing survive", () => {
  const store = { notebooks: {} };
  const group = crew([
    {
      id: "npc",
      name: "Old alias",
      tokenImage: "token.webp",
      summary: "Old dossier",
      tags: ["fixer"],
    },
  ]);
  const [entry] = project(store, group);
  assert.equal(entry.image, "token.webp");
  Object.assign(group.contacts[0], {
    name: "Fixer",
    image: "new.webp",
    summary: "New dossier",
  });
  project(store, group);
  assert.equal(entry.title, "Fixer");
  assert.equal(entry.image, "new.webp");
  assert.equal(entry.summary, "New dossier");
  Object.assign(entry, {
    title: "My alias",
    image: "my.webp",
    summary: "My notes",
    tags: "my tag",
  });
  Object.assign(group.contacts[0], {
    name: "Another alias",
    image: "another.webp",
    summary: "Changed",
    tags: ["changed"],
  });
  project(store, group);
  assert.equal(entry.title, "My alias");
  assert.equal(entry.image, "my.webp");
  assert.equal(entry.summary, "My notes");
  assert.equal(entry.tags, "my tag");
  entry.image = "";
  project(store, group);
  assert.equal(
    entry.image,
    "",
    "an explicitly cleared portrait is a local edit",
  );
});

test("legacy projected cards repair from the saved published source on read, without a write", () => {
  const store = { notebooks: {} };
  const [entry] = project(
    store,
    crew([{ id: "npc", name: "Fixer", image: "portrait.webp" }]),
  );
  delete entry.commLinkPresentation;
  entry.image = ""; // 2.17.4 projection did not copy photos from message-only contacts.
  const user = {
    flags: { cyberpunkRemaster: { neuroArchive: { data: store } } },
  };
  const before = JSON.stringify(user.flags);
  const repaired = readUnifiedServerData(user).notebooks.aa.entries.people[0];
  assert.equal(repaired.image, "portrait.webp");
  assert.equal(repaired.title, "Fixer");
  assert.equal(JSON.stringify(user.flags), before);
  entry.title = "My alias";
  entry.image = "my.webp";
  const custom = readUnifiedServerData(user).notebooks.aa.entries.people[0];
  assert.equal(custom.title, "My alias");
  assert.equal(custom.image, "my.webp");
});

test("legacy source labels update in place and preserve history, notes and map links", () => {
  const store = { notebooks: {} };
  const group = crew([{ id: "npc", name: "Old alias", image: "old.webp" }]);
  const [entry] = project(store, group);
  delete entry.commLinkPresentation;
  Object.assign(entry, {
    content: "private",
    locationIds: ["bar"],
    messages: [{ id: "personal", body: "History" }],
  });
  Object.assign(group.contacts[0], { name: "Fixer", image: "new.webp" });
  project(store, group);
  assert.equal(entry.title, "Fixer");
  assert.equal(entry.image, "new.webp");
  assert.equal(entry.content, "private");
  assert.deepEqual(entry.locationIds, ["bar"]);
  assert.equal(entry.messages[0].body, "History");
});

test("opening an old Archive recovers a message-only card from its saved Network messages", () => {
  const entry = {
    id: "comm-link-contact:crew:thread:manual",
    type: "people",
    title: "Runner",
    image: "",
    commLinkGroupId: "crew",
    commLinkContactId: "thread:manual",
    commLinkSource: { id: "thread:manual", name: "Runner" },
    content: "My notes",
    locationIds: ["bar"],
    messages: [
      {
        id: "comm-link:crew:reply",
        commLinkGroupId: "crew",
        threadId: "manual",
        sender: "player",
        senderName: "Runner",
        image: "runner.webp",
      },
      {
        id: "comm-link:crew:npc",
        commLinkGroupId: "crew",
        threadId: "manual",
        sender: "npc",
        senderName: "Fixer",
        image: "portrait.webp",
      },
    ],
  };
  const user = {
    flags: {
      cyberpunkRemaster: {
        neuroArchive: {
          data: { notebooks: { aa: { entries: { people: [entry] } } } },
        },
      },
    },
  };
  const repaired = readUnifiedServerData(user).notebooks.aa.entries.people[0];
  assert.equal(repaired.title, "Fixer");
  assert.equal(repaired.image, "portrait.webp");
  assert.equal(repaired.content, "My notes");
  assert.deepEqual(repaired.locationIds, ["bar"]);
  assert.equal(entry.title, "Runner", "reading does not write world flags");
});

test("legacy message-only contacts with ordinary IDs recover without replacing explicit contact identities", () => {
  const people = [
    {
      id: "legacy",
      type: "people",
      title: "Fixer",
      image: "",
      commLinkGroupId: "crew",
      commLinkContactId: "fixer",
      commLinkSource: { id: "fixer", name: "Fixer" },
      messages: [
        {
          id: "m",
          commLinkGroupId: "crew",
          contactId: "fixer",
          sender: "npc",
          senderName: "Fixer",
          senderImage: "portrait.webp",
        },
      ],
    },
    {
      id: "published",
      type: "people",
      title: "Public alias",
      image: "",
      commLinkGroupId: "crew",
      commLinkContactId: "contact",
      commLinkSource: {
        id: "contact",
        name: "Public alias",
        source: "master",
        image: "",
        tags: [],
        summary: "",
      },
      messages: [
        {
          id: "m2",
          commLinkGroupId: "crew",
          contactId: "contact",
          sender: "npc",
          senderName: "Different sender",
          senderImage: "different.webp",
        },
      ],
    },
  ];
  const user = {
    flags: {
      cyberpunkRemaster: {
        neuroArchive: { data: { notebooks: { aa: { entries: { people } } } } },
      },
    },
  };
  const recovered = readUnifiedServerData(user).notebooks.aa.entries.people;
  assert.equal(recovered[0].image, "portrait.webp");
  assert.equal(recovered[1].title, "Public alias");
  assert.equal(recovered[1].image, "");
});

test("anonymous and outgoing-only threads never borrow a runner or unpublished Actor identity", () => {
  const store = { notebooks: {} };
  const people = project(
    store,
    crew(
      [],
      [
        {
          id: "anonymous",
          threadId: "anonymous:publication",
          sender: "npc",
          senderName: "UNKNOWN",
        },
        {
          id: "reply",
          threadId: "anonymous:publication",
          sender: "player",
          senderName: "Runner",
          image: "runner.webp",
        },
        {
          id: "outgoing",
          threadId: "unlisted",
          sender: "player",
          senderName: "Runner",
          image: "runner.webp",
        },
      ],
    ),
  );
  assert.equal(people[0].title, "UNKNOWN");
  assert.equal(people[0].image, "");
  assert.equal(people[1].title, "COMM-LINK");
  assert.equal(people[1].image, "");
});

test("Agent uses the same published contact identity and respects custom Archive edits without writes", () => {
  const e = cityTestEnv({ gm: false });
  const store = { notebooks: {} };
  const group = crew(
    [{ id: "npc", name: "Old alias", image: "old.webp" }],
    [
      {
        id: "manual",
        threadId: "manual",
        sender: "npc",
        senderName: "Manual fixer",
        image: "manual.webp",
      },
    ],
  );
  const [entry] = project(store, group);
  Object.assign(entry, { title: "My alias", image: "my.webp" });
  Object.assign(group.contacts[0], { name: "Fixer", image: "new.webp" });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: store } },
  };
  e.journals.set("crew", {
    flags: { "cyberpunk-remaster": { commLink: { data: group } } },
  });
  const before = JSON.stringify(e.users.get("a").flags);
  const rows = readCityAgentContacts({ ownerUserId: "a", actorId: "aa" });
  assert.equal(rows[0].title, "My alias");
  assert.equal(rows[0].image, "my.webp");
  assert.equal(rows[1].title, "Manual fixer");
  assert.equal(rows[1].image, "manual.webp");
  assert.equal(JSON.stringify(e.users.get("a").flags), before);
});
