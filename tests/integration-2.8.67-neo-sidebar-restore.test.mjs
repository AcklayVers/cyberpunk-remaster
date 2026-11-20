import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.67 — restore right navigation + wide tracker */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.67 sidebar restore CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.67 restores the right navigation column instead of the horizontal strip", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-layout\{[\s\S]{0,260}grid-template-columns:minmax\(0,1fr\) clamp\(250px,22%,300px\)!important[\s\S]{0,180}grid-template-areas:"main aside"!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-bar\{[\s\S]{0,240}display:grid!important[\s\S]{0,160}grid-template-rows:minmax\(0,1fr\) auto!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip\{[\s\S]{0,240}display:flex!important[\s\S]{0,160}flex-direction:column!important[\s\S]{0,180}overflow-y:auto!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button\{[\s\S]{0,220}width:100%!important[\s\S]{0,180}grid-template-columns:24px minmax\(0,1fr\) 24px!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip \.pcm-caption\{display:block!important;[^}]*\}/u);
});

test("2.8.67 keeps the active tracker wide and pinned under the scrollable navigation", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-goal\{[\s\S]{0,220}width:100%!important[\s\S]{0,180}grid-template-columns:1fr!important/u);
  assert.match(css, /#pcm-root \.pcm-goal textarea\{[\s\S]{0,180}min-height:72px!important[\s\S]{0,160}white-space:pre-wrap!important/u);
  assert.match(css, /#pcm-root \.pcm-window\.nav-collapsed \.pcm-goal\{display:none!important\}/u);
});

test("2.8.67 collapsed sidebar stays icon-only while expanded compact mode keeps labels", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-window\.nav-collapsed \.pcm-layout\{[\s\S]{0,180}grid-template-columns:minmax\(0,1fr\) 58px!important/u);
  assert.match(css, /#pcm-root \.pcm-window\.nav-collapsed \.pcm-nav-strip>button>span,[\s\S]{0,160}display:none!important/u);
  assert.match(css, /#pcm-root \.pcm-window\.is-compact:not\(\.nav-collapsed\) \.pcm-layout\{[\s\S]{0,200}grid-template-columns:minmax\(0,1fr\) clamp\(230px,30%,285px\)!important/u);
});

test("2.8.67 preserves vertical navigation scroll and keeps map-link panels full width", () => {
  assert.match(source, /scrollState: \{ mainTop: 0, navLeft: 0, navTop: 0, viewKey: "" \}/u);
  assert.match(source, /state\.scrollState\.navTop = previousNav\.scrollTop/u);
  assert.match(source, /navStrip\.scrollTop = state\.scrollState\.navTop/u);
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-world-map-links\{[\s\S]{0,180}grid-column:1\/-1!important[\s\S]{0,120}width:100%!important/u);
});
