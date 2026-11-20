import assert from 'node:assert/strict';
import { test } from 'node:test';

let nextId = 1;
const events = {};
globalThis.Hooks = {
  events,
  on(name, fn) {
    const entry = { hook: name, id: nextId++, fn, once: false };
    (events[name] ??= []).push(entry);
    return entry.id;
  },
  off(name, id) {
    const entries = events[name] ?? [];
    const index = entries.findIndex(entry => entry.id === id);
    if (index >= 0) entries.splice(index, 1);
  },
};

await import('../runtime/grenade-launcher-action.mjs');


function document(source) {
  return {
    ...structuredClone(source),
    updateSource(update) {
      if (Object.hasOwn(update, 'system.rules')) this.system.rules = update['system.rules'];
      if (Object.hasOwn(update, 'flags.cyberpunk-remaster.legacyItemCastBackup')) {
        this.flags ??= {};
        this.flags['cyberpunk-remaster'] ??= {};
        this.flags['cyberpunk-remaster'].legacyItemCastBackup = update['flags.cyberpunk-remaster.legacyItemCastBackup'];
      }
    },
  };
}

function creationAllowed(item) {
  return events.preCreateItem.every(entry => entry.fn(item, {}, {}, 'test-gm') !== false);
}

for (const source of [
  { name: 'Аптечка', type: 'equipment', system: { rules: [] } },
  { name: 'Пистолет', type: 'weapon', system: { rules: [] } },
  { name: 'Гранатомёт', type: 'weapon', system: { rules: [] } },
]) {
  test(`preCreateItem allows ${source.name} when no obsolete casting rule needs repair`, () => {
    const item = document(source);
    assert.equal(creationAllowed(item), true, 'sanitizer reporting no change must not veto item creation');
    assert.deepEqual(item.system.rules, []);
  });
}

test('legacy launcher creation remains allowed and obsolete casting rules are backed up', () => {
  const oldRule = { key: 'ItemCast', uuid: 'Compendium.sf2e.spells.Item.test' };
  const retainedRule = { key: 'FlatModifier', selector: 'attack', value: 1 };
  const item = document({ name: 'Гранатомёт', type: 'weapon', system: { rules: [oldRule, retainedRule] } });
  assert.equal(creationAllowed(item), true);
  assert.deepEqual(item.system.rules, [retainedRule]);
  assert.deepEqual(item.flags['cyberpunk-remaster'].legacyItemCastBackup, [oldRule]);
});

test('another module can still deliberately veto item creation', () => {
  const id = Hooks.on('preCreateItem', () => false);
  const item = document({ name: 'Аптечка', type: 'equipment', system: { rules: [] } });
  assert.equal(creationAllowed(item), false);
  Hooks.off('preCreateItem', id);
});
