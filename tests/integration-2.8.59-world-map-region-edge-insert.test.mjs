import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const leaflet = readFileSync(new URL("../runtime/world-city-map-leaflet.mjs", import.meta.url), "utf8");
const view = readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");

test("2.8.59 editing a region exposes a wide clickable hit area for every edge including the closing edge", () => {
  assert.match(leaflet, /regionMode === "editing"[\s\S]{0,1800}latlngs\.length[\s\S]{0,800}\(edgeIndex \+ 1\) % latlngs\.length/u);
  assert.match(leaflet, /const edgeHitArea = L\.polyline\([\s\S]{0,700}weight:\s*(?:1[2-9]|2\d)/u);
  assert.match(leaflet, /const edgeHitArea = L\.polyline\([\s\S]{0,700}opacity:\s*0/u);
  assert.match(leaflet, /const edgeHitArea = L\.polyline\([\s\S]{0,700}interactive:\s*true/u);
  assert.match(leaflet, /onRegionEdgeInsert\?\.\(/u);
});

test("2.8.59 clicking an editable edge inserts a new normalized vertex at the requested position", () => {
  assert.match(view, /onRegionEdgeInsert\(index, point\)[\s\S]{0,500}regionMode !== "editing"/u);
  assert.match(view, /regionDraftPoints\.splice\(index,\s*0,\s*\{\s*x:\s*clamp01\(point\?\.x\),\s*y:\s*clamp01\(point\?\.y\)\s*\}\)/u);
  assert.match(view, /mapController\?\.setRegionDraft\?\.\(regionDraftPoints\)/u);
});

test("2.8.59 existing right-click vertex deletion keeps the three-vertex minimum guard", () => {
  assert.match(view, /onRegionVertexContextMenu\(index\)[\s\S]{0,700}regionDraftPoints\.length <= 3/u);
  assert.match(view, /regionDraftPoints\.splice\(index, 1\)/u);
});
