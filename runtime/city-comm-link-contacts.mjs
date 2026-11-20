// Only published crew data belongs here; never resolve private Actor/master identities.
const text = (value) => String(value ?? "").trim();
export function commLinkContactPresentation(contact = {}) {
  return {
    title: text(contact.name) || "COMM-LINK",
    image:
      text(contact.image) ||
      text(contact.tokenImage) ||
      text(contact.actorImage),
    summary: String(contact.summary ?? ""),
    tags: Array.isArray(contact.tags)
      ? contact.tags.join(", ")
      : String(contact.tags ?? ""),
  };
}

export function commLinkGroupContacts(group = {}) {
  const contacts = new Map(
    (group.contacts || []).filter((c) => c?.id).map((c) => [c.id, c]),
  );
  const threads = new Map();
  for (const message of group.messages || []) {
    const id =
      message.contactId ||
      (message.threadId ? `thread:${message.threadId}` : "");
    if (!id || contacts.has(id)) continue;
    const rows = threads.get(id) || [];
    rows.push(message);
    threads.set(id, rows);
  }
  for (const [id, rows] of threads) {
    const npc = rows
      .filter((m) => m.sender !== "player" && m.sender !== "system")
      .sort(
        (a, b) =>
          (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
      )
      .at(-1);
    const anonymous = id.startsWith("thread:anonymous:");
    contacts.set(id, {
      id,
      commLinkMessageContact: true,
      name: anonymous ? "UNKNOWN" : text(npc?.senderName) || "COMM-LINK",
      image: anonymous ? "" : text(npc?.senderImage) || text(npc?.image),
      createdAt: rows[0]?.createdAt,
    });
  }
  return [...contacts.values()];
}

// Track the source values separately from personal fields. A different local value,
// including a deliberately empty field after tracking began, is an Archive edit.
export function mergeCommLinkContactPresentation(entry, contact) {
  const source = commLinkContactPresentation(contact);
  const previous =
    entry?.commLinkPresentation ||
    (entry?.commLinkSource
      ? commLinkContactPresentation(entry.commLinkSource)
      : null);
  const presentation = {};
  for (const [field, value] of Object.entries(source)) {
    const current = String(entry?.[field] ?? "");
    presentation[field] =
      !entry ||
      (previous
        ? current === previous[field] ||
          (!entry.commLinkPresentation && !current)
        : !current)
        ? value
        : current;
  }
  return { ...presentation, commLinkPresentation: source };
}
