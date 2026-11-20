import { createRuntimeId } from "./runtime-id.mjs";
import {
  mutateCityArchive,
  CITY_ARCHIVE_HOOK,
} from "./city-archive-service.mjs";
import {
  resolveUnifiedNeuroContactRoute,
  ingestUnifiedNeuroContactMessage,
  UNIFIED_ARCHIVE_SECTIONS,
} from "./neuro-archive-store.mjs";
import { readCityAgentContacts } from "./city-agent-contacts.mjs";
import { cityEsc } from "./world-city-map-media.mjs";
import { cityAuthor } from "./city-services-state.mjs";
const MID = "cyberpunk-remaster";
const all = (collection) =>
  Array.from(collection?.values?.() || collection || []);
export function cityContactPayload(doc) {
  const payload =
    doc?.flags?.[MID]?.neuroArchive?.contactMessage ||
    doc?.flags?.cyberpunkRemaster?.neuroArchive?.contactMessage ||
    doc?.flags?.cyberpunkRemaster?.fieldArchiveNeuroLink?.contactPayload ||
    null;
  if (payload) return payload;
  const legacy = doc?.flags?.cyberpunkRemaster?.fieldArchiveNeuroLink;
  if (
    !legacy?.archiveMessageId ||
    !["gm-to-player", "player-to-gm", "player-to-player"].includes(
      legacy.routeMode || legacy.direction,
    )
  )
    return null;
  const mode = legacy.routeMode || legacy.direction;
  return {
    ...legacy,
    id: legacy.archiveMessageId,
    body: legacy.text || "",
    createdAt: legacy.sentAt,
    routeMode: mode,
    senderUserId:
      legacy.senderUserId ||
      (mode === "gm-to-player" ? cityAuthor(doc)?.id : legacy.playerUserId),
    sourceActorId: legacy.sourceActorId || legacy.playerActorId,
    archiveUserId: legacy.playerUserId,
    archiveActorId: legacy.playerActorId,
  };
}
export function cityMessageAuthenticated(doc) {
  const p = cityContactPayload(doc),
    a = cityAuthor(doc);
  if (!p || !a || p.senderUserId !== a.id) return false;
  if (
    !["gm-to-player", "player-to-gm", "player-to-player"].includes(p.routeMode)
  )
    return false;
  if (p.routeMode === "gm-to-player") {
    if (!a.isGM) return false;
    if (!game.user.isGM && p.archiveUserId !== game.user.id) return false;
    if (!game.user.isGM && p.archiveUserId === game.user.id)
      return !!game.actors
        .get(p.archiveActorId)
        ?.testUserPermission?.(game.user, "OWNER");
    return true;
  }
  const actor = game.actors.get(p.sourceActorId || p.archiveActorId);
  if (!actor || (!a.isGM && !actor.testUserPermission?.(a, "OWNER")))
    return false;
  if (
    !a.isGM &&
    ((p.archiveUserId && p.archiveUserId !== a.id) ||
      (p.archiveActorId && p.archiveActorId !== actor.id))
  )
    return false;
  if (
    !game.user.isGM &&
    a.id !== game.user.id &&
    (p.routeMode === "player-to-gm" || !p.targetUserIds?.includes(game.user.id))
  )
    return false;
  if (
    !game.user.isGM &&
    p.routeMode === "player-to-player" &&
    p.targetUserIds?.includes(game.user.id)
  )
    return !!game.actors
      .get(p.targetActorId)
      ?.testUserPermission?.(game.user, "OWNER");
  return true;
}
export function cityContacts({ ownerUserId = game.user.id, actorId } = {}) {
  return readCityAgentContacts({ ownerUserId, actorId });
}
export function cityThread({
  ownerUserId = game.user.id,
  actorId,
  contactId,
} = {}) {
  const contact = cityContacts({ ownerUserId, actorId }).find(
    (p) => p.id === contactId,
  );
  if (!contact) return [];
  const rows = new Map((contact.messages || []).map((m) => [m.id, m]));
  for (const doc of all(game.messages)) {
    const m = cityContactPayload(doc);
    if (!m || !cityMessageAuthenticated(doc)) continue;
    const visible =
      game.user.isGM ||
      m.senderUserId === game.user.id ||
      (m.targetUserIds || []).includes(game.user.id) ||
      m.archiveUserId === game.user.id;
    const matches =
      (contact.neuroConversationId &&
        m.threadId === contact.neuroConversationId) ||
      (m.archiveUserId === ownerUserId &&
        m.archiveActorId === actorId &&
        m.contactId === contactId);
    if (visible && matches)
      rows.set(m.id, {
        ...m,
        direction: m.routeMode === "gm-to-player" ? "in" :
          m.senderUserId === ownerUserId ? "out" : "in",
      });
  }
  return [...rows.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}
const sending = new Map();
export function sendCityContactMessage(args) {
  const key = `${game.user.id}:${args.operationId || createRuntimeId()}`;
  if (sending.has(key)) return sending.get(key);
  const task = send({
    ...args,
    operationId: args.operationId || key.split(":").slice(1).join(":"),
  });
  sending.set(key, task);
  return task.finally(() => {
    if (sending.get(key) === task) sending.delete(key);
  });
}
async function send({
  ownerUserId = game.user.id,
  actorId,
  contactId,
  body,
  operationId,
  asContact = false,
}) {
  if (asContact && !game.user.isGM)
    throw new Error("Ответ от имени контакта доступен только GM / ведущему.");
  if (!game.user.isGM && ownerUserId !== game.user.id)
    throw new Error("Недостаточно прав для чужого Архива.");
  const actor = game.actors.get(actorId);
  if (
    !actor ||
    (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
  )
    throw new Error("Нет прав на выбранного персонажа.");
  const person = cityContacts({ ownerUserId, actorId }).find(
    (p) => p.id === contactId,
  );
  if (!person) throw new Error("Контакт удалён или недоступен.");
  if (person.commLinkGroupId) {
    const { sendCommLinkContactMessage } =
      await import("./city-comm-link-runtime.mjs");
    return sendCommLinkContactMessage({
      ownerUserId,
      actorId,
      contactId,
      body,
      operationId,
      asContact,
    });
  }
  const text = String(body || "").trim();
  if (!text) throw new Error("Введите сообщение.");
  const id = `city-message:${game.user.id}:${operationId}`;
  const sent = all(game.messages).find((d) => cityContactPayload(d)?.id === id);
  const previous = (person.messages || []).find((m) => m.id === id);
  const gmReply = game.user.isGM && (asContact || ownerUserId !== game.user.id);
  const target = game.actors.get(
    person.sourceActorId ||
      String(person.sourceActorUuid || "").replace(/^Actor\./, ""),
  );
  const route = resolveUnifiedNeuroContactRoute({
    users: all(game.users),
    senderUserId: game.user.id,
    sourceActor: actor,
    contactActor: target,
  });
  const gmIds = all(game.users)
    .filter((u) => u.isGM)
    .map((u) => u.id);
  const message = previous || {
    id,
    direction: gmReply ? "in" : "out",
    body: text,
    createdAt: new Date().toISOString(),
    senderUserId: game.user.id,
    senderName: game.user.name,
    sourceActorId: actorId,
    sourceActorUuid: actor.uuid || `Actor.${actorId}`,
    sourceActorName: gmReply ? person.title : actor.name,
    sourceActorImg: gmReply ? person.image || "" : actor.img,
    archiveUserId: ownerUserId,
    archiveActorId: actorId,
    contactId,
    contactName: person.title,
    routeMode: gmReply ? "gm-to-player" : route.mode,
    targetUserIds: gmReply ? [ownerUserId] : route.targetUserIds,
    targetActorId: gmReply ? actorId : route.targetActorId,
    targetActorName: gmReply ? actor.name : target?.name || person.title,
    threadId:
      (gmReply
        ? person.neuroConversationId
        : route.threadId || person.neuroConversationId) ||
      `nc-neuro:${ownerUserId}:${actorId}:${contactId}`,
  };
  const recipients = gmReply
    ? [...new Set([game.user.id, ownerUserId, ...gmIds])]
    : route.recipientUserIds;
  const doc =
    sent ||
    (await ChatMessage.create({
      speaker: gmReply ? { alias: person.title } : ChatMessage.getSpeaker?.({ actor }),
      whisper: recipients,
      content: `<article class="night-city-neuro-link-message"><b>${cityEsc(message.sourceActorName)} → ${cityEsc(message.targetActorName)}</b><p>${cityEsc(message.body).replaceAll("\n", "<br>")}</p></article>`,
      flags: {
        [MID]: { neuroArchive: { contactMessage: message } },
        cyberpunkRemaster: {
          fieldArchiveNeuroLink: {
            ...message,
            version: 2,
            threadId: message.threadId,
            direction: message.routeMode,
            sentAt: message.createdAt,
            archiveMessageId: id,
            playerUserId: ownerUserId,
            playerActorId: actorId,
            playerActorName: actor.name,
            text: message.body,
            contactPayload: message,
          },
        },
      },
    }));
  await mutateCityArchive(ownerUserId, (s) => {
    if (person.contactSource === "master" && game.user.isGM && ownerUserId === game.user.id) {
      const book = ((s.notebooks ??= {})[actorId] ??= {
        actorId, actorName: actor.name, actorImg: actor.img,
        entries: Object.fromEntries(UNIFIED_ARCHIVE_SECTIONS.map(k => [k, []])),
      });
      const people = ((book.entries ??= {}).people ??= []);
      if (!people.some(c => c.id === contactId)) people.push({
        id: contactId, type: "people", title: person.title, image: person.image,
        sourceActorId: person.sourceActorId, sourceActorUuid: person.sourceActorUuid,
        commLinkMasterContactId: person.commLinkMasterContactId, messages: [],
      });
    }
    const p = s.notebooks?.[actorId]?.entries?.people?.find(
      (x) => x.id === contactId,
    );
    if (!p) return;
    p.messages ??= [];
    if (!p.messages.some((m) => m.id === id)) p.messages.push(message);
    if (message.threadId) p.neuroConversationId = message.threadId;
    p.updatedAt = new Date().toISOString();
  });
  return doc;
}
export async function ingestCityMessage(doc) {
  const p = cityContactPayload(doc);
  if (!p || !cityMessageAuthenticated(doc)) return;
  const userId = game.user.id;
  if (
    p.routeMode === "player-to-player" &&
    (p.targetUserIds || []).includes(userId)
  ) {
    const actor = game.actors.get(p.targetActorId);
    if (!actor?.testUserPermission?.(game.user, "OWNER") && !game.user.isGM)
      return;
    await mutateCityArchive(userId, (s) => {
      ingestUnifiedNeuroContactMessage(s, {
        currentUserId: userId,
        targetActor: actor,
        sourceActor: game.actors.get(p.sourceActorId),
        payload: p,
      });
    });
  } else if (p.archiveUserId === userId && p.routeMode === "gm-to-player") {
    await mutateCityArchive(userId, (s) => {
      const c = s.notebooks?.[p.archiveActorId]?.entries?.people?.find(
        (c) => c.id === p.contactId,
      );
      if (c) {
        c.messages ??= [];
        if (!c.messages.some((m) => m.id === p.id))
          c.messages.push({ ...p, direction: "in" });
      }
    });
  }
  globalThis.Hooks?.callAll(CITY_ARCHIVE_HOOK, userId);
}
async function reconcileCityMessagesInbox() {
  const seen = new Set(
    game.user.getFlag?.(MID, "cityContactMessagesSeen") || [],
  );
  const initialSize = seen.size;
  for (const doc of all(game.messages)) {
    const payload = cityContactPayload(doc);
    if (!payload?.id || seen.has(payload.id) || !cityMessageAuthenticated(doc))
      continue;
    const relevant =
      (payload.routeMode === "player-to-player" &&
        payload.targetUserIds?.includes(game.user.id)) ||
      (payload.routeMode === "gm-to-player" &&
        payload.archiveUserId === game.user.id);
    if (!relevant) continue;
    await ingestCityMessage(doc);
    seen.add(payload.id);
  }
  if (seen.size !== initialSize)
    await game.user.setFlag(MID, "cityContactMessagesSeen", [...seen]);
}
const inboxQueues = new Map();
export function syncCityMessagesInbox() {
  const userId = game.user.id;
  const work = (inboxQueues.get(userId) || Promise.resolve())
    .catch(() => {})
    .then(() => {
      if (game.user.id === userId) return reconcileCityMessagesInbox();
    });
  inboxQueues.set(userId, work);
  return work.finally(() => {
    if (inboxQueues.get(userId) === work) inboxQueues.delete(userId);
  });
}
export function registerCityMessaging() {
  return Hooks.on("createChatMessage", (doc) => {
    if (!cityContactPayload(doc)) return;
    void syncCityMessagesInbox().catch((e) => console.warn(MID, e));
  });
}
