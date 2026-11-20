import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.8.60 Regions section is independently collapsible and remembers its state", () => {
  assert.match(view, /REGION_PANEL_COLLAPSED_KEY/u);
  assert.match(view, /data-world-map-regions-panel/u);
  assert.match(view, /data-world-map-action="toggle-regions-panel"/u);
  assert.match(view, /data-world-map-regions-chevron/u);
  assert.match(view, /regionsPanelCollapsed/u);
  assert.match(view, /saveClientFlag\(REGION_PANEL_COLLAPSED_KEY,\s*regionsPanelCollapsed\)/u);
  assert.match(css, /world-city-map-regions-panel\.collapsed[^}]*world-city-map-regions/u);
});

test("2.8.60 Points of Interest and Regions share a bounded vertical scroll area above GM CONTROL", () => {
  assert.match(view, /data-world-map-sidebar-scroll/u);
  assert.match(view, /class="world-city-map-sidebar-scroll"[\s\S]*world-city-map-interest-panel[\s\S]*world-city-map-regions-panel[\s\S]*<\/div>[\s\S]*world-city-map-gm/u);
  assert.match(css, /\.world-city-map-sidebar\{[^}]*overflow:hidden/u);
  assert.match(css, /\.world-city-map-sidebar-scroll\{[^}]*min-height:0[^}]*overflow-y:auto/u);
  assert.match(css, /\.world-city-map-gm\{[^}]*margin-top:0/u);
});

test("2.8.60 region rows expose only one visibility checkbox and let name plus description wrap fully", () => {
  const regionRowTemplate = view.match(/function renderRegions\(\)[\s\S]*?regionsEl\.innerHTML = regions\.length \? regions\.map\(\(region\) => \{([\s\S]*?)\}\)\.join\(""\)/u)?.[1] ?? "";
  assert.ok(regionRowTemplate, "renderRegions row template should be present");
  assert.match(regionRowTemplate, /data-world-map-toggle-region/u);
  assert.doesNotMatch(regionRowTemplate, /data-world-map-global-toggle-region/u);
  assert.match(css, /\.world-city-map-region-focus b,\.world-city-map-region-focus small\{[^}]*white-space:normal[^}]*overflow:visible/u);
  assert.doesNotMatch(css, /\.world-city-map-region-focus b,\.world-city-map-region-focus small\{[^}]*text-overflow:ellipsis/u);
});
