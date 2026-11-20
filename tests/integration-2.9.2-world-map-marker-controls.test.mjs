import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mapUrl = new URL("../runtime/world-city-map.mjs", import.meta.url);
const viewUrl = new URL("../runtime/world-city-map-view.mjs", import.meta.url);
const viewSource = fs.readFileSync(viewUrl, "utf8");
const cssSource = fs.readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.9.2 shelter uses a Foundry-safe shield icon and migrates the old canonical icon", async () => {
  const mod = await import(`${mapUrl.href}?v292-shelter=${Date.now()}`);
  assert.equal(mod.WORLD_MAP_ICON_PRESETS.find((entry) => entry.id === "shelter")?.icon, "fa:fa-shield");
  assert.equal(mod.DEFAULT_WORLD_MAP_CATEGORIES.find((entry) => entry.id === "shelter")?.icon, "fa:fa-shield");

  const state = mod.normalizeWorldCityMap({
    version: 5,
    categories: [
      { id: "shelter", label: "Убежища", icon: "fa:fa-house-shield", color: "#8ecae6" },
    ],
  });
  assert.equal(state.categories.find((entry) => entry.id === "shelter")?.icon, "fa:fa-shield");
});

test("2.9.2 marker opacity is a per-client live toolbar slider with a 70 percent default", async () => {
  const view = await import(`${viewUrl.href}?v292-opacity=${Date.now()}`);
  assert.equal(view.normalizeWorldMapMarkerOpacity(undefined), 0.7);
  assert.equal(view.normalizeWorldMapMarkerOpacity(0.1), 0.2);
  assert.equal(view.normalizeWorldMapMarkerOpacity(0.55), 0.55);
  assert.equal(view.normalizeWorldMapMarkerOpacity(2), 1);

  assert.match(viewSource, /world-city-map-marker-opacity\.v1/u, "opacity preference must have a client-local storage key");
  assert.match(viewSource, /world-city-map-marker-opacity-control[^>]*>[\s\S]*?<b>Точки<\/b>[\s\S]*?data-world-map-marker-opacity/u, "toolbar control must be clearly labelled Точки");
  assert.match(viewSource, /data-world-map-marker-opacity/u, "toolbar must expose the slider");
  assert.match(viewSource, /min="20" max="100" step="1"/u);
  assert.match(viewSource, /localStorage\?\.setItem/u, "slider preference must be stored locally, not in the shared world map");
  assert.match(viewSource, /--world-map-marker-opacity/u, "slider must update a CSS custom property live");
  assert.match(cssSource, /opacity:var\(--world-map-marker-opacity,\s*\.70\)!important/u, "Leaflet marker opacity must use the per-client CSS variable");
});
