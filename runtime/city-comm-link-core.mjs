// Data/authentication adapters for the reviewed COMM-LINK 0.9.2 UI.
import { sha256 } from "./vendor/noble-hashes-2.0.1/sha2.js";
import { commLinkGroupContacts, mergeCommLinkContactPresentation } from "./city-comm-link-contacts.mjs";
export const COMM_LINK_MID = "cyberpunk-remaster";
export const COMM_LINK_PATH = `flags.${COMM_LINK_MID}.commLink`;
const copy = (v) => structuredClone(v);
const stamp = () => new Date().toISOString();
export async function hashCommLinkPin(value, cryptoApi = globalThis.crypto) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const bytes = new TextEncoder().encode(`COMM-LINK:${clean}`);
  const digest =
    typeof cryptoApi?.subtle?.digest === "function"
      ? await cryptoApi.subtle.digest("SHA-256", bytes)
      : sha256(bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyCommLinkPin(value, storedHash, cryptoApi = globalThis.crypto) {
  const hash = String(storedHash || "").trim();
  if (!hash) return true;
  const clean = String(value || "").trim();
  // COMM-LINK0.9.2 used this literal format when WebCrypto was unavailable.
  // Read compatibility only: all new/updated credentials use hashCommLinkPin.
  if (hash.startsWith("fallback:")) return !!clean && hash === `fallback:${clean}`;
  return (await hashCommLinkPin(clean, cryptoApi)) === hash;
}
export function readCommLinkProfiles(user = globalThis.game?.user) {
  const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const profiles = {};
  for (const raw of [user?.flags?.commLinkNetwork, user?.flags?.[COMM_LINK_MID]?.commLink]) {
    const namespace = object(raw);
    const actorId = String(namespace.activeActorId || user?.character?.id || "").trim();
    if (actorId && namespace.profile && typeof namespace.profile === "object" && !Array.isArray(namespace.profile))
      profiles[actorId] = copy(namespace.profile);
    // Current records win as complete profiles: an empty PIN is an explicit removal.
    Object.assign(profiles, copy(object(namespace.profiles)));
  }
  return profiles;
}
export const commLinkAuthor = (doc) =>
  doc?.author ||
  (typeof doc?.user === "object"
    ? doc.user
    : globalThis.game?.users?.get?.(doc?.user));
export function commLinkOwnsActor(actor, user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  try {
    return actor.testUserPermission?.(user, "OWNER") === true;
  } catch {
    return false;
  }
}
export function commLinkPrimaryGM(game = globalThis.game) {
  const values = Array.from(game?.users?.values?.() || game?.users || []);
  return (
    game?.users?.activeGM ||
    values
      .filter((u) => u.isGM && u.active)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ||
    null
  );
}
export function authenticateCommLinkRequest(doc, request, actor, group) {
  const author = commLinkAuthor(doc);
  if (!author || author.id !== request?.userId)
    throw new Error("Relay author / автор запроса не совпадает.");
  if (request.action === "gm-contact-reply" && !author.isGM)
    throw new Error("Ответ от имени NPC доступен только GM / MASTER.");
  if (!request?.id || !request?.groupId || request.actorId !== actor?.id)
    throw new Error("Некорректный запрос COMM-LINK.");
  if (!commLinkOwnsActor(actor, author))
    throw new Error("Нет OWNER-доступа к Actor.");
  if (!(group?.memberActorIds || []).includes(actor.id))
    throw new Error("Actor не состоит в группе / crew.");
  return author;
}
export function publicCommLinkPublication(raw, kind, visible = true) {
  const out = copy(raw);
  if (visible) return out;
  for (const k of [
    "senderActorId",
    "senderImage",
    "fixerActorId",
    "fixerImage",
    "actorId",
    "actorUuid",
    "tokenUuid",
    "contactId",
    "fixerId",
  ])
    delete out[k];
  out.image = "";
  if (kind === "job") {
    out.fixerName = "ANONYMOUS FIXER";
    out.fixerImage = "";
  } else if (kind === "call") out.name = "PRIVATE CALLER";
  else {
    out.senderName = "UNKNOWN";
    out.threadId = `anonymous:${out.publicationId || out.id}`;
  }
  return out;
}
function coinCredits(value = {}) {
  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return value.credits !== undefined
    ? number(value.credits)
    : number(value.pp) * 100 +
        number(value.gp) * 10 +
        number(value.sp) +
        number(value.cp) / 10;
}
export function readCommLinkCredits(actor) {
  const direct =
    actor?.inventory?.currency?.credits ?? actor?.inventory?.coins?.credits;
  if (direct !== undefined && Number.isFinite(Number(direct)))
    return Number(direct);
  const coins = actor?.inventory?.coins;
  if (coins && ["pp", "gp", "sp", "cp"].some((k) => coins[k] !== undefined))
    return coinCredits(coins);
  const items = Array.from(actor?.items?.values?.() || actor?.items || []);
  const sticks = items.filter(
    (i) =>
      i.type === "treasure" &&
      [i.system?.category, i.system?.slug, i.name].some(
        (s) => String(s || "").toLowerCase() === "credstick",
      ),
  );
  return sticks.length
    ? sticks.reduce((sum, i) => sum + coinCredits(i.system?.price?.value), 0)
    : 0;
}
export function nativeCommLinkWallet(actor) {
  if (typeof actor?.inventory?.addCurrency !== "function")
    throw new Error(
      `SF2E native currency API недоступен у ${actor?.name || "Actor"}.`,
    );
  return {
    balance: readCommLinkCredits(actor),
    async credit(amount) {
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error(
          "Выплата должна быть целым неотрицательным числом Credits.",
        );
      const before = readCommLinkCredits(actor);
      if (!amount)
        return {
          before,
          after: before,
          amount,
          path: "actor.inventory.addCurrency({credits})",
        };
      const result = await actor.inventory.addCurrency({ credits: amount });
      if (result === false)
        throw new Error("SF2E отклонил начисление Credits.");
      const after = readCommLinkCredits(actor);
      if (after < before + amount)
        throw new Error(
          "SF2E не подтвердил баланс: требуется проверка кошелька, повторная выплата заблокирована.",
        );
      return {
        before,
        after,
        amount,
        path: "actor.inventory.addCurrency({credits})",
      };
    },
  };
}
export async function settleCommLinkPayout({
  ledger = {},
  shares,
  operationId,
  getActor,
  persist,
  isPrimaryGM,
}) {
  if (!isPrimaryGM())
    throw new Error("Выплату выполняет только активный MASTER / GM.");
  const next = copy(ledger);
  if (next.operationId && next.operationId !== operationId)
    throw new Error("Заказ уже содержит другую операцию выплаты.");
  if (next.status === "paid") return next;
  next.operationId = operationId;
  next.receipts ??= {};
  const plan =
    next.plan || shares.map(({ actorId, amount }) => ({ actorId, amount }));
  // Validate the complete plan before any credit can be attempted.
  for (const share of plan) {
    if (
      !share.actorId ||
      !Number.isSafeInteger(share.amount) ||
      share.amount < 0
    )
      throw new Error("Некорректная доля выплаты.");
    nativeCommLinkWallet(getActor(share.actorId));
  }
  next.plan = plan;
  next.status = "processing";
  await persist(copy(next));
  for (const share of plan) {
    if (!isPrimaryGM())
      throw new Error("Активный GM изменился. Расчёт приостановлен.");
    const receipt = next.receipts[share.actorId];
    if (receipt?.status === "applied") continue;
    if (receipt)
      throw new Error(
        "Неопределённая / uncertain выплата. Проверьте кошелёк; автоматический повтор заблокирован.",
      );
    const wallet = nativeCommLinkWallet(getActor(share.actorId));
    next.receipts[share.actorId] = {
      status: "reserved",
      amount: share.amount,
      before: wallet.balance,
      reservedAt: stamp(),
    };
    // A crash after this durable reservation must never cause another credit.
    await persist(copy(next));
    try {
      const result = await wallet.credit(share.amount);
      next.receipts[share.actorId] = {
        ...next.receipts[share.actorId],
        ...result,
        status: "applied",
        appliedAt: stamp(),
      };
      await persist(copy(next));
    } catch (error) {
      next.status = "attention";
      next.receipts[share.actorId].status = "uncertain";
      next.receipts[share.actorId].error = String(error.message || error);
      await persist(copy(next));
      throw error;
    }
  }
  next.status = "paid";
  next.paidAt = stamp();
  await persist(copy(next));
  return next;
}
export function createCommLinkOperationProcessor({
  isPrimaryGM,
  authenticate,
  readReceipt,
  commit,
  acknowledge,
}) {
  let queue = Promise.resolve();
  return (doc, request) => {
    const next = queue
      .catch(() => {})
      .then(async () => {
        if (!isPrimaryGM()) return { status: "deferred" };
        await authenticate(doc, request);
        const key = `${request.userId}:${request.id}`;
        let result = await readReceipt(key, request);
        if (result?.status !== "applied") result = await commit(request, key);
        await acknowledge(doc, request, result);
        return result;
      });
    queue = next;
    return next;
  };
}
export function projectCommLinkGroupIntoStore(store, { actor, group }) {
  if (!(group.memberActorIds || []).includes(actor?.id)) return false;
  const groupId = group.groupId;
  const book = ((store.notebooks ??= {})[actor.id] ??= {
    actorId: actor.id,
    actorName: actor.name,
    actorImg: actor.img,
    entries: {},
  });
  const people = ((book.entries ??= {}).people ??= []),
    quests = (book.entries.quests ??= []);
  for (const entry of quests)
    if (
      entry.commLinkGroupId === groupId &&
      group.jobTombstones?.[entry.commLinkJobId]
    ) {
      entry.commLinkDeleted = true;
      entry.status = "Удалён";
      if (entry.commLinkJob) entry.commLinkJob.status = "deleted";
    }
  for (const c of commLinkGroupContacts(group)) {
    const id = `comm-link-contact:${groupId}:${c.id}`;
    let entry = people.find(
      (p) =>
        p.id === id ||
        (p.commLinkGroupId === groupId && p.commLinkContactId === c.id),
    );
    if (!entry) {
      entry = {
        id,
        type: "people",
        ...mergeCommLinkContactPresentation(null, c),
        content: "",
        messages: [],
        createdAt: c.createdAt || stamp(),
      };
      people.push(entry);
    }
    Object.assign(entry, {
      ...mergeCommLinkContactPresentation(entry, c),
      commLinkGroupId: groupId,
      commLinkContactId: c.id,
      commLinkGroupName: group.groupName,
      commLinkSource: copy(c),
    });
    entry.messages ??= [];
    for (const m of group.messages || []) {
      if ((m.contactId || `thread:${m.threadId}`) !== c.id) continue;
      const message = {
        ...copy(m),
        id: `comm-link:${groupId}:${m.id}`,
        commLinkMessageId: m.id,
        commLinkGroupId: groupId,
        routeMode: "comm-link-crew",
        direction:
          m.sender === "player" && m.senderActorId === actor.id ? "out" : "in",
      };
      const existing = entry.messages.find((x) => x.id === message.id);
      if (existing) Object.assign(existing, message);
      else entry.messages.push(message);
    }
  }
  for (const j of group.jobs || []) {
    if (group.jobTombstones?.[j.id]) continue;
    const id = `comm-link-job:${groupId}:${j.id}`;
    let entry = quests.find((q) => q.id === id);
    if (!entry) {
      entry = {
        id,
        type: "quests",
        title: j.title,
        summary: j.summary || "",
        content: "",
        tasks: [],
        createdAt: j.createdAt || stamp(),
      };
      quests.push(entry);
    }
    Object.assign(entry, {
      commLinkGroupId: groupId,
      commLinkJobId: j.id,
      cityJobId: j.cityJobId || "",
      cityMarkerId: j.cityMarkerId || j.markerId || "",
      commLinkDeleted: false,
      commLinkJob: copy(j),
      status:
        {
          available: "Новый",
          accepted: "В работе",
          completed: "Выполнен",
          failed: "Провален",
          cancelled: "Отменён",
          declined: "Отклонён",
        }[j.status] || j.status,
      reward: j.pay,
    });
  }
  return true;
}
