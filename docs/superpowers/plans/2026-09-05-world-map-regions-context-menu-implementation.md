# World Map Regions & Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Добавить на общую карту Найт-Сити GM-контекстное меню по ПКМ и общие редактируемые регионы-полигоны, не ломая текущие точки, личные связи, zoom/pan и адаптивный UI.

**Architecture:** Состояние `worldCityMap` поднимается с v3 до v4 и получает отдельный массив `regions`. Leaflet-адаптер получает отдельный pane/layer для `L.polygon`, API рисования/редактирования и hit-testing перекрывающихся регионов. View хранит только временные drawing/edit drafts, локальную видимость и floating UI; все world writes идут через GM-only CRUD в `world-city-map.mjs`.

**Tech Stack:** Foundry VTT 14, ES modules, Node `node:test`, Leaflet 1.6.0 с `CRS.Simple`, CSS.

**Spec:** `docs/superpowers/specs/2026-09-05-world-map-regions-context-menu-design.md`

## Global Constraints

- Общие регионы создаёт/редактирует/удаляет только GM; игроки их видят и могут только локально скрывать.
- Координаты регионов хранятся нормализованными `0..1`.
- Регионы рендерятся ниже точек карты и выше тайлов.
- Пересечения регионов разрешены; выбор идёт по `zOrder`.
- Существующие markers/categories/personal User flags/tile pyramid не меняются.
- v3 данные мигрируют в v4 без потери точек.
- Floating UI остаётся выше Leaflet panes.
- В этой рабочей копии нет Git repository, поэтому шаги commit заменяются проверкой diff/файлов.

---

### Task 1: World Map v4 Region Model and GM CRUD

**Files:**
- Modify: `runtime/world-city-map.mjs`
- Test: `tests/world-city-map.test.mjs`

**Interfaces:**
- Produces: `WORLD_CITY_MAP_VERSION = 4`.
- Produces: `normalizeWorldMapRegion(raw, fallbackId?)` (exported for focused tests).
- Produces: `createWorldMapRegion(data)`, `updateWorldMapRegion(id, patch)`, `deleteWorldMapRegion(id)`, `moveWorldMapRegionToFront(id)`, `moveWorldMapRegionToBack(id)`.
- Produces normalized `state.regions: Region[]`.

- [x] **Step 1: Write failing v3→v4 migration/normalization tests**

```js
const migrated = mod.normalizeWorldCityMap({
  version: 3,
  markers: [{ id: "m1", x: 0.2, y: 0.3, title: "Keep", categoryId: "poi" }],
});
assert.equal(mod.WORLD_CITY_MAP_VERSION, 4);
assert.equal(migrated.version, 4);
assert.deepEqual(migrated.regions, []);
assert.equal(migrated.markers[0].id, "m1");

const region = mod.normalizeWorldMapRegion({
  id: "r1",
  name: "Zone",
  color: "#ABC",
  fillOpacity: 5,
  borderOpacity: -1,
  borderWidth: 99,
  points: [{ x: -1, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 2, y: 2 }],
});
assert.equal(region.color, "#aabbcc");
assert.equal(region.fillOpacity, 1);
assert.equal(region.borderOpacity, 0);
assert.equal(region.borderWidth, 8);
assert.deepEqual(region.points, [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]);
```

- [x] **Step 2: Run focused test and verify RED**

Run: `node --test tests/world-city-map.test.mjs`
Expected: FAIL because v4/region API is absent.

- [x] **Step 3: Implement region normalization and migration**

Add helpers equivalent to:

```js
function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
}

export function normalizeWorldMapRegion(raw = {}, fallbackId = "") {
  const unique = [];
  for (const candidate of Array.isArray(raw?.points) ? raw.points : []) {
    const point = { x: clamp01(candidate?.x), y: clamp01(candidate?.y) };
    if (!unique.some((item) => item.x === point.x && item.y === point.y)) unique.push(point);
  }
  if (unique.length < 3) return null;
  return {
    id: text(raw?.id, fallbackId) || uid("region"),
    name: text(raw?.name, "Новый регион") || "Новый регион",
    description: text(raw?.description),
    color: normalizeHexColor(raw?.color, "#ef233c"),
    fillOpacity: clamp(raw?.fillOpacity, 0, 1, 0.22),
    borderOpacity: clamp(raw?.borderOpacity, 0, 1, 0.9),
    borderWidth: clamp(raw?.borderWidth, 1, 8, 2),
    visible: raw?.visible !== false,
    zOrder: Number.isFinite(Number(raw?.zOrder)) ? Number(raw.zOrder) : 0,
    points: unique,
    createdAt: text(raw?.createdAt, now()),
    updatedAt: text(raw?.updatedAt, now()),
  };
}
```

Normalize `raw.regions`, de-duplicate ids, sort nothing in persisted data, and return `regions` in `normalizeWorldCityMap()`.

- [x] **Step 4: Write failing GM CRUD/reorder/player-permission tests**

```js
const created = await mod.createWorldMapRegion({
  name: "A",
  points: [{x:0.1,y:0.1},{x:0.2,y:0.1},{x:0.2,y:0.2}],
});
assert.equal(mod.getWorldCityMap().regions.length, 1);
await mod.updateWorldMapRegion(created.id, { name: "B", fillOpacity: 0.5 });
assert.equal(mod.getWorldCityMap().regions[0].name, "B");
const other = await mod.createWorldMapRegion({ name: "C", points: [...] });
await mod.moveWorldMapRegionToBack(other.id);
assert.ok(mod.getWorldCityMap().regions.find(r => r.id === other.id).zOrder < mod.getWorldCityMap().regions.find(r => r.id === created.id).zOrder);
globalThis.game.user.isGM = false;
await assert.rejects(() => mod.deleteWorldMapRegion(created.id), /GM/u);
```

- [x] **Step 5: Implement CRUD/reorder through `updateWorldCityMap()`**

New region z-order uses `max(existing.zOrder)+1`; front/back only update the target region with `max+1` / `min-1`. Preserve `id` and `createdAt` during updates. Invalid patches that would produce fewer than 3 points must throw `Регион должен содержать минимум 3 вершины.`.

- [x] **Step 6: Run model tests GREEN**

Run: `node --test tests/world-city-map.test.mjs tests/world-city-map-v3-background.test.mjs`
Expected: PASS.

---

### Task 2: Leaflet Region Layer, Hit Testing, Drawing and Geometry Handles

**Files:**
- Modify: `runtime/world-city-map-leaflet.mjs`
- Test: `tests/world-city-map-leaflet.test.mjs`

**Interfaces:**
- Consumes: normalized Region shape from Task 1.
- Produces controller methods: `setRegions(regions)`, `focusRegion(id)`, `setRegionDrawingMode(enabled, points?)`, `setRegionEditMode(regionId, points?)`, `setRegionDraft(points)`, `clearRegionDraft()`, `regionsAtLatLng(latlng)`.
- Emits callbacks: `onMapContextMenu(point,event,regionIds)`, `onRegionClick(id)`, `onRegionContextMenu(id,point,event)`, `onRegionDraftPoint(point,event)`, `onRegionDraftFinish(points,event)`, `onRegionVertexMove(index,point)`, `onRegionVertexContextMenu(index,event)`.

- [x] **Step 1: Add failing source/behavior tests for panes and API**

Assert the adapter creates panes `worldMapRegions`, `worldMapRegionHandles`, with z-index below marker pane, and exposes `setRegions`/`regionsAtLatLng`. Add a pure exported helper:

```js
export function sortWorldMapRegionsForHit(regions = []) {
  return [...regions].sort((a,b) => Number(b?.zOrder||0)-Number(a?.zOrder||0) || String(b?.createdAt||"").localeCompare(String(a?.createdAt||"")) || String(b?.id||"").localeCompare(String(a?.id||"")));
}
```

- [x] **Step 2: Run focused Leaflet tests RED**

Run: `node --test tests/world-city-map-leaflet.test.mjs`
Expected: FAIL on missing panes/API/helper.

- [x] **Step 3: Implement region pane and `setRegions()`**

Create panes after map construction:

```js
map.createPane("worldMapRegions");
map.getPane("worldMapRegions").style.zIndex = "350";
map.createPane("worldMapRegionHandles");
map.getPane("worldMapRegionHandles").style.zIndex = "550";
```

Render each visible region using `L.polygon(region.points.map(p => normalizedToLeafletLatLng(p, manifest)), { pane:"worldMapRegions", color:region.color, opacity:region.borderOpacity, weight:region.borderWidth, fillColor:region.color, fillOpacity:region.fillOpacity, interactive:true })`. Keep `regionObjects`/`regionDataObjects` maps; call `bringToFront()` in ascending `zOrder` order so final visual order is stable.

- [x] **Step 4: Implement hit testing and tooltip/callback wiring**

Use Leaflet `polygon.getBounds().contains(latlng)` as a coarse filter and a point-in-polygon helper on normalized coordinates for exact hit. Return matching IDs in descending zOrder. Bind `mouseover`/`mouseout` through callbacks or tooltip text while keeping markers in higher pane.

- [x] **Step 5: Implement draft drawing and edit handles**

Maintain separate `draftLayer` and `handleLayer`; in drawing mode map click emits draft point, double-click prevents default zoom and emits finish when draft has >=3 points. Edit handles use draggable `L.marker`/`L.circleMarker` in `worldMapRegionHandles`; drag emits normalized point, contextmenu emits index. `clearRegionDraft()` removes all temp layers/handlers without changing world data.

- [x] **Step 6: Run Leaflet tests GREEN**

Run: `node --test tests/world-city-map-leaflet.test.mjs`
Expected: PASS.

---

### Task 3: View Context Menu, Region Sidebar, Drawing Flow and Editors

**Files:**
- Modify: `runtime/world-city-map-view.mjs`
- Test: `tests/world-city-map-view.test.mjs`
- Create: `tests/integration-2.8.57-world-map-regions-context.test.mjs`

**Interfaces:**
- Consumes Task 1 CRUD and Task 2 controller APIs.
- Produces localStorage key `cyberpunk-remaster.world-city-map-hidden-regions.v1`.
- Produces UI states `regionMode: "idle"|"drawing"|"editing"`, `selectedRegionId`, `regionDraftPoints`, `regionEditorMode`, `contextMenuState`.

- [x] **Step 1: Write failing source-level regression tests for GM/player context menu and region UI**

Tests must assert Russian labels exist and are gated by `isGM`, including `Добавить точку здесь`, `Нарисовать регион`, `Редактировать границу`, `Изменить свойства`, `На передний план`, `На задний план`, `Скрыть`, `Удалить`, `Регионы`, plus region fields `Название`, `Короткое описание`, fill/border opacity and width.

- [x] **Step 2: Run view tests RED**

Run: `node --test tests/world-city-map-view.test.mjs tests/integration-2.8.57-world-map-regions-context.test.mjs`
Expected: FAIL.

- [x] **Step 3: Add region state/local visibility helpers and sidebar render**

Add `HIDDEN_REGIONS_KEY`, read/save Set helpers, `renderRegions()` and a `<section class="world-city-map-regions" data-world-map-regions>` in the sidebar. Player rows expose focus/local visibility only. GM rows additionally expose edit/delete buttons.

- [x] **Step 4: Add floating context menu**

Add a sibling `<div class="world-city-map-context-menu" data-world-map-context-menu hidden></div>` above Leaflet. In controller `onMapContextMenu`, suppress browser menu in viewport; for GM empty map show create actions, for overlapping region IDs show region chooser, then action menu. Player context menu never contains write actions.

- [x] **Step 5: Implement “Добавить точку здесь” without placement mode**

Store right-click normalized point in `contextMenuState`. Calling action creates `createWorldMapMarker({x,y,title:"Новая точка",categoryId:selectedCategoryId})`, sets `selectedMarkerId` + `editorMarkerId`, and opens current marker editor immediately.

- [x] **Step 6: Implement region drawing state machine**

`start-region-drawing` clears marker placement mode, initializes empty draft, enables Leaflet drawing mode, changes toolbar mode text, and shows explicit `Завершить` / `Отмена` controls. Each callback adds a point and updates draft. Finish validates >=3 points then opens region property editor with unsaved draft. Cancel destroys draft only.

- [x] **Step 7: Implement region property editor and save/cancel**

Editor fields use `data-world-map-region-field`. Save validates non-empty `name` and >=3 points, converts percentages to 0..1, calls create or update API once, then exits mode. Update failure keeps draft/editor open and displays Foundry notification.

- [x] **Step 8: Implement geometry editing and vertex deletion**

`Редактировать границу` clones current points into draft and enables edit handles. Drag callbacks mutate local draft only. Vertex context menu allows delete only if >3. Save calls `updateWorldMapRegion(id,{points:draft})`; cancel restores original world geometry by discarding draft.

- [x] **Step 9: Implement focus/hide/reorder/delete/overlap selection/tooltip**

Focus calls controller `focusRegion`. Local hide only updates localStorage. GM global hide uses `updateWorldMapRegion(id,{visible:false/true})`. Reorder uses Task 1 functions. Delete uses confirm. Tooltip HTML is escaped name + optional short description and must not intercept pointer events.

- [x] **Step 10: Run view/integration tests GREEN**

Run: `node --test tests/world-city-map-view.test.mjs tests/integration-2.8.57-world-map-regions-context.test.mjs`
Expected: PASS.

---

### Task 4: Region and Context Menu Styling

**Files:**
- Modify: `styles/world-city-map.css`
- Test: `tests/integration-2.8.57-world-map-regions-context.test.mjs`

**Interfaces:**
- Consumes classes/data attrs created in Task 3.

- [x] **Step 1: Extend failing integration assertions for CSS selectors/z-index**

Assert selectors exist for `.world-city-map-context-menu`, `.world-city-map-region-row`, `.world-city-map-region-editor`, `.world-city-map-region-tooltip`, `.world-city-map-region-drawing-controls`, `.world-city-map-region-vertex` and that floating menu/editor z-index is >700.

- [x] **Step 2: Run integration test RED**

Run: `node --test tests/integration-2.8.57-world-map-regions-context.test.mjs`
Expected: FAIL on missing styles.

- [x] **Step 3: Add scoped CSS**

Use only `.world-city-map-*` selectors. Context menu/editor/tooltip use `z-index: 950+`; tooltip has `pointer-events:none`; region list uses swatch + name + controls; drawing mode gives visible status bar and crosshair; vertex handles are compact, high-contrast circles. Preserve current sidebar-collapse and 680px responsive rules.

- [x] **Step 4: Run integration test GREEN**

Run: `node --test tests/integration-2.8.57-world-map-regions-context.test.mjs`
Expected: PASS.

---

### Task 5: Metadata, Full Regression Verification and Archive

**Files:**
- Modify: `module.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Release version: `2.8.57`.

- [x] **Step 1: Update release metadata**

Set both manifests/package to `2.8.57`, README version to `2.8.57`, add changelog entry describing right-click marker creation and GM world regions.

- [x] **Step 2: Run syntax checks for changed JS**

Run:
```bash
node --check runtime/world-city-map.mjs
node --check runtime/world-city-map-leaflet.mjs
node --check runtime/world-city-map-view.mjs
```
Expected: all exit 0.

- [x] **Step 3: Run all functional tests excluding the known environment-only build-pipeline dependency**

Run:
```bash
files=$(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'build-pipeline.test.mjs' -print | sort)
node --test $files
```
Expected: 0 failures.

- [x] **Step 4: Run full suite once and record known `classic-level` status**

Run: `node --test tests/*.test.mjs`
Expected: only `tests/build-pipeline.test.mjs` may fail with missing `classic-level 3.0.0`; no functional region/map failures.

- [x] **Step 5: Package and verify ZIP**

Create `/mnt/data/cyberpunk-remaster-v2.8.57.zip` with module contents at archive root, excluding transient development artifacts if prior release packaging does so. Run `unzip -t /mnt/data/cyberpunk-remaster-v2.8.57.zip` and require exit 0.

- [x] **Step 6: Review changed files against acceptance criteria**

Verify all 12 acceptance criteria from the spec map to passing tests or direct source checks. Since no Git repo exists, use `find`, `grep`, and test output instead of a commit/diff gate.
