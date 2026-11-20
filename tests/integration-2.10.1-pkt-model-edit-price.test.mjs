import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../runtime/implant-creator.mjs", import.meta.url), "utf8");

function functionBlock(name, nextAnchor) {
  const sync = source.indexOf(`function ${name}`);
  const asyncIndex = source.indexOf(`async function ${name}`);
  const start = sync >= 0 ? sync : asyncIndex;
  const end = source.indexOf(nextAnchor, start);
  assert.ok(start >= 0 && end > start, `${name} must exist`);
  return source.slice(start, end);
}

test("PKT preview uses editable model price for kit/total while keeping composition cost visible", () => {
  const totals = functionBlock("pktPreviewTotals", "\nfunction updatePktModelPriceMode");
  assert.match(totals, /pktModelPrice/u);
  assert.match(totals, /pktModelAutoPrice/u);
  assert.match(totals, /compositionPrice/u);
  assert.match(totals, /configuredKitPrice/u);
  assert.match(totals, /totalPrice\s*:\s*bodyPrice\s*\+\s*configuredKitPrice/u);

  assert.match(source, /Расч[её]тная цена состава/u);
  assert.match(source, /Цена комплекта без корпуса/u);
  assert.match(source, /totals\.compositionPrice/u, "copy-price action must use calculated composition, not the already-configured model price");
  assert.doesNotMatch(source, /form\.elements\.priceEddies\?\.addEventListener\("input"[\s\S]{0,400}pktModelPrice/u, "body/corpus price must not silently overwrite a manual model price");
});

test("registered custom PKT models can be reopened, edited, saved by id, and editing can be cancelled", () => {
  const manager = functionBlock("renderPktModelManager", "\nfunction enhanceNativeCustomPktCards");
  assert.match(manager, /data-edit-managed-pkt/u);
  assert.match(manager, /Редактировать/u);

  const begin = functionBlock("beginPktModelEdit", "\nfunction findStoredPktSnapshot");
  assert.match(begin, /setPktModelEditUi/u);
  assert.match(begin, /applyProfile/u);
  const profile = functionBlock("pktModelEditProfile", "\nfunction setPktModelEditUi");
  assert.match(profile, /baseComponentDefinitions|baseComponents/u);
  assert.match(profile, /extraComponentDefinitions|additionalComponents/u);

  const save = functionBlock("savePktModelEdit", "\nfunction cancelPktModelEdit");
  assert.match(save, /pktModelEditId/u);
  assert.match(save, /findIndex/u);
  assert.match(save, /existing\.id|modelId/u);
  assert.match(save, /setCustomPktModels/u);

  const cancel = functionBlock("cancelPktModelEdit", "\nfunction renderPktModelManager");
  assert.match(cancel, /pktModelEditId/u);
  assert.match(cancel, /applyPreset/u);

  assert.match(source, /Сохранить изменения модели/u);
  assert.match(source, /Отменить редактирование/u);
});
