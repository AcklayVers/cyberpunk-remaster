import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const view = readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");
const model = readFileSync(new URL("../runtime/world-city-map.mjs", import.meta.url), "utf8");
const leaflet = readFileSync(new URL("../runtime/world-city-map-leaflet.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.8.57 world map regions use v4 world data, Leaflet polygons and GM-only mutations", () => {
  const mapVersion = Number(model.match(/WORLD_CITY_MAP_VERSION\s*=\s*(\d+)/u)?.[1] || 0);
  assert.ok(mapVersion >= 4);
  assert.match(model, /regions,/u);
  assert.match(model, /createWorldMapRegion/u);
  assert.match(model, /updateWorldMapRegion/u);
  assert.match(model, /deleteWorldMapRegion/u);
  assert.match(leaflet, /L\.polygon/u);
  assert.match(leaflet, /worldMapRegions/u);
  assert.match(view, /game\?\.user\?\.isGM/u);
});

test("2.8.57 map context menu supports direct markers, polygon drawing, overlap selection and geometry editing", () => {
  for (const label of [
    "Добавить точку здесь",
    "Нарисовать регион",
    "Редактировать границу",
    "Изменить свойства",
    "На передний план",
    "На задний план",
    "Скрыть",
    "Удалить",
    "Завершить",
    "Отмена",
  ]) assert.match(view, new RegExp(label, "u"));
  assert.match(view, /regionIds/u);
  assert.match(view, /setRegionDrawingMode/u);
  assert.match(view, /setRegionEditMode/u);
  assert.match(view, /setRegionDraft/u);
  assert.match(view, /onRegionVertexMove/u);
  assert.match(view, /onRegionVertexContextMenu/u);
});

test("2.8.57 region UI has sidebar, property editor, tooltip and floating z-index above Leaflet panes", () => {
  for (const selector of [
    ".world-city-map-context-menu",
    ".world-city-map-region-row",
    ".world-city-map-region-editor",
    ".world-city-map-region-tooltip",
    ".world-city-map-region-drawing-controls",
    ".world-city-map-region-vertex",
  ]) assert.ok(css.includes(selector), `${selector} missing`);
  assert.match(css, /world-city-map-context-menu[^}]*z-index:\s*(?:9\d\d|[1-9]\d{3,})/u);
  assert.match(css, /world-city-map-region-tooltip[^}]*pointer-events:\s*none/u);
  assert.match(view, /Регионы/u);
  assert.match(view, /Короткое описание/u);
});
