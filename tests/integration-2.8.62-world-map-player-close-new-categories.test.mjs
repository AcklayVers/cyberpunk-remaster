import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtimeUrl = new URL("../runtime/world-city-map.mjs", import.meta.url);
const view = fs.readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");

test("2.8.62 ships the eight requested Night City point categories with usable icons and colors", async () => {
  const mod = await import(`${runtimeUrl.href}?v2862-categories=${Date.now()}`);
  const required = new Map([
    ["shop", "Магазины"],
    ["night-market", "Ночные рынки"],
    ["technician", "Техники"],
    ["entertainment", "Развлечения"],
    ["education", "Образование"],
    ["public-service", "Госслужбы"],
    ["industry", "Промышленность"],
    ["warehouse", "Склады"],
  ]);

  for (const [id, label] of required) {
    const category = mod.DEFAULT_WORLD_MAP_CATEGORIES.find((entry) => entry.id === id);
    assert.ok(category, `missing default category ${id}`);
    assert.equal(category.label, label);
    assert.match(category.icon, /^fa:fa-[a-z0-9-]+$/u, `${id} needs a Font Awesome icon`);
    assert.match(category.color, /^#[0-9a-f]{6}$/iu, `${id} needs a hex color`);
    assert.ok(mod.WORLD_MAP_ICON_PRESETS.some((preset) => preset.id === id), `${id} needs an icon preset`);
  }
});

test("2.8.62 marker detail card has a close button for players and clears the selected point", () => {
  const detailFn = view.match(/function detailHtml\(marker\) \{[\s\S]*?\n  \}/u)?.[0] ?? "";
  assert.ok(detailFn, "detailHtml should exist");
  assert.match(detailFn, /data-world-map-action="close-detail"/u, "player-visible marker card needs a close button");
  assert.match(detailFn, /\$\{isGM \? '[^']*data-world-map-action="edit-marker"[^']*' : ""\}<button[^>]*data-world-map-action="close-detail"/u, "close button must be outside the GM-only edit control");
  assert.match(view, /action === "close-detail"[\s\S]{0,120}closeMarkerDetail\(\)/u, "close action must invoke the shared close behavior");
  assert.match(view, /function closeMarkerDetail\(\)[\s\S]{0,260}selectedMarkerId = ""[\s\S]{0,260}renderInspector\(\)/u, "shared close behavior must clear the selected marker and rerender the inspector");
});

test("2.8.62 Escape closes an opened point detail card without requiring GM permissions", () => {
  assert.match(view, /host\.addEventListener\("keydown",[\s\S]{0,500}event\.key === "Escape"[\s\S]{0,500}closeMarkerDetail\(\)/u);
  assert.match(view, /function closeMarkerDetail\(\)[\s\S]{0,260}selectedMarkerId = ""[\s\S]{0,260}renderInspector\(\)/u);
});
