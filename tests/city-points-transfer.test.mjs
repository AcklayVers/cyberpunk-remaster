import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorldCityMap } from "../runtime/world-city-map.mjs";
const load = () =>
  import("../runtime/city-points-transfer.mjs").catch(() => null);
const payload = {
  app: "cyberpunk-remaster-world-city-map-points",
  version: 1,
  mapVersion: 5,
  categories: [],
  markers: Array.from({ length: 526 }, (_, i) => ({
    id: `p${i}`,
    title: i < 2 ? "Same name" : `Point${i}`,
    x: i / 526,
    y: 0.4,
    categoryId: "shop",
    showLinkedInDetail: false,
    links:
      i === 0
        ? [{ actorId: "missing", section: "people", entryId: "old" }]
        : [],
  })),
};
test("campaign transfer keeps526IDs, coordinates, flags and link; repeated transfer adds none", async () => {
  const m = await load();
  assert.ok(m, "transfer service must exist");
  const state = normalizeWorldCityMap({});
  const first = m.previewCityPointsTransfer(state, payload);
  assert.equal(first.added.length, 526);
  const merged = m.mergeCityPointsTransfer(state, payload);
  assert.equal(merged.markers.length, 526);
  assert.equal(merged.markers[1].id, "p1");
  assert.equal(merged.markers[1].x, 1 / 526);
  assert.equal(merged.markers[0].showLinkedInDetail, false);
  assert.equal(merged.markers[0].links[0].actorId, "missing");
  const next = m.previewCityPointsTransfer(merged, payload);
  assert.equal(next.added.length, 0);
  assert.equal(next.unchanged.length, 526);
  assert.equal(next.conflicts.length, 0);
});
test("conflicts preserve current data; explicit replace keeps regions and roads", async () => {
  const m = await load();
  assert.ok(m);
  const state = normalizeWorldCityMap({
    markers: [{ ...payload.markers[0], title: "Edited" }],
    regions: [
      {
        id: "r",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      },
    ],
    roadNetworks: { map: { mapKey: "map", nodes: [], edges: [] } },
  });
  assert.equal(m.previewCityPointsTransfer(state, payload).conflicts.length, 1);
  assert.equal(
    m.mergeCityPointsTransfer(state, payload).markers[0].title,
    "Edited",
  );
  const replaced = m.mergeCityPointsTransfer(state, payload, {
    replaceIds: ["p0"],
  });
  assert.equal(replaced.markers[0].title, "Same name");
  assert.deepEqual(replaced.regions, state.regions);
  assert.deepEqual(replaced.roadNetworks, state.roadNetworks);
  assert.throws(
    () =>
      m.previewCityPointsTransfer(state, {
        ...payload,
        markers: [{ ...payload.markers[0], x: NaN }],
      }),
    /координат/,
  );
});
