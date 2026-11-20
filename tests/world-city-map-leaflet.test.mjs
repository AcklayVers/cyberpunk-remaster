import assert from 'node:assert/strict';
import test from 'node:test';

const url = new URL('../runtime/world-city-map-leaflet.mjs', import.meta.url);

test('Leaflet adapter converts normalized POI coordinates through CRS.Simple logical bounds', async () => {
  const { DEFAULT_NIGHT_CITY_TILESET, normalizedToLeafletLatLng, leafletLatLngToNormalized } = await import(`${url.href}?coords=1`);
  const manifest = DEFAULT_NIGHT_CITY_TILESET;
  assert.deepEqual(normalizedToLeafletLatLng({ x: 0, y: 0 }, manifest), { lat: 0, lng: 0 });
  assert.deepEqual(normalizedToLeafletLatLng({ x: 1, y: 1 }, manifest), { lat: -512, lng: 331.25 });
  const point = normalizedToLeafletLatLng({ x: 0.4, y: 0.75 }, manifest);
  const roundTrip = leafletLatLngToNormalized(point, manifest);
  assert.ok(Math.abs(roundTrip.x - 0.4) < 1e-12);
  assert.ok(Math.abs(roundTrip.y - 0.75) < 1e-12);
});

test('Leaflet adapter clamps dragged/clicked coordinates to the image rectangle', async () => {
  const { DEFAULT_NIGHT_CITY_TILESET, leafletLatLngToNormalized } = await import(`${url.href}?clamp=1`);
  assert.deepEqual(leafletLatLngToNormalized({ lat: 100, lng: -20 }, DEFAULT_NIGHT_CITY_TILESET), { x: 0, y: 0 });
  assert.deepEqual(leafletLatLngToNormalized({ lat: -999, lng: 999 }, DEFAULT_NIGHT_CITY_TILESET), { x: 1, y: 1 });
});

test('Leaflet loader is local-only and pins the bundled NightCity-compatible runtime', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
  assert.match(source, /modules\/cyberpunk-remaster\/vendor\/leaflet\/leaflet\.js/);
  assert.match(source, /const LEAFLET_VERSION = [\"']1\.6\.0[\"']/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test('Leaflet marker size scales at the requested zoom tiers', async () => {
  const { worldCityMarkerSizeForZoom } = await import(`${url.href}?marker-size=1`);
  assert.equal(worldCityMarkerSizeForZoom(-2), 24);
  assert.equal(worldCityMarkerSizeForZoom(2), 24);
  assert.equal(worldCityMarkerSizeForZoom(3), 30);
  assert.equal(worldCityMarkerSizeForZoom(4), 36);
  assert.equal(worldCityMarkerSizeForZoom(5), 42);
  assert.equal(worldCityMarkerSizeForZoom(6), 48);
  assert.equal(worldCityMarkerSizeForZoom(7), 48);
});

test('Leaflet refreshes marker divIcons on zoomend without changing marker coordinates', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
  assert.match(source, /map\.on\("zoomend"/u);
  assert.match(source, /leafletMarker\.setIcon\(markerIcon\(L, markerData, map\.getZoom\(\)\)\)/u);
  assert.doesNotMatch(source, /zoomend[\s\S]{0,500}setLatLng/u);
});

test('Leaflet region helpers sort overlapping hits by zOrder and perform normalized point-in-polygon checks', async () => {
  const { sortWorldMapRegionsForHit, worldMapPointInPolygon } = await import(`${url.href}?regions-helpers=1`);
  const regions = [
    { id: 'low', zOrder: 1, createdAt: '2026-01-01' },
    { id: 'high', zOrder: 10, createdAt: '2026-01-02' },
    { id: 'mid', zOrder: 5, createdAt: '2026-01-03' },
  ];
  assert.deepEqual(sortWorldMapRegionsForHit(regions).map((region) => region.id), ['high', 'mid', 'low']);
  const square = [{x:0.1,y:0.1},{x:0.4,y:0.1},{x:0.4,y:0.4},{x:0.1,y:0.4}];
  assert.equal(worldMapPointInPolygon({x:0.2,y:0.2}, square), true);
  assert.equal(worldMapPointInPolygon({x:0.8,y:0.8}, square), false);
});

test('Leaflet adapter defines dedicated region and handle panes below marker pane and exposes region controller APIs', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
  assert.match(source, /createPane\(["']worldMapRegions["']\)/u);
  assert.match(source, /getPane\(["']worldMapRegions["']\)\.style\.zIndex\s*=\s*["']350["']/u);
  assert.match(source, /createPane\(["']worldMapRegionHandles["']\)/u);
  assert.match(source, /getPane\(["']worldMapRegionHandles["']\)\.style\.zIndex\s*=\s*["']550["']/u);
  assert.match(source, /function setRegions\(/u);
  assert.match(source, /function regionsAtLatLng\(/u);
  assert.match(source, /setRegionDrawingMode/u);
  assert.match(source, /setRegionEditMode/u);
  assert.match(source, /setRegionDraft/u);
  assert.match(source, /clearRegionDraft/u);
  assert.match(source, /focusRegion/u);
});
