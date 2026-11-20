import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../runtime/archive-ui-utils.mjs", import.meta.url), "utf8");

function runtimeCss() {
  const start = ui.indexOf("style.textContent = `");
  const end = ui.indexOf("`;", start);
  assert.ok(start >= 0 && end > start, "shared archive runtime CSS must exist");
  return ui.slice(start, end);
}

test("2.8.76 supersedes the broad 2.8.75 button-cell alignment override", () => {
  const css = runtimeCss();
  assert.doesNotMatch(css, /button>\s*:where\(i,b\)[^{]*\{[^}]*align-self:center!important/u);
  assert.doesNotMatch(css, /button>span\{[^}]*align-self:center!important/u);
  assert.doesNotMatch(css, /\.pcm-location-open>\.pcm-location-copy[^}]*align-self:center!important/u);
});

test("2.8.76 leaves media and complex card cells to their native tab CSS", () => {
  const css = runtimeCss();
  assert.doesNotMatch(css, /:where\(\.pcm-thumb,\.pcm-location-image,\.pcm-person-image,\.pcm-contact-photo,\.pcm-neuro-thread-avatar\)\{[^}]*align-self:stretch!important/u);
  assert.doesNotMatch(css, /\.pcm-tools-grid>button>span[^}]*display:flex!important/u);
});

test("2.8.76 shared font layer remains lightweight", () => {
  const css = runtimeCss();
  assert.match(css, /font-family:Arial,sans-serif!important/u);
  assert.doesNotMatch(css, /time,span,b\)\{font-size:inherit!important\}/u);
});
