import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const viewUrl = new URL("../runtime/world-city-map-view.mjs", import.meta.url);
const viewSource = fs.readFileSync(viewUrl, "utf8");
const cssSource = fs.readFileSync(new URL("../styles/world-city-map.css", import.meta.url), "utf8");

test("2.9.3 removes the GM-wide linked-record visibility toggle from the marker editor", () => {
  assert.doesNotMatch(viewSource, /data-world-map-show-linked-in-detail/u);
  assert.doesNotMatch(viewSource, /Показывать связанные записи в карточке точки/u);
});

test("2.9.3 linked-record collapse preference is local to each user and each marker", async () => {
  const view = await import(`${viewUrl.href}?v293-key=${Date.now()}`);
  assert.equal(typeof view.worldMapDetailLinksCollapseStorageKey, "function");
  assert.equal(
    view.worldMapDetailLinksCollapseStorageKey("player-a"),
    "cyberpunk-remaster.world-city-map-detail-links-collapsed.v1.player-a",
  );
  assert.notEqual(
    view.worldMapDetailLinksCollapseStorageKey("player-a"),
    view.worldMapDetailLinksCollapseStorageKey("player-b"),
  );
  assert.match(viewSource, /readClientSet\(worldMapDetailLinksCollapseStorageKey\(\)\)/u);
  assert.match(viewSource, /collapsedDetailLinks\.has\(marker\.id\)/u);
});

test("2.9.3 detail card renders a compact collapsible linked-record header and keeps links available", () => {
  assert.match(viewSource, /data-world-map-action="toggle-detail-links"/u);
  assert.match(viewSource, /Связанные записи/u);
  assert.match(viewSource, /world-city-map-detail-links-toggle/u);
  assert.match(viewSource, /world-city-map-detail-links\s+collapsed/u);
  assert.match(viewSource, /saveCollapsedDetailLinks\(collapsedDetailLinks\)/u);
  assert.match(cssSource, /\.world-city-map-detail-links-toggle/u);
  assert.match(cssSource, /\.world-city-map-detail-links\.collapsed\s*\{[^}]*display:\s*none/u);
});
