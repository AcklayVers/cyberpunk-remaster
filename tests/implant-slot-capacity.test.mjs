import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CyberwareTab as C } from "../sheets/CyberwareTab.js";
import {
  cyberwareSlotUsage,
  parseCyberwareDescription,
} from "../runtime/cyberware-schema.mjs";

const implant = (
  id,
  slots = 2,
  {
    installed = true,
    type = "external",
    quantity = 1,
    scope = "cyberpunk-remaster",
    description = true,
  } = {},
) => ({
  id,
  name: "Адаптивное покрытие III",
  type: "equipment",
  flags: {
    [scope]: {
      cyberware: true,
      implantType: type,
      installed,
      slotsUsed: slots,
    },
  },
  system: {
    quantity,
    description: {
      value: description
        ? `<p>Тип импланта: ${type === "external" ? "Внешний" : "Внутренний"}</p><p>Слоты: ${slots}</p>`
        : "",
    },
    equipped: { carryType: installed ? "implanted" : "worn" },
    traits: { value: [] },
  },
});
const body = () => ({
  ...implant("body", 0, { type: "base", description: false }),
  flags: {
    "cyberpunk-remaster": {
      cyberware: true,
      installed: true,
      implantType: "base",
      pktBody: true,
    },
  },
});

// Execute the actual integrated creator guards without registering Foundry UI hooks.
function creatorCapacityApi(native = C) {
  const code = readFileSync(
    new URL("../runtime/implant-creator.mjs", import.meta.url),
    "utf8",
  );
  const errors = [];
  const context = {
    getNativePktCyberwareTab: () => native,
    REMASTER_IDS: ["cyberpunk-remaster", "sf2e-cyberware-pkt"],
    GLOBAL_IMPLANT_LIMITS: {
      standard: { internal: 7, external: 7, fashion: 7 },
      pkt: { internal: 14, external: 14, fashion: 7 },
    },
    cicCapacityPendingBatches: new WeakMap(),
    cyberwareSlotUsage,
    parseCyberwareDescription,
    ui: { notifications: { error: (message) => errors.push(message) } },
  };
  vm.runInNewContext(
    `${code.slice(code.indexOf("function directRemasterFlag("), code.indexOf("function enhanceGlobalImplantCapacityLabels("))}\nglobalThis.api = { installedImplantCount, validateProjectedImplantCapacity, checkPreCreateImplantCapacity, checkPreUpdateImplantCapacity };`,
    context,
  );
  return { ...context.api, errors };
}

function nativeUpdateGuard() {
  const code = readFileSync(
    new URL("../runtime/cyberware-runtime.mjs", import.meta.url),
    "utf8",
  );
  const context = {
    CyberwareTab: C,
    MODULE_ID: "cyberpunk-remaster",
    PLANNED_INSTALLATION_STATES: Symbol("planned"),
    Hooks: {
      on(_name, fn) {
        context.guard = fn;
      },
    },
    ui: { notifications: { warn() {} } },
    foundry: {
      utils: {
        getProperty: (object, key) =>
          key.split(".").reduce((value, part) => value?.[part], object),
        hasProperty: (object, key) =>
          key.split(".").reduce((value, part) => value?.[part], object) !==
          undefined,
      },
    },
  };
  const helpers = code.slice(
    code.indexOf("function hasChange("),
    code.indexOf("function onRenderSheet("),
  );
  const callback = code.slice(
    code.indexOf('Hooks.on("preUpdateItem",'),
    code.indexOf('Hooks.on("createItem",'),
  );
  vm.runInNewContext(`${helpers}\n${callback}`, context);
  return context.guard;
}

test("a two-slot coating shows2/7 without PKT and2/14 with PKT", () => {
  const actor = { items: [implant("coating")] };
  assert.deepEqual(C.implantCapacity(actor, "external"), {
    used: 2,
    limit: 7,
    over: false,
  });
  actor.items.push(body());
  assert.deepEqual(C.implantCapacity(actor, "external"), {
    used: 2,
    limit: 14,
    over: false,
  });
});

test("slot usage multiplies declared cost by installed quantity and excludes inventory/base/module items", () => {
  const actor = {
    items: [
      implant("stack", 2, { quantity: 3 }),
      implant("inventory", 4, { installed: false }),
      body(),
      implant("base", 7, { type: "base", description: false }),
      implant("module", 5, { type: "module", description: false }),
    ],
  };
  assert.equal(C.implantCapacity(actor, "external").used, 6);
  assert.equal(
    C.implantCapacity(actor, "external", { excludeItemId: "stack" }).used,
    0,
  );
});

test("installation rejects a2-slot implant when only1slot remains, for7and14limits", () => {
  for (const pkt of [false, true]) {
    const actor = {
      items: [implant("used", pkt ? 13 : 6), ...(pkt ? [body()] : [])],
    };
    const candidate = implant("candidate", 2, { installed: false });
    assert.match(
      C.installationValidation(actor, candidate),
      /требуется ещё 2/u,
    );
    assert.equal(
      C.installationValidation(
        { items: [implant("used", pkt ? 12 : 5), ...(pkt ? [body()] : [])] },
        candidate,
      ),
      null,
    );
  }
});

test("description cost has existing canonical precedence over stale flags; metadata-only and missing costs remain supported", () => {
  const described = implant("described", 2);
  described.flags["cyberpunk-remaster"].slotsUsed = 1;
  const legacy = implant("legacy", 3, {
    scope: "cyberpunk-cyberware",
    description: false,
  });
  const noCost = implant("old", 0, { description: false });
  delete noCost.flags["cyberpunk-remaster"].slotsUsed;
  assert.equal(
    C.implantCapacity({ items: [described, legacy, noCost] }, "external").used,
    6,
  );
});

test("internal slots use the same weighted count and removing PKT respects that load", () => {
  const pkt = body();
  const actor = {
    items: [
      pkt,
      ...Array.from({ length: 4 }, (_, i) =>
        implant(`internal${i}`, 2, { type: "internal" }),
      ),
    ],
  };
  assert.equal(C.implantCapacity(actor, "internal").used, 8);
  assert.match(
    C.removalValidation(actor, pkt),
    /Нельзя снять последний корпус ПКТ/u,
  );
});

test("pending validation snapshots retain quantity and Library metadata for weighted batch installation", () => {
  const item = implant("library", 2, {
    quantity: 3,
    scope: "cyberpunk-equipment-library",
    description: false,
  });
  const snapshot = C.validationSnapshot(item, true);
  assert.equal(C.implantCapacity({ items: [snapshot] }, "external").used, 6);
});

test("creator native and fallback projection guards reject oversized ready-model components", () => {
  for (const native of [C, null]) {
    const api = creatorCapacityApi(native);
    const actor = { items: [implant("used", 6)] };
    assert.equal(api.installedImplantCount(actor, "external"), 6);
    assert.match(
      api.validateProjectedImplantCapacity(actor, [implant("new", 2)]),
      /требуется ещё 2/u,
    );
    assert.equal(
      api.validateProjectedImplantCapacity(actor, [
        implant("inventory", 2, { installed: false }),
      ]),
      "",
    );
  }
});

test("creator preCreate sums slot costs across a multi-item batch and quantities", () => {
  const api = creatorCapacityApi();
  const actor = { items: [implant("used", 3)] };
  const first = { ...implant("first", 2, { quantity: 2 }), parent: actor };
  const next = { ...implant("next", 2), parent: actor };
  const options = {};
  assert.equal(api.checkPreCreateImplantCapacity(first, first, options), true);
  assert.equal(api.checkPreCreateImplantCapacity(next, next, options), false);
  assert.match(api.errors.at(-1), /Сейчас занято 7; требуется ещё 2/u);
});

test("creator preUpdate rejects installing a two-slot inventory item over the limit", () => {
  const api = creatorCapacityApi();
  const actor = { items: [implant("used", 6)] };
  const item = { ...implant("new", 2, { installed: false }), parent: actor };
  const changes = { flags: { "cyberpunk-remaster": { installed: true } } };
  assert.equal(api.checkPreUpdateImplantCapacity(item, changes), false);
  actor.items = [implant("used", 5)];
  assert.equal(api.checkPreUpdateImplantCapacity(item, changes), true);
});

test("native update batch uses final quantity while installing inventory items", () => {
  const guard = nativeUpdateGuard();
  const actor = { type: "character", items: [] };
  const first = { ...implant("first", 2, { installed: false }), actor };
  const second = { ...implant("second", 2, { installed: false }), actor };
  actor.items = [first, second];
  const options = {};
  assert.notEqual(
    guard(
      first,
      { "flags.cyberpunk-remaster.installed": true, "system.quantity": 3 },
      options,
    ),
    false,
  );
  assert.equal(
    guard(second, { "flags.cyberpunk-remaster.installed": true }, options),
    false,
  );
});

test("native update validates the new quantity of a single item being installed", () => {
  const guard = nativeUpdateGuard();
  const actor = { type: "character", items: [] };
  const item = { ...implant("coating", 2, { installed: false }), actor };
  actor.items = [item];
  assert.equal(
    guard(
      item,
      {
        flags: { "cyberpunk-remaster": { installed: true } },
        system: { quantity: 4 },
      },
      {},
    ),
    false,
  );
  assert.notEqual(
    guard(
      item,
      { "flags.cyberpunk-remaster.installed": true, "system.quantity": 3 },
      {},
    ),
    false,
  );
});
