import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mapModel = fs.readFileSync(new URL("../runtime/world-city-map.mjs", import.meta.url), "utf8");
const mapView = fs.readFileSync(new URL("../runtime/world-city-map-view.mjs", import.meta.url), "utf8");

test("2.9.0 map markers persist a per-marker linked-record visibility flag defaulting to true", () => {
  assert.match(mapModel, /showLinkedInDetail:\s*raw\?\.showLinkedInDetail\s*!==\s*false/u);
});

