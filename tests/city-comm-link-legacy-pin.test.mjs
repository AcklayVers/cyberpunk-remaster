import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import * as core from "../runtime/city-comm-link-core.mjs";

const digest = (pin) =>
  createHash("sha256").update(`COMM-LINK:${pin}`).digest("hex");

test("old macro HTTP PINs match exactly on both secure and insecure origins; new hashes stay SHA-256", async () => {
  assert.equal(typeof core.verifyCommLinkPin, "function");
  for (const cryptoApi of [{}, webcrypto]) {
    for (const pin of ["1234", "0000", "87654321"]) {
      assert.equal(
        await core.verifyCommLinkPin(pin, `fallback:${pin}`, cryptoApi),
        true,
      );
      assert.equal(
        await core.verifyCommLinkPin(` ${pin} `, `fallback:${pin}`, cryptoApi),
        true,
      );
      assert.equal(
        await core.verifyCommLinkPin("999999", `fallback:${pin}`, cryptoApi),
        false,
      );
      assert.equal(
        await core.verifyCommLinkPin(pin, digest(pin), cryptoApi),
        true,
      );
      assert.equal(await core.hashCommLinkPin(pin, cryptoApi), digest(pin));
    }
    assert.equal(
      await core.verifyCommLinkPin("", "fallback:", cryptoApi),
      false,
    );
    assert.equal(
      await core.verifyCommLinkPin("1234", "unknown-format", cryptoApi),
      false,
    );
    assert.equal(await core.verifyCommLinkPin("", "", cryptoApi), true);
  }
});

test("profile lookup combines legacy and current Actors, retaining explicit current PIN removal", () => {
  assert.equal(typeof core.readCommLinkProfiles, "function");
  const user = {
    character: { id: "main" },
    flags: {
      commLinkNetwork: {
        profiles: {
          old: {
            displayName: "Legacy",
            pinHash: "fallback:0000",
            skin: "night-cyan",
          },
          disabled: { pinHash: "fallback:1234" },
          changed: { pinHash: "fallback:1234" },
        },
      },
      "cyberpunk-remaster": {
        commLink: {
          profiles: {
            current: { pinHash: digest("5678") },
            disabled: { pinHash: "" },
            changed: { pinHash: digest("8765") },
          },
        },
      },
    },
  };
  const before = JSON.stringify(user);
  const profiles = core.readCommLinkProfiles(user);
  assert.equal(profiles.old.pinHash, "fallback:0000");
  assert.equal(profiles.current.pinHash, digest("5678"));
  assert.equal(profiles.disabled.pinHash, "");
  assert.equal(profiles.changed.pinHash, digest("8765"));
  profiles.old.displayName = "Local copy";
  assert.equal(JSON.stringify(user), before);
});

test("old single profile stays attached to its own saved Actor, independent of the new selected Actor", () => {
  assert.equal(typeof core.readCommLinkProfiles, "function");
  const user = {
    character: { id: "main" },
    flags: {
      commLinkNetwork: {
        activeActorId: "darcy",
        profile: { pinHash: "fallback:1234", skin: "night-cyan" },
      },
      "cyberpunk-remaster": {
        commLink: {
          activeActorId: "other",
          profiles: { other: { pinHash: "" } },
        },
      },
    },
  };
  const profiles = core.readCommLinkProfiles(user);
  assert.equal(profiles.darcy.pinHash, "fallback:1234");
  assert.equal(profiles.other.pinHash, "");
  assert.equal(profiles.main, undefined);
});
