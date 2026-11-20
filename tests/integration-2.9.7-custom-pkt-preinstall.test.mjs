import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../runtime/implant-creator.mjs", import.meta.url), "utf8");

function functionBlock(name, nextAnchor) {
  const start = source.indexOf(`function ${name}`) >= 0
    ? source.indexOf(`function ${name}`)
    : source.indexOf(`async function ${name}`);
  const end = source.indexOf(nextAnchor, start);
  assert.ok(start >= 0 && end > start, `${name} must exist`);
  return source.slice(start, end);
}

test("custom PKT components are marked installed before capacity validation and embedded creation", () => {
  const helper = functionBlock("prepareCustomPktInstalledSource", "\nfunction customPktInstallationFailureMessage");
  assert.match(helper, /preCreateInstallationSource/u, "must reuse the native installation-state builder");
  assert.match(helper, /setProperty/u, "native dotted installation paths must be materialized onto the source");

  const fn = functionBlock("installCustomPktViaNative", "\nconst CIC_REPLACEMENT_PREFIX");
  const installStateIndex = fn.indexOf("prepareCustomPktInstalledSource");
  const capacityIndex = fn.indexOf("validateProjectedImplantCapacity(actor, createData)");
  const createIndex = fn.indexOf('createEmbeddedDocuments("Item", createData');
  assert.ok(installStateIndex >= 0 && installStateIndex < capacityIndex, "installation state must be applied before projected-capacity validation");
  assert.ok(capacityIndex >= 0 && capacityIndex < createIndex, "projected validation must happen before Foundry creation");
});

test("custom PKT install failure reports component names instead of only a generic state error", () => {
  const helper = functionBlock("customPktInstallationFailureMessage", "\nasync function installCustomPktViaNative");
  assert.match(helper, /не установлены/u);
  assert.match(helper, /item\?\.name|item\.name/u);

  const fn = functionBlock("installCustomPktViaNative", "\nconst CIC_REPLACEMENT_PREFIX");
  assert.match(fn, /customPktInstallationFailureMessage/u);
});
