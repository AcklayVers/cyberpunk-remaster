import test from "node:test";
import assert from "node:assert/strict";
import { cityShopPriceCredits } from "../runtime/city-shop-catalog.mjs";

const MID = "cyberpunk-remaster";
async function exportedComponent(price) {
  const row = {
    uuid: "Item.CreditBase000001",
    itemId: "CreditBase000001",
    name: "Рука",
    quantity: 1,
    hardCost: 1,
    stressFormula: "0",
    priceEddies: price,
    hard: "normal",
    stress: "normal",
    family: "cyber-arm",
    source: {
      name: "Рука",
      type: "equipment",
      system: {
        description: { value: "" },
        price: { value: { credits: 75 }, per: 1 },
        rules: [],
        traits: { value: [] },
      },
      flags: {
        [MID]: { cyberware: true, implantType: "base", pktFamily: "cyber-arm" },
      },
    },
  };
  const catalog = [
    {
      id: "credits-test",
      name: "Credits test",
      baseComponents: [row],
      components: [row],
      additionalComponents: [],
    },
  ];
  globalThis.Hooks = { on() {}, once() {}, callAll() {} };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    system: { id: "sf2e" },
    modules: new Map([[MID, { active: true, version: "2.18.0" }]]),
    settings: { get: () => JSON.stringify(catalog) },
    actors: new Map(),
  };
  globalThis.foundry = {
    utils: { deepClone: (value) => structuredClone(value) },
  };
  globalThis.document = {
    createElement: () => ({ innerHTML: "", textContent: "" }),
  };
  globalThis.saveDataToFile = () => {};
  const { exportPktModel } = await import("../runtime/implant-creator.mjs");
  return (await exportPktModel("credits-test")).model.baseComponents[0];
}

test("PKT snapshots replace a native credit price instead of adding legacy silver to it", async () => {
  const row = await exportedComponent(200);
  assert.equal(cityShopPriceCredits(row.source.system.price), 200);
  assert.equal(row.source.system.price.per, 1);
});

test("setting a PKT component price to zero clears the previous native credit value", async () => {
  const row = await exportedComponent(0);
  assert.equal(cityShopPriceCredits(row.source.system.price), 0);
});
