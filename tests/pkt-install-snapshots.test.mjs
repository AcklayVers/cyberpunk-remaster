import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { CyberwareTab as C } from "../sheets/CyberwareTab.js";

const MID = "cyberpunk-remaster";
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
const url = new URL("../runtime/implant-creator.mjs", import.meta.url);
const code =
  readFileSync(url, "utf8").replace(
    /from "(\.\.?\/[^"\n]+)"/g,
    (_match, relative) => `from ${JSON.stringify(new URL(relative, url).href)}`,
  ) + "\nexport {nativePktModelFromStored,installCustomPktViaNative};";
// Exercise the real installer without depending on its DOM registration wrapper.
const api = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
function fixture(t) {
  globalThis.foundry = {
    utils: {
      deepClone: (value) => structuredClone(value),
      setProperty(object, path, value) {
        const parts = path.split("."),
          leaf = parts.pop();
        const parent = parts.reduce((o, k) => (o[k] ??= {}), object);
        parent[leaf] = value;
      },
    },
  };
  globalThis.document = {
    createElement: () => ({ textContent: "", innerHTML: "" }),
  };
  const source = {
    name: "Saved arm",
    type: "equipment",
    system: {
      description: { value: "" },
      quantity: 1,
      traits: { value: [] },
      rules: [{ key: "Resistance", type: "cold", value: 2 }],
    },
    flags: {
      [MID]: {
        cyberware: true,
        implantType: "base",
        pktFamily: "arm",
        stressFormula: "1d4",
        hardCost: 0,
      },
    },
  };
  const body = {
    id: "body",
    name: "Body",
    type: "equipment",
    system: { equipped: { carryType: "implanted" } },
    flags: {
      [MID]: {
        cyberware: true,
        installed: true,
        implantType: "base",
        pktBody: true,
        pktQuality: 0,
      },
    },
  };
  const items = [body];
  const actor = {
    id: "actor",
    items,
    async createEmbeddedDocuments(_type, sources) {
      return sources.map((data, index) => {
        const item = { ...structuredClone(data), id: `new-${index}` };
        items.push(item);
        return item;
      });
    },
  };
  const live = structuredClone(source);
  live.system.rules = [{ key: "Resistance", type: "fire", value: 9 }];
  globalThis.fromUuid = async (uuid) => ({
    name: live.name,
    type: live.type,
    system: live.system,
    flags: live.flags,
    documentName: "Item",
    uuid,
    toObject: () => structuredClone(live),
  });
  globalThis.game = {
    user: { id: "gm", isGM: true },
    system: { id: "sf2e" },
    modules: new Map([[MID, { active: true }]]),
    packs: Object.assign([], { get: () => null }),
    settings: { get: () => undefined },
  };
  t.mock.method(C, "reconcileGrantedItems", async () => {});
  t.mock.method(C, "reconcileHumanity", async () => {});
  const row = {
    uuid: "Item.same-template",
    itemId: "same-template",
    name: "Saved arm",
    quantity: 1,
    family: "arm",
    hardCost: 0,
    stress: "normal",
    source,
  };
  return { actor, row, live };
}

test("catalog install preserves saved rules after its live template changes", async (t) => {
  const e = fixture(t),
    model = await api.nativePktModelFromStored(
      { id: "kit", name: "Kit", components: [e.row] },
      C,
    );
  const result = await api.installCustomPktViaNative(C, e.actor, model);
  assert.deepEqual(result.created[0].system.rules, [
    { key: "Resistance", type: "cold", value: 2 },
  ]);
});

test("same-UUID component rows keep their own snapshots and stress formulas", async (t) => {
  const e = fixture(t);
  globalThis.fromUuid = async () => null;
  const second = structuredClone(e.row);
  second.source.system.rules = e.live.system.rules;
  second.source.flags[MID].stressFormula = "2d6";
  const model = await api.nativePktModelFromStored(
    { id: "kit", name: "Kit", components: [e.row, second] },
    C,
  );
  const result = await api.installCustomPktViaNative(C, e.actor, model);
  assert.deepEqual(
    result.created.map((i) => i.system.rules[0].type),
    ["cold", "fire"],
  );
  assert.equal(result.humanityLoss.formula, "2d6 + 1d4");
});

test("legacy reference-only components still resolve the live Item", async (t) => {
  const e = fixture(t);
  delete e.row.source;
  const model = await api.nativePktModelFromStored(
    { id: "legacy", name: "Legacy", components: [e.row] },
    C,
  );
  const result = await api.installCustomPktViaNative(C, e.actor, model);
  assert.equal(result.created[0].system.rules[0].type, "fire");
});
