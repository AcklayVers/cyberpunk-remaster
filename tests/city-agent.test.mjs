import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";

test("own GM Archive offers explicit speaker context and another Archive keeps its automatic contact reply", async () => {
  const e = cityTestEnv();
  for (const id of ["g", "a"]) e.users.get(id).flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive("") } },
  };
  const { prepareCityAgentContext, agentDraftKey } = await import("../runtime/city-agent-view.mjs");
  const s = { ownerUserId: "g", actorId: "aa", contactId: "c", tab: "msg", drafts: {}, speakerMode: "contact" };
  const context = prepareCityAgentContext(s);
  assert.match(context.bodyHtml, /data-agent-speaker/);
  assert.match(context.bodyHtml, /Contact → aa/);
  const replyKey = agentDraftKey(s);
  s.speakerMode = "actor";
  assert.notEqual(agentDraftKey(s), replyKey, "each speaker has its own recipient draft");
  assert.match(prepareCityAgentContext(s).bodyHtml, /aa → Contact/);
  s.ownerUserId = "a";
  const other = prepareCityAgentContext(s);
  assert.doesNotMatch(other.bodyHtml, /data-agent-speaker/);
  assert.match(other.bodyHtml, /Ответ от имени контакта/);
  assert.match(other.bodyHtml, /Contact → aa/);
});

test("changing recipient or speaker cannot capture a rendered draft into the new conversation", async () => {
  const e = cityTestEnv();
  e.users.get("g").flags = { cyberpunkRemaster: { neuroArchive: { data: cityArchive("") } } };
  game.system = { id: "sf2e" };
  class App {
    constructor() { this.position = {}; this.rendered = true; }
    render() { return Promise.resolve(this); }
    bringToFront() {}
    _onClose() {}
  }
  globalThis.foundry = { applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: c => c } } };
  const { openCityAgent } = await import("../runtime/city-agent-runtime.mjs");
  const { agentDraftKey } = await import("../runtime/city-agent-view.mjs");
  const app = await openCityAgent({ ownerUserId: "g", actorId: "aa", tab: "msg" });
  app.contactId = "c"; app.speakerMode = "contact";
  const firstKey = agentDraftKey(app);
  const compose = { value: "First unsent", dataset: { agentDraftKey: firstKey }, matches: () => true, selectionStart: 3, selectionEnd: 3 };
  app.element = { contains: () => true, querySelector: () => compose };
  globalThis.document = { activeElement: compose };
  app.contactId = "second";
  const secondKey = agentDraftKey(app);
  app.drafts[secondKey] = "Second unsent";
  await app.render(true);
  assert.equal(app.drafts[firstKey], "First unsent");
  assert.equal(app.drafts[secondKey], "Second unsent");
  app.speakerMode = "actor";
  const actorKey = agentDraftKey(app);
  app.drafts[actorKey] = "Actor unsent";
  await app.render(true);
  assert.equal(app.drafts[actorKey], "Actor unsent");
  app._onClose({});
  delete globalThis.document;
});
test("agent hotkeys ignore typing and phone reads the same archive contacts", async () => {
  const e = cityTestEnv({ gm: false });
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  const m = await import("../runtime/city-agent-runtime.mjs").catch(() => null);
  assert.ok(m, "phone runtime must exist");
  assert.equal(m.cityAgentHotkeyAllowed({ tagName: "INPUT" }), false);
  assert.equal(m.cityAgentHotkeyAllowed({ isContentEditable: true }), false);
  assert.equal(m.cityAgentHotkeyAllowed({ tagName: "DIV" }), true);
  const c = m.prepareCityAgentContext({
    ownerUserId: "a",
    actorId: "aa",
    contactId: "c",
    tab: "msg",
    drafts: { "a:aa:c": "Draft" },
  });
  assert.equal(c.contact.title, "Contact");
  assert.match(c.bodyHtml, /Draft/);
  assert.doesNotMatch(c.bodyHtml, /data-agent-action="grant"/);
  const network = m.prepareCityAgentContext({
    ownerUserId: "a",
    actorId: "aa",
    contactId: "c",
    tab: "network",
    drafts: {},
  });
  assert.match(network.bodyHtml, /data-agent-comm-link/u);
  assert.match(network.bodyHtml, /data-tab="network"/u);
});

test("Agent tabs share one context and leave window controls to Foundry", async () => {
  cityTestEnv();
  const { prepareCityAgentContext } =
    await import("../runtime/city-agent-view.mjs");
  for (const tab of ["msg", "jobs", "network", "me"]) {
    const { bodyHtml } = prepareCityAgentContext({
      ownerUserId: "g",
      actorId: "aa",
      contactId: "__network",
      tab,
      drafts: {},
    });
    assert.equal((bodyHtml.match(/data-agent-actor/g) || []).length, 1);
    assert.match(bodyHtml, new RegExp(`data-tab="${tab}" class="active"`));
    assert.doesNotMatch(bodyHtml, /data-agent-action="mini"/);
    assert.doesNotMatch(bodyHtml, /class="agent-brand"/);
  }
});

test("Agent Jobs show the selected Actor's native crew contract and Network action", async () => {
  const e = cityTestEnv();
  e.journals.set("crew", { flags: { "cyberpunk-remaster": { commLink: { data: {
    groupId: "crew", groupName: "Neon crew", memberActorIds: ["aa"],
    jobs: [{ id: "job", title: "Network contract", status: "available", pay: "100" }],
  } } } } });
  const { prepareCityAgentContext } = await import("../runtime/city-agent-view.mjs");
  const s = { ownerUserId: "g", actorId: "aa", contactId: "__network", tab: "jobs", drafts: {} };
  const own = prepareCityAgentContext(s).bodyHtml;
  assert.match(own, /Neon crew/);
  assert.match(own, /data-agent-action="job-network"/);
  assert.match(own, /comm-link-job:crew:job/);
  assert.doesNotMatch(prepareCityAgentContext({ ...s, actorId: "bb" }).bodyHtml, /Network contract/);
});
