import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const neuro = fs.readFileSync(new URL("../runtime/neuro-archive-controller.mjs", import.meta.url), "utf8");
const cyber = fs.readFileSync(new URL("../runtime/cyber-archive-controller.mjs", import.meta.url), "utf8");
const neo = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles/neuro-archive.css", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../runtime/archive-ui-utils.mjs", import.meta.url), "utf8");

test("2.8.74 Neuro appearance no longer exposes density or glow controls", () => {
  const panelStart = neuro.indexOf("function themePanel");
  const panelEnd = neuro.indexOf("function helpPanel", panelStart);
  assert.ok(panelStart >= 0 && panelEnd > panelStart, "Neuro theme panel must exist");
  const panel = neuro.slice(panelStart, panelEnd);
  assert.doesNotMatch(panel, /Плотность/u);
  assert.doesNotMatch(panel, /Подсветка/u);
  assert.doesNotMatch(panel, /data-theme-field="density"/u);
  assert.doesNotMatch(panel, /data-theme-field="effects"/u);
});

test("2.8.74 all archive roots use the Neuro Arial font family", () => {
  assert.match(css, /font:\s*var\(--font-size\) Arial,\s* sans-serif;/u);
  assert.match(ui, /font-family:Arial,sans-serif!important/u);
  assert.match(ui, /h1,h2,h3,h4,h5,h6\)\{font-family:Arial,sans-serif!important/u);
});

test("2.8.76 shared Arial typography no longer overrides native control alignment", () => {
  assert.match(ui, /font-family:Arial,sans-serif!important/u);
  assert.doesNotMatch(ui, /:where\(button,input,select,textarea,option\)\{line-height:1\.25!important\}/u);
  assert.doesNotMatch(ui, /pcm-nav-strip>button,aside>button,\.pcm-top-actions>button,\.pcm-tools-panel button,\.pcm-section-head button\)\{align-items:center!important\}/u);
});
