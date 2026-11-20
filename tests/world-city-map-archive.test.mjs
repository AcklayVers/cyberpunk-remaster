import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorldCityMap,
  markersForArchiveEntry,
} from "../runtime/world-city-map.mjs";
const url = new URL("../runtime/world-city-map-archive.mjs", import.meta.url);
const archive = (title) => ({
  notebooks: {
    a: {
      actorName: "Solo",
      entries: { locations: [{ id: "e", title, type: "locations" }] },
    },
  },
});
const user = (id, title) => ({
  id,
  flags: { cyberpunkRemaster: { neuroArchive: { data: archive(title) } } },
});
function env(gm = false) {
  const users = new Map([
    ["u1", user("u1", "Own")],
    ["u2", user("u2", "Foreign")],
  ]);
  globalThis.game = { user: { id: "u1", isGM: gm }, users };
  globalThis.localStorage = {
    getItem() {
      return null;
    },
  };
}
async function load(tag) {
  const m = await import(`${url.href}?${tag}`).catch(() => null);
  assert.ok(m, "archive bridge must exist");
  return m;
}
test("viewer can list own records but cannot expose foreign titles", async () => {
  env();
  const m = await load("access");
  assert.equal(m.listWorldMapArchiveRecords()[0].title, "Own");
  assert.deepEqual(m.listWorldMapArchiveRecords({ ownerUserId: "u2" }), []);
  assert.equal(
    m.resolveWorldMapArchiveLink({
      ownerUserId: "u2",
      actorId: "a",
      section: "locations",
      entryId: "e",
    }).status,
    "forbidden",
  );
});
test("GM legacy duplicate link is ambiguous and explicit owner resolves", async () => {
  env(true);
  const m = await load("ambiguous");
  const link = { actorId: "a", section: "locations", entryId: "e" };
  assert.equal(m.resolveWorldMapArchiveLink(link).status, "ambiguous");
  assert.equal(
    m.resolveWorldMapArchiveLink({ ...link, ownerUserId: "u2" }).record.title,
    "Foreign",
  );
  assert.equal(
    m.resolveWorldMapArchiveLink({ ...link, entryId: "gone" }).status,
    "missing",
  );
});
test("live unsaved snapshot wins and unregister restores server", async () => {
  env();
  const m = await load("live");
  const off = m.registerWorldMapArchiveBridge({
    getSnapshot: () => ({ ownerUserId: "u1", store: archive("Unsaved") }),
  });
  assert.equal(m.listWorldMapArchiveRecords()[0].title, "Unsaved");
  off();
  assert.equal(m.listWorldMapArchiveRecords()[0].title, "Own");
});
test("old link keeps shape and new owner survives normalization", () => {
  const links = [
    { actorId: "a", section: "locations", entryId: "e" },
    { actorId: "a", section: "locations", entryId: "e", ownerUserId: "u2" },
  ];
  const s = normalizeWorldCityMap({
    markers: [{ id: "m", x: 0.5, y: 0.5, links }],
  });
  assert.deepEqual(s.markers[0].links, links);
});

test("owner-qualified record still finds a legacy ownerless marker", () => {
  const link = { actorId: "a", section: "locations", entryId: "e" };
  const state = normalizeWorldCityMap({
    markers: [{ id: "m", links: [link] }],
  });
  assert.equal(
    markersForArchiveEntry({ ...link, ownerUserId: "u1" }, state).length,
    1,
  );
});

test("closed archive reads the existing personal chronicle local draft", async () => {
  env();
  const store = {
    ...archive("Legacy draft"),
    updatedAt: "2045-01-01T00:00:00Z",
  };
  store.notebooks.a.entries.locations[0].updatedAt = "2045-01-01T00:00:00Z";
  globalThis.localStorage = {
    getItem(key) {
      return key === "personal-chronicle-macro:world:u1"
        ? JSON.stringify(store)
        : null;
    },
  };
  const m = await load("legacy-local");
  assert.equal(m.listWorldMapArchiveRecords()[0].title, "Legacy draft");
});
