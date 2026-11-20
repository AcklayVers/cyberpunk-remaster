import test from "node:test";
import assert from "node:assert/strict";
import { CyberwareTab as C } from "../sheets/CyberwareTab.js";
import {
  createInstalledPktSession,
  applyInstalledPktEdit,
  buildPktExport,
} from "../runtime/pkt-instance-editor.mjs";

const MID = "cyberpunk-remaster";
function fixture(t) {
  class ForcedDeletion {}
  globalThis.foundry = { data: { operators: { ForcedDeletion } } };
  const make = (id, type, flags = {}) => ({
    id,
    name: id,
    type: "equipment",
    flags: {
      [MID]: { cyberware: true, installed: true, implantType: type, ...flags },
    },
    system: {
      quantity: 1,
      description: { value: "" },
      equipped: { carryType: "implanted" },
      traits: { value: [] },
      rules: [{ key: "Resistance", type: "cold", value: 2 }],
    },
    toObject() {
      return structuredClone({
        _id: this.id,
        name: this.name,
        type: this.type,
        flags: this.flags,
        system: this.system,
      });
    },
  });
  const body = make("body", "base", { pktBody: true }),
    biosystem = make("biosystem", "internal", { pktBiosystem: true });
  const base = make("base", "base", {
    pktModelKey: "cic-test",
    pktBodyId: body.id,
    pktFamily: "cyber-arm",
    slots: 4,
  });
  const extra = make("extra", "module", {
    pktModelKey: "cic-test",
    pktBodyId: body.id,
    pktFamily: "arm-module",
    pktParentFamily: "cyber-arm",
    parentId: base.id,
    slotsUsed: 1,
  });
  const outside = make("outside", "external", { slotsUsed: 2 });
  const items = [body, biosystem, base, extra, outside];
  items.get = (id) => items.find((i) => i.id === id);
  const set = (item, path, value) => {
    const parts = path.split("."),
      leaf = parts.pop();
    const parent = parts.reduce((o, k) => (o[k] ??= {}), item);
    if (value instanceof ForcedDeletion) delete parent[leaf];
    else parent[leaf] = value;
  };
  let created = 0;
  const actor = {
    id: "actor",
    name: "Ви",
    type: "character",
    isOwner: true,
    items,
    async updateEmbeddedDocuments(_type, updates, _options) {
      for (const { _id, ...changes } of updates)
        for (const [path, value] of Object.entries(changes))
          set(items.get(_id), path, value);
      return updates;
    },
    async createEmbeddedDocuments(_type, sources) {
      return sources.map((source) => {
        const item = make("new" + ++created, "equipment");
        Object.assign(item, structuredClone(source));
        item.id = source._id ?? "new" + created;
        items.push(item);
        return item;
      });
    },
    async deleteEmbeddedDocuments(_type, ids) {
      for (const id of ids) {
        const i = items.findIndex((x) => x.id === id);
        if (i >= 0) items.splice(i, 1);
      }
    },
  };
  globalThis.game = {
    user: { isGM: true, id: "gm" },
    actors: new Map([[actor.id, actor]]),
    modules: new Map([[MID, { version: "2.18.0" }]]),
  };
  t.mock.method(C, "reconcileHumanity", async () => {});
  t.mock.method(C, "reconcileGrantedItems", async () => {});
  return { actor, base, extra, outside, body, items };
}

test("installed editor reads the actor copy and retains item IDs and unrelated documents", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  assert.equal(
    session.model.baseComponents[0].source.system.rules[0].type,
    "cold",
  );
  const edited = structuredClone(session.model);
  edited.baseComponents[0].name = "Рука Ви";
  const result = await applyInstalledPktEdit(session, edited);
  assert.equal(e.base.name, "Рука Ви");
  assert.equal(e.items.length, 5);
  assert.equal(e.extra.flags[MID].parentId, e.base.id);
  assert.equal(e.outside.flags[MID].slotsUsed, 2);
  assert.equal(result.updated, 2);
});

test("removed installed components stay in inventory and lose model membership", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  edited.additionalComponents = [];
  await applyInstalledPktEdit(session, edited);
  assert.equal(C.isInstalled(e.extra), false);
  assert.equal(C.getFlag(e.extra, "pktModelKey"), undefined);
  assert.equal(C.getFlag(e.extra, "parentId"), undefined);
  assert.ok(e.items.includes(e.extra));
});

test("new snapshot component is installed and parent links reference real actor IDs", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  const row = structuredClone(edited.additionalComponents[0]);
  delete row.actorItemId;
  row.uuid = "Item.new-source";
  row.name = "Новый модуль";
  edited.additionalComponents.push(row);
  await applyInstalledPktEdit(session, edited);
  const added = e.items.find((i) => i.name === "Новый модуль");
  assert.equal(C.isInstalled(added), true);
  assert.equal(C.getFlag(added, "parentId"), e.base.id);
  assert.equal(C.getFlag(added, "pktModelKey"), "cic-test");
});

test("a stale actor edit or a non-GM cannot apply model changes", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  e.base.system.quantity = 2;
  await assert.rejects(
    applyInstalledPktEdit(session, session.model),
    /изменил/i,
  );
  const fresh = createInstalledPktSession(e.actor, "cic-test");
  game.user.isGM = false;
  await assert.rejects(applyInstalledPktEdit(fresh, fresh.model), /ведущ/i);
});

test("unique installed bases cannot be removed or unmarked and excessive load is rejected", async (t) => {
  const e = fixture(t);
  e.base.flags[MID].pktUniqueBase = true;
  const session = createInstalledPktSession(e.actor, "cic-test"),
    edited = structuredClone(session.model);
  edited.baseComponents = [];
  edited.components = [];
  await assert.rejects(applyInstalledPktEdit(session, edited), /уникальн/i);
  const overload = structuredClone(session.model);
  const row = structuredClone(overload.additionalComponents[0]);
  delete row.actorItemId;
  row.source.flags[MID].implantType = "external";
  row.source.flags[MID].slotsUsed = 20;
  delete row.source.flags[MID].pktParentFamily;
  delete row.source.flags[MID].parentId;
  row.parentFamily = null;
  overload.additionalComponents.push(row);
  await assert.rejects(applyInstalledPktEdit(session, overload), /лимит/i);
  assert.equal(e.items.length, 5);
});

test("failed addition restores retained and removed documents without changing their IDs", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  edited.baseComponents[0].name = "Не сохранять";
  const addition = structuredClone(edited.additionalComponents[0]);
  delete addition.actorItemId;
  edited.additionalComponents = [addition];
  e.actor.createEmbeddedDocuments = async () => {
    throw Error("write failed");
  };
  await assert.rejects(applyInstalledPktEdit(session, edited), /write failed/);
  assert.equal(e.base.name, "base");
  assert.equal(C.isInstalled(e.extra), true);
  assert.equal(C.getFlag(e.extra, "pktModelKey"), "cic-test");
});

test("JSON export preserves mechanics and removes actor identity and model bindings", (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const exported = buildPktExport(session.model);
  assert.equal(exported.format, "cyberpunk-remaster.pkt-model");
  assert.equal(exported.version, 1);
  const row = exported.model.additionalComponents[0];
  assert.equal(row.actorItemId, undefined);
  assert.equal(row.source._id, undefined);
  assert.equal(row.source.flags[MID].parentId, undefined);
  assert.equal(row.source.flags[MID].pktBodyId, undefined);
  assert.equal(row.source.system.rules[0].type, "cold");
  assert.equal(e.extra.flags[MID].parentId, e.base.id);
  assert.ok(!JSON.stringify(exported).includes("Actor.actor"));
  assert.ok(!exported.model.id.includes("installed-actor"));
  assert.ok(JSON.stringify(exported).length > 100);
});

test("module links to an installed base outside this kit survive saving", async (t) => {
  const e = fixture(t);
  Object.assign(e.outside.flags[MID], {
    implantType: "base",
    pktFamily: "cyber-arm",
    slots: 4,
  });
  e.extra.flags[MID].parentId = e.outside.id;
  const session = createInstalledPktSession(e.actor, "cic-test");
  await applyInstalledPktEdit(session, session.model);
  assert.equal(C.getFlag(e.extra, "parentId"), e.outside.id);
  assert.equal(C.getFlag(e.outside, "pktModelKey"), undefined);
});

test("slot validation includes modules outside the edited kit", async (t) => {
  const e = fixture(t);
  Object.assign(e.outside.flags[MID], {
    implantType: "module",
    parentId: e.base.id,
    slotsUsed: 4,
  });
  const session = createInstalledPktSession(e.actor, "cic-test");
  await assert.rejects(
    applyInstalledPktEdit(session, session.model),
    /слотов/i,
  );
  assert.equal(C.getFlag(e.extra, "parentId"), e.base.id);
});

test("rollback restores links on external modules detached from a removed base", async (t) => {
  const e = fixture(t);
  Object.assign(e.outside.flags[MID], {
    implantType: "module",
    parentId: e.base.id,
    slotsUsed: 1,
  });
  const session = createInstalledPktSession(e.actor, "cic-test"),
    edited = structuredClone(session.model);
  delete edited.baseComponents[0].actorItemId;
  e.actor.createEmbeddedDocuments = async () => {
    throw Error("addition failed");
  };
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /addition failed/,
  );
  assert.equal(C.getFlag(e.outside, "parentId"), e.base.id);
  assert.equal(C.getFlag(e.base, "installed"), true);
});

test("grant reconciliation failure restores removed grants and removes partial grants", async (t) => {
  const e = fixture(t);
  const grant = {
    ...e.outside,
    id: "grant",
    flags: {
      [MID]: {
        grantedByImplantId: e.extra.id,
        grantedSourceUuid: "Item.original",
      },
    },
  };
  e.items.push(grant);
  const session = createInstalledPktSession(e.actor, "cic-test"),
    edited = structuredClone(session.model);
  edited.additionalComponents = [];
  t.mock.method(C, "reconcileGrantedItems", async (actor) => {
    await actor.deleteEmbeddedDocuments("Item", [grant.id]);
    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Partial",
        type: "equipment",
        flags: {
          [MID]: {
            grantedByImplantId: e.base.id,
            grantedSourceUuid: "Item.partial",
          },
        },
        system: { quantity: 1 },
      },
    ]);
    throw Error("grant failure");
  });
  await assert.rejects(applyInstalledPktEdit(session, edited), /grant failure/);
  assert.equal(C.isInstalled(e.extra), true);
  assert.ok(e.items.get("grant"));
  assert.equal(e.items.filter((i) => i.name === "Partial").length, 0);
  assert.equal(e.items.length, 6);
});

test("export choice references contain the portable IDs of their snapshots", (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const option = session.model.additionalComponents[0];
  session.model.prerequisiteChoices = [
    { options: [option], uuids: [option.uuid], itemIds: [option.itemId] },
  ];
  const exported = buildPktExport(session.model),
    group = exported.model.prerequisiteChoices[0];
  assert.deepEqual(group.uuids, [group.options[0].uuid]);
  assert.deepEqual(group.itemIds, [group.options[0].itemId]);
  assert.ok(!JSON.stringify(exported).includes("Actor.actor"));
});

test("a kit cannot add a body or change the type of an existing component", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const body = structuredClone(session.model);
  body.baseComponents[0].source.flags[MID].pktBody = true;
  await assert.rejects(applyInstalledPktEdit(session, body), /Корпус/);
  const other = structuredClone(session.model);
  other.baseComponents[0].source.flags[MID].implantType = "internal";
  await assert.rejects(applyInstalledPktEdit(session, other), /замены типа/);
  assert.equal(C.getImplantType(e.base), "base");
});

test("quantity produces individual installed Items so each instance pays Hard and uses a slot", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  edited.additionalComponents[0].quantity = 3;
  const result = await applyInstalledPktEdit(session, edited);
  const modules = e.items.filter(
    (i) => C.getImplantType(i) === "module" && C.isInstalled(i),
  );
  assert.equal(modules.length, 3);
  assert.ok(modules.includes(e.extra));
  assert.ok(modules.every((i) => i.system.quantity === 1));
  assert.equal(result.added, 2);
});

test("new modules use free capacity across same-family bases and require a matching base", async (t) => {
  const e = fixture(t);
  e.base.flags[MID].slots = 1;
  const session = createInstalledPktSession(e.actor, "cic-test"),
    edited = structuredClone(session.model);
  const base = structuredClone(edited.baseComponents[0]);
  delete base.actorItemId;
  edited.baseComponents.push(base);
  edited.additionalComponents[0].quantity = 2;
  await applyInstalledPktEdit(session, edited);
  const modules = e.items.filter((i) => C.getImplantType(i) === "module");
  assert.equal(new Set(modules.map((i) => C.getFlag(i, "parentId"))).size, 2);
  const next = createInstalledPktSession(e.actor, "cic-test");
  next.model.additionalComponents[0].parentFamily = "missing";
  await assert.rejects(
    applyInstalledPktEdit(next, next.model),
    /не установлена база/,
  );
});

test("silently skipped Foundry updates cause rollback rather than a success result", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  edited.baseComponents[0].name = "Must not save";
  edited.additionalComponents = [];
  const update = e.actor.updateEmbeddedDocuments.bind(e.actor);
  let calls = 0;
  e.actor.updateEmbeddedDocuments = async (type, updates, options) =>
    update(
      type,
      ++calls === 1 ? updates.filter((u) => u._id !== e.base.id) : updates,
      options,
    );
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /Foundry не применил/,
  );
  assert.equal(e.base.name, "base");
  assert.equal(C.isInstalled(e.extra), true);
});

test("silently skipped parent links roll back new bases and restore old links", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model);
  delete edited.baseComponents[0].actorItemId;
  const update = e.actor.updateEmbeddedDocuments.bind(e.actor);
  let calls = 0;
  e.actor.updateEmbeddedDocuments = async (type, updates, options) =>
    ++calls === 2 ? [] : update(type, updates, options);
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /Foundry не применил/,
  );
  assert.equal(e.items.length, 5);
  assert.equal(C.getFlag(e.extra, "parentId"), e.base.id);
  assert.equal(C.isInstalled(e.base), true);
});

test("SF2e credits and normalized zero-price items survive a checked update", async (t) => {
  const e = fixture(t);
  game.system = { id: "sf2e" };
  e.base.system.price = { value: { credits: 0 } };
  const session = createInstalledPktSession(e.actor, "cic-test");
  const update = e.actor.updateEmbeddedDocuments.bind(e.actor);
  e.actor.updateEmbeddedDocuments = async (...args) => {
    const result = await update(...args);
    for (const item of e.items)
      if (item.system.price?.value?.credits === 0)
        delete item.system.price.value.credits;
    return result;
  };
  await applyInstalledPktEdit(session, session.model);
  assert.equal(e.base.system.price.value.credits, undefined);
  assert.equal(C.isInstalled(e.base), true);
});

test("a non-module component cannot declare a parent base", async (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  const edited = structuredClone(session.model),
    row = structuredClone(edited.additionalComponents[0]);
  delete row.actorItemId;
  row.source.flags[MID].implantType = "internal";
  edited.additionalComponents.push(row);
  await assert.rejects(
    applyInstalledPktEdit(session, edited),
    /не является модулем/,
  );
});

test("portable PKT snapshots remove native PF2e grant links as well as SF2e aliases", (t) => {
  const e = fixture(t),
    session = createInstalledPktSession(e.actor, "cic-test");
  session.model.additionalComponents[0].source.flags.pf2e = {
    grantedBy: { id: "old-effect" },
    itemGrants: { child: { id: "old-child" } },
  };
  const row = buildPktExport(session.model).model.additionalComponents[0];
  assert.equal(row.source.flags.pf2e.grantedBy, undefined);
  assert.equal(row.source.flags.pf2e.itemGrants, undefined);
});
