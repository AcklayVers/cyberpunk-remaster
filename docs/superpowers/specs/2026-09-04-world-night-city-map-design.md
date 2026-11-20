# World Night City Map Design

## Goal
Add one shared interactive Night City map for the Foundry world, opened from Neuro Archive, Cyber Archive, and Neo Archive, with GM-authored points of interest, per-client category visibility, and links between markers and archive records.

## Scope
- One world-level map state shared by all actors and all three archive themes.
- Players can pan/zoom, search, inspect markers, and hide/show categories locally.
- GM can select the base map image, create/edit/move/delete markers, and manage categories.
- Markers are visible to players by default. Hiding a category is a local display preference, matching the nightcity.io interaction model.
- A marker can link to any number of archive records: contacts, gigs/quests, clues, and locations. Clicking a link opens that record in the current archive mode.
- Existing actor-local cityMap data remains readable only for migration; the new interactive map uses world data.
- The implementation must not embed or redistribute artwork from nightcity.io without a clear redistribution license. The module ships with no copied map artwork and lets the GM choose an image from Foundry storage.

## UX
### Map view
- New `Карта Найт-Сити` navigation entry in all three archives.
- Full map canvas with mouse/touch pan and wheel zoom.
- Search box filters marker cards by marker title, description, category, and linked-record title.
- Category panel uses checkboxes. Each client keeps its own hidden-category set in localStorage.
- Marker popup shows title, category, description, and archive links.

### GM controls
- `Выбрать карту` selects the shared base image.
- `+ Точка` enters placement mode; the next map click creates a marker at normalized image coordinates.
- Marker editor supports title, description, category, icon, and linked records.
- Existing markers can be dragged by GM; position is saved on drag end.
- GM can delete markers and create/delete custom categories.

### Record integration
- Record editors for contacts, quests/gigs, clues, and locations show `Точки на карте` with linked markers and `Привязать точку`.
- Map popup link uses `{actorId, section, entryId}` so it can open the correct actor notebook and record.
- If the linked actor/record is unavailable, the popup shows the link as unavailable instead of throwing.

## Data model
World setting `cyberpunk-remaster.worldCityMap` stores JSON:

```json
{
  "version": 1,
  "image": "",
  "title": "Карта Найт-Сити",
  "categories": [
    {"id":"district","label":"Районы","icon":"⌖"},
    {"id":"contact","label":"Контакты","icon":"◉"},
    {"id":"gig","label":"Гиги","icon":"▤"},
    {"id":"clue","label":"Зацепки","icon":"◇"},
    {"id":"poi","label":"Интерес","icon":"◆"}
  ],
  "markers": [
    {
      "id": "...",
      "x": 0.5,
      "y": 0.5,
      "title": "",
      "description": "",
      "categoryId": "poi",
      "icon": "◆",
      "links": [{"actorId":"...","section":"clues","entryId":"..."}],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```
Coordinates are normalized (`0..1`) relative to the source image, so changing browser size or zoom never changes marker placement.

## Architecture
- `runtime/world-city-map.mjs`: registration, normalization, read/write/update API, category visibility helpers, and archive-link helpers.
- `runtime/world-city-map-view.mjs`: DOM renderer/controller for the map surface. It uses a lightweight image-map engine based on CSS transforms and normalized coordinates, so arbitrary GM-selected map images work without an external runtime dependency.
- `styles/world-city-map.css`: shared map UI styling with archive-mode theme variables inherited from the host.
- Archive controllers call the shared renderer for `citymap` instead of maintaining independent actor-local map logic.
- `neuro-archive-runtime.mjs` registers the world setting during Foundry `init`.

## Permissions and synchronization
- Only `game.user.isGM` can write map state.
- Players only read world state and store hidden-category preferences in localStorage.
- World setting onChange emits a module hook and rerenders an open map.
- Writes are serialized through a local promise queue to avoid overwriting simultaneous GM edits.

## Performance
- No requestAnimationFrame loop.
- DOM markers are updated only on map-state or local-filter changes.
- Search/category filters toggle marker visibility without rebuilding archive data.
- The map renderer is destroyed cleanly when leaving the section or closing the archive.

## Compatibility and migration
- Foundry VTT 14.365 / SF2e 1.4.0.
- Existing `book.cityMap.image` is not deleted. On first GM open, if world map has no image and the current notebook has a legacy image, offer/perform a one-time copy of only the image path into the world map state.
- No third-party map artwork is bundled.

## Acceptance tests
1. The same marker set appears in Neuro/Cyber/Neo archive modes.
2. GM can choose a map image, add a marker, drag it, edit it, and delete it.
3. A player cannot mutate map state.
4. Category visibility is local to a client and persists after reopen.
5. Marker links open contacts/gigs/clues/locations.
6. The map has no continuous DOM/ticker loop when idle.
7. Existing archive tests, clue-connections tests, encounter-frequency fixes, FPS fix, and Bioware filtering remain green.
