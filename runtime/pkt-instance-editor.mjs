import { CyberwareTab as C } from "../sheets/CyberwareTab.js";
import { enqueueActorOperation } from "./actor-operation-queue.mjs";
import { createRuntimeId } from "./runtime-id.mjs";

const MID = "cyberpunk-remaster";
const CREATOR = "cyberpunk-implant-creator";
const activeEdits = new WeakSet();
export const isInstalledPktEditInProgress = (actor) => activeEdits.has(actor);
function linkedItems(actor, roots) {
  const ids = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of values(actor.items)) {
      if (ids.has(item.id)) continue;
      const parent =
        item.flags?.[CREATOR]?.activationSourceItemId ??
        item.flags?.pf2e?.grantedBy?.id ??
        item.flags?.sf2e?.grantedBy?.id ??
        C.getFlag(item, "grantedByImplantId");
      if (ids.has(parent)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}
const scopes = [MID, "cyberpunk-cyberware", "cyberpunk-equipment-library"];
const values = (collection) => [
  ...(collection?.values?.() ?? collection ?? []),
];
const quantity = (item) =>
  Math.max(1, Math.trunc(Number(item?.system?.quantity ?? 1)) || 1);
const raw = (item) => structuredClone(item.toObject?.() ?? item);
const at = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);
function matches(actual, expected, path = "") {
  if (expected === undefined) return true;
  // SF2e removes zero-valued currency keys during _preUpdate.
  if (
    actual === undefined &&
    expected === 0 &&
    /^system\.price\.value\.[^.]+$/.test(path)
  )
    return true;
  const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
  if (ForcedDeletion && expected instanceof ForcedDeletion)
    return actual === undefined;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) =>
        matches(actual[index], value, `${path}.${index}`),
      )
    );
  if (expected && typeof expected === "object")
    return (
      actual &&
      Object.entries(expected).every(([key, value]) =>
        matches(actual[key], value, `${path}.${key}`),
      )
    );
  return Object.is(actual, expected);
}
async function updateChecked(actor, updates, options) {
  await actor.updateEmbeddedDocuments("Item", updates, options);
  for (const { _id, ...changes } of updates) {
    const item = values(actor.items).find((i) => i.id === _id);
    const source = item && raw(item);
    if (
      !source ||
      Object.entries(changes).some(
        ([path, value]) => !matches(at(source, path), value, path),
      )
    )
      throw new Error(
        `Foundry не применил все изменения предмета «${item?.name ?? _id}».`,
      );
  }
}
const members = (actor, key) =>
  values(actor.items).filter(
    (item) =>
      C.isInstalled(item) &&
      C.getFlag(item, "pktModelKey") === key &&
      !C.isPktBody(item) &&
      !C.isPktBiosystem(item),
  );
function requireGM(actor) {
  if (
    !game.user?.isGM ||
    !actor?.isOwner ||
    game.actors.get(actor.id) !== actor
  )
    throw new Error("Редактирование установленного ПКТ доступно ведущему.");
}
function signature(actor) {
  return JSON.stringify(values(actor.items).map((item) => raw(item)));
}
function rowOf(item) {
  const source = raw(item);
  return {
    actorItemId: item.id,
    uuid: item.uuid ?? `Actor.${item.actor?.id ?? "actor"}.Item.${item.id}`,
    itemId: item.id,
    name: item.name,
    source,
    quantity: quantity(item),
    family: C.getFlag(item, "pktFamily") ?? null,
    parentFamily: C.getFlag(item, "pktParentFamily") ?? null,
    hardCost: C.getHardCost(item),
    stressFormula: C.getStressFormula(item) ?? "0",
    priceEddies:
      Number(
        source.system?.price?.value?.credits ??
          source.system?.price?.value?.sp ??
          C.getFlag(item, "priceEddies") ??
          0,
      ) || 0,
    internalSlots: Number(C.getFlag(item, "pktInternalSlots")) || 0,
    externalSlots: Number(C.getFlag(item, "pktExternalSlots")) || 0,
    componentQuality: C.getFlag(item, "pktComponentQuality"),
    hard: C.getFlag(item, "pktHardMode") ?? "normal",
    stress:
      C.getFlag(item, "pktStressMode") ??
      (C.getFlag(item, "pktStress") === "waived" ? "waived" : "normal"),
    locked: C.getFlag(item, "pktLocked") === true,
    uniqueBase: C.isUniquePktModelBase(item),
    replaceableBase: !C.isUniquePktModelBase(item),
  };
}
export function createInstalledPktSession(
  actor,
  modelKey,
  catalogModel = null,
) {
  requireGM(actor);
  const items = members(actor, modelKey);
  if (!items.length) throw new Error("Установленная модель ПКТ не найдена.");
  const bodies = values(actor.items).filter(
    (i) => C.isPktBody(i) && C.isInstalled(i),
  );
  const bound = new Set(
    items.map((i) => C.getFlag(i, "pktBodyId")).filter(Boolean),
  );
  if (bound.size > 1)
    throw new Error("Компоненты модели привязаны к разным корпусам ПКТ.");
  const body = bodies.find((i) => bound.has(i.id)) ?? bodies[0];
  if (!body)
    throw new Error("Для редактирования нужен установленный корпус ПКТ.");
  const bases = items.filter((i) => C.getImplantType(i) === "base").map(rowOf);
  const extras = items.filter((i) => C.getImplantType(i) !== "base").map(rowOf);
  return {
    actorId: actor.id,
    actorName: actor.name,
    modelKey,
    bodyId: body.id,
    signature: signature(actor),
    model: {
      id: `installed-${actor.id}-${modelKey}`,
      name: catalogModel?.name ?? modelKey,
      manufacturer: catalogModel?.manufacturer ?? "",
      priceEddies: catalogModel?.priceEddies ?? 0,
      minimumQuality: catalogModel?.minimumQuality ?? 0,
      autoPrice: false,
      components: bases,
      baseComponents: bases,
      additionalComponents: extras,
      baseComponentDefinitions: [],
      extraComponentDefinitions: [],
      prerequisiteChoices: [],
      choice: null,
    },
  };
}

function portableSource(source) {
  const copy = structuredClone(source);
  for (const field of ["_id", "_stats", "folder", "ownership", "sort"])
    delete copy[field];
  for (const scope of scopes) {
    const flags = copy.flags?.[scope];
    if (!flags) continue;
    for (const key of [
      "parentId",
      "pktBodyId",
      "pktModelKey",
      "pktComponentKey",
      "pktQuantityIndex",
      "pktModelSourceId",
      "previousCarryState",
      "grantedByImplantId",
      "pktEditTransaction",
    ])
      delete flags[key];
    if ("installed" in flags) flags.installed = false;
  }
  if (copy.system?.equipped) copy.system.equipped.carryType = "worn";
  if (copy.system) copy.system.containerId = null;
  for (const scope of ["pf2e", "sf2e"])
    if (copy.flags?.[scope]) {
      delete copy.flags[scope].grantedBy;
      delete copy.flags[scope].itemGrants;
    }
  if (copy.flags?.core?.sourceId?.startsWith("Actor."))
    delete copy.flags.core.sourceId;
  return copy;
}
export function buildPktExport(model) {
  if (!game.user?.isGM)
    throw new Error("Экспорт полного ПКТ доступен ведущему.");
  const copy = structuredClone(model);
  if (copy.id?.startsWith("installed-"))
    copy.id = `export-${createRuntimeId()}`;
  const references = new Map();
  const sanitize = (entry) => {
    const reference = entry.uuid ?? entry.sourceUuid;
    if (reference?.startsWith("Actor.")) {
      if (!references.has(reference))
        references.set(
          reference,
          `Pkt${String(references.size + 1).padStart(13, "0")}`,
        );
      entry.itemId = references.get(reference);
      entry.uuid = `Item.${entry.itemId}`;
      entry.sourceUuid = entry.uuid;
    }
    delete entry.actorItemId;
    delete entry.editOrigin;
    if (entry.source) entry.source = portableSource(entry.source);
    return entry;
  };
  for (const field of [
    "components",
    "baseComponents",
    "additionalComponents",
    "baseComponentDefinitions",
    "extraComponentDefinitions",
  ]) {
    copy[field] = (copy[field] ?? []).map(sanitize);
  }
  if (copy.choice)
    copy.choice.options = (copy.choice.options ?? []).map(sanitize);
  for (const group of copy.prerequisiteChoices ?? []) {
    group.options = (group.options ?? []).map(sanitize);
    if (group.uuids)
      group.uuids = group.options.map((row) => row.uuid ?? row.sourceUuid);
    if (group.itemIds) group.itemIds = group.options.map((row) => row.itemId);
  }
  if (copy.choice?.uuids)
    copy.choice.uuids = copy.choice.options.map(
      (row) => row.uuid ?? row.sourceUuid,
    );
  if (copy.choice?.itemIds)
    copy.choice.itemIds = copy.choice.options.map((row) => row.itemId);
  delete copy.sourceItemUuid;
  delete copy.createdBy;
  delete copy.updatedBy;
  return {
    format: "cyberpunk-remaster.pkt-model",
    version: 1,
    moduleVersion: game.modules.get(MID)?.version ?? "",
    model: copy,
  };
}

export async function applyInstalledPktEdit(session, edited) {
  const actor = game.actors.get(session.actorId);
  requireGM(actor);
  return enqueueActorOperation(actor, async () => {
    requireGM(actor);
    if (signature(actor) !== session.signature)
      throw new Error(
        "Состав или предметы персонажа изменились. Откройте ПКТ заново.",
      );
    const originals = members(actor, session.modelKey);
    const originalById = new Map(originals.map((i) => [i.id, i]));
    const body =
      actor.items.get?.(session.bodyId) ??
      values(actor.items).find((i) => i.id === session.bodyId);
    if (!body || !C.isInstalled(body) || !C.isPktBody(body))
      throw new Error("Корпус ПКТ больше не установлен.");
    const rows = [
      ...(edited.baseComponents ?? []),
      ...(edited.additionalComponents ?? []),
    ];
    if (!rows.length) throw new Error("В модели ПКТ нет компонентов.");
    const retained = new Set();
    const transaction = createRuntimeId();
    const expandedRows = rows.flatMap((row) => {
      const count = Math.max(
        1,
        Math.min(20, Math.trunc(Number(row.quantity) || 1)),
      );
      const original = row.actorItemId && originalById.get(row.actorItemId);
      if (
        original &&
        C.isUniquePktModelBase(original) &&
        count !== quantity(original)
      )
        throw new Error(
          "Количество уникальной базы ПКТ нельзя менять отдельно.",
        );
      return Array.from({ length: count }, (_, index) => ({
        ...row,
        actorItemId: index ? undefined : row.actorItemId,
        quantity: 1,
      }));
    });
    const prepared = expandedRows.map((row, index) => {
      const existing = row.actorItemId
        ? originalById.get(row.actorItemId)
        : null;
      if (row.actorItemId && (!existing || retained.has(existing.id)))
        throw new Error("Неверная связь компонента установленного ПКТ.");
      if (existing) retained.add(existing.id);
      if (
        !row.source ||
        ![
          "equipment",
          "weapon",
          "armor",
          "shield",
          "consumable",
          "backpack",
        ].includes(row.source.type)
      )
        throw new Error("Нет данных физического предмета для компонента ПКТ.");
      const source = structuredClone(row.source);
      if (C.isPktBody(source) || C.isPktBiosystem(source))
        throw new Error(
          "Корпус и Биосистема редактируются отдельно от комплекта ПКТ.",
        );
      if (
        existing &&
        (source.type !== existing.type ||
          C.getImplantType(source) !== C.getImplantType(existing))
      )
        throw new Error(
          "Для замены типа компонента снимите его и добавьте новый предмет.",
        );
      for (const field of ["_id", "_stats", "folder", "ownership", "sort"])
        delete source[field];
      source.name = row.name || source.name;
      source.system ??= {};
      source.system.quantity = Math.max(
        1,
        Math.min(20, Math.trunc(Number(row.quantity) || 1)),
      );
      if (game.system?.id === "sf2e" && row.priceEddies !== undefined) {
        source.system.price = {
          ...source.system.price,
          value: {
            credits: Math.max(0, Math.trunc(Number(row.priceEddies) || 0)),
          },
        };
      }
      source.flags ??= {};
      source.flags[MID] = {
        ...source.flags[MID],
        installed: true,
        pktModelKey: session.modelKey,
        pktBodyId: body.id,
        pktEditTransaction: transaction,
        pktComponentKey: `edit-${index + 1}`,
        pktQuantityIndex: 0,
      };
      if (existing && C.isUniquePktModelBase(existing)) {
        if (
          row.uniqueBase !== true ||
          source.system.quantity !== quantity(existing)
        )
          throw new Error(
            "Уникальная база ПКТ не может быть удалена или заменена отдельно.",
          );
        source.flags[MID].pktUniqueBase = true;
      }
      if (source.type === "equipment")
        source.system.equipped = {
          ...source.system.equipped,
          carryType: "implanted",
        };
      return {
        row,
        source,
        existing,
        id: existing?.id ?? `new-pkt-edit-${index}`,
      };
    });
    for (const item of originals) {
      if (C.isUniquePktModelBase(item) && !retained.has(item.id))
        throw new Error("Уникальная база ПКТ не может быть удалена отдельно.");
    }
    const bases = prepared.filter((p) => C.getImplantType(p.source) === "base");
    const externalBases = values(actor.items)
      .filter(
        (item) =>
          !originalById.has(item.id) &&
          C.isInstalled(item) &&
          C.getImplantType(item) === "base",
      )
      .map((item) => ({ source: raw(item), existing: item, id: item.id }));
    const availableBases = [...bases, ...externalBases];
    const usedSlots = new Map(
      availableBases.map((b) => [
        b.id,
        values(actor.items)
          .filter(
            (i) =>
              !originalById.has(i.id) &&
              C.isInstalled(i) &&
              C.getFlag(i, "parentId") === b.id,
          )
          .reduce((sum, i) => sum + C.getSlotsUsed(i), 0),
      ]),
    );
    for (const p of [...prepared].sort(
      (a, b) => Number(Boolean(b.existing)) - Number(Boolean(a.existing)),
    )) {
      if (C.getImplantType(p.source) !== "module") {
        if (p.row.parentFamily || C.getFlag(p.source, "pktParentFamily"))
          throw new Error(
            `«${p.source.name}» требует базу, но не является модулем.`,
          );
        continue;
      }
      const oldParent = p.existing && C.getFlag(p.existing, "parentId");
      const family =
        p.row.parentFamily ?? C.getFlag(p.source, "pktParentFamily");
      const base =
        availableBases.find(
          (b) =>
            b.id === oldParent &&
            (!family || C.getFlag(b.source, "pktFamily") === family),
        ) ??
        availableBases.find(
          (b) =>
            family &&
            C.getFlag(b.source, "pktFamily") === family &&
            (C.getRuleSetting("ignoreSlotLimits") === true ||
              usedSlots.get(b.id) + C.getSlotsUsed(p.source) <=
                C.getSlots(b.source)),
        ) ??
        availableBases.find(
          (b) => family && C.getFlag(b.source, "pktFamily") === family,
        );
      p.parent = base ?? null;
      if (family && !base)
        throw new Error(
          `Для «${p.source.name}» не установлена база семейства «${family}».`,
        );
      if (base)
        usedSlots.set(
          base.id,
          usedSlots.get(base.id) + C.getSlotsUsed(p.source),
        );
      for (const scope of scopes)
        if (p.source.flags[scope]) delete p.source.flags[scope].parentId;
      if (base) p.source.flags[MID].parentId = base.id;
    }
    const final = {
      items: [
        ...values(actor.items).filter((i) => !originalById.has(i.id)),
        ...prepared.map((p) => ({ ...p.source, id: p.id })),
      ],
    };
    for (const item of prepared) {
      if (!C.getImplantType(item.source))
        throw new Error(`«${item.source.name}» не является имплантом.`);
      const problem = C.installationValidation(final, {
        ...item.source,
        id: item.id,
      });
      if (problem) throw new Error(problem);
    }
    for (const base of availableBases.filter(
      (b) => bases.includes(b) || prepared.some((p) => p.parent === b),
    )) {
      const outside = final.items.filter(
        (i) =>
          !prepared.some((p) => p.id === i.id) &&
          C.isInstalled(i) &&
          C.getFlag(i, "parentId") === base.id,
      );
      const used =
        prepared
          .filter((p) => p.parent === base)
          .reduce(
            (sum, p) => sum + C.getSlotsUsed(p.source) * quantity(p.source),
            0,
          ) +
        outside.reduce((sum, i) => sum + C.getSlotsUsed(i) * quantity(i), 0);
      if (
        C.getRuleSetting("ignoreSlotLimits") !== true &&
        used > C.getSlots(base.source)
      )
        throw new Error(`Недостаточно слотов в «${base.source.name}».`);
    }
    const removed = originals.filter((item) => !retained.has(item.id));
    const updates = removed.map((item) =>
      C.installationUpdate(item, false, { detachModel: true }),
    );
    for (const item of removed)
      if (C.getImplantType(item) === "base")
        updates.push(...C.moduleDetachUpdates(actor, item.id));
    const touched = linkedItems(actor, [
      ...originalById.keys(),
      ...updates.map((u) => u._id),
    ]);
    const grants = values(actor.items).filter(
      (i) => typeof C.getFlag(i, "grantedByImplantId") === "string",
    );
    grants.forEach((i) => touched.add(i.id));
    const before = values(actor.items)
      .filter((i) => touched.has(i.id))
      .map(raw);
    const beforeIds = new Set(values(actor.items).map((i) => i.id));
    const humanity = actor.flags?.[MID]?.humanity;
    const humanityBefore =
      humanity === undefined ? undefined : structuredClone(humanity);
    for (const p of prepared.filter((p) => p.existing)) {
      const update = {
        _id: p.existing.id,
        name: p.source.name,
        img: p.source.img,
        "system.quantity": p.source.system.quantity,
        "system.description.value": p.source.system.description?.value ?? "",
      };
      if (p.source.system.price) update["system.price"] = p.source.system.price;
      for (const [key, value] of Object.entries(p.source.flags[MID]))
        update[`flags.${MID}.${key}`] = value;
      if (!p.parent && C.getImplantType(p.source) === "module")
        C.clearModuleParent(update, p.existing);
      updates.push(update);
    }
    let created = [];
    const options = {
      cyberpunkRemasterModelOperation: true,
      cyberpunkRemasterPktEdit: true,
      render: false,
    };
    activeEdits.add(actor);
    try {
      if (updates.length)
        await updateChecked(actor, C.mergeItemUpdates(updates), options);
      const additions = prepared.filter((p) => !p.existing);
      if (additions.length) {
        // Parent IDs for new bases are resolved after embedding.
        created = await actor.createEmbeddedDocuments(
          "Item",
          additions.map((p) => {
            const source = structuredClone(p.source);
            if (source.flags[MID].parentId?.startsWith("new-pkt-edit-"))
              delete source.flags[MID].parentId;
            return source;
          }),
          options,
        );
        if (
          created.length !== additions.length ||
          created.some((i) => !C.isInstalled(i))
        )
          throw new Error("Не все новые компоненты ПКТ установлены.");
        additions.forEach((p, i) => {
          p.realId = created[i].id;
        });
      }
      const links = prepared
        .filter((p) => p.parent)
        .map((p) => ({
          _id: p.existing?.id ?? p.realId,
          [`flags.${MID}.parentId`]: p.parent.existing?.id ?? p.parent.realId,
        }));
      if (links.length) await updateChecked(actor, links, options);
      await C.reconcileGrantedItems(actor);
      await C.reconcileHumanity(actor);
      const reconcile =
        game.modules.get(MID)?.api?.implantCreator?.reconcilePktActivations;
      if (reconcile)
        await reconcile(actor, [
          ...originalById.keys(),
          ...created.map((i) => i.id),
        ]);
    } catch (error) {
      try {
        const related = linkedItems(actor, [
          ...originalById.keys(),
          ...created.map((i) => i.id),
        ]);
        const partial = values(actor.items).filter(
          (i) =>
            !beforeIds.has(i.id) &&
            (C.getFlag(i, "pktEditTransaction") === transaction ||
              typeof C.getFlag(i, "grantedByImplantId") === "string" ||
              related.has(i.id)),
        );
        if (partial.length)
          await actor.deleteEmbeddedDocuments(
            "Item",
            partial.map((i) => i.id),
            options,
          );
        if (
          partial.some((item) =>
            values(actor.items).some((i) => i.id === item.id),
          )
        )
          throw new Error("Foundry не удалил временные компоненты.");
        const currentIds = new Set(values(actor.items).map((i) => i.id));
        const missing = before.filter((s) => !currentIds.has(s._id));
        if (missing.length) {
          // Replaying GrantItem/ChoiceSet preCreate would generate new children
          // beside the saved children. Recreate identities first, then rules.
          await actor.createEmbeddedDocuments(
            "Item",
            missing.map((source) => {
              const copy = structuredClone(source);
              if (Array.isArray(copy.system?.rules)) copy.system.rules = [];
              return copy;
            }),
            {
              ...options,
              keepId: true,
            },
          );
          if (
            missing.some(
              (s) => !values(actor.items).some((i) => i.id === s._id),
            )
          )
            throw new Error("Foundry не восстановил выданные предметы.");
        }
        await updateChecked(
          actor,
          before.map((s) => ({
            _id: s._id,
            name: s.name,
            img: s.img,
            system: s.system,
            flags: s.flags,
          })),
          { ...options, diff: false, recursive: false },
        );
        if (
          JSON.stringify(actor.flags?.[MID]?.humanity) !==
          JSON.stringify(humanityBefore)
        ) {
          if (humanityBefore === undefined)
            await actor.unsetFlag(MID, "humanity");
          else await actor.setFlag(MID, "humanity", humanityBefore);
        }
      } catch (rollbackError) {
        throw new Error(
          `${error.message} Откат ПКТ не завершён: ${rollbackError.message}`,
        );
      }
      throw error;
    } finally {
      activeEdits.delete(actor);
    }
    return {
      updated: retained.size,
      added: created.length,
      removed: removed.length,
    };
  });
}
