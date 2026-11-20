import test from "node:test";
import assert from "node:assert/strict";

import { resolveContactChatPayload } from "../runtime/neuro-archive-controller.mjs";

test("2.8.61: ordinary chat messages only query the valid module flag scope", () => {
  const calls = [];
  const message = {
    flags: {},
    getFlag(scope, key) {
      calls.push([scope, key]);
      if (scope === "cyberpunkRemaster") {
        throw new Error('Flag scope "cyberpunkRemaster" is not valid or not currently active');
      }
      return undefined;
    },
  };

  assert.equal(resolveContactChatPayload(message), null);
  assert.deepEqual(calls, [["cyberpunk-remaster", "neuroArchive"]]);
});

test("2.8.61: legacy raw chat flags remain readable without invalid getFlag calls", () => {
  const payload = { id: "legacy-message" };
  let getFlagCalled = false;
  const message = {
    flags: {
      cyberpunkRemaster: {
        neuroArchive: { contactMessage: payload },
      },
    },
    getFlag() {
      getFlagCalled = true;
      throw new Error("legacy getFlag must not be used");
    },
  };

  assert.equal(resolveContactChatPayload(message), payload);
  assert.equal(getFlagCalled, false);
});

test("2.8.61: canonical chat flags are read from cyberpunk-remaster", () => {
  const payload = { id: "canonical-message" };
  const message = {
    flags: {
      "cyberpunk-remaster": {
        neuroArchive: { contactMessage: payload },
      },
    },
  };

  assert.equal(resolveContactChatPayload(message), payload);
});

test("2.8.61: outgoing contact chat messages use the module id as flag scope", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../runtime/city-messaging.mjs", import.meta.url), "utf8");
  assert.match(source, /flags:\s*\{\s*\[MID\]:/u);
  assert.doesNotMatch(source, /getFlag\?\.\("cyberpunkRemaster",\s*"neuroArchive"\)/u);
});
