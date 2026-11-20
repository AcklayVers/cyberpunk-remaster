import test from "node:test";
import assert from "node:assert/strict";
import { CYBERPUNK_PRESETS } from "../forge/presets.mjs";
import { NIGHT_CITY_ENCOUNTERS } from "../data/night-city-encounters.mjs";
test("72 distinct encounters cover eight kinds with native presets and real playable hooks", () => {
  assert.equal(NIGHT_CITY_ENCOUNTERS.length, 72);
  assert.equal(new Set(NIGHT_CITY_ENCOUNTERS.map((e) => e.id)).size, 72);
  assert.equal(new Set(NIGHT_CITY_ENCOUNTERS.map((e) => e.title)).size, 72);
  const kinds = new Set(NIGHT_CITY_ENCOUNTERS.map((e) => e.kind));
  assert.equal(kinds.size, 8);
  for (const kind of kinds)
    assert.equal(
      NIGHT_CITY_ENCOUNTERS.filter((e) => e.kind === kind).length,
      9,
    );
  for (const e of NIGHT_CITY_ENCOUNTERS) {
    assert.ok(CYBERPUNK_PRESETS[e.preset]);
    assert.ok(e.publicText.length > 40);
    assert.ok(e.gmText.length > 45);
  }
});
test("encounter kinds and recent-history exclusions are honored without violating time or danger", async () => {
  const m = await load();
  for (const threat of [
    "unknown",
    "corporate",
    "moderate",
    "suburbs",
    "combat",
    "hot",
  ])
    for (const night of [false, true]) {
      const used = [];
      for (let i = 0; i < 20; i++) {
        const e = m.rollWorldMapEncounter({
          district: { threat },
          night,
          seed: `${threat}:${night}:${i}`,
          excludeIds: used.slice(-5),
        });
        assert.ok(!used.slice(-5).includes(e.id));
        const source = NIGHT_CITY_ENCOUNTERS.find((row) => row.id === e.id);
        assert.ok(!source.threats.length || source.threats.includes(threat));
        assert.ok(
          source.time === "any" || source.time === (night ? "night" : "day"),
        );
        used.push(e.id);
      }
    }
  for (const kind of new Set(NIGHT_CITY_ENCOUNTERS.map((e) => e.kind))) {
    const e = m.rollWorldMapEncounter({
      district: { threat: "unknown" },
      kind,
      seed: kind,
    });
    assert.equal(e.kind, kind);
  }
});
async function load() {
  const m = await import("../runtime/world-city-map-encounters.mjs").catch(
    () => null,
  );
  assert.ok(m, "encounter module must exist");
  return m;
}
test("seed repeats encounter, native presets and bounds are valid", async () => {
  const m = await load();
  const args = {
    district: { id: "d", name: "Watson", threat: "combat", controller: "Gang" },
    night: true,
    seed: "same",
    partyLevel: 50,
    partySize: 100,
  };
  const a = m.rollWorldMapEncounter(args),
    b = m.rollWorldMapEncounter(args);
  assert.deepEqual(a, b);
  assert.ok(a.forgeValues.level <= 20);
  assert.ok(a.forgeValues.count <= 20);
  assert.ok(CYBERPUNK_PRESETS[a.forgeValues.preset]);
  assert.equal(a.forgeValues.target, "new");
});
test("public chat excludes complication, journal is private and viewer rejected", async () => {
  const m = await load();
  const created = [];
  globalThis.game = { user: { isGM: true } };
  globalThis.JournalEntry = {
    async create(d) {
      created.push(d);
      return d;
    },
  };
  globalThis.ChatMessage = {
    async create(d) {
      created.push(d);
      return d;
    },
  };
  const result = {
    title: "Patrol",
    publicText: "Public",
    gmText: "SECRET",
    forgeValues: {},
  };
  await m.saveWorldMapEncounter(result);
  assert.equal(created[0].ownership.default, 0);
  assert.equal(created[0].pages[0].ownership.default, 0);
  await m.publishWorldMapEncounter(result);
  assert.doesNotMatch(created[1].content, /SECRET/);
  game.user.isGM = false;
  await assert.rejects(() => m.publishWorldMapEncounter(result));
  await assert.rejects(() => m.saveWorldMapEncounter(result));
});
test("events include day/night and peaceful results without creating actors", async () => {
  const m = await load();
  const results = Array.from({ length: 100 }, (_, i) =>
    m.rollWorldMapEncounter({
      district: { threat: "moderate" },
      night: false,
      seed: String(i),
      partyLevel: 3,
      partySize: 4,
    }),
  );
  assert.ok(results.some((r) => r.peaceful));
  assert.ok(results.every((r) => r.publicText && r.gmText));
});
