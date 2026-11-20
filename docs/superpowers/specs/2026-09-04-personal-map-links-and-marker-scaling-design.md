# Personal Map Links and Marker Scaling Design

## Goal

Extend the shared Night City map so that:

1. nine unwanted default map categories are removed;
2. any existing points that used those categories are preserved by migrating them to `poi` / `Интерес`;
3. non-GM players can attach archive records from one of their characters to existing GM-created map points without gaining permission to create, move, edit, recolor, recategorize, or delete map points;
4. those player-created associations are stored in Foundry user data and are scoped by user and Actor, so they synchronize between the player's devices while remaining separate from other players and from the GM's shared world-map links;
5. map marker icons become larger as the user zooms in so they remain readable at high zoom.

## Existing Architecture

The shared world map is stored in the hidden world setting `cyberpunk-remaster.worldCityMap` and implemented in `runtime/world-city-map.mjs`. Each shared marker currently stores GM-managed archive associations in `marker.links`.

The three archive controllers (`runtime/neuro-archive-controller.mjs`, `runtime/cyber-archive-controller.mjs`, and `runtime/neo-archive-controller.mjs`) expose the same archive-side point-link UI. Today only a GM gets the controls that call `linkMarkerToArchiveEntry()` and `unlinkMarkerFromArchiveEntry()`, which mutate the shared world map.

The visual map is rendered through `runtime/world-city-map-view.mjs` and `runtime/world-city-map-leaflet.mjs`. Leaflet marker icons currently use a fixed-size `L.divIcon`, so the map grows during zoom while the marker stays roughly the same screen size.

## Removed Default Categories

Remove these IDs from `DEFAULT_WORLD_MAP_CATEGORIES`:

- `contact` — Контакты
- `gig` — Заказы
- `clue` — Зацепки
- `cyberpsycho` — Киберпсихи
- `melee` — Ближний бой
- `netrunner` — Нетраннеры
- `fast-travel` — Быстрое перемещение
- `drop-point` — Drop Point
- `npc` — NPC

These icon choices may remain in `WORLD_MAP_ICON_PRESETS`; only the default category rows are removed.

### Migration behavior

Define a removed-category ID set in the world-map model. During normalization:

- ignore raw category definitions whose IDs are in that set, including categories already stored in an older world setting;
- if an existing marker references a removed category, change its `categoryId` to `poi`;
- keep the marker ID, normalized `x`/`y`, title, description, icon override, color override, timestamps, and existing shared `marker.links` unchanged.

This guarantees no existing points are lost.

## Personal Player Link Storage

### Storage location

Create a dedicated service module, `runtime/world-city-map-user-links.mjs`, responsible only for personal player associations.

Store the data on the current Foundry `User` document using a module flag:

- scope: `cyberpunk-remaster`
- key: `worldCityMapPersonalLinksV1`

The data is user-scoped because it lives on `game.user`. Inside that flag it is further partitioned by Actor ID.

### Data shape

```js
{
  version: 1,
  actors: {
    "<actorId>": [
      {
        markerId: "<shared-map-marker-id>",
        section: "people",
        entryId: "<archive-entry-id>"
      }
    ]
  }
}
```

`actorId` is the character whose archive owns the record. A stored personal association does not duplicate map coordinates or point metadata; it only references an existing shared map marker by `markerId`.

### Validation

Personal-link writes must enforce all of the following:

- a current logged-in user exists;
- `actorId`, `section`, `entryId`, and `markerId` are non-empty;
- `section` is one of the supported archive sections already accepted by the world-map archive-link model;
- the referenced shared marker currently exists;
- the actor is owned by the current user, unless the current user is GM;
- duplicate associations for the same Actor + section + entry + marker are ignored;
- deleting a personal association cannot mutate `marker.links` or any world setting.

If a marker is later deleted by the GM, stale personal references are filtered out on read. They may also be pruned on the next write.

## Archive-Side Player UX

The existing `Точки на карте` panel remains the single place where archive records are associated with map points.

### GM behavior

GM behavior stays unchanged:

- GM associations continue to use shared `marker.links`;
- GM can add/remove shared associations;
- GM can create/edit/delete map points.

### Player behavior

For a non-GM player viewing an archive record belonging to one of their characters:

- show a point selector containing existing shared GM-created map points;
- allow `+ Привязать точку` to create a personal User-flag association for the active Actor;
- show the player's personal linked points in the panel;
- allow the player to remove only their own personal associations;
- `Открыть на карте` focuses the linked shared marker;
- do not expose any map-point creation, drag, edit, delete, category-edit, color-edit, or world-link mutation controls.

The personal association applies to any archive record type already supported by the archive-link system, including contacts, fixers, corporations, gangs, locations, quests, clues, notes, and files.

### Shared and personal associations

For non-GM players, the record panel should display:

- shared GM associations that already exist in `marker.links` as read-only;
- personal associations for the active Actor as removable by that user.

If the same marker is both shared and personal for the same record, render it once and treat it as shared/read-only until the personal duplicate is explicitly pruned; do not show duplicate rows.

## Map-Side Personal Knowledge

When a player clicks a shared marker, the marker detail panel may show archive records linked personally for the currently active Actor in addition to any shared GM-managed archive links visible to that client.

Personal records must be sourced from the current user's personal-link service and the current Actor only. Switching active character changes which personal marker associations are shown without changing the shared map.

No personal link from one user or one Actor should be used when rendering another user's or Actor's archive relationship UI.

## Marker Scaling with Zoom

Keep the coordinate anchor at the bottom-center of the marker while increasing the icon size with Leaflet zoom.

Use a deterministic size function based on `map.getZoom()`:

- zoom <= 2: 24 px
- zoom 3: 30 px
- zoom 4: 36 px
- zoom 5: 42 px
- zoom >= 6: 48 px

The nested pictogram scales proportionally, approximately 60–65% of the marker diameter.

Implementation should update the existing Leaflet markers on `zoomend` by replacing each marker's `L.divIcon` with an icon whose `iconSize` and `iconAnchor` match the computed size. This keeps the point anchored to the same map coordinate instead of visually drifting.

The marker tooltip and selection state must continue to work after the icon is replaced.

## Permissions and Privacy Semantics

“Personal” means the associations are stored on the current Foundry User and are not written into the shared map or another player's archive data. They are synchronized by Foundry rather than browser-local storage.

This is not cryptographic secrecy from a GM/server administrator: Foundry administrators can generally inspect world/user data. The product behavior is that another normal player does not receive or render another user's personal association layer.

## Files Expected to Change

- `runtime/world-city-map.mjs`
  - remove default categories;
  - add removed-category migration.
- `runtime/world-city-map-user-links.mjs`
  - new personal association storage/validation service.
- `runtime/world-city-map-view.mjs`
  - consume personal links in marker detail context where applicable.
- `runtime/world-city-map-leaflet.mjs`
  - zoom-dependent marker icon sizing.
- `runtime/neuro-archive-controller.mjs`
  - add player personal-link UI/handlers while preserving GM shared-link behavior.
- `runtime/cyber-archive-controller.mjs`
  - same integration.
- `runtime/neo-archive-controller.mjs`
  - same integration.
- `styles/world-city-map.css`
  - scalable marker glyph styling and personal/shared link row states if needed.
- `tests/world-city-map.test.mjs`
  - category migration tests.
- new tests for personal user links, permissions, archive integration, and marker sizing.
- `README.md`, `CHANGELOG.md`, `module.json`, `package.json`
  - version/documentation update after implementation.

## Testing Requirements

Add automated coverage for:

1. removed default categories are absent from a new normalized map;
2. legacy raw categories with removed IDs do not reappear;
3. markers in removed categories migrate to `poi` without changing coordinates or links;
4. personal links persist under the current User flag and Actor ID;
5. personal links from Actor A are absent when querying Actor B;
6. duplicate personal links are rejected/deduplicated;
7. stale marker references are not returned;
8. a normal user cannot use the personal-link API for an Actor they do not own;
9. player linking does not mutate `worldCityMap` or `marker.links`;
10. all three archive controllers expose player personal add/remove controls and keep GM shared behavior;
11. the marker-size function returns the specified sizes across zoom levels;
12. Leaflet updates marker icons on `zoomend` while preserving marker coordinates;
13. existing map placement, dragging, filtering, sidebar collapse, category visibility, PDF tile behavior, and map focus tests still pass.

## Non-Goals

This change will not:

- let players create their own map points;
- let players move or edit GM points;
- create per-player point coordinates or private map layers;
- remove the corresponding icon glyphs from the icon picker;
- alter the current high-resolution PDF tile pyramid;
- expose another player's personal link layer.
