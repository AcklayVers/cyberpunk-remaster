import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateNpc } from "../forge/generator.mjs";
import { CITY_NPC_ROSTER } from "../data/city-npc-roster.mjs";
import { loadClassicLevel } from "./lib/classic-level.mjs";
// Build-time document adapter. Production statistics/items use the actual Forge generator.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let nextId = 0;
const clone = (v) => structuredClone(v);
function setPath(o, key, value) {
  const ps = key.split(".");
  for (const p of ps.slice(0, -1)) o = o[p] ??= {};
  const last = ps.at(-1);
  if (last.startsWith("-=")) delete o[last.slice(2)];
  else o[last] = clone(value);
}
class BuildItem {
  constructor(source, actor) {
    Object.assign(this, clone(source));
    this.id = this._id || (++nextId).toString(16).padStart(16, "0");
    this._id = this.id;
    this.actor = actor;
    this.traits = new Set(this.system?.traits?.value || []);
    this.sourceId = this.flags?.core?.sourceId || this._stats?.compendiumSource;
  }
  async update(d) {
    for (const [k, v] of Object.entries(d)) setPath(this, k, v);
    return this;
  }
  getFlag(s, k) {
    return this.flags?.[s]?.[k];
  }
  toObject() {
    return Object.fromEntries(
      Object.entries(this)
        .filter(([k]) => !["actor", "traits", "id", "sourceId"].includes(k))
        .map(([k, v]) => [k, clone(v)]),
    );
  }
}
class BuildActor {
  constructor(source) {
    Object.assign(this, clone(source));
    this.id = "city-build";
    this.uuid = "Actor.city-build";
    this.items = [];
    this.sheet = { render() {} };
  }
  async createEmbeddedDocuments(t, sources) {
    const created = sources.map((s) => new BuildItem(s, this));
    this.items.push(...created);
    return created;
  }
  async updateEmbeddedDocuments(t, updates) {
    for (const u of updates)
      await this.items
        .find((i) => i.id === u._id)
        ?.update(
          Object.fromEntries(Object.entries(u).filter(([k]) => k !== "_id")),
        );
    return updates;
  }
  async deleteEmbeddedDocuments(t, ids) {
    this.items = this.items.filter((i) => !ids.includes(i.id));
  }
  async update(d) {
    for (const [k, v] of Object.entries(d)) setPath(this, k, v);
    return this;
  }
  async delete() {}
}
const sourceItems = JSON.parse(
  await fs.readFile(path.join(root, "content/exports/items.json"), "utf8"),
);
const rawFolders = JSON.parse(
    await fs.readFile(path.join(root, "data/item-folders.json"), "utf8"),
  ),
  folders = new Map(rawFolders.map((f) => [f._id, { ...f }]));
for (const f of folders.values()) f.folder = folders.get(f.folder) || null;
const documents = sourceItems.map((s) => ({
  ...clone(s),
  id: s._id,
  uuid: `Compendium.cyberpunk-remaster.cyberpunk-items.Item.${s._id}`,
  folder: folders.get(s.folder) || null,
  toObject: () => clone(s),
}));
globalThis.game = {
  system: { id: "sf2e" },
  user: { id: "build", isGM: true },
  folders: [],
  actors: [],
  packs: new Map([
    [
      "cyberpunk-remaster.cyberpunk-items",
      {
        collection: "cyberpunk-remaster.cyberpunk-items",
        documentName: "Item",
        getDocuments: async () => documents,
      },
    ],
  ]),
  settings: { get() {}, async set() {} },
};
globalThis.Folder = { create: async () => ({ id: "city-build-folder" }) };
globalThis.Actor = { create: async (s) => new BuildActor(s) };
globalThis.fromUuid = async (uuid) =>
  documents.find((d) => d.uuid === uuid) || null;
const actors = [];
for (const row of CITY_NPC_ROSTER) {
  nextId = 0;
  const result = await generateNpc({
    preset: row.preset,
    name: row.name,
    level: row.level,
    randomSeed: `city-roster:${row.id}`,
    openSheet: false,
    sourceRemaster: true,
    sourceCpel: false,
    includeConsumables: true,
    includePrograms: true,
    target: "new",
  });
  const a = result.actor;
  a.system.details.publicNotes = `${row.description}<hr><p>Адаптация для Starfinder2e. Статблок и снаряжение — Киберпанк-Кузница Remaster.</p>${a.system.details.publicNotes || ""}`;
  const source = {
    _id: row.id,
    name: row.name,
    type: "npc",
    img: row.img,
    system: clone(a.system),
    prototypeToken: {
      ...clone(a.prototypeToken || {}),
      name: row.name,
      texture: { src: row.img },
      actorLink: false,
    },
    ownership: { default: 0 },
    flags: {
      ...clone(a.flags || {}),
      "cyberpunk-remaster": {
        ...clone(a.flags?.["cyberpunk-remaster"] || {}),
        cityNpc: { rosterId: row.id, source: row.source },
      },
    },
    items: a.items.map((i) => i.toObject()),
  };
  actors.push(source);
}
await fs.writeFile(
  path.join(root, "data/city-npc-actors.json"),
  JSON.stringify(actors, null, 2) + "\n",
);
const packsRoot = path.resolve(root, "packs"),
  target = path.resolve(packsRoot, "city-npcs");
if (path.dirname(target) !== packsRoot || path.basename(target) !== "city-npcs")
  throw new Error("Unsafe pack path");
await fs.rm(target, { recursive: true, force: true });
const ClassicLevel = loadClassicLevel(),
  db = new ClassicLevel(target, { valueEncoding: "json" });
try {
  const collection = db.sublevel("actors", { valueEncoding: "json" }),
    items = db.sublevel("actors.items", { valueEncoding: "json" });
  await collection.batch(
    actors.map((a) => ({
      type: "put",
      key: a._id,
      value: { ...a, items: a.items.map((i) => i._id) },
    })),
  );
  await items.batch(
    actors.flatMap((a) =>
      a.items.map((i) => ({ type: "put", key: `${a._id}.${i._id}`, value: i })),
    ),
  );
} finally {
  await db.close();
}
console.log(
  `Built24SF2E city NPCs (${actors.reduce((n, a) => n + a.items.length, 0)} embedded items). Existing packs untouched.`,
);
