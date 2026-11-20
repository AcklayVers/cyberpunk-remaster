import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");

function cssBlock() {
  const marker = "/* 2.8.68 — Neo modal + queue + map + neon sidebar + linked contacts */";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "2.8.68 UI polish CSS block must exist");
  return source.slice(start, source.indexOf("${EMBEDDED_HOST_CSS}", start));
}

test("2.8.68 appearance modal can use the full viewport and scroll independently of the archive window", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-modal-backdrop\{[\s\S]{0,260}position:fixed!important[\s\S]{0,260}align-items:flex-start!important[\s\S]{0,180}overflow-y:auto!important/u);
  assert.match(css, /#pcm-root \.pcm-theme-panel\{[\s\S]{0,260}width:min\(1040px,calc\(100vw - 48px\)\)!important[\s\S]{0,220}max-height:none!important/u);
  assert.match(css, /#pcm-root \.pcm-theme-panel>header\{[\s\S]{0,180}position:sticky!important[\s\S]{0,160}top:0!important/u);
});

test("2.8.68 dashboard review queue is rendered in the same compact row language as recent records", () => {
  assert.match(source, /const inboxPreview = inboxEntries\(book\)\.slice\(0, 5\)/u);
  assert.match(source, /<section class="pcm-recent pcm-inbox-preview">/u);
  assert.match(source, /pcm-inbox-preview[\s\S]{0,1200}data-action="open-inbox-entry"/u);
  assert.doesNotMatch(source, /<section class="pcm-inbox-banner">/u);
});

test("2.8.68 map links consume the dossier width and use a readable horizontal control layout", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-world-map-links\{[\s\S]{0,220}grid-column:1\/-1!important[\s\S]{0,160}width:100%!important[\s\S]{0,180}min-height:150px!important/u);
  assert.match(css, /#pcm-root \.pcm-world-map-link-add\{[\s\S]{0,180}grid-template-columns:minmax\(220px,1fr\) auto!important/u);
});

test("2.8.68 right navigation is slightly larger and restores neon dots, active glow and neon counters", () => {
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-layout\{[\s\S]{0,220}grid-template-columns:minmax\(0,1fr\) clamp\(280px,24%,330px\)!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button\{[\s\S]{0,220}min-height:43px!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button::before\{[\s\S]{0,220}border-radius:50%!important[\s\S]{0,180}box-shadow:0 0 8px var\(--teal\)!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button\.active\{[\s\S]{0,220}box-shadow:[^}]*var\(--accent-soft\)!important/u);
  assert.match(css, /#pcm-root \.pcm-nav-strip>button>i\{[\s\S]{0,220}color:var\(--teal\)!important[\s\S]{0,180}text-shadow:0 0 8px var\(--teal\)!important/u);
});

test("2.8.68 linked contacts inside directory dossiers get their own larger card grid", () => {
  assert.match(source, /<div class="pcm-contact-list pcm-directory-linked-contacts">/u);
  const css = cssBlock();
  assert.match(css, /#pcm-root \.pcm-directory-linked-contacts\{[\s\S]{0,220}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/u);
  assert.match(css, /#pcm-root \.pcm-directory-linked-contacts \.pcm-contact-open\{[\s\S]{0,260}min-height:108px!important[\s\S]{0,180}grid-template-columns:72px minmax\(0,1fr\) 20px!important/u);
  assert.match(css, /#pcm-root \.pcm-directory-linked-contacts \.pcm-contact-photo\{[\s\S]{0,160}width:72px!important[\s\S]{0,120}height:72px!important/u);
});
