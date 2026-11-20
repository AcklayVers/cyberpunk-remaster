import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../runtime/world-city-map-leaflet.mjs";

const markers = Array.from({ length: 250 }, (_, i) => ({
  id: `p${i}`,
  title: `Point ${i}`,
  x: 0.5 + (i % 10) * 0.0001,
  y: 0.5 + Math.floor(i / 10) * 0.0001,
}));
const layout = (...args) => {
  assert.equal(typeof api.worldCityMarkerGroups, "function");
  return api.worldCityMarkerGroups(...args);
};

test("active job and rumor overlays remain individual among dense ordinary points", () => {
  const groups = layout([...markers, { id: "job", cityJobId: "order", x: .5, y: .5 }], { zoom: 2 });
  assert.deepEqual(groups.find(g => g.ids.includes("job")).ids, ["job"]);
  assert.equal(new Set(groups.flatMap(g => g.ids)).size, 251);
});

test("dense overview groups every source ID once without changing map data", () => {
  const before = JSON.stringify(markers);
  const groups = layout(markers, { zoom: 2 });
  assert.ok(groups.length < 10);
  assert.deepEqual(
    groups.flatMap((g) => g.ids).sort(),
    markers.map((m) => m.id).sort(),
  );
  assert.equal(JSON.stringify(markers), before);
  for (const group of groups) {
    assert.ok(Number.isFinite(group.x) && Number.isFinite(group.y));
    assert.ok(group.ids.length >= 1);
  }
});

test("zooming in, disabling groups and small filtered lists retain individual points", () => {
  for (const options of [{ zoom: 4 }, { zoom: 2, enabled: false }])
    assert.ok(layout(markers, options).every((g) => g.ids.length === 1));
  assert.equal(layout(markers.slice(0, 10), { zoom: 2 }).length, 10);
});

test("selected or dragged markers stay individually accessible on overview", () => {
  const groups = layout(markers, {
    zoom: 2,
    excludeIds: new Set(["p1", "p2"]),
  });
  assert.deepEqual(
    groups
      .filter((g) => g.ids.includes("p1") || g.ids.includes("p2"))
      .map((g) => g.ids)
      .sort(),
    [["p1"], ["p2"]],
  );
  assert.equal(new Set(groups.flatMap((g) => g.ids)).size, 250);
});

test("group identities and positions are stable under source reordering and independent of panning", () => {
  const a = layout(markers, { zoom: 2 });
  const b = layout([...markers].reverse(), { zoom: 2 });
  const canonical = (g) =>
    g
      .map((row) => ({ ...row, ids: [...row.ids].sort() }))
      .sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(canonical(a), canonical(b));
});

test("custom image dimensions and boundary points remain within their original normalized coordinates", () => {
  const list = markers.map((m, i) => ({
    ...m,
    x: i % 2,
    y: i % 3 === 0 ? 0 : 1,
  }));
  const groups = layout(list, {
    zoom: 2,
    manifest: { width: 800, height: 400, maxNativeZoom: 2 },
  });
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map((g) => [g.x, g.y]).sort(), [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
});
