import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("2.8.70 Forge strips stale migration metadata and preserves player Rule Elements access", () => {
  const catalog = read("forge/catalog.mjs");
  const generator = read("forge/generator.mjs");

  assert.match(catalog, /export function stripForgeMigrationMetadata/u);
  assert.match(catalog, /delete source\._stats/u);
  assert.match(catalog, /delete source\.system\._migration/u);
  assert.doesNotMatch(catalog, /source\._stats\s*=\s*\{\s*compendiumSource/u);
  assert.match(generator, /stripForgeMigrationMetadata\(actor\.toObject\(\), \{ recursive: true \}\)/u);
  assert.match(generator, /settings\.get\("pf2e", "minimumRulesUI"\)/u);
  assert.match(generator, /settings\.set\("pf2e", "minimumRulesUI", value\)/u);
  assert.match(generator, /finally\s*\{\s*await restoreMinimumRulesUI\(minimumRulesUI\)/u);
});
