# Personal Map Links and Marker Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove nine unwanted default map categories, migrate their existing points to «Интерес», add per-user/per-Actor personal archive-to-map associations for players, and scale Leaflet markers with zoom.

**Architecture:** Keep the shared world map and GM-owned `marker.links` unchanged as the authoritative map layer. Add a separate user-flag service for player-owned associations keyed by Actor ID; archive controllers read/write that service for non-GM users while GM behavior remains shared-world based. Marker scaling is isolated in the Leaflet adapter and driven by `zoomend`.

**Tech Stack:** Foundry VTT 14, ES modules, Leaflet 1.6.0, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-04-personal-map-links-and-marker-scaling-design.md`

## Global Constraints

- Foundry VTT 14.360+; tested target 14.365.
- SF2e 1.4.0+.
- Players may only associate archive records with existing GM-created points; they may not create, move, edit, recolor, recategorize, or delete map points.
- Personal associations are stored on `game.user` in `flags.cyberpunk-remaster.worldCityMapPersonalLinksV1`, partitioned by Actor ID.
- Shared GM associations continue to use `marker.links` in the world map setting.
- Existing points in removed categories must be preserved and migrated to `poi`.
- Existing high-resolution PDF tile pyramid must not be altered.

---

### Task 1: Remove unwanted default categories and migrate legacy points

**Files:**
- Modify: `runtime/world-city-map.mjs`
- Test: `tests/world-city-map.test.mjs`

**Interfaces:**
- Produces: exported removed-category set or helper used by normalization.
- Preserves: marker IDs, coordinates, text, icon/color overrides, timestamps, and shared links.

- [ ] Write tests proving removed categories are absent and old markers migrate to `poi` without data loss.
- [ ] Run those tests and confirm RED.
- [ ] Implement removed-category filtering/migration in normalization.
- [ ] Run `tests/world-city-map.test.mjs` and confirm GREEN.

### Task 2: Add personal user-link storage service

**Files:**
- Create: `runtime/world-city-map-user-links.mjs`
- Create: `tests/world-city-map-user-links.test.mjs`

**Interfaces:**
- Produces: `getPersonalWorldMapLinks(actorId)`, `personalLinksForArchiveEntry({actorId, section, entryId})`, `personalLinksForMarker({actorId, markerId})`, `addPersonalWorldMapLink({actorId, section, entryId, markerId})`, `removePersonalWorldMapLink({...})`.
- Consumes: `getWorldCityMap()` for marker existence validation.

- [ ] Write tests for persistence, Actor isolation, deduplication, stale marker filtering, ownership checks, and no world-map mutation.
- [ ] Run tests and confirm RED.
- [ ] Implement the service with normalized v1 flag payload and `game.user.setFlag` writes.
- [ ] Run personal-link tests and confirm GREEN.

### Task 3: Scale Leaflet markers with zoom

**Files:**
- Modify: `runtime/world-city-map-leaflet.mjs`
- Modify: `styles/world-city-map.css`
- Test: `tests/world-city-map-leaflet.test.mjs`
- Test: `tests/integration-2.8.51-personal-map-links.test.mjs`

**Interfaces:**
- Produces: `worldCityMarkerSizeForZoom(zoom)` returning 24/30/36/42/48 px tiers.
- Internal: marker icon rebuild on `zoomend` without changing marker LatLng.

- [ ] Write size-function and zoomend tests and confirm RED.
- [ ] Implement deterministic icon sizing and proportional nested glyph sizing.
- [ ] Run Leaflet/map tests and confirm GREEN.

### Task 4: Integrate personal links into all archive controllers

**Files:**
- Modify: `runtime/neuro-archive-controller.mjs`
- Modify: `runtime/cyber-archive-controller.mjs`
- Modify: `runtime/neo-archive-controller.mjs`
- Test: `tests/integration-2.8.38-map-links.test.mjs`
- Test: `tests/integration-2.8.51-personal-map-links.test.mjs`

**Interfaces:**
- Consumes personal-link service from Task 2.
- GM path remains `linkMarkerToArchiveEntry` / `unlinkMarkerFromArchiveEntry`.
- Player path writes/removes only personal User-flag links for active Actor.

- [ ] Write controller integration assertions for player controls and GM preservation; confirm RED.
- [ ] Add imports and shared/personal row rendering in each controller.
- [ ] Add player add/remove handlers without exposing map-edit actions.
- [ ] Run controller integration tests and confirm GREEN.

### Task 5: Show personal knowledge in map marker detail

**Files:**
- Modify: `runtime/world-city-map-view.mjs`
- Test: `tests/world-city-map-view.test.mjs`
- Test: `tests/integration-2.8.51-personal-map-links.test.mjs`

**Interfaces:**
- `renderWorldCityMap` receives active Actor context from archive controllers.
- Reads personal marker links for that Actor only and merges them with shared marker links for display, deduplicated by archive record key.

- [ ] Write tests for Actor-scoped personal detail links and deduplication; confirm RED.
- [ ] Add context plumbing and merged read-only detail rows.
- [ ] Run map-view tests and confirm GREEN.

### Task 6: Version, docs, regression verification, package

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `module.json`
- Modify: `package.json`

- [ ] Bump version to 2.8.51 and document category migration, player personal links, and marker scaling.
- [ ] Run all map/archive targeted tests.
- [ ] Run full `node --test tests/*.test.mjs`; record only environment-known `classic-level` failure if still present.
- [ ] Verify ZIP integrity and produce downloadable module archive.
