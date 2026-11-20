import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = path.join(root, "runtime", "implant-creator.mjs");

function installImportGlobals({ user = { id: "gm", isGM: true } } = {}) {
  const hooks = new Map();
  globalThis.Hooks = {
    once(name, callback) {
      const list = hooks.get(name) ?? [];
      list.push(callback);
      hooks.set(name, list);
    },
    on(name, callback) {
      const list = hooks.get(name) ?? [];
      list.push(callback);
      hooks.set(name, list);
    },
    callAll() {},
  };
  globalThis.game = {
    user,
    users: [],
    modules: new Map(),
    settings: { register() {}, get() { return undefined; }, async set() {} },
    actors: new Map(),
    items: [],
    time: { worldTime: 0 },
    combat: null,
  };
  globalThis.CONFIG = { SF2E: {} };
  globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
  globalThis.document = {
    body: {},
    createElement() {
      return {
        innerHTML: "",
        set textContent(value) {
          this.innerHTML = String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('\"', "&quot;");
        },
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  return hooks;
}

function activationImplant(actor) {
  return {
    id: "implant-1",
    uuid: `Actor.${actor.id}.Item.implant-1`,
    name: "Тестовый имплант",
    type: "equipment",
    parent: actor,
    flags: {
      "cyberpunk-implant-creator": {
        installed: true,
        activation: {
          enabled: true,
          name: "Активировать",
          actionType: "action1",
          traits: [],
          frequency: "unlimited",
          frequencyMax: 1,
          requirements: "",
          trigger: "",
          effectDescription: "",
          showOnActionsSheet: true,
        },
      },
    },
    system: { equipped: { carryType: "implanted" } },
  };
}

test("2.9.5 action sync skips Party-like actors whose allowedItemTypes excludes action", async () => {
  installImportGlobals();
  const mod = await import(`${pathToFileURL(runtimePath).href}?allowed-types-party-${Date.now()}`);

  let createCalls = 0;
  const actor = {
    id: "party-1",
    type: "party",
    isOwner: true,
    allowedItemTypes: ["condition", "effect"],
    items: [],
    async createEmbeddedDocuments() {
      createCalls += 1;
      throw new Error("Party actor must never receive an action Item");
    },
  };
  const item = activationImplant(actor);
  actor.items.push(item);

  const changed = await mod.syncActivationActionForImplant(item);
  assert.equal(changed, false);
  assert.equal(createCalls, 0);
});

test("2.9.5 action sync still creates activation Actions for actors that allow action Items", async () => {
  installImportGlobals();
  const mod = await import(`${pathToFileURL(runtimePath).href}?allowed-types-character-${Date.now()}`);

  let createCalls = 0;
  let createdSource = null;
  const actor = {
    id: "character-1",
    type: "character",
    isOwner: true,
    allowedItemTypes: ["action", "condition", "effect", "equipment"],
    items: [],
    async createEmbeddedDocuments(documentName, sources) {
      createCalls += 1;
      assert.equal(documentName, "Item");
      createdSource = sources[0];
      return sources;
    },
  };
  const item = activationImplant(actor);
  actor.items.push(item);

  const changed = await mod.syncActivationActionForImplant(item);
  assert.equal(changed, true);
  assert.equal(createCalls, 1);
  assert.equal(createdSource?.type, "action");
});
