import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.66 — full-width Neo workspace + persistent UI */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.66 full-width UI CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.66 Neo navigation is horizontal and main workspace uses the full width", () => {
  assert.match(source, /<aside class="pcm-nav-bar"><div class="pcm-nav-strip">/u);
  assert.match(source, /<\/div><label class="pcm-goal"[^>]*>[\s\S]*?<\/label><\/aside><main>/u);
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-layout\{[\s\S]{0,220}grid-template-columns:1fr!important[\s\S]{0,220}grid-template-rows:auto minmax\(0,1fr\)!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip\{[\s\S]{0,240}display:flex!important[\s\S]{0,180}flex-wrap:nowrap!important[\s\S]{0,180}overflow-x:auto!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button\{[\s\S]{0,180}flex:0 0 auto!important/u);
  assert.match(css, /#pcm-root main\{[\s\S]{0,180}width:100%!important[\s\S]{0,120}max-width:none!important/u);
  assert.match(css, /#pcm-root \.pcm-record-console,[\s\S]{0,120}#pcm-root \.pcm-detail\{[\s\S]{0,180}width:100%!important[\s\S]{0,120}max-width:none!important/u);
  assert.match(css, /#pcm-root \.pcm-record-lower-grid\{grid-template-columns:1fr!important\}/u);
  assert.match(css, /#pcm-root \.pcm-record-lower-grid>\.pcm-record-side\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/u);
});

test("2.8.66 text size control has a useful range and dashboard controls no longer stay tiny", () => {
  assert.match(source, /type="range" min="12" max="26" step="1" data-theme-field="fontSize"/u);
  assert.match(source, /fontSize: Math\.min\(26, Math\.max\(12,/u);
  assert.match(source, /field === "fontSize" \) theme\.fontSize = Math\.min\(26, Math\.max\(12,/u);
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-capture h2,[\s\S]{0,160}font-size:15px!important/u);
  assert.match(css, /#pcm-root \.pcm-capture-actions button\{[\s\S]{0,160}min-height:34px!important[\s\S]{0,120}font-size:10px!important/u);
  assert.match(css, /#pcm-root \.pcm-stat-grid button\{[\s\S]{0,180}min-height:48px!important/u);
  assert.match(css, /#pcm-root \.pcm-stat-grid button span\{[\s\S]{0,100}font-size:10px!important/u);
  assert.match(css, /#pcm-root \.pcm-quick-save select,[\s\S]{0,120}height:34px!important[\s\S]{0,120}font-size:10px!important/u);
});

test("2.8.66 active tracker is a compact inline field instead of consuming sidebar height", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-nav-bar\{[\s\S]{0,220}grid-template-columns:minmax\(0,1fr\) minmax\(220px,320px\)!important/u);
  assert.match(css, /#pcm-root \.pcm-goal\{[\s\S]{0,240}margin:0!important[\s\S]{0,220}grid-template-columns:auto minmax\(0,1fr\)!important/u);
  assert.match(css, /#pcm-root \.pcm-goal textarea\{[\s\S]{0,120}height:34px!important[\s\S]{0,120}min-height:34px!important/u);
});

test("2.8.66 rerenders preserve open dossier sections and scroll positions", () => {
  assert.match(source, /openDetails: new Set\(\)/u);
  assert.match(source, /scrollState: \{ mainTop: 0, navLeft: 0, navTop: 0, viewKey: "" \}/u);
  assert.match(source, /data-persist-key="entry:\$\{entry\.id\}:details"/u);
  assert.match(source, /data-persist-key="entry:\$\{entry\.id\}:attachments"/u);
  assert.match(source, /details\.matches\?\.\("details\[data-persist-key\]"\)/u);
  assert.match(source, /state\.openDetails\.add\(details\.dataset\.persistKey\)/u);
  const renderFn = source.match(/function render\(\) \{[\s\S]*?\n  \}\n\n  function dataUrlFromImage/u)?.[0] ?? "";
  assert.ok(renderFn, "render should exist");
  assert.match(renderFn, /nextViewKey[\s\S]{0,240}previousMain[\s\S]{0,240}state\.scrollState\.mainTop/u);
  assert.match(renderFn, /previousNav[\s\S]{0,180}state\.scrollState\.navLeft/u);
  assert.match(renderFn, /main\.scrollTop = state\.scrollState\.mainTop/u);
  assert.match(renderFn, /navStrip\.scrollLeft = state\.scrollState\.navLeft/u);
});
