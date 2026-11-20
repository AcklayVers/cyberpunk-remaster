# Leaflet Tiled World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom single-image Night City renderer with a local Leaflet 1.9.4 CRS.Simple tiled renderer while preserving all existing world-map data, filters, links, and normalized POI coordinates.

**Architecture:** Keep `runtime/world-city-map.mjs` as the world-level state/model and add a focused `runtime/world-city-map-leaflet.mjs` adapter that owns Leaflet loading, CRS.Simple coordinate conversion, tile/image layers, markers, map events, and teardown. `runtime/world-city-map-view.mjs` remains responsible for sidebar/filter/editor UI and delegates map rendering and interaction to the Leaflet adapter. Built-in Night City tiles are generated from the user-provided 1325×2048 atlas at native zoom 2 using 256×256 WebP tiles; custom GM images remain supported through Leaflet imageOverlay.

**Tech Stack:** Foundry VTT 14, JavaScript ES modules, Leaflet 1.9.4 (vendored locally, BSD-2-Clause), CSS, Pillow-generated WebP tile pyramid, Node test runner.

**Spec:** Approved in chat on 2026-09-04: variant 2, real Leaflet, local assets, CRS.Simple, tiled built-in atlas, normalized POI migration, fixed-size markers, tooltip/click/GM drag, shared Neuro/Cyber/Neo map.

## Global Constraints

- Runtime must not depend on CDN or internet access.
- Existing `x`/`y` marker coordinates in `[0,1]` must remain valid without data loss.
- Existing categories, colors, icons, filters, archive links, per-point visibility, and GM controls must remain available.
- Leaflet teardown must not leave timers/listeners after archive rerender or close.
- Built-in tile source is the uploaded `Night City 2045 Atlas w District Names.jpg`.
- Tile size is 256×256; native pyramid levels are z0, z1, z2 with z2 at source resolution.
- Extra visual zoom may scale z2 but must not claim additional source detail.
- No permanent requestAnimationFrame/Ticker/polling loop may be introduced.

---

### Task 1: Vendor Leaflet and tile assets

**Files:**
- Create: `vendor/leaflet/leaflet.js`
- Create: `vendor/leaflet/leaflet.css`
- Create: `vendor/leaflet/LICENSE.txt`
- Create: `assets/maps/night-city-2045/manifest.json`
- Create: `assets/maps/night-city-2045/tiles/z0/*.webp`
- Create: `assets/maps/night-city-2045/tiles/z1/*.webp`
- Create: `assets/maps/night-city-2045/tiles/z2/*.webp`
- Modify: `module.json`
- Test: `tests/integration-2.8.44-leaflet-map.test.mjs`

**Interfaces:**
- Produces local global `L` version 1.9.4 and a tile manifest with `width`, `height`, `tileSize`, `minNativeZoom`, `maxNativeZoom`, and URL template.

- [ ] Write a failing integration test requiring local Leaflet 1.9.4, CSS registration, manifest, and expected tile counts.
- [ ] Run the test and confirm it fails because vendor/tile assets do not exist.
- [ ] Vendor official Leaflet 1.9.4 JS/CSS/license locally and register CSS in `module.json`.
- [ ] Generate z0/z1/z2 WebP tile pyramid from the uploaded atlas and write manifest.
- [ ] Run the test and confirm it passes.

### Task 2: Leaflet CRS.Simple adapter

**Files:**
- Create: `runtime/world-city-map-leaflet.mjs`
- Test: `tests/integration-2.8.44-leaflet-map.test.mjs`

**Interfaces:**
- Produces `loadWorldCityLeaflet()`, `createWorldCityLeafletMap(container, options)`, `normalizedToLatLng(map, point, manifest)`, `latLngToNormalized(map, latlng, manifest)` and a controller object with `setMarkers`, `setPlacementMode`, `focusMarker`, `fit`, `zoomIn`, `zoomOut`, `destroy`.

- [ ] Add failing tests for CRS.Simple, tileLayer, normalized conversion, divIcon marker, tooltip, click, dragend, map click, and teardown.
- [ ] Implement dynamic local Leaflet loader and map adapter.
- [ ] Run adapter tests and confirm they pass.

### Task 3: Move map view from custom transform renderer to Leaflet

**Files:**
- Modify: `runtime/world-city-map-view.mjs`
- Modify: `styles/world-city-map.css`
- Test: `tests/world-city-map-view.test.mjs`
- Test: `tests/integration-2.8.44-leaflet-map.test.mjs`

**Interfaces:**
- Consumes Leaflet adapter from Task 2.
- Keeps existing sidebar/filter/icon-picker/editor/inspector functions and world data APIs.

- [ ] Add failing tests proving custom scene transform/pointer-pan renderer is no longer active and Leaflet adapter is used.
- [ ] Replace map scene/image/marker layer with a Leaflet host div while preserving sidebar and inspector UI.
- [ ] Route zoom, fit, point placement, marker click/drag, filter rerender, and focus from sidebar through the adapter.
- [ ] Add Leaflet-specific CSS for cyberpunk markers/tooltips without overriding Leaflet transforms.
- [ ] Run view and integration tests.

### Task 4: World-state migration and custom-image fallback

**Files:**
- Modify: `runtime/world-city-map.mjs`
- Test: `tests/world-city-map.test.mjs`
- Test: `tests/integration-2.8.44-leaflet-map.test.mjs`

**Interfaces:**
- World map state version 3 adds `tileset: "night-city-2045"`; normalized POI coordinates are unchanged.
- Non-empty legacy `image` remains a custom Leaflet imageOverlay; clearing custom image returns to the built-in tileset.

- [ ] Add failing migration tests for v2→v3 and unchanged marker coordinates/categories/links.
- [ ] Implement migration/default tileset metadata while preserving custom images.
- [ ] Run model and integration tests.

### Task 5: Regression, versioning, and packaging

**Files:**
- Modify: `module.json`
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md` if map notes exist there.

**Interfaces:**
- Produces Cyberpunk Remaster 2.8.44 ZIP.

- [ ] Bump module/package versions to 2.8.44 and document the Leaflet renderer migration.
- [ ] Run syntax checks on all modified/new MJS files.
- [ ] Run all available tests excluding only the known `classic-level`-blocked build-pipeline test if the dependency is still absent.
- [ ] Run PKT audit.
- [ ] Validate tile files and ZIP integrity.
- [ ] Package `/mnt/data/cyberpunk-remaster-v2.8.44-leaflet-tiled-map.zip`.
