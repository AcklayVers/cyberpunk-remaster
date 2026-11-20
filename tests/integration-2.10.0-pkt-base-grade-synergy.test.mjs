import { fileURLToPath } from "node:url";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAB = path.join(ROOT, 'sheets', 'CyberwareTab.js');
const CATALOG = path.join(ROOT, 'runtime', 'pkt-catalog.mjs');
const TEMPLATE = path.join(ROOT, 'templates', 'cyberware-tab.hbs');

const HOST = 'cyberpunk-remaster';

function item({ id, name, level, family, slots = 8, installed = true, modelKey = null, sourceId = null, body = false, replaceable = true }) {
  return {
    id,
    name,
    type: 'equipment',
    flags: {
      [HOST]: {
        cyberware: true,
        installed,
        implantType: body ? 'internal' : 'base',
        ...(body ? { pktBody: true, pktQuality: 0 } : {}),
        ...(family ? { pktFamily: family } : {}),
        ...(modelKey ? { pktModelKey: modelKey, pktReplaceableBase: true } : {}),
        ...(sourceId ? { pktModelSourceId: sourceId } : {}),
        pktReplaceable: replaceable,
        slots,
      },
    },
    system: {
      level: { value: level },
      traits: { value: ['pkt'] },
      equipped: { carryType: installed ? 'implanted' : 'worn' },
      description: { value: '' },
    },
  };
}

test('Remaster PKT selector allows downgrade or upgrade to any different grade and excludes same-grade analogs', async () => {
  const { CyberwareTab } = await import(pathToFileURL(TAB) + `?grade-options=${Date.now()}`);
  const body = item({ id: 'BODY', name: 'Полная Конверсия Тела [Серийная]', level: 4, body: true });
  const base = item({ id: 'BASE', name: 'Кибер-рука III (ПКТ)', level: 12, family: 'cyber-arm', modelKey: 'model', sourceId: 'ARM-III' });
  base.flags[HOST].pktBodyId = body.id;
  const actor = { items: [body, base] };
  const catalog = [
    { itemId: 'ARM-I', name: 'Кибер-рука I (ПКТ)', family: 'cyber-arm', grade: 1, level: 4, replaceable: true, slots: 8 },
    { itemId: 'ARM-II', name: 'Кибер-рука II (ПКТ)', family: 'cyber-arm', grade: 2, level: 8, replaceable: true, slots: 8 },
    { itemId: 'ARM-III-ALT', name: 'Кибер-рука III альтернативная (ПКТ)', family: 'cyber-arm', grade: 3, level: 12, replaceable: true, slots: 8 },
    { itemId: 'ARM-IV', name: 'Кибер-рука IV (ПКТ)', family: 'cyber-arm', grade: 4, level: 16, replaceable: true, slots: 8 },
    { itemId: 'ARM-V', name: 'Кибер-рука V (ПКТ)', family: 'cyber-arm', grade: 5, level: 20, replaceable: true, slots: 8 },
    { itemId: 'LEG-V', name: 'Кибер-нога V (ПКТ)', family: 'cyber-leg', grade: 5, level: 20, replaceable: true, slots: 8 },
  ];

  const options = CyberwareTab.pktBaseReplacementOptions(actor, base, catalog, 0);
  assert.deepEqual(options.map((entry) => entry.itemId), ['ARM-I', 'ARM-II', 'ARM-IV', 'ARM-V']);
  assert.deepEqual(options.map((entry) => entry.grade), [1, 2, 4, 5]);
});

test('Remaster validation rejects same grade but accepts both downgrade and upgrade independent of body quality', async () => {
  const { CyberwareTab } = await import(pathToFileURL(TAB) + `?grade-validation=${Date.now()}`);
  CyberwareTab.installationValidation = () => null;
  const body = item({ id: 'BODY', name: 'Полная Конверсия Тела [Серийная]', level: 4, body: true });
  const base = item({ id: 'BASE', name: 'Кибер-рука III (ПКТ)', level: 12, family: 'cyber-arm', modelKey: 'model', sourceId: 'ARM-III' });
  base.flags[HOST].pktBodyId = body.id;
  const actor = { items: [body, base] };

  const same = item({ id: 'ARM-III-ALT', name: 'Кибер-рука III другая (ПКТ)', level: 12, family: 'cyber-arm', installed: false });
  const lower = item({ id: 'ARM-I', name: 'Кибер-рука I (ПКТ)', level: 4, family: 'cyber-arm', installed: false });
  const higher = item({ id: 'ARM-V', name: 'Кибер-рука V (ПКТ)', level: 20, family: 'cyber-arm', installed: false });
  lower.flags[HOST].pktComponentQuality = 99;
  higher.flags[HOST].pktComponentQuality = 99;

  assert.match(CyberwareTab.pktBaseReplacementValidation(actor, base, same), /тот же|грейд/iu);
  assert.equal(CyberwareTab.pktBaseReplacementValidation(actor, base, lower), null);
  assert.equal(CyberwareTab.pktBaseReplacementValidation(actor, base, higher), null);
});

test('Remaster replacement catalog is capable of merging Equipment Library PKT bases and carries pack identity', () => {
  const source = fs.readFileSync(CATALOG, 'utf8');
  assert.match(source, /cyberpunk-equipment-library\.implants/u);
  assert.match(source, /packId/u);
  assert.match(source, /grade:/u);
  assert.match(source, /level:/u);
});

test('Remaster PKT UI describes grade change rather than analog replacement', () => {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  assert.match(template, /Изменить грейд базы ПКТ/u);
  assert.doesNotMatch(template, /Выберите аналог/u);
  assert.match(template, /грейд/u);
  assert.match(template, /ур\./u);
});
