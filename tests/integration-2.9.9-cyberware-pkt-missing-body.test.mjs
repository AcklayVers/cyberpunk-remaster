import assert from "node:assert/strict";
import test from "node:test";
import { CyberwareTab } from "../sheets/CyberwareTab.js";

function replaceablePktBase() {
  return {
    id: "pkt-base-without-body",
    name: "Киберглаз ПКТ",
    type: "equipment",
    flags: {
      "cyberpunk-remaster": {
        cyberware: true,
        installed: true,
        implantType: "base",
        pktModelKey: "custom-model",
        pktReplaceable: true,
        pktReplaceableBase: true,
        pktFamily: "cyber-eye",
        pktModelSourceId: "current-base",
      },
    },
    system: {
      description: { value: "" },
      equipped: { carryType: "implanted" },
      traits: { value: [] },
    },
  };
}

test("PKT replacement options stay empty when a replaceable base has no installed PKT body", () => {
  const base = replaceablePktBase();
  const actor = { items: [base] };
  const catalog = [
    {
      itemId: "replacement-base",
      name: "Киберглаз ПКТ II",
      family: "cyber-eye",
      quality: 1,
      replaceable: true,
      slots: 2,
    },
  ];

  assert.doesNotThrow(() => {
    const options = CyberwareTab.pktBaseReplacementOptions(actor, base, catalog);
    assert.deepEqual(options, []);
  });
});

test("PKT body quality and flag lookup tolerate a missing item", () => {
  assert.equal(CyberwareTab.getFlag(undefined, "pktQuality"), undefined);
  assert.equal(Number.isNaN(CyberwareTab.getPktBodyQuality(undefined)), true);
});
