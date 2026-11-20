import { LEGACY_MODULE_ID, MODULE_ID, safeInt } from "./cyberware-schema.mjs";

const EQUIPMENT_LIBRARY_MODULE_ID = "cyberpunk-equipment-library";
const EQUIPMENT_LIBRARY_ITEM_PACK = "cyberpunk-equipment-library.implants";

let catalogPromise = null;

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return [...collection].map((value) =>
    Array.isArray(value) && value.length === 2 ? value[1] : value,
  );
}

function compareByName(left, right) {
  return String(left?.name ?? "").localeCompare(
    String(right?.name ?? ""),
    "ru",
    { sensitivity: "base", numeric: true },
  );
}


function itemLevel(entry) {
  const value = Number(entry?.system?.level?.value ?? entry?.level?.value ?? entry?.level);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : Number.NaN;
}

function pktBaseGrade(entry, getFlag) {
  const flagged = Number(getFlag(entry, "pktGrade"));
  if (Number.isFinite(flagged) && flagged > 0) return Math.trunc(flagged);

  const match = String(entry?.name ?? "").match(
    /\b(I|II|III|IV|V)(?=\s*(?:\(ПКТ\)|\[ПКТ\]|$))/iu,
  );
  if (match) {
    return { I: 1, II: 2, III: 3, IV: 4, V: 5 }[match[1].toUpperCase()] ?? Number.NaN;
  }

  const level = itemLevel(entry);
  if (Number.isFinite(level) && level > 0) {
    return Math.max(1, Math.ceil(level / 4));
  }

  const legacyQuality = Number(getFlag(entry, "pktComponentQuality"));
  return Number.isFinite(legacyQuality) && legacyQuality >= 0
    ? Math.max(1, Math.min(5, Math.trunc(legacyQuality) + 1))
    : Number.NaN;
}

function replacementIndexFields() {
  return [
    "name",
    "img",
    "system.level.value",
    `flags.${MODULE_ID}.pktFamily`,
    `flags.${MODULE_ID}.pktGrade`,
    `flags.${MODULE_ID}.pktComponentQuality`,
    `flags.${MODULE_ID}.pktReplaceable`,
    `flags.${MODULE_ID}.implantType`,
    `flags.${MODULE_ID}.slots`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.pktFamily`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.pktGrade`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.pktComponentQuality`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.pktReplaceable`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.implantType`,
    `flags.${EQUIPMENT_LIBRARY_MODULE_ID}.slots`,
    `flags.${LEGACY_MODULE_ID}.implantType`,
    `flags.${LEGACY_MODULE_ID}.slots`,
  ];
}

function modelItemIds(models) {
  const ids = new Set();
  for (const model of models) {
    if (model.requiredBodyId) ids.add(model.requiredBodyId);
    for (const entry of [
      ...(model.unique ?? []),
      ...(model.components ?? []),
    ]) {
      if (entry.itemId) ids.add(entry.itemId);
    }
    for (const choice of model.choices ?? []) {
      for (const itemId of choice.itemIds ?? []) ids.add(itemId);
    }
  }
  return ids;
}

async function loadDetailedEntries(itemPack, itemIndex, itemIds) {
  const entries = new Map();
  await Promise.all(
    [...itemIds].map(async (itemId) => {
      const indexed = itemIndex.get(itemId);
      const document =
        typeof itemPack.getDocument === "function"
          ? await itemPack.getDocument(itemId)
          : null;
      if (document ?? indexed) entries.set(itemId, document ?? indexed);
    }),
  );
  return entries;
}

export function clearPktCatalogCache() {
  catalogPromise = null;
}

export function loadPktCatalog({
  game,
  itemPackId,
  journalPackId,
  getFlag,
  getImplantType,
  getSlots,
  readCyberwareDescription,
  refresh = false,
}) {
  if (refresh) catalogPromise = null;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const journalPack = game?.packs?.get?.(journalPackId);
    const itemPack = game?.packs?.get?.(itemPackId);
    if (!journalPack || !itemPack) {
      throw new Error("Компендиумы моделей или предметов ПКТ недоступны.");
    }

    const [journals, index] = await Promise.all([
      journalPack.getDocuments(),
      itemPack.getIndex({ fields: replacementIndexFields() }),
    ]);
    const itemIndex = new Map(
      collectionValues(index).map((entry) => [entry._id ?? entry.id, entry]),
    );
    const equipmentLibraryActive =
      game?.modules?.get?.(EQUIPMENT_LIBRARY_MODULE_ID)?.active === true;
    const equipmentLibraryPack = equipmentLibraryActive
      ? game?.packs?.get?.(EQUIPMENT_LIBRARY_ITEM_PACK)
      : null;
    const equipmentLibraryIndex = equipmentLibraryPack
      ? await equipmentLibraryPack.getIndex({ fields: replacementIndexFields() })
      : [];
    const models = collectionValues(journals).flatMap((journal) =>
      collectionValues(journal.pages)
        .map((page) => page.flags?.[MODULE_ID]?.pktModel)
        .filter((model) => model?.key),
    );
    const replaceableIds = collectionValues(index)
      .filter((entry) => entry.flags?.[MODULE_ID]?.pktReplaceable === true)
      .map((entry) => entry._id ?? entry.id);
    const requiredIds = modelItemIds(models);
    for (const itemId of replaceableIds) requiredIds.add(itemId);
    const detailedEntries = await loadDetailedEntries(
      itemPack,
      itemIndex,
      requiredIds,
    );

    const itemInfo = (itemId) => {
      const entry = detailedEntries.get(itemId) ?? itemIndex.get(itemId);
      const described = entry ? readCyberwareDescription(entry) : {};
      const flaggedHardCost = entry ? getFlag(entry, "hardCost") : null;
      const flaggedStressFormula = entry
        ? getFlag(entry, "stressFormula")
        : null;
      const hardCost =
        described.hardCost ??
        (flaggedHardCost === undefined || flaggedHardCost === null
          ? null
          : safeInt(flaggedHardCost));
      const stressFormula =
        described.stressFormula ??
        (typeof flaggedStressFormula === "string" && flaggedStressFormula
          ? flaggedStressFormula
          : null);
      return {
        itemId,
        name: entry?.name ?? `Предмет ${itemId}`,
        img: entry?.img ?? "icons/svg/item-bag.svg",
        ...(hardCost === null ? {} : { hardCost: safeInt(hardCost) }),
        ...(typeof stressFormula === "string" && stressFormula
          ? { stressFormula }
          : {}),
      };
    };
    const enrich = (entry, fallbackKey) => ({
      ...entry,
      ...itemInfo(entry.itemId),
      key: entry.key ?? fallbackKey,
    });

    const enrichedModels = models.map((source) => {
      const model = structuredClone(source);
      return {
        ...model,
        requiredBodyName: itemInfo(model.requiredBodyId).name,
        unique: (model.unique ?? []).map((entry, index) =>
          enrich(entry, `unique-${index + 1}`),
        ),
        components: (model.components ?? []).map((entry, index) =>
          enrich(entry, `component-${index + 1}`),
        ),
        choices: (model.choices ?? []).map((choice) => ({
          ...choice,
          options: (choice.itemIds ?? []).map(itemInfo),
        })),
      };
    });
    const replacementEntry = (entry, packId) => ({
      itemId: entry._id ?? entry.id,
      packId,
      name: entry.name,
      img: entry.img,
      family: getFlag(entry, "pktFamily") ?? null,
      quality: Number(getFlag(entry, "pktComponentQuality")),
      grade: pktBaseGrade(entry, getFlag),
      level: itemLevel(entry),
      replaceable: getFlag(entry, "pktReplaceable") === true,
      slots: getSlots(entry),
      implantType: getImplantType(entry),
    });
    const primaryReplacements = replaceableIds
      .map((itemId) => detailedEntries.get(itemId) ?? itemIndex.get(itemId))
      .filter(Boolean)
      .map((entry) => replacementEntry(entry, itemPackId));
    const equipmentLibraryReplacements = collectionValues(equipmentLibraryIndex)
      .filter((entry) => getFlag(entry, "pktReplaceable") === true)
      .map((entry) => replacementEntry(entry, EQUIPMENT_LIBRARY_ITEM_PACK));
    const seen = new Set();
    const replacements = [...equipmentLibraryReplacements, ...primaryReplacements]
      .filter(
        (entry) =>
          entry.implantType === "base" &&
          entry.family,
      )
      .filter((entry) => {
        const key = `${entry.packId}:${entry.itemId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) =>
        String(left.family).localeCompare(String(right.family), "ru", { sensitivity: "base" }) ||
        (Number(left.grade) || 999) - (Number(right.grade) || 999) ||
        compareByName(left, right),
      );

    return { models: enrichedModels, replacements };
  })().catch((error) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}
