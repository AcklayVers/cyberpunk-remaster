import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const controller = fs.readFileSync(new URL("../runtime/neo-archive-controller.mjs", import.meta.url), "utf8");
const uiUtils = fs.readFileSync(new URL("../runtime/archive-ui-utils.mjs", import.meta.url), "utf8");

test("2.8.72 caches Neo chat threads and unread counters instead of rescanning chat per thread", () => {
  assert.match(controller, /neuroMessageIndex:\s*null/u);
  assert.match(controller, /neuroMessageIndexDirty:\s*true/u);
  assert.match(controller, /neuroUnreadCache:\s*null/u);
  assert.match(controller, /function invalidateNeuroMessageIndex\(\)/u);
  assert.match(controller, /function ensureNeuroMessageIndex\(\)/u);
  assert.match(controller, /function ensureNeuroUnreadCache\(\)/u);
  assert.match(controller, /function neuroMessageArray\(\)\s*\{\s*return ensureNeuroMessageIndex\(\)\.allMessages;/u);
  assert.match(controller, /function neuroMessagesForThread\(threadId\)\s*\{\s*return neuroThreadRecords\(threadId\)\.map\(record => record\.message\);/u);
  assert.match(controller, /function neuroTotalUnread\(\)\s*\{\s*return ensureNeuroUnreadCache\(\)\.total;/u);
});

test("2.8.72 invalidates the Neo message cache only when chat messages actually change", () => {
  assert.match(controller, /const onNeuroMessageChanged = message => \{\s*const flag = neuroFlag\(message\);\s*if \( !flag \|\| !state\.root\?\.isConnected \) return;/u);
  assert.match(controller, /invalidateNeuroMessageIndex\(\);\s*render\(\);/u);
});

test("2.8.72 text scaling avoids a full DOM font traversal on open", () => {
  const start = uiUtils.indexOf("export function applyArchiveTextScale(root, { fontSize, baseFontSize } = {}) {");
  const end = uiUtils.indexOf("export function observeArchiveTextScale(root, getOptions) {");
  assert.ok(start >= 0 && end > start, "applyArchiveTextScale block must exist");
  const block = uiUtils.slice(start, end);
  assert.doesNotMatch(block, /querySelectorAll\("\*"\)/u);
  assert.doesNotMatch(block, /getComputedStyle/u);
  assert.match(block, /--archive-text-scale/u);
  assert.match(block, /--archive-user-font-size/u);
});
