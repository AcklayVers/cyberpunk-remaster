import assert from 'node:assert/strict';
import test from 'node:test';

class Bounds {
  constructor(south, west, north, east) { Object.assign(this, { south, west, north, east }); }
  pad(ratio) {
    const lat = (this.north - this.south) * ratio;
    const lng = (this.east - this.west) * ratio;
    return new Bounds(this.south - lat, this.west - lng, this.north + lat, this.east + lng);
  }
  contains(value) {
    if (value instanceof Bounds) return value.south >= this.south && value.north <= this.north && value.west >= this.west && value.east <= this.east;
    return value.lat >= this.south && value.lat <= this.north && value.lng >= this.west && value.lng <= this.east;
  }
}

class Events {
  constructor() { this.events = new Map(); }
  on(names, fn) { for (const name of names.split(' ')) { const list = this.events.get(name) || []; list.push(fn); this.events.set(name, list); } return this; }
  fire(name, data = {}) { for (const fn of this.events.get(name) || []) fn({ target: this, ...data }); }
  off() { this.events.clear(); }
}

async function setup(t) {
  const originals = { L: globalThis.L, requestAnimationFrame: globalThis.requestAnimationFrame, ResizeObserver: globalThis.ResizeObserver };
  t.after(() => Object.assign(globalThis, originals));
  const groups = [];
  const objects = [];
  const map = new Events();
  Object.assign(map, {
    view: new Bounds(-200, 100, -100, 200), zoom: 4,
    createPane() {}, getPane() { return { style: {} }; },
    whenReady(fn) { fn(); }, getBounds() { return this.view; }, getZoom() { return this.zoom; }, getSize() { return { x: 800, y: 600 }; },
    getMinZoom() { return -2; }, getMaxZoom() { return 7; },
    setView(point, zoom) { this.zoom = zoom; this.view = new Bounds(point.lat - 50, point.lng - 50, point.lat + 50, point.lng + 50); this.fire('move'); this.fire('zoomend'); },
    dragging: { enable() {}, disable() {} }, doubleClickZoom: { enable() {}, disable() {} },
    remove() {},
  });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.ResizeObserver = undefined;
  globalThis.L = {
    version: '1.6.0', CRS: { Simple: {} }, map: () => map,
    latLngBounds: () => new Bounds(-512, 0, 0, 331.25),
    tileLayer: () => ({ addTo() { return this; }, on() {} }),
    layerGroup: () => {
      const group = {
        layers: new Set(), clearCount: 0,
        addTo() { groups.push(this); return this; },
        addLayer(marker) { this.layers.add(marker); return this; },
        removeLayer(marker) { this.layers.delete(marker); return this; },
        hasLayer(marker) { return this.layers.has(marker); },
        clearLayers() { this.clearCount++; this.layers.clear(); },
      };
      return group;
    },
    divIcon: options => options,
    marker: (point, options) => {
      const marker = new Events();
      Object.assign(marker, { point, options, getLatLng() { return this.point; }, setIcon(icon) { this.options.icon = icon; }, addTo(group) { group.addLayer(this); return this; } });
      objects.push(marker);
      return marker;
    },
  };
  const { createWorldCityLeafletMap } = await import('../runtime/world-city-map-leaflet.mjs');
  const dragged = [];
  const controller = await createWorldCityLeafletMap({ getBoundingClientRect: () => ({ width: 800, height: 600 }), innerHTML: '' }, { isGM: true, onMarkerDragEnd: (...args) => dragged.push(args) });
  const markers = [{ id: 'center', x: .5, y: .3 }, { id: 'buffer', x: .65, y: .3 }, { id: 'far', x: .95, y: .95 }];
  controller.setMarkers(markers);
  return { controller, map, group: groups[3], objects, dragged };
}

test('map retains offscreen points for focus while rendering only the buffered viewport', async t => {
  const { controller, group, objects } = await setup(t);
  assert.equal(group.layers.size, 2, 'the distant point must not create a live DOM marker');
  assert.equal(objects.length, 3, 'all point objects remain available');
  assert.equal(controller.focusMarker('far', { zoom: 5 }), true);
  assert.equal(group.layers.has(objects[2]), true, 'focusing an offscreen point must reveal it');
  assert.equal(group.layers.has(objects[0]), false);
  controller.destroy();
});

test('short pans reuse live markers and boundary pans reveal points without rebuilding layers', async t => {
  const { controller, map, group, objects } = await setup(t);
  const clears = group.clearCount;
  map.view = new Bounds(-200, 105, -100, 205);
  map.fire('move');
  assert.equal(group.layers.has(objects[0]), true);
  assert.equal(group.layers.has(objects[1]), true, 'buffered pins stay mounted through a short pan');
  map.view = new Bounds(-512, 280, -412, 380);
  map.fire('move');
  assert.equal(group.layers.has(objects[2]), true, 'a point enters before the pan ends');
  assert.equal(group.clearCount, clears, 'panning must not clear or recreate all marker layers');
  controller.destroy();
});

test('panning keeps a dragged pin mounted and saves its normalized drop coordinates', async t => {
  const { controller, map, group, objects, dragged } = await setup(t);
  const marker = objects[0];
  marker.fire('dragstart');
  map.view = new Bounds(-512, 280, -412, 380);
  map.fire('move');
  assert.equal(group.layers.has(marker), true);
  marker.point = { lat: -460.8, lng: 298.125 };
  marker.fire('dragend');
  assert.deepEqual(dragged, [['center', { x: .9, y: .9 }]]);
  assert.equal(group.layers.has(marker), true);
  controller.destroy();
});

test('focus before the first fit uses a finite zoom, while an initialized view keeps its scale', async t => {
  const { controller, map } = await setup(t);
  controller.focusMarker('center');
  assert.equal(map.zoom, 4);
  map.zoom = undefined;
  controller.focusMarker('center');
  assert.equal(map.zoom, 0, 'uninitialized Leaflet zoom must not produce infinite tile bounds');
  controller.destroy();
});
