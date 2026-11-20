import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CyberwareTab } from "../sheets/CyberwareTab.js";
import { clearPktCatalogCache, loadPktCatalog } from "../runtime/pkt-catalog.mjs";

const models = JSON.parse(
  readFileSync(new URL("../data/pkt-models.json", import.meta.url), "utf8"),
);
const template = readFileSync(
  new URL("../templates/cyberware-tab.hbs", import.meta.url),
  "utf8",
);

test("module ships no built-in ready PKT model presets", () => {
  assert.deepEqual(models, []);
});

test("empty built-in PKT catalog remains a valid catalog and keeps replacement data", async () => {
  clearPktCatalogCache();
  const itemIndex = [
    {
      _id: "base000000000001",
      name: "Тестовая база I (ПКТ)",
      img: "icons/svg/item-bag.svg",
      system: { level: { value: 4 } },
      flags: {
        "cyberpunk-remaster": {
          pktReplaceable: true,
          pktFamily: "test-family",
          pktGrade: 1,
          implantType: "base",
          slots: 2,
        },
      },
    },
  ];
  const itemPack = {
    getIndex: async () => itemIndex,
    getDocument: async (id) => itemIndex.find((entry) => entry._id === id) ?? null,
  };
  const journalPack = {
    getDocuments: async () => [
      {
        pages: [
          {
            flags: { "cyberpunk-remaster": {} },
          },
        ],
      },
    ],
  };
  const game = {
    packs: new Map([
      ["test.items", itemPack],
      ["test.journals", journalPack],
    ]),
    modules: new Map(),
  };
  const getFlag = (entry, key) => entry?.flags?.["cyberpunk-remaster"]?.[key];

  const content = await loadPktCatalog({
    game,
    itemPackId: "test.items",
    journalPackId: "test.journals",
    getFlag,
    getImplantType: (entry) => getFlag(entry, "implantType"),
    getSlots: (entry) => Number(getFlag(entry, "slots") ?? 0),
    readCyberwareDescription: () => ({}),
    refresh: true,
  });

  assert.deepEqual(content.models, []);
  assert.equal(content.replacements.length, 1);
  assert.equal(content.replacements[0].itemId, "base000000000001");
});



test("Chrome tab ignores legacy stock model pages that can still exist in an old compiled pack", async (t) => {
  const previousGame = globalThis.game;
  t.after(() => {
    globalThis.game = previousGame;
    CyberwareTab.clearPktContentCache();
  });

  const stockModel = {
    key: "legacy-stock-model",
    name: "Старая встроенная модель",
    requiredBodyId: "body000000000001",
    unique: [],
    components: [],
    choices: [],
  };
  const itemPack = {
    getIndex: async () => [],
    getDocument: async () => null,
  };
  const journalPack = {
    getDocuments: async () => [
      {
        pages: [
          { flags: { "cyberpunk-remaster": { pktModel: stockModel } } },
        ],
      },
    ],
  };
  globalThis.game = {
    packs: new Map([
      ["cyberpunk-remaster.cyberpunk-items", itemPack],
      ["cyberpunk-remaster.cyberpunk-journals", journalPack],
    ]),
    modules: new Map(),
  };

  const content = await CyberwareTab.loadPktContent({ refresh: true });
  assert.deepEqual(content.models, []);
});



test("PKT audit accepts a module with no shipped ready-model presets", () => {
  const result = spawnSync(process.execPath, ["scripts/audit-pkt-bonuses.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /готовые модели ПКТ не поставляются/u);
});

test("Chrome tab keeps the ready-models section when the catalog is empty", () => {
  assert.match(template, /Готовые модели ПКТ/u);
  assert.match(template, /Готовых моделей ПКТ пока нет\./u);
});
