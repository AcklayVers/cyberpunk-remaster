import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";
test("archive mutations serialize and retain live unsaved entries", async () => {
  const env = cityTestEnv();
  const m = await import("../runtime/city-archive-service.mjs").catch(
    () => null,
  );
  assert.ok(m, "archive transaction service must exist");
  const { registerWorldMapArchiveBridge } =
    await import("../runtime/world-city-map-archive.mjs");
  let live = cityArchive();
  const off = registerWorldMapArchiveBridge({
    getSnapshot: () => ({ ownerUserId: "a", store: live }),
    beforeExternalMutation: async () => true,
    applyExternalStore: (s) => {
      live = s;
    },
  });
  await Promise.all([
    m.mutateCityArchive("a", (s) => {
      s.notebooks.aa.entries.notes.push({ id: "x", title: "X" });
    }),
    m.mutateCityArchive("a", (s) => {
      s.notebooks.aa.entries.notes.push({ id: "y", title: "Y" });
    }),
  ]);
  assert.equal(live.notebooks.aa.entries.notes.length, 3);
  assert.equal(live.notebooks.aa.entries.notes[0].content, "Unsaved");
  off();
  game.user = env.users.get("a");
  await assert.rejects(() => m.mutateCityArchive("b", () => {}), /прав/);
});
test("typing during an external save is merged before committing the live store", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-archive-service.mjs");
  const { registerWorldMapArchiveBridge } =
    await import("../runtime/world-city-map-archive.mjs");
  let live = cityArchive(),
    release,
    started;
  const gate = new Promise((r) => (release = r)),
    begin = new Promise((r) => (started = r)),
    user = e.users.get("a"),
    update = user.update.bind(user);
  let first = true;
  user.update = async (d) => {
    if (first) {
      first = false;
      started();
      await gate;
    }
    return update(d);
  };
  const off = registerWorldMapArchiveBridge({
    getSnapshot: () => ({ ownerUserId: "a", store: live }),
    applyExternalStore: (s) => {
      live = s;
    },
  });
  try {
    const pending = m.mutateCityArchive("a", (s) => {
      s.notebooks.aa.entries.people[0].messages.push({
        id: "msg",
        body: "Incoming",
      });
    });
    await begin;
    live.notebooks.aa.entries.notes[0].content = "Typed during save";
    release();
    await pending;
    assert.equal(
      live.notebooks.aa.entries.notes[0].content,
      "Typed during save",
    );
    assert.equal(
      user.flags.cyberpunkRemaster.neuroArchive.data.notebooks.aa.entries
        .notes[0].content,
      "Typed during save",
    );
  } finally {
    off();
  }
});
test("two open Archives merge independent drafts instead of taking the last snapshot", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-archive-service.mjs");
  const { registerWorldMapArchiveBridge } =
    await import("../runtime/world-city-map-archive.mjs");
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  let first = cityArchive(),
    second = cityArchive();
  const off1 = registerWorldMapArchiveBridge({
    getSnapshot: () => ({ ownerUserId: "a", store: first }),
    applyExternalStore: (s) => {
      first = s;
    },
  });
  const off2 = registerWorldMapArchiveBridge({
    getSnapshot: () => ({ ownerUserId: "a", store: second }),
    applyExternalStore: (s) => {
      second = s;
    },
  });
  try {
    first.notebooks.aa.entries.notes[0].content = "Draft in first Archive";
    second.notebooks.aa.entries.people[0].summary = "Draft in second Archive";
    await m.mutateCityArchive("a", (s) => {
      s.notebooks.aa.entries.people[0].messages.push({
        id: "in",
        body: "Incoming",
      });
    });
    for (const s of [first, second, m.readCityArchive("a")]) {
      assert.equal(
        s.notebooks.aa.entries.notes[0].content,
        "Draft in first Archive",
      );
      assert.equal(
        s.notebooks.aa.entries.people[0].summary,
        "Draft in second Archive",
      );
      assert.equal(s.notebooks.aa.entries.people[0].messages.length, 1);
    }
  } finally {
    off1();
    off2();
  }
});
