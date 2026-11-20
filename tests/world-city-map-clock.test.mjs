import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
test("standalone clock keeps time and calendar independent of deleted travel", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/world-city-map-clock.mjs").catch(
    () => null,
  );
  assert.ok(m, "standalone clock must exist");
  await m.initializeWorldMapClock();
  const before = game.time.worldTime;
  await m.advanceWorldMapTime(15);
  assert.equal(game.time.worldTime, before + 900);
  await m.setWorldMapCampaignDate("2045-08-01T21:00:00Z");
  const { getCityCampaignTime } = await import("../runtime/city-calendar.mjs");
  assert.equal(getCityCampaignTime().time, "21:00");
  game.user = e.users.get("a");
  await assert.rejects(() => m.advanceWorldMapTime(15), /ведущ/);
});
