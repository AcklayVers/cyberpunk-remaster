import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
test("calendar uses zero-based month/day and switches without advancing world time", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-calendar.mjs").catch(() => null);
  assert.ok(m, "calendar adapter must exist");
  game.modules.set("foundryvtt-simple-calendar", { active: true });
  let setDate;
  globalThis.SimpleCalendar = {
    api: {
      timestampToDate: () => ({
        year: 2045,
        month: 6,
        day: 13,
        hour: 21,
        minute: 15,
        seconds: 0,
      }),
      dateToTimestamp: (d) => {
        setDate = d;
        return 1000;
      },
    },
  };
  await m.setCityCalendarMode("simple-calendar");
  assert.equal(game.time.worldTime, 100);
  assert.equal(m.getCityCampaignTime().iso, "2045-07-14T21:15:00.000Z");
  await m.setCityCampaignDate("2045-07-15T22:30:00Z");
  assert.equal(setDate.day, 14);
  assert.equal(game.time.worldTime, 1000);
  game.modules.get("foundryvtt-simple-calendar").active = false;
  assert.ok(m.getCityCampaignTime().iso);
  assert.equal(m.cityCalendarStatus().available, false);
  game.user = e.users.get("a");
  await assert.rejects(() => m.setCityCalendarMode("internal"), /ведущ/);
});
test("calendar setup backs up first and holidays are idempotent", async () => {
  cityTestEnv();
  const m = await import("../runtime/city-calendar.mjs").catch(() => null);
  assert.ok(m);
  game.modules.set("foundryvtt-simple-calendar", { active: true });
  const order = [],
    notes = [];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      calendar: { name: "Gregorian", months: { values: [] }, general: {} },
    }),
  });
  globalThis.SimpleCalendar = {
    api: {
      timestampToDate: () => ({
        year: 2045,
        month: 6,
        day: 13,
        hour: 20,
        minute: 0,
      }),
      dateToTimestamp: () => 100,
      getCurrentCalendar: () => ({ name: "Old" }),
      configureCalendar: async () => {
        order.push("configure");
        return true;
      },
      getNotes: () => notes,
      addNote: async (name) => {
        notes.push({ name });
      },
    },
  };
  await m.setupCityCalendar({ backup: async () => order.push("backup") });
  assert.deepEqual(order.slice(0, 2), ["backup", "configure"]);
  const count = notes.length;
  await m.setupCityCalendar({ backup: async () => {} });
  assert.equal(notes.length, count);
  assert.ok(count > 0);
});
