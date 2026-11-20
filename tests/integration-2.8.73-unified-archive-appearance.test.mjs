import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../runtime/archive-ui-utils.mjs", import.meta.url), "utf8");
const neuro = fs.readFileSync(new URL("../runtime/neuro-archive-controller.mjs", import.meta.url), "utf8");
const cyber = fs.readFileSync(new URL("../runtime/cyber-archive-controller.mjs", import.meta.url), "utf8");
const neo = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

test("2.8.73 uses a lightweight late runtime style for real text scaling without enlarging nav icons", () => {
  assert.match(ui, /function ensureArchiveAppearanceRuntimeStyle\(root\)/u);
  assert.match(ui, /data-archive-appearance-runtime/u);
  assert.match(ui, /#pcm-root#pcm-root/u, "late runtime style needs enough specificity to beat old hard-coded pixel rules");
  assert.match(ui, /--archive-font-small/u);
  assert.match(ui, /--archive-font-h1/u);
  assert.match(ui, /--archive-icon-size/u);
  assert.match(ui, /\.pcm-nav-strip>button>b/u);
  assert.doesNotMatch(ui.slice(ui.indexOf("export function applyArchiveTextScale"), ui.indexOf("export function observeArchiveTextScale")), /getComputedStyle|querySelectorAll\("\*"\)/u);
});

test("2.8.73 density changes shared geometry in Cyber and Neo through runtime metrics", () => {
  assert.match(ui, /function archiveDensityScale\(density\)/u);
  assert.match(ui, /compact[^\n]+0\.9/u);
  assert.match(ui, /spacious[^\n]+1\.15/u);
  assert.match(ui, /--archive-control-height/u);
  assert.match(ui, /--archive-card-pad/u);
  assert.match(ui, /--archive-main-pad/u);
  assert.match(ui, /--archive-gap/u);
  for (const source of [cyber, neo]) {
    assert.match(source, /state\.root\.dataset\.density = theme\.density/u);
    assert.match(source, /applyArchiveTextScale\(state\.root/u);
  }
});

test("2.8.73 highlight effects are shell-independent and off-soft-vivid are visually distinct", () => {
  assert.match(ui, /\[data-effects=soft\]/u);
  assert.match(ui, /\[data-effects=vivid\]/u);
  assert.match(ui, /\[data-effects=off\]/u);
  assert.match(ui, /archiveAppearancePulse/u);
  assert.match(ui, /box-shadow:[^;]+var\(--gold\)/u);
  assert.doesNotMatch(ui, /\[data-shell=datapad\]\[data-effects=/u, "shared effects must not depend on DATAPAD shell");
});

test("2.8.74 Neuro keeps font scaling but no longer exposes density and highlight controls", () => {
  assert.match(neuro, /fontSize:\s*Math\.min\(\s*26,\s*Math\.max\(12,/u);
  assert.match(neuro, /input type="range" min="12" max="26"/u);
  assert.doesNotMatch(neuro, /data-theme-field="density"/u);
  assert.doesNotMatch(neuro, /data-theme-field="effects"/u);
  assert.doesNotMatch(neuro, /state\.root\.dataset\.density = theme\.density/u);
  assert.doesNotMatch(neuro, /state\.root\.dataset\.effects = theme\.effects/u);
});
