import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("city tools expose only clock and district encounters; all map route entrypoints are removed", async () => {
  const tools = await import("../runtime/world-city-map-tools.mjs").catch(
    () => null,
  );
  assert.ok(tools, "independent city tools must exist");
  const html = tools.worldMapToolsPanelHtml({
    isGM: true,
    state: { regions: [] },
    tab: "encounter",
    filters: {},
  });
  assert.match(html, /data-city-encounter-kind/u);
  assert.doesNotMatch(html, /Маршрут|Дороги|Поездк|Рассчитать|Отправиться/u);
  const template = await readFile(
    new URL("../templates/world-city-map.hbs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(template, /data-city-open-tools="route"/u);
  const { normalizeWorldCityMap } =
    await import("../runtime/world-city-map.mjs");
  const state = normalizeWorldCityMap({
    markers: [{ id: "a", x: 0.3, y: 0.4 }],
    roadNetwork: { nodes: [], edges: [] },
    roadNetworks: { old: {} },
    publishedRoute: {},
    travelConfig: { widthKm: 20 },
    clock: { anchorDate: "2045-07-14T20:00:00Z", anchorWorldTime: 0 },
  });
  assert.equal(state.markers.length, 1);
  assert.ok(state.clock);
  for (const key of [
    "roadNetwork",
    "roadNetworks",
    "publishedRoute",
    "travelConfig",
  ])
    assert.equal(key in state, false);
});
