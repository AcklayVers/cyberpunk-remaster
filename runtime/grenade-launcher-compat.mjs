/** Compatibility helpers for obsolete launcher casting rules. No Foundry globals at module load. */
export const LEGACY_LAUNCHER_SPELL_UUID = 'Compendium.sf2e.spells.Item.sxQZ6yqTn0czJxVd';

export function isGrenadeLauncher(item) {
  if (item?.type !== 'weapon') return false;
  return /гранатом[её]т|grenade[ -]?launcher|rocket[ -]?launcher|raketom[ye]t/iu.test(
    `${item?.name ?? ''} ${item?.system?.baseItem ?? ''}`,
  ) || /reaktivnyy-granatomyot/iu.test(String(item?.system?.baseItem ?? ''));
}

/** A launcher must not contain any ItemCast: SF2e has no such rule element. */
export function removeLegacyLauncherCast(item) {
  const existing = item?.system?.rules;
  if (!isGrenadeLauncher(item) || !Array.isArray(existing)) {
    return { changed: false, rules: existing ?? [], otherRules: existing?.length ?? 0 };
  }
  const removed = existing.filter((rule) => rule?.key === 'ItemCast');
  const rules = existing.filter((rule) => rule?.key !== 'ItemCast');
  return { changed: removed.length > 0, rules, removed, otherRules: rules.length };
}

export async function migrateLauncherItemsOnActor(actor) {
  const changes = [];
  for (const item of actor?.items ?? []) {
    const result = removeLegacyLauncherCast(item);
    if (result.changed) {
      const previous = item.flags?.['cyberpunk-remaster']?.legacyItemCastBackup ?? [];
      changes.push({
        _id: item.id ?? item._id,
        'system.rules': result.rules,
        'flags.cyberpunk-remaster.legacyItemCastBackup': [
          ...(Array.isArray(previous) ? previous : []),
          ...result.removed,
        ],
      });
    }
  }
  if (!changes.length) return 0;
  await actor.updateEmbeddedDocuments('Item', changes, {
    render: false,
    cyberpunkRemasterMigration: true,
  });
  return changes.length;
}

/** Unlinked tokens own independent synthetic ActorDelta data: migrate via token.actor. */
export async function migrateLauncherTokensInScene(scene) {
  let migrated = 0;
  for (const token of scene?.tokens ?? []) {
    if (token.actorLink || !token.actor) continue;
    migrated += await migrateLauncherItemsOnActor(token.actor);
  }
  return migrated;
}

/** Creation path for Remaster, CPEL imports, and Forge-generated embedded Items. */
export function sanitizeLauncherSource(item) {
  const result = removeLegacyLauncherCast(item);
  if (!result.changed) return false;
  const previous = item.flags?.['cyberpunk-remaster']?.legacyItemCastBackup ?? [];
  const backup = [...(Array.isArray(previous) ? previous : []), ...result.removed];
  if (typeof item.updateSource === 'function') item.updateSource({
    'system.rules': result.rules,
    'flags.cyberpunk-remaster.legacyItemCastBackup': backup,
  });
  else if (item.system) {
    item.system.rules = result.rules;
    item.flags ??= {};
    item.flags['cyberpunk-remaster'] ??= {};
    item.flags['cyberpunk-remaster'].legacyItemCastBackup = backup;
  }
  return true;
}
