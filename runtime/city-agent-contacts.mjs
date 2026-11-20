import { readCityArchive } from "./city-archive-service.mjs";
import { commLinkGroupContacts, mergeCommLinkContactPresentation } from "./city-comm-link-contacts.mjs";

const MID = "cyberpunk-remaster";
const values = (collection) =>
  collection?.values ? Array.from(collection.values()) :
    Array.isArray(collection) ? collection : Object.values(collection || {});
const actorIdOf = (c) =>
  c.sourceActorId || c.actorId ||
  String(c.sourceActorUuid || c.actorUuid || "").replace(/^Actor\./, "");
const owns = (actor, user) =>
  !!actor && !!user && (user.isGM || actor.testUserPermission?.(user, "OWNER") === true);
const groupKey = (c) => `${c.commLinkGroupId}:${c.commLinkContactId}`;
// A crew is the recipient audience. The same NPC in another crew is another route.
const identity = (c) => c.commLinkGroupId ? `crew:${groupKey(c)}` :
  actorIdOf(c) ? `actor:${actorIdOf(c)}` :
  c.commLinkMasterContactId ? `master:${c.commLinkMasterContactId}` : `archive:${c.id}`;
const mergeMessages = (a = [], b = []) =>
  [...new Map([...a, ...b].map(m => [m.id, m])).values()];

// Read existing documents only. Opening Chats must not initialize Source or write Archives.
export function readCityAgentContacts({ ownerUserId = game.user.id, actorId } = {}) {
  if (!game.user.isGM && ownerUserId !== game.user.id)
    throw new Error("Недостаточно прав для чужого Архива.");
  const actor = game.actors.get(actorId), owner = game.users.get(ownerUserId);
  if (!owns(actor, game.user) || !owns(actor, owner)) return [];
  const network = [], master = new Map();
  for (const doc of values(game.journal)) {
    const flags = doc.flags?.[MID]?.commLink || doc.flags?.commLinkNetwork;
    if (!flags) continue;
    if (game.user.isGM && ownerUserId === game.user.id) {
      for (const c of values(flags.masterContacts?.contacts))
        if (c?.id) master.set(c.id, c);
    }
    const group = flags.data;
    if (!group?.groupId || !(group.memberActorIds || []).includes(actorId)) continue;
    if (!game.user.isGM && doc.testUserPermission &&
      !doc.testUserPermission(game.user, "OBSERVER")) continue;
    for (const c of commLinkGroupContacts(group)) {
      if (!c.id) continue;
      const id = `comm-link-contact:${group.groupId}:${c.id}`;
      network.push({
        id, type: "people", ...mergeCommLinkContactPresentation(null, c),
        commLinkSource: c,
        sourceActorId: actorIdOf(c), sourceActorUuid: c.actorUuid || "",
        commLinkGroupId: group.groupId, commLinkContactId: c.id,
        commLinkGroupName: group.groupName || group.groupId,
        contactSource: "network",
        messages: (group.messages || []).filter(m =>
          (m.contactId || `thread:${m.threadId}`) === c.id).map(m => ({
            ...m, id: `comm-link:${group.groupId}:${m.id}`,
            commLinkMessageId: m.id, commLinkGroupId: group.groupId,
            routeMode: "comm-link-crew",
            sourceActorName: m.senderName,
            direction: m.sender === "player" && m.senderActorId === actorId ? "out" : "in",
          })),
      });
    }
  }
  for (const c of network)
    if (master.has(c.commLinkContactId)) c.commLinkMasterContactId = c.commLinkContactId;
  const available = new Map(network.map(c => [groupKey(c), c]));
  const rows = [], byIdentity = new Map();
  const add = (c) => {
    const key = identity(c), previous = byIdentity.get(key);
    if (previous) {
      previous.messages = mergeMessages(previous.messages, c.messages);
      return;
    }
    const row = { ...c, messages: [...(c.messages || [])] };
    rows.push(row); byIdentity.set(key, row);
  };
  for (const c of readCityArchive(ownerUserId).notebooks?.[actorId]?.entries?.people || []) {
    if (c.commLinkGroupId) {
      const live = available.get(groupKey(c));
      if (!live) continue; // Old projected crew contacts do not survive revoked membership.
      add({ ...c, ...live, ...mergeCommLinkContactPresentation(c, live.commLinkSource),
        id: c.id, messages: mergeMessages(c.messages, live.messages) });
    } else add({ ...c, contactSource: "archive" });
  }
  for (const c of network) {
    add(c);
  }
  for (const c of master.values()) add({
    id: `comm-link-master-contact:${c.id}`, type: "people", title: c.name || "Контакт",
    image: c.image || c.tokenImage || c.actorImage || "",
    sourceActorId: actorIdOf(c), sourceActorUuid: c.actorUuid || "",
    commLinkMasterContactId: c.id, contactSource: "master", messages: [],
  });
  return rows;
}
