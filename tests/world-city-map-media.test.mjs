import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const url = new URL("../runtime/world-city-map-media.mjs", import.meta.url);
async function load() {
  const m = await import(url.href).catch(() => null);
  assert.ok(m, "media module must exist");
  return m;
}
test("catalogue photos cover p1-p65 including existing ncm prefix", async () => {
  const m = await load();
  for (let i = 1; i <= 65; i++) {
    const media = m.resolveWorldMapMarkerMedia({ catalogId: `ncm:p${i}` });
    assert.equal(
      media.cover.path,
      `modules/cyberpunk-remaster/assets/night-city/places/p${i}.webp`,
    );
    assert.ok(
      existsSync(
        new URL(`../assets/night-city/places/p${i}.webp`, import.meta.url),
      ),
    );
  }
  assert.equal(
    m.resolveWorldMapMarkerMedia({ catalogId: "other" }).cover,
    null,
  );
});
test("custom, hidden and empty galleries resolve predictably", async () => {
  const m = await load();
  assert.equal(
    m.resolveWorldMapMarkerMedia({ catalogId: "p4", media: { mode: "hidden" } })
      .cover,
    null,
  );
  assert.match(
    m.resolveWorldMapMarkerMedia({
      catalogId: "p4",
      media: { mode: "custom", gallery: [] },
    }).cover.path,
    /p4.webp$/,
  );
  assert.equal(
    m.resolveWorldMapMarkerMedia({
      catalogId: "p4",
      media: {
        mode: "custom",
        coverId: "bad",
        gallery: [{ id: "x", path: "worlds/x.webp" }],
      },
    }).cover.id,
    "x",
  );
});
test("image URLs reject executable and binary data but preserve valid files", async () => {
  const m = await load();
  for (const path of [
    "javascript:alert(1)",
    "data:image/png;base64,abc",
    "C:/private/photo.webp",
    "<img onerror=x>",
    "//foreign/x",
  ]) {
    assert.equal(m.safeWorldMapImagePath(path), "");
  }
  assert.equal(
    m.safeWorldMapImagePath("worlds/city/photo.webp"),
    "worlds/city/photo.webp",
  );
  assert.equal(
    m.safeWorldMapImagePath("https://example.com/x.webp"),
    "https://example.com/x.webp",
  );
});
test("viewer cannot publish images to connected players", async () => {
  const m = await load();
  globalThis.game = { user: { isGM: false } };
  await assert.rejects(
    () => m.showWorldMapImageToPlayers({ path: "worlds/x.webp" }),
    /ведущ/,
  );
});
