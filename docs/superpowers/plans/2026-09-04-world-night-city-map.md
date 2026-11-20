# World Night City Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single shared interactive Night City map to all three archive modes, including GM POI editing, local category filters, and archive-record links, while also completing contact-origin gig/clue parity requested for 2.8.38.

**Architecture:** Register one hidden world setting for canonical map data, render it through a shared dependency-free image-map controller, and have all three archive controllers delegate their `citymap` section to that controller. Keep archive entry data actor-scoped; marker links reference `{actorId, section, entryId}`. Fix contact-origin record creation by writing `giverId`/`personId` at creation time and add the same contact panels to Cyber/Neo.

**Tech Stack:** Foundry VTT 14 ApplicationV2, SF2e 1.4.0, ES modules, DOM/CSS transform image-map renderer, CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-world-night-city-map-design.md`

## Global Constraints
- One world map shared across Neuro/Cyber/Neo.
- Players may hide categories locally but may not alter canonical map data.
- GM markers are visible by default.
- No artwork copied from nightcity.io is bundled.
- Preserve 2.8.37 clue connections, 2.8.36 FPS fix, 2.8.34 encounter-frequency fix, and Bioware filtering.
- Target Foundry VTT 14.365 and SF2e 1.4.0.

---

### Task 1: Contact-origin gig/clue parity

**Files:**
- Modify: `runtime/neuro-archive-controller.mjs`
- Modify: `runtime/cyber-archive-controller.mjs`
- Modify: `runtime/neo-archive-controller.mjs`
- Modify: `styles/neuro-archive.css`
- Test: `tests/integration-2.8.38-contact-related.test.mjs`

**Interfaces:**
- Produces consistent `add-person-gig` and `add-person-clue` actions in all controllers.
- A newly created quest from a person stores `giverId = person.id`.
- A newly created clue from a person stores `personId = person.id`.

- [x] Write a test that asserts all three controllers contain person-related panels/actions and that Neuro handlers assign the correct relationship field.
- [x] Run the test and verify it fails on 2.8.37.
- [x] Implement shared behavior in all three controllers and fix compact related-record card layout.
- [x] Run the test and verify it passes.

### Task 2: World map data service

**Files:**
- Create: `runtime/world-city-map.mjs`
- Modify: `runtime/neuro-archive-runtime.mjs`
- Test: `tests/world-city-map.test.mjs`

**Interfaces:**
- `registerWorldCityMapSetting()`
- `getWorldCityMap()` -> normalized state
- `updateWorldCityMap(mutator)` -> Promise<state>, GM only
- `createWorldMapMarker(input)` / `updateWorldMapMarker(id, patch)` / `deleteWorldMapMarker(id)`
- `WORLD_CITY_MAP_HOOK`

- [x] Write failing unit tests for normalization, permissions, marker CRUD, normalized coordinates, and serialization.
- [x] Run tests and verify failure.
- [x] Implement the service and register the setting during `init`.
- [x] Run tests and verify pass.

### Task 3: Shared interactive map renderer

**Files:**
- Create: `runtime/world-city-map-view.mjs`
- Create: `styles/world-city-map.css`
- Modify: `module.json`
- Test: `tests/world-city-map-view.test.mjs`

**Interfaces:**
- `renderWorldCityMap(host, context)` returns controller with `destroy()` and `refresh()`.
- `context.openArchiveLink(link)` opens the linked record.
- `context.pickImage(current, callback)` invokes the existing Foundry file picker helper from each controller.

- [x] Add failing static/runtime tests proving there is no animation/ticker loop and that category/search filtering is event-driven.
- [x] Implement a dependency-free image overlay with pan/zoom, markers, search, category toggles, GM placement/edit/delete/drag, and marker popups.
- [x] Add CSS and module style registration.
- [x] Run renderer tests and syntax checks.

### Task 4: Integrate one map into all archive modes

**Files:**
- Modify: `runtime/neuro-archive-controller.mjs`
- Modify: `runtime/cyber-archive-controller.mjs`
- Modify: `runtime/neo-archive-controller.mjs`
- Modify: `runtime/neuro-archive-runtime.mjs`
- Test: `tests/integration-2.8.38-world-map.test.mjs`

**Interfaces:**
- Each controller exposes `openLinkedArchiveRecord({actorId, section, entryId})` semantics through its existing selected actor/section/detail state.
- Each controller mounts shared map UI when `state.section === "citymap"` and destroys it on section change/controller destroy.

- [x] Write failing integration tests for nav visibility in all modes and removal of actor-local map text/controls.
- [x] Implement the shared mount/unmount path and record-open callbacks.
- [x] Preserve legacy image migration into the world map when no world image exists.
- [x] Run integration tests.

### Task 5: Record-to-map linking

**Files:**
- Modify: `runtime/world-city-map.mjs`
- Modify: `runtime/neuro-archive-controller.mjs`
- Modify: `runtime/cyber-archive-controller.mjs`
- Modify: `runtime/neo-archive-controller.mjs`
- Test: `tests/integration-2.8.38-map-links.test.mjs`

**Interfaces:**
- `markersForArchiveEntry({actorId, section, entryId})` returns linked marker summaries.
- `linkMarkerToArchiveEntry(markerId, link)` and `unlinkMarkerFromArchiveEntry(markerId, link)` are GM-only.

- [x] Write failing tests for linking/unlinking and linked marker display in people/quests/clues/locations.
- [x] Add `Точки на карте` panels and link controls in all three controllers.
- [x] Add `Открыть на карте` action that switches to citymap and focuses the marker.
- [x] Run tests.

### Task 6: Versioning, regression, packaging

**Files:**
- Modify: `module.json`
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`

**Interfaces:**
- Module version `2.8.38`.

- [x] Update version/docs.
- [ ] Run `node --test tests/*.test.mjs` excluding only the known `classic-level`-dependent build-pipeline test if the dependency is unavailable.
- [ ] Run `node --check` on all changed `.mjs` files.
- [ ] Run `npm run audit:pkt`.
- [ ] Verify ZIP integrity and module version after packaging.
