import test from "node:test";
import assert from "node:assert/strict";
import {
  commLinkViewKeys,
  captureCommLinkView,
  restoreCommLinkView,
} from "../runtime/city-comm-link-view-state.mjs";

test("Network view identity isolates actors, teams, pages and dialogs from editable drafts", () => {
  const state = {
    mode: "master",
    runnerActorId: "a",
    activeGroupId: "g",
    masterTab: "jobs",
    modal: { type: "master-job", id: "j", groupId: "g", title: "First draft" },
  };
  const keys = commLinkViewKeys(state);
  assert.deepEqual(
    commLinkViewKeys({
      ...state,
      modal: { ...state.modal, title: "New draft", pay: 90 },
    }),
    keys,
  );
  for (const change of [
    { runnerActorId: "b" },
    { activeGroupId: "other" },
    { masterTab: "messages" },
    { mode: "edgerunner" },
  ]) {
    const next = commLinkViewKeys({ ...state, ...change });
    assert.notEqual(next.page, keys.page);
    assert.notEqual(next.modal, keys.modal);
  }
  const next = commLinkViewKeys({
    ...state,
    modal: { ...state.modal, id: "another-job" },
  });
  assert.equal(next.page, keys.page);
  assert.notEqual(next.modal, keys.modal);
});

function fixture() {
  const main = { scrollTop: 400, scrollLeft: 11, matches: () => false };
  const modal = {
    scrollTop: 200,
    scrollLeft: 0,
    matches: () => false,
    closest: () => ({}),
  };
  const chat = {
    scrollTop: 800,
    scrollLeft: 0,
    scrollHeight: 1000,
    clientHeight: 200,
    matches: () => true,
    closest: () => ({}),
  };
  const nodes = {
    ".cl-master-body main": [main],
    ".cl-modal-body": [modal],
    ".cl-chat-log": [chat],
  };
  const root = {
    ownerDocument: { activeElement: null },
    contains: () => false,
    querySelectorAll: (selector) => nodes[selector] || [],
  };
  return { root, main, modal, chat };
}

test("Network refresh captures the current offset and restores independent nested scroll areas", () => {
  const { root, main, modal, chat } = fixture();
  const keys = { page: "p", modal: "m" };
  const captured = captureCommLinkView(root, keys, keys);
  main.scrollTop = main.scrollLeft = modal.scrollTop = chat.scrollTop = 0;
  chat.scrollHeight += 140;
  restoreCommLinkView(root, captured);
  assert.equal(main.scrollTop, 400);
  assert.equal(main.scrollLeft, 11);
  assert.equal(modal.scrollTop, 200);
  assert.equal(
    chat.scrollTop,
    1140,
    "a reader at the end follows new messages",
  );
  chat.scrollTop = 90;
  const reading = captureCommLinkView(root, keys, keys);
  chat.scrollTop = 0;
  chat.scrollHeight += 120;
  restoreCommLinkView(root, reading);
  assert.equal(
    chat.scrollTop,
    90,
    "reading history does not jump on incoming messages",
  );
});

test("Network quick-dial grids on ordinary pages retain their own offset without an open modal", () => {
  const { root } = fixture();
  const dial = { scrollTop: 150, scrollLeft: 0, matches: () => false };
  const query = root.querySelectorAll;
  root.querySelectorAll = (selector) =>
    selector === ".cl-dial-grid" ? [dial] : query(selector);
  const keys = { page: "calls", modal: null };
  const state = captureCommLinkView(root, keys, keys);
  dial.scrollTop = 0;
  restoreCommLinkView(root, state);
  assert.equal(dial.scrollTop, 150);
});

test("Network navigation preserves its page behind dialogs without leaking another dialog or page offset", () => {
  const { root } = fixture();
  const previous = { page: "p", modal: "m" };
  assert.deepEqual(
    captureCommLinkView(root, previous, { page: "other", modal: "new" }).scroll,
    [],
  );
  assert.deepEqual(
    captureCommLinkView(root, previous, { page: "p", modal: "new" }).scroll.map(
      (entry) => entry.selector,
    ),
    [".cl-master-body main"],
  );
  assert.deepEqual(captureCommLinkView(root, null, previous).scroll, []);
});
