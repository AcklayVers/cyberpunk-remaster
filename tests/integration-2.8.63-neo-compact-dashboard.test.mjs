import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function compactRepairCss() {
  const marker = "/* 2.8.63 — compact Neo dashboard repair */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.63 compact dashboard repair block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.63 hides the queue card entirely when there is nothing to review", () => {
  const dashboard = source.match(/function dashboard\(book\) \{[\s\S]*?\n  \}\n\n  function sortedEntries/u)?.[0] ?? "";
  assert.ok(dashboard, "dashboard renderer should exist");
  assert.match(dashboard, /\$\{inboxCount \? `<section class="pcm-recent pcm-inbox-preview"[\s\S]*?` : ""\}/u);
  assert.doesNotMatch(dashboard, /<small>ОЧЕРЕДЬ<\/small><b>00<\/b><span>НЕТ ДАННЫХ НА РАЗБОР<\/span>/u);
});

test("2.8.63 compact Neo overview keeps dashboard structure instead of stacking everything vertically", () => {
  const css = compactRepairCss();
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-dashboard-grid\{[\s\S]{0,220}grid-template-columns:minmax\(0,1\.45fr\) minmax\(210px,\.72fr\)!important/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-dashboard-grid\{[\s\S]{0,120}grid-template-columns:1fr!important/u);
  assert.match(css, /\.pcm-dashboard-main,#pcm-root \.pcm-dashboard-side\{[\s\S]{0,140}gap:8px!important/u);
  assert.match(css, /\.pcm-quick textarea\{[\s\S]{0,160}min-height:52px!important/u);
  assert.match(css, /\.pcm-cyber-mini\{[\s\S]{0,160}min-height:52px!important/u);
});

test("2.8.63 contact directories stay two-column while there is enough room", () => {
  const css = compactRepairCss();
  assert.match(css, /\.pcm-window\.is-compact:not\(\.is-narrow\) \.pcm-contact-list\{[\s\S]{0,160}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/u);
  assert.match(css, /\.pcm-window\.is-narrow \.pcm-contact-list\{[\s\S]{0,120}grid-template-columns:1fr!important/u);
  assert.match(css, /\.pcm-contact-open\{[\s\S]{0,160}min-height:82px!important/u);
});
