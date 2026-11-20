import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as loadout from "../forge/loadout.mjs";

function fakeDocument(source, { id, uuid } = {}) {
  const data = structuredClone(source);
  return {
    ...data,
    id: id ?? data._id ?? "snapshot-item",
    _id: id ?? data._id ?? "snapshot-item",
    uuid: uuid ?? `WorldItem.${id ?? data._id ?? "snapshot-item"}`,
    folder: null,
    toObject() {
      return structuredClone(data);
    },
  };
}

function bodyEntry(id, quality, name = `Полная Конверсия Тела [${quality}]`) {
  const document = fakeDocument(
    {
      _id: id,
      name,
      type: "equipment",
      flags: {
        "cyberpunk-remaster": {
          cyberware: true,
          pktBody: true,
          pktQuality: quality,
          implantType: "internal",
        },
      },
      system: {
        level: { value: 8 + quality * 2 },
        traits: { value: [], rarity: "common" },
        description: { value: "" },
      },
    },
    { id, uuid: `Compendium.cyberpunk-remaster.cyberpunk-items.Item.${id}` },
  );
  return {
    id,
    uuid: document.uuid,
    name,
    document,
    category: "cyberware",
    cyberware: true,
    implantType: "internal",
    pktBody: true,
    pktBiosystem: false,
    level: 8 + quality * 2,
    slots: 0,
    slotsUsed: 0,
    traits: new Set(),
  };
}

function biosystemEntry() {
  const id = "biosystem";
  const document = fakeDocument({
    _id: id,
    name: "Биосистема ПКТ",
    type: "equipment",
    flags: {
      "cyberpunk-remaster": {
        cyberware: true,
        pktBiosystem: true,
        implantType: "internal",
      },
    },
    system: {
      level: { value: 4 },
      traits: { value: [], rarity: "common" },
      description: { value: "" },
    },
  }, { id, uuid: `Compendium.cyberpunk-remaster.cyberpunk-items.Item.${id}` });
  return {
    id,
    uuid: document.uuid,
    name: document.name,
    document,
    category: "cyberware",
    cyberware: true,
    implantType: "internal",
    pktBody: false,
    pktBiosystem: true,
    level: 4,
    slots: 0,
    slotsUsed: 0,
    traits: new Set(),
  };
}

function catalog(entries) {
  return {
    entries,
    cyberware: entries,
    byId: new Map(entries.map((entry) => [entry.id, entry])),
    byAnyId: new Map(entries.map((entry) => [entry.id, entry])),
    byUuid: new Map(entries.map((entry) => [entry.uuid, entry])),
    byNameKey: new Map(),
  };
}

test("Neon Forge resolves CIC PKT components from stored snapshots and chooses a body by quality", () => {
  assert.equal(typeof loadout.resolvePktModelForCatalog, "function");
  assert.equal(typeof loadout.resolvePktBodyForModel, "function");

  const serial = bodyEntry("serial-body", 0, "Полная Конверсия Тела [Серийная]");
  const tactical = bodyEntry("tactical-body", 1, "Полная Конверсия Тела [Тактическая]");
  const advanced = bodyEntry("advanced-body", 2, "Полная Конверсия Тела [Продвинутая]");
  const cat = catalog([biosystemEntry(), serial, tactical, advanced]);

  const snapshot = {
    _id: "world-neural-base",
    name: "Нейролинк пользователя",
    type: "equipment",
    flags: {
      "cyberpunk-remaster": {
        cyberware: true,
        implantType: "base",
        pktFamily: "neural-link",
        slots: 4,
      },
    },
    system: {
      level: { value: 9 },
      traits: { value: [], rarity: "rare" },
      description: { value: "" },
    },
  };
  const model = {
    __cicCustom: true,
    key: "cic-my-model",
    name: "Моя ПКТ",
    bodyQuality: 1,
    minimumQuality: 1,
    requiredBodyId: "cic-quality-1",
    requiredBodyName: "Полная Конверсия Тела [Тактическая]",
    unique: [],
    components: [
      {
        itemId: "world-neural-base",
        sourceUuid: "Item.world-neural-base",
        name: "Нейролинк пользователя",
        source: snapshot,
        family: "neural-link",
        stress: "normal",
        stressFormula: "1d4",
      },
    ],
    choices: [],
  };

  const resolved = loadout.resolvePktModelForCatalog(model, cat);
  assert.ok(resolved, "custom CIC model must not be discarded just because its snapshot is not in the compendium catalog");
  assert.equal(resolved.components.length, 1);
  assert.equal(resolved.components[0].name, "Нейролинк пользователя");
  assert.ok(resolved.components[0].source, "saved source snapshot must survive Forge normalization");

  assert.equal(loadout.resolvePktBodyForModel(resolved, cat)?.id, "tactical-body");
  assert.equal(loadout.resolvePktBodyForModel(resolved, cat, advanced)?.id, "advanced-body");
  assert.equal(loadout.resolvePktBodyForModel(resolved, cat, serial), null, "body below minimum quality must be rejected");
});

test("Neon Forge renders Implant Creator PKT models as a separate selectable group", () => {
  const runtime = readFileSync(new URL("../forge/forge-runtime.mjs", import.meta.url), "utf8");
  const template = readFileSync(new URL("../templates/cyberpunk-forge.hbs", import.meta.url), "utf8");
  assert.match(runtime, /cicPktModels/u);
  assert.match(runtime, /stockPktModels/u);
  assert.match(template, /ПКТ из Конструктора имплантов/u);
  assert.match(template, /#each cicPktModels/u);
});

test("Implant Creator yields stacking priority to Foundry windows instead of forcing their z-index", () => {
  const source = readFileSync(new URL("../runtime/implant-creator.mjs", import.meta.url), "utf8");
  const style = readFileSync(new URL("../styles/implant-creator.css", import.meta.url), "utf8");

  assert.doesNotMatch(source, /100100\s*\+\s*sequence/u);
  assert.match(source, /cicLayer/u);
  assert.match(source, /background/u);
  assert.match(source, /foreground/u);
  assert.match(style, /\.cic-root\[data-cic-layer=["']background["']\][\s\S]*z-index/u);
});
