import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const view = readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");
const leaflet = readFileSync(new URL("../runtime/world-city-map-leaflet.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.8.58 sidebar separates collapsible Points of Interest from Regions", () => {
  assert.match(view, /Точки интереса/u);
  assert.match(view, /data-world-map-interest-panel/u);
  assert.match(view, /data-world-map-action="toggle-interest-panel"/u);
  assert.match(view, /data-world-map-interest-body/u);
  assert.match(view, /<b>Регионы<\/b>/u);
  assert.match(view, /interestPanelCollapsed/u);
  assert.match(css, /world-city-map-interest-panel\.collapsed[^}]*world-city-map-interest-body/u);
});

test("2.8.58 drawing a region renders visible vertex markers immediately", () => {
  assert.match(leaflet, /regionMode === "drawing" \|\| regionMode === "editing"/u);
  assert.match(leaflet, /regionVertexIcon\(L, index, \{\s*first:\s*index === 0,\s*draggable:\s*regionMode === "editing"/u);
  assert.match(css, /world-city-map-region-vertex\.first/u);
  assert.match(css, /world-city-map-region-vertex\.drawing/u);
});
