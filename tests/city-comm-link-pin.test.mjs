import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { TextDecoder } from "node:util";
import { hashCommLinkPin } from "../runtime/city-comm-link-core.mjs";

const expected = (pin) =>
  createHash("sha256").update(`COMM-LINK:${pin}`).digest("hex");

test("HTTP PIN hashing matches stored native SHA-256 for short, Unicode and multi-block inputs", async () => {
  for (const value of [
    "1234",
    "00000000",
    "87654321",
    " PIN Найт-Сити🔐 ",
    "x".repeat(46),
    "y".repeat(47),
    "z".repeat(48),
    "a".repeat(1000),
  ]) {
    const clean = value.trim();
    const hash = await hashCommLinkPin(value, {});
    assert.equal(hash, expected(clean));
    assert.equal(hash, await hashCommLinkPin(value, webcrypto));
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});

test("PIN hashing without Crypto preserves whitespace and blank handling, and rejects a different PIN", async () => {
  for (const cryptoApi of [
    null,
    {},
    { subtle: {} },
    { subtle: { digest: null } },
  ]) {
    assert.equal(await hashCommLinkPin(" 1234 ", cryptoApi), expected("1234"));
    assert.notEqual(await hashCommLinkPin("4321", cryptoApi), expected("1234"));
    for (const empty of ["", " ", null, undefined])
      assert.equal(await hashCommLinkPin(empty, cryptoApi), "");
  }
});

test("available native SHA-256 remains the preferred path and native failures remain visible", async () => {
  let calls = 0;
  const subtle = {
    async digest(algorithm, bytes) {
      calls++;
      assert.equal(this, subtle);
      assert.equal(algorithm, "SHA-256");
      assert.equal(new TextDecoder().decode(bytes), "COMM-LINK:1234");
      return createHash("sha256").update(bytes).digest();
    },
  };
  assert.equal(await hashCommLinkPin("1234", { subtle }), expected("1234"));
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      hashCommLinkPin("1234", {
        subtle: {
          async digest() {
            throw Error("Native digest failed");
          },
        },
      }),
    /Native digest failed/,
  );
});
