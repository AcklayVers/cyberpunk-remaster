import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";

const MID = "cyberpunk-remaster";
const crew = (groupId, members, contacts, messages = []) => ({
  id: groupId,
  flags: { [MID]: { commLink: { data: { groupId, groupName: groupId, memberActorIds: members, contacts, messages } } } },
});

test("Chats merge authorized Network contacts without a Source initialization or render writes", async () => {
  const e = cityTestEnv({ gm: false });
  const store = cityArchive();
  store.notebooks.aa.entries.people.push({ id: "comm-link-contact:crew:npc", title: "Old label", commLinkSource: { id: "npc", name: "Old label" }, commLinkGroupId: "crew", commLinkContactId: "npc", messages: [] });
  store.notebooks.aa.entries.people.push({ id: "stale", title: "Revoked crew secret", commLinkGroupId: "revoked", commLinkContactId: "private", messages: [] });
  e.users.get("a").flags = { cyberpunkRemaster: { neuroArchive: { data: store } } };
  e.journals.set("crew", crew("crew", ["aa"], [
    { id: "npc", name: "Fixer" },
    { id: "different", name: "Fixer" },
    { id: "pc", name: "Contact", actorId: "bb" },
  ], [{ id: "anon", threadId: "anonymous:pub", sender: "npc", senderName: "UNKNOWN", body: "Hidden sender" }]));
  e.journals.set("revoked", crew("revoked", ["bb"], [{ id: "private", name: "Revoked crew secret" }]));
  e.journals.set("master", { id: "master", flags: { [MID]: { commLink: { masterContacts: { contacts: { hidden: { id: "hidden", name: "Unpublished" } } } } } } });
  const before = JSON.stringify([...e.users.values()].map(u => u.flags));
  const { cityContacts, cityThread } = await import("../runtime/city-messaging.mjs");
  const rows = cityContacts({ ownerUserId: "a", actorId: "aa" });
  assert.deepEqual(rows.map(c => c.id), ["c", "comm-link-contact:crew:npc", "comm-link-contact:crew:different", "comm-link-contact:crew:pc", "comm-link-contact:crew:thread:anonymous:pub"]);
  assert.equal(rows.filter(c => c.title === "Fixer").length, 2, "same display name is not a canonical identity");
  assert.equal(cityThread({ ownerUserId: "a", actorId: "aa", contactId: "comm-link-contact:crew:thread:anonymous:pub" })[0].body, "Hidden sender");
  assert.equal(JSON.stringify([...e.users.values()].map(u => u.flags)), before);
  assert.equal(cityContacts({ ownerUserId: "a", actorId: "bb" }).length, 0, "only an owned Actor supplies recipients");
});

test("the same NPC keeps distinct personal, wide-crew and private-crew routes and histories", async () => {
  const e = cityTestEnv();
  const store = cityArchive("npc");
  store.notebooks.aa.entries.people[0].messages.push({ id: "personal", body: "Personal history" });
  store.notebooks.aa.entries.people.push({ id: "comm-link-contact:private:fixer", title: "Same fixer", sourceActorId: "npc", commLinkGroupId: "private", commLinkContactId: "fixer", messages: [] });
  e.users.get("g").flags = { cyberpunkRemaster: { neuroArchive: { data: store } } };
  for (const [id, members, body] of [["wide", ["aa", "bb"], "Wide history"], ["private", ["aa"], "Private history"]])
    e.journals.set(id, crew(id, members, [{ id: "fixer", name: "Same fixer", actorId: "npc" }], [{ id: `message-${id}`, contactId: "fixer", sender: "npc", senderName: "Same fixer", body }]));
  const { cityContacts, cityThread } = await import("../runtime/city-messaging.mjs");
  assert.deepEqual(cityContacts({ ownerUserId: "g", actorId: "aa" }).map(c => c.id), ["c", "comm-link-contact:private:fixer", "comm-link-contact:wide:fixer"]);
  for (const [contactId, body] of [["c", "Personal history"], ["comm-link-contact:wide:fixer", "Wide history"], ["comm-link-contact:private:fixer", "Private history"]])
    assert.deepEqual(cityThread({ ownerUserId: "g", actorId: "aa", contactId }).map(m => m.body), [body]);
  const { prepareCityAgentContext } = await import("../runtime/city-agent-view.mjs");
  const html = prepareCityAgentContext({ ownerUserId: "g", actorId: "aa", contactId: "comm-link-contact:private:fixer", tab: "msg", drafts: {} }).bodyHtml;
  assert.match(html, /Same fixer · Сеть wide/);
  assert.match(html, /Same fixer · Сеть private/);
  assert.match(html, /Private history/);
  assert.doesNotMatch(html, /Wide history/);
});

test("a shared GM addressbook contact and its private crew publication do not combine routes", async () => {
  const e = cityTestEnv();
  e.journals.set("private", crew("private", ["aa"], [{ id: "fixer", name: "Same fixer", actorId: "npc" }], [{ id: "private-message", contactId: "fixer", sender: "npc", body: "Private crew secret" }]));
  e.journals.set("master", { flags: { [MID]: { commLink: { masterContacts: { contacts: { fixer: { id: "fixer", name: "Same fixer", actorId: "npc" } } } } } } });
  const { cityContacts, cityThread } = await import("../runtime/city-messaging.mjs");
  assert.deepEqual(cityContacts({ ownerUserId: "g", actorId: "aa" }).map(c => c.id), ["comm-link-contact:private:fixer", "comm-link-master-contact:fixer"]);
  assert.deepEqual(cityThread({ ownerUserId: "g", actorId: "aa", contactId: "comm-link-master-contact:fixer" }), []);
});

test("the GM's unpublished shared contacts materialize only on explicit send in the GM's own Archive", async () => {
  const e = cityTestEnv();
  e.journals.set("master", { id: "master", flags: { [MID]: { commLink: { masterContacts: { contacts: { private: { id: "private", name: "Private fixer", summary: "GM addressbook" } } } } } } });
  const { cityContacts, sendCityContactMessage, cityContactPayload } = await import("../runtime/city-messaging.mjs");
  const rows = cityContacts({ ownerUserId: "g", actorId: "aa" });
  assert.equal(rows[0]?.id, "comm-link-master-contact:private");
  assert.equal(e.users.get("g").flags.cyberpunkRemaster, undefined);
  assert.equal(cityContacts({ ownerUserId: "a", actorId: "aa" }).length, 0, "unpublished GM contacts are not copied to another Archive");
  const doc = await sendCityContactMessage({ ownerUserId: "g", actorId: "aa", contactId: rows[0].id, body: "Own NPC reply", operationId: "master-send", asContact: true });
  assert.equal(cityContactPayload(doc).sourceActorName, "Private fixer");
  const saved = e.users.get("g").flags.cyberpunkRemaster.neuroArchive.data.notebooks.aa.entries.people;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].commLinkMasterContactId, "private");
  assert.equal(e.journals.size, 1, "sending never invents a crew or another shared database");
});

test("replying to the private crew's copy of a shared NPC never sends to the wider crew", async () => {
  const e = cityTestEnv();
  const makeCrew = (id, members, body) => {
    const doc = crew(id, members, [{ id: "fixer", name: "Same fixer", actorId: "npc" }], [{ id: `msg-${id}`, threadId: "contact:fixer", contactId: "fixer", sender: "npc", senderName: "Same fixer", body }]);
    Object.assign(doc.flags[MID].commLink.data, { version: 8, revision: 0, leaderActorId: members[0], calls: [], jobs: [], events: [], payments: [] });
    doc.testUserPermission = u => u.isGM || u.id === "a" || id === "wide" && u.id === "b";
    doc.update = async function(changes) {
      for (const [path, value] of Object.entries(changes)) {
        let target = this;
        const keys = path.split(".");
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        target[keys.at(-1)] = structuredClone(value);
      }
      return this;
    };
    e.journals.set(id, doc);
    return doc;
  };
  const wide = makeCrew("wide", ["aa", "bb"], "Wide history");
  const privateCrew = makeCrew("private", ["aa"], "Private crew secret");
  e.journals.set("control", { id: "control", flags: { [MID]: { commLink: { control: { groups: [
    { id: "wide", name: "wide", journalId: "wide", actorIds: ["aa", "bb"], leaderActorId: "aa" },
    { id: "private", name: "private", journalId: "private", actorIds: ["aa"], leaderActorId: "aa" },
  ] } } } } });
  const { cityContacts, sendCityContactMessage } = await import("../runtime/city-messaging.mjs");
  const selected = cityContacts({ ownerUserId: "g", actorId: "aa" }).find(c => c.commLinkGroupId === "private");
  assert.ok(selected, "the picker must retain a separate selectable private route");
  await sendCityContactMessage({ ownerUserId: "g", actorId: "aa", contactId: selected.id, body: "Reply to private secret", operationId: "private-route", asContact: true });
  assert.deepEqual(wide.flags[MID].commLink.data.messages.map(m => m.body), ["Wide history"]);
  assert.deepEqual(privateCrew.flags[MID].commLink.data.messages.map(m => m.body), ["Private crew secret", "Reply to private secret"]);
  assert.equal(privateCrew.flags[MID].commLink.data.messages.at(-1).sender, "npc");
});
