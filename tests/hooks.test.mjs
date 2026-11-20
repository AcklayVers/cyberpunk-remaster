import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const registered = new Map();
const settingDefinitions = new Map();
class ForcedDeletion {}

globalThis.foundry = {
  data: { operators: { ForcedDeletion } },
};

globalThis.Hooks = {
  on(name, callback) {
    const callbacks = registered.get(name) ?? [];
    callbacks.push(callback);
    registered.set(name, callbacks);
  },
  once(name, callback) {
    this.on(name, callback);
  },
};
globalThis.game = {
  user: { id: "test-user", isGM: true },
  actors: { filter: () => [] },
  modules: new Map(),
  settings: {
    register(namespace, key, definition) {
      settingDefinitions.set(`${namespace}.${key}`, definition);
    },
    get(namespace, key) {
      return settingDefinitions.get(`${namespace}.${key}`)?.default;
    },
  },
};
globalThis.ui = {
  notifications: {
    error() {},
    info() {},
    warn() {},
  },
};

const runtime = await import("../runtime/cyberware-runtime.mjs?hook-tests");
const { CyberwareTab } = await import("../sheets/CyberwareTab.js");

function setPath(object, path, value) {
  const parts = path.split(".");
  const legacyDeletion = parts.at(-1).startsWith("-=");
  const operatorDeletion = value instanceof ForcedDeletion;
  if (legacyDeletion) parts[parts.length - 1] = parts.at(-1).slice(2);
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  if (legacyDeletion || operatorDeletion) delete target[parts.at(-1)];
  else target[parts.at(-1)] = value;
}

function item({
  id,
  installed = false,
  traits = ["neironn-uskoritell"],
  flags = {},
} = {}) {
  const document = {
    id,
    name: id,
    type: "equipment",
    flags: {
      "cyberpunk-remaster": {
        cyberware: true,
        installed,
        ...flags,
      },
    },
    system: {
      containerId: null,
      description: { value: "" },
      equipped: {
        carryType: installed ? "implanted" : "worn",
        handsHeld: 0,
        inSlot: false,
        invested: false,
      },
      traits: { value: traits },
      usage: { value: "implanted" },
    },
    getFlag(namespace, key) {
      return this.flags?.[namespace]?.[key];
    },
    updateSource(update) {
      for (const [path, value] of Object.entries(update)) {
        setPath(this, path, value);
      }
    },
  };
  return document;
}

function hook(name) {
  const callbacks = registered.get(name) ?? [];
  assert.ok(callbacks.length, `Missing ${name} hook`);
  return callbacks.at(-1);
}

test("module registers configurable world rules", () => {
  hook("init")();
  const keys = [
    "allowMultipleCyberdecks",
    "allowMultipleNeuralAccelerators",
    "allowMultiplePktBodies",
    "allowPktWithoutBody",
    "allowPktBodyWithoutBiosystem",
    "ignoreSlotLimits",
    "ignorePktQualityLimits",
    "hardCostMultiplier",
  ];
  for (const key of keys) {
    const definition = settingDefinitions.get(`cyberpunk-remaster.${key}`);
    assert.ok(definition, `Missing setting ${key}`);
    assert.equal(definition.scope, "world");
    assert.equal(definition.config, true);
  }
  assert.equal(
    settingDefinitions.get("cyberpunk-remaster.allowMultipleCyberdecks")
      .default,
    false,
  );
  assert.equal(
    settingDefinitions.get("cyberpunk-remaster.hardCostMultiplier").default,
    1,
  );
});

test("compendium cache is cleared on every client, not only the acting client", () => {
  let cleared = 0;
  const original = CyberwareTab.clearPktContentCache;
  CyberwareTab.clearPktContentCache = () => {
    cleared++;
  };
  try {
    hook("updateItem")(
      {
        id: "pack-item",
        pack: "cyberpunk-remaster.cyberpunk-items",
        actor: null,
      },
      {},
      {},
      "another-client",
    );
    hook("updateJournalEntryPage")({
      pack: "cyberpunk-remaster.cyberpunk-journals",
    });
  } finally {
    CyberwareTab.clearPktContentCache = original;
  }
  assert.equal(cleared, 2);
});

test("batch creation cannot install two neural accelerators", () => {
  const first = item({ id: "first" });
  const second = item({ id: "second" });
  const actor = { type: "character", items: [] };
  first.actor = actor;
  second.actor = actor;
  const options = {};
  const preCreate = hook("preCreateItem");

  preCreate(first, {}, options, "test-user");
  preCreate(second, {}, options, "test-user");

  assert.equal(first.getFlag("cyberpunk-remaster", "installed"), true);
  assert.equal(second.getFlag("cyberpunk-remaster", "installed"), false);
});

test("batch update validates against earlier planned installation states", () => {
  const first = item({ id: "first" });
  const second = item({ id: "second" });
  const actor = { type: "character", items: [first, second] };
  first.actor = actor;
  second.actor = actor;
  const options = {};
  const preUpdate = hook("preUpdateItem");

  const firstResult = preUpdate(
    first,
    { "flags.cyberpunk-remaster.installed": true },
    options,
  );
  const secondResult = preUpdate(
    second,
    { "flags.cyberpunk-remaster.installed": true },
    options,
  );

  assert.equal(firstResult, undefined);
  assert.equal(secondResult, false);
});

test("ordered batch replacement can remove then install a unique implant", () => {
  const previous = item({ id: "previous", installed: true });
  const replacement = item({ id: "replacement" });
  const actor = {
    type: "character",
    items: [previous, replacement],
  };
  previous.actor = actor;
  replacement.actor = actor;
  const options = {};
  const preUpdate = hook("preUpdateItem");

  const removeResult = preUpdate(
    previous,
    { "flags.cyberpunk-remaster.installed": false },
    options,
  );
  const installResult = preUpdate(
    replacement,
    { "flags.cyberpunk-remaster.installed": true },
    options,
  );

  assert.equal(removeResult, undefined);
  assert.equal(installResult, undefined);
});

test("only unique PKT bases block individual inventory removal and deletion", () => {
  const cases = [
    ["ordinary-base", "base", { pktReplaceableBase: true }, true],
    ["legacy-base", "base", { pktReplaceable: true }, true],
    ["unmarked-base", "base", {}, true],
    [
      "unique-base",
      "base",
      { pktUniqueBase: true, pktReplaceableBase: true },
      false,
    ],
    ["legacy-unique-base", "base", { pktReplaceable: false }, false],
    ["nonreplaceable-base", "base", { pktReplaceableBase: false }, false],
    ["module", "module", { pktReplaceableBase: false }, true],
    ["internal", "internal", { pktUniqueBase: true }, true],
    ["external", "external", {}, true],
    ["fashion", "fashion", {}, true],
  ];
  const preDelete = hook("preDeleteItem");
  const preUpdate = hook("preUpdateItem");

  for (const [id, implantType, flags, allowed] of cases) {
    const component = item({
      id,
      installed: true,
      traits: ["pkt"],
      flags: { implantType, pktLocked: true, pktModelKey: "model", ...flags },
    });
    component.actor = { type: "character", items: [component] };
    const wanted = allowed ? undefined : false;
    assert.equal(preDelete(component, {}, "test-user"), wanted, id);
    const changes = { "system.equipped.carryType": "worn" };
    assert.equal(preUpdate(component, changes, {}), wanted, id);
    if (allowed) {
      component.updateSource(changes);
      assert.equal(CyberwareTab.isInstalled(component), false, id);
      assert.equal(
        CyberwareTab.getFlag(component, "pktModelKey"),
        undefined,
        id,
      );
    } else {
      assert.equal(
        preDelete(
          component,
          { cyberpunkRemasterModelOperation: true },
          "test-user",
        ),
        undefined,
        id,
      );
    }
  }
});

test("legacy PKT module removed using the inventory flag leaves its model and base", () => {
  const component = item({
    id: "legacy-module",
    installed: true,
    traits: ["pkt"],
    flags: { implantType: "module" },
  });
  component.flags["cyberpunk-cyberware"] = {
    pktModelKey: "old",
    pktBodyId: "body",
    parentId: "base",
  };
  component.system.equipped.carryType = "worn";
  component.actor = { type: "character", items: [component] };
  const changes = { "flags.cyberpunk-remaster.installed": false };
  assert.equal(hook("preUpdateItem")(component, changes, {}), undefined);
  component.updateSource(changes);
  assert.equal(CyberwareTab.isInstalled(component), false);
  assert.equal(CyberwareTab.getFlag(component, "pktModelKey"), undefined);
  assert.equal(CyberwareTab.getFlag(component, "pktBodyId"), undefined);
  assert.equal(CyberwareTab.getFlag(component, "parentId"), undefined);
  assert.equal(CyberwareTab.getImplantType(component), "module");
});

test("the model editor does not mark an ordinary base from a custom family as unique", () => {
  const source = readFileSync(
    new URL("../runtime/implant-creator.mjs", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function pktSnapshotMeta(");
  const end = source.indexOf(
    "async function pktComponentSnapshotFromUuid(",
    start,
  );
  const meta = vm.runInNewContext(
    `${source.slice(start, end)}\npktSnapshotMeta;`,
    {
      activeRemasterId: () => "cyberpunk-remaster",
      pktItemIdFromUuid: () => "base",
      pktHardCostFromDocument: () => 0,
      pktStressFromDocument: () => "0",
      pktPriceFromDocument: () => 0,
      intValue: (value, fallback) => Number(value ?? fallback),
    },
  );
  const base = (flags) => ({
    flags: { "cyberpunk-remaster": { pktFamily: "custom-family", ...flags } },
  });
  assert.equal(meta(base({})).replaceableBase, true);
  assert.equal(
    meta(base({ pktUniqueBase: true, pktReplaceableBase: true }))
      .replaceableBase,
    false,
  );
  assert.equal(meta(base({ pktReplaceable: false })).replaceableBase, false);
  assert.equal(
    meta(base({ pktReplaceableBase: false })).replaceableBase,
    false,
  );
  assert.equal(
    meta(base({ pktUniqueBase: false, pktReplaceableBase: false }))
      .replaceableBase,
    true,
  );
});

test("extracting a PKT base keeps the item and frees its attached modules; whole-model dismantling cannot delete the extracted item", async (t) => {
  const modelFlags = {
    pktModelKey: "model",
    pktBodyId: "body",
    pktLocked: true,
  };
  const base = item({
    id: "base",
    installed: true,
    traits: ["pkt"],
    flags: {
      ...modelFlags,
      implantType: "base",
      pktReplaceableBase: true,
      slots: 4,
    },
  });
  const module = item({
    id: "module",
    installed: true,
    traits: ["pkt"],
    flags: { ...modelFlags, implantType: "module", slotsUsed: 2 },
  });
  module.flags["cyberpunk-cyberware"] = { parentId: base.id };
  const actor = {
    type: "character",
    items: [base, module],
    async updateEmbeddedDocuments(_type, updates) {
      for (const { _id, ...changes } of updates)
        this.items.find((i) => i.id === _id).updateSource(changes);
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.items = this.items.filter((i) => !ids.includes(i.id));
    },
  };
  base.actor = module.actor = actor;
  t.mock.method(CyberwareTab, "reconcileHumanity", async () => {});
  t.mock.method(CyberwareTab, "reconcileGrantedItems", async () => {});

  assert.equal(await CyberwareTab.setInstalled(actor, base, false), true);
  assert.equal(CyberwareTab.isInstalled(base), false);
  assert.equal(CyberwareTab.getFlag(base, "pktModelKey"), undefined);
  assert.equal(CyberwareTab.getFlag(base, "slots"), 4);
  assert.equal(CyberwareTab.isInstalled(module), true);
  assert.equal(CyberwareTab.getFlag(module, "parentId"), undefined);
  assert.equal(await CyberwareTab.removePktModel(actor, "model"), 1);
  assert.deepEqual(actor.items, [base]);
});

test("body removal accounts for the components leaving with it and never ejects an installed unique base", async (t) => {
  const make = (id, flags, traits = []) =>
    item({ id, installed: true, flags, traits });
  const body = make("body", { pktBody: true });
  const biosystem = make("biosystem", {
    pktBiosystem: true,
    implantType: "internal",
  });
  const external = make("external", { implantType: "external", slotsUsed: 6 });
  const modelExternal = make("model-external", {
    pktModelKey: "model",
    pktBodyId: body.id,
    implantType: "external",
    slotsUsed: 3,
  }); // Extras may not have the pkt trait.
  const base = make("ordinary-base", {
    pktModelKey: "model",
    pktBodyId: body.id,
    implantType: "base",
    pktReplaceableBase: true,
  });
  const standaloneModule = make("standalone-module", {
    implantType: "module",
    parentId: base.id,
  });
  const uniqueBase = make(
    "unique-base",
    {
      pktModelKey: "model",
      pktBodyId: body.id,
      implantType: "base",
      pktUniqueBase: true,
    },
    ["pkt"],
  );
  const actor = {
    type: "character",
    items: [
      body,
      biosystem,
      external,
      modelExternal,
      base,
      standaloneModule,
      uniqueBase,
    ],
  };
  assert.match(CyberwareTab.removalValidation(actor, body), /уникальная база/i);
  assert.match(
    CyberwareTab.removalValidation(actor, biosystem),
    /извлеките корпус/,
  );
  assert.ok(
    !CyberwareTab.pktEjectionUpdates(actor, body.id).some(
      (u) => u._id === uniqueBase.id,
    ),
  );
  uniqueBase.flags["cyberpunk-remaster"].pktBodyId = "previous-body";
  assert.match(CyberwareTab.removalValidation(actor, body), /уникальная база/i);
  actor.items.pop();
  modelExternal.flags["cyberpunk-remaster"].pktBodyId = "previous-body";
  assert.equal(CyberwareTab.removalValidation(actor, body), null);
  external.flags["cyberpunk-remaster"].slotsUsed = 8;
  assert.match(CyberwareTab.removalValidation(actor, body), /занято 8 слотов/);
  external.flags["cyberpunk-remaster"].slotsUsed = 6;
  t.mock.method(CyberwareTab, "reconcileHumanity", async () => {});
  t.mock.method(CyberwareTab, "reconcileGrantedItems", async () => {});
  actor.updateEmbeddedDocuments = async (_type, updates) => {
    for (const { _id, ...changes } of updates)
      actor.items.find((i) => i.id === _id).updateSource(changes);
  };
  assert.equal(await CyberwareTab.setInstalled(actor, body, false), true);
  assert.equal(CyberwareTab.isInstalled(modelExternal), false);
  assert.equal(CyberwareTab.getFlag(modelExternal, "pktModelKey"), undefined);
  assert.equal(CyberwareTab.isInstalled(external), true);
  assert.equal(CyberwareTab.isInstalled(base), false);
  assert.equal(CyberwareTab.isInstalled(standaloneModule), true);
  assert.equal(CyberwareTab.getFlag(standaloneModule, "parentId"), undefined);
  assert.equal(CyberwareTab.removalValidation(actor, biosystem), null);
});

test("migration normalizes legacy conflicting installation state", async (t) => {
  t.mock.method(console, "warn", () => {});
  const body = item({
    id: "body",
    installed: true,
    traits: [],
    flags: { pktBody: true },
  });
  const component = item({
    id: "component",
    installed: true,
    traits: ["pkt"],
    flags: {
      pktOnly: true,
      implantType: "base",
      pktUniqueBase: true,
      pktModelKey: "model",
    },
  });
  const firstAccelerator = item({
    id: "accelerator-one",
    installed: true,
  });
  const secondAccelerator = item({
    id: "accelerator-two",
    installed: true,
  });
  const firstDeck = item({
    id: "deck-one",
    installed: true,
    traits: [],
    flags: { exclusiveFamily: "cyberdeck" },
  });
  const secondDeck = item({
    id: "deck-two",
    installed: true,
    traits: [],
    flags: { exclusiveFamily: "cyberdeck" },
  });
  const stale = item({
    id: "stale",
    installed: false,
    traits: [],
    flags: {
      schema: 1,
      implantType: "module",
      hardCost: 99,
      slotsUsed: 9,
    },
  });
  stale.system.description.value =
    "<p>Тип импланта: Внутренний</p><p>Слоты: 1</p><p>Hard Cost: 2</p>";
  stale.system.equipped.carryType = "implanted";
  const stowed = item({
    id: "stowed",
    installed: false,
    traits: [],
  });
  stowed.system.equipped.carryType = "stowed";
  stowed.system.containerId = "backpack";
  const interfaceScan = item({
    id: "embedded-interface-scan",
    installed: false,
    traits: [],
  });
  interfaceScan.type = "action";
  interfaceScan.system.slug = "сканирование-интерфейсов";
  interfaceScan.system.usage = null;
  interfaceScan.flags["cyberpunk-remaster"] = {};
  const actorFlags = {};
  const actor = {
    name: "Migration Test",
    type: "character",
    items: [
      body,
      component,
      firstAccelerator,
      secondAccelerator,
      firstDeck,
      secondDeck,
      stale,
      stowed,
      interfaceScan,
    ],
    system: { abilities: { wis: { mod: 0 } } },
    getFlag(namespace, key) {
      return actorFlags?.[namespace]?.[key];
    },
    async setFlag(namespace, key, value) {
      actorFlags[namespace] ??= {};
      actorFlags[namespace][key] = value;
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates) {
        const target = this.items.find(
          (candidate) => candidate.id === update._id,
        );
        for (const [path, value] of Object.entries(update)) {
          if (path !== "_id") setPath(target, path, value);
        }
      }
    },
    async deleteEmbeddedDocuments(_type, ids) {
      for (const id of ids) {
        const index = this.items.findIndex((candidate) => candidate.id === id);
        if (index >= 0) this.items.splice(index, 1);
      }
    },
  };
  actor.items.has = (id) =>
    actor.items.some((candidate) => candidate.id === id);
  for (const embedded of actor.items) embedded.actor = actor;

  const result = await runtime.migrateActor(actor);

  assert.deepEqual(result, {
    bodies: 1,
    neuralAccelerators: 1,
    exclusiveImplants: 1,
    pktComponents: 1,
    netrunnerActionsRemoved: 1,
    descriptionMetadata: 1,
    grenadeLaunchers: 0,
  });
  assert.equal(body.getFlag("cyberpunk-remaster", "installed"), false);
  assert.equal(component.getFlag("cyberpunk-remaster", "installed"), false);
  assert.equal(component.getFlag("cyberpunk-remaster", "pktModelKey"), "model");
  assert.equal(
    firstAccelerator.getFlag("cyberpunk-remaster", "installed"),
    true,
  );
  assert.equal(
    secondAccelerator.getFlag("cyberpunk-remaster", "installed"),
    false,
  );
  assert.equal(firstDeck.getFlag("cyberpunk-remaster", "installed"), true);
  assert.equal(secondDeck.getFlag("cyberpunk-remaster", "installed"), false);
  assert.equal(stale.system.equipped.carryType, "worn");
  assert.equal(stale.flags["cyberpunk-remaster"].implantType, undefined);
  assert.equal(stale.flags["cyberpunk-remaster"].hardCost, undefined);
  assert.equal(stale.flags["cyberpunk-remaster"].slotsUsed, undefined);
  assert.equal(stale.flags["cyberpunk-remaster"].cyberware, undefined);
  assert.equal(CyberwareTab.getHardCost(stale), 2);
  assert.equal(CyberwareTab.getImplantType(stale), "internal");
  assert.equal(stowed.system.equipped.carryType, "stowed");
  assert.equal(stowed.system.containerId, "backpack");
  assert.equal(actor.items.includes(interfaceScan), false);
});

test("completed migration versions are not rerun", async () => {
  const actor = {
    name: "Already migrated",
    items: [],
    updateEmbeddedDocuments() {
      throw new Error("normalization must not run");
    },
    deleteEmbeddedDocuments() {
      throw new Error("cleanup must not run");
    },
  };
  assert.deepEqual(await runtime.migrateActor(actor, { fromVersion: 7 }), {
    bodies: 0,
    neuralAccelerators: 0,
    exclusiveImplants: 0,
    pktComponents: 0,
    netrunnerActionsRemoved: 0,
    descriptionMetadata: 0,
    grenadeLaunchers: 0,
  });
});
