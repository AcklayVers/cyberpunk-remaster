const LEAFLET_VERSION = "1.6.0";
const LEAFLET_LOAD_TIMEOUT_MS = 8000;
const LEAFLET_SCRIPT = "modules/cyberpunk-remaster/vendor/leaflet/leaflet.js";

export const DEFAULT_NIGHT_CITY_TILESET = Object.freeze({
  id: "night-city-2045",
  title: "Night City 2045 Atlas",
  width: 10600,
  height: 16384,
  tileSize: 256,
  minNativeZoom: 0,
  maxNativeZoom: 5,
  maxZoom: 7,
  urlTemplate: "modules/cyberpunk-remaster/assets/maps/night-city-2045/tiles/z{z}/{x}-{y}.webp",
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

function logicalSize(manifest = DEFAULT_NIGHT_CITY_TILESET) {
  const scale = 2 ** Math.max(0, Number(manifest?.maxNativeZoom) || 0);
  return {
    width: Math.max(1, Number(manifest?.width) || DEFAULT_NIGHT_CITY_TILESET.width) / scale,
    height: Math.max(1, Number(manifest?.height) || DEFAULT_NIGHT_CITY_TILESET.height) / scale,
  };
}

export function normalizedToLeafletLatLng(point, manifest = DEFAULT_NIGHT_CITY_TILESET) {
  const { width, height } = logicalSize(manifest);
  const x = clamp01(point?.x);
  const y = clamp01(point?.y);
  return {
    lat: y === 0 ? 0 : -y * height,
    lng: x * width,
  };
}

export function leafletLatLngToNormalized(latlng, manifest = DEFAULT_NIGHT_CITY_TILESET) {
  const { width, height } = logicalSize(manifest);
  return {
    x: clamp01((Number(latlng?.lng) || 0) / width),
    y: clamp01(-(Number(latlng?.lat) || 0) / height),
  };
}

export function sortWorldMapRegionsForHit(regions = []) {
  return [...(Array.isArray(regions) ? regions : [])].sort((a, b) => (Number(b?.zOrder) || 0) - (Number(a?.zOrder) || 0)
    || String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
    || String(b?.id || "").localeCompare(String(a?.id || "")
  ));
}

export function worldMapPointInPolygon(point, polygon = []) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const vertices = Array.isArray(polygon) ? polygon : [];
  if (!Number.isFinite(x) || !Number.isFinite(y) || vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = Number(vertices[i]?.x);
    const yi = Number(vertices[i]?.y);
    const xj = Number(vertices[j]?.x);
    const yj = Number(vertices[j]?.y);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

let leafletLoadPromise = null;

export function loadWorldCityLeaflet() {
  if (globalThis.L?.version === LEAFLET_VERSION) return Promise.resolve(globalThis.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const doc = globalThis.document;
    if (!doc?.head) {
      reject(new Error("Leaflet requires a browser document"));
      return;
    }

    let settled = false;
    let timer = null;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };
    const fail = (message) => settle(reject, new Error(message));
    const finish = () => {
      if (globalThis.L?.version === LEAFLET_VERSION) settle(resolve, globalThis.L);
      else fail(`Leaflet ${LEAFLET_VERSION} did not initialize`);
    };

    timer = setTimeout(() => {
      fail(`Leaflet ${LEAFLET_VERSION} local runtime load timeout after ${LEAFLET_LOAD_TIMEOUT_MS} ms`);
    }, LEAFLET_LOAD_TIMEOUT_MS);

    let script = doc.querySelector?.(`script[data-cpr-leaflet="${LEAFLET_VERSION}"]`);
    if (script) {
      if (globalThis.L?.version === LEAFLET_VERSION) finish();
      else {
        script.addEventListener("load", finish, { once: true });
        script.addEventListener("error", () => fail("Failed to load local Leaflet runtime"), { once: true });
      }
      return;
    }

    script = doc.createElement("script");
    script.dataset.cprLeaflet = LEAFLET_VERSION;
    script.src = LEAFLET_SCRIPT;
    script.async = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => fail("Failed to load local Leaflet runtime"), { once: true });
    doc.head.appendChild(script);
  }).catch((error) => {
    leafletLoadPromise = null;
    throw error;
  });

  return leafletLoadPromise;
}

function sourceBounds(L, manifest) {
  const { width, height } = logicalSize(manifest);
  return L.latLngBounds([0, 0], [-height, width]);
}

function loadImageDimensions(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, Number(image.naturalWidth) || DEFAULT_NIGHT_CITY_TILESET.width),
      height: Math.max(1, Number(image.naturalHeight) || DEFAULT_NIGHT_CITY_TILESET.height),
    });
    image.onerror = () => reject(new Error(`Не удалось открыть изображение карты: ${source}`));
    image.src = source;
  });
}

export function worldCityMarkerSizeForZoom(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value) || value <= 2) return 24;
  if (value < 4) return 30;
  if (value < 5) return 36;
  if (value < 6) return 42;
  return 48;
}

export function worldCityMarkerGroups(markers = [], { zoom = 2, enabled = true, excludeIds = new Set(), manifest = DEFAULT_NIGHT_CITY_TILESET } = {}) {
  const points = markers.filter(m => String(m?.id ?? "")).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const { width, height } = logicalSize(manifest);
  const scale = 2 ** Number(zoom);
  const grouped = enabled && points.length >= 200 && Number(zoom) <= 3.5;
  const cells = new Map();
  for (const point of points) {
    const id = String(point.id), x = clamp01(point.x), y = clamp01(point.y);
    const key = grouped && !excludeIds.has(id) && !point.cityJobId ? `cluster:${zoom}:${Math.floor(x * width * scale / 72)}:${Math.floor(y * height * scale / 72)}` : `marker:${id}`;
    const cell = cells.get(key) || { id: key, ids: [], x: 0, y: 0 };
    cell.ids.push(id); cell.x += x; cell.y += y; cells.set(key, cell);
  }
  return [...cells.values()].map(cell => ({ ...cell, x: cell.x / cell.ids.length, y: cell.y / cell.ids.length }));
}

function markerIcon(L, marker, zoom = 2) {
  const size = worldCityMarkerSizeForZoom(zoom);
  return L.divIcon({
    className: `world-city-map-leaflet-div-icon world-city-map-marker-size-${size}`,
    html: String(marker?.html ?? ""),
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function regionTooltipHtml(region) {
  const name = escapeHtml(region?.name || "Регион");
  const description = String(region?.description || "").trim();
  return `<strong>${name}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ""}`;
}

function regionVertexIcon(L, index, { first = false, draggable = false } = {}) {
  const classes = ["world-city-map-region-vertex", first ? "first" : "", draggable ? "editing" : "drawing"].filter(Boolean).join(" ");
  return L.divIcon({
    className: "world-city-map-region-vertex-icon",
    html: `<span class="${classes}" data-region-vertex-index="${index}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export async function createWorldCityLeafletMap(container, options = {}) {
  if (!container) throw new Error("World map Leaflet container is missing");
  const L = await loadWorldCityLeaflet();

  const customImage = String(options.image ?? "").trim();
  let manifest = { ...DEFAULT_NIGHT_CITY_TILESET };
  if (customImage) {
    const dimensions = await loadImageDimensions(customImage);
    manifest = {
      ...manifest,
      ...dimensions,
      maxNativeZoom: 2,
      maxZoom: 6,
    };
  }

  const bounds = sourceBounds(L, manifest);
  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: Number(manifest.maxZoom) || Number(DEFAULT_NIGHT_CITY_TILESET.maxZoom) || 7,
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0.25,
    zoomDelta: 1,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    dragging: true,
    inertia: true,
    maxBounds: bounds.pad(0.25),
    maxBoundsViscosity: 0.85,
  });

  map.createPane("worldMapRegions");
  map.getPane("worldMapRegions").style.zIndex = "350";
  map.createPane("worldMapRegionHandles");
  map.getPane("worldMapRegionHandles").style.zIndex = "550";

  let baseLayer;
  if (customImage) {
    baseLayer = L.imageOverlay(customImage, bounds, {
      interactive: false,
      className: "world-city-map-custom-image",
    }).addTo(map);
  } else {
    baseLayer = L.tileLayer(DEFAULT_NIGHT_CITY_TILESET.urlTemplate, {
      tileSize: DEFAULT_NIGHT_CITY_TILESET.tileSize,
      minZoom: -2,
      maxZoom: Number(manifest.maxZoom) || Number(DEFAULT_NIGHT_CITY_TILESET.maxZoom) || 7,
      minNativeZoom: DEFAULT_NIGHT_CITY_TILESET.minNativeZoom,
      maxNativeZoom: DEFAULT_NIGHT_CITY_TILESET.maxNativeZoom,
      bounds,
      noWrap: true,
      keepBuffer: 2,
      updateWhenIdle: false,
    }).addTo(map);
  }

  const regionLayer = L.layerGroup().addTo(map);
  const draftLayer = L.layerGroup().addTo(map);
  const handleLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const positionLayer =L.layerGroup().addTo(map);
  const markerObjects = new Map();
  const markerDataObjects = new Map();
  const draggingMarkerIds = new Set();
  const clusterObjects = new Map();
  let displayMarkerObjects = new Set();
  let groupMarkers = options.groupMarkers !== false;
  let focusedMarkerId = "";
  const regionObjects = new Map();
  const regionDataObjects = new Map();
  let placementMode = false;
  let regionMode = "idle";
  let regionDraftPoints = [];
  let destroyed = false;
  let initialFitDone = false;
  let resizeObserver = null;
  let markerViewReady = false;
  let markerRefreshBounds = null;
  let markerViewportZoom = null;

  function hasUsableContainerSize() {
    const rect = container.getBoundingClientRect?.();
    if (!rect) return true;
    return Number(rect.width) > 2 && Number(rect.height) > 2;
  }

  function fit({ initial = false } = {}) {
    if (destroyed || !hasUsableContainerSize()) return false;
    map.invalidateSize(false);
    map.fitBounds(bounds, { padding: [16, 16], animate: false });
    if (initial) {
      const closerZoom = Math.min(map.getMaxZoom(), map.getZoom() + 0.5);
      map.setZoom(closerZoom, { animate: false });
      initialFitDone = true;
    }
    return true;
  }

  function ensureInitialFit() {
    if (destroyed || initialFitDone) return;
    fit({ initial: true });
  }

  const ResizeObserverCtor = globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor === "function") {
    resizeObserver = new ResizeObserverCtor(() => {
      if (destroyed) return;
      map.invalidateSize(false);
      ensureInitialFit();
    });
    resizeObserver.observe(container);
  }

  function syncInteractionState() {
    const viewport = container.closest?.("[data-world-map-viewport]");
    viewport?.classList?.toggle?.("placing", placementMode);
    viewport?.classList?.toggle?.("drawing-region", regionMode === "drawing");
    viewport?.classList?.toggle?.("editing-region", regionMode === "editing");
    if (placementMode) map.dragging?.disable?.();
    else map.dragging?.enable?.();
    if (regionMode === "drawing") map.doubleClickZoom?.disable?.();
    else map.doubleClickZoom?.enable?.();
  }

  function setPlacementMode(enabled) {
    placementMode = Boolean(enabled);
    syncInteractionState();
  }

  function syncMarkerVisibility(force = false) {
    if (destroyed || !markerViewReady) return;
    const size = map.getSize();
    if (size.x <= 2 || size.y <= 2) return;
    const view = map.getBounds();
    const zoom = map.getZoom();
    if (!force && markerViewportZoom === zoom && markerRefreshBounds?.contains(view)) return;
    const shortestSide = Math.max(1, Math.min(size.x, size.y));
    // Group centers can sit beyond their visible members; keep extra overscan.
    const renderBounds = view.pad((clusterObjects.size ? 224 : 128) / shortestSide);
    markerRefreshBounds = view.pad(64 / shortestSide);
    markerViewportZoom = zoom;
    for (const [id, marker] of [...markerObjects, ...clusterObjects]) {
      const visible = draggingMarkerIds.has(id) || (displayMarkerObjects.has(marker) && renderBounds.contains(marker.getLatLng()));
      if (visible && !markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
      else if (!visible && markerLayer.hasLayer(marker)) markerLayer.removeLayer(marker);
    }
  }

  map.whenReady(() => {
    markerViewReady = true;
    syncMarkerVisibility(true);
  });
  map.on("move", () => syncMarkerVisibility());
  map.on("resize", () => syncMarkerVisibility(true));

  function rebuildMarkerGroups() {
    if (destroyed) return;
    for (const marker of clusterObjects.values()) markerLayer.removeLayer(marker);
    clusterObjects.clear();
    displayMarkerObjects = new Set();
    const excludeIds = new Set(draggingMarkerIds);
    if (focusedMarkerId) excludeIds.add(focusedMarkerId);
    for (const data of markerDataObjects.values()) if (data.selected || data.cityJobId) excludeIds.add(String(data.id));
    for (const [id, marker] of markerObjects) marker.setZIndexOffset?.(excludeIds.has(id) ? 1000 : 0);
    for (const group of worldCityMarkerGroups([...markerDataObjects.values()], { zoom: map.getZoom(), enabled: groupMarkers, excludeIds, manifest })) {
      if (group.ids.length === 1) { displayMarkerObjects.add(markerObjects.get(group.ids[0])); continue; }
      const title = `Группа точек (${group.ids.length}). Приблизить`;
      const marker = L.marker(normalizedToLeafletLatLng(group, manifest), {
        draggable: false, keyboard: true, title, worldCityMarkerIds: group.ids,
        icon: L.divIcon({ className: "world-city-map-cluster-icon", iconSize: [36, 36], iconAnchor: [18, 18],
          html: `<button type="button" class="world-city-map-cluster" data-world-map-cluster="${escapeHtml(group.id)}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${group.ids.length}</button>` }),
      });
      marker.on("click", () => {
        const previousZoom = map.getZoom();
        map.fitBounds(L.latLngBounds(group.ids.map(id => markerObjects.get(id).getLatLng())), { padding: [40, 40], maxZoom: Math.min(4, map.getMaxZoom()), animate: false });
        if (map.getZoom() <= previousZoom && previousZoom < map.getMaxZoom()) map.zoomIn(1);
      });
      clusterObjects.set(group.id, marker); displayMarkerObjects.add(marker);
    }
    syncMarkerVisibility(true);
  }

  function setMarkerGrouping(enabled) { groupMarkers = !!enabled; rebuildMarkerGroups(); }

  function setMarkers(markers = []) {
    markerLayer.clearLayers();
    markerObjects.clear();
    markerDataObjects.clear();
    draggingMarkerIds.clear();
    focusedMarkerId = "";
    for (const marker of Array.isArray(markers) ? markers : []) {
      const id = String(marker?.id ?? "").trim();
      if (!id) continue;
      const leafletMarker = L.marker(normalizedToLeafletLatLng(marker, manifest), {
        icon: markerIcon(L, marker, map.getZoom()),
        draggable: Boolean(options.isGM) && marker.draggable !== false,
        keyboard: true,
        riseOnHover: true,
        title: String(marker?.title ?? "Точка интереса"),
      });
      leafletMarker.on("click", () => options.onMarkerClick?.(id));
      leafletMarker.on("dragstart", () => { draggingMarkerIds.add(id); leafletMarker.setZIndexOffset?.(1000); });
      leafletMarker.on("dragend", (event) => {
        draggingMarkerIds.delete(id);
        const next = leafletLatLngToNormalized(event.target.getLatLng(), manifest);
        const data = markerDataObjects.get(id);
        if (data) markerDataObjects.set(id, { ...data, ...next });
        leafletMarker.setZIndexOffset?.(focusedMarkerId === id || data?.selected ? 1000 : 0);
        options.onMarkerDragEnd?.(id, next);
        syncMarkerVisibility(true);
      });
      markerObjects.set(id, leafletMarker);
      markerDataObjects.set(id, marker);
    }
    rebuildMarkerGroups();
  }

  function setPositionMarkers(markers = []) {
    positionLayer.clearLayers();
    for (const position of markers) {
      const icon = L.divIcon({
        className: "world-city-map-position-icon", iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<span data-city-position-id="${escapeHtml(position.id)}" style="--position-color:${escapeHtml(position.color)}">${escapeHtml(position.glyph)}</span>`,
      });
      const marker = L.marker(normalizedToLeafletLatLng(position, manifest), { icon, draggable: false, title: position.title, zIndexOffset: 600 });
      marker.bindTooltip(escapeHtml(position.title), { permanent: true, direction: "top", offset: [0, -12], className: "world-city-map-position-label" });
      marker.addTo(positionLayer);
    }
  }

  function focusPoint(point, { zoom = 4 } = {}) {
    if (destroyed || !point) return false;
    initialFitDone = true;
    map.setView(normalizedToLeafletLatLng(point, manifest), Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom)), { animate: false });
    return true;
  }

  function regionsAtLatLng(latlng) {
    const point = leafletLatLngToNormalized(latlng, manifest);
    return sortWorldMapRegionsForHit([...regionDataObjects.values()])
      .filter((region) => region?.visible !== false && worldMapPointInPolygon(point, region?.points))
      .map((region) => String(region.id));
  }

  function dispatchContextMenu(event) {
    if (!event?.latlng) return;
    L.DomEvent?.preventDefault?.(event.originalEvent ?? event);
    const point = leafletLatLngToNormalized(event.latlng, manifest);
    const regionIds = regionsAtLatLng(event.latlng);
    options.onMapContextMenu?.(point, event, regionIds);
  }

  function setRegions(regions = []) {
    regionLayer.clearLayers();
    regionObjects.clear();
    regionDataObjects.clear();
    const ordered = [...(Array.isArray(regions) ? regions : [])]
      .filter((region) => region?.visible !== false && Array.isArray(region?.points) && region.points.length >= 3)
      .sort((a, b) => (Number(a?.zOrder) || 0) - (Number(b?.zOrder) || 0)
        || String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
        || String(a?.id || "").localeCompare(String(b?.id || "")));
    for (const region of ordered) {
      const id = String(region?.id ?? "").trim();
      if (!id) continue;
      const polygon = L.polygon(region.points.map((point) => normalizedToLeafletLatLng(point, manifest)), {
        pane: "worldMapRegions",
        color: String(region.color || "#ef233c"),
        opacity: Number.isFinite(Number(region.borderOpacity)) ? Number(region.borderOpacity) : 0.9,
        weight: Number.isFinite(Number(region.borderWidth)) ? Number(region.borderWidth) : 2,
        fillColor: String(region.color || "#ef233c"),
        fillOpacity: Number.isFinite(Number(region.fillOpacity)) ? Number(region.fillOpacity) : 0.22,
        interactive: true,
        bubblingMouseEvents: true,
      });
      polygon.bindTooltip?.(regionTooltipHtml(region), {
        className: "world-city-map-region-tooltip",
        direction: "top",
        sticky: true,
        opacity: 1,
      });
      polygon.on("click", () => options.onRegionClick?.(id));
      polygon.on("contextmenu", (event) => {
        L.DomEvent?.stopPropagation?.(event.originalEvent ?? event);
        dispatchContextMenu(event);
      });
      polygon.addTo(regionLayer);
      polygon.bringToFront?.();
      regionObjects.set(id, polygon);
      regionDataObjects.set(id, region);
    }
  }

  function renderRegionDraft() {
    draftLayer.clearLayers();
    handleLayer.clearLayers();
    const latlngs = regionDraftPoints.map((point) => normalizedToLeafletLatLng(point, manifest));
    if (latlngs.length >= 2) {
      const shape = latlngs.length >= 3
        ? L.polygon(latlngs, {
          pane: "worldMapRegionHandles",
          color: "#f6c85f",
          opacity: 1,
          weight: 2,
          dashArray: "8 5",
          fillColor: "#f6c85f",
          fillOpacity: 0.12,
          interactive: false,
        })
        : L.polyline(latlngs, {
          pane: "worldMapRegionHandles",
          color: "#f6c85f",
          opacity: 1,
          weight: 2,
          dashArray: "8 5",
          interactive: false,
        });
      shape.addTo(draftLayer);
    }
    if (regionMode === "editing" && latlngs.length >= 3) {
      for (let edgeIndex = 0; edgeIndex < latlngs.length; edgeIndex += 1) {
        const nextIndex = (edgeIndex + 1) % latlngs.length;
        const edgeHitArea = L.polyline([latlngs[edgeIndex], latlngs[nextIndex]], {
          pane: "worldMapRegionHandles",
          color: "#ffffff",
          opacity: 0,
          weight: 16,
          interactive: true,
          bubblingMouseEvents: false,
        });
        edgeHitArea.on("click", (event) => {
          L.DomEvent?.stopPropagation?.(event.originalEvent ?? event);
          L.DomEvent?.preventDefault?.(event.originalEvent ?? event);
          const point = leafletLatLngToNormalized(event.latlng, manifest);
          options.onRegionEdgeInsert?.(edgeIndex + 1, point, event);
        });
        edgeHitArea.addTo(handleLayer);
      }
    }
    if (regionMode === "drawing" || regionMode === "editing") {
      regionDraftPoints.forEach((point, index) => {
        const editing = regionMode === "editing";
        const handle = L.marker(normalizedToLeafletLatLng(point, manifest), {
          pane: "worldMapRegionHandles",
          icon: regionVertexIcon(L, index, { first: index === 0, draggable: regionMode === "editing" }),
          draggable: editing,
          interactive: editing,
          keyboard: false,
          riseOnHover: true,
          zIndexOffset: 1000,
        });
        if (editing) {
          handle.on("dragend", (event) => {
            const next = leafletLatLngToNormalized(event.target.getLatLng(), manifest);
            regionDraftPoints[index] = next;
            renderRegionDraft();
            options.onRegionVertexMove?.(index, next);
          });
          handle.on("contextmenu", (event) => {
            L.DomEvent?.stopPropagation?.(event.originalEvent ?? event);
            L.DomEvent?.preventDefault?.(event.originalEvent ?? event);
            options.onRegionVertexContextMenu?.(index, event);
          });
        }
        handle.addTo(handleLayer);
      });
    }
  }

  function setRegionDraft(points = []) {
    regionDraftPoints = (Array.isArray(points) ? points : []).map((point) => ({
      x: clamp01(point?.x),
      y: clamp01(point?.y),
    }));
    renderRegionDraft();
  }

  function clearRegionDraft() {
    regionMode = "idle";
    regionDraftPoints = [];
    draftLayer.clearLayers();
    handleLayer.clearLayers();
    syncInteractionState();
  }

  function setRegionDrawingMode(enabled, points = []) {
    if (!enabled) {
      clearRegionDraft();
      return;
    }
    placementMode = false;
    regionMode = "drawing";
    setRegionDraft(points);
    syncInteractionState();
  }

  function setRegionEditMode(regionId, points = []) {
    placementMode = false;
    regionMode = regionId ? "editing" : "idle";
    setRegionDraft(points);
    syncInteractionState();
  }

  map.on("zoomend", () => {
    if (destroyed) return;
    for (const [id, leafletMarker] of markerObjects) {
      const markerData = markerDataObjects.get(id);
      if (markerData) leafletMarker.setIcon(markerIcon(L, markerData, map.getZoom()));
    }
    rebuildMarkerGroups();
  });

  function focusMarker(markerId, { zoom = null } = {}) {
    const marker = markerObjects.get(String(markerId ?? ""));
    if (!marker || destroyed) return false;
    const targetZoom = zoom != null && Number.isFinite(Number(zoom))
      ? Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Number(zoom)))
      : Number.isFinite(map.getZoom()) ? map.getZoom() : 0;
    initialFitDone = true;
    focusedMarkerId = String(markerId);
    rebuildMarkerGroups();
    map.setView(marker.getLatLng(), targetZoom, { animate: false });
    return true;
  }

  function focusRegion(regionId, { maxZoom = 5 } = {}) {
    const polygon = regionObjects.get(String(regionId ?? ""));
    if (!polygon || destroyed) return false;
    initialFitDone = true;
    map.fitBounds(polygon.getBounds(), {
      padding: [48, 48],
      animate: false,
      maxZoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Number(maxZoom) || 5)),
    });
    return true;
  }

  map.on("click", (event) => {
    if (regionMode === "drawing") {
      options.onRegionDraftPoint?.(leafletLatLngToNormalized(event.latlng, manifest), event);
      return;
    }
    if (!placementMode) return;
    options.onMapClick?.(leafletLatLngToNormalized(event.latlng, manifest), event);
  });

  map.on("dblclick", (event) => {
    if (regionMode !== "drawing") return;
    L.DomEvent?.preventDefault?.(event.originalEvent ?? event);
    L.DomEvent?.stopPropagation?.(event.originalEvent ?? event);
    if (regionDraftPoints.length >= 3) options.onRegionDraftFinish?.([...regionDraftPoints], event);
  });

  map.on("contextmenu", (event) => {
    dispatchContextMenu(event);
  });

  const onBaseError = (event) => options.onImageError?.(event);
  baseLayer.on?.("tileerror", onBaseError);
  baseLayer.on?.("error", onBaseError);

  requestAnimationFrame(() => {
    if (!destroyed) ensureInitialFit();
  });

  return {
    map,
    manifest,
    bounds,
    setMarkers,
    setMarkerGrouping,
    setPositionMarkers,
    focusPoint,
    setRegions,
    setPlacementMode,
    setRegionDrawingMode,
    setRegionEditMode,
    setRegionDraft,
    clearRegionDraft,
    regionsAtLatLng,
    focusMarker,
    focusRegion,
    fit,
    zoomIn() { if (!destroyed) map.zoomIn(1); },
    zoomOut() { if (!destroyed) map.zoomOut(1); },
    invalidateSize() { if (!destroyed) map.invalidateSize(false); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      markerObjects.clear();
      markerDataObjects.clear();
      draggingMarkerIds.clear();
      clusterObjects.clear(); displayMarkerObjects.clear();
      regionObjects.clear();
      regionDataObjects.clear();
      markerLayer.clearLayers();
      positionLayer.clearLayers();
      regionLayer.clearLayers();
      draftLayer.clearLayers();
      handleLayer.clearLayers();
      map.off();
      map.remove();
      container.innerHTML = "";
    },
  };
}
