import test from "node:test";
import assert from "node:assert/strict";
import { CyberwareTab as C } from "../sheets/CyberwareTab.js";
import {
  createInstalledPktSession,
  applyInstalledPktEdit,
} from "../runtime/pkt-instance-editor.mjs";

const MID = "cyberpunk-remaster",
  CREATOR = "cyberpunk-implant-creator";
async function fixture(t) {
  const hooks = new Map(),
    init = [];
  globalThis.Hooks = {
    once(name, fn) {
      if (name === "init") init.push(fn);
    },
    on(name, fn) {
      const list = hooks.get(name) ?? [];
      list.push(fn);
      hooks.set(name, list);
    },
    callAll() {},
  };
  globalThis.document = {
    querySelectorAll: () => [],
    createElement: () => ({
      textContent: "",
      get innerHTML() {
        return this.textContent;
      },
    }),
  };
  globalThis.requestAnimationFrame = (fn) => fn();
  class ForcedDeletion {}
  const set = (object, path, value) => {
    const parts = path.split("."),
      leaf = parts.pop(),
      parent = parts.reduce((o, k) => (o[k] ??= {}), object);
    if (value instanceof ForcedDeletion) delete parent[leaf];
    else parent[leaf] = structuredClone(value);
  };
  globalThis.foundry = {
    data: { operators: { ForcedDeletion } },
    utils: { deepClone: (value) => structuredClone(value), setProperty: set },
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  const items = [];
  items.get = (id) => items.find((i) => i.id === id);
  let next = 0,
    fail = false;
  const emit = (name, ...args) => {
    for (const fn of hooks.get(name) ?? []) fn(...args);
  };
  const actor = {
    id: "actor",
    name: "Actor",
    type: "character",
    isOwner: true,
    items,
    flags: {},
    async updateEmbeddedDocuments(_type, updates, options) {
      for (const { _id, ...changes } of updates) {
        const item = items.get(_id);
        for (const [p, v] of Object.entries(changes)) set(item, p, v);
        emit("updateItem", item, changes, options, "gm");
      }
      return updates;
    },
    async createEmbeddedDocuments(_type, sources, options) {
      if (fail && sources.some((s) => s.type === "equipment"))
        throw Error("forced replacement failure");
      return sources.map((s) => make(s._id ?? `created${++next}`, s, options));
    },
    async deleteEmbeddedDocuments(_type, ids, options) {
      for (const id of ids) {
        const index = items.findIndex((i) => i.id === id);
        if (index >= 0) {
          const [item] = items.splice(index, 1);
          emit("deleteItem", item, options, "gm");
        }
      }
    },
  };
  function make(id, source, options) {
    const item = {
      ...structuredClone(source),
      id,
      parent: actor,
      actor,
      uuid: `Actor.actor.Item.${id}`,
      documentName: "Item",
      toObject() {
        return structuredClone({
          _id: this.id,
          name: this.name,
          img: this.img,
          type: this.type,
          system: this.system,
          flags: this.flags,
        });
      },
      async delete() {
        return actor.deleteEmbeddedDocuments("Item", [this.id]);
      },
      async update(changes) {
        return actor.updateEmbeddedDocuments("Item", [
          { _id: this.id, ...changes },
        ]);
      },
    };
    items.push(item);
    if (options) emit("createItem", item, options, "gm");
    return item;
  }
  const equip = (id, type, flags) =>
    make(id, {
      name: id,
      type: "equipment",
      system: {
        quantity: 1,
        description: { value: "" },
        equipped: { carryType: "implanted" },
        traits: { value: [] },
        rules: [],
      },
      flags: {
        [MID]: {
          cyberware: true,
          installed: true,
          implantType: type,
          ...flags,
        },
      },
    });
  const body = equip("body", "base", { pktBody: true, pktQuality: 0 });
  equip("biosystem", "internal", { pktBiosystem: true });
  const base = equip("base", "base", {
    pktModelKey: "cic-test",
    pktBodyId: body.id,
    pktFamily: "arm",
    slots: 4,
  });
  const extra = equip("extra", "module", {
    pktModelKey: "cic-test",
    pktBodyId: body.id,
    pktParentFamily: "arm",
    parentId: base.id,
    slotsUsed: 1,
  });
  extra.flags[CREATOR] = {
    activation: {
      enabled: true,
      name: "Boost",
      frequency: "day",
      frequencyMax: 1,
      traits: [],
      effectRules: [],
      duration: { unit: "unlimited", value: -1 },
    },
  };
  globalThis.game = {
    user: { isGM: true, id: "gm" },
    system: { id: "sf2e" },
    actors: new Map([[actor.id, actor]]),
    modules: new Map([[MID, { active: true, api: { CyberwareTab: C } }]]),
    settings: {
      register() {},
      get() {
        return undefined;
      },
    },
    time: { worldTime: 0 },
  };
  t.mock.method(C, "reconcileGrantedItems", async () => {});
  t.mock.method(C, "reconcileHumanity", async () => {});
  const api = await import(
    `../runtime/implant-creator.mjs?lifecycle=${Date.now()}-${Math.random()}`
  );
  for (const fn of init) fn();
  await api.syncActivationActionForImplant(extra);
  const action = items.find((i) => i.type === "action");
  action.system.frequency.value = 0;
  const effect = make("effect", {
    name: "Boost",
    type: "effect",
    system: {
      duration: { unit: "unlimited", value: -1 },
      rules: [{ key: "FlatModifier", selector: "reflex", value: 2 }],
    },
    flags: {
      [CREATOR]: {
        activationEffect: true,
        activationSourceItemId: extra.id,
        activationSourceUuid: extra.uuid,
      },
    },
  });
  return {
    actor,
    extra,
    action,
    effect,
    api,
    items,
    failReplacement: () => {
      fail = true;
    },
  };
}

test("a failed installed PKT replacement preserves the Action ID, spent charges, and active Effect", async (t) => {
  const e = await fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model),
    replacement = structuredClone(edited.additionalComponents[0]);
  delete replacement.actorItemId;
  delete replacement.source.flags[CREATOR];
  edited.additionalComponents = [replacement];
  e.failReplacement();
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /forced replacement failure/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  await e.api.syncActivationActionForImplant(e.extra);
  const action = e.items.find((i) => i.type === "action");
  assert.equal(action.id, e.action.id);
  assert.equal(action.system.frequency.value, 0);
  assert.equal(e.items.get(e.effect.id), e.effect);
  assert.equal(C.isInstalled(e.extra), true);
});

test("successful PKT removal cleans its activation Action and Effect while retaining the component", async (t) => {
  const e = await fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  edited.additionalComponents = [];
  await applyInstalledPktEdit(session, edited);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(C.isInstalled(e.extra), false);
  assert.equal(e.items.get(e.extra.id), e.extra);
  assert.equal(e.items.get(e.action.id), undefined);
  assert.equal(e.items.get(e.effect.id), undefined);
});

test("ordinary implant removal also stops an unlimited activation Effect", async (t) => {
  const e = await fixture(t);
  await e.actor.updateEmbeddedDocuments("Item", [
    C.installationUpdate(e.extra, false),
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  await e.api.syncActivationActionForImplant(e.extra);
  assert.equal(e.items.get(e.effect.id), undefined);
  assert.equal(e.items.get(e.action.id), undefined);
});

test("a reconciliation failure restores deleted activation artifacts with their spent charges", async (t) => {
  const e = await fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const beforeAction = e.action.toObject(),
    beforeEffect = e.effect.toObject();
  const api = game.modules.get(MID).api.implantCreator,
    reconcile = api.reconcilePktActivations;
  api.reconcilePktActivations = async (...args) => {
    await reconcile(...args);
    throw Error("activation reconciliation failure");
  };
  const edited = structuredClone(session.model);
  edited.additionalComponents = [];
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /activation reconciliation failure/,
  );
  assert.deepEqual(e.items.get(e.action.id).toObject(), beforeAction);
  assert.deepEqual(e.items.get(e.effect.id).toObject(), beforeEffect);
  assert.equal(C.isInstalled(e.extra), true);
});

test("an Effect deletion veto rolls back removal instead of leaving an active unequipped implant", async (t) => {
  const e = await fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  e.effect.delete = async () => [];
  const edited = structuredClone(session.model);
  edited.additionalComponents = [];
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /Foundry не удалил связанный предмет/,
  );
  assert.equal(C.isInstalled(e.extra), true);
  assert.equal(e.items.get(e.effect.id), e.effect);
  assert.equal(e.items.get(e.action.id).system.frequency.value, 0);
});
