import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CYBERPUNK_PRESETS } from "../forge/presets.mjs";
test("city roster contains24adaptations with native presets and complete SF2E actor exports", async () => {
  const m = await import("../data/city-npc-roster.mjs").catch(() => null);
  assert.ok(m, "adapted city roster must exist");
  assert.equal(m.CITY_NPC_ROSTER.length, 24);
  const actors = JSON.parse(
    fs.readFileSync(
      new URL("../data/city-npc-actors.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(actors.length, 24);
  for (const row of m.CITY_NPC_ROSTER) {
    assert.ok(CYBERPUNK_PRESETS[row.preset], row.name);
    const actor = actors.find((a) => a._id === row.id);
    assert.ok(actor, row.name);
    assert.equal(actor.name, row.name);
    assert.equal(actor.type, "npc");
    assert.equal(actor.system.details.level.value, row.level);
    assert.ok(actor.system.attributes.hp.max > 0);
    assert.ok(actor.items.some((i) => i.type === "melee"));
    assert.doesNotMatch(
      JSON.stringify(actor),
      /systems\/cyberpunk-red-core|"derivedStats"|"installedItems"/,
    );
    assert.ok(actor.system.details.publicNotes.includes(row.name));
  }
});
