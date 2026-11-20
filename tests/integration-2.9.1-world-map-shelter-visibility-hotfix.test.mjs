import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mapUrl = new URL("../runtime/world-city-map.mjs", import.meta.url);

test("localized legacy shelter categories migrate to the canonical shelter category without losing points", async () => {
  const mod = await import(`${mapUrl.href}?shelter-hotfix=${Date.now()}`);
  const state = mod.normalizeWorldCityMap({
    version: 5,
    categories: [
      { id: "убежище", label: "Убежище", icon: "fa:fa-house-shield", color: "#8ecae6" },
    ],
    markers: [
      { id: "safehouse-1", x: 0.25, y: 0.4, title: "Тихая гавань", categoryId: "убежище" },
    ],
  });

  assert.equal(state.markers.find((marker) => marker.id === "safehouse-1")?.categoryId, "shelter");
  assert.equal(state.categories.some((category) => category.id === "убежище"), false);
  assert.equal(state.categories.filter((category) => category.id === "shelter").length, 1);
  assert.equal(state.categories.find((category) => category.id === "shelter")?.label, "Убежища");
});
