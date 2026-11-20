import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.65 — restore reference Neo layout */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.65 reference-layout CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.65 embedded Neo responsive classes use the rendered host width instead of stale floating-window prefs", () => {
  const geometry = source.match(/function applyWindowGeometry\(\) \{[\s\S]*?\n  \}\n\n  function autoGrowTextareas/u)?.[0] ?? "";
  assert.ok(geometry, "applyWindowGeometry should exist");
  assert.match(geometry, /const layoutWidth = state\.root\?\.classList\?\.contains\("field-archive-embedded"\)[\s\S]{0,280}getBoundingClientRect\?\.\(\)\.width[\s\S]{0,180}clientWidth[\s\S]{0,160}: visibleWidth;/u);
  assert.match(geometry, /classList\.toggle\("is-compact", !p\.minimized && layoutWidth < 1180\)/u);
  assert.match(geometry, /classList\.toggle\("is-narrow", !p\.minimized && layoutWidth < 820\)/u);
  assert.match(geometry, /classList\.toggle\("is-tiny", !p\.minimized && layoutWidth < 560\)/u);
  assert.match(source, /new ResizeObserver\(\(\) => \{[\s\S]{0,220}field-archive-embedded[\s\S]{0,180}applyWindowGeometry\(\)/u);
  assert.match(source, /embeddedLayoutObserver\?\.disconnect\?\.\(\)/u);
});

test("2.8.65 dashboard preserves the old two-column desktop composition until genuinely narrow", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-dashboard-grid\{[\s\S]{0,180}grid-template-columns:minmax\(0,1\.62fr\) minmax\(250px,\.78fr\)!important/u);
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-dashboard-grid\{[\s\S]{0,180}grid-template-columns:minmax\(0,1\.48fr\) minmax\(220px,\.72fr\)!important/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-dashboard-grid\{[\s\S]{0,100}grid-template-columns:1fr!important/u);
});

test("2.8.65 ordinary archive categories use compact multi-column record lists", () => {
  const css = cssBlock();
  assert.match(css, /\.pcm-window:not\(\.is-compact\) \.pcm-list\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-list\{grid-template-columns:1fr!important\}/u);
  assert.match(css, /\.pcm-record-open\{[\s\S]{0,260}min-height:72px!important[\s\S]{0,220}grid-template-columns:44px minmax\(0,1fr\) 18px!important/u);
  assert.match(css, /\.pcm-record-open>\.pcm-thumb\{[\s\S]{0,120}width:44px!important[\s\S]{0,80}height:44px!important/u);
});

test("2.8.65 contacts stay two-column except on actually narrow windows and use denser cards", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-contact-list\{[\s\S]{0,180}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/u);
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-contact-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-contact-list\{grid-template-columns:1fr!important\}/u);
  assert.match(css, /\.pcm-contact-open\{[\s\S]{0,220}min-height:76px!important[\s\S]{0,180}grid-template-columns:52px minmax\(0,1fr\) 16px!important/u);
  assert.match(css, /\.pcm-contact-photo\{[\s\S]{0,120}width:52px!important[\s\S]{0,80}height:52px!important/u);
});
