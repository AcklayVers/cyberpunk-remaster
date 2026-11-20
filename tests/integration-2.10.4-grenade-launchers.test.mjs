import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  removeLegacyLauncherCast,
  migrateLauncherItemsOnActor,
  migrateLauncherTokensInScene,
  isGrenadeLauncher,
  sanitizeLauncherSource,
} from "../runtime/grenade-launcher-compat.mjs";

const items = JSON.parse(
  readFileSync(new URL("../content/exports/items.json", import.meta.url)),
);
const byId = (id) => items.find((i) => i._id === id);
const legacy = {
  key: "ItemCast",
  uuid: "Compendium.sf2e.spells.Item.sxQZ6yqTn0czJxVd",
  dc: "10 + @item.level + @actor.system.abilities.str.mod",
  tradition: "primal",
};

test("both compendium launchers use supported rules and documented two-action grenade area use", () => {
  for (const id of ["V08iCfNY9JLL8yRA", "SGy1aJYOIKeg1k4T"]) {
    const item = byId(id);
    assert.ok(item);
    assert.ok(!item.system.rules.some((r) => r.key === "ItemCast"));
    assert.match(
      item.system.description.value,
      /Area Fire|Площадн|стрельб.*по площади/iu,
    );
  }
});

test("migration removes only legacy unsupported rule on launcher and preserves user customizations", () => {
  const original = {
    _id: "123",
    name: "Серийный реактивный гранатомёт",
    type: "weapon",
    system: {
      baseItem: "raketomet",
      quantity: 4,
      description: { value: "Мой текст" },
      rules: [
        { key: "FlatModifier", selector: "foo", value: 5 },
        legacy,
        { key: "RollOption", option: "custom" },
      ],
    },
    flags: { "cyberpunk-equipment-library": { custom: 1 } },
  };
  assert.ok(isGrenadeLauncher(original));
  const result = removeLegacyLauncherCast(original);
  assert.equal(result.changed, true);
  assert.deepEqual(result.rules, [
    original.system.rules[0],
    original.system.rules[2],
  ]);
  assert.equal(original.system.rules.length, 3);
  assert.deepEqual(result.otherRules, 2);
  const untouched = removeLegacyLauncherCast({
    ...original,
    name: "Снайперская винтовка",
    system: { ...original.system, baseItem: "sniper-rifle" },
  });
  assert.equal(untouched.changed, false);
  const customized = removeLegacyLauncherCast({
    ...original,
    system: {
      ...original.system,
      rules: [{ ...legacy, uuid: "MyCustomSpell" }],
    },
  });
  assert.equal(customized.changed, true);
  assert.equal(customized.removed[0].uuid, "MyCustomSpell");
});

test("migration updates embedded items for actors idempotently and skips CPEL unrelated rules", async () => {
  const saved = [];
  const item = {
    id: "weapon01",
    name: "Серийный реактивный гранатомёт",
    type: "weapon",
    system: {
      rules: [
        legacy,
        { key: "FlatModifier", selector: "ranged-attack", value: 2 },
      ],
    },
  };
  const actor = {
    name: "Hero",
    items: [item],
    async updateEmbeddedDocuments(type, changes) {
      saved.push({ type, changes });
      item.system.rules = changes[0]["system.rules"];
    },
  };
  assert.equal(await migrateLauncherItemsOnActor(actor), 1);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].changes, [
    {
      _id: "weapon01",
      "system.rules": [
        { key: "FlatModifier", selector: "ranged-attack", value: 2 },
      ],
      "flags.cyberpunk-remaster.legacyItemCastBackup": [legacy],
    },
  ]);
  assert.equal(await migrateLauncherItemsOnActor(actor), 0);
});

test("migration handles unlinked scene token synthetic actors but not linked actors twice", async () => {
  const updated = [];
  const scene = {
    name: "Test",
    tokens: [
      {
        actorLink: false,
        actor: {
          name: "Synthetic",
          items: [
            {
              id: "missile",
              name: "Серийный реактивный гранатомёт",
              type: "weapon",
              system: { rules: [legacy] },
            },
          ],
          async updateEmbeddedDocuments(t, u) {
            updated.push(u);
          },
        },
      },
      {
        actorLink: true,
        actor: {
          name: "Linked",
          items: [],
          async updateEmbeddedDocuments() {
            throw Error("must skip");
          },
        },
      },
    ],
  };
  assert.equal(await migrateLauncherTokensInScene(scene), 1);
  assert.equal(updated.length, 1);
});

test("implant creator never advertises unsupported ItemCast preset; generator does not copy it", () => {
  const code = readFileSync(
    new URL("../runtime/implant-creator.mjs", import.meta.url),
    "utf8",
  );
  const generator = readFileSync(
    new URL("../scripts/maintenance/add-red-pkt-content.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(code, /itemCast:\s*\{/);
  assert.doesNotMatch(generator, /grenadeLauncherCastRules/);
});

test("firing compatible launcher consumes one selected grenade and one chamber, announces Class DC", async () => {
  const { fireGrenadeLauncher, reloadGrenadeLauncher } =
    await import("../runtime/grenade-launcher-action.mjs");
  const flags = {};
  const chat = [];
  const updates = [];
  const actor = {
    name: "Hero",
    getStatistic: (name) => (name === "class" ? { dc: { value: 25 } } : null),
  };
  const launcher = {
    id: "lan",
    type: "weapon",
    name: "Серийный реактивный гранатомёт",
    system: {
      range: 140,
      ammo: { capacity: 1 },
      baseItem: "reaktivnyy-granatomyot",
    },
    actor,
    getFlag: (_id, k) => flags[k],
    setFlag: async (_id, k, v) => {
      flags[k] = v;
    },
  };
  const ammo = {
    id: "ammo",
    name: "Ракета",
    type: "ammo",
    system: { quantity: 2, damage: { dice: 2, die: "d8", damageType: "fire" } },
    update: async (u) => {
      updates.push(u);
      ammo.system.quantity = u["system.quantity"];
    },
  };
  const result = await fireGrenadeLauncher({
    launcher,
    ammunition: ammo,
    createMessage: async (m) => {
      chat.push(m);
    },
  });
  assert.equal(result.fired, true);
  assert.equal(flags.launcherLoaded, 0);
  assert.equal(ammo.system.quantity, 1);
  assert.equal(updates.length, 1);
  assert.match(chat[0].content, /25/);
  assert.match(chat[0].content, /Ракета/);
  assert.equal(
    (
      await fireGrenadeLauncher({
        launcher,
        ammunition: ammo,
        createMessage: async (m) => {
          chat.push(m);
        },
      })
    ).fired,
    false,
  );
  assert.equal(ammo.system.quantity, 1);
  assert.equal(await reloadGrenadeLauncher({ launcher }), 1);
  assert.equal(flags.launcherLoaded, 1);
});

test("failed ammo update never decrements magazine or creates chat", async () => {
  const { fireGrenadeLauncher } =
    await import("../runtime/grenade-launcher-action.mjs");
  const flags = {};
  let sent = 0;
  const launcher = {
    type: "weapon",
    name: "Реактивный гранатомёт",
    system: { ammo: { capacity: 1 } },
    actor: { getStatistic: () => null },
    getFlag: () => undefined,
    setFlag: async (k, n, v) => {
      flags[n] = v;
    },
  };
  const ammunition = {
    name: "Граната",
    system: { quantity: 1 },
    update: async () => {
      throw new Error("Not owner");
    },
  };
  await assert.rejects(
    () =>
      fireGrenadeLauncher({
        launcher,
        ammunition,
        createMessage: async () => {
          sent++;
        },
      }),
    /Not owner/,
  );
  assert.equal(flags.launcherLoaded, undefined);
  assert.equal(sent, 0);
});

test("import sanitizer preserves unsupported customized launcher casting rule as inert backup", () => {
  const item = {
    name: "Серийный реактивный гранатомёт",
    type: "weapon",
    system: {
      baseItem: "reactive",
      rules: [
        { key: "ItemCast", uuid: "my-custom-spell" },
        { key: "FlatModifier", selector: "attack", value: 1 },
      ],
    },
    flags: { "cyberpunk-equipment-library": { foo: "bar" } },
  };
  assert.equal(sanitizeLauncherSource(item), true);
  assert.equal(item.system.rules.length, 1);
  assert.equal(
    item.flags["cyberpunk-remaster"].legacyItemCastBackup[0].uuid,
    "my-custom-spell",
  );
  assert.equal(item.flags["cyberpunk-equipment-library"].foo, "bar");
});

test("shipped compendium stores both launcher records with supported rules", async (t) => {
  const { loadClassicLevel } = await import("../scripts/lib/classic-level.mjs");
  const { fileURLToPath } = await import("node:url");
  const ClassicLevel = loadClassicLevel();
  const sandbox = await fs.mkdtemp(
    path.join(os.tmpdir(), "cyberpunk-pack-read-"),
  );
  t.after(async () => {
    if (
      path.dirname(sandbox) !== os.tmpdir() ||
      !path.basename(sandbox).startsWith("cyberpunk-pack-read-")
    )
      throw new Error("Unsafe test cleanup");
    await fs.rm(sandbox, { recursive: true, force: true });
  });
  await fs.cp(
    fileURLToPath(new URL("../packs/cyberpunk-items", import.meta.url)),
    sandbox,
    { recursive: true },
  );
  const db = new ClassicLevel(sandbox, {
    valueEncoding: "json",
    readOnly: true,
  });
  await db.open();
  try {
    for (const id of ["V08iCfNY9JLL8yRA", "SGy1aJYOIKeg1k4T"]) {
      const doc = await db.get("!items!" + id);
      assert.ok(doc);
      assert.deepEqual(doc.system.rules, []);
      assert.match(doc.system.description.value, /Area Fire/);
    }
  } finally {
    await db.close();
  }
});
