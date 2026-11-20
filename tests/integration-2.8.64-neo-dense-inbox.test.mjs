import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.64 — dense Neo dashboard + inbox layout */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.64 dense Neo dashboard CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.64 inbox uses a dedicated header and row layout instead of the generic section header", () => {
  const inbox = source.match(/function inboxView\(book\) \{[\s\S]*?\n  \}\n\n  function cityMapView/u)?.[0] ?? "";
  assert.ok(inbox, "inboxView should exist");
  assert.match(inbox, /<section class="pcm-inbox-view">/u);
  assert.match(inbox, /<header class="pcm-inbox-head">/u);
  assert.match(inbox, /class="pcm-inbox-copy"/u);
  assert.match(inbox, /class="primary pcm-inbox-resolve"/u);
  assert.doesNotMatch(inbox, /<div class="pcm-section-head">/u);
});

test("2.8.64 dashboard is dense: status strip is short and category tiles scale from six to one columns", () => {
  const css = cssBlock();
  assert.match(css, /\.pcm-cyber-alert\{[\s\S]{0,260}grid-template-columns:minmax\(0,1fr\) auto!important[\s\S]{0,220}padding:6px 9px!important/u);
  assert.match(css, /\.pcm-attention-sign,\s*#pcm-root \.pcm-cyber-date\{display:none!important\}/u);
  assert.match(css, /\.pcm-window:not\(\.is-compact\) \.pcm-stat-grid\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-stat-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-narrow:not\(\.is-tiny\) \.pcm-stat-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/u);
  assert.match(css, /\.pcm-window\.is-tiny \.pcm-stat-grid\{grid-template-columns:1fr!important\}/u);
});

test("2.8.64 inbox rows wrap safely and stack actions only on narrow windows", () => {
  const css = cssBlock();
  assert.match(css, /\.pcm-inbox-row\{[\s\S]{0,260}grid-template-columns:minmax\(0,1fr\) auto!important/u);
  assert.match(css, /\.pcm-inbox-copy\{[\s\S]{0,260}grid-template-columns:28px minmax\(0,1fr\)!important/u);
  assert.match(css, /\.pcm-inbox-copy strong,\s*#pcm-root \.pcm-inbox-copy em,[\s\S]{0,360}overflow-wrap:anywhere!important/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-inbox-row\{grid-template-columns:1fr!important\}/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-inbox-resolve\{[\s\S]{0,120}width:100%!important/u);
});

test("2.8.64 quick log and recent records stay vertically compact", () => {
  const css = cssBlock();
  assert.match(css, /\.pcm-quick textarea\{[\s\S]{0,180}height:44px!important[\s\S]{0,120}min-height:44px!important/u);
  assert.match(css, /\.pcm-recent>button\{[\s\S]{0,180}min-height:30px!important/u);
  assert.match(css, /\.pcm-stat-grid button\{[\s\S]{0,180}min-height:40px!important/u);
});
