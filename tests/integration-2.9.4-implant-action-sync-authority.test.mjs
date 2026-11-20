import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = path.join(root, "runtime", "implant-creator.mjs");

function installImportGlobals({ user = { id: "observer", isGM: false } } = {}) {
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
    uuid: "Actor.actor-1.Item.implant-1",
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

test("2.9.4 remote createItem hook does not try to create an activation Action on another user's client", async () => {
  const hooks = installImportGlobals({ user: { id: "observer", isGM: false } });
  await import(`${pathToFileURL(runtimePath).href}?authority-remote-create-${Date.now()}`);

  let createCalls = 0;
  const actor = {
    id: "actor-1",
    isOwner: false,
    items: [],
    async createEmbeddedDocuments() {
      createCalls += 1;
      throw new Error("observer must not attempt embedded creation");
    },
  };
  const item = activationImplant(actor);
  const hook = hooks.get("createItem")?.at(-1);
  assert.equal(typeof hook, "function");

  hook(item, {}, "gm-user");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(createCalls, 0);
});

test("2.9.4 action synchronization refuses actors the current user cannot manage", async () => {
  installImportGlobals({ user: { id: "observer", isGM: false } });
  const mod = await import(`${pathToFileURL(runtimePath).href}?authority-direct-sync-${Date.now()}`);

  let createCalls = 0;
  const actor = {
    id: "actor-2",
    isOwner: false,
    items: [],
    async createEmbeddedDocuments() {
      createCalls += 1;
      throw new Error("observer must not attempt embedded creation");
    },
  };
  const item = activationImplant(actor);

  const changed = await mod.syncActivationActionForImplant(item);
  assert.equal(changed, false);
  assert.equal(createCalls, 0);
});
