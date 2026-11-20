import test from "node:test";
import assert from "node:assert/strict";
async function load() {
  const m = await import("../forge/encounter-context.mjs").catch(() => null);
  assert.ok(m, "forge encounter adapter must exist");
  return m;
}
test("rejecting dirty Forge replacement preserves fields and context", async () => {
  const m = await load();
  globalThis.game = { user: { isGM: true } };
  const app = {
    cityEncounterBaseline: { preset: "corporate-patrol", level: 3 },
    encounterContext: { title: "Old" },
  };
  let applied = false;
  const ok = await m.applyForgeEncounterContext(
    app,
    {
      values: { preset: "street-ganger", level: 5 },
      encounterContext: { title: "New" },
    },
    {
      readValues: () => ({ preset: "corporate-patrol", level: 10 }),
      applyValues: () => {
        applied = true;
      },
      confirm: async () => false,
    },
  );
  assert.equal(ok, false);
  assert.equal(applied, false);
  assert.equal(app.encounterContext.title, "Old");
});
test("accepted replacement applies native normalized values and context", async () => {
  const m = await load();
  globalThis.game = { user: { isGM: true } };
  const app = {};
  let applied;
  await m.applyForgeEncounterContext(
    app,
    {
      values: { preset: "street-ganger", level: 5, count: 2 },
      encounterContext: {
        title: "Patrol",
        districtName: "Watson",
        faction: "Gang",
      },
    },
    {
      readValues: () => ({}),
      applyValues: (_app, v) => {
        applied = v;
      },
      confirm: async () => true,
    },
  );
  assert.equal(applied.preset, "street-ganger");
  assert.equal(applied.count, 2);
  assert.equal(app.encounterContext.faction, "Gang");
});
