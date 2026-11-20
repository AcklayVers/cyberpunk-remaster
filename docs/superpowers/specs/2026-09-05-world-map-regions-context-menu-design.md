# World Map Regions & Context Menu — Design

## Goal

Расширить существующую общую карту Найт-Сити двумя GM-функциями:

1. контекстное меню по правой кнопке мыши на карте для создания точки и запуска рисования региона;
2. общие мировые регионы-полигоны, которые создаёт и редактирует только GM, а все игроки видят.

Существующие точки, личные связи игроков, тайловая карта и поведение zoom/pan должны остаться совместимыми.

## Scope

Входит в работу:

- ПКМ-контекстное меню карты;
- создание точки из контекстного меню прямо в месте клика;
- создание многоугольного региона;
- редактирование названия, короткого описания, цвета, прозрачности заливки, прозрачности/толщины границы;
- редактирование вершин региона;
- удаление вершины ПКМ по вершине;
- сохранение/отмена редактирования контура;
- скрытие/показ регионов;
- удаление регионов;
- z-order регионов;
- работа с перекрывающимися регионами;
- список регионов в левой панели карты;
- tooltip региона: название + короткое описание;
- GM-only проверки на все операции записи;
- миграция текущего состояния карты с v3 на v4 без потери точек.

Не входит:

- личные регионы игроков;
- импорт регионов из изображения/PDF;
- автоматическое распознавание районов по цвету карты;
- геометрические операции объединения/вычитания полигонов;
- привязка архивных записей к регионам в первой версии.

## Current Architecture

Сейчас `runtime/world-city-map.mjs` хранит общее мировое состояние карты в world setting `worldCityMap` версии 3. Основные сущности: `categories` и `markers`. Координаты маркеров нормализованы в диапазон `0..1`.

`runtime/world-city-map-leaflet.mjs` создаёт локальную Leaflet-карту с `CRS.Simple`, базовым тайловым слоем и отдельным `markerLayer`. Маркеры управляются через `setMarkers()`, а GM может их перетаскивать.

`runtime/world-city-map-view.mjs` отвечает за боковую панель, редактор точки, фильтры, GM controls, постановку точки и синхронизацию с Leaflet-адаптером.

Новая система регионов должна использовать те же нормализованные координаты и тот же world setting.

## Data Model

Версия общей карты поднимается:

```js
WORLD_CITY_MAP_VERSION = 4
```

В состояние добавляется:

```js
regions: []
```

Нормализованный регион:

```js
{
  id: "region-...",
  name: "Территория Мальстрема",
  description: "Контролируемая бандой промышленная зона.",
  color: "#ef233c",
  fillOpacity: 0.22,
  borderOpacity: 0.9,
  borderWidth: 2,
  visible: true,
  zOrder: 100,
  points: [
    { x: 0.41, y: 0.28 },
    { x: 0.47, y: 0.31 },
    { x: 0.45, y: 0.38 }
  ],
  createdAt: "...",
  updatedAt: "..."
}
```

### Validation

- `id`: уникальная строка;
- `name`: обязательное, непустое;
- `description`: строка, допускается пустая;
- `color`: валидный `#RRGGBB`;
- `fillOpacity`: clamp `0..1`;
- `borderOpacity`: clamp `0..1`;
- `borderWidth`: clamp `1..8`;
- `visible`: boolean;
- `zOrder`: конечное число;
- `points`: минимум 3 уникальные вершины;
- каждая вершина — `{x,y}` с clamp `0..1`.

При чтении v3 мира отсутствие `regions` означает пустой массив. Существующие `categories`, `markers`, `backgroundMode`, `image`, `tileset` и личные User flags не изменяются.

## World Map API

В `runtime/world-city-map.mjs` добавляются отдельные функции:

```js
createWorldMapRegion(data)
updateWorldMapRegion(id, patch)
deleteWorldMapRegion(id)
moveWorldMapRegionToFront(id)
moveWorldMapRegionToBack(id)
```

Все операции записи используют уже существующую сериализованную очередь `updateWorldCityMap()` и обязаны проверять `game.user.isGM` до изменения world setting.

Удаление/редактирование региона никогда не меняет `markers`.

## Leaflet Layering

Порядок визуальных слоёв:

1. базовые тайлы / image overlay;
2. регионы;
3. вершины редактируемого региона;
4. точки карты;
5. UI/инспектор/контекстное меню.

Для регионов создаётся отдельный Leaflet pane, например:

```js
map.createPane("worldMapRegions")
map.getPane("worldMapRegions").style.zIndex = 350
```

Маркерный pane/слой остаётся выше регионов.

Регионы отображаются через настоящий `L.polygon`, а не SVG/canvas, нарисованный вручную вне Leaflet.

## Coordinate Conversion

Регион хранит нормализованные точки `0..1`.

Для рендера каждая вершина конвертируется через существующий helper:

```js
normalizedToLeafletLatLng(point, manifest)
```

При создании, перетаскивании или редактировании вершины обратное преобразование выполняется через:

```js
leafletLatLngToNormalized(latlng, manifest)
```

Это сохраняет положение регионов при любом zoom, resize, смене режима архива и пересборке тайлов при неизменной геометрии карты.

## Right-Click Context Menu

### Empty map

ПКМ по пустой карте открывает собственное меню модуля в координатах курсора:

- **Добавить точку здесь**
- **Нарисовать регион**
- **Отмена**

У игрока это меню не показывает GM-команды.

### Add marker here

Команда **Добавить точку здесь** создаёт маркер сразу по нормализованным координатам ПКМ и открывает существующий редактор точки. Она не включает отдельный placement mode.

### Existing region

ПКМ внутри региона открывает меню выбранного региона:

- **Редактировать границу**
- **Изменить свойства**
- **На передний план**
- **На задний план**
- **Скрыть / Показать**
- **Удалить**

Если в точке ПКМ перекрываются несколько регионов, сначала показывается список найденных регионов по `zOrder`, например:

- `Территория Мальстрема`
- `Красная зона`

После выбора региона открывается его меню действий.

## Region Drawing Flow

1. GM выбирает ПКМ → **Нарисовать регион**.
2. Карта входит в `region-drawing` mode.
3. ЛКМ добавляет вершины.
4. На карте сразу отображается preview-полилиния/полигон.
5. Двойной клик завершает контур, если вершин минимум 3.
6. Также доступна явная кнопка **Завершить**.
7. После завершения открывается редактор свойств региона.
8. **Сохранить** записывает регион в world setting.
9. **Отмена** полностью удаляет незаписанный draft.

Во время рисования обычное создание точки отключено, а drag карты не должен случайно создавать вершины.

## Region Geometry Editing

Команда **Редактировать границу** создаёт временный editing session.

Каждая вершина отображается отдельным draggable handle поверх полигона.

- drag handle → меняет координату draft-вершины;
- ПКМ по handle → удаляет эту вершину;
- если осталось меньше 3 вершин, удаление блокируется;
- **Сохранить** применяет весь draft одним `updateWorldMapRegion()`;
- **Отмена** возвращает исходную геометрию без world update.

Редактирование контура не должно выполнять частичные world writes на каждом drag event.

## Region Properties Editor

Поля:

- **Название** — обязательное;
- **Короткое описание** — textarea;
- **Цвет** — color input;
- **Прозрачность заливки** — slider/number `0..100%`;
- **Прозрачность границы** — slider/number `0..100%`;
- **Толщина границы** — `1..8 px`.

Редактор использует тот же верхний UI-layer, что и редактор точки, и должен находиться выше Leaflet panes.

## Tooltip

При hover региона показывается компактная подсказка:

```text
Территория Мальстрема
Контролируемая бандой промышленная зона. Высокий риск нападения.
```

Правила:

- название всегда видно;
- описание показывается только если непустое;
- tooltip ограничивается по ширине/высоте;
- tooltip не мешает кликам по маркерам, расположенным внутри региона.

## Sidebar: Regions

В левой панели карты добавляется отдельный блок **Регионы**.

Каждая строка содержит:

- цветной swatch;
- название;
- переключатель локального отображения;
- у GM — edit/delete controls.

Клик по названию центрирует карту на bounds региона с разумным zoom.

Игрок:

- видит общий список регионов;
- может локально выключить отображение региона только у себя;
- не может менять world data.

GM:

- получает те же локальные visibility controls;
- может открыть редактор;
- может менять порядок;
- может удалить регион.

Локально скрытые регионы хранятся в `localStorage`, аналогично существующим скрытым категориям/точкам, и не меняют `visible` в world data.

Поле `visible` в world data используется для GM-глобального включения/выключения региона для всех.

## Overlapping Regions

Пересечения разрешены.

`zOrder` определяет порядок регионов между собой. Новый регион получает `zOrder` выше текущего максимума.

- **На передний план** → больше текущего max;
- **На задний план** → меньше текущего min.

Не требуется поддерживать плотную последовательность `1,2,3...`; достаточно стабильной сортировки по числу и `createdAt/id` как tie-breaker.

Точки карты всегда визуально выше всех регионов вне зависимости от `zOrder` региона.

## Interaction Priority

Чтобы регионы не ломали существующую карту:

- ЛКМ по маркеру → маркер;
- drag маркера GM → маркер;
- hover маркера → маркерный tooltip;
- ПКМ по marker handle/вершине в edit mode → vertex action;
- ПКМ внутри региона → region context menu;
- ПКМ по пустой карте → create context menu;
- обычный drag карты остаётся доступен вне drawing/edit modes.

Контекстное меню браузера на карте подавляется только внутри viewport карты.

## Permissions

Все create/update/delete/reorder region API жёстко GM-only.

UI также не показывает GM controls игрокам, но безопасность не полагается только на UI.

Игроки получают регионы из общего world setting и могут только:

- видеть;
- читать tooltip;
- центрироваться на регионе;
- локально скрывать/показывать.

## Error Handling

- попытка сохранить регион с <3 вершинами → notification error, состояние edit/drawing остаётся открытым;
- пустое название → notification error;
- удаление региона требует `confirm`;
- ошибка world update не уничтожает draft и позволяет повторить сохранение;
- invalid stored region при нормализации пропускается или безопасно исправляется, не ломая всю карту;
- при уничтожении view все временные Leaflet layers, handlers и context menu удаляются.

## CSS / UX

Новые классы изолируются под `.world-city-map-*`.

Нужно добавить:

- контекстное меню карты;
- region swatches/sidebar list;
- region editor;
- drawing mode indicator;
- vertex handles;
- region hover tooltip.

Все floating UI должны иметь z-index выше Leaflet panes, учитывая уже исправленную проблему с редактором точки.

## Testing Strategy

### Data model tests

- v3 → v4 migration adds empty `regions` without moving markers;
- normalize valid region;
- reject/repair invalid points and opacity values;
- GM create/update/delete/reorder;
- player writes rejected;
- zOrder preserves overlap ordering.

### Leaflet adapter tests

- region pane exists below markers;
- `setRegions()` creates `L.polygon` layers;
- normalized polygon coordinates round-trip correctly;
- marker layer remains above region layer;
- hit-testing returns overlapping regions in z-order;
- editing handles are removed on destroy/cancel.

### View tests

- GM right-click empty map shows `Добавить точку здесь` and `Нарисовать регион`;
- player right-click does not show GM actions;
- Add marker here creates at right-click coordinates and opens marker editor;
- drawing requires >=3 vertices;
- double-click/finish transitions into region editor;
- save/cancel geometry behavior;
- sidebar region list for player and GM;
- local hide does not update world setting;
- world-global hide by GM affects all clients;
- tooltip includes name + short description;
- overlapping-region context menu allows selecting lower region;
- region controls never intercept marker click/drag.

### Regression tests

Run all existing world map, personal links, archive focus zoom, responsive archive, marker scaling and Neo Archive tests unchanged.

## Files Expected To Change

Primary:

- `runtime/world-city-map.mjs` — v4 schema and world-region CRUD;
- `runtime/world-city-map-leaflet.mjs` — polygon layer, drawing/edit handles, hit testing;
- `runtime/world-city-map-view.mjs` — context menu, region modes, sidebar/editor;
- `styles/world-city-map.css` — region UI and Leaflet interaction styles;
- `tests/world-city-map.test.mjs`;
- `tests/world-city-map-leaflet.test.mjs`;
- `tests/world-city-map-view.test.mjs`;
- new integration regression test(s) for regions/context menu.

Metadata after implementation:

- `module.json`;
- `package.json`;
- `README.md`;
- `CHANGELOG.md`.

## Compatibility Requirements

- existing v3 worlds migrate transparently;
- existing markers retain ids/coordinates/categories/links;
- existing personal User-flag links are untouched;
- PDF-derived tile pyramid is untouched;
- current marker focus zoom and marker scaling remain unchanged;
- existing sidebar collapse and Neo Archive responsive behavior remain unchanged;
- regions are additive and may be empty.

## Acceptance Criteria

1. GM can right-click an empty point of the map and create a marker there.
2. GM can right-click and start drawing a region.
3. Region geometry remains aligned at all zoom levels.
4. GM can edit vertices, name, description, color, opacity and border width.
5. GM can reorder, hide and delete regions.
6. Overlapping regions are supported and individually selectable.
7. All players see world regions but cannot modify them.
8. Players can locally hide/show individual regions.
9. Hover shows region name and short description.
10. Markers remain above regions and retain all existing interactions.
11. Existing v3 map data migrates without loss.
12. All existing map/archive regression tests remain green except any already-known environment-only build dependency failure.
