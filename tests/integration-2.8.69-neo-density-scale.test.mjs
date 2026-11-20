import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.69 — real density geometry + component scaling */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.69 density CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.69 density setting produces an explicit geometry scale instead of changing only main padding", () => {
  assert.match(source, /const densityScale = theme\.density === "compact" \? 0\.90 : theme\.density === "spacious" \? 1\.15 : 1;/u);
  assert.match(source, /"--density-scale": String\(densityScale\)/u);
  assert.match(source, /const textUiScale = Math\.min\(1\.55, Math\.max\(0\.9, theme\.fontSize \/ DEFAULT_APPEARANCE\.fontSize\)\);/u);
  assert.match(source, /"--component-scale": String\(densityScale \* textUiScale\)/u);
  assert.match(source, /"--ui-control-height": `\$\{Math\.round\(38 \* densityScale \* textUiScale\)\}px`/u);
});

test("2.8.69 density scale drives controls, cards, dashboard rows and right navigation", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root\{[\s\S]{0,260}--ui-control-height:38px[\s\S]{0,260}--ui-card-pad:12px/u);
  assert.match(css, /#pcm-root input,[\s\S]{0,80}#pcm-root select\{[\s\S]{0,120}min-height:var\(--ui-control-height\)!important/u);
  assert.match(css, /#pcm-root \.pcm-capture,[\s\S]{0,240}#pcm-root \.pcm-detail-panel\{[\s\S]{0,180}padding:var\(--ui-card-pad\)!important/u);
  assert.match(css, /#pcm-root \.pcm-recent>button\{[\s\S]{0,180}min-height:var\(--ui-row-height\)!important/u);
  assert.match(css, /#pcm-root aside>button\{[\s\S]{0,180}min-height:var\(--ui-nav-height\)!important/u);
});

test("2.8.69 text scaling also enlarges key UI chrome rather than leaving fixed tiny geometry", () => {
  const css = cssBlock();
  assert.match(css, /--text-ui-scale:1;/u);
  assert.match(css, /#pcm-root \.pcm-stat-grid button\{[\s\S]{0,220}min-height:var\(--ui-stat-height\)!important/u);
  assert.match(css, /#pcm-root \.pcm-quick-save select,[\s\S]{0,160}min-height:var\(--ui-field-height\)!important/u);
  assert.match(css, /#pcm-root \.pcm-dashboard-subscriptions \.pcm-subscription-card\.compact\{[\s\S]{0,180}min-height:var\(--ui-service-height\)!important/u);
});
