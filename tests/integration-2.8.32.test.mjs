import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const generatorPath = path.join(root, "forge", "generator.mjs");
const implantPath = path.join(root, "runtime", "implant-creator.mjs");

function installImplantGlobals() {
  const hooks = new Map();
  globalThis.Hooks = {
    once(name, fn) { const list = hooks.get(name) ?? []; list.push(fn); hooks.set(name, list); },
    on(name, fn) { const list = hooks.get(name) ?? []; list.push(fn); hooks.set(name, list); },
    callAll() {},
  };
  globalThis.game = {
    user: { id: "GM", isGM: true },
    modules: new Map([["cyberpunk-remaster", { active: true, api: {} }]]),
    settings: { register() {}, get() { return undefined; }, async set() {} },
    actors: [],
  };
  globalThis.CONFIG = { SF2E: {} };
  globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
  globalThis.document = { querySelector() { return null; }, querySelectorAll() { return []; } };
}

test("2.8.32 Forge strips Rule Elements from the service implant container and can repair old copies", async () => {
  const generator = await import(`${pathToFileURL(generatorPath).href}?v2832-forge-repair`);
  assert.equal(typeof generator.forgeImplantContainerRepairUpdate, "function");

  const update = generator.forgeImplantContainerRepairUpdate({
    id: "CONTAINER",
    name: "Импланты",
    type: "backpack",
    flags: {
      "cyberpunk-remaster": {
        forge: { generated: true, kind: "implant-container", loadoutKey: "implant-container" },
      },
    },
    system: {
      description: { value: "<p>Служебный контейнер Киберпанк-Кузницы.</p>" },
      rules: [{ selector: "perception", value: 1 }],
      traits: { rarity: "common" },
    },
  });

  assert.deepEqual(update, {
    _id: "CONTAINER",
    "system.rules": [],
    "system.traits.value": [],
    "system.traits.otherTags": [],
  });

  const source = read("forge/generator.mjs");
  assert.match(source, /source\.system\.rules\s*=\s*\[\]/u);
});

test("2.8.32 activation repair removes malformed Rule Elements and restores required trait arrays", async () => {
  installImplantGlobals();
  const implant = await import(`${pathToFileURL(implantPath).href}?v2832-activation-schema`);
  assert.equal(typeof implant.activationSchemaRepairUpdate, "function");

  const update = implant.activationSchemaRepairUpdate({
    id: "BLACKWALL",
    name: "Моноструна «Blackwall Thread»",
    type: "weapon",
    flags: {
      "cyberpunk-remaster": { cyberware: true },
      "cyberpunk-implant-creator": { activation: { enabled: true } },
    },
    system: {
      rules: [
        { key: "FlatModifier", selector: "attack", value: 1 },
        { selector: "damage", value: 2 },
        null,
      ],
      traits: { rarity: "unique" },
    },
  });

  assert.deepEqual(update, {
    _id: "BLACKWALL",
    "system.rules": [{ key: "FlatModifier", selector: "attack", value: 1 }],
    "system.traits.value": [],
    "system.traits.otherTags": [],
  });
});

test("2.8.32 serializes activation cleanup to prevent duplicate embedded Item deletion races", () => {
  const runtime = read("runtime/implant-creator.mjs");
  assert.match(runtime, /const SAFE_DELETE_ITEM_LOCK\s*=\s*new Set\(\)/u);
  assert.match(runtime, /const ACTOR_ACTION_REPAIR_LOCK\s*=\s*new Map\(\)/u);
  assert.match(runtime, /repairActivationSchemaForActor/u);
});

test("2.8.32 repairs Forge containers on GM ready", () => {
  const runtime = read("forge/forge-runtime.mjs");
  assert.match(runtime, /repairForgeImplantContainers/u);
  assert.match(runtime, /Hooks\.once\("ready"[\s\S]*repairForgeImplantContainers/u);
});

test("2.8.32 changelog remains documented while current metadata stays synchronized", () => {
  const manifest = JSON.parse(read("module.json"));
  const pkg = JSON.parse(read("package.json"));
  const readme = read("README.md");
  const changelog = read("CHANGELOG.md");
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.version.localeCompare("2.8.32", undefined, { numeric: true, sensitivity: "base" }) >= 0);
  assert.match(
    readme,
    new RegExp(`Версия:\\s*\\*\\*${manifest.version.replaceAll(".", "\\.")}\\*\\*`, "u"),
  );
  assert.match(changelog, /^## 2\.8\.32\b/mu);
});
