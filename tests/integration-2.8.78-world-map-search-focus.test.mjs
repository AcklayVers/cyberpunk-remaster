import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.8.78 map search exposes a Find button next to the search input", () => {
  assert.match(view, /data-world-map-search[^>]*placeholder="Поиск по точкам и связям"/u);
  assert.match(view, /data-world-map-action="find-search-marker"/u);
  assert.match(view, />Найти</u);
  assert.match(css, /\.world-city-map-search[\s\S]{0,220}grid-template-columns:[^;]*auto[^;]*1fr[^;]*auto/u);
});

test("2.8.78 map search chooses exact title first and then first partial visible match", () => {
  assert.match(view, /function findVisibleMarkerByQuery\(searchText\)/u);
  assert.match(view, /const markers = visibleMarkers\(\)/u);
  assert.match(view, /const exact = markers\.find\([\s\S]{0,180}normalizedTitle === normalizedQuery/u);
  assert.match(view, /return exact \?\? markers\.find\([\s\S]{0,180}normalizedTitle\.includes\(normalizedQuery\)/u);
});

test("2.8.78 Enter and Find button focus the selected marker with archive focus zoom", () => {
  assert.match(view, /function executeMapSearch\(\)/u);
  assert.match(view, /selectedMarkerId = marker\.id/u);
  assert.match(view, /focusMarkerFromFilter\(marker\.id\)/u);
  assert.match(view, /action === "find-search-marker"[\s\S]{0,120}executeMapSearch\(\)/u);
  assert.match(view, /host\.addEventListener\("keydown"[\s\S]{0,280}data-world-map-search[\s\S]{0,180}event\.key === "Enter"[\s\S]{0,180}executeMapSearch\(\)/u);
});

test("2.8.78 unsuccessful search reports that the point was not found", () => {
  assert.match(view, /Точка не найдена/u);
});
