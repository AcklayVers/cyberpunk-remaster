import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../runtime/archive-ui-utils.mjs", import.meta.url), "utf8");
const neo = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");
const cyber = fs.readFileSync(new URL("../runtime/cyber-archive-controller.mjs", import.meta.url), "utf8");
const neuroCss = fs.readFileSync(new URL("../styles/neuro-archive.css", import.meta.url), "utf8");

function runtimeCss() {
  const start = ui.indexOf("style.textContent = `");
  const end = ui.indexOf("`;", start);
  assert.ok(start >= 0 && end > start, "shared archive runtime CSS must exist");
  return ui.slice(start, end);
}

test("2.8.76 shared appearance layer does not override structural card/button heights", () => {
  const css = runtimeCss();
  assert.doesNotMatch(css, /:where\(button,input,select\)\{[^}]*min-height:/u);
  assert.doesNotMatch(css, /:where\(\.pcm-record-open,\.pcm-contact-open,\.pcm-person-open,\.pcm-related-row,\.pcm-tools-grid>button,\.pcm-search-results>button,\.pcm-neuro-thread-row\)\{[^}]*height:auto!important/u);
  assert.doesNotMatch(css, /:where\(\.pcm-recent>button,\.pcm-contact-list-card,\.pcm-related-row\)\{[^}]*min-height:/u);
});

test("2.8.76 shared appearance layer does not reposition structural card cells", () => {
  const css = runtimeCss();
  assert.doesNotMatch(css, /\.pcm-location-open>\.pcm-location-copy[^}]*align-self:center!important/u);
  assert.doesNotMatch(css, /\.pcm-neuro-thread-row>span:nth-child\(2\)[^}]*align-self:center!important/u);
  assert.doesNotMatch(css, /:where\(\.pcm-thumb,\.pcm-location-image,\.pcm-person-image,\.pcm-contact-photo,\.pcm-neuro-thread-avatar\)\{[^}]*align-self:stretch!important/u);
});

test("2.8.76 shared typography stays lightweight and leaves layout to each archive tab", () => {
  const css = runtimeCss();
  assert.match(css, /font-family:Arial,sans-serif!important/u);
  assert.match(css, /--archive-user-font-size/u);
  assert.doesNotMatch(css, /\.pcm-tools-grid>button>span[^}]*display:flex!important/u);
  assert.doesNotMatch(css, /button>span\{[^}]*align-self:center!important/u);
});


test("2.8.76 Neo density layer no longer flattens every button to a control height", () => {
  assert.doesNotMatch(neo, /#pcm-root button,\s*#pcm-root input,\s*#pcm-root select\{min-height:var\(--ui-control-height\)!important\}/u);
  assert.match(neo, /#pcm-root input,\s*#pcm-root select\{min-height:var\(--ui-control-height\)!important\}/u);
});


test("2.8.76 native location and Neuro network geometry remains authoritative", () => {
  assert.match(cyber, /#pcm-root \.pcm-location-open\{[^}]*min-height:145px[^}]*grid-template-columns:142px minmax\(0,1fr\) 22px/u);
  assert.match(neo, /#pcm-root \.pcm-location-open\{[^}]*min-height:145px[^}]*grid-template-columns:142px minmax\(0,1fr\) 22px/u);
  assert.match(neuroCss, /#pcm-root \.pcm-location-open \{[\s\S]{0,180}min-height: 145px/u);
  assert.match(neuroCss, /#pcm-root \.pcm-gm-contact-list > div > button \{[\s\S]{0,180}min-height: 58px/u);
});
