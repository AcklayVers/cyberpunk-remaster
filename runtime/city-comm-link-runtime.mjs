// Static adaptation of user supplied NIGHT CITY COMM-LINK 0.9.2. Attachment is never evaluated.
import { readCityArchive, mutateCityArchive } from "./city-archive-service.mjs";
import {
  commLinkAuthor,
  commLinkOwnsActor,
  commLinkPrimaryGM,
  authenticateCommLinkRequest,
  publicCommLinkPublication,
  nativeCommLinkWallet,
  settleCommLinkPayout,
  createCommLinkOperationProcessor,
  projectCommLinkGroupIntoStore,
  hashCommLinkPin,
  verifyCommLinkPin,
  readCommLinkProfiles,
} from "./city-comm-link-core.mjs";
import {
  projectCityJobsIntoCommLink,
  syncCityJobEditsFromCommLink,
  removeCommLinkJob,
  cityJobDeleted,
  cityJobTermsMatch,
} from "./city-jobs-comm-link.mjs";
import { getWorldCityMap } from "./world-city-map.mjs";
import {
  commLinkViewKeys,
  captureCommLinkView,
  restoreCommLinkView,
} from "./city-comm-link-view-state.mjs";
let singleton = null;
export function initializeCityCommLink() {
  return (singleton ??= createRuntime());
}
export async function mountCityCommLink(root, options = {}) {
  return initializeCityCommLink().mount(root, options);
}
export async function sendCommLinkContactMessage(options) {
  return initializeCityCommLink().sendContactMessage(options);
}
export async function openCityCommLinkJob(options) {
  const { openCityAgent } = await import("./city-agent-runtime.mjs");
  await openCityAgent({ tab: "network", actorId: options.actorId });
  return initializeCityCommLink().openJob(options);
}
export function cityCommLinkUnread(actorId) {
  return initializeCityCommLink().unread(actorId);
}
export const CITY_COMM_LINK_HOOK = "cyberpunkRemasterCommLink";

function createRuntime() {
  "use strict";

  const MACRO_VERSION = "0.9.2";
  const FLAG_SCOPE = "cyberpunk-remaster";
  const FLAG_ROOT = `${FLAG_SCOPE}.commLink`;
  const CONTROL_NAME = "COMM-LINK // NETWORK CONTROL";
  const MASTER_CONTACT_DB_NAME = "COMM-LINK // MASTER CONTACT DATABASE";
  const MASTER_CONTACT_DB_VERSION = 1;
  const GROUP_PREFIX = "COMM-LINK // GROUP // ";
  const VERSION = 8;

  const userCanMaster = (user = game?.user) => user?.isGM === true;
  const SKINS = [
    {
      id: "night-cyan",
      label: "Night City Cyan",
      note: "холодный городской интерфейс",
    },
    {
      id: "arasaka",
      label: "Arasaka Black",
      note: "чёрный корпус и красные сигналы",
    },
    {
      id: "militech",
      label: "Militech Tactical",
      note: "военный зелёно-песочный профиль",
    },
    { id: "mox", label: "Mox Neon", note: "розово-бирюзовый клубный неон" },
    {
      id: "maelstrom",
      label: "Maelstrom",
      note: "жёсткий красный техно-профиль",
    },
    { id: "netwatch", label: "NetWatch", note: "янтарный сетевой терминал" },
    {
      id: "trauma",
      label: "Trauma Team",
      note: "медицинский бело-синий интерфейс",
    },
    { id: "afterlife", label: "Afterlife", note: "тёмный барный зелёный" },
    { id: "tyger", label: "Tyger Claws", note: "золото и магента" },
    { id: "voodoo", label: "Voodoo Boys", note: "фиолетовый NET-профиль" },
    { id: "aldecaldos", label: "Aldecaldos", note: "песочный кочевой профиль" },
    { id: "ncpd", label: "NCPD", note: "служебный сине-голубой" },
  ];
  const skinExists = (id) => SKINS.some((s) => s.id === id);

  const FX_DEFAULTS = Object.freeze({
    enabled: true,
    intensity: "balanced",
    decor: true,
    statusRail: true,
    circuits: true,
    oscillator: true,
    microcopy: true,
    hoverMotion: true,
    eventPulse: true,
    callPulse: true,
    glitch: false,
  });
  function normalizeFx(raw) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      enabled: r.enabled !== false,
      intensity: ["quiet", "balanced", "showcase"].includes(r.intensity)
        ? r.intensity
        : "balanced",
      decor: r.decor !== false,
      statusRail: r.statusRail !== false,
      circuits: r.circuits !== false,
      oscillator: r.oscillator !== false,
      microcopy: r.microcopy !== false,
      hoverMotion: r.hoverMotion !== false,
      eventPulse: r.eventPulse !== false,
      callPulse: r.callPulse !== false,
      glitch: r.glitch === true,
    };
  }
  function masterFxPrefs() {
    return normalizeFx(game?.user?.flags?.[FLAG_SCOPE]?.commLink?.masterFx);
  }

  const uid = () =>
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 18) ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const now = () => new Date().toISOString();
  const clone = (value) => {
    try {
      return structuredClone(value);
    } catch (_error) {
      return JSON.parse(JSON.stringify(value));
    }
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  const text = (value) => String(value ?? "").trim();
  const short = (value, size = 110) => {
    const clean = text(value).replace(/\s+/g, " ");
    return esc(clean.length > size ? `${clean.slice(0, size)}…` : clean);
  };
  const CL_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const formatDate = (value) => {
    if (!value) return "—";
    try {
      return CL_DATE_FORMATTER.format(new Date(value));
    } catch (_error) {
      return "—";
    }
  };
  const notify = (message, level = "info") => {
    const n = globalThis.ui?.notifications;
    if (n?.[level]) n[level](message);
    else console[level === "error" ? "error" : "log"](message);
  };
  const users = () =>
    game?.users?.contents ??
    (game?.users ? Array.from(game.users.values?.() || game.users) : []);
  const journals = () =>
    game?.journal?.contents ??
    (game?.journal ? Array.from(game.journal.values?.() || game.journal) : []);
  const actors = () =>
    game?.actors?.contents ??
    (game?.actors ? Array.from(game.actors.values?.() || game.actors) : []);

  const gmUsers = () => users().filter((u) => userCanMaster(u));
  const ownershipLevel = (name) =>
    globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.[name] ??
    { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 }[name] ??
    0;
  const sameFlatObject = (a, b) => {
    const ak = Object.keys(a || {}).sort(),
      bk = Object.keys(b || {}).sort();
    return (
      ak.length === bk.length &&
      ak.every((k, i) => k === bk[i] && Number(a?.[k]) === Number(b?.[k]))
    );
  };
  const normalize = (value) =>
    text(value).normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("ru");

  function blankNetworkData(groupId, groupName) {
    return {
      version: VERSION,
      revision: 0,
      groupId,
      groupName,
      memberActorIds: [],
      memberRoster: [],
      leaderActorId: "",
      contacts: [],
      messages: [],
      calls: [],
      jobs: [],
      events: [],
      payments: [],
      updatedAt: now(),
    };
  }

  function normalizeNetworkData(raw, groupId = "", groupName = "") {
    const data =
      raw && typeof raw === "object"
        ? clone(raw)
        : blankNetworkData(groupId, groupName);
    data.version = VERSION;
    data.revision = Math.max(0, Number(data.revision) || 0);
    data.groupId = text(data.groupId) || groupId;
    data.groupName = text(data.groupName) || groupName || "Группа";
    data.memberActorIds = Array.isArray(data.memberActorIds)
      ? [...new Set(data.memberActorIds.map(String).filter(Boolean))]
      : [];
    data.memberRoster = Array.isArray(data.memberRoster)
      ? data.memberRoster
          .map((r) => ({
            actorId: text(r.actorId),
            name: text(r.name) || "Actor",
            image: text(r.image),
            leader: r.leader === true,
          }))
          .filter((r) => r.actorId)
      : [];
    data.leaderActorId = text(data.leaderActorId);
    for (const key of [
      "contacts",
      "messages",
      "calls",
      "jobs",
      "events",
      "payments",
    ])
      if (!Array.isArray(data[key])) data[key] = [];
    data.contacts = data.contacts.map((c) => ({
      id: text(c.id) || uid(),
      name: text(c.name) || "Без имени",
      handle: text(c.handle),
      image: text(c.image) || text(c.tokenImage) || text(c.actorImage),
      tokenImage: text(c.tokenImage),
      actorImage: text(c.actorImage),
      actorUuid: text(c.actorUuid),
      actorId: text(c.actorId) || text(c.actorUuid).replace(/^Actor\./, ""),
      tokenUuid: text(c.tokenUuid),
      tags: Array.isArray(c.tags)
        ? c.tags.map(text).filter(Boolean)
        : text(c.tags).split(",").map(text).filter(Boolean),
      summary: text(c.summary),
      source: text(c.source) || "master",
      ownerActorId: text(c.ownerActorId),
      createdAt: c.createdAt || now(),
      updatedAt: c.updatedAt || now(),
    }));
    data.messages = data.messages.map((m) => ({
      id: text(m.id) || uid(),
      publicationId: text(m.publicationId),
      threadId: text(m.threadId) || text(m.contactId) || uid(),
      contactId: text(m.contactId),
      sender:
        m.sender === "player"
          ? "player"
          : m.sender === "system"
            ? "system"
            : "npc",
      senderName: text(m.senderName) || "COMM-LINK",
      senderActorId: text(m.senderActorId),
      senderImage: text(m.senderImage),
      body: text(m.body),
      image: text(m.image),
      createdAt: m.createdAt || now(),
      authorUserId: text(m.authorUserId),
    }));
    data.calls = data.calls.map((c) => ({
      id: text(c.id) || uid(),
      publicationId: text(c.publicationId),
      contactId: text(c.contactId),
      name: text(c.name) || "Неизвестный номер",
      senderActorId: text(c.senderActorId),
      senderImage: text(c.senderImage),
      image: text(c.image),
      note: text(c.note),
      status: ["ringing", "accepted", "declined", "missed", "ended"].includes(
        c.status,
      )
        ? c.status
        : "ringing",
      createdAt: c.createdAt || now(),
      updatedAt: c.updatedAt || now(),
      answeredBy: text(c.answeredBy),
      transcript: Array.isArray(c.transcript)
        ? c.transcript
            .map((line) => ({
              id: text(line.id) || uid(),
              speaker: line.speaker === "player" ? "player" : "npc",
              actorId: text(line.actorId),
              name: text(line.name) || "COMM-LINK",
              image: text(line.image),
              body: text(line.body),
              createdAt: line.createdAt || now(),
              authorUserId: text(line.authorUserId),
            }))
            .filter((line) => line.body)
        : [],
    }));
    data.jobs = data.jobs.map((j) => ({
      id: text(j.id) || uid(),
      version: Math.max(1, Number(j.version) || 1),
      cityJobId: text(j.cityJobId),
      cityJobVersion: Number(j.cityJobVersion) || 0,
      cityMarkerId: text(j.cityMarkerId || j.markerId),
      cityGiverMarkerId: text(j.cityGiverMarkerId),
      acceptedActorId: text(j.acceptedActorId),
      acceptedUserId: text(j.acceptedUserId),
      publicationId: text(j.publicationId),
      fixerId: text(j.fixerId),
      fixerName: text(j.fixerName) || "Неизвестный фиксер",
      fixerActorId: text(j.fixerActorId),
      fixerImage: text(j.fixerImage),
      title: text(j.title) || "Без названия",
      summary: text(j.summary),
      details: text(j.details),
      pay: text(j.pay),
      currency: "Credits",
      deadline: text(j.deadline),
      risk: Math.max(1, Math.min(5, Number(j.risk) || 3)),
      status:
        [
          "available",
          "accepted",
          "completed",
          "failed",
          "cancelled",
          "declined",
        ].includes(j.status) || ["offer", "active", "done"].includes(j.status)
          ? { offer: "available", active: "accepted", done: "completed" }[
              j.status
            ] || j.status
          : "available",
      acceptedBy: text(j.acceptedBy),
      createdAt: j.createdAt || now(),
      updatedAt: j.updatedAt || now(),
      settlement:
        j.settlement && typeof j.settlement === "object"
          ? clone(j.settlement)
          : null,
      payoutLedger:
        j.payoutLedger && typeof j.payoutLedger === "object"
          ? clone(j.payoutLedger)
          : null,
    }));
    data.jobTombstones =
      data.jobTombstones && typeof data.jobTombstones === "object"
        ? data.jobTombstones
        : {};
    data.jobs = data.jobs.filter(
      (job) =>
        !data.jobTombstones[job.id] &&
        !(!userCanMaster() && job.cityJobId && cityJobDeleted(job.cityJobId)),
    );
    data.payments = data.payments
      .map((pay) => ({
        id: text(pay.id) || uid(),
        userId: text(pay.userId),
        userIds: Array.isArray(pay.userIds)
          ? [...new Set(pay.userIds.map(String).filter(Boolean))]
          : text(pay.userId)
            ? [text(pay.userId)]
            : [],
        actorId: text(pay.actorId),
        actorName: text(pay.actorName) || "Edgerunner",
        amount: Number(pay.amount) || 0,
        currency: text(pay.currency) || "Credits",
        jobId: text(pay.jobId),
        jobTitle: text(pay.jobTitle),
        createdAt: pay.createdAt || now(),
      }))
      .filter((pay) => pay.actorId && pay.amount !== 0)
      .slice(0, 120);
    data.events = data.events
      .map((e) => ({
        id: text(e.id) || uid(),
        type: text(e.type) || "activity",
        source:
          e.source === "master"
            ? "master"
            : e.source === "system"
              ? "system"
              : "player",
        actorName: text(e.actorName) || "Edgerunner",
        summary: text(e.summary),
        detail: text(e.detail),
        targetType: text(e.targetType),
        targetId: text(e.targetId),
        threadId: text(e.threadId),
        createdAt: e.createdAt || now(),
      }))
      .filter((e) => e.summary)
      .slice(0, 120);
    data.updatedAt = data.updatedAt || now();
    return data;
  }

  function normalizeControl(raw) {
    const c = raw && typeof raw === "object" ? clone(raw) : {};
    if (!Array.isArray(c.groups)) c.groups = [];
    if (!Array.isArray(c.contactTemplates)) c.contactTemplates = [];
    if (
      !c.publicationMeta ||
      typeof c.publicationMeta !== "object" ||
      Array.isArray(c.publicationMeta)
    )
      c.publicationMeta = {};
    if (!c.masterSender || typeof c.masterSender !== "object")
      c.masterSender = {};
    c.masterSender = {
      actorId: text(c.masterSender.actorId),
      manualName: text(c.masterSender.manualName) || "COMM-LINK",
      manualImage: text(c.masterSender.manualImage),
      identityVisible: c.masterSender.identityVisible !== false,
    };
    c.version = VERSION;
    c.groups = c.groups.map((g) => {
      const legacyUserIds = Array.isArray(g.userIds)
        ? [...new Set(g.userIds.map(String).filter(Boolean))]
        : [];
      const legacyMap =
        g.memberActors && typeof g.memberActors === "object"
          ? clone(g.memberActors)
          : {};
      const hasExplicitActorIds = Array.isArray(g.actorIds);
      const actorIds = hasExplicitActorIds
        ? [...new Set(g.actorIds.map(String).filter(Boolean))]
        : [];
      // v0.8.4: userIds is ownership cache, never a source of truth for current crew membership.
      // Legacy user/memberActors migration happens only for genuinely old groups that never had actorIds.
      if (!hasExplicitActorIds) {
        for (const actorId of Object.values(legacyMap)
          .map(text)
          .filter(Boolean))
          if (!actorIds.includes(actorId)) actorIds.push(actorId);
        for (const userId of legacyUserIds) {
          const actor = resolveUserActor(userId);
          if (actor?.id && !actorIds.includes(actor.id))
            actorIds.push(actor.id);
        }
      }
      const leaderActorId =
        text(g.leaderActorId) ||
        text(legacyMap[text(g.leaderUserId)]) ||
        text(resolveUserActor(text(g.leaderUserId))?.id);
      return {
        id: text(g.id) || uid(),
        name: text(g.name) || "Группа",
        journalId: text(g.journalId),
        actorIds,
        leaderActorId: actorIds.includes(leaderActorId)
          ? leaderActorId
          : actorIds[0] || "",
        // userIds остаётся техническим кэшем только для ownership Journal. Состав группы определяется actorIds.
        userIds: legacyUserIds,
        createdAt: g.createdAt || now(),
      };
    });
    c.contactTemplates = c.contactTemplates.map((cn) => ({
      id: text(cn.id) || uid(),
      name: text(cn.name) || "Без имени",
      handle: text(cn.handle),
      image: text(cn.image) || text(cn.tokenImage) || text(cn.actorImage),
      tokenImage: text(cn.tokenImage),
      actorImage: text(cn.actorImage),
      actorUuid: text(cn.actorUuid),
      actorId: text(cn.actorId) || text(cn.actorUuid).replace(/^Actor\./, ""),
      tokenUuid: text(cn.tokenUuid),
      tags: Array.isArray(cn.tags) ? cn.tags.map(text).filter(Boolean) : [],
      summary: text(cn.summary),
      source: text(cn.source) || "master",
    }));
    return c;
  }

  function normalizeMasterDbContact(raw) {
    const c =
      raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
    const id = text(c.id) || uid();
    return {
      id,
      name: text(c.name) || "Без имени",
      handle: text(c.handle),
      image: text(c.image) || text(c.tokenImage) || text(c.actorImage),
      tokenImage: text(c.tokenImage),
      actorImage: text(c.actorImage),
      actorUuid: text(c.actorUuid),
      actorId: text(c.actorId) || text(c.actorUuid).replace(/^Actor\./, ""),
      tokenUuid: text(c.tokenUuid),
      tags: Array.isArray(c.tags)
        ? c.tags.map(text).filter(Boolean)
        : text(c.tags).split(",").map(text).filter(Boolean),
      summary: text(c.summary),
      source: "master",
      createdAt: c.createdAt || now(),
      updatedAt: c.updatedAt || now(),
      createdByUserId: text(c.createdByUserId),
      updatedByUserId: text(c.updatedByUserId),
    };
  }
  function normalizeMasterContactDatabase(raw) {
    const d =
      raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
    const contacts = {};
    const source = Array.isArray(d.contacts)
      ? d.contacts
      : Object.values(
          d.contacts && typeof d.contacts === "object" ? d.contacts : {},
        );
    for (const rawContact of source) {
      if (!rawContact || typeof rawContact !== "object") continue;
      const c = normalizeMasterDbContact(rawContact);
      contacts[c.id] = c;
    }
    return {
      version: MASTER_CONTACT_DB_VERSION,
      contacts,
      migratedLegacy: d.migratedLegacy === true,
      updatedAt: d.updatedAt || now(),
    };
  }
  function masterDbFlags(doc) {
    return (
      doc?.flags?.[FLAG_SCOPE]?.commLink?.masterContacts ??
      doc?.flags?.commLinkNetwork?.masterContacts ??
      null
    );
  }
  function sharedMasterContacts() {
    return Object.values(state.masterContactDb?.contacts || {});
  }

  const state = {
    root: null,
    style: null,
    mode: "login",
    masterTab: "network",
    runnerTab: "home",
    previewGroupId: "",
    activeGroupId: "",
    runnerActorId:
      text(game?.user?.flags?.[FLAG_SCOPE]?.commLink?.activeActorId) ||
      text(game?.user?.character?.id),
    runnerSimulation: false,
    controlDoc: null,
    control: normalizeControl(null),
    masterContactDbDoc: null,
    masterContactDb: normalizeMasterContactDatabase(null),
    groupDocs: new Map(),
    groupData: new Map(),
    modal: null,
    contextMenu: null,
    groupHistory: new Map(),
    groupWriteQueues: new Map(),
    previewDataByGroup: new Map(),
    simProfileName: "SIM Edgerunner",
    simSkin: "night-cyan",
    simFx: normalizeFx(null),
    search: "",
    minimized: false,
    restoreGeometry: null,
    loginTarget: "",
    x: Math.max(
      20,
      Math.round(
        ((globalThis.innerWidth || 1200) - (userCanMaster() ? 760 : 470)) / 2,
      ),
    ),
    y: Math.max(20, Math.round(((globalThis.innerHeight || 900) - 660) / 2)),
    width: userCanMaster()
      ? Math.min(760, (globalThis.innerWidth || 1200) - 40)
      : Math.min(470, (globalThis.innerWidth || 1200) - 30),
    height: Math.min(660, (globalThis.innerHeight || 900) - 40),
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    toasts: [],
    masterContactSearch: "",
    runnerContactSearch: "",
    showMasterJobArchive: false,
    showMasterCallArchive: false,
    showRunnerJobArchive: false,
    showRunnerCallArchive: false,
    actorSearch: "",
    masterSenderSearch: "",
    busyLabel: "",
    senderReturnModal: null,
    fxTimer: null,
    fxEventKind: "",
    fxEventUntil: 0,
    diagReport: null,
  };

  const diagState = {
    sessionStartedAt: Date.now(),
    perf: {
      render: { count: 0, total: 0, max: 0, last: 0 },
      refreshData: { count: 0, total: 0, max: 0, last: 0 },
      liveRefresh: { count: 0, total: 0, max: 0, last: 0 },
    },
    actions: new Map(),
    errors: [],
    writes: { control: 0, group: 0, repair: 0 },
    hookSignals: 0,
    coalescedSignals: 0,
    scans: 0,
    deepScans: 0,
    lastScanAt: 0,
  };
  const diagNow = () => globalThis.performance?.now?.() ?? Date.now();
  function recordPerf(kind, ms) {
    const bucket = diagState.perf[kind];
    if (!bucket || !Number.isFinite(ms)) return;
    bucket.count++;
    bucket.total += ms;
    bucket.last = ms;
    bucket.max = Math.max(bucket.max, ms);
  }
  function recordActionPerf(action, ms) {
    if (!action || !Number.isFinite(ms)) return;
    const item = diagState.actions.get(action) || {
      count: 0,
      total: 0,
      max: 0,
      last: 0,
    };
    item.count++;
    item.total += ms;
    item.last = ms;
    item.max = Math.max(item.max, ms);
    diagState.actions.set(action, item);
  }
  function recordDiagError(scope, error) {
    const item = {
      at: Date.now(),
      scope: text(scope) || "COMM-LINK",
      message: text(error?.message || error) || "Unknown error",
      stack: text(error?.stack),
    };
    diagState.errors.unshift(item);
    if (diagState.errors.length > 40) diagState.errors.length = 40;
  }
  function resetDiagnostics() {
    for (const key of Object.keys(diagState.perf))
      diagState.perf[key] = { count: 0, total: 0, max: 0, last: 0 };
    diagState.actions.clear();
    diagState.errors.length = 0;
    diagState.writes = { control: 0, group: 0, repair: 0 };
    diagState.hookSignals = 0;
    diagState.coalescedSignals = 0;
    diagState.scans = 0;
    diagState.deepScans = 0;
    diagState.lastScanAt = 0;
    state.diagReport = null;
  }
  function perfAvg(bucket) {
    return bucket?.count ? bucket.total / bucket.count : 0;
  }
  function byteSize(value) {
    try {
      const s = JSON.stringify(value);
      return globalThis.TextEncoder
        ? new TextEncoder().encode(s).length
        : s.length * 2;
    } catch (_e) {
      return 0;
    }
  }
  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n > 10240 ? 0 : 1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
  function diagSeverityRank(level) {
    return level === "error"
      ? 3
      : level === "warn"
        ? 2
        : level === "info"
          ? 1
          : 0;
  }
  function diagStatus() {
    const issues = state.diagReport?.issues || [];
    const max = Math.max(0, ...issues.map((x) => diagSeverityRank(x.level)));
    return max >= 3 ? "bad" : max === 2 ? "warn" : "good";
  }
  function diagButton(label = "SYS") {
    const status = diagStatus(),
      score = state.diagReport?.score;
    return `<button data-action="diagnostics" class="cl-diag-btn ${status}" title="Быстрая диагностика COMM-LINK: ошибки, нагрузка, тяжёлые функции"><span class="cl-diag-dot"></span>${label}${Number.isFinite(score) ? `<b>${score}</b>` : ""}</button>`;
  }
  function duplicateIds(list) {
    const seen = new Set(),
      dupes = new Set();
    for (const item of list || []) {
      const id = text(item?.id);
      if (!id) continue;
      if (seen.has(id)) dupes.add(id);
      else seen.add(id);
    }
    return [...dupes];
  }
  function diagnosticsText(report = state.diagReport) {
    if (!report) return "COMM-LINK diagnostics: no report";
    const lines = [
      `COMM-LINK v${MACRO_VERSION} // SYS DIAGNOSTICS`,
      `Score: ${report.score}/100`,
      `Mode: ${report.mode}`,
      `Groups: ${report.summary.groups}; Actors: ${report.summary.actors}; DOM: ${report.summary.domNodes}; Payload: ${formatBytes(report.summary.payloadBytes)}`,
      `Render avg/max: ${report.metrics.renderAvg.toFixed(2)} / ${report.metrics.renderMax.toFixed(2)} ms`,
      `Refresh avg/max: ${report.metrics.refreshAvg.toFixed(2)} / ${report.metrics.refreshMax.toFixed(2)} ms`,
      `Hooks/coalesced: ${report.metrics.hookSignals}/${report.metrics.coalescedSignals}`,
      `Writes control/group/repair: ${report.metrics.writes.control}/${report.metrics.writes.group}/${report.metrics.writes.repair}`,
      `Errors captured: ${report.errors.length}`,
      "",
      "Issues:",
    ];
    if (!report.issues.length) lines.push("- none");
    else
      for (const x of report.issues)
        lines.push(`- [${x.level.toUpperCase()}] ${x.title}: ${x.detail}`);
    if (report.benchmarks?.length) {
      lines.push("", "Local benchmarks:");
      for (const b of report.benchmarks)
        lines.push(
          `- ${b.name}: ${b.avg.toFixed(2)} ms avg / ${b.max.toFixed(2)} ms max (${b.runs} runs)`,
        );
    }
    if (report.errors.length) {
      lines.push("", "Recent errors:");
      for (const e of report.errors.slice(0, 10))
        lines.push(`- ${e.scope}: ${e.message}`);
    }
    return lines.join("\n");
  }
  async function runDiagnostics(deep = false) {
    const scanStart = diagNow(),
      issues = [],
      benchmarks = [];
    const issue = (level, title, detail) =>
      issues.push({ level, title, detail });
    const bench = (name, fn, runs = 8) => {
      let total = 0,
        max = 0,
        ok = 0;
      for (let i = 0; i < runs; i++) {
        const t = diagNow();
        try {
          fn();
          const ms = diagNow() - t;
          total += ms;
          max = Math.max(max, ms);
          ok++;
        } catch (error) {
          recordDiagError(`diagnostic:${name}`, error);
          issue(
            "error",
            `Тест ${name} завершился ошибкой`,
            text(error?.message || error),
          );
          break;
        }
      }
      if (ok) benchmarks.push({ name, runs: ok, avg: total / ok, max });
    };

    const groupIds = new Set(),
      actorMembership = new Map();
    let payloadBytes = 0,
      totalItems = 0;
    const scanGroups = userCanMaster()
      ? state.control.groups || []
      : [...state.groupData.entries()].map(([id, data]) => ({
          id,
          name: data.groupName || groupNameById(id),
          journalId: state.groupDocs.get(id)?.id || "",
          actorIds: [...(data.memberActorIds || [])],
          userIds: [],
        }));
    for (const group of scanGroups) {
      if (groupIds.has(group.id))
        issue("error", "Дублирующийся ID группы", `${group.name}: ${group.id}`);
      groupIds.add(group.id);
      const actorIds = [...new Set(group.actorIds || [])];
      for (const actorId of actorIds) {
        actorMembership.set(actorId, (actorMembership.get(actorId) || 0) + 1);
        if (!actorById(actorId))
          issue("error", "Actor группы не найден", `${group.name}: ${actorId}`);
      }
      const data = state.groupData.get(group.id);
      const doc =
        state.groupDocs.get(group.id) ||
        (userCanMaster() ? groupDocById(group) : null);
      if (!doc) issue("error", "Journal группы недоступен", group.name);
      if (!data) {
        issue("error", "Данные группы не загружены", group.name);
        continue;
      }
      const bytes = byteSize(data);
      payloadBytes += bytes;
      if (bytes > 700 * 1024)
        issue(
          "error",
          "Очень большой пакет группы",
          `${group.name}: ${formatBytes(bytes)}. Архивируйте/удаляйте старые сообщения, события и звонки.`,
        );
      else if (bytes > 300 * 1024)
        issue(
          "warn",
          "Большой пакет группы",
          `${group.name}: ${formatBytes(bytes)}. Это уже заметно увеличивает сериализацию Journal.`,
        );
      const rosterIds = [...(data.memberActorIds || [])].sort(),
        controlIds = [...actorIds].sort();
      if (JSON.stringify(rosterIds) !== JSON.stringify(controlIds))
        issue(
          "error",
          "Состав группы рассинхронизирован",
          `${group.name}: CONTROL и GROUP Journal содержат разные Actor ID.`,
        );
      const arrays = {
        contacts: data.contacts || [],
        messages: data.messages || [],
        calls: data.calls || [],
        jobs: data.jobs || [],
        events: data.events || [],
        payments: data.payments || [],
      };
      for (const [kind, list] of Object.entries(arrays)) {
        totalItems += list.length;
        const dup = duplicateIds(list);
        if (dup.length)
          issue(
            "error",
            `Дубли ID: ${kind}`,
            `${group.name}: ${dup.slice(0, 5).join(", ")}${dup.length > 5 ? "…" : ""}`,
          );
      }
      if (arrays.messages.length > 500)
        issue(
          "warn",
          "Много сообщений",
          `${group.name}: ${arrays.messages.length}. Рекомендуется архив/очистка истории.`,
        );
      if (arrays.events.length > 700)
        issue(
          "warn",
          "Много событий автоматизации",
          `${group.name}: ${arrays.events.length}. Событийный журнал можно чистить пакетно.`,
        );
      if (arrays.calls.length > 180)
        issue(
          "warn",
          "Большой архив звонков",
          `${group.name}: ${arrays.calls.length}.`,
        );
      if (arrays.jobs.length > 220)
        issue(
          "warn",
          "Большой архив заказов",
          `${group.name}: ${arrays.jobs.length}.`,
        );
      if (arrays.contacts.length > 250)
        issue(
          "warn",
          "Очень много контактов",
          `${group.name}: ${arrays.contacts.length}. Поиск и отрисовка будут тяжелее.`,
        );
    }
    if (userCanMaster()) {
      for (const group of state.control.groups || []) {
        const expected = new Set(
          (group.actorIds || []).flatMap((id) =>
            actorControllerUserIds(actorById(id)),
          ),
        );
        const actual = new Set(group.userIds || []);
        const stale = [...actual].filter((id) => !expected.has(id));
        if (stale.length)
          issue(
            "warn",
            "Устаревший ownership-кэш",
            `${group.name}: ${stale.length} userId не соответствует текущим Actor. Синхронизация группы исправит это автоматически.`,
          );
      }
    }
    const root = state.root,
      domNodes = root?.querySelectorAll?.("*")?.length || 0,
      actionNodes = root?.querySelectorAll?.("[data-action]")?.length || 0;
    if (domNodes > 2200)
      issue(
        "error",
        "Слишком большой DOM",
        `${domNodes} элементов в открытом COMM-LINK. Нужна виртуализация/пагинация списков.`,
      );
    else if (domNodes > 1200)
      issue(
        "warn",
        "Тяжёлый DOM",
        `${domNodes} элементов. При больших архивах лучше ограничивать одновременно видимые записи.`,
      );
    if (document.querySelectorAll(".city-comm-link").length > 1)
      issue(
        "error",
        "Дублирован root COMM-LINK",
        `${document.querySelectorAll("#comm-link-root").length} экземпляра.`,
      );
    if (document.querySelectorAll("#comm-link-style").length > 1)
      issue(
        "warn",
        "Дублирован CSS COMM-LINK",
        `${document.querySelectorAll("#comm-link-style").length} style-узла.`,
      );
    const renderAvg = perfAvg(diagState.perf.render),
      renderMax = diagState.perf.render.max,
      refreshAvg = perfAvg(diagState.perf.refreshData),
      refreshMax = diagState.perf.refreshData.max,
      liveAvg = perfAvg(diagState.perf.liveRefresh);
    if (renderAvg > 25 || renderMax > 80)
      issue(
        "error",
        "Медленная отрисовка",
        `avg ${renderAvg.toFixed(1)} ms / max ${renderMax.toFixed(1)} ms.`,
      );
    else if (renderAvg > 12 || renderMax > 45)
      issue(
        "warn",
        "Отрисовка иногда тяжёлая",
        `avg ${renderAvg.toFixed(1)} ms / max ${renderMax.toFixed(1)} ms.`,
      );
    if (refreshAvg > 80 || refreshMax > 250)
      issue(
        "warn",
        "Полный refresh занимает много времени",
        `avg ${refreshAvg.toFixed(1)} ms / max ${refreshMax.toFixed(1)} ms. Важно следить за размером Journal.`,
      );
    if (diagState.errors.length)
      issue(
        diagState.errors.length > 5 ? "error" : "warn",
        "Зафиксированы ошибки COMM-LINK",
        `${diagState.errors.length} за текущую сессию. Откройте блок ошибок ниже.`,
      );
    const actionStats = [...diagState.actions.entries()]
      .map(([name, v]) => ({
        name,
        avg: perfAvg(v),
        max: v.max,
        count: v.count,
      }))
      .sort((a, b) => b.max - a.max);
    for (const a of actionStats.slice(0, 3))
      if (a.max > 180)
        issue(
          "warn",
          "Тяжёлое действие",
          `${a.name}: max ${a.max.toFixed(1)} ms, avg ${a.avg.toFixed(1)} ms (${a.count} запусков).`,
        );
    if (
      audioState.ringTimer &&
      !currentRunnerData()?.calls?.some((c) => c.status === "ringing")
    )
      issue(
        "warn",
        "Таймер звонка остался активен",
        "Нет звонка со статусом ringing, но ringTimer работает.",
      );
    if (
      diagState.hookSignals > 80 &&
      diagState.coalescedSignals / diagState.hookSignals < 0.15
    )
      issue(
        "info",
        "Много одиночных Journal-событий",
        `${diagState.hookSignals} сигналов; объединено ${diagState.coalescedSignals}. Это не ошибка, но стоит наблюдать при больших сессиях.`,
      );

    if (deep) {
      diagState.deepScans++;
      bench(
        "Построение текущего UI",
        () => {
          state.mode === "master" && userCanMaster()
            ? masterView()
            : state.mode === "login"
              ? loginView()
              : runnerView();
        },
        12,
      );
      const samples = [...state.groupData.entries()];
      if (samples.length)
        bench(
          "Нормализация данных групп",
          () => {
            for (const [id, data] of samples)
              normalizeNetworkData(data, id, data.groupName);
          },
          10,
        );
      if (userCanMaster())
        bench("Сбор контактов MASTER", () => allMasterContacts(), 15);
      if (root)
        bench(
          "DOM query [data-action]",
          () => root.querySelectorAll("[data-action]").length,
          20,
        );
      for (const b of benchmarks) {
        if (b.avg > 20)
          issue(
            "warn",
            "Локальный benchmark медленный",
            `${b.name}: ${b.avg.toFixed(1)} ms avg.`,
          );
      }
    }
    let score = 100;
    for (const x of issues)
      score -=
        x.level === "error"
          ? 18
          : x.level === "warn"
            ? 7
            : x.level === "info"
              ? 1
              : 0;
    score = Math.max(0, Math.min(100, score));
    const memory = globalThis.performance?.memory
      ? {
          used: performance.memory.usedJSHeapSize || 0,
          total: performance.memory.totalJSHeapSize || 0,
          limit: performance.memory.jsHeapSizeLimit || 0,
        }
      : null;
    const report = {
      at: Date.now(),
      deep,
      score,
      mode: state.mode,
      scanMs: diagNow() - scanStart,
      summary: {
        groups: state.groupData.size,
        actors: actors().length,
        totalItems,
        domNodes,
        actionNodes,
        payloadBytes,
        memory,
      },
      metrics: {
        renderAvg,
        renderMax,
        refreshAvg,
        refreshMax,
        liveAvg,
        liveMax: diagState.perf.liveRefresh.max,
        hookSignals: diagState.hookSignals,
        coalescedSignals: diagState.coalescedSignals,
        writes: { ...diagState.writes },
        topActions: actionStats.slice(0, 8),
      },
      issues: issues.sort(
        (a, b) => diagSeverityRank(b.level) - diagSeverityRank(a.level),
      ),
      benchmarks,
      errors: diagState.errors.slice(0, 20),
    };
    diagState.scans++;
    diagState.lastScanAt = Date.now();
    state.diagReport = report;
    return report;
  }
  async function openDiagnostics(deep = false) {
    try {
      await runDiagnostics(deep);
      state.modal = { type: "diagnostics" };
      render();
    } catch (error) {
      recordDiagError("diagnostics", error);
      console.error("COMM-LINK diagnostics failed", error);
      notify(`Диагностика: ${error?.message || error}`, "error");
    }
  }

  const audioState = {
    ctx: null,
    seenMessages: new Set(),
    seenCalls: new Set(),
    seenJobs: new Set(),
    seenEvents: new Set(),
    seenPayments: new Set(),
    jobStatus: new Map(),
    callStatus: new Map(),
    primed: false,
    ringTimer: null,
  };
  function primeAudio() {
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      if (!audioState.ctx) audioState.ctx = new Ctx();
      audioState.ctx.resume?.();
      audioState.primed = true;
    } catch (_error) {}
  }
  function soundAllowed() {
    const p = runnerProfile();
    return (
      state.mode === "edgerunner" &&
      !isRunnerSimulation() &&
      p.soundEnabled !== false
    );
  }
  function synthTone(freq = 880, duration = 0.08, delay = 0, gain = 0.045) {
    if (!soundAllowed()) return;
    try {
      primeAudio();
      const ctx = audioState.ctx;
      if (!ctx || ctx.state === "suspended") return;
      const osc = ctx.createOscillator(),
        amp = ctx.createGain();
      const t = ctx.currentTime + delay,
        volume = Math.max(
          0.01,
          Math.min(0.12, gain * (runnerProfile().soundVolume ?? 1)),
        );
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(volume, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch (_error) {}
  }
  function playMessageSound() {
    synthTone(1180, 0.07, 0, 0.04);
    synthTone(1540, 0.055, 0.065, 0.032);
  }
  function playCallSound() {
    synthTone(720, 0.12, 0, 0.055);
    synthTone(940, 0.12, 0.15, 0.055);
    synthTone(720, 0.1, 0.31, 0.04);
  }
  function playJobSound() {
    synthTone(520, 0.06, 0, 0.035);
    synthTone(760, 0.06, 0.07, 0.04);
    synthTone(1040, 0.08, 0.14, 0.035);
  }
  function playMoneySound() {
    synthTone(880, 0.06, 0, 0.04);
    synthTone(1175, 0.07, 0.065, 0.045);
    synthTone(1568, 0.12, 0.14, 0.05);
  }
  function updateRingtoneLoop() {
    const ringing =
      commLinkUiOpen() &&
      state.mode === "edgerunner" &&
      !isRunnerSimulation() &&
      currentRunnerData()?.calls?.some((c) => c.status === "ringing");
    if (ringing && soundAllowed()) {
      if (!audioState.ringTimer) {
        playCallSound();
        audioState.ringTimer = setInterval(() => {
          if (
            state.mode === "edgerunner" &&
            !isRunnerSimulation() &&
            currentRunnerData()?.calls?.some((c) => c.status === "ringing")
          )
            playCallSound();
          else stopRingtoneLoop();
        }, 3200);
      }
    } else stopRingtoneLoop();
  }
  function stopRingtoneLoop() {
    if (audioState.ringTimer) {
      clearInterval(audioState.ringTimer);
      audioState.ringTimer = null;
    }
  }
  function notificationNetworks(groupFilter = "") {
    if (state.mode === "edgerunner") {
      if (isRunnerSimulation()) return [];
      const actorId = currentRunnerActorId();
      return [...state.groupData]
        .filter(
          ([groupId]) =>
            (!groupFilter || groupId === groupFilter) &&
            groupAllowsActor(groupId, actorId),
        )
        .map(([groupId, data]) => ({ groupId, data }));
    }
    if (state.mode === "master" && userCanMaster())
      return [...state.groupData]
        .filter(([groupId]) => !groupFilter || groupId === groupFilter)
        .map(([groupId, data]) => ({ groupId, data }));
    return [];
  }
  function seedNotificationState() {
    audioState.seenMessages.clear();
    audioState.seenCalls.clear();
    audioState.seenJobs.clear();
    audioState.seenEvents.clear();
    audioState.seenPayments.clear();
    audioState.jobStatus.clear();
    audioState.callStatus.clear();
    for (const { groupId, data } of notificationNetworks()) {
      for (const m of data.messages || [])
        if (!isMyCommLinkLine(m))
          audioState.seenMessages.add(`${groupId}:${m.id}`);
      for (const c of data.calls || []) {
        audioState.seenCalls.add(`${groupId}:${c.id}`);
        audioState.callStatus.set(`${groupId}:${c.id}`, c.status);
      }
      for (const j of data.jobs || []) {
        audioState.seenJobs.add(`${groupId}:${j.id}`);
        audioState.jobStatus.set(`${groupId}:${j.id}`, j.status);
      }
      for (const e of data.events || [])
        audioState.seenEvents.add(`${groupId}:${e.id}`);
      for (const pay of data.payments || [])
        if (pay.actorId === currentRunnerActorId())
          audioState.seenPayments.add(`${groupId}:${pay.id}`);
    }
  }
  function detectIncomingNotifications(groupFilter = "") {
    const nets = notificationNetworks(groupFilter);
    if (state.mode === "edgerunner") {
      let newMessage = false,
        newCall = false,
        newJob = false,
        newMoney = false;
      for (const { groupId, data } of nets) {
        for (const m of data.messages || [])
          if (!isMyCommLinkLine(m)) {
            const key = `${groupId}:${m.id}`;
            if (!audioState.seenMessages.has(key)) {
              audioState.seenMessages.add(key);
              newMessage = true;
              pushToast({
                kind: "message",
                title:
                  text(m.senderName) ||
                  contactName(data, m.contactId, "Новое сообщение"),
                body: m.body,
                action: "thread",
                groupId,
                targetId: m.id,
                threadId: m.threadId,
              });
            }
          }
        for (const c of data.calls || []) {
          const key = `${groupId}:${c.id}`,
            prev = audioState.callStatus.get(key);
          if (!audioState.seenCalls.has(key)) {
            audioState.seenCalls.add(key);
            if (c.status === "ringing") {
              newCall = true;
              pushToast({
                kind: "call",
                title: `Входящий вызов · ${c.name}`,
                body: c.note || "COMM-LINK",
                action: "call",
                groupId,
                targetId: c.id,
              });
            }
          } else if (
            prev &&
            prev !== c.status &&
            ["ended", "declined", "missed"].includes(c.status)
          )
            pushToast({
              kind: "call",
              title: `Звонок · ${c.name}`,
              body: callStatusLabel(c.status),
              action: "call",
              groupId,
              targetId: c.id,
            });
          audioState.callStatus.set(key, c.status);
        }
        for (const j of data.jobs || []) {
          const key = `${groupId}:${j.id}`,
            prev = audioState.jobStatus.get(key);
          if (!audioState.seenJobs.has(key)) {
            audioState.seenJobs.add(key);
            newJob = true;
            pushToast({
              kind: "job",
              title: `Новый заказ · ${j.fixerName}`,
              body: j.title,
              action: "job",
              groupId,
              targetId: j.id,
            });
          } else if (
            prev &&
            prev !== j.status &&
            ["completed", "failed", "cancelled", "available"].includes(j.status)
          )
            pushToast({
              kind: "job",
              title: `FIXER.NET · ${j.title}`,
              body: jobStatusLabel(j.status),
              action: "job",
              groupId,
              targetId: j.id,
            });
          audioState.jobStatus.set(key, j.status);
        }
        for (const pay of data.payments || []) {
          if (pay.actorId !== currentRunnerActorId()) continue;
          const key = `${groupId}:${pay.id}`;
          if (!audioState.seenPayments.has(key)) {
            audioState.seenPayments.add(key);
            newMoney = true;
            pushToast({
              kind: "money",
              title: `+${formatCredits(pay.amount)} Credits`,
              body: pay.jobTitle || "Выплата получена",
              action: "job",
              groupId,
              targetId: pay.jobId,
            });
          }
        }
      }
      if (newMoney) {
        playMoneySound();
        triggerFx("money");
      } else if (newCall) {
        playCallSound();
        triggerFx("call");
      } else if (newMessage) {
        playMessageSound();
        triggerFx("message");
      } else if (newJob) {
        playJobSound();
        triggerFx("job");
      }
      updateRingtoneLoop();
      return;
    }
    if (state.mode === "master" && userCanMaster()) {
      let newMasterEvent = false;
      for (const { groupId, data } of nets)
        for (const e of data.events || []) {
          const key = `${groupId}:${e.id}`;
          if (!audioState.seenEvents.has(key)) {
            audioState.seenEvents.add(key);
            newMasterEvent = true;
            pushToast({
              kind: "master",
              title: `${groupNameById(groupId)} · ${e.actorName}`,
              body: e.summary,
              action:
                e.targetType === "thread"
                  ? "thread"
                  : e.targetType === "call"
                    ? "call"
                    : e.targetType === "job"
                      ? "job"
                      : "",
              groupId,
              targetId: e.targetId,
              threadId: e.threadId,
            });
          }
        }
      if (newMasterEvent) triggerFx("signal");
    }
  }

  function groupNameById(groupId) {
    return (
      state.control.groups.find((g) => g.id === groupId)?.name ||
      state.groupData.get(groupId)?.groupName ||
      "Группа"
    );
  }
  const CL_CREDITS_FORMATTER = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  });
  function formatCredits(value) {
    return CL_CREDITS_FORMATTER.format(Number(value) || 0);
  }
  function actorImage(actor) {
    return text(actor?.prototypeToken?.texture?.src) || text(actor?.img);
  }
  function actorById(id) {
    return game?.actors?.get?.(id) ?? actors().find((a) => a.id === id) ?? null;
  }
  function actorControllerUserIds(actor) {
    return users()
      .filter((u) => !u.isGM && commLinkOwnsActor(actor, u))
      .map((u) => u.id);
  }
  function actorAccessibleToUser(actor, user = game?.user) {
    return commLinkOwnsActor(actor, user);
  }
  function runnerActorOptions() {
    const groupActorIds = new Set();
    for (const data of state.groupData.values())
      for (const id of data.memberActorIds || []) groupActorIds.add(id);
    const list = actors().filter((a) => !a.pack && actorAccessibleToUser(a));
    const preferred = [...list].sort((a, b) => {
      const ag = groupActorIds.has(a.id) ? 0 : 1,
        bg = groupActorIds.has(b.id) ? 0 : 1;
      return ag - bg || String(a.name).localeCompare(String(b.name), "ru");
    });
    return preferred;
  }
  function currentRunnerActor() {
    if (state.runnerActorId) {
      const explicit = actorById(state.runnerActorId);
      return explicit && actorAccessibleToUser(explicit) ? explicit : null;
    }
    const assigned = game?.user?.character;
    if (assigned && actorAccessibleToUser(assigned)) {
      state.runnerActorId = assigned.id;
      return assigned;
    }
    return null;
  }
  function currentRunnerActorId() {
    return text(currentRunnerActor()?.id);
  }
  function groupAccessUserIds(group) {
    const out = new Set();
    for (const actorId of group?.actorIds || [])
      for (const userId of actorControllerUserIds(actorById(actorId)))
        out.add(userId);
    return [...out].filter(Boolean);
  }
  function syncGroupAccessUsers(group) {
    if (!group) return [];
    group.userIds = groupAccessUserIds(group);
    return group.userIds;
  }
  function masterSenderProfile() {
    const cfg = state.control.masterSender || {};
    const actor = actorById(cfg.actorId);
    return {
      actorId: text(actor?.id || cfg.actorId),
      name: text(actor?.name) || text(cfg.manualName) || "COMM-LINK",
      image: actorImage(actor) || text(cfg.manualImage),
      identityVisible: cfg.identityVisible !== false,
    };
  }
  function publicSender(profile, kind, visible = true, manualName = "") {
    if (visible !== false)
      return { name: text(manualName) || profile.name, image: profile.image };
    return {
      name:
        kind === "job"
          ? "ANONYMOUS FIXER"
          : kind === "call"
            ? "PRIVATE CALLER"
            : "UNKNOWN",
      image: "",
    };
  }
  function savePublicationMeta(
    publicationId,
    kind,
    profile,
    visible,
    publicName,
  ) {
    if (!publicationId || !userCanMaster()) return;
    state.control.publicationMeta[publicationId] = {
      kind,
      actorId: profile.actorId,
      name: profile.name,
      image: profile.image,
      identityVisible: visible !== false,
      publicName: text(publicName),
      createdAt: now(),
    };
  }
  function publicationMeta(item) {
    return state.control.publicationMeta?.[item?.publicationId] || null;
  }

  function masterActorRows() {
    return actors()
      .filter((a) => !a.pack)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
  }
  function resolveUserActor(userId) {
    const u = users().find((x) => x.id === userId);
    if (u?.character) return u.character;
    const owned = actors().filter(
      (a) => Number(a.ownership?.[userId] ?? 0) >= ownershipLevel("OWNER"),
    );
    if (owned.length === 1) return owned[0];
    const exact = owned.find((a) => normalize(a.name) === normalize(u?.name));
    return exact || null;
  }

  function groupById(groupId) {
    return state.control.groups.find((g) => g.id === groupId) || null;
  }

  function groupLeaderActor(groupId) {
    const g = groupById(groupId);
    const data = state.groupData.get(groupId);
    return actorById(text(g?.leaderActorId) || text(data?.leaderActorId));
  }
  function runnerCanDecideJobs(groupId = currentRunnerGroupId()) {
    if (isRunnerSimulation()) return true;
    const data = state.groupData.get(groupId);
    const leaderId =
      text(groupById(groupId)?.leaderActorId) || text(data?.leaderActorId);
    if (!leaderId) return true;
    return leaderId === currentRunnerActorId();
  }

  function currencyAdapter(actor) {
    try {
      const wallet = nativeCommLinkWallet(actor);
      return {
        kind: "native-sf2e",
        value: wallet.balance,
        path: "actor.inventory.addCurrency({credits})",
        wallet,
      };
    } catch {
      return null;
    }
  }
  function currencyAuditPath(a) {
    return a?.path || "Credits";
  }

  function settlementMembers(groupId) {
    const g = groupById(groupId),
      ids = g?.actorIds || state.groupData.get(groupId)?.memberActorIds || [];
    return [...new Set(ids)].map((actorId) => {
      const actor = actorById(actorId),
        adapter = currencyAdapter(actor),
        userIds = actorControllerUserIds(actor);
      return {
        actorId: text(actor?.id) || text(actorId),
        actorName: text(actor?.name) || "Actor не найден",
        userIds,
        ready: !!actor && !!adapter,
        balance: adapter?.value ?? null,
        currencyPath: currencyAuditPath(adapter),
      };
    });
  }
  function settlementTotal(m) {
    const base = Math.max(0, Number(m.basePay) || 0),
      pct = Math.max(0, Number(m.percent) || 0),
      bonus = Number(m.bonus) || 0,
      penalty = Math.max(0, Number(m.penalty) || 0);
    return Math.max(0, Math.round((base * pct) / 100 + bonus - penalty));
  }
  function splitShares(total, members) {
    const ok = members.filter((x) => x.actorId);
    if (!ok.length) return [];
    const base = Math.floor(total / ok.length),
      rem = total - base * ok.length;
    return ok.map((x, i) => ({ ...x, amount: base + (i < rem ? 1 : 0) }));
  }

  function appendEvent(data, event) {
    if (!data) return;
    data.events ??= [];
    data.events.unshift({
      id: text(event.id) || uid(),
      type: text(event.type) || "activity",
      source:
        event.source === "master"
          ? "master"
          : event.source === "system"
            ? "system"
            : "player",
      actorName: text(event.actorName) || runnerSpeakerName(),
      summary: text(event.summary) || "Событие сети",
      detail: text(event.detail),
      targetType: text(event.targetType),
      targetId: text(event.targetId),
      threadId: text(event.threadId),
      createdAt: now(),
    });
    data.events = data.events.slice(0, 120);
  }
  function masterEventReadState() {
    const raw =
      game?.user?.flags?.[FLAG_SCOPE]?.commLink?.masterEventRead ?? {};
    return raw && typeof raw === "object" ? clone(raw) : {};
  }
  function isMasterEventRead(groupId, eventId) {
    const raw = game?.user?.flags?.[FLAG_SCOPE]?.commLink?.masterEventRead;
    return raw?.[groupId]?.includes(eventId) ?? false;
  }
  async function markMasterEventRead(groupId, eventId) {
    if (!userCanMaster() || !groupId || !eventId) return;
    const r = masterEventReadState();
    r[groupId] ??= [];
    if (!r[groupId].includes(eventId)) {
      r[groupId].push(eventId);
      if (r[groupId].length > 240) r[groupId] = r[groupId].slice(-240);
      await game.user.update({ [`flags.${FLAG_ROOT}.masterEventRead`]: r });
    }
  }
  async function markAllMasterEventsRead() {
    if (!userCanMaster()) return;
    const r = masterEventReadState();
    for (const [groupId, data] of state.groupData)
      r[groupId] = (data.events || []).map((e) => e.id).slice(0, 240);
    await game.user.update({ [`flags.${FLAG_ROOT}.masterEventRead`]: r });
    render();
  }
  async function markMasterEventsFor(
    groupId,
    targetType,
    targetId = "",
    threadId = "",
  ) {
    if (!userCanMaster()) return;
    const data = state.groupData.get(groupId);
    if (!data) return;
    const ids = (data.events || [])
      .filter(
        (e) =>
          e.targetType === targetType &&
          ((targetType === "thread" && e.threadId === threadId) ||
            (targetType !== "thread" && e.targetId === targetId)),
      )
      .map((e) => e.id);
    if (!ids.length) return;
    const r = masterEventReadState();
    r[groupId] ??= [];
    let changed = false;
    for (const id of ids)
      if (!r[groupId].includes(id)) {
        r[groupId].push(id);
        changed = true;
      }
    if (changed) {
      if (r[groupId].length > 240) r[groupId] = r[groupId].slice(-240);
      await game.user.update({ [`flags.${FLAG_ROOT}.masterEventRead`]: r });
    }
  }
  function allMasterEvents() {
    const out = [];
    for (const [groupId, data] of state.groupData)
      for (const event of data.events || []) out.push({ groupId, event });
    return out.sort((a, b) =>
      String(b.event.createdAt).localeCompare(String(a.event.createdAt)),
    );
  }
  function unreadMasterEventCount() {
    return allMasterEvents().filter(
      ({ groupId, event }) => !isMasterEventRead(groupId, event.id),
    ).length;
  }
  function eventIcon(type) {
    return (
      {
        "message-reply": "✉",
        "call-accepted": "☎",
        "call-declined": "☎",
        "call-ended": "☎",
        "call-line": "◖",
        "job-accepted": "▤",
        "job-status": "▤",
        "job-paid": "₡",
      }[type] || "◆"
    );
  }
  function commLinkUiOpen() {
    return !!state.root?.isConnected;
  }
  function backgroundNotificationsAllowed() {
    if (state.mode === "edgerunner")
      return (
        !isRunnerSimulation() &&
        runnerProfile().backgroundNotifications !== false
      );
    return state.mode === "master" && userCanMaster();
  }
  function backgroundToastLine(item) {
    const body = text(item.body).replace(/\s+/g, " ");
    return body
      ? `${item.title} — ${body.length > 120 ? `${body.slice(0, 120)}…` : body}`
      : item.title;
  }
  function pushToast(toast) {
    const item = {
      id: uid(),
      kind: text(toast.kind) || "info",
      title: text(toast.title) || "COMM-LINK",
      body: text(toast.body),
      action: text(toast.action),
      groupId: text(toast.groupId),
      targetId: text(toast.targetId),
      threadId: text(toast.threadId),
      expiresAt: Date.now() + 6500,
    };
    if (!commLinkUiOpen()) {
      if (backgroundNotificationsAllowed())
        notify(
          backgroundToastLine(item),
          item.kind === "call" ? "warn" : "info",
        );
      return;
    }
    state.toasts.unshift(item);
    state.toasts = state.toasts.slice(0, 4);
    setTimeout(() => {
      state.toasts = state.toasts.filter((t) => t.id !== item.id);
      if (state.root?.isConnected) render();
    }, 6600);
  }
  function renderToasts() {
    state.toasts = state.toasts.filter((t) => t.expiresAt > Date.now());
    if (!state.toasts.length) return "";
    return `<div class="cl-toast-stack">${state.toasts.map((t) => `<button class="cl-toast ${esc(t.kind)}" data-action="toast-open" data-toast="${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(t.body)}</span><i>›</i></button>`).join("")}</div>`;
  }
  async function openToast(id) {
    const t = state.toasts.find((x) => x.id === id);
    if (!t) return;
    state.toasts = state.toasts.filter((x) => x.id !== id);
    if (t.groupId) {
      if (userCanMaster() && state.mode === "master") {
      } else if (
        state.mode === "edgerunner" &&
        t.groupId !== currentRunnerGroupId()
      )
        switchToRunnerGroup(t.groupId);
    }
    if (t.action === "thread") {
      if (userCanMaster() && state.mode === "master") {
        state.modal = {
          type: "master-thread",
          groupId: t.groupId,
          threadId: t.threadId,
          masterReply: "",
        };
      } else {
        state.runnerTab = "messages";
        await openThread(t.threadId, t.targetId);
      }
    } else if (t.action === "call") {
      if (userCanMaster() && state.mode === "master")
        state.modal = {
          type: "master-call",
          id: t.targetId,
          groupId: t.groupId,
          line: "",
        };
      else {
        state.runnerTab = "calls";
        state.modal = { type: "call-view", id: t.targetId };
        await markRead("calls", t.targetId);
      }
    } else if (t.action === "job") {
      if (userCanMaster() && state.mode === "master")
        openMasterJob(t.groupId, t.targetId);
      else {
        state.runnerTab = "jobs";
        state.modal = { type: "job-view", id: t.targetId };
        await markRead("jobs", t.targetId);
      }
    }
    render();
  }
  async function openMasterEvent(groupId, eventId) {
    const data = state.groupData.get(groupId),
      e = data?.events?.find((x) => x.id === eventId);
    if (!e) return;
    await markMasterEventRead(groupId, eventId);
    await markMasterEventsFor(groupId, e.targetType, e.targetId, e.threadId);
    if (e.targetType === "thread" && e.threadId)
      state.modal = {
        type: "master-thread",
        groupId,
        threadId: e.threadId,
        masterReply: "",
      };
    else if (e.targetType === "call" && e.targetId)
      state.modal = { type: "master-call", id: e.targetId, groupId, line: "" };
    else if (e.targetType === "job" && e.targetId)
      openMasterJob(groupId, e.targetId);
    else state.modal = { type: "group-dashboard", id: groupId };
    render();
  }

  function rememberGroupSnapshot(groupId, data) {
    if (!groupId || !data) return;
    const stamp = text(data.updatedAt) || "unstamped";
    let bucket = state.groupHistory.get(groupId);
    if (!bucket) {
      bucket = new Map();
      state.groupHistory.set(groupId, bucket);
    }
    bucket.set(stamp, clone(data));
    while (bucket.size > 10) bucket.delete(bucket.keys().next().value);
  }

  function sameJson(a, b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_e) {
      return false;
    }
  }
  function insertByDesiredOrder(arr, item, desiredIds, desiredIndex) {
    const id = text(item?.id);
    if (!id) return arr;
    for (let i = desiredIndex - 1; i >= 0; i--) {
      const prev = desiredIds[i],
        at = arr.findIndex((x) => text(x?.id) === prev);
      if (at >= 0) {
        arr.splice(at + 1, 0, item);
        return arr;
      }
    }
    for (let i = desiredIndex + 1; i < desiredIds.length; i++) {
      const next = desiredIds[i],
        at = arr.findIndex((x) => text(x?.id) === next);
      if (at >= 0) {
        arr.splice(at, 0, item);
        return arr;
      }
    }
    if (desiredIndex <= 0) arr.unshift(item);
    else arr.push(item);
    return arr;
  }
  function mergeNestedIdList(baseList, desiredList, liveList) {
    const b = Array.isArray(baseList) ? baseList : [],
      d = Array.isArray(desiredList) ? desiredList : [],
      l = Array.isArray(liveList) ? liveList : [];
    const bMap = new Map(b.map((x) => [text(x?.id), x]).filter(([id]) => id)),
      dMap = new Map(d.map((x) => [text(x?.id), x]).filter(([id]) => id));
    const deleted = new Set([...bMap.keys()].filter((id) => !dMap.has(id)));
    let out = l.filter((x) => !deleted.has(text(x?.id)));
    const desiredIds = d.map((x) => text(x?.id)).filter(Boolean);
    for (let i = 0; i < d.length; i++) {
      const item = d[i],
        id = text(item?.id);
      if (!id) continue;
      const baseItem = bMap.get(id);
      if (baseItem && sameJson(baseItem, item)) continue;
      const at = out.findIndex((x) => text(x?.id) === id);
      if (at >= 0)
        out[at] = mergeRecordChanges(baseItem, item, out[at], "nested");
      else insertByDesiredOrder(out, clone(item), desiredIds, i);
    }
    return out;
  }
  function mergeRecordChanges(baseItem, desiredItem, liveItem, _kind = "") {
    if (!baseItem) return clone(desiredItem);
    const out = clone(liveItem || baseItem),
      keys = new Set([
        ...Object.keys(desiredItem || {}),
        ...Object.keys(baseItem || {}),
      ]);
    for (const field of keys) {
      const b = baseItem?.[field],
        d = desiredItem?.[field];
      if (sameJson(b, d)) continue;
      if (field === "transcript" && Array.isArray(d)) {
        out[field] = mergeNestedIdList(
          Array.isArray(b) ? b : [],
          d,
          Array.isArray(out[field]) ? out[field] : [],
        );
        continue;
      }
      out[field] = clone(d);
    }
    return out;
  }

  function controlFlags(doc) {
    return (
      doc?.flags?.[FLAG_SCOPE]?.commLink?.control ??
      doc?.flags?.commLinkNetwork?.control ??
      null
    );
  }
  function dataFlags(doc) {
    return (
      doc?.flags?.[FLAG_SCOPE]?.commLink?.data ??
      doc?.flags?.commLinkNetwork?.data ??
      null
    );
  }

  async function ensureControl() {
    if (!userCanMaster()) return null;
    let doc = journals().find((j) => controlFlags(j));
    if (!doc && state.allowSetup && isPrimaryGm())
      doc = await journalClass().create({
        name: CONTROL_NAME,
        ownership: gmOwnership(),
        flags: {
          [FLAG_SCOPE]: { commLink: { control: normalizeControl(null) } },
        },
      });
    state.controlDoc = doc || null;
    state.control = normalizeControl(controlFlags(doc));
    if (doc && state.allowSetup && isPrimaryGm()) {
      const update = {};
      if (!sameFlatObject(doc.ownership, gmOwnership()))
        update.ownership = gmOwnership();
      if (!doc.flags?.[FLAG_SCOPE]?.commLink?.control)
        update[`flags.${FLAG_ROOT}.control`] = clone(state.control);
      if (Object.keys(update).length) await doc.update(update);
    }
    return doc;
  }

  function groupDocById(group) {
    if (!group) return null;
    const direct = game?.journal?.get?.(group.journalId);
    if (direct && dataFlags(direct)?.groupId === group.id) return direct;
    return journals().find((j) => dataFlags(j)?.groupId === group.id) || null;
  }

  async function saveControl() {
    requirePrimaryGm();
    if (!state.controlDoc)
      throw new Error("Откройте сеть для настройки COMM-LINK.");
    diagState.writes.control++;
    await state.controlDoc.update({
      [`flags.${FLAG_ROOT}.control`]: clone(state.control),
    });
  }

  async function ensureMasterContactDatabase() {
    if (!userCanMaster()) return null;
    let doc = journals().find((j) => masterDbFlags(j));
    if (!doc && state.allowSetup && isPrimaryGm())
      doc = await journalClass().create({
        name: MASTER_CONTACT_DB_NAME,
        ownership: gmOwnership(),
        flags: {
          [FLAG_SCOPE]: {
            commLink: { masterContacts: normalizeMasterContactDatabase(null) },
          },
        },
      });
    if (doc && state.allowSetup && isPrimaryGm()) {
      const update = {};
      if (!sameFlatObject(doc.ownership, gmOwnership()))
        update.ownership = gmOwnership();
      if (!doc.flags?.[FLAG_SCOPE]?.commLink?.masterContacts)
        update[`flags.${FLAG_ROOT}.masterContacts`] =
          normalizeMasterContactDatabase(masterDbFlags(doc));
      if (Object.keys(update).length) await doc.update(update);
    }
    state.masterContactDbDoc = doc || null;
    state.masterContactDb = normalizeMasterContactDatabase(masterDbFlags(doc));
    return doc;
  }
  async function reloadMasterContactDatabase() {
    if (!userCanMaster()) return;
    const doc =
      state.masterContactDbDoc || (await ensureMasterContactDatabase());
    if (!doc) return;
    state.masterContactDb = normalizeMasterContactDatabase(masterDbFlags(doc));
  }
  async function upsertMasterContactsShared(items) {
    requirePrimaryGm();
    const doc =
      state.masterContactDbDoc || (await ensureMasterContactDatabase());
    if (!doc) return;
    const updates = {};
    const stamp = now();
    for (const raw of items || []) {
      const c = normalizeMasterDbContact(raw);
      c.updatedAt = stamp;
      c.updatedByUserId = text(game?.user?.id);
      if (!c.createdByUserId)
        c.createdByUserId = text(raw?.createdByUserId) || text(game?.user?.id);
      updates[`flags.${FLAG_ROOT}.masterContacts.contacts.${c.id}`] = clone(c);
    }
    updates[`flags.${FLAG_ROOT}.masterContacts.version`] =
      MASTER_CONTACT_DB_VERSION;
    updates[`flags.${FLAG_ROOT}.masterContacts.updatedAt`] = stamp;
    if (Object.keys(updates).length) await doc.update(updates);
    await reloadMasterContactDatabase();
  }
  async function upsertMasterContactShared(item) {
    return upsertMasterContactsShared([item]);
  }
  async function deleteMasterContactShared(id) {
    requirePrimaryGm();
    if (!id) return;
    const doc =
      state.masterContactDbDoc || (await ensureMasterContactDatabase());
    if (!doc) return;
    await doc.update({
      [`flags.${FLAG_ROOT}.masterContacts.contacts.-=${id}`]: null,
      [`flags.${FLAG_ROOT}.masterContacts.updatedAt`]: now(),
    });
    await reloadMasterContactDatabase();
  }
  async function migrateLegacyMasterContactsToSharedDb() {
    if (!userCanMaster()) return;
    const doc =
      state.masterContactDbDoc || (await ensureMasterContactDatabase());
    if (!doc) return;
    const live = normalizeMasterContactDatabase(masterDbFlags(doc));
    if (live.migratedLegacy) {
      state.masterContactDb = live;
      return;
    }
    const byName = new Map();
    const add = (c) => {
      if (!c || c.source === "player") return;
      const n = text(c.id);
      if (!n) return;
      if (!byName.has(n)) byName.set(n, normalizeMasterDbContact(c));
    };
    for (const c of state.control.contactTemplates || []) add(c);
    for (const data of state.groupData.values())
      for (const c of data.contacts || []) add(c);
    const updates = {};
    for (const c of byName.values())
      if (!live.contacts[c.id])
        updates[`flags.${FLAG_ROOT}.masterContacts.contacts.${c.id}`] =
          clone(c);
    updates[`flags.${FLAG_ROOT}.masterContacts.version`] =
      MASTER_CONTACT_DB_VERSION;
    updates[`flags.${FLAG_ROOT}.masterContacts.migratedLegacy`] = true;
    updates[`flags.${FLAG_ROOT}.masterContacts.updatedAt`] = now();
    await doc.update(updates);
    await reloadMasterContactDatabase();
  }

  async function ensureGroupDoc(group) {
    let doc = groupDocById(group);
    if (!isPrimaryGm() || !state.allowSetup) return doc;
    syncGroupAccessUsers(group);
    const ownership = gmOwnership();
    for (const id of group.userIds) ownership[id] = ownershipLevel("OBSERVER");
    if (!doc) {
      doc = await journalClass().create({
        name: `${GROUP_PREFIX}${group.name}`,
        ownership,
        flags: {
          [FLAG_SCOPE]: {
            commLink: { data: blankNetworkData(group.id, group.name) },
          },
        },
      });
      group.journalId = doc.id;
      await saveControl();
    } else {
      const update = {};
      if (!sameFlatObject(doc.ownership, ownership))
        update.ownership = ownership;
      if (doc.name !== `${GROUP_PREFIX}${group.name}`)
        update.name = `${GROUP_PREFIX}${group.name}`;
      if (!doc.flags?.[FLAG_SCOPE]?.commLink?.data)
        update[`flags.${FLAG_ROOT}.data`] = normalizeNetworkData(
          dataFlags(doc),
          group.id,
          group.name,
        );
      if (Object.keys(update).length) await doc.update(update);
    }
    return doc;
  }

  let lastPublishedNetworkKey = null;
  function publishNetworkChanges() {
    const key = JSON.stringify([
      game.user.id,
      userCanMaster(),
      state.control,
      [...state.groupData],
      state.masterContactDb,
      actors().map((a) => [a.id, a.name, a.img, a.ownership]),
      users().map((u) => [u.id, u.name, u.role, u.active]),
    ]);
    if (key === lastPublishedNetworkKey) return;
    lastPublishedNetworkKey = key;
    globalThis.Hooks?.callAll("cyberpunkRemasterCommLink");
    globalThis.Hooks?.callAll("cyberpunkRemasterCityServices");
  }
  async function refreshData() {
    const started = diagNow();
    const refreshedIds = new Set();
    if (userCanMaster()) {
      await ensureControl();
      for (const group of state.control.groups) {
        const doc = await ensureGroupDoc(group);
        if (!doc) continue;
        refreshedIds.add(group.id);
        await enqueueGroupWrite(group.id, async () => {
          const data = normalizeNetworkData(
            dataFlags(doc),
            group.id,
            group.name,
          );
          const beforeSanitize = JSON.stringify(data);
          if (isPrimaryGm()) {
            const projection = {
              ...data,
              memberActorIds: group.actorIds || data.memberActorIds,
            };
            await projectCityJobsIntoCommLink(projection);
            data.jobs = projection.jobs;
            data.jobTombstones = projection.jobTombstones;
            if (projection.payoutLedgers)
              data.payoutLedgers = projection.payoutLedgers;
            if (projection.jobSettlements)
              data.jobSettlements = projection.jobSettlements;
          }
          for (const [key, kind] of [
            ["messages", "message"],
            ["calls", "call"],
            ["jobs", "job"],
          ])
            data[key] = data[key].map((item) =>
              publicationMeta(item)?.identityVisible === false
                ? publicCommLinkPublication(item, kind, false)
                : item,
            );
          const sanitized = normalizeNetworkData(data, group.id, group.name);
          Object.assign(data, sanitized);
          const roster = (group.actorIds || []).map((id) => {
            const a = actorById(id);
            return {
              actorId: id,
              name: a?.name || "Actor",
              image: actorImage(a),
              leader: id === group.leaderActorId,
            };
          });
          if (
            isPrimaryGm() &&
            (JSON.stringify(data) !== beforeSanitize ||
              (state.allowSetup &&
                (!sameJson(data.memberActorIds, group.actorIds) ||
                  !sameJson(data.memberRoster, roster) ||
                  data.leaderActorId !== group.leaderActorId)))
          ) {
            if (state.allowSetup) {
              data.memberActorIds = [...group.actorIds];
              data.memberRoster = roster;
              data.leaderActorId = group.leaderActorId;
            }
            data.updatedAt = now();
            data.revision++;
            await doc.update({ [`flags.${FLAG_ROOT}.data`]: clone(data) });
          }
          state.groupDocs.set(group.id, doc);
          state.groupData.set(group.id, data);
          rememberGroupSnapshot(group.id, data);
        });
      }
      await ensureMasterContactDatabase();
      if (isPrimaryGm() && state.allowSetup)
        await migrateLegacyMasterContactsToSharedDb();
      if (!state.previewGroupId || !state.groupData.has(state.previewGroupId))
        state.previewGroupId =
          [...state.groupData.keys()].find((id) => groupAllowsActor(id)) ||
          state.groupData.keys().next().value ||
          "";
    } else {
      for (const doc of journals()) {
        const raw = dataFlags(doc);
        if (!raw || doc.testUserPermission?.(game.user, "OBSERVER") !== true)
          continue;
        const data = normalizeNetworkData(
          raw,
          raw.groupId || doc.id,
          raw.groupName,
        );
        refreshedIds.add(data.groupId);
        state.groupDocs.set(data.groupId, doc);
        state.groupData.set(data.groupId, data);
        rememberGroupSnapshot(data.groupId, data);
      }
      const valid = [...state.groupData.keys()].filter((id) =>
        groupAllowsActor(id),
      );
      if (!valid.includes(state.activeGroupId))
        state.activeGroupId = valid[0] || "";
    }
    for (const id of state.groupData.keys())
      if (!refreshedIds.has(id)) {
        state.groupData.delete(id);
        state.groupDocs.delete(id);
      }
    await projectAccessibleNetworks();
    publishNetworkChanges();
    recordPerf("refreshData", diagNow() - started);
  }

  function enqueueGroupWrite(groupId, task) {
    const previous = state.groupWriteQueues.get(groupId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    state.groupWriteQueues.set(groupId, next);
    return next.finally(() => {
      if (state.groupWriteQueues.get(groupId) === next)
        state.groupWriteQueues.delete(groupId);
    });
  }

  async function saveGroupNow(groupId, data) {
    requirePrimaryGm();
    const doc = state.groupDocs.get(groupId);
    if (!doc) throw new Error("Сеть группы недоступна.");
    const durable = dataFlags(doc) || {};
    data.jobTombstones = {
      ...(data.jobTombstones || {}),
      ...(durable.jobTombstones || {}),
    };
    data.payoutLedgers = {
      ...(durable.payoutLedgers || {}),
      ...(data.payoutLedgers || {}),
    };
    data.jobSettlements = {
      ...(durable.jobSettlements || {}),
      ...(data.jobSettlements || {}),
    };
    await syncCityJobEditsFromCommLink(data, dataFlags(doc));
    await projectCityJobsIntoCommLink(data);
    const next = normalizeNetworkData(data, groupId, data.groupName);
    next.revision = (Number(dataFlags(doc)?.revision) || 0) + 1;
    next.updatedAt = now();
    diagState.writes.group++;
    await doc.update({ [`flags.${FLAG_ROOT}.data`]: clone(next) });
    const check = normalizeNetworkData(dataFlags(doc), groupId, next.groupName);
    if (!sameJson(next, check))
      throw new Error(
        "Сеть изменилась во время записи. Запрос сохранён; повторите синхронизацию.",
      );
    state.groupData.set(groupId, check);
    rememberGroupSnapshot(groupId, check);
    await projectAccessibleNetworks();
    publishNetworkChanges();
    return check;
  }
  function saveGroup(groupId, data) {
    return enqueueGroupWrite(groupId, () => saveGroupNow(groupId, data));
  }

  function mutateLiveGroup(groupId, mutator) {
    return enqueueGroupWrite(groupId, async () => {
      const doc = state.groupDocs.get(groupId);
      if (!doc) throw new Error("Сеть группы недоступна");
      const live = normalizeNetworkData(
        dataFlags(doc),
        groupId,
        state.groupData.get(groupId)?.groupName || groupNameById(groupId),
      );
      rememberGroupSnapshot(groupId, live);
      const next = clone(live);
      const result = await mutator(next, live);
      if (result === false) return false;
      await saveGroupNow(groupId, next);
      return true;
    });
  }

  function targetGroupIds(audience) {
    if (!userCanMaster()) return [];
    if (audience?.all) return state.control.groups.map((g) => g.id);
    const ids = Array.isArray(audience?.groupIds) ? audience.groupIds : [];
    return ids.filter((id) => state.control.groups.some((g) => g.id === id));
  }

  async function publishToGroups(
    kind,
    item,
    audience,
    { independentIds = false } = {},
  ) {
    const targets = targetGroupIds(audience);
    if (!targets.length) return notify("Выберите хотя бы одну группу.", "warn");
    const publicationId = item.publicationId || uid();
    for (const groupId of targets) {
      const perGroupId = independentIds ? uid() : item.id || publicationId;
      await mutateLiveGroup(groupId, (data) => {
        if (kind === "contact") {
          const existing = data.contacts.find((c) => c.id === item.id);
          if (existing) {
            const preservedId = existing.id,
              preservedCreatedAt = existing.createdAt || now(),
              preservedSource = existing.source || item.source;
            Object.assign(existing, clone(item), {
              id: preservedId,
              source: preservedSource,
              createdAt: preservedCreatedAt,
              updatedAt: now(),
            });
          } else
            data.contacts.unshift({
              ...clone(item),
              id: item.id || publicationId,
              createdAt: now(),
              updatedAt: now(),
            });
        }
        if (kind === "message")
          data.messages.unshift({
            ...publicCommLinkPublication(
              item,
              "message",
              publicationMeta(item)?.identityVisible !== false,
            ),
            id: perGroupId,
            publicationId,
            createdAt: now(),
          });
        if (kind === "call")
          data.calls.unshift({
            ...publicCommLinkPublication(
              item,
              "call",
              publicationMeta(item)?.identityVisible !== false,
            ),
            id: perGroupId,
            publicationId,
            createdAt: now(),
            updatedAt: now(),
            status: "ringing",
          });
        if (kind === "job")
          data.jobs.unshift({
            ...publicCommLinkPublication(
              item,
              "job",
              publicationMeta(item)?.identityVisible !== false,
            ),
            id: perGroupId,
            publicationId,
            createdAt: now(),
            updatedAt: now(),
            status: "available",
            acceptedBy: "",
          });
        return true;
      });
    }
    await refreshData();
    render();
    notify(
      `Опубликовано: ${targets.length} ${targets.length === 1 ? "аудитория" : "аудитории"}.`,
    );
  }

  function currentRunnerGroupId() {
    if (userCanMaster() && state.mode === "edgerunner")
      return state.previewGroupId || state.activeGroupId;
    return state.activeGroupId;
  }
  function isRunnerSimulation() {
    return !!(
      userCanMaster() &&
      state.mode === "edgerunner" &&
      state.runnerSimulation
    );
  }
  function resetPreviewData(groupId = currentRunnerGroupId()) {
    if (!groupId) return null;
    const source = state.groupData.get(groupId);
    if (!source) {
      state.previewDataByGroup.delete(groupId);
      return null;
    }
    const copy = normalizeNetworkData(clone(source), groupId, source.groupName);
    state.previewDataByGroup.set(groupId, copy);
    return copy;
  }
  function currentRunnerData() {
    if (!currentRunnerActor()) return null;
    const groupId = currentRunnerGroupId();
    if (!groupId) return null;
    if (!userCanMaster() && !groupAllowsActor(groupId)) return null;
    return isRunnerSimulation()
      ? (state.previewDataByGroup.get(groupId) ?? resetPreviewData(groupId))
      : (state.groupData.get(groupId) ?? null);
  }
  async function saveRunnerData(groupId, data) {
    if (isRunnerSimulation()) {
      state.previewDataByGroup.set(
        groupId,
        normalizeNetworkData(
          clone(data),
          groupId,
          data?.groupName || state.groupData.get(groupId)?.groupName,
        ),
      );
      render();
      return;
    }
    if (!userCanMaster())
      throw new Error("LIVE-запись игрока должна проходить через GM relay.");
    await saveGroup(groupId, data);
  }

  function primaryActiveGm() {
    return commLinkPrimaryGM(game);
  }

  function runnerRequestSpeaker(actor) {
    return {
      name: text(actor?.name) || "Edgerunner",
      image: actorImage(actor),
    };
  }
  function cleanRunnerContactPayload(raw) {
    const p = raw && typeof raw === "object" ? raw : {};
    return {
      id: text(p.id),
      name: text(p.name) || "Без имени",
      handle: text(p.handle),
      image: text(p.image),
      tokenImage: text(p.tokenImage),
      actorImage: text(p.actorImage),
      actorUuid: text(p.actorUuid),
      actorId: text(p.actorId),
      tokenUuid: text(p.tokenUuid),
      tags: Array.isArray(p.tags) ? p.tags.map(text).filter(Boolean) : [],
      summary: text(p.summary),
    };
  }
  async function applyRunnerMutationRequest(request, requestUser = game?.user) {
    requirePrimaryGm();
    const groupId = text(request?.groupId),
      actorId = text(request?.actorId),
      action = text(request?.action),
      payload =
        request?.payload && typeof request.payload === "object"
          ? request.payload
          : {};
    const actor = actorById(actorId);
    if (!groupId || !actor || !requestUser)
      throw new Error("Некорректный запрос EDGERUNNER.");
    if (action === "gm-contact-reply" && !userCanMaster(requestUser))
      throw new Error("Ответ от имени NPC доступен только GM / MASTER.");
    if (!actorAccessibleToUser(actor, requestUser))
      throw new Error("Нет OWNER-доступа к Actor запроса.");
    const doc =
      state.groupDocs.get(groupId) || groupDocById(groupById(groupId));
    if (!doc) throw new Error("Сеть группы недоступна MASTER.");
    if (!state.groupDocs.has(groupId)) state.groupDocs.set(groupId, doc);
    const raw = normalizeNetworkData(
      dataFlags(doc),
      groupId,
      groupNameById(groupId),
    );
    if (!(raw.memberActorIds || []).includes(actorId))
      throw new Error("Actor не состоит в этой группе.");
    const speaker = runnerRequestSpeaker(actor),
      requestId = text(request?.id) || uid();
    return mutateLiveGroup(groupId, async (data) => {
      const operationKey = `${requestUser.id}:${requestId}`;
      data.operations ??= {};
      if (data.operations[operationKey]?.status === "applied") return false;
      await (async () => {
        const event = (e) => {
          const eventId = `${requestId}:event`;
          if (!(data.events || []).some((x) => x.id === eventId))
            appendEvent(data, {
              ...e,
              id: eventId,
              actorName: speaker.name,
              source: "player",
            });
        };
        if (action === "contact-upsert") {
          const p = cleanRunnerContactPayload(payload),
            contactId = text(p.id) || requestId,
            existing = data.contacts.find((c) => c.id === contactId);
          if (existing) {
            if (existing.source !== "player")
              throw new Error("MASTER-контакт игрок изменять не может.");
            const keepId = existing.id,
              createdAt = existing.createdAt || now(),
              ownerActorId = text(existing.ownerActorId) || actorId;
            Object.assign(existing, p, {
              id: keepId,
              source: "player",
              ownerActorId,
              createdAt,
              updatedAt: now(),
            });
          } else
            data.contacts.unshift({
              ...p,
              id: contactId,
              source: "player",
              ownerActorId: actorId,
              createdAt: now(),
              updatedAt: now(),
            });
          return true;
        }
        if (action === "contact-delete") {
          const id = text(payload.id),
            c = data.contacts.find((x) => x.id === id);
          if (!c) throw new Error("Контакт уже отсутствует.");
          if (c.source !== "player")
            throw new Error("MASTER-контакт может удалить только MASTER.");
          data.contacts = data.contacts.filter((x) => x.id !== id);
          return true;
        }
        if (action === "gm-contact-reply") {
          const requestedContactId = text(payload.contactId),
            requestedThreadId = text(payload.threadId),
            body = text(payload.body);
          if (!body) throw new Error("Пустое сообщение.");
          if (!requestedContactId && !requestedThreadId)
            throw new Error("Не указан контакт или диалог команды.");
          const contact = requestedContactId
            ? data.contacts.find((c) => c.id === requestedContactId)
            : null;
          if (requestedContactId && !contact)
            throw new Error("Контакт не найден.");
          const rows = data.messages
            .filter((m) =>
              requestedThreadId
                ? m.threadId === requestedThreadId
                : m.contactId === requestedContactId,
            )
            .sort((a, b) =>
              String(b.createdAt).localeCompare(String(a.createdAt)),
            );
          if (requestedThreadId && !rows.length)
            throw new Error("Диалог уже отсутствует.");
          const npc = rows.find((m) => m.sender === "npc"),
            base = npc || rows[0],
            publicContact =
              contact || data.contacts.find((c) => c.id === base?.contactId),
            threadId =
              requestedThreadId ||
              rows[0]?.threadId ||
              `contact:${requestedContactId}`;
          if (!data.messages.some((m) => m.id === requestId))
            data.messages.push({
              id: requestId,
              threadId,
              contactId: publicContact?.id || base?.contactId || "",
              sender: "npc",
              senderActorId: text(publicContact?.actorId || npc?.senderActorId),
              senderName:
                text(publicContact?.name || npc?.senderName) || "COMM-LINK",
              body,
              image: text(publicContact?.image || npc?.image),
              createdAt: now(),
              authorUserId: requestUser.id,
            });
          return true;
        }
        if (action === "contact-message") {
          const contactId = text(payload.contactId),
            body = text(payload.body);
          if (!body) throw new Error("Пустое сообщение.");
          const c = data.contacts.find((x) => x.id === contactId);
          if (!c) throw new Error("Контакт не найден.");
          const existing = [...(data.messages || [])]
              .filter((x) => x.contactId === contactId)
              .sort((a, b) =>
                String(b.createdAt).localeCompare(String(a.createdAt)),
              )[0],
            threadId = existing?.threadId || `contact:${contactId}`,
            msg = {
              id: requestId,
              threadId,
              contactId,
              sender: "player",
              senderActorId: actorId,
              senderName: speaker.name,
              body,
              image: speaker.image,
              createdAt: now(),
              authorUserId: text(requestUser.id),
            };
          if (!data.messages.some((x) => x.id === requestId))
            data.messages.push(msg);
          event({
            type: "message-reply",
            summary: `Написал контакту ${c.name}`,
            detail: body,
            targetType: "thread",
            targetId: msg.id,
            threadId,
          });
          return true;
        }
        if (action === "thread-reply") {
          const threadId = text(payload.threadId),
            body = text(payload.body);
          if (!body) throw new Error("Пустое сообщение.");
          const arr = data.messages.filter((x) => x.threadId === threadId);
          if (!arr.length) throw new Error("Диалог уже отсутствует.");
          const base = [...arr].reverse()[0],
            contactId = text(base?.contactId),
            npcName = contactName(
              data,
              contactId,
              text(base?.senderName) || "COMM-LINK",
            ),
            msg = {
              id: requestId,
              threadId,
              contactId,
              sender: "player",
              senderActorId: actorId,
              senderName: speaker.name,
              body,
              image: speaker.image,
              createdAt: now(),
              authorUserId: text(requestUser.id),
            };
          if (!data.messages.some((x) => x.id === requestId))
            data.messages.push(msg);
          event({
            type: "message-reply",
            summary: `Ответил ${npcName}`,
            detail: body,
            targetType: "thread",
            targetId: base?.id || "",
            threadId,
          });
          return true;
        }
        if (action === "job-status") {
          const id = text(payload.id),
            status = text(payload.status);
          if (!["accepted", "declined"].includes(status))
            throw new Error("Недопустимый статус заказа.");
          if (text(data.leaderActorId) !== actorId)
            throw new Error(
              "Только лидер группы может принять или отклонить заказ.",
            );
          const j = data.jobs.find((x) => x.id === id);
          if (!j || j.status !== "available")
            throw new Error("Заказ уже изменён.");
          if (
            payload.cityJobVersion !== undefined &&
            (j.cityJobId !== payload.cityJobId ||
              !cityJobTermsMatch(payload.cityJobId, payload.cityJobVersion))
          )
            throw new Error(
              "Условия городского заказа изменились; обновите предложение.",
            );
          if (
            payload.version !== undefined &&
            Number(payload.version) !== Number(j.version)
          )
            throw new Error("Версия заказа изменилась; обновите список.");
          j.status = status;
          j.acceptedBy = status === "accepted" ? speaker.name : "";
          j.acceptedActorId = status === "accepted" ? actorId : "";
          j.acceptedUserId = status === "accepted" ? requestUser.id : "";
          j.version = (Number(j.version) || 0) + 1;
          j.updatedAt = now();
          event({
            type: status === "accepted" ? "job-accepted" : "job-status",
            summary:
              status === "accepted"
                ? `Принял заказ «${j.title}»`
                : `Отклонил заказ «${j.title}»`,
            detail: j.fixerName,
            targetType: "job",
            targetId: j.id,
          });
          return true;
        }
        if (action === "call-status") {
          const id = text(payload.id),
            status = text(payload.status);
          if (!["accepted", "declined"].includes(status))
            throw new Error("Недопустимый статус звонка.");
          const c = data.calls.find((x) => x.id === id);
          if (!c || c.status !== "ringing")
            throw new Error("Звонок уже изменён.");
          c.status = status;
          c.answeredBy = speaker.name;
          c.updatedAt = now();
          event({
            type: status === "accepted" ? "call-accepted" : "call-declined",
            summary:
              status === "accepted"
                ? `Принял вызов от ${c.name}`
                : `Отклонил вызов от ${c.name}`,
            detail: c.note,
            targetType: "call",
            targetId: c.id,
          });
          return true;
        }
        if (action === "call-line") {
          const id = text(payload.id),
            body = text(payload.body);
          if (!body) throw new Error("Пустая реплика.");
          const c = data.calls.find((x) => x.id === id);
          if (!c || c.status !== "accepted")
            throw new Error("Звонок уже не активен.");
          c.transcript ??= [];
          if (!c.transcript.some((x) => x.id === requestId))
            c.transcript.push({
              id: requestId,
              speaker: "player",
              actorId,
              name: speaker.name,
              image: speaker.image,
              body,
              createdAt: now(),
              authorUserId: text(requestUser.id),
            });
          c.updatedAt = now();
          event({
            type: "call-line",
            summary: `Ответил в звонке с ${c.name}`,
            detail: body,
            targetType: "call",
            targetId: c.id,
          });
          return true;
        }
        if (action === "call-end") {
          const id = text(payload.id),
            c = data.calls.find((x) => x.id === id);
          if (!c || c.status !== "accepted")
            throw new Error("Звонок уже не активен.");
          c.status = "ended";
          c.updatedAt = now();
          event({
            type: "call-ended",
            summary: `Завершил звонок с ${c.name}`,
            targetType: "call",
            targetId: c.id,
          });
          return true;
        }
        throw new Error(`Неизвестная операция EDGERUNNER: ${action}`);
      })();
      data.operations[operationKey] = {
        status: "applied",
        requestId,
        userId: requestUser.id,
        actorId,
        groupId,
        action,
        appliedAt: now(),
      };
      return true;
    });
  }

  async function submitRunnerMutationRequest(
    action,
    payload = {},
    groupId = currentRunnerGroupId(),
    operationId = "",
  ) {
    if (isRunnerSimulation()) return false;
    const actorId = currentRunnerActorId();
    if (!actorId || !groupId) throw new Error("Нет активной сети или Actor.");
    // Reopening/retrying a timed-out composer uses its original durable operation.
    const previous = usersMessages().find(
      (m) =>
        commLinkAuthor(m)?.id === game.user.id &&
        requestFlags(m)?.actorId === actorId &&
        requestFlags(m)?.groupId === groupId &&
        requestFlags(m)?.action === action &&
        sameJson(requestFlags(m)?.payload, payload) &&
        authenticatedAck(requestFlags(m).id)?.status !== "applied",
    );
    return submitEnvelope({
      actorId,
      groupId,
      action,
      payload,
      operationId: operationId || requestFlags(previous)?.id || uid(),
    });
  }

  async function processRunnerMutationRequest(message) {
    if (!isPrimaryGm()) return false;
    const request = requestFlags(message);
    if (!request) return false;
    if (!state.groupDocs.has(request.groupId)) await refreshData();
    await processRequest(message, request);
    requestLiveRender();
    return true;
  }
  async function processPendingRunnerMutationRequests() {
    if (!isPrimaryGm()) return 0;
    let count = 0;
    for (const message of usersMessages())
      if (
        requestFlags(message) &&
        !authenticatedAck(
          requestFlags(message).id,
          requestFlags(message).userId,
        )?.status?.includes("applied")
      ) {
        try {
          if (await processRunnerMutationRequest(message)) count++;
        } catch (error) {
          recordDiagError("relay-pending", error);
        }
      }
    return count;
  }

  function readState() {
    const raw =
      game?.user?.flags?.[FLAG_SCOPE]?.commLink?.read ??
      game?.user?.flags?.commLinkNetwork?.read;
    return raw && typeof raw === "object" ? clone(raw) : {};
  }
  function runnerReadKey(
    groupId = currentRunnerGroupId(),
    actorId = currentRunnerActorId(),
  ) {
    return actorId && groupId ? `${actorId}:${groupId}` : text(groupId);
  }
  function readBucket(r, groupId, { create = false } = {}) {
    const key = runnerReadKey(groupId),
      legacy = r?.[groupId];
    if (create) {
      if (!r[key])
        r[key] =
          legacy && typeof legacy === "object"
            ? clone(legacy)
            : { messages: [], calls: [], jobs: [] };
      for (const kind of ["messages", "calls", "jobs"])
        if (!Array.isArray(r[key][kind])) r[key][kind] = [];
      return r[key];
    }
    return r?.[key] ?? legacy ?? null;
  }
  async function markRead(kind, id) {
    if (isRunnerSimulation()) return;
    const groupId = currentRunnerGroupId();
    if (!groupId) return;
    const r = readState(),
      bucket = readBucket(r, groupId, { create: true });
    bucket[kind] ??= [];
    if (!bucket[kind].includes(id)) bucket[kind].push(id);
    const cap = kind === "messages" ? 500 : kind === "calls" ? 220 : 320;
    if (bucket[kind].length > cap) bucket[kind] = bucket[kind].slice(-cap);
    await game.user.update({ [`flags.${FLAG_ROOT}.read`]: r });
  }
  function isRead(kind, id) {
    if (isRunnerSimulation()) return true;
    const groupId = currentRunnerGroupId(),
      r = readState(),
      bucket = readBucket(r, groupId);
    return bucket?.[kind]?.includes(id) ?? false;
  }

  function runnerProfileStore() {
    return readCommLinkProfiles(game.user);
  }
  function profileForActor(actor) {
    const actorId = text(actor?.id),
      profiles = runnerProfileStore();
    const raw = profiles[actorId] ?? {};
    return {
      actorId,
      displayName: text(raw?.displayName) || text(actor?.name) || "Edgerunner",
      image: text(raw?.image) || actorImage(actor),
      skin: skinExists(text(raw?.skin)) ? text(raw.skin) : "night-cyan",
      pinHash: text(raw?.pinHash),
      soundEnabled: raw?.soundEnabled !== false,
      soundVolume: Number.isFinite(Number(raw?.soundVolume))
        ? Math.max(0.2, Math.min(1, Number(raw.soundVolume)))
        : 0.75,
      backgroundNotifications: raw?.backgroundNotifications !== false,
      fx: normalizeFx(raw?.fx),
    };
  }
  function runnerProfile() {
    const actor = currentRunnerActor(),
      base = profileForActor(actor);
    if (isRunnerSimulation())
      return {
        ...base,
        displayName:
          text(state.simProfileName) || text(actor?.name) || "SIM Edgerunner",
        skin: skinExists(state.simSkin) ? state.simSkin : base.skin,
        fx: normalizeFx(state.simFx || base.fx),
      };
    return base;
  }
  function runnerProfileName() {
    return runnerProfile().displayName;
  }

  function currentFxPrefs() {
    if (userCanMaster() && state.mode === "master") return masterFxPrefs();
    if (state.mode === "login" && userCanMaster()) return masterFxPrefs();
    return normalizeFx(runnerProfile().fx);
  }
  function fxClassList() {
    const fx = currentFxPrefs();
    if (!fx.enabled) return "fx-off";
    return [
      "fx-on",
      `fx-${fx.intensity}`,
      fx.decor ? "fx-decor" : "",
      fx.statusRail ? "fx-status" : "",
      fx.circuits ? "fx-circuits" : "",
      fx.oscillator ? "fx-osc" : "",
      fx.microcopy ? "fx-micro" : "",
      fx.hoverMotion ? "fx-hover" : "",
      fx.eventPulse ? "fx-events" : "",
      fx.callPulse ? "fx-call" : "",
      fx.glitch ? "fx-glitch" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  function currentFxCallActive() {
    if (state.mode !== "edgerunner") return false;
    return !!currentRunnerData()?.calls?.some((c) =>
      ["ringing", "accepted"].includes(c.status),
    );
  }
  function fxEventClass() {
    return state.fxEventKind && Number(state.fxEventUntil) > Date.now()
      ? `fx-event-${state.fxEventKind}`
      : "";
  }
  function triggerFx(kind = "signal") {
    if (!commLinkUiOpen()) return;
    const fx = currentFxPrefs();
    if (
      !fx.enabled ||
      !fx.eventPulse ||
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    )
      return;
    const eventKind = ["message", "call", "job", "money", "sync"].includes(kind)
      ? kind
      : "signal";
    state.fxEventKind = eventKind;
    state.fxEventUntil = Date.now() + 920;
    const win = state.root?.querySelector(".cl-window");
    const classes = [
      "fx-event-message",
      "fx-event-call",
      "fx-event-job",
      "fx-event-money",
      "fx-event-sync",
      "fx-event-signal",
    ];
    if (win) {
      win.classList.remove(...classes);
      void win.offsetWidth;
      win.classList.add(`fx-event-${eventKind}`);
    }
    clearTimeout(state.fxTimer);
    state.fxTimer = setTimeout(() => {
      state.fxEventKind = "";
      state.fxEventUntil = 0;
      state.root?.querySelector(".cl-window")?.classList?.remove(...classes);
    }, 930);
  }
  function fxOscillatorMarkup() {
    const fx = currentFxPrefs();
    if (!fx.enabled || !fx.oscillator) return "";
    return `<span class="cl-fx-osc" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  }
  function fxStatusRail(mode) {
    const fx = currentFxPrefs();
    if (!fx.enabled || !fx.statusRail) return "";
    const master = mode === "master",
      data = master ? null : currentRunnerData();
    const node = master
      ? `${state.control.groups.length} RELAYS`
      : text(data?.groupName) || "NO RELAY";
    const identity = master ? masterSenderProfile().name : runnerSpeakerName();
    return `<div class="cl-fx-status-rail"><span class="cl-fx-net"><i></i>NET</span><span>SECURE</span><span class="cl-fx-node">${esc(node)}</span>${fxOscillatorMarkup()}<span class="cl-fx-rxtx"><b>RX</b><b>TX</b></span><span class="cl-fx-id" title="${esc(identity)}">${esc(identity)}</span></div>`;
  }
  function fxAccessories(mode) {
    const fx = currentFxPrefs();
    if (!fx.enabled) return "";
    const serial = mode === "master" ? "NC-MSTR-8841" : "NC-PERS-2077";
    return `<div class="cl-fx-accessories" aria-hidden="true"><i class="screw s1"></i><i class="screw s2"></i><i class="screw s3"></i><i class="screw s4"></i>${fx.decor ? `<span class="cl-fx-vent vent-a"></span><span class="cl-fx-vent vent-b"></span>` : ""}${fx.circuits ? `<span class="cl-fx-trace trace-a"><i></i></span><span class="cl-fx-trace trace-b"><i></i></span><span class="cl-fx-trace trace-c"><i></i></span>` : ""}${fx.microcopy ? `<b class="cl-fx-serial">${serial} // REV.08.3</b><b class="cl-fx-warning">WARRANTY VOID // LOCAL MESH</b>` : ""}</div>`;
  }
  function runnerSpeakerIdentity() {
    const actor = currentRunnerActor();
    if (isRunnerSimulation())
      return {
        actorId: text(actor?.id),
        name: text(actor?.name) || runnerProfileName(),
        image: actorImage(actor) || runnerProfile().image,
      };
    return {
      actorId: text(actor?.id),
      name: text(actor?.name) || runnerProfileName(),
      image: actorImage(actor) || runnerProfile().image || "",
    };
  }
  function runnerSpeakerName() {
    return runnerSpeakerIdentity().name;
  }
  function bubbleAvatarMarkup(image, name) {
    return `<div class="cl-bubble-avatar">${image ? `<img src="${esc(image)}" alt="${esc(name || "контакт")}">` : `<span title="${esc(name || "Неизвестно")}">?</span>`}</div>`;
  }
  function chatBubbleHtml(entry, opts = {}) {
    const mine = isMyCommLinkLine(entry);
    const name =
      text(entry.senderName || entry.name) ||
      (mine ? runnerSpeakerName() : text(opts.fallbackName) || "UNKNOWN");
    const image =
      text(entry.image) ||
      (mine
        ? text(opts.playerImage) || runnerSpeakerIdentity().image
        : text(opts.contactImage) || "");
    return `<div class="cl-bubble-row ${mine ? "mine" : "theirs"}">${bubbleAvatarMarkup(image, name)}<div class="cl-bubble ${mine ? "mine" : "theirs"}"><small>${esc(name)} · ${formatDate(entry.createdAt)}</small><p>${esc(text(entry.body)).replaceAll("\n", "<br>")}</p></div></div>`;
  }
  async function hashPin(value) {
    return hashCommLinkPin(value);
  }
  function groupAllowsActor(groupId, actorId = currentRunnerActorId()) {
    const data = state.groupData.get(groupId);
    const ids = data?.memberActorIds || groupById(groupId)?.actorIds || [];
    return !!actorId && ids.includes(actorId);
  }
  function switchToRunnerGroup(groupId) {
    if (!groupId || !state.groupData.has(groupId)) return;
    if (!userCanMaster() && !groupAllowsActor(groupId))
      return notify("Этот Actor не состоит в выбранной группе.", "warn");
    state.modal = null;
    state.runnerTab = "home";
    if (userCanMaster()) {
      state.previewGroupId = groupId;
      if (isRunnerSimulation()) resetPreviewData(groupId);
    } else state.activeGroupId = groupId;
    seedNotificationState();
    render();
  }

  function openRunnerPreviewForGroup(groupId) {
    if (!userCanMaster() || !state.control.groups.some((g) => g.id === groupId))
      return;
    const g = groupById(groupId);
    state.runnerActorId =
      text(g?.leaderActorId) || text(g?.actorIds?.[0]) || state.runnerActorId;
    const baseProfile = runnerProfile();
    state.previewGroupId = groupId;
    state.runnerTab = "home";
    state.simSkin = baseProfile.skin;
    state.simFx = normalizeFx(baseProfile.fx);
    enterRunnerMode(true);
  }
  async function selectRunnerActor(actorId, { persist = true } = {}) {
    const actor = actorById(actorId);
    if (!actor || !actorAccessibleToUser(actor))
      return notify("Нет доступа к этому Actor.", "warn");
    state.runnerActorId = actor.id;
    if (!isRunnerSimulation()) mountOptions.onActorChanged?.(actor.id);
    if (persist && !isRunnerSimulation())
      await game.user.update({
        [`flags.${FLAG_ROOT}.activeActorId`]: actor.id,
      });
    const valid = [...state.groupData.keys()].filter((id) =>
      groupAllowsActor(id, actor.id),
    );
    if (!userCanMaster()) {
      state.activeGroupId = valid.includes(state.activeGroupId)
        ? state.activeGroupId
        : valid[0] || "";
    }
    seedNotificationState();
  }
  async function saveRunnerProfile() {
    const m = state.modal || {},
      actor = currentRunnerActor(),
      actorId = text(actor?.id),
      name = text(m.profileName) || text(actor?.name);
    if (!actorId)
      return notify("Сначала выберите Actor для COMM-LINK.", "warn");
    if (!name) return notify("Укажите имя COMM-LINK профиля.", "warn");
    const skin = skinExists(text(m.skin)) ? text(m.skin) : runnerProfile().skin;
    if (isRunnerSimulation()) {
      state.simProfileName = name;
      state.simSkin = skin;
      state.modal = null;
      render();
      return;
    }
    const current = runnerProfile();
    let pinHash = current.pinHash;
    if (!m.pinEnabled) pinHash = "";
    else if (text(m.newPin)) {
      if (!/^\d{4,8}$/.test(text(m.newPin)))
        return notify("PIN должен содержать 4–8 цифр.", "warn");
      pinHash = await hashPin(m.newPin);
    }
    const profiles = runnerProfileStore();
    profiles[actorId] = {
      displayName: name,
      image: text(m.profileImage) || actorImage(actor),
      skin,
      pinHash,
      soundEnabled: m.soundEnabled !== false,
      soundVolume: Math.max(0.2, Math.min(1, Number(m.soundVolume) || 0.75)),
      backgroundNotifications: m.backgroundNotifications !== false,
      fx: normalizeFx(current.fx),
    };
    await game.user.update({
      [`flags.${FLAG_ROOT}.profiles`]: profiles,
      [`flags.${FLAG_ROOT}.activeActorId`]: actorId,
    });
    state.modal = null;
    render();
    notify(`COMM-LINK профиль «${actor.name}» сохранён.`);
  }

  async function saveFxSettings() {
    const m = state.modal || {};
    const fx = normalizeFx({
      enabled: m.fxEnabled !== false,
      intensity: text(m.fxIntensity) || "balanced",
      decor: m.fxDecor !== false,
      statusRail: m.fxStatusRail !== false,
      circuits: m.fxCircuits !== false,
      oscillator: m.fxOscillator !== false,
      microcopy: m.fxMicrocopy !== false,
      hoverMotion: m.fxHover !== false,
      eventPulse: m.fxEvents !== false,
      callPulse: m.fxCall !== false,
      glitch: m.fxGlitch === true,
    });
    if (userCanMaster() && state.mode === "master") {
      await game.user.update({ [`flags.${FLAG_ROOT}.masterFx`]: fx });
    } else if (isRunnerSimulation()) {
      state.simFx = fx;
    } else {
      const actor = currentRunnerActor(),
        actorId = text(actor?.id);
      if (!actorId) return;
      const p = runnerProfile(),
        profiles = runnerProfileStore(),
        existing = profiles[actorId] || {};
      profiles[actorId] = {
        ...existing,
        displayName: text(existing.displayName) || p.displayName,
        image: text(existing.image) || p.image,
        skin: skinExists(text(existing.skin)) ? text(existing.skin) : p.skin,
        pinHash: text(existing.pinHash) || p.pinHash,
        soundEnabled: existing.soundEnabled !== false,
        soundVolume: Number.isFinite(Number(existing.soundVolume))
          ? Number(existing.soundVolume)
          : p.soundVolume,
        backgroundNotifications: existing.backgroundNotifications !== false,
        fx,
      };
      await game.user.update({ [`flags.${FLAG_ROOT}.profiles`]: profiles });
    }
    state.modal = null;
    render();
    notify(
      fx.enabled
        ? "COMM-LINK FX: настройки сохранены."
        : "COMM-LINK FX: визуальные эффекты отключены.",
    );
  }
  function applyFxPreset(id) {
    const m = state.modal;
    if (m?.type !== "fx-settings") return;
    const presets = {
      off: {
        enabled: false,
        intensity: "quiet",
        decor: false,
        statusRail: false,
        circuits: false,
        oscillator: false,
        microcopy: false,
        hoverMotion: false,
        eventPulse: false,
        callPulse: false,
        glitch: false,
      },
      quiet: {
        enabled: true,
        intensity: "quiet",
        decor: true,
        statusRail: true,
        circuits: false,
        oscillator: false,
        microcopy: true,
        hoverMotion: false,
        eventPulse: true,
        callPulse: true,
        glitch: false,
      },
      balanced: { ...FX_DEFAULTS },
      showcase: {
        enabled: true,
        intensity: "showcase",
        decor: true,
        statusRail: true,
        circuits: true,
        oscillator: true,
        microcopy: true,
        hoverMotion: true,
        eventPulse: true,
        callPulse: true,
        glitch: true,
      },
    };
    const fx = normalizeFx(presets[id] || presets.balanced);
    Object.assign(m, {
      fxEnabled: fx.enabled,
      fxIntensity: fx.intensity,
      fxDecor: fx.decor,
      fxStatusRail: fx.statusRail,
      fxCircuits: fx.circuits,
      fxOscillator: fx.oscillator,
      fxMicrocopy: fx.microcopy,
      fxHover: fx.hoverMotion,
      fxEvents: fx.eventPulse,
      fxCall: fx.callPulse,
      fxGlitch: fx.glitch,
    });
    render();
  }
  function contactById(data, id) {
    return data?.contacts?.find((c) => c.id === id) ?? null;
  }
  function contactName(data, id, fallback = "COMM-LINK") {
    return contactById(data, id)?.name || fallback;
  }
  function contactImage(data, id) {
    return contactById(data, id)?.image || "";
  }

  function audiencePicker(selected = [], kind = "") {
    const groups = state.control.groups;
    const allSelected = selected.includes("__all__");
    const hint =
      kind === "job"
        ? "Видимость настраивается для этого заказа. Если выбрано несколько групп, каждая получит отдельный независимый экземпляр контракта."
        : "Видимость настраивается только для этой публикации. Можно выбрать одну, несколько групп или все существующие сейчас группы.";
    if (!groups.length)
      return `<div class="cl-field cl-audience-field"><label>Видимость</label><div class="cl-inline-warning">⚠ Сначала создайте хотя бы одну группу Edgerunner.</div></div>`;
    return `<div class="cl-field cl-audience-field"><label>Видимость</label><div class="cl-chip-grid" data-audience-picker>
      <button type="button" class="cl-choice ${allSelected ? "on" : ""}" data-action="audience-toggle" data-id="__all__">◎ Все текущие группы</button>
      ${groups.map((g) => `<button type="button" class="cl-choice ${selected.includes(g.id) ? "on" : ""}" data-action="audience-toggle" data-id="${esc(g.id)}">▣ ${esc(g.name)}</button>`).join("")}
    </div><small>${esc(hint)}</small></div>`;
  }

  function masterNav() {
    const activity = unreadMasterEventCount();
    const items = [
      ["network", "⌁", "Сеть", activity],
      ["groups", "◫", "Группы", 0],
      ["contacts", "◉", "Контакты", 0],
      [
        "messages",
        "✉",
        "Сообщения",
        masterMessageThreads().filter((r) => r.hasPlayerReply).length,
      ],
      [
        "calls",
        "☎",
        "Звонки",
        masterItemsByGroup("calls").filter((x) =>
          ["ringing", "accepted"].includes(x.item.status),
        ).length,
      ],
      ["jobs", "▤", "Заказы", 0],
    ];
    return `<nav class="cl-master-nav">${items.map(([id, icon, label, count]) => `<button data-action="master-tab" data-tab="${id}" class="${state.masterTab === id ? "active" : ""}"><span>${icon}</span>${label}${count ? `<b class="cl-nav-count">${count}</b>` : ""}</button>`).join("")}</nav>`;
  }

  function runnerNav() {
    const data = currentRunnerData();
    const unreadMessages =
      data?.messages?.filter(
        (m) => !isMyCommLinkLine(m) && !isRead("messages", m.id),
      ).length ?? 0;
    const ringing =
      data?.calls?.filter((c) => c.status === "ringing").length ?? 0;
    const availableJobs =
      data?.jobs?.filter((j) => j.status === "available").length ?? 0;
    const items = [
      ["home", "⌂", "Главная", 0],
      ["messages", "✉", "Сообщения", unreadMessages],
      ["calls", "☎", "Звонки", ringing],
      ["jobs", "▤", "Заказы", availableJobs],
      ["contacts", "◉", "Контакты", 0],
    ];
    return `<nav class="cl-runner-nav">${items.map(([id, icon, label, count]) => `<button data-action="runner-tab" data-tab="${id}" class="${state.runnerTab === id ? "active" : ""}"><span class="ico">${icon}</span><span>${label}</span>${count ? `<b>${count}</b>` : ""}</button>`).join("")}</nav>`;
  }

  function masterHeader() {
    return `<header class="cl-header cl-master-header" aria-label="Инструменты сети ведущего">
      <div class="cl-header-actions">
        ${(() => {
          const sp = masterSenderProfile();
          return `<button data-action="master-sender" class="cl-master-sender-chip" title="Профиль отправителя">${sp.image ? `<img src="${esc(sp.image)}">` : `<span>◉</span>`}<i><small>ACTOR // ОТПРАВИТЕЛЬ</small><b>${esc(sp.name)}</b></i></button>`;
        })()}
        <button data-action="fx-settings" class="cl-fx-btn" title="Визуальные эффекты и аксессуары">FX</button>
        ${diagButton("SYS")}
        <button data-action="switch-mode" class="cl-mode-btn">▣ EDGERUNNER PREVIEW</button>
        ${fxStatusRail("master")}
      </div>
    </header>`;
  }

  function runnerHeader() {
    const data = currentRunnerData(),
      profile = runnerProfile();
    return `<header class="cl-header cl-runner-header" aria-label="Инструменты сети персонажа">
      <div class="cl-runner-identity">
        <div class="cl-runner-title"><strong title="${esc(data?.groupName || "Нет сети")}">${esc(data?.groupName || "Нет сети")}</strong><small>${isRunnerSimulation() ? "SIMULATION" : "LIVE"}</small></div>
      </div>
      <div class="cl-header-actions cl-runner-tools">
        <button data-action="edit-runner-profile" class="cl-profile-chip" title="Профиль COMM-LINK">${profile.image ? `<img src="${esc(profile.image)}">` : `<span>◉</span>`}<b>${esc(profile.displayName)}</b></button>
        <button data-action="fx-settings" class="cl-fx-btn" title="Визуальные эффекты и аксессуары">FX</button>
        ${diagButton("SYS")}
        ${userCanMaster() ? '<button data-action="switch-mode" class="cl-mode-btn">Вернуться в MASTER</button>' : ""}
        ${fxStatusRail("runner")}
      </div>
    </header>`;
  }

  function masterActivityPanel() {
    const events = allMasterEvents(),
      unread = events.filter(
        ({ groupId, event }) => !isMasterEventRead(groupId, event.id),
      ).length;
    const rows = events.slice(0, 8);
    return `<section class="cl-activity-panel"><header><div><small>AUTOMATION FEED</small><h3>События команд</h3><span>${unread ? `${unread} требуют внимания` : "Всё просмотрено"}</span></div>${unread ? `<button data-action="mark-all-events">✓ Прочитать всё</button>` : ""}</header><div class="cl-activity-list">${rows.length ? rows.map(({ groupId, event }) => `<button class="cl-activity-row ${isMasterEventRead(groupId, event.id) ? "" : "unread"}" data-action="master-event-open" data-group="${esc(groupId)}" data-event="${esc(event.id)}"><span class="cl-activity-icon">${eventIcon(event.type)}</span><div><b>${esc(groupNameById(groupId))} · ${esc(event.actorName)}</b><strong>${esc(event.summary)}</strong>${event.detail ? `<small>${short(event.detail, 110)}</small>` : ""}</div><time>${formatDate(event.createdAt)}</time><i>›</i></button>`).join("") : `<div class="cl-team-empty">События игроков появятся здесь автоматически: ответы, звонки и принятые заказы.</div>`}</div></section>`;
  }

  function masterNetworkView() {
    const groupCount = state.control.groups.length;
    let totals = { contacts: 0, messages: 0, calls: 0, jobs: 0 };
    for (const data of state.groupData.values())
      for (const k of Object.keys(totals)) totals[k] += data[k]?.length ?? 0;
    return `<section class="cl-page">
      <div class="cl-page-head"><div><span class="eyebrow">NETWORK OVERVIEW</span><h2>Сетевая консоль</h2><p>Работайте от команды: так аудитория уже выбрана, а заказы и звонки разных партий никогда не смешиваются.</p></div><button data-action="master-tab" data-tab="contacts">◉ Адресная книга</button></div>
      <div class="cl-stat-grid"><article><b>${groupCount}</b><span>Команды</span></article><article><b>${totals.contacts}</b><span>Контакты</span></article><article><b>${totals.messages}</b><span>Сообщения</span></article><article><b>${totals.calls}</b><span>Звонки</span></article><article><b>${totals.jobs}</b><span>Заказы</span></article></div>
      <div class="cl-section-title cl-network-team-title"><h3>Команды</h3><button data-action="new-group">＋ Новая команда</button></div>
      <div class="cl-network-crews">${
        state.control.groups.length
          ? state.control.groups
              .map((g) => {
                const st = groupStats(g.id);
                return `<article><div class="cl-network-crew-main" data-action="open-group-dashboard" data-id="${esc(g.id)}"><b>${esc(g.name)}</b><small>${(g.actorIds || []).length} участник(а) · ${st.activeJobs} активных заказов · ${st.activeCalls} звонков${st.pendingEvents ? ` · ${st.pendingEvents} событий` : ""}</small></div><div class="cl-network-crew-actions"><button data-action="quick-message" data-group="${esc(g.id)}">✉</button><button data-action="quick-call" data-group="${esc(g.id)}">☎</button><button data-action="quick-job" data-group="${esc(g.id)}">▤</button><button data-action="preview-group" data-group="${esc(g.id)}" title="Проверить интерфейс этой команды">▣ Preview</button><button data-action="open-group-dashboard" data-id="${esc(g.id)}">Открыть →</button></div></article>`;
              })
              .join("")
          : `<div class="cl-empty"><b>Сеть ещё не разделена на команды</b><span>Создайте первую команду и добавьте Actor. После этого все основные действия будут доступны прямо из её карточки.</span><button class="primary" data-action="new-group">＋ Создать команду</button></div>`
      }</div>
      ${masterActivityPanel()}
      <div class="cl-panel cl-network-rule"><h3>Принцип</h3><p>Контент публикуется в конкретную сеть. Если понадобится показать одну запись нескольким командам, это можно явно выбрать в её окне видимости.</p></div>
    </section>`;
  }

  function groupStats(groupId) {
    const data =
      state.groupData.get(groupId) ?? blankNetworkData(groupId, "Группа");
    const grouped = new Map();
    for (const m of data.messages) {
      if (!grouped.has(m.threadId)) grouped.set(m.threadId, []);
      grouped.get(m.threadId).push(m);
    }
    const unreadReplies = [...grouped.values()].filter(
      (arr) =>
        [...arr]
          .sort((a, b) =>
            String(a.createdAt).localeCompare(String(b.createdAt)),
          )
          .at(-1)?.sender === "player",
    ).length;
    const activeCalls = data.calls.filter((c) =>
      ["ringing", "accepted"].includes(c.status),
    ).length;
    const activeJobs = data.jobs.filter((j) =>
      ["available", "accepted"].includes(j.status),
    ).length;
    const pendingEvents = (data.events || []).filter(
      (e) => !isMasterEventRead(groupId, e.id),
    ).length;
    return {
      contacts: data.contacts.length,
      messages: data.messages.length,
      unreadReplies,
      activeCalls,
      activeJobs,
      jobs: data.jobs.length,
      pendingEvents,
    };
  }
  function groupMemberNames(group) {
    return (group.actorIds || []).map(
      (id) => actorById(id)?.name || "Неизвестный Actor",
    );
  }
  function groupMemberPills(group) {
    const names = groupMemberNames(group);
    if (!names.length)
      return `<span class="cl-member-empty">Участники ещё не назначены</span>`;
    return names
      .map(
        (name) =>
          `<span class="cl-member-pill"><i>${esc(name.slice(0, 1).toUpperCase())}</i>${esc(name)}</span>`,
      )
      .join("");
  }
  function masterGroupsView() {
    const selected = selectedTokenIdentity();
    return `<section class="cl-page"><div class="cl-page-head"><div><span class="eyebrow">CREW NETWORK</span><h2>Команды</h2><p>Состав команды — Actor, а не аккаунты Foundry. Лидер принимает групповые заказы.</p></div><button class="primary" data-action="new-group">＋ Новая команда</button></div>
      ${selected?.actorId ? `<div class="cl-selected-actor-strip"><div>${selected.image ? `<img src="${esc(selected.image)}">` : `<span>?</span>`}<div><small>ВЫБРАННЫЙ ACTOR</small><b>${esc(selected.name)}</b></div></div><span>Добавьте его в нужную команду одним нажатием.</span></div>` : ""}
      <div class="cl-team-grid">${
        state.control.groups.length
          ? state.control.groups
              .map((g) => {
                const st = groupStats(g.id),
                  hasSelected =
                    selected?.actorId &&
                    (g.actorIds || []).includes(selected.actorId);
                return `<article class="cl-team-card" data-context-kind="group" data-context-id="${esc(g.id)}">
        <header><div><small>EDGERUNNER CREW</small><h3>${esc(g.name)}</h3></div><span class="cl-team-count">${(g.actorIds || []).length}</span></header>
        <div class="cl-member-pills">${groupMemberPills(g)}</div>
        <div class="cl-team-stats"><span><b>${st.contacts}</b> контактов</span><span><b>${st.activeJobs}</b> активных заказов</span><span><b>${st.activeCalls}</b> звонков</span><span><b>${st.unreadReplies}</b> ответов</span></div>
        ${selected?.actorId ? `<button class="cl-selected-actor-add ${hasSelected ? "done" : ""}" data-action="add-selected-actor-group" data-group="${esc(g.id)}" ${hasSelected ? "disabled" : ""}>${hasSelected ? "✓ Уже в команде" : `◎ Добавить ${esc(selected.name)}`}</button>` : ""}
        <div class="cl-team-actions"><button data-action="quick-message" data-group="${esc(g.id)}">✉ Сообщение</button><button data-action="quick-call" data-group="${esc(g.id)}">☎ Звонок</button><button data-action="quick-job" data-group="${esc(g.id)}">▤ Заказ</button><button data-action="preview-group" data-group="${esc(g.id)}">▣ Preview</button><button class="primary" data-action="open-group-dashboard" data-id="${esc(g.id)}">Открыть команду →</button></div>
      </article>`;
              })
              .join("")
          : `<div class="cl-empty"><b>Команд ещё нет</b><span>Создайте команду, добавьте в неё Actor и дальше публикуйте всё прямо для неё.</span><button class="primary" data-action="new-group">＋ Создать первую команду</button></div>`
      }</div>
    </section>`;
  }

  function unifiedMasterItems(kind) {
    const map = new Map(),
      contactNameToId = new Map();
    if (kind === "contacts") {
      for (const c of sharedMasterContacts()) {
        map.set(c.id, { item: clone(c), groupIds: [] });
        const n = normalize(c.name);
        if (n && !contactNameToId.has(n)) contactNameToId.set(n, c.id);
      }
    }
    for (const [groupId, data] of state.groupData) {
      const arr = data[kind] ?? [];
      for (const item of arr) {
        if (kind === "contacts" && item.source === "player") continue;
        let key = item.id;
        if (kind === "contacts")
          key = contactNameToId.get(normalize(item.name)) || item.id;
        if (!map.has(key)) map.set(key, { item: clone(item), groupIds: [] });
        const row = map.get(key);
        if (!row.groupIds.includes(groupId)) row.groupIds.push(groupId);
      }
    }
    return [...map.values()].sort((a, b) =>
      String(b.item.updatedAt || b.item.createdAt || "").localeCompare(
        String(a.item.updatedAt || a.item.createdAt || ""),
      ),
    );
  }

  function masterContactsView() {
    const items = unifiedMasterItems("contacts"),
      selected = selectedTokenIdentity();
    const selectedQuick =
      selected?.actorId && state.control.groups.length
        ? `<div class="cl-selected-actor-strip cl-contact-add-strip"><div>${selected.image ? `<img src="${esc(selected.image)}">` : `<span>?</span>`}<div><small>ВЫБРАННЫЙ ACTOR → КОНТАКТЫ</small><b>${esc(selected.name)}</b></div></div><div class="cl-actor-add-actions">${state.control.groups
            .map((g) => {
              const exists = state.groupData
                .get(g.id)
                ?.contacts?.some((c) => c.actorId === selected.actorId);
              return `<button data-action="add-selected-actor-contact-group" data-group="${esc(g.id)}" ${exists ? "disabled" : ""}>${exists ? "✓ " : "＋ "}${esc(g.name)}</button>`;
            })
            .join(
              "",
            )}${state.control.groups.length > 1 ? `<button class="green" data-action="add-selected-actor-contact-all">＋ Все группы</button>` : ""}</div></div>`
        : "";
    return `<section class="cl-page"><div class="cl-page-head"><div><span class="eyebrow">SHARED GM DATABASE</span><h2>Общая база контактов MASTER</h2><p>Единая адресная книга для всех пользователей с ролью GAMEMASTER. Контакт хранится в GM-базе независимо от того, каким командам выдали к нему доступ.</p></div><div class="cl-head-buttons"><button data-action="open-actor-contact-picker"><span>⌕</span> Actor Directory</button><button data-action="import-datapad"><span>⇩</span> DATAPAD</button><button class="primary" data-action="new-contact"><span>＋</span> Контакт</button></div></div>${selectedQuick}
      <div class="cl-info-strip"><b>GLOBAL GM DB</b><span>Все GAMEMASTER видят и редактируют одну базу. <strong>CREW</strong> — участник команды; <strong>ДОСТУП</strong> — контакт опубликован этой группе; без меток контакт остаётся только в общей GM-базе.</span></div>
      ${items.length ? `<div class="cl-contact-search"><span>⌕</span><input data-search-kind="master-contact" value="${esc(state.masterContactSearch)}" placeholder="Найти имя, тег, позывной…"></div>` : ""}
      <div class="cl-list" data-search-list="master-contact">${
        items.length
          ? items
              .map(({ item, groupIds }) => {
                const badges = groupIds
                  .map((id) => {
                    const g = groupById(id),
                      crew =
                        !!item.actorId &&
                        (g?.actorIds || []).includes(item.actorId);
                    return `<span class="${crew ? "crew" : "access"}">${crew ? "CREW" : "ДОСТУП"} · ${esc(g?.name || "?")}</span>`;
                  })
                  .join("");
                return `<button class="cl-row cl-row-button" data-search-text="${esc(normalize([item.name, item.handle, item.summary, ...(item.tags || [])].join(" ")))}" data-action="open-master-contact" data-id="${esc(item.id)}" data-context-kind="master-contact" data-context-id="${esc(item.id)}"><span class="cl-avatar cl-avatar-action" data-action="contact-avatar-message" data-id="${esc(item.id)}" title="Написать от имени контакта">${item.image ? `<img src="${esc(item.image)}">` : "?"}</span><div class="grow"><h3>${esc(item.name)}</h3><p>${short(item.summary || item.handle || "Контакт сети", 140)}</p><div class="cl-mini-tags">${(
                  item.tags || []
                )
                  .slice(0, 5)
                  .map((t) => `<span>#${esc(t)}</span>`)
                  .join(
                    "",
                  )}</div></div><div class="cl-audience-mini semantic">${badges || `<span class="access">GM DB · БЕЗ ДОСТУПА</span>`}</div><b class="cl-open-arrow">›</b></button>`;
              })
              .join("")
          : `<div class="cl-empty"><b>Общая GM-база пуста</b><span>Контакты MASTER здесь общие для всех пользователей с ролью GAMEMASTER.</span></div>`
      }</div>
    </section>`;
  }

  function masterMessageThreads() {
    const rows = [];
    for (const [groupId, data] of state.groupData) {
      const grouped = new Map();
      for (const msg of data.messages) {
        if (!grouped.has(msg.threadId)) grouped.set(msg.threadId, []);
        grouped.get(msg.threadId).push(msg);
      }
      for (const [threadId, arr0] of grouped) {
        const arr = [...arr0].sort((a, b) =>
          String(a.createdAt).localeCompare(String(b.createdAt)),
        );
        const latest = arr[arr.length - 1],
          npc = arr.find((x) => x.sender !== "player");
        rows.push({
          groupId,
          threadId,
          latest,
          count: arr.length,
          contactId: text(npc?.contactId),
          name:
            text(npc?.senderName) ||
            text(latest.senderName) ||
            contactName(data, npc?.contactId, "COMM-LINK"),
          image: contactImage(data, npc?.contactId) || npc?.image || "",
          hasPlayerReply: latest.sender === "player",
        });
      }
    }
    return rows.sort((a, b) =>
      String(b.latest.createdAt || "").localeCompare(
        String(a.latest.createdAt || ""),
      ),
    );
  }

  function masterMessagesView() {
    const rows = masterMessageThreads(),
      contacts = allMasterContacts();
    return `<section class="cl-page"><div class="cl-page-head"><div><span class="eyebrow">MESSAGING</span><h2>Диалоги</h2><p>Контакт можно открыть одним нажатием и сразу написать нужной команде. История каждого треда сохраняется.</p></div><button class="primary" data-action="new-message">＋ Ручное сообщение</button></div>
      ${
        contacts.length
          ? `<section class="cl-dialer cl-message-launcher"><header><div><small>QUICK MESSAGE</small><h3>Написать от контакта</h3></div><span>${contacts.length} контактов</span></header><div class="cl-contact-search"><span>⌕</span><input data-search-kind="master-contact" value="${esc(state.masterContactSearch)}" placeholder="Имя или позывной…"></div><div class="cl-dial-grid" data-search-list="master-contact">${contacts
              .map((c) => {
                const groups = groupsContaining("contacts", c.id);
                return `<article data-search-text="${esc(normalize([c.name, c.handle, ...(c.tags || [])].join(" ")))}"><button class="cl-dial-id cl-dial-contact-button" data-action="open-master-contact" data-id="${esc(c.id)}" title="Открыть контакт">${c.image ? `<img src="${esc(c.image)}">` : `<span>◉</span>`}<div><b>${esc(c.name)}</b><small>${esc(c.handle || "Контакт сети")}</small></div></button><div class="cl-dial-actions">${groups.length ? groups.map((gid) => `<button data-action="contact-quick-message" data-contact="${esc(c.id)}" data-group="${esc(gid)}">✉ ${esc(groupNameById(gid))}</button>`).join("") : `<button data-action="open-master-contact" data-id="${esc(c.id)}">Настроить доступ</button>`}</div></article>`;
              })
              .join("")}</div></section>`
          : ""
      }
      <div class="cl-list">${rows.length ? rows.map((row) => `<button class="cl-master-thread-row ${row.hasPlayerReply ? "has-reply" : ""}" data-action="open-master-thread" data-group="${esc(row.groupId)}" data-thread="${esc(row.threadId)}" data-context-kind="master-thread" data-context-group="${esc(row.groupId)}" data-context-thread="${esc(row.threadId)}"><span class="cl-avatar sm cl-avatar-action" ${row.contactId ? `data-action="contact-quick-message" data-contact="${esc(row.contactId)}" data-group="${esc(row.groupId)}" title="Новое сообщение от этого контакта"` : ""}>${row.image ? `<img src="${esc(row.image)}">` : "✉"}</span><div class="grow"><div class="cl-row-title"><h3>${esc(row.name)}</h3>${row.hasPlayerReply ? `<span class="cl-reply-badge">Ответ группы</span>` : ""}</div><p>${row.latest.sender === "player" ? `<b>Игрок:</b> ` : ""}${short(row.latest.body, 160)}</p><small>${esc(state.control.groups.find((g) => g.id === row.groupId)?.name || "Группа")} · ${row.count} сообщ. · ${formatDate(row.latest.createdAt)}</small></div><div class="cl-audience-mini"><span>${esc(state.control.groups.find((g) => g.id === row.groupId)?.name || "?")}</span></div><b class="cl-open-arrow">›</b></button>`).join("") : `<div class="cl-empty"><b>История пока пуста</b><span>Выберите контакт выше — после отправки диалог появится здесь и больше не потеряется.</span></div>`}</div>
    </section>`;
  }

  function masterCallRow(item, groupId) {
    const meta = publicationMeta(item),
      hidden = meta && meta.identityVisible === false,
      gmName = hidden ? meta.name : item.name;
    return `<button class="cl-row cl-row-button" data-action="open-master-call" data-id="${esc(item.id)}" data-group="${esc(groupId)}" data-context-kind="master-call" data-context-id="${esc(item.id)}" data-context-group="${esc(groupId)}"><div class="cl-msg-icon">☎</div><div class="grow"><h3>${esc(gmName)}</h3>${hidden ? `<small class="cl-secret-hint">Игрок видит: ${esc(item.name)}</small>` : ""}<p>${short(item.note || "Входящий вызов", 160)}</p><small>${esc(groupNameById(groupId))}</small><div class="cl-status ${esc(item.status)}">${esc(callStatusLabel(item.status))}${item.transcript?.length ? ` · ${item.transcript.length} репл.` : ""}</div></div><div class="cl-audience-mini"><span>${esc(groupNameById(groupId))}</span></div><b class="cl-open-arrow">›</b></button>`;
  }
  function masterCallsView() {
    const items = masterItemsByGroup("calls"),
      active = items.filter(({ item }) =>
        ["ringing", "accepted"].includes(item.status),
      ),
      archive = items.filter(
        ({ item }) => !["ringing", "accepted"].includes(item.status),
      );
    const contacts = allMasterContacts();
    return `<section class="cl-page"><div class="cl-page-head"><div><span class="eyebrow">VOICE EVENTS</span><h2>Звонки</h2><p>Вызывайте контакт прямо отсюда. Полная история разговоров и транскрипты сохраняются автоматически.</p></div><button class="primary" data-action="new-call">＋ Ручной вызов</button></div>
      ${
        contacts.length
          ? `<section class="cl-dialer"><header><div><small>QUICK DIAL</small><h3>Быстрый вызов</h3></div><span>${contacts.length} контактов</span></header><div class="cl-contact-search"><span>⌕</span><input data-search-kind="master-contact" value="${esc(state.masterContactSearch)}" placeholder="Имя или позывной…"></div><div class="cl-dial-grid" data-search-list="master-contact">${contacts
              .map((c) => {
                const groups = groupsContaining("contacts", c.id);
                return `<article data-search-text="${esc(normalize([c.name, c.handle, ...(c.tags || [])].join(" ")))}"><div class="cl-dial-id">${c.image ? `<img src="${esc(c.image)}">` : `<span>◉</span>`}<div><b>${esc(c.name)}</b><small>${esc(c.handle || "Контакт сети")}</small></div></div><div class="cl-dial-actions">${groups.length ? groups.map((gid) => `<button data-action="contact-quick-call" data-contact="${esc(c.id)}" data-group="${esc(gid)}">☎ ${esc(groupNameById(gid))}</button>`).join("") : `<button data-action="open-master-contact" data-id="${esc(c.id)}">Настроить доступ</button>`}</div></article>`;
              })
              .join("")}</div></section>`
          : ""
      }
      <div class="cl-list">${active.length ? active.map(({ item, groupId }) => masterCallRow(item, groupId)).join("") : `<div class="cl-empty small"><span>Активных звонков нет.</span></div>`}</div>
      ${archive.length ? `<div class="cl-archive-block"><button class="cl-archive-toggle" data-action="toggle-master-call-archive"><span>История звонков</span><b>${archive.length}</b><i>${state.showMasterCallArchive ? "⌃" : "⌄"}</i></button>${state.showMasterCallArchive ? `<div class="cl-list archive">${archive.map(({ item, groupId }) => masterCallRow(item, groupId)).join("")}</div>` : ""}</div>` : ""}
    </section>`;
  }

  function masterItemsByGroup(kind) {
    const rows = [];
    for (const [groupId, data] of state.groupData) {
      for (const item of data[kind] ?? [])
        rows.push({ item: clone(item), groupId });
    }
    return rows.sort((a, b) =>
      String(b.item.createdAt || "").localeCompare(
        String(a.item.createdAt || ""),
      ),
    );
  }

  function masterJobRow(item, groupId) {
    return `<button class="cl-job-row cl-row-button" data-action="open-master-job" data-id="${esc(item.id)}" data-group="${esc(groupId)}" data-context-kind="master-job" data-context-id="${esc(item.id)}" data-context-group="${esc(groupId)}"><div class="cl-fixer-strip compact">${item.fixerImage ? `<img src="${esc(item.fixerImage)}">` : `<span class="cl-fixer-glyph">◆</span>`}<div><small>ЗАКАЗЧИК // FIXER</small><strong>${esc(item.fixerName || "Неизвестный фиксер")}</strong></div></div><div class="grow"><h3>${esc(item.title)}</h3><p>${short(item.summary, 180)}</p><small><span class="cl-risk">${"●".repeat(item.risk)}${"○".repeat(5 - item.risk)}</span> · ${item.deadline ? `Срок: ${esc(item.deadline)}` : "Без срока"}${item.acceptedBy ? ` · Принял: ${esc(item.acceptedBy)}` : ""}</small></div><div class="cl-pay">${esc(item.pay || "—")} <small>${esc(item.currency)}</small></div><span class="cl-status ${esc(item.status)}">${esc(jobStatusLabel(item.status))}</span><b class="cl-open-arrow">›</b></button>`;
  }
  function masterJobsView() {
    const archivedTotal = [...state.groupData.values()].reduce(
      (n, d) =>
        n +
        (d.jobs || []).filter(
          (j) => !["available", "accepted"].includes(j.status),
        ).length,
      0,
    );
    return `<section class="cl-page"><div class="cl-page-head"><div><span class="eyebrow">FIXER.NET</span><h2>Заказы по командам</h2><p>Активные контракты остаются в работе, завершённые автоматически уходят в архив.</p></div>${archivedTotal ? `<button data-action="toggle-master-job-archive">${state.showMasterJobArchive ? "Скрыть" : "Показать"} архив · ${archivedTotal}</button>` : ""}</div>
      <div class="cl-team-job-sections">${
        state.control.groups.length
          ? state.control.groups
              .map((g) => {
                const data = state.groupData.get(g.id);
                const jobs = [...(data?.jobs || [])].sort((a, b) =>
                    String(b.createdAt).localeCompare(String(a.createdAt)),
                  ),
                  activeJobs = jobs.filter((j) =>
                    ["available", "accepted"].includes(j.status),
                  ),
                  archived = jobs.filter(
                    (j) => !["available", "accepted"].includes(j.status),
                  );
                return `<section class="cl-team-job-section"><header><div><small>КОМАНДА</small><h3>${esc(g.name)}</h3><span>${activeJobs.length} активных${archived.length ? ` · ${archived.length} в архиве` : ""}</span></div><button class="primary" data-action="quick-job" data-group="${esc(g.id)}">＋ Заказ для команды</button></header><div class="cl-list">${activeJobs.length ? activeJobs.map((j) => masterJobRow(j, g.id)).join("") : `<div class="cl-team-empty">Активных контрактов нет.</div>`}${state.showMasterJobArchive && archived.length ? `<div class="cl-archive-divider">АРХИВ</div>${archived.map((j) => masterJobRow(j, g.id)).join("")}` : ""}</div></section>`;
              })
              .join("")
          : `<div class="cl-empty"><b>Сначала создайте команду</b><span>Заказы публикуются в конкретную сеть команды.</span><button class="primary" data-action="new-group">＋ Новая команда</button></div>`
      }</div>
    </section>`;
  }

  function callStatusLabel(s) {
    return (
      {
        ringing: "Входящий",
        accepted: "Разговор",
        declined: "Отклонён",
        missed: "Пропущен",
        ended: "Завершён",
      }[s] ||
      s ||
      "—"
    );
  }
  function jobStatusLabel(s) {
    return (
      {
        available: "Доступен",
        accepted: "Принят",
        completed: "Выполнен",
        failed: "Провален",
        cancelled: "Отменён",
        declined: "Отклонён",
      }[s] ||
      s ||
      "—"
    );
  }

  function runnerHomeView(data) {
    if (!data) return noNetworkView();
    const lastMessages = data.messages
      .filter((m) => !isMyCommLinkLine(m) && !isRead("messages", m.id))
      .slice(0, 3);
    const ringing = data.calls.find((c) => c.status === "ringing");
    const jobs = data.jobs.filter((j) => j.status === "available").slice(0, 3);
    const liveGroupSelector =
      userCanMaster() &&
      !isRunnerSimulation() &&
      state.control.groups.length > 1
        ? `<section class="cl-live-network-select"><div><small>LIVE EDGERUNNER</small><strong>Активная сеть</strong></div><select data-action="runner-group" aria-label="Активная сеть команды">${state.control.groups.map((g) => `<option value="${esc(g.id)}" ${g.id === currentRunnerGroupId() ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></section>`
        : "";
    const simulationPanel = isRunnerSimulation()
      ? `<section class="cl-sim-home-panel">
      <div class="cl-sim-home-copy"><span class="cl-sim-home-kicker">GM TEST MODE</span><strong>Симуляция EDGERUNNER</strong><small>Изменения остаются только в предпросмотре и не меняют данные мира.</small></div>
      <div class="cl-sim-home-actions">
        <button data-action="reset-preview">↻ Сбросить тест</button>
        <button class="cl-sim-live" data-action="exit-simulation">● Перейти в LIVE</button>
        <button class="cl-sim-return" data-action="switch-mode"><span class="cl-css-lock" aria-hidden="true"></span><span>Вернуться в MASTER</span></button>
      </div>
    </section>`
      : "";
    return `<section class="cl-phone-page">
      ${simulationPanel}
      ${liveGroupSelector}
      <div class="cl-phone-hero"><span>GOOD ${new Date().getHours() < 12 ? "MORNING" : new Date().getHours() < 18 ? "AFTERNOON" : "EVENING"}</span><h2>${esc(runnerProfileName())}</h2><p>${esc(data.groupName)} // сеть активна</p></div>
      ${ringing ? `<button class="cl-incoming" data-action="open-call" data-id="${esc(ringing.id)}"><div class="pulse-static">☎</div><div><small>ВХОДЯЩИЙ ВЫЗОВ</small><strong>${esc(ringing.name)}</strong><span>${short(ringing.note, 80)}</span></div><b>›</b></button>` : ""}
      <div class="cl-home-section"><div class="cl-section-title"><h3>Непрочитанные</h3><button data-action="runner-tab" data-tab="messages">Все</button></div>${lastMessages.length ? lastMessages.map((m) => messagePreview(data, m)).join("") : `<div class="cl-empty small"><span>Новых сообщений нет.</span></div>`}</div>
      <div class="cl-home-section"><div class="cl-section-title"><h3>Доступные заказы</h3><button data-action="runner-tab" data-tab="jobs">Все</button></div>${jobs.length ? jobs.map((j) => jobPreview(j)).join("") : `<div class="cl-empty small"><span>Свободных контрактов нет.</span></div>`}</div>
    </section>`;
  }

  function runnerActiveCallBar(data) {
    if (!data) return "";
    const active =
      data.calls.find((c) => c.status === "accepted") ||
      data.calls.find((c) => c.status === "ringing");
    if (!active) return "";
    const live = active.status === "accepted";
    return `<button class="cl-live-call-bar ${live ? "live" : "ringing"}" data-action="open-call" data-id="${esc(active.id)}">
      <span class="cl-live-call-icon">☎</span>
      <span class="cl-live-call-copy"><small>${live ? "LIVE CALL" : "ВХОДЯЩИЙ ВЫЗОВ"}</small><strong>${esc(active.name)}</strong></span>
      <span class="cl-live-call-action">${live ? "Вернуться" : "Открыть"} →</span>
    </button>`;
  }

  function messagePreview(data, m, meta = {}) {
    const unread =
      meta.unread ?? (!isMyCommLinkLine(m) && !isRead("messages", m.id));
    const mine = isMyCommLinkLine(m);
    const displayName = mine
      ? text(m.senderName) || runnerSpeakerName()
      : meta.name ||
        text(m.senderName) ||
        contactName(data, m.contactId, "UNKNOWN");
    const image = mine
      ? text(m.image) || ""
      : meta.image || text(m.image) || contactImage(data, m.contactId) || "";
    const prefix = mine ? "Вы: " : "";
    return `<button class="cl-thread-preview ${unread ? "unread" : ""}" data-action="open-thread" data-thread="${esc(m.threadId)}" data-message="${esc(m.id)}" data-context-kind="runner-thread" data-context-thread="${esc(m.threadId)}" data-context-id="${esc(m.id)}"><div class="cl-avatar sm">${image ? `<img src="${esc(image)}">` : "?"}</div><div class="cl-thread-copy"><small class="cl-thread-from">${mine ? "ВЫ" : "ОТ"}</small><strong class="cl-message-sender">${esc(displayName)}</strong><span>${esc(prefix)}${short(m.body, 80)}</span></div><small class="cl-thread-time">${formatDate(m.createdAt)}</small></button>`;
  }
  function jobPreview(j) {
    return `<button class="cl-job-preview" data-action="open-job" data-id="${esc(j.id)}" data-context-kind="runner-job" data-context-id="${esc(j.id)}"><div class="cl-job-preview-main"><div class="cl-fixer-strip compact">${j.fixerImage ? `<img src="${esc(j.fixerImage)}">` : `<span class="cl-fixer-glyph">◆</span>`}<div><small>ЗАКАЗЧИК // FIXER</small><strong>${esc(j.fixerName || "Неизвестный фиксер")}</strong></div></div><strong>${esc(j.title)}</strong><span>${short(j.summary, 90)}</span></div><div class="cl-job-preview-pay"><b>${esc(j.pay || "—")}</b><small>${esc(j.currency)}</small></div></button>`;
  }

  function runnerMessagesView(data) {
    if (!data) return noNetworkView();
    const grouped = new Map();
    for (const m of [...data.messages].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    )) {
      if (!grouped.has(m.threadId)) grouped.set(m.threadId, []);
      grouped.get(m.threadId).push(m);
    }
    const rows = [...grouped.values()].map((arr) => {
      const latest = arr[0];
      const npc = [...arr].find((x) => x.sender !== "player");
      const contactId = latest.contactId || npc?.contactId || "";
      const name = contactName(
        data,
        contactId,
        npc?.senderName || latest.senderName || "COMM-LINK",
      );
      const image = contactImage(data, contactId) || npc?.image || "";
      const unread = arr.some(
        (x) => x.sender !== "player" && !isRead("messages", x.id),
      );
      return messagePreview(data, latest, { name, image, unread });
    });
    return `<section class="cl-phone-page"><div class="cl-phone-title"><h2>Сообщения</h2><span>${grouped.size} диалог(а)</span></div><div class="cl-thread-list">${rows.length ? rows.join("") : `<div class="cl-empty"><b>Пусто</b><span>Сообщения от GM появятся здесь.</span></div>`}</div></section>`;
  }
  function runnerCallRow(c) {
    return `<button class="cl-call-row" data-action="open-call" data-id="${esc(c.id)}" data-context-kind="runner-call" data-context-id="${esc(c.id)}">${c.image ? `<div class="cl-avatar call"><img src="${esc(c.image)}"></div>` : `<div class="cl-call-symbol">☎</div>`}<div><small class="cl-call-direction">ОТ</small><strong>${esc(c.name)}</strong><span>${esc(callStatusLabel(c.status))}${c.answeredBy ? ` · ${esc(c.answeredBy)}` : ""}</span></div><small>${formatDate(c.createdAt)}</small></button>`;
  }
  function runnerCallsView(data) {
    if (!data) return noNetworkView();
    const calls = [...data.calls].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      ),
      active = calls.filter((c) => ["ringing", "accepted"].includes(c.status)),
      archive = calls.filter(
        (c) => !["ringing", "accepted"].includes(c.status),
      );
    return `<section class="cl-phone-page"><div class="cl-phone-title"><h2>Звонки</h2><span>${active.length} активн.</span></div><div class="cl-thread-list">${active.length ? active.map(runnerCallRow).join("") : `<div class="cl-empty small"><span>Активных звонков нет.</span></div>`}</div>${archive.length ? `<div class="cl-archive-block phone"><button class="cl-archive-toggle" data-action="toggle-runner-call-archive"><span>История</span><b>${archive.length}</b><i>${state.showRunnerCallArchive ? "⌃" : "⌄"}</i></button>${state.showRunnerCallArchive ? `<div class="cl-thread-list archive">${archive.map(runnerCallRow).join("")}</div>` : ""}</div>` : ""}</section>`;
  }
  function runnerJobCard(j) {
    return `<button class="cl-job-card ${esc(j.status)}" data-action="open-job" data-id="${esc(j.id)}" data-context-kind="runner-job" data-context-id="${esc(j.id)}"><div class="cl-job-top"><div class="cl-fixer-strip">${j.fixerImage ? `<img src="${esc(j.fixerImage)}">` : `<span class="cl-fixer-glyph">◆</span>`}<div><small>ЗАКАЗЧИК // FIXER</small><strong>${esc(j.fixerName || "Неизвестный фиксер")}</strong></div></div><span class="cl-status ${esc(j.status)}">${esc(jobStatusLabel(j.status))}</span></div><h3>${esc(j.title)}</h3><p>${short(j.summary, 150)}</p><div class="cl-job-bottom"><span class="cl-risk">${"●".repeat(j.risk)}${"○".repeat(5 - j.risk)}</span><b>${esc(j.pay || "—")} ${esc(j.currency)}</b></div></button>`;
  }
  function runnerJobsView(data) {
    if (!data) return noNetworkView();
    const jobs = [...data.jobs].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      ),
      active = jobs.filter((j) => ["available", "accepted"].includes(j.status)),
      archive = jobs.filter(
        (j) => !["available", "accepted"].includes(j.status),
      );
    return `<section class="cl-phone-page"><div class="cl-phone-title"><h2>FIXER.NET</h2><span>${active.filter((j) => j.status === "available").length} доступно</span></div><div class="cl-job-list">${active.length ? active.map(runnerJobCard).join("") : `<div class="cl-empty small"><span>Активных контрактов нет.</span></div>`}</div>${archive.length ? `<div class="cl-archive-block phone"><button class="cl-archive-toggle" data-action="toggle-runner-job-archive"><span>Архив контрактов</span><b>${archive.length}</b><i>${state.showRunnerJobArchive ? "⌃" : "⌄"}</i></button>${state.showRunnerJobArchive ? `<div class="cl-job-list archive">${archive.map(runnerJobCard).join("")}</div>` : ""}</div>` : ""}</section>`;
  }
  function runnerCrewRoster(data) {
    const fallback = (data?.memberActorIds || []).map((actorId) => {
      const a = actorById(actorId);
      return {
        actorId,
        name: text(a?.name) || "Actor",
        image: actorImage(a),
        leader: actorId === text(data?.leaderActorId),
      };
    });
    const roster = (
      data?.memberRoster?.length ? data.memberRoster : fallback
    ).filter((r) => r.actorId && r.actorId !== currentRunnerActorId());
    return roster;
  }
  function runnerContactsView(data) {
    if (!data) return noNetworkView();
    const crew = runnerCrewRoster(data),
      contacts = data.contacts || [],
      total = crew.length + contacts.length;
    const crewHtml = crew.length
      ? `<section class="cl-contact-section"><header><div><small>CREW DIRECTORY</small><h3>Команда</h3></div><span>${crew.length}</span></header><div class="cl-contact-list" data-search-list="runner-contact">${crew.map((r) => `<button class="cl-contact-row cl-crew-row" data-search-text="${esc(normalize(r.name))}" data-action="open-crew-member" data-actor="${esc(r.actorId)}" data-context-kind="crew-member" data-context-actor="${esc(r.actorId)}"><div class="cl-avatar">${r.image ? `<img src="${esc(r.image)}">` : "?"}</div><div class="cl-contact-copy"><small class="cl-contact-kicker">${r.leader ? "★ ЛИДЕР КОМАНДЫ" : "УЧАСТНИК ГРУППЫ"}</small><strong class="cl-contact-name">${esc(r.name)}</strong><span class="cl-contact-sub">${esc(data.groupName || "COMM-LINK crew")}</span></div><b class="cl-contact-arrow">›</b></button>`).join("")}</div></section>`
      : `<section class="cl-contact-section muted-section"><header><div><small>CREW DIRECTORY</small><h3>Команда</h3></div><span>0</span></header><div class="cl-empty small"><span>Других участников в этой группе пока нет.</span></div></section>`;
    const contactHtml = `<section class="cl-contact-section"><header><div><small>ADDRESS BOOK</small><h3>Контакты сети</h3></div><div class="cl-phone-title-actions"><span>${contacts.length}</span><button class="cl-phone-add" data-action="runner-new-contact" title="Добавить контакт">＋</button></div></header><div class="cl-contact-list" data-search-list="runner-contact">${
      contacts.length
        ? contacts
            .map(
              (c) =>
                `<button class="cl-contact-row" data-search-text="${esc(normalize([c.name, c.handle, c.summary, ...(c.tags || [])].join(" ")))}" data-action="open-contact" data-id="${esc(c.id)}" data-context-kind="runner-contact" data-context-id="${esc(c.id)}" title="Открыть контакт: ${esc(c.name)}"><div class="cl-avatar">${c.image ? `<img src="${esc(c.image)}">` : "?"}</div><div class="cl-contact-copy"><small class="cl-contact-kicker">${c.source === "player" ? "ДОБАВЛЕН ИГРОКОМ" : "СЕТЕВОЙ КОНТАКТ"}</small><strong class="cl-contact-name">${esc(c.name || "Без имени")}</strong><span class="cl-contact-sub">${esc(c.handle || c.summary || "Контакт сети")}</span><div class="cl-mini-tags">${c.tags
                  .slice(0, 4)
                  .map((t) => `<i>#${esc(t)}</i>`)
                  .join(
                    "",
                  )}${c.tags.length > 4 ? `<i>+${c.tags.length - 4}</i>` : ""}</div></div><b class="cl-contact-arrow">›</b></button>`,
            )
            .join("")
        : `<div class="cl-empty"><b>Адресная книга пуста</b><span>Участники команды уже показаны выше автоматически. Здесь хранятся фикcеры, знакомые, корпораты и другие внешние контакты.</span><button class="primary" data-action="runner-new-contact">＋ Добавить контакт</button></div>`
    }</div></section>`;
    return `<section class="cl-phone-page"><div class="cl-phone-title"><h2>Контакты</h2><div class="cl-phone-title-actions"><span>${total}</span><button class="cl-phone-add" data-action="runner-new-contact" title="Добавить контакт">＋</button></div></div><div class="cl-contact-toolstrip"><span>ПКМ по записи — быстрые действия</span><b>${esc(data.groupName || "Группа")}</b></div>${total ? `<div class="cl-contact-search phone"><span>⌕</span><input data-search-kind="runner-contact" value="${esc(state.runnerContactSearch)}" placeholder="Поиск по команде и контактам…"></div>` : ""}${crewHtml}${contactHtml}</section>`;
  }

  function noNetworkView() {
    const actor = currentRunnerActor();
    if (state.runnerActorId && !actor)
      return '<section class="cl-phone-page"><div class="cl-empty network"><b>ACTOR НЕДОСТУПЕН</b><span>Доступ к выбранному персонажу изменился. Выберите доступного Actor в Агенте.</span></div></section>';
    return `<section class="cl-phone-page"><div class="cl-empty network"><b>NO NETWORK</b><span>Actor «${esc(actor?.name || "не выбран")}» пока не состоит в группе COMM-LINK. GM может добавить его в команду.</span></div></section>`;
  }

  function skinLabel(id) {
    return SKINS.find((s) => s.id === id)?.label || "Night City Cyan";
  }
  function loginView() {
    const isMaster = userCanMaster();
    const options = isMaster
        ? []
        : runnerActorOptions().filter(
            (actor) => actor.id === currentRunnerActorId(),
          ),
      currentId = currentRunnerActorId();
    const masterCard = isMaster
      ? `<button class="cl-login-card cl-login-master" data-action="login-master"><span class="cl-login-master-core">◆</span><span class="cl-login-copy"><small>MASTER // ADMIN NODE</small><strong>MASTER</strong><em>Единый профиль управления COMM-LINK. Actor выбирается уже внутри консоли.</em><span class="cl-login-skin">ROLE VERIFIED · NO SECONDARY PIN</span></span><b>Подключиться →</b></button>`
      : "";
    const actorCards = !isMaster
      ? options.length
        ? options
            .map((actor) => {
              const p = profileForActor(actor),
                groups = [...state.groupData.values()]
                  .filter((g) => (g.memberActorIds || []).includes(actor.id))
                  .map((g) => g.groupName),
                groupText = groups.length
                  ? groups.join(" · ")
                  : "Нет назначенной команды";
              return `<button class="cl-login-card cl-login-runner skin-${esc(p.skin)} ${actor.id === currentId ? "selected" : ""}" data-action="login-runner-actor" data-actor="${esc(actor.id)}"><span class="cl-login-avatar">${p.image ? `<img src="${esc(p.image)}">` : "?"}</span><span class="cl-login-copy"><small>EDGERUNNER // ACTOR</small><strong>${esc(actor.name)}</strong><em>${esc(groupText)}</em><span class="cl-login-skin">${esc(skinLabel(p.skin))}${p.pinHash ? " · PIN 🔒" : ""}</span></span><b>Войти →</b></button>`;
            })
            .join("")
        : `<div class="cl-empty"><b>Нет доступных Actor</b><span>Назначьте персонажа пользователю или выдайте ему OWNER-права на Actor.</span></div>`
      : "";
    return `<div class="cl-login-shell"><section class="cl-login-screen"><div class="cl-login-content"><div class="cl-login-profiles ${isMaster ? "cl-login-gm-only" : ""}">${masterCard}${actorCards}</div><div class="cl-login-foot"><span>${isMaster ? "MASTER доступ подтверждён ролью Foundry. Персонажи не являются отдельными профилями GM — переключайте Actor внутри консоли." : "Профиль, история и доступ к группе привязаны к выбранному в Агенте персонажу."}</span></div></div></section></div>`;
  }

  function masterView() {
    const body = (
      {
        network: masterNetworkView,
        groups: masterGroupsView,
        contacts: masterContactsView,
        messages: masterMessagesView,
        calls: masterCallsView,
        jobs: masterJobsView,
      }[state.masterTab] || masterNetworkView
    )();
    return `<div class="cl-master-shell">${fxAccessories("master")}<div class="cl-screen">${masterHeader()}<div class="cl-master-body">${masterNav()}<main>${body}</main></div></div></div>`;
  }
  function runnerView() {
    const data = currentRunnerData();
    const body = (
      {
        home: runnerHomeView,
        messages: runnerMessagesView,
        calls: runnerCallsView,
        jobs: runnerJobsView,
        contacts: runnerContactsView,
      }[state.runnerTab] || runnerHomeView
    )(data);
    return `<div class="cl-phone-shell">${fxAccessories("runner")}<div class="cl-phone-screen">${runnerHeader()}${runnerActiveCallBar(data)}<main>${body}</main>${runnerNav()}</div></div>`;
  }

  function fxSettingsModal(m) {
    const toggle = (bind, label, note, checked) =>
      `<label class="cl-fx-toggle"><input type="checkbox" data-bind="${bind}" ${checked ? "checked" : ""}><span><b>${label}</b><small>${note}</small></span><i></i></label>`;
    return modalShell(
      "COMM-LINK // FX CONTROL",
      `<div class="cl-fx-settings-head"><div><small>VISUAL HARDWARE BUS</small><h3>Эффекты и аксессуары</h3><p>Все постоянные сканирующие полосы убраны. Движение теперь короткое и событийное — только при сообщениях, звонках, заказах и синхронизации.</p></div><span class="cl-fx-master-state ${m.fxEnabled !== false ? "on" : "off"}">${m.fxEnabled !== false ? "FX ONLINE" : "FX OFFLINE"}</span></div><div class="cl-fx-presets"><button data-action="fx-preset" data-preset="off">OFF</button><button data-action="fx-preset" data-preset="quiet">QUIET</button><button data-action="fx-preset" data-preset="balanced">BALANCED</button><button data-action="fx-preset" data-preset="showcase">SHOWCASE</button></div>${toggle("fx-enabled", "Главный выключатель", "Полностью отключает декоративный FX-слой, не затрагивая функциональность COMM-LINK.", m.fxEnabled !== false)}<div class="cl-field"><label>Интенсивность</label><select data-bind="fx-intensity"><option value="quiet" ${m.fxIntensity === "quiet" ? "selected" : ""}>Quiet — почти статично</option><option value="balanced" ${m.fxIntensity === "balanced" ? "selected" : ""}>Balanced — стандарт</option><option value="showcase" ${m.fxIntensity === "showcase" ? "selected" : ""}>Showcase — заметнее</option></select></div><div class="cl-fx-toggle-grid">${toggle("fx-decor", "Аппаратный декор", "Винты, вентиляция, маркировки корпуса и DATA-SHARD оформление.", m.fxDecor !== false)}${toggle("fx-status", "STATUS RAIL", "NET / SECURE / RELAY / RX-TX и выбранная идентичность.", m.fxStatusRail !== false)}${toggle("fx-circuits", "Схемные дорожки", "Короткие импульсы по рамке только в момент события.", m.fxCircuits !== false)}${toggle("fx-osc", "Мини-осциллограф", "Диагностическая волна; оживает только при сетевом событии.", m.fxOscillator !== false)}${toggle("fx-micro", "Технические подписи", "Серийники, ревизия, локальная mesh-маркировка и контрактные штампы.", m.fxMicrocopy !== false)}${toggle("fx-hover", "Микродвижения", "Небольшое физическое движение кнопок/карточек при наведении и нажатии.", m.fxHover !== false)}${toggle("fx-events", "Событийные импульсы", "RX/TX, дорожки и краткий сигнал при сообщении, заказе, выплате или sync.", m.fxEvents !== false)}${toggle("fx-call", "Индикация звонка", "Боковые LED и осциллограф реагируют на активный вызов.", m.fxCall !== false)}${toggle("fx-glitch", "Короткий glitch", "Небольшой сбой заголовка только в момент события; по умолчанию выключен.", m.fxGlitch === true)}</div><p class="cl-modal-hint">Настройки MASTER сохраняются для GM. Настройки EDGERUNNER сохраняются отдельно для текущего Actor. При системной настройке «уменьшить движение» все анимации автоматически замораживаются.</p>`,
      `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-fx-settings">Сохранить FX</button>`,
    );
  }

  function diagnosticsModal() {
    const r = state.diagReport;
    if (!r)
      return modalShell(
        "COMM-LINK // SYS DIAGNOSTICS",
        `<div class="cl-diag-empty">Отчёт ещё не создан.</div>`,
        `<button data-action="modal-close">Закрыть</button><button class="primary" data-action="diag-rerun">Запустить</button>`,
      );
    const sev = (x) =>
      `<span class="cl-diag-sev ${esc(x.level)}">${x.level === "error" ? "CRIT" : x.level === "warn" ? "WARN" : "INFO"}</span>`;
    const perfCard = (label, avg, max, count) =>
      `<div class="cl-diag-metric"><small>${label}</small><b>${Number(avg || 0).toFixed(1)} ms</b><span>MAX ${Number(max || 0).toFixed(1)} · ${count || 0}×</span></div>`;
    const mem = r.summary.memory?.used
      ? `<div class="cl-diag-metric"><small>JS HEAP</small><b>${formatBytes(r.summary.memory.used)}</b><span>browser estimate</span></div>`
      : "";
    const issues = r.issues.length
      ? r.issues
          .map(
            (x) =>
              `<div class="cl-diag-issue ${esc(x.level)}">${sev(x)}<div><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></div></div>`,
          )
          .join("")
      : `<div class="cl-diag-ok"><b>✓ Критичных проблем не найдено</b><span>Продолжайте смотреть на MAX render и рост размера Journal во время длинных сессий.</span></div>`;
    const benches = r.benchmarks?.length
      ? `<section class="cl-diag-section"><header><small>LOCAL BENCHMARK</small><b>Прогон функций без запросов к серверу</b></header><div class="cl-diag-bench">${r.benchmarks.map((b) => `<div><span>${esc(b.name)}</span><b>${b.avg.toFixed(2)} ms</b><small>max ${b.max.toFixed(2)} · ${b.runs}×</small></div>`).join("")}</div></section>`
      : "";
    const errors = r.errors.length
      ? `<section class="cl-diag-section"><header><small>ERROR RING BUFFER</small><b>Последние ошибки COMM-LINK</b></header><div class="cl-diag-errors">${r.errors
          .slice(0, 8)
          .map(
            (e) =>
              `<div><small>${new Date(e.at).toLocaleTimeString("ru-RU")}</small><b>${esc(e.scope)}</b><span>${esc(e.message)}</span></div>`,
          )
          .join("")}</div></section>`
      : "";
    const top = r.metrics.topActions?.length
      ? `<section class="cl-diag-section"><header><small>ACTION PROFILER</small><b>Самые тяжёлые действия этой сессии</b></header><div class="cl-diag-action-list">${r.metrics.topActions
          .slice(0, 6)
          .map(
            (a) =>
              `<div><b>${esc(a.name)}</b><span>AVG ${a.avg.toFixed(1)} ms</span><span>MAX ${a.max.toFixed(1)} ms</span><small>${a.count}×</small></div>`,
          )
          .join("")}</div></section>`
      : "";
    return modalShell(
      "COMM-LINK // SYS DIAGNOSTICS",
      `<div class="cl-diag-hero score-${r.score >= 85 ? "good" : r.score >= 65 ? "warn" : "bad"}"><div class="cl-diag-score"><strong>${r.score}</strong><small>/100</small></div><div><small>SELF TEST // ${r.deep ? "DEEP" : "QUICK"}</small><h3>${r.score >= 85 ? "Система в норме" : r.score >= 65 ? "Есть точки для оптимизации" : "Найдены тяжёлые/ошибочные места"}</h3><p>Тест занял ${r.scanMs.toFixed(1)} ms. Сервер не опрашивается: deep-прогон выполняет только локальные функции и DOM-операции.</p></div></div><div class="cl-diag-grid">${perfCard("RENDER", r.metrics.renderAvg, r.metrics.renderMax, diagState.perf.render.count)}${perfCard("FULL REFRESH", r.metrics.refreshAvg, r.metrics.refreshMax, diagState.perf.refreshData.count)}${perfCard("LIVE REFRESH", r.metrics.liveAvg, r.metrics.liveMax, diagState.perf.liveRefresh.count)}<div class="cl-diag-metric"><small>NETWORK FLAGS</small><b>${formatBytes(r.summary.payloadBytes)}</b><span>${r.summary.groups} group · ${r.summary.totalItems} items</span></div><div class="cl-diag-metric"><small>DOM</small><b>${r.summary.domNodes}</b><span>${r.summary.actionNodes} action nodes</span></div><div class="cl-diag-metric"><small>HOOK BUS</small><b>${r.metrics.hookSignals}</b><span>${r.metrics.coalescedSignals} coalesced</span></div>${mem}</div><section class="cl-diag-section"><header><small>OPTIMIZATION FINDINGS</small><b>Что сейчас стоит внимания</b></header><div class="cl-diag-issues">${issues}</div></section>${top}${benches}${errors}<div class="cl-diag-footnote"><b>WRITE COUNTER</b><span>CONTROL ${r.metrics.writes.control} · GROUP ${r.metrics.writes.group} · REPAIR ${r.metrics.writes.repair}</span><small>Счётчики показывают записи документов только с момента запуска этого макроса.</small></div>`,
      `<button data-action="diag-copy">⎘ Копировать отчёт</button><button data-action="diag-clear">Сбросить счётчики</button><button data-action="diag-rerun">↻ Быстрый тест</button><button class="primary" data-action="diag-deep">⚙ Глубокий локальный прогон</button>`,
    );
  }

  function renderModal() {
    const m = state.modal;
    if (!m) return "";
    if (m.type === "diagnostics") return diagnosticsModal();
    if (m.type === "fx-settings") return fxSettingsModal(m);
    if (m.type === "master-sender") return masterSenderModal(m);
    if (m.type === "actor-contact-picker") return actorContactPickerModal(m);
    if (m.type === "job-settlement") return jobSettlementModal(m);
    if (m.type === "group-name")
      return modalShell(
        "Новая группа",
        `<div class="cl-field"><label>Название группы</label><input data-bind="group-name" value="${esc(m.name || "")}" autofocus placeholder="Команда A"></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-group-name">Создать</button>`,
      );
    if (m.type === "rename-group")
      return modalShell(
        "Переименовать группу",
        `<div class="cl-field"><label>Название</label><input data-bind="group-name" value="${esc(m.name || "")}" autofocus></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-rename-group">Сохранить</button>`,
      );
    if (m.type === "runner-login-pin")
      return modalShell(
        "Вход EDGERUNNER",
        `<div class="cl-pin-panel runner"><div class="cl-pin-lock"><span class="cl-css-lock big" aria-hidden="true"></span></div><div><b>${esc(runnerProfile().displayName)}</b><p>Профиль защищён PIN-кодом.</p></div></div><div class="cl-field"><label>PIN профиля</label><input type="password" inputmode="numeric" autocomplete="off" maxlength="8" data-bind="runner-login-pin" value="${esc(m.pin || "")}" placeholder="••••" autofocus></div>${m.error ? `<div class="cl-inline-warning">${esc(m.error)}</div>` : ""}`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="unlock-runner-login">Войти</button>`,
      );
    if (m.type === "runner-profile")
      return modalShell(
        "COMM-LINK профиль",
        `<div class="cl-profile-editor"><div class="cl-profile-mark">◉</div><div><b>EDGERUNNER профиль</b><p>Настройки принадлежат выбранному Actor. Другой персонаж этого же пользователя получит отдельный профиль, историю и сеть.</p></div></div><div class="cl-grid2"><div class="cl-field"><label>Ваш ник</label><input data-bind="runner-profile-name" value="${esc(m.profileName || "")}" placeholder="Edgerunner / позывной" autofocus></div><div class="cl-field"><label>Аватар профиля</label><input data-bind="runner-profile-image" value="${esc(m.profileImage || "")}" placeholder="путь к изображению"></div></div><div class="cl-field"><label>Визуальный профиль</label><div class="cl-skin-grid">${SKINS.map((s) => `<button type="button" class="cl-skin-card skin-${esc(s.id)} ${m.skin === s.id ? "on" : ""}" data-action="select-skin" data-skin="${esc(s.id)}"><span class="cl-skin-swatch"><i></i><i></i><i></i></span><b>${esc(s.label)}</b><small>${esc(s.note)}</small></button>`).join("")}</div></div><div class="cl-profile-options"><label><input type="checkbox" data-bind="runner-profile-sound" ${m.soundEnabled !== false ? "checked" : ""}> Звуки сообщений, звонков, заказов и выплат</label><label class="cl-volume">Громкость <input type="range" min="0.2" max="1" step="0.1" data-bind="runner-profile-volume" value="${esc(m.soundVolume ?? 0.75)}"></label><label><input type="checkbox" data-bind="runner-profile-background" ${m.backgroundNotifications !== false ? "checked" : ""}> Фоновые уведомления Foundry после закрытия окна COMM-LINK</label><small class="cl-background-note">Работает без опроса сервера: COMM-LINK ждёт только штатные события изменения своей сети. Служба запускается вместе с модулем и реагирует на изменения сети.</small></div><div class="cl-profile-security"><label><input type="checkbox" data-bind="runner-profile-pin-enabled" ${m.pinEnabled ? "checked" : ""}> Защищать вход PIN-кодом</label><div class="cl-field"><label>${m.pinEnabled && m.hasPin ? "Новый PIN (пусто = оставить текущий)" : "PIN 4–8 цифр"}</label><input type="password" inputmode="numeric" maxlength="8" data-bind="runner-profile-new-pin" value="${esc(m.newPin || "")}" placeholder="••••"></div></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-runner-profile">Сохранить</button>`,
      );
    if (m.type === "group-dashboard") return groupDashboardModal(m);
    if (m.type === "group-actor-picker") return groupActorPickerModal(m);
    if (m.type === "contact")
      return modalShell(
        "Опубликовать контакт",
        `${audiencePicker(m.audience, "contact")}<div class="cl-source-buttons">${selectedTokenButton()}<button type="button" class="cl-token-import actor" data-action="open-actor-contact-picker"><span>⌕</span><b>Найти Actor по имени</b><small>Токен на сцене не нужен</small></button></div><div class="cl-contact-import-preview">${m.image ? `<img src="${esc(m.image)}">` : `<span>◉</span>`}<div><b>${esc(m.name || "Новый контакт")}</b><small>Имя и токен можно взять со сцены одним нажатием</small></div></div><div class="cl-grid2"><div class="cl-field"><label>Имя</label><input data-bind="contact-name" value="${esc(m.name || "")}" placeholder="Сьюзи Q"></div><div class="cl-field"><label>Позывной / номер</label><input data-bind="contact-handle" value="${esc(m.handle || "")}" placeholder="@susie-q"></div></div><div class="cl-field"><label>Изображение / токен</label><input data-bind="contact-image" value="${esc(m.image || "")}" placeholder="Заполнится из выбранного токена или DATAPAD"></div><div class="cl-field"><label>Теги</label><input data-bind="contact-tags" value="${esc((m.tags || []).join(", "))}" placeholder="фиксер, Watson"></div><div class="cl-field"><label>Быстрая сводка</label><textarea data-bind="contact-summary">${esc(m.summary || "")}</textarea></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="publish-contact" ${m.audienceSelected?.length ? "" : "disabled"}>Опубликовать</button>`,
      );
    if (m.type === "runner-contact")
      return modalShell(
        m.id ? "Редактировать контакт" : "Новый контакт",
        `${selectedTokenButton()}<div class="cl-grid2"><div class="cl-field"><label>Имя</label><input data-bind="contact-name" value="${esc(m.name || "")}" placeholder="Имя контакта" autofocus></div><div class="cl-field"><label>Позывной / номер</label><input data-bind="contact-handle" value="${esc(m.handle || "")}" placeholder="@handle"></div></div><div class="cl-field"><label>Изображение</label><input data-bind="contact-image" value="${esc(m.image || "")}" placeholder="путь к изображению"></div><div class="cl-field"><label>Теги</label><input data-bind="contact-tags" value="${esc(m.tagsRaw || "")}" placeholder="фиксер, знакомый"></div><div class="cl-field"><label>Краткая сводка</label><textarea data-bind="contact-summary">${esc(m.summary || "")}</textarea></div><p class="cl-modal-hint">${m.id ? "Изменения увидят участники текущей группы." : `Контакт добавится в текущую сеть группы от активного Actor «${esc(currentRunnerActor()?.name || "Edgerunner")}».`}</p>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-runner-contact">${m.id ? "Сохранить" : "Добавить контакт"}</button>`,
      );
    if (m.type === "runner-contact-compose")
      return runnerContactComposeModal(m);
    if (m.type === "crew-member") return crewMemberModal(m);
    if (m.type === "message")
      return modalShell(
        "Новое сообщение",
        `${audiencePicker(m.audience, "message")}${senderPublicationPanel(m, "message")}<div class="cl-field cl-sender-field"><label>Отображаемое имя</label><input data-bind="message-sender" value="${esc(m.senderName || "")}" placeholder="Wakako / UNKNOWN / любое имя"></div>${contactSelector(m.contactId, "message-contact", "Связать с контактом")}<div class="cl-field"><label>Сообщение</label><textarea data-bind="message-body" class="large" autofocus>${esc(m.body || "")}</textarea></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="publish-message" ${m.audienceSelected?.length ? "" : "disabled"}>Отправить в сеть</button>`,
      );
    if (m.type === "call")
      return modalShell(
        "Входящий звонок",
        `${audiencePicker(m.audience, "call")}${senderPublicationPanel(m, "call")}<div class="cl-field cl-sender-field"><label>Отображаемое имя / номер</label><input data-bind="call-name" value="${esc(m.name || "")}" placeholder="Wakako / PRIVATE CALLER"></div>${contactSelector(m.contactId, "call-contact", "Связать с контактом")}<div class="cl-field"><label>Короткая подпись</label><input data-bind="call-note" value="${esc(m.note || "")}" placeholder="Есть работа. Срочно."></div>`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="publish-call" ${m.audienceSelected?.length ? "" : "disabled"}>Запустить звонок</button>`,
      );
    if (m.type === "job")
      return modalShell(
        "Заказ фиксера",
        `${audiencePicker(m.audience, "job")}${senderPublicationPanel(m, "job")}<div class="cl-grid2"><div class="cl-field cl-sender-field"><label>Отображаемое имя фиксера</label><input data-bind="job-fixer-name" value="${esc(m.fixerName || "")}" placeholder="Wakako / ANONYMOUS FIXER"></div><div class="cl-field"><label>Название заказа</label><input data-bind="job-title" value="${esc(m.title || "")}" placeholder="Перехват груза"></div></div>${contactSelector(m.fixerId, "job-fixer", "Аватар фиксера из контактов")}<div class="cl-field"><label>Коротко</label><input data-bind="job-summary" value="${esc(m.summary || "")}" placeholder="Украсть контейнер до рассвета"></div><div class="cl-field"><label>Подробности</label><textarea data-bind="job-details" class="large">${esc(m.details || "")}</textarea></div><div class="cl-grid4"><div class="cl-field"><label>Оплата</label><input data-bind="job-pay" value="${esc(m.pay || "")}" placeholder="7500"></div><div class="cl-field"><label>Валюта</label><input data-bind="job-currency" value="${esc(m.currency || "Credits")}"></div><div class="cl-field"><label>Риск 1–5</label><input type="number" min="1" max="5" data-bind="job-risk" value="${esc(m.risk || 3)}"></div><div class="cl-field"><label>Срок</label><input data-bind="job-deadline" value="${esc(m.deadline || "")}" placeholder="Сегодня, 23:00"></div></div>${jobMapPointSelector(m.cityMarkerId, "job-city-marker")}`,
        `<button data-action="modal-close">Отмена</button><button class="primary" data-action="publish-job" ${m.audienceSelected?.length ? "" : "disabled"}>Опубликовать контракт</button>`,
      );
    if (m.type === "thread") return threadModal(m);
    if (m.type === "master-thread") return masterThreadModal(m);
    if (m.type === "message-edit") return masterMessageEditModal(m);
    if (m.type === "master-job") return masterJobModal(m);
    if (m.type === "master-call") return masterCallModal(m);
    if (m.type === "master-contact") return masterContactModal(m);
    if (m.type === "job-view") return jobModal(m);
    if (m.type === "call-view") return callModal(m);
    if (m.type === "contact-view") return contactModal(m);
    if (m.type === "datapad-import") return datapadImportModal(m);
    return "";
  }

  function modalShell(title, body, actions = "") {
    const type =
      text(state.modal?.type).replace(/[^a-z0-9-]/gi, "") || "generic";
    return `<div class="cl-modal-backdrop cl-modal-backdrop-${type}"><section class="cl-modal cl-modal-${type}"><header><h2>${esc(title)}</h2><button data-action="modal-close" title="Закрыть">×</button></header><div class="cl-modal-body">${body}</div>${actions ? `<footer>${actions}</footer>` : ""}</section></div>`;
  }
  function allMasterContacts() {
    const map = new Map();
    for (const c of [
      ...sharedMasterContacts(),
      ...(state.control.contactTemplates || []),
      ...[...state.groupData.values()].flatMap((g) => g.contacts || []),
    ])
      if (c.id && c.source !== "player" && !map.has(c.id)) map.set(c.id, c);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  function contactSelector(selected, bind, label = "Связать с контактом") {
    const list = allMasterContacts();
    return `<div class="cl-field"><label>${esc(label)} <small>(необязательно)</small></label><select data-bind="${bind}"><option value="">— без контакта —</option>${list.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><small>Это связывает публикацию с адресной книгой. Профиль отправителя MASTER выбирается отдельно.</small></div>`;
  }
  function senderPublicationPanel(m, _kind) {
    const p = {
      actorId: text(m.senderActorId),
      name: text(m.actualSenderName) || masterSenderProfile().name,
      image: text(m.senderImage) || masterSenderProfile().image,
    };
    const visible = m.identityVisible !== false;
    return `<section class="cl-sender-publication ${visible ? "visible" : "hidden-id"}"><div class="cl-sender-avatar">${p.image ? `<img src="${esc(p.image)}">` : `<span>◉</span>`}</div><div><small>MASTER PROFILE</small><b>${esc(p.name)}</b><span>${visible ? "Игрок увидит имя и аватар" : "Игрок увидит скрытый контакт"}</span></div><label class="cl-identity-toggle"><input type="checkbox" data-bind="publish-identity-visible" ${visible ? "checked" : ""}><i></i><em>Показывать личность</em></label><button type="button" data-action="master-sender">Сменить</button></section>`;
  }
  function masterSenderModal(_m) {
    const current = masterSenderProfile(),
      list = masterActorRows();
    return modalShell(
      "Профиль отправителя MASTER",
      `<div class="cl-sender-hero"><div class="cl-avatar big">${current.image ? `<img src="${esc(current.image)}">` : `◉`}</div><div><small>ТЕКУЩИЙ ПРОФИЛЬ</small><h3>${esc(current.name)}</h3><p>Новые сообщения, звонки и заказы автоматически начинают с этого профиля. В каждой публикации личность можно скрыть.</p></div></div><div class="cl-contact-search"><span>⌕</span><input data-search-kind="master-actor" value="${esc(state.masterSenderSearch)}" placeholder="Найти Actor по имени…"></div><div class="cl-actor-grid" data-search-list="master-actor">${list.map((a) => `<button data-search-text="${esc(normalize(a.name))}" data-action="select-master-sender-actor" data-actor="${esc(a.id)}">${actorImage(a) ? `<img src="${esc(actorImage(a))}">` : `<span>◉</span>`}<b>${esc(a.name)}</b><small>${esc(a.type || "Actor")}</small></button>`).join("")}</div><div class="cl-grid2"><div class="cl-field"><label>Ручное имя</label><input data-bind="master-sender-manual-name" value="${esc(state.control.masterSender?.manualName || "")}" placeholder="UNKNOWN / Wakako"></div><div class="cl-field"><label>Ручной арт</label><input data-bind="master-sender-manual-image" value="${esc(state.control.masterSender?.manualImage || "")}" placeholder="путь к изображению"></div></div><label class="cl-master-default-visible"><input type="checkbox" data-bind="master-sender-visible" ${state.control.masterSender?.identityVisible !== false ? "checked" : ""}> По умолчанию показывать личность игрокам</label>`,
      `<button data-action="clear-master-sender">Ручной профиль</button><button data-action="modal-close">Готово</button>`,
    );
  }
  function actorContactPickerModal(m) {
    const list = masterActorRows();
    return modalShell(
      "Добавить контакт из Actor Directory",
      `${audiencePicker(m.audienceSelected || [], "contact")}<div class="cl-contact-search"><span>⌕</span><input data-search-kind="actor-picker" value="${esc(state.actorSearch)}" placeholder="Имя Actor…" autofocus></div><div class="cl-actor-grid" data-search-list="actor-picker">${list.map((a) => `<button data-search-text="${esc(normalize(a.name))}" data-action="pick-actor-contact" data-actor="${esc(a.id)}">${actorImage(a) ? `<img src="${esc(actorImage(a))}">` : `<span>◉</span>`}<b>${esc(a.name)}</b><small>${esc(a.type || "Actor")}</small></button>`).join("")}</div>`,
      `<button data-action="modal-close">Отмена</button>`,
    );
  }
  function settlementLiveHtml(m) {
    const members = settlementMembers(m.groupId),
      total = settlementTotal(m),
      shares = splitShares(total, members);
    const base = Math.max(0, Number(m.basePay) || 0),
      pct = Math.max(0, Number(m.percent) || 0),
      bonus = Number(m.bonus) || 0,
      penalty = Math.max(0, Number(m.penalty) || 0),
      percentPart = Math.round((base * pct) / 100);
    return `<div class="cl-settlement-total"><span>ИТОГОВЫЙ ФОНД</span><b>${formatCredits(total)} Credits</b><small>${formatCredits(base)} × ${pct}% = ${formatCredits(percentPart)} · +${formatCredits(bonus)} · −${formatCredits(penalty)} · делится между ${members.length} Actor</small></div><div class="cl-payout-list">${
      members.length
        ? members
            .map((x) => {
              const sh = shares.find((s) => s.actorId === x.actorId),
                projected =
                  x.ready && sh ? Number(x.balance || 0) + sh.amount : null;
              return `<article class="${x.ready ? "ready" : "warning"}"><span>${x.ready ? "✓" : "!"}</span><div><b>${esc(x.actorName)}</b><small>${x.ready ? `${formatCredits(x.balance || 0)} → ${formatCredits(projected)} Credits · ${esc(x.currencyPath)}` : "Не найден способ начисления Credits"}</small></div><strong>${sh ? `+${formatCredits(sh.amount)} cr` : `—`}</strong></article>`;
            })
            .join("")
        : `<div class="cl-inline-warning">В группе нет Actor.</div>`
    }</div>`;
  }
  function jobSettlementModal(m) {
    const members = settlementMembers(m.groupId),
      shares = splitShares(settlementTotal(m), members),
      j = state.groupData.get(m.groupId)?.jobs.find((x) => x.id === m.id);
    return modalShell(
      `${m.outcome === "completed" ? "Выполнить" : "Провалить"} заказ`,
      `<div class="cl-settlement-head"><div><small>${esc(groupNameById(m.groupId))}</small><h3>${esc(j?.title || "Контракт")}</h3></div><span class="cl-status ${esc(m.outcome)}">${esc(jobStatusLabel(m.outcome))}</span></div><div class="cl-grid4 cl-settlement-grid"><div class="cl-field"><label>База</label><input type="number" data-bind="settle-base" value="${esc(m.basePay)}"></div><div class="cl-field"><label>Выплата от базы %</label><input type="number" min="0" data-bind="settle-percent" value="${esc(m.percent)}"></div><div class="cl-field"><label>Надбавка Credits</label><input type="number" data-bind="settle-bonus" value="${esc(m.bonus)}"></div><div class="cl-field"><label>Штраф Credits</label><input type="number" min="0" data-bind="settle-penalty" value="${esc(m.penalty)}"></div></div><div data-settlement-live>${settlementLiveHtml(m)}</div><div class="cl-field"><label>Комментарий к расчёту</label><input data-bind="settle-note" value="${esc(m.note || "")}" placeholder="Премия за скорость, штраф за повреждения…"></div>${j?.settlement?.paidAt ? `<div class="cl-inline-warning">Эта выплата уже проведена ${formatDate(j.settlement.paidAt)}. Повторное начисление заблокировано.</div>` : ""}`,
      `<button data-action="modal-close">Отмена</button><button data-action="confirm-job-status-no-pay" data-group="${esc(m.groupId)}" data-id="${esc(m.id)}" data-status="${esc(m.outcome)}">Только статус</button><button class="primary green" data-action="confirm-job-settlement" ${j?.settlement?.paidAt || !shares.length || members.some((x) => !x.ready) ? "disabled" : ""}>✓ Статус + начислить Credits</button>`,
    );
  }

  function selectedTokenIdentity() {
    const token = globalThis.canvas?.tokens?.controlled?.[0] ?? null;
    if (!token) return null;
    const actor = token?.actor ?? token?.document?.actor ?? null;
    const document = token?.document ?? token;
    const name =
      text(token?.name || document?.name || actor?.name) || "Без имени";
    const actorImage = text(actor?.img);
    const tokenImage = text(document?.texture?.src ?? token?.texture?.src);
    return {
      actorId: text(actor?.id),
      name,
      actorImage,
      tokenImage,
      image: tokenImage || actorImage,
      actorUuid: text(actor?.uuid),
      tokenUuid: text(document?.uuid),
    };
  }
  function selectedTokenButton() {
    const id = selectedTokenIdentity();
    return `<button type="button" class="cl-token-import ${id ? "ready" : ""}" data-action="fill-contact-selected-token" ${id ? "" : "disabled"}>${id && id.image ? `<img src="${esc(id.image)}">` : `<span>◎</span>`}<b>${id ? `Взять выбранный токен: ${esc(id.name)}` : "Сначала выделите токен на сцене"}</b><small>${id ? "Имя и изображение заполнятся автоматически" : "COMM-LINK возьмёт только имя и арт"}</small></button>`;
  }

  function threadModal(m) {
    const data = currentRunnerData();
    const arr =
      data?.messages
        .filter((x) => x.threadId === m.threadId)
        .sort((a, b) =>
          String(a.createdAt).localeCompare(String(b.createdAt)),
        ) || [];
    const npc = arr.find((x) => x.sender !== "player"),
      base = arr[0],
      contactId = text(npc?.contactId) || text(base?.contactId);
    const title =
      text(npc?.senderName) ||
      contactName(data, contactId, text(base?.senderName) || "Диалог");
    return modalShell(
      title,
      `${isRunnerSimulation() ? `<div class="cl-sim-note">SIMULATION · ответы меняют только локальный предпросмотр</div>` : ""}<div class="cl-chat-log">${arr.map((x) => chatBubbleHtml(x, { contactImage: x.sender !== "player" ? x.image || data?.contacts?.find((c) => c.id === x.contactId)?.image || "" : "", fallbackName: title })).join("")}</div><div class="cl-reply"><textarea data-bind="reply-body" placeholder="Ответить…">${esc(m.reply || "")}</textarea><button class="primary" data-action="send-reply" data-thread="${esc(m.threadId)}">➤</button></div>`,
    );
  }
  function masterThreadModal(m) {
    const data = state.groupData.get(m.groupId);
    if (!data) return "";
    const arr = data.messages
      .filter((x) => x.threadId === m.threadId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const npc = arr.find((x) => x.sender !== "player"),
      base = arr[0],
      contactId = text(npc?.contactId) || text(base?.contactId);
    const title =
      text(npc?.senderName) ||
      contactName(data, contactId, text(base?.senderName) || "Диалог");
    const group = state.control.groups.find((g) => g.id === m.groupId);
    return modalShell(
      `${title} // ${group?.name || "Группа"}`,
      `<div class="cl-chat-log master">${arr
        .map((x) => {
          const bubble = chatBubbleHtml(x, {
            contactImage:
              x.sender !== "player"
                ? x.image ||
                  data?.contacts?.find((c) => c.id === x.contactId)?.image ||
                  ""
                : "",
            fallbackName: title,
          });
          return x.sender !== "player"
            ? bubble.replace(
                "</small>",
                ` <button class="cl-bubble-edit" data-action="edit-master-message" data-id="${esc(x.id)}" data-group="${esc(m.groupId)}">✎</button></small>`,
              )
            : bubble;
        })
        .join(
          "",
        )}</div><div class="cl-reply"><textarea data-bind="master-thread-reply" placeholder="Ответить группе от имени ${esc(title)}…">${esc(m.masterReply || "")}</textarea><button class="primary" data-action="send-master-reply" data-group="${esc(m.groupId)}" data-thread="${esc(m.threadId)}">➤</button></div>`,
      `<button data-action="modal-close">Закрыть</button>`,
    );
  }

  function groupActorPickerModal(m) {
    const g = groupById(m.groupId),
      existing = new Set(g?.actorIds || []),
      list = masterActorRows().filter((a) => !existing.has(a.id));
    return modalShell(
      `Добавить Actor: ${g?.name || "Группа"}`,
      `<div class="cl-contact-search"><span>⌕</span><input data-search-kind="group-actor" value="${esc(state.actorSearch)}" placeholder="Найти Actor по имени…" autofocus></div><div class="cl-actor-grid" data-search-list="group-actor">${
        list.length
          ? list
              .map(
                (a) =>
                  `<button data-search-text="${esc(normalize(a.name))}" data-action="add-group-actor" data-group="${esc(g?.id || m.groupId)}" data-actor="${esc(a.id)}">${actorImage(a) ? `<img src="${esc(actorImage(a))}">` : `<span>?</span>`}<b>${esc(a.name)}</b><small>${
                    actorControllerUserIds(a)
                      .map((id) => users().find((u) => u.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "Нет привязанного пользователя"
                  }</small></button>`,
              )
              .join("")
          : `<div class="cl-empty"><b>Все доступные Actor уже в группе</b></div>`
      }</div>`,
      `<button data-action="modal-close">Закрыть</button>`,
    );
  }
  function groupDashboardModal(m) {
    const group = groupById(m.id);
    if (!group) return "";
    const data =
      state.groupData.get(group.id) ?? blankNetworkData(group.id, group.name);
    const activeJobs = [...data.jobs]
      .filter((j) => ["available", "accepted"].includes(j.status))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const activeCalls = data.calls.filter((c) =>
      ["ringing", "accepted"].includes(c.status),
    );
    const recentEvents = [...(data.events || [])]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5);
    const recentThreads = (() => {
      const map = new Map();
      for (const msg of data.messages) {
        const cur = map.get(msg.threadId);
        if (!cur || String(msg.createdAt) > String(cur.createdAt))
          map.set(msg.threadId, msg);
      }
      return [...map.values()]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 4);
    })();
    const memberCards = (group.actorIds || [])
      .map((actorId) => {
        const actor = actorById(actorId),
          adapter = currencyAdapter(actor),
          leader = group.leaderActorId === actorId,
          owners = actorControllerUserIds(actor)
            .map((id) => users().find((u) => u.id === id)?.name)
            .filter(Boolean);
        return `<article class="cl-member-manage ${leader ? "leader" : ""}" data-context-kind="group-member" data-context-group="${esc(group.id)}" data-context-actor="${esc(actorId)}"><div class="cl-member-avatar">${actorImage(actor) ? `<img src="${esc(actorImage(actor))}">` : `<span>?</span>`}</div><div class="grow"><div class="cl-member-title"><b>${esc(actor?.name || "Actor удалён")}</b>${leader ? `<em>★ ЛИДЕР</em>` : ""}</div><small>${owners.length ? `Управляет: ${esc(owners.join(", "))}` : "Нет привязанного пользователя"}${adapter ? ` · ${formatCredits(adapter.value)} Credits` : " · валюта недоступна"}</small></div><div class="cl-member-actions">${leader ? `<button disabled>★ Лидер</button>` : `<button data-action="set-group-leader-actor" data-group="${esc(group.id)}" data-actor="${esc(actorId)}">☆ Сделать лидером</button>`}<button data-action="actor-to-contact" data-group="${esc(group.id)}" data-actor="${esc(actorId)}">◉ В контакты</button><button class="danger" data-action="remove-group-actor" data-group="${esc(group.id)}" data-actor="${esc(actorId)}">Убрать</button></div></article>`;
      })
      .join("");
    const selected = selectedTokenIdentity();
    const body = `<div class="cl-team-dashboard"><section class="cl-team-dashboard-hero"><div><span>КОМАНДА</span><h2>${esc(group.name)}</h2><p>${(group.actorIds || []).length} Actor · ${data.contacts.length} контактов · ${activeJobs.length} активных заказов</p></div><div class="cl-team-dashboard-actions"><button data-action="quick-message" data-group="${esc(group.id)}">✉ Сообщение</button><button data-action="quick-call" data-group="${esc(group.id)}">☎ Звонок</button><button data-action="quick-contact" data-group="${esc(group.id)}">◉ Контакт</button><button data-action="preview-group" data-group="${esc(group.id)}">▣ Preview</button><button class="primary" data-action="quick-job" data-group="${esc(group.id)}">▤ Новый заказ</button></div></section><section class="cl-team-dashboard-section"><header><h3>Состав и выплаты</h3><button data-action="rename-group" data-id="${esc(group.id)}">✎ Переименовать</button></header><p class="muted">Состав теперь хранится по Actor. Лидер — тоже Actor. Выплата делится между всеми Actor группы, а не между аккаунтами Foundry.</p><div class="cl-team-dashboard-actions cl-actor-add-actions"><button class="primary" data-action="open-group-actor-picker" data-group="${esc(group.id)}">＋ Добавить Actor</button>${selected?.actorId ? `<button data-action="add-selected-actor-group" data-group="${esc(group.id)}">◎ Добавить выбранного: ${esc(selected.name)}</button>` : ""}</div><div class="cl-member-manage-list">${memberCards || `<div class="cl-team-empty">В группе пока нет Actor.</div>`}</div></section><section class="cl-team-dashboard-section"><header><h3>Активные заказы</h3><button data-action="quick-job" data-group="${esc(group.id)}">＋ Заказ</button></header><div class="cl-list">${activeJobs.length ? activeJobs.map((j) => masterJobRow(j, group.id)).join("") : `<div class="cl-team-empty">У команды нет активных заказов.</div>`}</div></section><section class="cl-team-dashboard-section"><header><h3>События команды</h3></header>${recentEvents.length ? recentEvents.map((e) => `<button class="cl-mini-event ${isMasterEventRead(group.id, e.id) ? "" : "unread"}" data-action="master-event-open" data-group="${esc(group.id)}" data-event="${esc(e.id)}"><span>${eventIcon(e.type)}</span><div><b>${esc(e.actorName)}</b><small>${short(e.summary, 85)}</small></div><i>›</i></button>`).join("") : `<div class="cl-team-empty">Действия персонажей появятся здесь автоматически.</div>`}</section><div class="cl-grid2"><section class="cl-team-dashboard-section"><header><h3>Звонки</h3></header>${activeCalls.length ? activeCalls.map((c) => `<button class="cl-mini-event" data-action="open-master-call" data-id="${esc(c.id)}" data-group="${esc(group.id)}"><span>☎</span><div><b>${esc(c.name)}</b><small>${esc(callStatusLabel(c.status))}</small></div><i>›</i></button>`).join("") : `<div class="cl-team-empty">Нет активных звонков.</div>`}</section><section class="cl-team-dashboard-section"><header><h3>Последние сообщения</h3></header>${recentThreads.length ? recentThreads.map((msg) => `<button class="cl-mini-event" data-action="open-master-thread" data-group="${esc(group.id)}" data-thread="${esc(msg.threadId)}"><span>✉</span><div><b>${esc(text(msg.senderName) || contactName(data, msg.contactId, "COMM-LINK"))}</b><small>${short(msg.body, 70)}</small></div><i>›</i></button>`).join("") : `<div class="cl-team-empty">Диалогов пока нет.</div>`}</section></div></div>`;
    return modalShell(
      group.name,
      body,
      `<button class="danger" data-action="delete-group" data-id="${esc(group.id)}">Удалить команду</button><button data-action="modal-close">Закрыть</button>`,
    );
  }

  function groupsContaining(kind, id) {
    const out = [];
    const master = kind === "contacts" ? selectedMasterContact(id) : null;
    for (const [groupId, data] of state.groupData) {
      const found = (data[kind] || []).some(
        (x) =>
          x.id === id ||
          (kind === "contacts" &&
            master &&
            x.source !== "player" &&
            ((master.actorId && x.actorId === master.actorId) ||
              normalize(x.name) === normalize(master.name))),
      );
      if (found) out.push(groupId);
    }
    return out;
  }
  function masterMessageEditModal(m) {
    return modalShell(
      "Исправить сообщение",
      `${audiencePicker(m.audienceSelected || [], "message-edit")}<div class="cl-field cl-sender-field"><label>Имя отправителя</label><input data-bind="edit-message-sender" value="${esc(m.senderName || "")}" placeholder="Wakako / UNKNOWN"></div><div class="cl-field"><label>Текст сообщения</label><textarea data-bind="edit-message-body" class="large">${esc(m.body || "")}</textarea></div><p class="cl-modal-hint">Имя отправителя задаётся вручную и не зависит от связанного контакта/токена.</p>`,
      `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-master-message">Сохранить</button>`,
    );
  }
  function masterContactQuickActions(m) {
    const groups = groupsContaining("contacts", m.id);
    if (!groups.length) return "";
    return `<section class="cl-contact-automation"><header><small>БЫСТРЫЕ ДЕЙСТВИЯ</small><b>Сразу для нужной команды</b></header>${groups.map((groupId) => `<div><span>${esc(groupNameById(groupId))}</span><button data-action="contact-quick-message" data-contact="${esc(m.id)}" data-group="${esc(groupId)}">✉ Написать</button><button data-action="contact-quick-call" data-contact="${esc(m.id)}" data-group="${esc(groupId)}">☎ Позвонить</button><button data-action="contact-quick-job" data-contact="${esc(m.id)}" data-group="${esc(groupId)}">▤ Заказ</button></div>`).join("")}</section>`;
  }
  function masterContactModal(m) {
    return modalShell(
      "Контакт сети",
      `${masterContactQuickActions(m)}${audiencePicker(m.audienceSelected || [], "contact-edit")}<div class="cl-grid2"><div class="cl-field"><label>Имя</label><input data-bind="edit-contact-name" value="${esc(m.name || "")}"></div><div class="cl-field"><label>Позывной</label><input data-bind="edit-contact-handle" value="${esc(m.handle || "")}"></div></div><div class="cl-field"><label>Изображение</label><input data-bind="edit-contact-image" value="${esc(m.image || "")}"></div><div class="cl-field"><label>Теги через запятую</label><input data-bind="edit-contact-tags" value="${esc(m.tagsRaw || "")}"></div><div class="cl-field"><label>Краткая сводка</label><textarea data-bind="edit-contact-summary">${esc(m.summary || "")}</textarea></div>`,
      `<button data-action="modal-close">Отмена</button><button class="primary" data-action="save-master-contact">Сохранить</button>`,
    );
  }
  function jobMapPointExists(id) {
    return !id || getWorldCityMap().markers.some((marker) => marker.id === id);
  }
  function jobMapPointSelector(value, bind) {
    const selected = text(value),
      markers = getWorldCityMap().markers;
    const choices = [["", "Без точки"]];
    if (selected && !jobMapPointExists(selected))
      choices.push([selected, "Прежняя точка удалена — выберите другую"]);
    for (const marker of [...markers].sort((a, b) =>
      a.title.localeCompare(b.title, "ru"),
    )) {
      const duplicate = markers.some(
        (other) => other.id !== marker.id && other.title === marker.title,
      );
      choices.push([
        marker.id,
        duplicate ? `${marker.title} · ${marker.id}` : marker.title,
      ]);
    }
    return `<div class="cl-field"><label>Точка на карте</label><select data-bind="${esc(bind)}">${choices.map(([id, label]) => `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`).join("")}</select><small>Существующее место в атласе. Связь можно изменить или снять.</small></div>`;
  }
  function masterJobModal(m) {
    const data = state.groupData.get(m.groupId);
    const j = data?.jobs.find((x) => x.id === m.id);
    if (!j) return "";
    const st = j.settlement;
    const paid = st?.paidAt
      ? `<section class="cl-settlement-receipt"><header><div><small>PAYMENT RECEIPT</small><b>${formatCredits(st.total || 0)} Credits</b></div><span>✓ ${formatDate(st.paidAt)}</span></header><div class="cl-receipt-math"><span>База ${formatCredits(st.basePay || 0)}</span><span>${Number(st.percent) || 0}%</span><span>+${formatCredits(st.bonus || 0)}</span><span>−${formatCredits(st.penalty || 0)}</span></div><div class="cl-receipt-shares">${(st.shares || []).map((x) => `<div><span>${esc(x.actorName || "Edgerunner")}</span><b>+${formatCredits(x.amount || 0)} Credits</b></div>`).join("")}</div>${st.note ? `<p>${esc(st.note)}</p>` : ""}</section>`
      : "";
    return modalShell(
      `${j.title} // управление`,
      `<div class="cl-master-job-head"><div><small>${esc(state.control.groups.find((g) => g.id === m.groupId)?.name || "Группа")}</small><h3>${esc(j.fixerName)}</h3></div><span class="cl-status ${esc(j.status)}">${esc(jobStatusLabel(j.status))}</span></div>${paid}${payoutLedgerMarkup(j)}<div class="cl-grid2"><div class="cl-field"><label>Название</label><input data-bind="master-job-title" value="${esc(m.title ?? j.title)}"></div><div class="cl-field"><label>Фиксер</label><input data-bind="master-job-fixer" value="${esc(m.fixerName ?? j.fixerName)}"></div></div><div class="cl-field"><label>Коротко</label><input data-bind="master-job-summary" value="${esc(m.summary ?? j.summary)}"></div><div class="cl-field"><label>Подробности</label><textarea data-bind="master-job-details" class="large">${esc(m.details ?? j.details)}</textarea></div><div class="cl-grid4"><div class="cl-field"><label>Оплата</label><input data-bind="master-job-pay" value="${esc(m.pay ?? j.pay)}"></div><div class="cl-field"><label>Валюта</label><input data-bind="master-job-currency" value="Credits" readonly></div><div class="cl-field"><label>Риск</label><input type="number" min="1" max="5" data-bind="master-job-risk" value="${esc(m.risk ?? j.risk)}"></div><div class="cl-field"><label>Срок</label><input data-bind="master-job-deadline" value="${esc(m.deadline ?? j.deadline)}"></div></div>${jobMapPointSelector(m.cityMarkerId ?? j.cityMarkerId, "master-job-city-marker")}${j.acceptedBy ? `<p><b>Принял:</b> ${esc(j.acceptedBy)}</p>` : ""}<div class="cl-master-status-actions"><button data-action="master-job-status" data-status="available" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}">Доступен</button><button data-action="master-job-status" data-status="completed" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}" class="green" ${st?.paidAt ? "disabled" : ""}>✓ Выполнен</button><button data-action="master-job-status" data-status="failed" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}" class="danger" ${st?.paidAt ? "disabled" : ""}>✕ Провален</button><button data-action="master-job-status" data-status="cancelled" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}">Отменён</button>${st?.paidAt ? `<button class="danger" data-action="reset-job-settlement" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}">↻ Сбросить отметку выплаты</button>` : ""}</div>`,
      `<button data-action="modal-close">Закрыть</button><button class="primary" data-action="save-master-job" data-group="${esc(m.groupId)}" data-id="${esc(j.id)}">Сохранить изменения</button>`,
    );
  }
  function callTranscriptHtml(c) {
    return `<div class="cl-call-transcript">${c.transcript?.length ? c.transcript.map((line) => chatBubbleHtml(line, { contactImage: line.speaker !== "player" ? line.image || c.image || "" : "", fallbackName: c.name })).join("") : `<div class="cl-empty small"><span>Разговор ещё не начался.</span></div>`}</div>`;
  }
  function masterCallModal(m) {
    const data = state.groupData.get(m.groupId);
    const c = data?.calls.find((x) => x.id === m.id);
    if (!c) return "";
    const active = c.status === "accepted",
      ringing = c.status === "ringing";
    const groupName =
        state.control.groups.find((g) => g.id === m.groupId)?.name || "Группа",
      meta = publicationMeta(c),
      masterName = meta?.name || c.name;
    return modalShell(
      `${masterName} // ${groupName}`,
      `<div class="cl-call-detail compact"><div class="cl-caller-identity">${c.image ? `<img src="${esc(c.image)}">` : `<div class="cl-call-orb small">☎</div>`}<div><span class="cl-call-kicker">${active ? "LIVE CALL" : ringing ? "INCOMING CALL" : "CALL ARCHIVE"}</span><h3>${esc(callStatusLabel(c.status))}</h3><p>${esc(c.note || "Входящий вызов")}</p>${c.answeredBy ? `<small>Ответил: ${esc(c.answeredBy)}</small>` : ""}</div></div></div>${active ? `${callTranscriptHtml(c)}<div class="cl-call-compose"><label>MASTER → ${esc(groupName)}</label><div class="cl-reply"><textarea data-bind="master-call-line" placeholder="Написать реплику в разговор…">${esc(m.line || "")}</textarea><button class="primary" data-action="send-call-line-master" data-group="${esc(m.groupId)}" data-id="${esc(c.id)}" title="Отправить реплику">➤</button></div></div>` : ringing ? `<div class="cl-call-wait"><b>Ожидание ответа команды</b><span>После принятия вызова здесь автоматически появится поле MASTER для разговора.</span></div>` : ""}`,
      `${["ringing", "accepted"].includes(c.status) ? `<button class="danger" data-action="end-call-master" data-id="${esc(c.id)}" data-group="${esc(m.groupId)}">Завершить</button>` : ""}<button data-action="modal-close">Закрыть</button>`,
    );
  }
  function jobModal(m) {
    const data = currentRunnerData();
    const j = data?.jobs.find((x) => x.id === m.id);
    if (!j) return "";
    const simulation = isRunnerSimulation(),
      st = j.settlement,
      myShare = (st?.shares || []).find(
        (x) => x.actorId === currentRunnerActorId(),
      ),
      groupId = currentRunnerGroupId(),
      leader = groupLeaderActor(groupId),
      canDecide = runnerCanDecideJobs(groupId);
    const receipt = st?.paidAt
      ? `<div class="cl-player-payment-receipt"><span>₡</span><div><small>ВЫПЛАТА ПРОВЕДЕНА</small><b>${myShare ? `+${formatCredits(myShare.amount || 0)} Credits` : `Фонд ${formatCredits(st.total || 0)} Credits`}</b>${myShare ? `<em>${esc(myShare.actorName || "")}</em>` : ""}</div></div>`
      : "";
    const decision =
      j.status === "available"
        ? canDecide
          ? `<button class="danger" data-action="decline-job" data-id="${esc(j.id)}">Отклонить</button><button class="primary green" data-action="accept-job" data-id="${esc(j.id)}">✓ Принять заказ для группы</button>`
          : `<div class="cl-leader-only"><span>★</span><div><b>Решение принимает лидер группы</b><small>${esc(leader?.name || "Лидер не назначен")}</small></div></div><button data-action="modal-close">Закрыть</button>`
        : `<button data-action="modal-close">Закрыть</button>`;
    return modalShell(
      j.title,
      `${simulation ? `<div class="cl-sim-note">SIMULATION · действия не изменяют данные мира</div>` : ""}<div class="cl-job-detail"><div class="cl-job-detail-top"><div class="cl-fixer-id big">${j.fixerImage ? `<img src="${esc(j.fixerImage)}">` : `<span>◉</span>`}<span>${esc(j.fixerName)}</span></div><span class="cl-status ${esc(j.status)}">${esc(jobStatusLabel(j.status))}</span></div>${receipt}<div class="cl-pay-big">${esc(j.pay || "—")} <small>Credits</small></div><div class="cl-risk big">${"●".repeat(j.risk)}${"○".repeat(5 - j.risk)}</div>${leader ? `<p><b>Лидер группы:</b> ${esc(leader.name)}</p>` : ""}${j.deadline ? `<p><b>Срок:</b> ${esc(j.deadline)}</p>` : ""}${j.summary ? `<p>${esc(j.summary)}</p>` : ""}${j.details ? `<div class="cl-detail-text">${esc(j.details).replaceAll("\n", "<br>")}</div>` : ""}${j.acceptedBy ? `<p><b>Принял:</b> ${esc(j.acceptedBy)}</p>` : ""}</div>`,
      decision,
    );
  }

  function callModal(m) {
    const data = currentRunnerData();
    const c = data?.calls.find((x) => x.id === m.id);
    if (!c) return "";
    const ringing = c.status === "ringing",
      active = c.status === "accepted",
      simulation = isRunnerSimulation();
    const groupName = data?.groupName || "Команда";
    const transcript = active ? callTranscriptHtml(c) : "";
    const simMaster =
      simulation && active
        ? `<div class="cl-call-compose cl-sim-master-compose"><label>MASTER (SIM) → ${esc(groupName)}</label><div class="cl-reply"><textarea data-bind="sim-master-call-line" placeholder="Реплика MASTER в симуляции…">${esc(m.simMasterLine || "")}</textarea><button class="primary" data-action="send-call-line-sim-master" data-id="${esc(c.id)}" title="Отправить реплику MASTER">➤</button></div></div>`
        : "";
    const runnerCompose = active
      ? `<div class="cl-call-compose"><label>${esc(runnerSpeakerName())} → ${esc(c.name)}</label><div class="cl-reply"><textarea data-bind="call-reply" placeholder="Ответить в разговор…">${esc(m.callReply || "")}</textarea><button class="primary" data-action="send-call-line-player" data-id="${esc(c.id)}" title="Отправить реплику">➤</button></div></div>`
      : "";
    return modalShell(
      ringing ? `Звонит: ${c.name}` : c.name,
      `${simulation ? `<div class="cl-sim-note">SIMULATION · можно проверить обе стороны звонка без записи в мир</div>` : ""}<div class="cl-call-detail compact ${ringing ? "is-ringing" : ""}"><div class="cl-caller-identity">${c.image ? `<img src="${esc(c.image)}">` : `<div class="cl-call-orb small">☎</div>`}<div><span class="cl-call-kicker">${active ? "LIVE CALL" : ringing ? "INCOMING CALL · ОТ" : "CALL ARCHIVE"}</span><h3 class="cl-caller-name">${esc(c.name)}</h3><strong class="cl-call-state">${esc(callStatusLabel(c.status))}</strong><p>${esc(c.note || "Входящий вызов")}</p>${c.answeredBy ? `<small>Ответил: ${esc(c.answeredBy)}</small>` : ""}</div></div></div>${transcript}${simMaster}${runnerCompose}`,
      ringing
        ? `<button class="danger" data-action="decline-call" data-id="${esc(c.id)}">Отклонить</button><button class="primary green" data-action="accept-call" data-id="${esc(c.id)}">☎ Принять</button>`
        : active
          ? `<button class="danger" data-action="end-call-player" data-id="${esc(c.id)}">Завершить звонок</button><button data-action="modal-close">Свернуть</button>`
          : `<button data-action="modal-close">Закрыть</button>`,
    );
  }

  function contactModal(m) {
    const data = currentRunnerData();
    const c = data?.contacts.find((x) => x.id === m.id);
    if (!c) return "";
    const msgs = (data.messages || [])
      .filter((x) => x.contactId === c.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const call = (data.calls || []).find(
      (x) => x.contactId === c.id && ["ringing", "accepted"].includes(x.status),
    );
    const editable = c.source === "player";
    const quick = `<div class="cl-runner-contact-actions"><button class="primary" data-action="runner-contact-message" data-id="${esc(c.id)}">✉ Написать</button>${msgs[0] ? `<button data-action="open-thread" data-thread="${esc(msgs[0].threadId)}" data-message="${esc(msgs[0].id)}">▤ История</button>` : ""}${call ? `<button data-action="open-call" data-id="${esc(call.id)}">☎ ${call.status === "ringing" ? "Ответить" : "Вернуться в звонок"}</button>` : ""}${c.actorId ? `<button data-action="open-actor-sheet" data-actor="${esc(c.actorId)}">◫ Actor</button>` : ""}${editable ? `<button data-action="edit-runner-contact" data-id="${esc(c.id)}">✎ Изменить</button>` : ""}</div>`;
    const stats = `<div class="cl-contact-stats"><span><b>${msgs.length}</b> сообщений</span><span><b>${(data.calls || []).filter((x) => x.contactId === c.id).length}</b> звонков</span><span><b>${c.source === "player" ? "PLAYER" : "NET"}</b> источник</span></div>`;
    return modalShell(
      c.name,
      `${quick}${stats}<div class="cl-contact-detail">${c.image ? `<img src="${esc(c.image)}">` : `<div class="cl-contact-detail-placeholder">◉</div>`}<div class="cl-contact-detail-copy">${c.handle ? `<h3>${esc(c.handle)}</h3>` : ""}<div class="cl-mini-tags large">${c.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div><p>${esc(c.summary || "Нет дополнительной информации.")}</p></div></div>`,
      `<button data-action="modal-close">Закрыть</button>${editable ? `<button class="danger" data-action="delete-runner-contact" data-id="${esc(c.id)}">Удалить</button>` : ""}`,
    );
  }
  function runnerContactComposeModal(m) {
    const data = currentRunnerData(),
      c = data?.contacts.find((x) => x.id === m.contactId);
    if (!c) return "";
    return modalShell(
      `Сообщение → ${c.name}`,
      `<div class="cl-contact-compose-target">${c.image ? `<img src="${esc(c.image)}">` : `<span>◉</span>`}<div><small>OUTBOUND MESSAGE</small><b>${esc(c.name)}</b><em>${esc(c.handle || "Контакт сети")}</em></div></div><div class="cl-field"><label>Сообщение</label><textarea class="large" data-bind="runner-contact-message-body" autofocus>${esc(m.body || "")}</textarea></div><p class="cl-modal-hint">Сообщение попадёт в историю группы и сразу появится у MASTER как новый диалог/ответ.</p>`,
      `<button data-action="modal-close">Отмена</button><button class="primary" data-action="send-runner-contact-message" data-id="${esc(c.id)}">Отправить</button>`,
    );
  }
  function crewMemberModal(m) {
    const data = currentRunnerData();
    const r =
      runnerCrewRoster(data).find((x) => x.actorId === m.actorId) ||
      (data?.memberRoster || []).find((x) => x.actorId === m.actorId);
    if (!r) return "";
    const actor = actorById(r.actorId);
    return modalShell(
      r.name,
      `<div class="cl-crew-member-detail">${r.image ? `<img src="${esc(r.image)}">` : `<span>?</span>`}<div><small>${r.leader ? "★ ЛИДЕР" : "CREW MEMBER"}</small><h3>${esc(r.name)}</h3><p>${esc(data?.groupName || "COMM-LINK crew")}</p></div></div><div class="cl-info-strip compact"><b>АВТОМАТИЧЕСКИЙ КОНТАКТ</b><span>Эта запись берётся напрямую из состава группы и исчезнет сама, если GM уберёт Actor из команды.</span></div>`,
      `${actor ? `<button class="primary" data-action="open-actor-sheet" data-actor="${esc(r.actorId)}">◫ Открыть Actor</button>` : ""}<button data-action="modal-close">Закрыть</button>`,
    );
  }
  function datapadImportModal(m) {
    const list = m.items || [];
    return modalShell(
      "Импорт контактов из DATAPAD",
      `${audiencePicker(m.audience)}<p class="cl-modal-hint">Это копия для COMM-LINK. Исходный DATAPAD не изменяется.</p><div class="cl-import-list">${list.length ? list.map((c) => `<button class="cl-import-row ${m.selected?.includes(c.id) ? "on" : ""}" data-action="toggle-import-contact" data-id="${esc(c.id)}"><div class="cl-avatar sm">${c.image ? `<img src="${esc(c.image)}">` : "◉"}</div><div><strong>${esc(c.name)}</strong><span>${short(c.summary, 80)}</span></div><b>${m.selected?.includes(c.id) ? "✓" : "＋"}</b></button>`).join("") : `<div class="cl-empty"><b>Контакты не найдены</b><span>В DATAPAD текущего GM нет доступных контактов.</span></div>`}</div>`,
      `<button data-action="modal-close">Отмена</button><button class="primary" data-action="publish-imported" ${m.selected?.length ? "" : "disabled"}>Опубликовать (${m.selected?.length || 0})</button>`,
    );
  }

  let renderedViewKeys = null,
    renderedRoot = null,
    renderedMarkup = null;
  function render() {
    if (!commLinkUiOpen()) return;
    liveRenderPending = false;
    const start = diagNow(),
      root = state.root,
      master = userCanMaster() && state.mode === "master",
      login = state.mode === "login";
    state.width = root.clientWidth || 1000;
    state.height = root.clientHeight || 780;
    const nextViewKeys = commLinkViewKeys(state);
    const viewState = captureCommLinkView(root, renderedViewKeys, nextViewKeys);
    const content = login ? loginView() : master ? masterView() : runnerView();
    const markup = `<div class="cl-window ${login ? "login" : master ? "master" : "runner"} skin-${esc(runnerProfile().skin)} ${fxClassList()} ${fxEventClass()} ${currentFxCallActive() ? "fx-call-active" : ""} ${state.width < 900 ? "is-compact" : ""} ${state.width < 780 ? "is-narrow" : ""}">${content.replaceAll("data-drag-handle", "")}${relayStatusMarkup()}${renderModal()}${state.busyLabel ? `<div class="cl-busy"><span></span><b>${esc(state.busyLabel)}</b></div>` : ""}</div>${renderContextMenu()}${renderToasts()}`;
    if (
      renderedRoot === root &&
      root.firstElementChild &&
      renderedMarkup === markup &&
      renderedViewKeys?.page === nextViewKeys.page &&
      renderedViewKeys?.modal === nextViewKeys.modal
    ) {
      updateRingtoneLoop();
      return;
    }
    root.innerHTML = markup;
    renderedRoot = root;
    renderedMarkup = markup;
    bindEvents();
    bindContextMenuButtons();
    restoreCommLinkView(root, viewState);
    renderedViewKeys = nextViewKeys;
    updateRingtoneLoop();
    recordPerf("render", diagNow() - start);
  }

  function setModalBind(key, value) {
    const m = state.modal;
    if (!m) return;
    const map = {
      "group-name": "name",
      "contact-name": "name",
      "contact-handle": "handle",
      "contact-image": "image",
      "contact-tags": "tagsRaw",
      "contact-summary": "summary",
      "message-contact": "contactId",
      "message-sender": "senderName",
      "message-body": "body",
      "call-contact": "contactId",
      "call-name": "name",
      "call-note": "note",
      "job-fixer": "fixerId",
      "job-fixer-name": "fixerName",
      "job-title": "title",
      "job-summary": "summary",
      "job-details": "details",
      "job-pay": "pay",
      "job-currency": "currency",
      "job-risk": "risk",
      "job-deadline": "deadline",
      "job-city-marker": "cityMarkerId",
      "reply-body": "reply",
      "master-thread-reply": "masterReply",
      "edit-message-sender": "senderName",
      "edit-message-body": "body",
      "edit-contact-name": "name",
      "edit-contact-handle": "handle",
      "edit-contact-image": "image",
      "edit-contact-tags": "tagsRaw",
      "edit-contact-summary": "summary",
      "master-job-title": "title",
      "master-job-fixer": "fixerName",
      "master-job-summary": "summary",
      "master-job-details": "details",
      "master-job-pay": "pay",
      "master-job-currency": "currency",
      "master-job-risk": "risk",
      "master-job-deadline": "deadline",
      "master-job-city-marker": "cityMarkerId",
      "master-call-line": "line",
      "call-reply": "callReply",
      "sim-master-call-line": "simMasterLine",
      "runner-login-pin": "pin",
      "runner-profile-name": "profileName",
      "runner-profile-image": "profileImage",
      "runner-profile-sound": "soundEnabled",
      "runner-profile-volume": "soundVolume",
      "runner-profile-background": "backgroundNotifications",
      "runner-profile-pin-enabled": "pinEnabled",
      "runner-profile-new-pin": "newPin",
      "fx-enabled": "fxEnabled",
      "fx-intensity": "fxIntensity",
      "fx-decor": "fxDecor",
      "fx-status": "fxStatusRail",
      "fx-circuits": "fxCircuits",
      "fx-osc": "fxOscillator",
      "fx-micro": "fxMicrocopy",
      "fx-hover": "fxHover",
      "fx-events": "fxEvents",
      "fx-call": "fxCall",
      "fx-glitch": "fxGlitch",
      "publish-identity-visible": "identityVisible",
      "master-sender-manual-name": "manualName",
      "master-sender-manual-image": "manualImage",
      "master-sender-visible": "defaultIdentityVisible",
      "runner-contact-message-body": "body",
      "settle-base": "basePay",
      "settle-percent": "percent",
      "settle-bonus": "bonus",
      "settle-penalty": "penalty",
      "settle-note": "note",
    };
    m[map[key] || key] = value;
    if (key.startsWith("settle-") && m.type === "job-settlement") {
      const live = state.root?.querySelector("[data-settlement-live]");
      if (live) live.innerHTML = settlementLiveHtml(m);
    }
    if (key === "publish-identity-visible") {
      const p = {
          actorId: text(m.senderActorId),
          name: text(m.actualSenderName) || masterSenderProfile().name,
          image: text(m.senderImage) || masterSenderProfile().image,
        },
        pub = publicSender(p, m.type, value !== false);
      if (m.type === "message") m.senderName = pub.name;
      if (m.type === "call") m.name = pub.name;
      if (m.type === "job") m.fixerName = pub.name;
      render();
    }
    if (m.type === "master-sender") {
      if (key === "master-sender-manual-name")
        state.control.masterSender.manualName = text(value) || "COMM-LINK";
      if (key === "master-sender-manual-image")
        state.control.masterSender.manualImage = text(value);
      if (key === "master-sender-visible")
        state.control.masterSender.identityVisible = value !== false;
    }
  }

  function closeContextMenu() {
    state.contextMenu = null;
    const menu = state.root?.querySelector(".cl-context-menu");
    if (menu) {
      menu.remove();
      renderedMarkup = null;
    }
  }
  function contextMenuOptions(el) {
    const k = el.dataset.contextKind,
      id = el.dataset.contextId || "",
      group = el.dataset.contextGroup || "",
      thread = el.dataset.contextThread || "",
      actor = el.dataset.contextActor || "";
    const out = [];
    const add = (label, action, extra = {}, tone = "") =>
      out.push({ label, action, extra, tone });
    if (k === "group") {
      add("Открыть команду", "open-group-dashboard", { id });
      add("Переименовать", "rename-group", { id });
      add("Удалить команду", "delete-group", { id }, "danger");
    }
    if (k === "group-member") {
      add("Открыть Actor", "open-actor-sheet", { actor });
      add("Сделать лидером", "set-group-leader-actor", { group, actor });
      add("Добавить в контакты", "actor-to-contact", { group, actor });
      add(
        "Убрать из команды",
        "remove-group-actor",
        { group, actor },
        "danger",
      );
    }
    if (k === "master-contact") {
      add("Редактировать", "open-master-contact", { id });
      add("Удалить из сети", "delete-master-contact", { id }, "danger");
    }
    if (k === "master-job") {
      add("Открыть / редактировать", "open-master-job", { id, group });
      add("Удалить заказ", "delete-master-job", { id, group }, "danger");
    }
    if (k === "master-call") {
      add("Открыть звонок", "open-master-call", { id, group });
      add("Удалить запись", "delete-master-call", { id, group }, "danger");
    }
    if (k === "master-thread") {
      add("Открыть диалог", "open-master-thread", { group, thread });
      add(
        "Удалить диалог",
        "delete-master-thread",
        { group, thread },
        "danger",
      );
    }
    if (k === "runner-contact") {
      const c = currentRunnerData()?.contacts?.find((x) => x.id === id);
      add("Открыть карточку", "open-contact", { id });
      add("Написать", "runner-contact-message", { id });
      if (c?.source === "player") {
        add("Редактировать", "edit-runner-contact", { id });
        add("Удалить", "delete-runner-contact", { id }, "danger");
      }
    }
    if (k === "crew-member") {
      add("Карточка участника", "open-crew-member", { actor });
      add("Открыть Actor", "open-actor-sheet", { actor });
    }
    if (k === "runner-job") {
      const j = currentRunnerData()?.jobs?.find((x) => x.id === id);
      add("Открыть заказ", "open-job", { id });
      if (j?.status === "available" && runnerCanDecideJobs()) {
        add("Принять", "accept-job", { id });
        add("Отклонить", "decline-job", { id }, "danger");
      }
    }
    if (k === "runner-call") {
      const c = currentRunnerData()?.calls?.find((x) => x.id === id);
      add("Открыть звонок", "open-call", { id });
      if (c?.status === "ringing") {
        add("Ответить", "accept-call", { id });
        add("Отклонить", "decline-call", { id }, "danger");
      }
    }
    if (k === "runner-thread") {
      add("Открыть диалог", "open-thread", { thread, id });
    }
    return out;
  }
  async function runContextOption(option) {
    if (!option) return;
    const a = option.action,
      x = option.extra || {};
    try {
      if (a === "open-group-dashboard") {
        const g = state.control.groups.find((v) => v.id === x.id);
        if (g) {
          state.modal = { type: "group-dashboard", id: g.id };
          render();
        }
        return;
      }
      if (a === "rename-group") {
        const g = state.control.groups.find((v) => v.id === x.id);
        if (g) {
          state.modal = { type: "rename-group", id: g.id, name: g.name };
          render();
        }
        return;
      }
      if (a === "delete-group") {
        await deleteGroup(x.id);
        return;
      }
      if (a === "open-actor-sheet") {
        openActorSheetById(x.actor);
        return;
      }
      if (a === "set-group-leader-actor") {
        await setGroupLeaderActor(x.group, x.actor);
        return;
      }
      if (a === "actor-to-contact") {
        await addActorAsContact(x.actor, [x.group]);
        return;
      }
      if (a === "remove-group-actor") {
        await removeActorFromGroup(x.group, x.actor);
        return;
      }
      if (a === "open-master-contact") {
        openMasterContact(x.id);
        return;
      }
      if (a === "delete-master-contact") {
        await deleteMasterContact(x.id);
        return;
      }
      if (a === "open-master-job") {
        await markMasterEventsFor(x.group, "job", x.id);
        openMasterJob(x.group, x.id);
        return;
      }
      if (a === "delete-master-job") {
        await deleteMasterJob(x.group, x.id);
        return;
      }
      if (a === "open-master-call") {
        await markMasterEventsFor(x.group, "call", x.id);
        state.modal = {
          type: "master-call",
          id: x.id,
          groupId: x.group,
          line: "",
        };
        render();
        return;
      }
      if (a === "delete-master-call") {
        await deleteMasterCall(x.group, x.id);
        return;
      }
      if (a === "open-master-thread") {
        await markMasterEventsFor(x.group, "thread", "", x.thread);
        state.modal = {
          type: "master-thread",
          groupId: x.group,
          threadId: x.thread,
          masterReply: "",
        };
        render();
        return;
      }
      if (a === "delete-master-thread") {
        await deleteMasterThread(x.group, x.thread);
        return;
      }
      if (a === "open-contact") {
        state.modal = { type: "contact-view", id: x.id };
        render();
        return;
      }
      if (a === "runner-contact-message") {
        openRunnerContactMessage(x.id);
        return;
      }
      if (a === "edit-runner-contact") {
        editRunnerContact(x.id);
        return;
      }
      if (a === "delete-runner-contact") {
        await deleteRunnerContact(x.id);
        return;
      }
      if (a === "open-crew-member") {
        openCrewMember(x.actor);
        return;
      }
      if (a === "open-job") {
        state.modal = { type: "job-view", id: x.id };
        await markRead("jobs", x.id);
        render();
        return;
      }
      if (a === "accept-job") {
        await acceptJob(x.id);
        return;
      }
      if (a === "decline-job") {
        await declineJob(x.id);
        return;
      }
      if (a === "open-call") {
        state.modal = { type: "call-view", id: x.id };
        await markRead("calls", x.id);
        render();
        return;
      }
      if (a === "accept-call") {
        await setCallStatus(x.id, "accepted");
        return;
      }
      if (a === "decline-call") {
        await setCallStatus(x.id, "declined");
        return;
      }
      if (a === "open-thread") {
        await openThread(x.thread, x.id);
        return;
      }
    } catch (error) {
      recordDiagError(`context:${a}`, error);
      console.error("COMM-LINK context action error", a, error);
      notify(`COMM-LINK: ${error?.message || error}`, "error");
    }
  }
  function bindContextMenuButtons() {
    const menu = state.root?.querySelector(".cl-context-menu");
    if (!menu) return;
    menu.querySelectorAll("[data-context-index]").forEach((btn) => {
      if (btn.__clContextBound) return;
      btn.__clContextBound = true;
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const option =
          state.contextMenu?.options?.[Number(btn.dataset.contextIndex)];
        if (!option) return;
        closeContextMenu();
        await runContextOption(option);
      });
    });
  }
  function renderContextMenu() {
    const m = state.contextMenu;
    if (!m?.options?.length) return "";
    return `<div class="cl-context-menu" style="left:${Math.round(m.x)}px;top:${Math.round(m.y)}px"><div class="cl-context-head"><span>QUICK ACTIONS</span><b>ПКМ</b></div>${m.options.map((o, i) => `<button type="button" class="${esc(o.tone || "")}" data-context-index="${i}">${esc(o.label)}</button>`).join("")}</div>`;
  }
  function showContextMenu(event, el) {
    const options = contextMenuOptions(el);
    if (!options.length) return;
    event.preventDefault();
    event.stopPropagation();
    const pad = 8,
      width = 210,
      estimated = 44 + options.length * 36;
    state.contextMenu = {
      options,
      x: Math.max(
        pad,
        Math.min(event.clientX, (globalThis.innerWidth || 1200) - width - pad),
      ),
      y: Math.max(
        pad,
        Math.min(
          event.clientY,
          (globalThis.innerHeight || 900) - estimated - pad,
        ),
      ),
    };
    render();
    requestAnimationFrame(() => {
      const menu = state.root?.querySelector(".cl-context-menu");
      if (!menu || !state.contextMenu) return;
      const r = menu.getBoundingClientRect();
      let x = state.contextMenu.x,
        y = state.contextMenu.y;
      if (r.right > (globalThis.innerWidth || 1200) - pad)
        x = Math.max(pad, (globalThis.innerWidth || 1200) - r.width - pad);
      if (r.bottom > (globalThis.innerHeight || 900) - pad)
        y = Math.max(pad, (globalThis.innerHeight || 900) - r.height - pad);
      state.contextMenu.x = x;
      state.contextMenu.y = y;
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      bindContextMenuButtons();
    });
  }

  function bindEvents() {
    const root = state.root;
    const applySearch = (input) => {
      const kind = input.dataset.searchKind,
        q = normalize(input.value);
      if (kind === "master-contact") state.masterContactSearch = input.value;
      else if (kind === "runner-contact")
        state.runnerContactSearch = input.value;
      else if (kind === "master-actor") state.masterSenderSearch = input.value;
      else if (
        kind === "actor-picker" ||
        kind === "member-actor" ||
        kind === "group-actor"
      )
        state.actorSearch = input.value;
      root
        .querySelectorAll(`[data-search-list="${kind}"] [data-search-text]`)
        .forEach((row) => {
          row.hidden = !!q && !row.dataset.searchText.includes(q);
        });
    };
    root.querySelectorAll("[data-search-kind]").forEach(applySearch);
    if (!root.__clDelegatedEvents) {
      root.__clDelegatedEvents = true;
      root.addEventListener("focusout", () => {
        setTimeout(() => {
          if (liveRenderPending) requestLiveRender();
        }, 0);
      });
      root.addEventListener("click", (event) => {
        if (event.target.closest?.(".cl-context-menu")) return;
        const el = event.target.closest?.("[data-action]");
        if (!el || !root.contains(el)) return;
        closeContextMenu();
        void onAction(event);
      });
      root.addEventListener("contextmenu", (event) => {
        if (event.target.closest?.(".cl-context-menu")) {
          event.preventDefault();
          return;
        }
        const el = event.target.closest?.("[data-context-kind]");
        if (el && root.contains(el)) showContextMenu(event, el);
        else closeContextMenu();
      });
      root.addEventListener("input", (event) => {
        const el = event.target;
        if (el?.matches?.("[data-bind]")) {
          const value = el.type === "checkbox" ? el.checked : el.value;
          setModalBind(el.dataset.bind, value);
        }
        if (el?.matches?.("[data-search-kind]")) applySearch(el);
      });
      root.addEventListener("change", (event) => {
        const el = event.target;
        if (el?.matches?.("[data-bind]")) {
          const value = el.type === "checkbox" ? el.checked : el.value;
          setModalBind(el.dataset.bind, value);
        }
        if (el?.matches?.('select[data-action="runner-group"]') && el.value)
          switchToRunnerGroup(el.value);
      });
      root.addEventListener("pointerdown", (event) => {
        if (!event.target.closest?.(".cl-context-menu")) closeContextMenu();
      });
    }

    const handle = root.querySelector("[data-drag-handle]");
    if (handle) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button,select,input")) return;
        state.dragging = true;
        state.dragOffsetX = event.clientX - state.x;
        state.dragOffsetY = event.clientY - state.y;
        handle.setPointerCapture?.(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!state.dragging) return;
        state.x = event.clientX - state.dragOffsetX;
        state.y = event.clientY - state.dragOffsetY;
        const win = root.querySelector(".cl-window");
        if (!win) return;
        const dragW = state.minimized ? 330 : state.width,
          dragH = state.minimized ? 58 : state.height;
        state.x = Math.max(
          8,
          Math.min(state.x, (globalThis.innerWidth || 1200) - dragW - 8),
        );
        state.y = Math.max(
          8,
          Math.min(state.y, (globalThis.innerHeight || 900) - dragH - 8),
        );
        win.style.left = `${state.x}px`;
        win.style.top = `${state.y}px`;
      });
      handle.addEventListener("pointerup", () => {
        state.dragging = false;
      });
      handle.addEventListener("pointercancel", () => {
        state.dragging = false;
      });
    }

    const resize = root.querySelector(".cl-resizer");
    if (resize) {
      resize.style.cssText =
        "position:absolute;right:2px;bottom:2px;width:20px;height:20px;cursor:nwse-resize;z-index:30";
      resize.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startW = state.width;
        const startH = state.height;
        resize.setPointerCapture?.(event.pointerId);

        const move = (ev) => {
          const master = userCanMaster() && state.mode === "master";
          const availableW = Math.max(
              260,
              (globalThis.innerWidth || 1200) - state.x - 8,
            ),
            availableH = Math.max(
              220,
              (globalThis.innerHeight || 900) - state.y - 8,
            );
          const requestedMinW = master ? 720 : 340,
            requestedMinH = master ? 540 : 520;
          const minW = Math.min(requestedMinW, availableW),
            minH = Math.min(requestedMinH, availableH);
          const maxW = master ? availableW : Math.min(520, availableW);
          state.width = Math.max(
            minW,
            Math.min(startW + ev.clientX - startX, maxW),
          );
          state.height = Math.max(
            minH,
            Math.min(startH + ev.clientY - startY, availableH),
          );
          const win = root.querySelector(".cl-window");
          if (win) {
            win.style.width = `${state.width}px`;
            win.style.height = `${state.height}px`;
          }
        };
        const up = () => {
          resize.removeEventListener("pointermove", move);
          resize.removeEventListener("pointerup", up);
          resize.removeEventListener("pointercancel", up);
          render();
        };
        resize.addEventListener("pointermove", move);
        resize.addEventListener("pointerup", up);
        resize.addEventListener("pointercancel", up);
      });
    }
  }

  function newAudience() {
    return state.control.groups.length === 1
      ? {
          all: false,
          groupIds: [state.control.groups[0].id],
          selected: [state.control.groups[0].id],
        }
      : { all: false, groupIds: [], selected: [] };
  }
  function modalAudience() {
    const s = state.modal?.audienceSelected ?? [];
    return s.includes("__all__")
      ? { all: true, groupIds: [] }
      : { all: false, groupIds: s };
  }
  function openPublish(type, presetGroups = []) {
    const a = newAudience();
    const selected = presetGroups.length ? [...presetGroups] : a.selected;
    const sp = masterSenderProfile(),
      visible = sp.identityVisible !== false,
      pub = publicSender(sp, type, visible);
    state.modal = {
      type,
      audienceSelected: selected,
      audience: selected,
      senderActorId: sp.actorId,
      actualSenderName: sp.name,
      senderImage: sp.image,
      identityVisible: visible,
    };
    if (type === "message")
      Object.assign(state.modal, {
        body: "",
        contactId: "",
        senderName: pub.name,
      });
    if (type === "call")
      Object.assign(state.modal, { contactId: "", name: pub.name, note: "" });
    if (type === "job")
      Object.assign(state.modal, {
        fixerId: "",
        fixerName: pub.name,
        title: "",
        summary: "",
        details: "",
        pay: "",
        currency: "Credits",
        risk: 3,
        deadline: "",
      });
    if (type === "contact")
      Object.assign(state.modal, {
        name: "",
        handle: "",
        image: "",
        tokenImage: "",
        actorImage: "",
        actorUuid: "",
        tokenUuid: "",
        tags: [],
        summary: "",
      });
    render();
  }
  function openContactAction(type, contactId, groupId) {
    const c = selectedMasterContact(contactId);
    if (!c || !groupId) return;
    openPublish(type, [groupId]);
    Object.assign(state.modal, {
      actualSenderName: c.name,
      senderImage: c.image,
      identityVisible: true,
    });
    if (type === "message")
      Object.assign(state.modal, { contactId: c.id, senderName: c.name });
    if (type === "call")
      Object.assign(state.modal, { contactId: c.id, name: c.name });
    if (type === "job")
      Object.assign(state.modal, { fixerId: c.id, fixerName: c.name });
    render();
  }

  async function onAction(event) {
    const el = event.currentTarget?.dataset?.action
        ? event.currentTarget
        : event.target?.closest?.("[data-action]"),
      action = el?.dataset?.action;
    if (!el || !action) return;
    const __diagActionStart = diagNow();
    try {
      if (action === "close") {
        closeUI();
        return;
      }
      if (action === "toggle-minimize") {
        toggleMinimize();
        return;
      }
      if (action === "toast-open") {
        await openToast(el.dataset.toast);
        return;
      }
      if (action === "mini-open-activity" && userCanMaster()) {
        state.minimized = false;
        state.mode = "master";
        state.masterTab = "network";
        render();
        return;
      }
      if (action === "mini-open-messages") {
        state.minimized = false;
        state.runnerTab = "messages";
        render();
        return;
      }
      if (action === "mini-open-jobs") {
        state.minimized = false;
        state.runnerTab = "jobs";
        render();
        return;
      }
      if (action === "mini-open-call") {
        const c =
          currentRunnerData()?.calls?.find((x) => x.status === "ringing") ||
          currentRunnerData()?.calls?.find((x) => x.status === "accepted");
        state.minimized = false;
        state.runnerTab = "calls";
        if (c) {
          state.modal = { type: "call-view", id: c.id };
          await markRead("calls", c.id);
        }
        render();
        return;
      }
      if (action === "master-event-open" && userCanMaster()) {
        await openMasterEvent(el.dataset.group, el.dataset.event);
        return;
      }
      if (action === "mark-all-events" && userCanMaster()) {
        await markAllMasterEventsRead();
        return;
      }
      if (action === "logout") {
        state.modal = null;
        state.minimized = false;
        state.runnerSimulation = false;
        state.mode = "login";
        state.width = userCanMaster() ? 760 : 470;
        state.height = 660;
        render();
        return;
      }
      if (action === "login-master" && userCanMaster()) {
        unlockMasterMode();
        return;
      }
      if (action === "login-runner-actor") {
        await selectRunnerActor(el.dataset.actor);
        await requestRunnerLogin();
        return;
      }
      if (action === "login-runner") {
        await requestRunnerLogin();
        return;
      }
      if (action === "unlock-runner-login") {
        await unlockRunnerLogin();
        return;
      }
      if (action === "switch-mode" && userCanMaster()) {
        if (state.mode === "master") {
          enterRunnerMode(true);
        } else {
          unlockMasterMode();
        }
        return;
      }
      if (action === "master-sender" && userCanMaster()) {
        const cfg = state.control.masterSender || {};
        if (["message", "call", "job"].includes(state.modal?.type))
          state.senderReturnModal = clone(state.modal);
        state.modal = {
          type: "master-sender",
          manualName: cfg.manualName,
          manualImage: cfg.manualImage,
          defaultIdentityVisible: cfg.identityVisible !== false,
        };
        render();
        return;
      }
      if (action === "select-master-sender-actor" && userCanMaster()) {
        state.control.masterSender.actorId = el.dataset.actor || "";
        state.runnerActorId = el.dataset.actor || state.runnerActorId;
        await saveControl();
        if (state.senderReturnModal) {
          const sp = masterSenderProfile(),
            m = state.senderReturnModal,
            pub = publicSender(sp, m.type, m.identityVisible !== false);
          m.senderActorId = sp.actorId;
          m.actualSenderName = sp.name;
          m.senderImage = sp.image;
          if (m.type === "message") m.senderName = pub.name;
          if (m.type === "call") m.name = pub.name;
          if (m.type === "job") m.fixerName = pub.name;
          state.senderReturnModal = null;
          state.modal = m;
        } else state.modal = { type: "master-sender" };
        render();
        return;
      }
      if (action === "clear-master-sender" && userCanMaster()) {
        const m = state.modal || {};
        state.control.masterSender = {
          actorId: "",
          manualName: text(m.manualName) || "COMM-LINK",
          manualImage: text(m.manualImage),
          identityVisible: m.defaultIdentityVisible !== false,
        };
        await saveControl();
        if (state.senderReturnModal) {
          const sp = masterSenderProfile(),
            ret = state.senderReturnModal,
            pub = publicSender(sp, ret.type, ret.identityVisible !== false);
          ret.senderActorId = sp.actorId;
          ret.actualSenderName = sp.name;
          ret.senderImage = sp.image;
          if (ret.type === "message") ret.senderName = pub.name;
          if (ret.type === "call") ret.name = pub.name;
          if (ret.type === "job") ret.fixerName = pub.name;
          state.senderReturnModal = null;
          state.modal = ret;
        } else state.modal = null;
        render();
        return;
      }
      if (action === "open-actor-contact-picker" && userCanMaster()) {
        const a =
          state.modal?.type === "contact"
            ? state.modal.audienceSelected || []
            : newAudience().selected;
        state.modal = {
          type: "actor-contact-picker",
          audienceSelected: [...a],
          audience: [...a],
        };
        render();
        return;
      }
      if (action === "pick-actor-contact" && userCanMaster()) {
        const a = actorById(el.dataset.actor);
        if (!a) return;
        const selected = state.modal?.audienceSelected || [];
        state.modal = {
          type: "contact",
          audienceSelected: [...selected],
          audience: [...selected],
          name: a.name,
          handle: "",
          image: actorImage(a),
          tokenImage: text(a.prototypeToken?.texture?.src),
          actorImage: text(a.img),
          actorUuid: text(a.uuid),
          actorId: a.id,
          tokenUuid: "",
          tags: [],
          summary: "",
        };
        render();
        return;
      }
      if (action === "relay-retry") {
        await retryOwnRequests();
        return;
      }
      if (action === "diagnostics") {
        await openDiagnostics(false);
        return;
      }
      if (action === "diag-rerun") {
        await openDiagnostics(false);
        return;
      }
      if (action === "diag-deep") {
        await openDiagnostics(true);
        return;
      }
      if (action === "diag-clear") {
        resetDiagnostics();
        await openDiagnostics(false);
        return;
      }
      if (action === "diag-copy") {
        try {
          await navigator.clipboard?.writeText?.(diagnosticsText());
          notify("SYS DIAGNOSTICS: отчёт скопирован.");
        } catch (error) {
          recordDiagError("clipboard", error);
          notify("Не удалось скопировать отчёт.", "warn");
        }
        return;
      }
      if (action === "fx-settings") {
        const fx = currentFxPrefs();
        state.modal = {
          type: "fx-settings",
          fxEnabled: fx.enabled,
          fxIntensity: fx.intensity,
          fxDecor: fx.decor,
          fxStatusRail: fx.statusRail,
          fxCircuits: fx.circuits,
          fxOscillator: fx.oscillator,
          fxMicrocopy: fx.microcopy,
          fxHover: fx.hoverMotion,
          fxEvents: fx.eventPulse,
          fxCall: fx.callPulse,
          fxGlitch: fx.glitch,
        };
        render();
        return;
      }
      if (action === "fx-preset") {
        applyFxPreset(el.dataset.preset);
        return;
      }
      if (action === "save-fx-settings") {
        await saveFxSettings();
        return;
      }
      if (action === "edit-runner-profile") {
        const p = runnerProfile();
        state.modal = {
          type: "runner-profile",
          profileName: p.displayName,
          profileImage: p.image,
          skin: p.skin,
          soundEnabled: p.soundEnabled,
          soundVolume: p.soundVolume,
          backgroundNotifications: p.backgroundNotifications !== false,
          pinEnabled: !!p.pinHash,
          hasPin: !!p.pinHash,
          newPin: "",
        };
        render();
        return;
      }
      if (action === "select-skin" && state.modal?.type === "runner-profile") {
        state.modal.skin = el.dataset.skin;
        render();
        return;
      }
      if (action === "save-runner-profile") {
        await saveRunnerProfile();
        return;
      }
      if (action === "reset-preview" && isRunnerSimulation()) {
        resetPreviewData();
        state.modal = null;
        render();
        return;
      }
      if (action === "exit-simulation" && isRunnerSimulation()) {
        state.runnerSimulation = false;
        state.previewDataByGroup.delete(currentRunnerGroupId());
        state.modal = null;
        render();
        notify("EDGERUNNER LIVE: действия теперь записываются в сеть команды.");
        return;
      }
      if (action === "master-tab") {
        state.masterTab = el.dataset.tab;
        render();
        return;
      }
      if (action === "toggle-master-call-archive") {
        state.showMasterCallArchive = !state.showMasterCallArchive;
        render();
        return;
      }
      if (action === "toggle-master-job-archive") {
        state.showMasterJobArchive = !state.showMasterJobArchive;
        render();
        return;
      }
      if (action === "runner-tab") {
        state.runnerTab = el.dataset.tab;
        render();
        return;
      }
      if (action === "toggle-runner-call-archive") {
        state.showRunnerCallArchive = !state.showRunnerCallArchive;
        render();
        return;
      }
      if (action === "toggle-runner-job-archive") {
        state.showRunnerJobArchive = !state.showRunnerJobArchive;
        render();
        return;
      }
      if (action === "runner-group") {
        if (el.value) switchToRunnerGroup(el.value);
        return;
      }
      if (action === "preview-group" && userCanMaster()) {
        openRunnerPreviewForGroup(el.dataset.group);
        return;
      }
      if (action === "new-group") {
        state.modal = { type: "group-name", name: "" };
        render();
        return;
      }
      if (action === "open-group-dashboard") {
        const g = state.control.groups.find((x) => x.id === el.dataset.id);
        if (g) {
          state.modal = { type: "group-dashboard", id: g.id };
          render();
        }
        return;
      }
      if (action === "rename-group") {
        const g = state.control.groups.find((x) => x.id === el.dataset.id);
        if (g) {
          state.modal = { type: "rename-group", id: g.id, name: g.name };
          render();
        }
        return;
      }
      if (action === "delete-group") {
        await deleteGroup(el.dataset.id);
        return;
      }
      if (action === "open-group-actor-picker") {
        state.actorSearch = "";
        state.modal = { type: "group-actor-picker", groupId: el.dataset.group };
        render();
        return;
      }
      if (action === "add-group-actor") {
        await addActorToGroup(el.dataset.group, el.dataset.actor);
        return;
      }
      if (action === "add-selected-actor-group") {
        const selected = selectedTokenIdentity();
        if (!selected?.actorId)
          return notify("Выделите токен Actor на сцене.", "warn");
        await addActorToGroup(el.dataset.group, selected.actorId);
        return;
      }
      if (action === "remove-group-actor") {
        await removeActorFromGroup(el.dataset.group, el.dataset.actor);
        return;
      }
      if (action === "set-group-leader-actor") {
        await setGroupLeaderActor(el.dataset.group, el.dataset.actor);
        return;
      }
      if (action === "actor-to-contact") {
        const groupId = el.dataset.group;
        await addActorAsContact(el.dataset.actor, [groupId]);
        state.masterTab = "groups";
        state.modal = { type: "group-dashboard", id: groupId };
        render();
        return;
      }
      if (action === "new-message") {
        openPublish("message");
        return;
      }
      if (action === "new-call") {
        openPublish("call");
        return;
      }
      if (action === "new-job") {
        openPublish("job");
        return;
      }
      if (action === "quick-message") {
        openPublish("message", [el.dataset.group]);
        return;
      }
      if (action === "quick-call") {
        openPublish("call", [el.dataset.group]);
        return;
      }
      if (action === "quick-job") {
        openPublish("job", [el.dataset.group]);
        return;
      }
      if (action === "quick-contact") {
        openPublish("contact", [el.dataset.group]);
        return;
      }
      if (action === "contact-quick-message" && userCanMaster()) {
        event.stopPropagation();
        openContactAction("message", el.dataset.contact, el.dataset.group);
        return;
      }
      if (action === "contact-quick-call" && userCanMaster()) {
        openContactAction("call", el.dataset.contact, el.dataset.group);
        return;
      }
      if (action === "contact-quick-job" && userCanMaster()) {
        openContactAction("job", el.dataset.contact, el.dataset.group);
        return;
      }
      if (action === "new-contact") {
        openPublish("contact");
        return;
      }
      if (action === "add-selected-actor-contact" && userCanMaster()) {
        const selected = selectedTokenIdentity();
        if (!selected?.actorId)
          return notify("Выделите токен Actor на сцене.", "warn");
        await addActorAsContact(selected.actorId);
        return;
      }
      if (action === "add-selected-actor-contact-group" && userCanMaster()) {
        const selected = selectedTokenIdentity();
        if (!selected?.actorId)
          return notify("Выделите токен Actor на сцене.", "warn");
        await addActorAsContact(selected.actorId, [el.dataset.group]);
        return;
      }
      if (action === "add-selected-actor-contact-all" && userCanMaster()) {
        const selected = selectedTokenIdentity();
        if (!selected?.actorId)
          return notify("Выделите токен Actor на сцене.", "warn");
        await addActorAsContact(
          selected.actorId,
          state.control.groups.map((g) => g.id),
        );
        return;
      }
      if (action === "runner-new-contact") {
        state.modal = {
          type: "runner-contact",
          name: "",
          handle: "",
          image: "",
          tagsRaw: "",
          summary: "",
        };
        render();
        return;
      }
      if (action === "save-runner-contact") {
        await saveRunnerContact();
        return;
      }
      if (action === "edit-runner-contact") {
        editRunnerContact(el.dataset.id);
        return;
      }
      if (action === "delete-runner-contact") {
        await deleteRunnerContact(el.dataset.id);
        return;
      }
      if (action === "runner-contact-message") {
        openRunnerContactMessage(el.dataset.id);
        return;
      }
      if (action === "send-runner-contact-message") {
        await sendRunnerContactMessage(el.dataset.id);
        return;
      }
      if (action === "open-crew-member") {
        openCrewMember(el.dataset.actor);
        return;
      }
      if (action === "open-actor-sheet") {
        openActorSheetById(el.dataset.actor);
        return;
      }
      if (action === "fill-contact-selected-token") {
        fillContactFromSelectedToken();
        return;
      }
      if (action === "modal-close") {
        if (state.modal?.type === "master-sender" && userCanMaster()) {
          await saveControl();
          if (state.senderReturnModal) {
            state.modal = state.senderReturnModal;
            state.senderReturnModal = null;
            render();
            return;
          }
        }
        state.modal = null;
        render();
        return;
      }
      if (action === "audience-toggle") {
        toggleAudience(el.dataset.id);
        return;
      }
      if (action === "save-group-name") {
        await createGroup();
        return;
      }
      if (action === "save-rename-group") {
        await renameGroup();
        return;
      }
      if (action === "publish-contact") {
        await publishContact();
        return;
      }
      if (action === "publish-message") {
        await publishMessage();
        return;
      }
      if (action === "publish-call") {
        await publishCall();
        return;
      }
      if (action === "publish-job") {
        await publishJob();
        return;
      }
      if (action === "open-thread") {
        await openThread(el.dataset.thread, el.dataset.message);
        return;
      }
      if (action === "send-reply") {
        await sendReply(el.dataset.thread);
        return;
      }
      if (action === "open-master-thread") {
        await markMasterEventsFor(
          el.dataset.group,
          "thread",
          "",
          el.dataset.thread,
        );
        state.modal = {
          type: "master-thread",
          groupId: el.dataset.group,
          threadId: el.dataset.thread,
          masterReply: "",
        };
        render();
        return;
      }
      if (action === "send-master-reply") {
        await sendMasterReply(el.dataset.group, el.dataset.thread);
        return;
      }
      if (action === "edit-master-message") {
        openMasterMessageEdit(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "save-master-message") {
        await saveMasterMessageEdit();
        return;
      }
      if (action === "open-job") {
        state.modal = { type: "job-view", id: el.dataset.id };
        await markRead("jobs", el.dataset.id);
        render();
        return;
      }
      if (action === "accept-job") {
        await acceptJob(el.dataset.id);
        return;
      }
      if (action === "decline-job") {
        await declineJob(el.dataset.id);
        return;
      }
      if (action === "open-master-job") {
        await markMasterEventsFor(el.dataset.group, "job", el.dataset.id);
        openMasterJob(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "save-master-job") {
        await saveMasterJob(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "master-job-status") {
        await setMasterJobStatus(
          el.dataset.group,
          el.dataset.id,
          el.dataset.status,
        );
        return;
      }
      if (action === "confirm-job-settlement") {
        await confirmJobSettlement();
        return;
      }
      if (action === "confirm-job-status-no-pay") {
        await finalizeJobStatus(
          el.dataset.group,
          el.dataset.id,
          el.dataset.status,
          null,
        );
        return;
      }
      if (action === "reset-job-settlement") {
        await resetJobSettlement(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "open-call") {
        state.modal = { type: "call-view", id: el.dataset.id };
        await markRead("calls", el.dataset.id);
        render();
        return;
      }
      if (action === "accept-call") {
        await setCallStatus(el.dataset.id, "accepted");
        return;
      }
      if (action === "decline-call") {
        await setCallStatus(el.dataset.id, "declined");
        return;
      }
      if (action === "end-call-master") {
        await endCallMaster(el.dataset.id, el.dataset.group);
        return;
      }
      if (action === "open-master-call") {
        await markMasterEventsFor(el.dataset.group, "call", el.dataset.id);
        state.modal = {
          type: "master-call",
          id: el.dataset.id,
          groupId: el.dataset.group,
          line: "",
        };
        render();
        return;
      }
      if (action === "send-call-line-master") {
        await appendCallLine(
          el.dataset.group,
          el.dataset.id,
          "npc",
          state.modal?.line,
        );
        return;
      }
      if (action === "send-call-line-sim-master") {
        await appendSimMasterCallLine(
          el.dataset.id,
          state.modal?.simMasterLine,
        );
        return;
      }
      if (action === "send-call-line-player") {
        await appendCallLine(
          currentRunnerGroupId(),
          el.dataset.id,
          "player",
          state.modal?.callReply,
        );
        return;
      }
      if (action === "end-call-player") {
        await endCallPlayer(el.dataset.id);
        return;
      }
      if (action === "open-contact") {
        state.modal = { type: "contact-view", id: el.dataset.id };
        render();
        return;
      }
      if (action === "open-master-contact") {
        openMasterContact(el.dataset.id);
        return;
      }
      if (action === "delete-master-contact" && userCanMaster()) {
        await deleteMasterContact(el.dataset.id);
        return;
      }
      if (action === "delete-master-job" && userCanMaster()) {
        await deleteMasterJob(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "delete-master-call" && userCanMaster()) {
        await deleteMasterCall(el.dataset.group, el.dataset.id);
        return;
      }
      if (action === "delete-master-thread" && userCanMaster()) {
        await deleteMasterThread(el.dataset.group, el.dataset.thread);
        return;
      }
      if (action === "contact-avatar-message" && userCanMaster()) {
        event.stopPropagation();
        const groups = groupsContaining("contacts", el.dataset.id);
        if (groups.length === 1)
          openContactAction("message", el.dataset.id, groups[0]);
        else {
          openMasterContact(el.dataset.id);
          notify("Выберите команду в быстрых действиях контакта.");
        }
        return;
      }
      if (action === "save-master-contact") {
        await saveMasterContact();
        return;
      }
      if (action === "import-datapad") {
        const items = datapadContacts();
        state.modal = {
          type: "datapad-import",
          items,
          selected: [],
          audienceSelected: [],
          audience: [],
        };
        render();
        return;
      }
      if (action === "toggle-import-contact") {
        toggleImportContact(el.dataset.id);
        return;
      }
      if (action === "publish-imported") {
        await publishImported();
        return;
      }
    } catch (error) {
      recordDiagError(`action:${action}`, error);
      console.error("COMM-LINK action error", action, error);
      notify(`COMM-LINK: ${error?.message || error}`, "error");
    } finally {
      recordActionPerf(action, diagNow() - __diagActionStart);
    }
  }

  function toggleAudience(id) {
    const m = state.modal;
    if (!m) return;
    m.audienceSelected ??= [];
    if (id === "__all__") {
      m.audienceSelected = m.audienceSelected.includes(id) ? [] : [id];
    } else {
      m.audienceSelected = m.audienceSelected.filter((x) => x !== "__all__");
      m.audienceSelected = m.audienceSelected.includes(id)
        ? m.audienceSelected.filter((x) => x !== id)
        : [...m.audienceSelected, id];
    }
    m.audience = m.audienceSelected;
    render();
  }
  function enterRunnerMode(simulation = false) {
    state.modal = null;
    state.mode = "edgerunner";
    state.runnerSimulation = !!(simulation && userCanMaster());
    state.minimized = false;
    state.width = Math.min(470, (globalThis.innerWidth || 1200) - 30);
    state.height = Math.min(790, (globalThis.innerHeight || 900) - 40);
    if (userCanMaster()) {
      if (!state.previewGroupId)
        state.previewGroupId =
          state.control.groups.find((g) =>
            (g.actorIds || []).includes(currentRunnerActorId()),
          )?.id ||
          state.control.groups[0]?.id ||
          "";
      if (state.runnerSimulation) resetPreviewData(state.previewGroupId);
    }
    seedNotificationState();
    render();
  }
  async function requestRunnerLogin() {
    const p = runnerProfile();
    if (p.pinHash) {
      state.loginTarget = "runner";
      state.modal = { type: "runner-login-pin", pin: "", error: "" };
      render();
      return;
    }
    enterRunnerMode(false);
  }
  async function unlockRunnerLogin() {
    const user = game.user, actor = currentRunnerActor(), actorId = actor?.id;
    const pin = state.modal?.pin, originalHash = runnerProfile().pinHash;
    const stillCurrent = () => game.user === user && currentRunnerActorId() === actorId &&
      actorAccessibleToUser(actor, user) && state.modal?.type === "runner-login-pin" &&
      runnerProfile().pinHash === originalHash;
    const ok = await verifyCommLinkPin(pin, originalHash);
    if (!stillCurrent()) return;
    if (!ok) {
      state.modal = {
        type: "runner-login-pin",
        pin: "",
        error: "Неверный PIN профиля.",
      };
      render();
      return;
    }
    const nativeProfiles = user.flags?.[FLAG_SCOPE]?.commLink?.profiles || {};
    if (originalHash.startsWith("fallback:") || !Object.hasOwn(nativeProfiles, actorId)) {
      const pinHash = originalHash.startsWith("fallback:") ? await hashPin(pin) : originalHash;
      if (!stillCurrent()) return;
      const profile = runnerProfileStore()[actorId] || {};
      await user.update({ [`flags.${FLAG_ROOT}.profiles.${actorId}`]: { ...profile, pinHash } });
      if (game.user !== user || currentRunnerActorId() !== actorId || !actorAccessibleToUser(actor, user) ||
        state.modal?.type !== "runner-login-pin" || runnerProfile().pinHash !== pinHash) return;
    }
    enterRunnerMode(false);
  }
  function toggleMinimize() {
    mountOptions.onMinimize?.();
  }
  function unlockMasterMode() {
    if (!userCanMaster()) return;
    state.loginTarget = "";
    state.modal = null;
    state.runnerSimulation = false;
    state.mode = "master";
    state.minimized = false;
    state.width = Math.min(1120, (globalThis.innerWidth || 1200) - 40);
    state.height = Math.min(790, (globalThis.innerHeight || 900) - 40);
    seedNotificationState();
    render();
  }
  async function createGroup() {
    const name = text(state.modal?.name);
    if (!name) return notify("Введите название группы.", "warn");
    if (state.control.groups.some((g) => normalize(g.name) === normalize(name)))
      return notify("Группа с таким названием уже существует.", "warn");
    const g = {
      id: uid(),
      name,
      journalId: "",
      actorIds: [],
      leaderActorId: "",
      userIds: [],
      createdAt: now(),
    };
    state.control.groups.push(g);
    await saveControl();
    await ensureGroupDoc(g);
    await refreshData();
    state.modal = { type: "group-dashboard", id: g.id };
    render();
  }
  async function renameGroup() {
    const m = state.modal,
      g = state.control.groups.find((x) => x.id === m?.id);
    const name = text(m?.name);
    if (!g || !name) return;
    if (
      state.control.groups.some(
        (x) => x.id !== g.id && normalize(x.name) === normalize(name),
      )
    )
      return notify("Группа с таким названием уже существует.", "warn");
    g.name = name;
    await saveControl();
    const doc = await ensureGroupDoc(g);
    if (doc) {
      const data = normalizeNetworkData(dataFlags(doc), g.id, name);
      if (text(data.groupName) !== name) {
        data.groupName = name;
        data.updatedAt = now();
        await doc.update({ [`flags.${FLAG_ROOT}.data`]: clone(data) });
        state.groupData.set(g.id, data);
        rememberGroupSnapshot(g.id, data);
      }
    }
    state.modal = null;
    await refreshData();
    render();
  }
  async function deleteGroup(id) {
    const g = state.control.groups.find((x) => x.id === id);
    if (!g) return;
    const ok = await confirmDialog(
      `Удалить группу «${g.name}»?`,
      `Журнал сети и его данные будут удалены.`,
    );
    if (!ok) return;
    const doc = groupDocById(g);
    if (doc?.delete) await doc.delete();
    state.control.groups = state.control.groups.filter((x) => x.id !== id);
    await saveControl();
    await refreshData();
    render();
  }
  async function addActorToGroup(groupId, actorId) {
    const g = groupById(groupId),
      actor = actorById(actorId);
    if (!g || !actor) return notify("Actor не найден.", "warn");
    g.actorIds ??= [];
    if (!g.actorIds.includes(actor.id)) g.actorIds.push(actor.id);
    if (!g.leaderActorId) g.leaderActorId = actor.id;
    syncGroupAccessUsers(g);
    await saveControl();
    await ensureGroupDoc(g);
    await refreshData();
    state.actorSearch = "";
    state.modal = { type: "group-dashboard", id: groupId };
    render();
  }
  async function removeActorFromGroup(groupId, actorId) {
    const g = groupById(groupId);
    if (!g) return;
    g.actorIds = (g.actorIds || []).filter((id) => id !== actorId);
    if (g.leaderActorId === actorId) g.leaderActorId = g.actorIds[0] || "";
    syncGroupAccessUsers(g);
    await saveControl();
    await ensureGroupDoc(g);
    await refreshData();
    state.modal = { type: "group-dashboard", id: groupId };
    render();
  }
  async function setGroupLeaderActor(groupId, actorId) {
    const g = groupById(groupId);
    if (!g || !(g.actorIds || []).includes(actorId)) return;
    g.leaderActorId = actorId;
    await saveControl();
    await refreshData();
    state.modal = { type: "group-dashboard", id: groupId };
    render();
  }

  async function confirmDialog(title, content) {
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (DialogV2?.confirm) {
      return await DialogV2.confirm({
        window: { title },
        content: `<p>${esc(content)}</p>`,
        yes: { label: "Да" },
        no: { label: "Нет" },
      });
    }
    return globalThis.confirm(`${title}\n\n${content}`);
  }

  function selectedMasterContact(id) {
    return allMasterContacts().find((c) => c.id === id) || null;
  }
  function fillContactFromSelectedToken() {
    const m = state.modal;
    if (!m || !["contact", "runner-contact"].includes(m.type)) return;
    const id = selectedTokenIdentity();
    if (!id) return notify("Сначала выделите токен на сцене.", "warn");
    m.name = id.name;
    m.image = id.image;
    m.tokenImage = id.tokenImage;
    m.actorImage = id.actorImage;
    m.actorUuid = id.actorUuid;
    m.actorId = id.actorId;
    m.tokenUuid = id.tokenUuid;
    render();
  }
  async function publishContact() {
    const m = state.modal;
    const name = text(m?.name);
    if (!name) return notify("Укажите имя контакта.", "warn");
    const actorId =
      text(m.actorId) || text(m.actorUuid).replace(/^Actor\./, "");
    const existing = allMasterContacts().find(
      (c) => c.id === m.id || (actorId && c.actorId === actorId),
    );
    const item = {
      ...(existing ? clone(existing) : {}),
      id: existing?.id || uid(),
      name,
      handle: text(m.handle),
      image: text(m.tokenImage) || text(m.image) || text(m.actorImage),
      tokenImage: text(m.tokenImage),
      actorImage: text(m.actorImage),
      actorUuid: text(m.actorUuid),
      actorId,
      tokenUuid: text(m.tokenUuid),
      tags: text(m.tagsRaw).split(",").map(text).filter(Boolean),
      summary: text(m.summary),
      source: "master",
      createdAt: existing?.createdAt || now(),
      createdByUserId: text(existing?.createdByUserId) || text(game.user.id),
      updatedByUserId: text(game.user.id),
      updatedAt: now(),
    };
    await upsertMasterContactShared(item);
    const audience = modalAudience(),
      targets = targetGroupIds(audience);
    if (targets.length) await publishToGroups("contact", item, audience);
    else {
      await refreshData();
      state.modal = null;
      render();
      notify(
        `Контакт «${item.name}» сохранён в общей GM-базе без доступа для команд.`,
      );
      return;
    }
    state.modal = null;
    render();
  }
  async function addActorAsContact(actorId, presetGroups = []) {
    const actor = actorById(actorId);
    if (!actor) return notify("Actor не найден.", "warn");
    const existing =
      allMasterContacts().find((c) => c.actorId === actor.id) ||
      state.control.contactTemplates.find((c) => c.actorId === actor.id) ||
      null;
    const item = existing
      ? {
          ...clone(existing),
          name: actor.name,
          image: actorImage(actor) || existing.image,
          tokenImage:
            text(actor.prototypeToken?.texture?.src) || existing.tokenImage,
          actorImage: text(actor.img) || existing.actorImage,
          actorUuid: text(actor.uuid),
          actorId: actor.id,
          source: "master",
        }
      : {
          id: uid(),
          name: actor.name,
          handle: "",
          image: actorImage(actor),
          tokenImage: text(actor.prototypeToken?.texture?.src),
          actorImage: text(actor.img),
          actorUuid: text(actor.uuid),
          actorId: actor.id,
          tokenUuid: "",
          tags: [],
          summary: "",
          source: "master",
        };
    if (presetGroups.length) {
      const targets = [...new Set(presetGroups)].filter(
        (groupId) =>
          state.control.groups.some((g) => g.id === groupId) &&
          !state.groupData
            .get(groupId)
            ?.contacts?.some((c) => c.actorId === actor.id),
      );
      if (!targets.length) {
        notify(
          `Actor «${actor.name}» уже есть в контактах выбранной сети.`,
          "warn",
        );
        render();
        return;
      }
      await publishToGroups("contact", item, { all: false, groupIds: targets });
      await upsertMasterContactShared(item);
      await refreshData();
      state.modal = null;
      state.masterTab = "contacts";
      render();
      notify(
        `«${actor.name}» добавлен в общую GM-базу и контакты: ${targets.map(groupNameById).join(", ")}.`,
      );
      return;
    }
    const a = newAudience();
    state.modal = {
      type: "contact",
      audienceSelected: a.selected,
      audience: a.selected,
      ...item,
      tagsRaw: "",
    };
    render();
  }
  async function saveRunnerContact() {
    const m = state.modal,
      groupId = currentRunnerGroupId(),
      data0 = currentRunnerData();
    if (!data0 || !groupId) return notify("Нет активной сети.", "warn");
    const name = text(m?.name);
    if (!name) return notify("Укажите имя контакта.", "warn");
    const payload = {
      id: text(m?.id),
      name,
      handle: text(m?.handle),
      image: text(m?.image) || text(m?.tokenImage) || text(m?.actorImage),
      tokenImage: text(m?.tokenImage),
      actorImage: text(m?.actorImage),
      actorUuid: text(m?.actorUuid),
      actorId: text(m?.actorId),
      tokenUuid: text(m?.tokenUuid),
      tags: text(m?.tagsRaw).split(",").map(text).filter(Boolean),
      summary: text(m?.summary),
    };
    if (payload.id) {
      const current = data0.contacts.find((c) => c.id === payload.id);
      if (!current) return notify("Контакт уже не существует.", "warn");
      if (current.source !== "player")
        return notify("Сетевой контакт редактирует MASTER.", "warn");
    }
    if (isRunnerSimulation()) {
      const data = clone(data0);
      if (payload.id) {
        const item = data.contacts.find((c) => c.id === payload.id);
        Object.assign(item, payload, {
          id: item.id,
          source: "player",
          updatedAt: now(),
        });
        await saveRunnerData(groupId, data);
        state.modal = { type: "contact-view", id: item.id };
      } else {
        const item = {
          ...payload,
          id: uid(),
          source: "player",
          ownerActorId: currentRunnerActorId(),
          createdAt: now(),
          updatedAt: now(),
        };
        data.contacts.unshift(item);
        await saveRunnerData(groupId, data);
        state.modal = null;
        state.runnerTab = "contacts";
      }
      render();
      notify(`SIMULATION: контакт «${name}» сохранён.`);
      return;
    }
    await submitRunnerMutationRequest("contact-upsert", payload, groupId);
    state.modal = null;
    state.runnerTab = "contacts";
    render();
    notify(`Контакт «${name}»: изменение отправлено MASTER.`);
  }
  async function deleteRunnerContact(id) {
    const groupId = currentRunnerGroupId(),
      data0 = currentRunnerData(),
      c = data0?.contacts?.find((x) => x.id === id);
    if (!data0 || !c) return;
    if (c.source !== "player")
      return notify("Сетевой контакт может удалить только MASTER.", "warn");
    const ok = await confirmDialog(
      `Удалить контакт «${c.name}»?`,
      `Запись исчезнет из адресной книги текущей команды. История сообщений и звонков останется в журнале.`,
    );
    if (!ok) return;
    if (isRunnerSimulation()) {
      const data = clone(data0);
      data.contacts = data.contacts.filter((x) => x.id !== id);
      await saveRunnerData(groupId, data);
      state.modal = null;
      render();
      notify(`SIMULATION: контакт «${c.name}» удалён.`);
      return;
    }
    await submitRunnerMutationRequest("contact-delete", { id }, groupId);
    state.modal = null;
    render();
    notify(`Удаление «${c.name}» отправлено MASTER.`);
  }
  function editRunnerContact(id) {
    const c = currentRunnerData()?.contacts?.find((x) => x.id === id);
    if (!c) return;
    if (c.source !== "player")
      return notify("Сетевой контакт редактирует MASTER.", "warn");
    state.modal = {
      type: "runner-contact",
      id: c.id,
      name: c.name,
      handle: c.handle,
      image: c.image,
      tokenImage: c.tokenImage,
      actorImage: c.actorImage,
      actorUuid: c.actorUuid,
      actorId: c.actorId,
      tokenUuid: c.tokenUuid,
      tagsRaw: (c.tags || []).join(", "),
      summary: c.summary,
    };
    render();
  }
  function openRunnerContactMessage(id) {
    const c = currentRunnerData()?.contacts?.find((x) => x.id === id);
    if (!c) return;
    state.modal = { type: "runner-contact-compose", contactId: c.id, body: "" };
    render();
  }
  async function sendRunnerContactMessage(id) {
    const m = state.modal,
      body = text(m?.body),
      groupId = currentRunnerGroupId(),
      data0 = currentRunnerData(),
      c = data0?.contacts?.find((x) => x.id === id);
    if (!c || !groupId) return;
    if (!body) return notify("Напишите сообщение.", "warn");
    const existing = [...(data0.messages || [])]
        .filter((x) => x.contactId === c.id)
        .sort((a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        )[0],
      threadId = existing?.threadId || `contact:${c.id}`;
    if (isRunnerSimulation()) {
      const data = clone(data0),
        msg = {
          id: uid(),
          threadId,
          contactId: c.id,
          sender: "player",
          senderName: runnerSpeakerName(),
          body,
          image: runnerSpeakerIdentity().image,
          createdAt: now(),
          authorUserId: game.user.id,
        };
      data.messages.push(msg);
      await saveRunnerData(groupId, data);
      state.modal = { type: "thread", threadId, reply: "" };
      render();
      return;
    }
    await submitRunnerMutationRequest(
      "contact-message",
      { contactId: c.id, body },
      groupId,
    );
    state.modal = { type: "thread", threadId, reply: "" };
    render();
  }
  function openCrewMember(actorId) {
    state.modal = { type: "crew-member", actorId };
    render();
  }
  function openActorSheetById(actorId) {
    const actor = actorById(actorId);
    if (!actor) return notify("Actor недоступен этому пользователю.", "warn");
    try {
      actor.sheet?.render?.(true);
    } catch (_e) {
      notify("Не удалось открыть лист Actor.", "warn");
    }
  }
  async function publishMessage() {
    const m = state.modal;
    const c = selectedMasterContact(m?.contactId);
    const body = text(m?.body),
      profile = {
        actorId: text(m.senderActorId),
        name: text(m.actualSenderName) || masterSenderProfile().name,
        image: text(m.senderImage) || masterSenderProfile().image,
      };
    const pub = publicSender(
      profile,
      "message",
      m.identityVisible !== false,
      text(m.senderName),
    );
    if (!pub.name) return notify("Укажите имя отправителя.", "warn");
    if (!body) return notify("Напишите сообщение.", "warn");
    const publicationId = uid(),
      threadId = c?.id
        ? `${c.id}:${normalize(pub.name)}`
        : `manual-${normalize(pub.name) || uid()}`;
    const item = {
      id: uid(),
      publicationId,
      threadId,
      contactId: c?.id || "",
      sender: "npc",
      senderName: pub.name,
      senderActorId: profile.actorId,
      senderImage: pub.image || "",
      body,
      image: m.identityVisible !== false ? pub.image || c?.image || "" : "",
      createdAt: now(),
    };
    savePublicationMeta(
      publicationId,
      "message",
      profile,
      m.identityVisible,
      pub.name,
    );
    await saveControl();
    await publishToGroups("message", item, modalAudience());
    state.modal = null;
    render();
  }
  async function publishCall() {
    const m = state.modal;
    const c = selectedMasterContact(m?.contactId),
      profile = {
        actorId: text(m.senderActorId),
        name: text(m.actualSenderName) || masterSenderProfile().name,
        image: text(m.senderImage) || masterSenderProfile().image,
      };
    const pub = publicSender(
      profile,
      "call",
      m.identityVisible !== false,
      text(m.name),
    );
    if (!pub.name) return notify("Укажите имя или номер звонящего.", "warn");
    const publicationId = uid(),
      item = {
        id: uid(),
        publicationId,
        contactId: c?.id || "",
        name: pub.name,
        senderActorId: profile.actorId,
        senderImage: pub.image || "",
        image: m.identityVisible !== false ? pub.image || c?.image || "" : "",
        note: text(m?.note),
        status: "ringing",
        transcript: [],
      };
    savePublicationMeta(
      publicationId,
      "call",
      profile,
      m.identityVisible,
      pub.name,
    );
    await saveControl();
    await publishToGroups("call", item, modalAudience(), {
      independentIds: true,
    });
    state.modal = null;
    render();
  }
  async function publishJob() {
    const m = state.modal;
    const c = selectedMasterContact(m?.fixerId),
      profile = {
        actorId: text(m.senderActorId),
        name: text(m.actualSenderName) || masterSenderProfile().name,
        image: text(m.senderImage) || masterSenderProfile().image,
      };
    const title = text(m?.title),
      pub = publicSender(
        profile,
        "job",
        m.identityVisible !== false,
        text(m.fixerName),
      );
    if (!pub.name) return notify("Укажите имя фиксера.", "warn");
    if (!title) return notify("Введите название заказа.", "warn");
    if (!jobMapPointExists(text(m.cityMarkerId)))
      return notify(
        "Точка удалена. Выберите существующую точку карты.",
        "warn",
      );
    const publicationId = uid(),
      item = {
        id: uid(),
        publicationId,
        fixerId: c?.id || "",
        fixerName: pub.name,
        fixerActorId: profile.actorId,
        fixerImage:
          m.identityVisible !== false ? pub.image || c?.image || "" : "",
        title,
        summary: text(m?.summary),
        details: text(m?.details),
        pay: text(m?.pay),
        currency: "Credits",
        deadline: text(m?.deadline),
        risk: Math.max(1, Math.min(5, Number(m?.risk) || 3)),
        status: "available",
        acceptedBy: "",
        cityMarkerId: text(m?.cityMarkerId),
        settlement: null,
      };
    savePublicationMeta(
      publicationId,
      "job",
      profile,
      m.identityVisible,
      pub.name,
    );
    await saveControl();
    await publishToGroups("job", item, modalAudience(), {
      independentIds: true,
    });
    state.modal = null;
    render();
  }

  async function syncItemVisibility(kind, id, changes, targetGroupIds) {
    const targets = new Set(targetGroupIds);
    let seed = null;
    for (const [groupId, doc] of state.groupDocs) {
      const live = normalizeNetworkData(
          dataFlags(doc),
          groupId,
          groupNameById(groupId),
        ),
        found = (live[kind] || []).find((x) => x.id === id);
      if (found && !seed) seed = clone(found);
    }
    if (!seed) return;
    Object.assign(seed, changes, { updatedAt: now() });
    for (const groupId of state.control.groups.map((g) => g.id))
      await mutateLiveGroup(groupId, (data) => {
        const arr = data[kind] || [],
          idx = arr.findIndex((x) => x.id === id);
        if (targets.has(groupId)) {
          if (idx >= 0)
            arr[idx] = { ...arr[idx], ...clone(changes), updatedAt: now() };
          else arr.unshift(clone(seed));
          data[kind] = arr;
          return true;
        }
        if (idx >= 0) {
          arr.splice(idx, 1);
          data[kind] = arr;
          return true;
        }
        return false;
      });
    await refreshData();
  }
  async function deleteMasterContact(id) {
    if (!userCanMaster()) return;
    const item = selectedMasterContact(id);
    if (!item) return;
    const ok = await confirmDialog(
      `Удалить контакт «${item.name}»?`,
      `Контакт будет удалён из ОБЩЕЙ GM-базы и из всех групп, где он опубликован. История сообщений/звонков останется.`,
    );
    if (!ok) return;
    for (const groupId of state.control.groups.map((g) => g.id)) {
      await mutateLiveGroup(groupId, (data) => {
        const before = data.contacts.length;
        data.contacts = data.contacts.filter(
          (x) =>
            !(
              x.source !== "player" &&
              (x.id === id ||
                (item.actorId && x.actorId === item.actorId) ||
                x.id === item.id)
            ),
        );
        return data.contacts.length !== before;
      });
    }
    await deleteMasterContactShared(id);
    state.control.contactTemplates = (
      state.control.contactTemplates || []
    ).filter((x) => x.id !== id);
    await saveControl();
    await refreshData();
    state.modal = null;
    closeContextMenu();
    render();
    notify(`Контакт «${item.name}» удалён из общей GM-базы.`);
  }
  async function deleteMasterJob(groupId, id) {
    if (!userCanMaster()) return;
    const doc = state.groupDocs.get(groupId),
      live = doc
        ? normalizeNetworkData(dataFlags(doc), groupId, groupNameById(groupId))
        : state.groupData.get(groupId),
      j = live?.jobs?.find((x) => x.id === id);
    if (!j)
      return notify("Заказ уже отсутствует или список обновился.", "warn");
    const ok = await confirmDialog(
      `Удалить заказ «${j.title}»?`,
      j.cityJobId
        ? "Заказ будет удалён из города и всех связанных команд. Личные заметки и квитанции выплат сохранятся."
        : "Контракт будет удалён из этой команды. Личные заметки и квитанции выплат сохранятся.",
    );
    if (!ok) return;
    await controller.deleteJob({ groupId, jobId: id });
    await refreshData();
    state.modal = null;
    closeContextMenu();
    render();
    notify(`Заказ «${j.title}» удалён.`);
  }
  async function deleteMasterCall(groupId, id) {
    if (!userCanMaster()) return;
    const doc = state.groupDocs.get(groupId),
      live = doc
        ? normalizeNetworkData(dataFlags(doc), groupId, groupNameById(groupId))
        : state.groupData.get(groupId),
      c = live?.calls?.find((x) => x.id === id);
    if (!c)
      return notify(
        "Запись звонка уже отсутствует или список обновился.",
        "warn",
      );
    const ok = await confirmDialog(
      `Удалить запись звонка «${c.name}»?`,
      `История этого звонка исчезнет из сети команды.`,
    );
    if (!ok) return;
    await mutateLiveGroup(groupId, (data) => {
      data.calls = data.calls.filter((x) => x.id !== id);
      data.events = (data.events || []).filter(
        (e) => !(e.targetType === "call" && e.targetId === id),
      );
    });
    await refreshData();
    state.modal = null;
    closeContextMenu();
    render();
    notify(`Запись звонка «${c.name}» удалена.`);
  }
  async function deleteMasterThread(groupId, threadId) {
    if (!userCanMaster()) return;
    const doc = state.groupDocs.get(groupId),
      live = doc
        ? normalizeNetworkData(dataFlags(doc), groupId, groupNameById(groupId))
        : state.groupData.get(groupId),
      arr = live?.messages?.filter((x) => x.threadId === threadId) || [];
    if (!arr.length)
      return notify("Диалог уже отсутствует или список обновился.", "warn");
    const ok = await confirmDialog(
      "Удалить диалог?",
      `Будут удалены ${arr.length} сообщений этой переписки из команды «${groupNameById(groupId)}».`,
    );
    if (!ok) return;
    await mutateLiveGroup(groupId, (data) => {
      data.messages = data.messages.filter((x) => x.threadId !== threadId);
      data.events = (data.events || []).filter(
        (e) => !(e.targetType === "thread" && e.threadId === threadId),
      );
    });
    await refreshData();
    state.modal = null;
    closeContextMenu();
    render();
    notify("Диалог удалён.");
  }
  function openMasterContact(id) {
    const item = selectedMasterContact(id);
    if (!item) return;
    state.modal = {
      type: "master-contact",
      id,
      name: item.name,
      handle: item.handle,
      image: item.image,
      tagsRaw: (item.tags || []).join(", "),
      summary: item.summary,
      audienceSelected: groupsContaining("contacts", id),
    };
    render();
  }
  function resolvedModalGroupIds() {
    const a = modalAudience();
    return a.all ? state.control.groups.map((g) => g.id) : a.groupIds;
  }
  async function saveMasterContact() {
    const m = state.modal;
    if (!m?.id) return;
    const current = selectedMasterContact(m.id);
    if (!current) return notify("Контакт не найден в общей GM-базе.", "warn");
    const groups = resolvedModalGroupIds();
    const targets = new Set(groups);
    const changes = {
      name: text(m.name) || "Без имени",
      handle: text(m.handle),
      image: text(m.image),
      tags: text(m.tagsRaw).split(",").map(text).filter(Boolean),
      summary: text(m.summary),
      updatedAt: now(),
      updatedByUserId: text(game.user.id),
    };
    const shared = {
      ...clone(current),
      ...clone(changes),
      id: m.id,
      source: "master",
    };
    await upsertMasterContactShared(shared);
    for (const groupId of state.control.groups.map((g) => g.id)) {
      await mutateLiveGroup(groupId, (data) => {
        const idx = data.contacts.findIndex(
          (x) =>
            x.id === m.id ||
            (x.source !== "player" &&
              ((current.actorId && x.actorId === current.actorId) ||
                x.id === current.id)),
        );
        if (targets.has(groupId)) {
          if (idx >= 0) {
            const keepId = data.contacts[idx].id;
            data.contacts[idx] = {
              ...data.contacts[idx],
              ...clone(changes),
              id: keepId,
              source: "master",
              actorId: text(shared.actorId) || text(data.contacts[idx].actorId),
            };
          } else
            data.contacts.unshift({
              ...clone(shared),
              createdAt: shared.createdAt || now(),
            });
          return true;
        }
        if (idx >= 0) {
          data.contacts.splice(idx, 1);
          return true;
        }
        return false;
      });
    }
    const t = state.control.contactTemplates.find((x) => x.id === m.id);
    if (t) {
      Object.assign(t, clone(changes));
      await saveControl();
    }
    await refreshData();
    state.modal = null;
    render();
    notify(`Контакт «${shared.name}» сохранён в общей GM-базе.`);
  }
  function openMasterMessageEdit(groupId, id) {
    const item = state.groupData
      .get(groupId)
      ?.messages.find((x) => x.id === id);
    if (!item || item.sender === "player") return;
    state.modal = {
      type: "message-edit",
      id,
      senderName: item.senderName,
      body: item.body,
      audienceSelected: groupsContaining("messages", id),
      audience: groupsContaining("messages", id),
    };
    render();
  }
  async function saveMasterMessageEdit() {
    const m = state.modal;
    if (!m?.id) return;
    const groups = resolvedModalGroupIds();
    if (!groups.length) return notify("Выберите хотя бы одну группу.", "warn");
    const body = text(m.body),
      senderName = text(m.senderName);
    if (!senderName) return notify("Укажите имя отправителя.", "warn");
    if (!body) return notify("Сообщение не может быть пустым.", "warn");
    await syncItemVisibility("messages", m.id, { body, senderName }, groups);
    state.modal = null;
    state.masterTab = "messages";
    render();
  }
  async function sendMasterReply(groupId, threadId) {
    const body = text(state.modal?.masterReply);
    if (!body) return;
    await mutateLiveGroup(groupId, (data) => {
      const arr = data.messages.filter((x) => x.threadId === threadId);
      if (!arr.length) return false;
      const npc = arr.find((x) => x.sender !== "player"),
        base = arr[0],
        contactId = npc?.contactId || base?.contactId || "",
        senderName =
          text(npc?.senderName) || contactName(data, contactId, "COMM-LINK");
      data.messages.push({
        id: uid(),
        threadId,
        contactId,
        sender: "npc",
        senderName,
        body,
        image: contactImage(data, contactId) || npc?.image || "",
        createdAt: now(),
        authorUserId: game.user.id,
      });
      return true;
    });
    await markMasterEventsFor(groupId, "thread", "", threadId);
    await refreshData();
    state.modal = { type: "master-thread", groupId, threadId, masterReply: "" };
    render();
  }
  function openMasterJob(groupId, id) {
    const j = state.groupData.get(groupId)?.jobs.find((x) => x.id === id);
    if (!j) return;
    state.modal = {
      type: "master-job",
      groupId,
      id,
      title: j.title,
      fixerName: j.fixerName,
      summary: j.summary,
      details: j.details,
      pay: j.pay,
      currency: j.currency,
      risk: j.risk,
      deadline: j.deadline,
      cityMarkerId: j.cityMarkerId,
    };
    render();
  }
  async function saveMasterJob(groupId, id) {
    const m = state.modal;
    if (!m) return;
    const changed = await mutateLiveGroup(groupId, (data) => {
      const j = data.jobs.find((x) => x.id === id);
      if (!j) return false;
      const cityMarkerId = text(m.cityMarkerId),
        pointChanged = cityMarkerId !== text(j.cityMarkerId);
      if (pointChanged && !jobMapPointExists(cityMarkerId))
        throw new Error("Точка удалена. Выберите существующую точку карты.");
      if (pointChanged) j.version = (Number(j.version) || 0) + 1;
      Object.assign(j, {
        title: text(m.title) || "Без названия",
        fixerName: text(m.fixerName) || "Неизвестный фиксер",
        summary: text(m.summary),
        details: text(m.details),
        pay: text(m.pay),
        currency: "Credits",
        risk: Math.max(1, Math.min(5, Number(m.risk) || 3)),
        deadline: text(m.deadline),
        cityMarkerId: text(m.cityMarkerId),
        updatedAt: now(),
      });
      return true;
    });
    if (changed === false) return notify("Заказ уже отсутствует.", "warn");
    await refreshData();
    openMasterJob(groupId, id);
    notify("Заказ обновлён.");
  }
  async function setMasterJobStatus(groupId, id, status) {
    if (!["available", "completed", "failed", "cancelled"].includes(status))
      return;
    const data0 = state.groupData.get(groupId);
    if (!data0) return;
    const j = data0.jobs.find((x) => x.id === id);
    if (!j) return;
    if (["completed", "failed"].includes(status)) {
      const base = Number(String(j.pay || "").replace(/[^0-9.-]/g, "")) || 0;
      state.modal = {
        type: "job-settlement",
        groupId,
        id,
        outcome: status,
        basePay: base,
        percent: status === "completed" ? 100 : 0,
        bonus: 0,
        penalty: 0,
        note: "",
      };
      render();
      return;
    }
    await finalizeJobStatus(groupId, id, status, null);
  }
  async function finalizeJobStatus(groupId, id, status, settlement) {
    const changed = await mutateLiveGroup(groupId, (data) => {
      const j = data.jobs.find((x) => x.id === id);
      if (!j) return false;
      j.status = status;
      j.version = (Number(j.version) || 0) + 1;
      if (status === "available") {
        j.acceptedBy = "";
        j.acceptedActorId = "";
        j.acceptedUserId = "";
      }
      if (settlement) j.settlement = settlement;
      j.updatedAt = now();
      return true;
    });
    if (changed === false) return notify("Заказ уже отсутствует.", "warn");
    await refreshData();
    openMasterJob(groupId, id);
  }
  async function resetJobSettlement() {
    notify(
      "Подтверждённые и неопределённые выплаты защищены от повторного начисления. Проверьте квитанции и кошельки; автоматический сброс отключён.",
      "warn",
    );
  }
  async function confirmJobSettlement() {
    requirePrimaryGm();
    const modal = clone(state.modal);
    if (modal?.type !== "job-settlement") return;
    const key = `${modal.groupId}:${modal.id}`;
    const previous = payoutQueues.get(key) || Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const doc = state.groupDocs.get(modal.groupId),
          live = normalizeNetworkData(dataFlags(doc), modal.groupId),
          job = live.jobs.find((j) => j.id === modal.id);
        if (!job) throw new Error("Заказ отсутствует.");
        if (job.settlement?.paidAt) throw new Error("Выплата уже проведена.");
        const members = settlementMembers(modal.groupId),
          total = settlementTotal(modal),
          shares = splitShares(total, members);
        if (!members.length || members.some((m) => !m.ready))
          throw new Error(
            "Native SF2E кошелёк недоступен у одного из Actor группы. Выплата не начата.",
          );
        state.busyLabel = "Расчёт Credits…";
        if (commLinkUiOpen()) render();
        const existingLedger =
          live.payoutLedgers?.[modal.id] || job.payoutLedger;
        const initialLedger = existingLedger || {
          terms: clone(modal),
          shares: clone(shares),
        };
        const ledger = await settleCommLinkPayout({
          ledger: initialLedger,
          shares,
          operationId: `comm-link-pay:${modal.groupId}:${modal.id}`,
          getActor: actorById,
          isPrimaryGM: isPrimaryGm,
          persist: async (value) =>
            mutateLiveGroup(modal.groupId, (data) => {
              (data.payoutLedgers ??= {})[modal.id] = value;
              const current = data.jobs.find((j) => j.id === modal.id);
              if (!current) throw new Error("Заказ удалён во время выплаты.");
              current.payoutLedger = value;
              current.updatedAt = now();
              return true;
            }),
        });
        await mutateLiveGroup(modal.groupId, (data) => {
          const current = data.jobs.find((j) => j.id === modal.id);
          if (current.settlement?.paidAt) return false;
          const results = (ledger.shares || shares).map((share) => ({
              ...share,
              ...ledger.receipts[share.actorId],
            })),
            terms = ledger.terms || modal;
          const actualTotal = results.reduce((sum, r) => sum + r.amount, 0);
          current.status = terms.outcome;
          current.settlement = {
            paidAt: ledger.paidAt,
            total: actualTotal,
            basePay: Number(terms.basePay) || 0,
            percent: Number(terms.percent) || 0,
            bonus: Number(terms.bonus) || 0,
            penalty: Number(terms.penalty) || 0,
            note: text(terms.note),
            shares: results,
          };
          data.payments ??= [];
          for (const r of results)
            if (r.amount)
              data.payments.unshift({
                id: `pay:${modal.id}:${r.actorId}`,
                actorId: r.actorId,
                actorName: r.actorName,
                amount: r.amount,
                currency: "Credits",
                jobId: current.id,
                jobTitle: current.title,
                createdAt: ledger.paidAt,
              });
          appendEvent(data, {
            id: `paid:${current.id}`,
            type: "job-paid",
            source: "master",
            actorName: "MASTER",
            summary: `Расчёт по «${current.title}»: ${formatCredits(total)} Credits`,
            targetType: "job",
            targetId: current.id,
          });
          return true;
        });
        await refreshData();
        openMasterJob(modal.groupId, modal.id);
        notify(`Начислено ${formatCredits(total)} Credits.`);
      });
    payoutQueues.set(key, work);
    try {
      await work;
    } finally {
      if (payoutQueues.get(key) === work) payoutQueues.delete(key);
      state.busyLabel = "";
      if (commLinkUiOpen()) render();
    }
  }
  async function appendCallLine(groupId, id, speaker, rawBody) {
    const body = text(rawBody);
    if (!body) return;
    const runnerSide = speaker === "player";
    if (runnerSide && !isRunnerSimulation()) {
      await submitRunnerMutationRequest("call-line", { id, body }, groupId);
      state.modal = { type: "call-view", id, callReply: "", simMasterLine: "" };
      render();
      return;
    }
    if (runnerSide) {
      const data0 = currentRunnerData();
      if (!data0) return;
      const data = clone(data0),
        c = data.calls.find((x) => x.id === id);
      if (!c || c.status !== "accepted") return;
      c.transcript ??= [];
      c.transcript.push({
        id: uid(),
        speaker: "player",
        name: runnerSpeakerName(),
        image: runnerSpeakerIdentity().image,
        body,
        createdAt: now(),
        authorUserId: game.user.id,
      });
      c.updatedAt = now();
      await saveRunnerData(groupId, data);
      state.modal = { type: "call-view", id, callReply: "", simMasterLine: "" };
      render();
      return;
    }
    if (!userCanMaster()) return;
    await mutateLiveGroup(groupId, (data) => {
      const c = data.calls.find((x) => x.id === id);
      if (!c || c.status !== "accepted") return false;
      c.transcript ??= [];
      c.transcript.push({
        id: uid(),
        speaker: "npc",
        name: c.name,
        image: c.image || "",
        body,
        createdAt: now(),
        authorUserId: game.user.id,
      });
      c.updatedAt = now();
      return true;
    });
    await refreshData();
    state.modal = { type: "master-call", id, groupId, line: "" };
    render();
  }
  async function appendSimMasterCallLine(id, rawBody) {
    if (!isRunnerSimulation()) return;
    const body = text(rawBody);
    if (!body) return;
    const groupId = currentRunnerGroupId(),
      data0 = currentRunnerData();
    if (!groupId || !data0) return;
    const data = clone(data0),
      c = data.calls.find((x) => x.id === id);
    if (!c || c.status !== "accepted") return;
    c.transcript ??= [];
    c.transcript.push({
      id: uid(),
      speaker: "npc",
      name: c.name,
      body,
      createdAt: now(),
      authorUserId: game.user.id,
    });
    c.updatedAt = now();
    await saveRunnerData(groupId, data);
    state.modal = { type: "call-view", id, callReply: "", simMasterLine: "" };
    render();
  }
  async function endCallPlayer(id) {
    const groupId = currentRunnerGroupId(),
      data0 = currentRunnerData(),
      c = data0?.calls?.find((x) => x.id === id);
    if (!data0 || !c || c.status !== "accepted") return;
    if (isRunnerSimulation()) {
      const data = clone(data0),
        live = data.calls.find((x) => x.id === id);
      live.status = "ended";
      live.updatedAt = now();
      await saveRunnerData(groupId, data);
      state.modal = { type: "call-view", id };
      render();
      return;
    }
    await submitRunnerMutationRequest("call-end", { id }, groupId);
    state.modal = { type: "call-view", id };
    render();
  }

  async function openThread(threadId, messageId) {
    if (!isRunnerSimulation()) {
      const groupId = currentRunnerGroupId(),
        data = currentRunnerData();
      if (groupId && data) {
        const r = readState(),
          bucket = readBucket(r, groupId, { create: true });
        bucket.messages ??= [];
        for (const msg of data.messages.filter(
          (x) => x.threadId === threadId && x.sender !== "player",
        ))
          if (!bucket.messages.includes(msg.id)) bucket.messages.push(msg.id);
        if (bucket.messages.length > 500)
          bucket.messages = bucket.messages.slice(-500);
        await game.user.update({ [`flags.${FLAG_ROOT}.read`]: r });
      } else if (messageId) await markRead("messages", messageId);
    }
    state.modal = { type: "thread", threadId, reply: "" };
    render();
  }
  async function sendReply(threadId) {
    const body = text(state.modal?.reply);
    if (!body) return;
    const groupId = currentRunnerGroupId(),
      data0 = currentRunnerData();
    if (!data0) return;
    if (isRunnerSimulation()) {
      const data = clone(data0),
        base = [...data.messages]
          .reverse()
          .find((m) => m.threadId === threadId);
      data.messages.push({
        id: uid(),
        threadId,
        contactId: base?.contactId || "",
        sender: "player",
        senderName: runnerSpeakerName(),
        body,
        image: runnerSpeakerIdentity().image,
        createdAt: now(),
        authorUserId: game.user.id,
      });
      await saveRunnerData(groupId, data);
      state.modal = { type: "thread", threadId, reply: "" };
      render();
      return;
    }
    await submitRunnerMutationRequest(
      "thread-reply",
      { threadId, body },
      groupId,
    );
    state.modal = { type: "thread", threadId, reply: "" };
    render();
  }
  async function acceptJob(id) {
    const groupId = currentRunnerGroupId();
    if (!runnerCanDecideJobs(groupId))
      return notify(
        `Только лидер группы ${groupLeaderActor(groupId)?.name || ""} может принять этот заказ.`,
        "warn",
      );
    const j = currentRunnerData()?.jobs?.find((x) => x.id === id);
    if (!j || j.status !== "available") return;
    if (isRunnerSimulation()) {
      const data = clone(currentRunnerData()),
        live = data.jobs.find((x) => x.id === id);
      live.status = "accepted";
      live.acceptedBy = runnerSpeakerName();
      live.updatedAt = now();
      await saveRunnerData(groupId, data);
      state.modal = { type: "job-view", id };
      render();
      notify(`SIMULATION: заказ «${j.title}» принят.`);
      return;
    }
    await submitRunnerMutationRequest(
      "job-status",
      { id, status: "accepted" },
      groupId,
    );
    state.modal = { type: "job-view", id };
    render();
  }
  async function declineJob(id) {
    const groupId = currentRunnerGroupId();
    if (!runnerCanDecideJobs(groupId))
      return notify(
        `Только лидер группы ${groupLeaderActor(groupId)?.name || ""} может отклонить этот заказ.`,
        "warn",
      );
    const j = currentRunnerData()?.jobs?.find((x) => x.id === id);
    if (!j || j.status !== "available") return;
    if (isRunnerSimulation()) {
      const data = clone(currentRunnerData()),
        live = data.jobs.find((x) => x.id === id);
      live.status = "declined";
      live.acceptedBy = "";
      live.updatedAt = now();
      await saveRunnerData(groupId, data);
      state.modal = { type: "job-view", id };
      render();
      notify(`SIMULATION: заказ «${j.title}» отклонён.`);
      return;
    }
    await submitRunnerMutationRequest(
      "job-status",
      { id, status: "declined" },
      groupId,
    );
    state.modal = { type: "job-view", id };
    render();
  }
  async function setCallStatus(id, status) {
    const groupId = currentRunnerGroupId(),
      c = currentRunnerData()?.calls?.find((x) => x.id === id);
    if (
      !c ||
      c.status !== "ringing" ||
      !["accepted", "declined"].includes(status)
    )
      return;
    if (isRunnerSimulation()) {
      const data = clone(currentRunnerData()),
        live = data.calls.find((x) => x.id === id);
      live.status = status;
      live.answeredBy = runnerSpeakerName();
      live.updatedAt = now();
      await saveRunnerData(groupId, data);
      state.modal = { type: "call-view", id };
      render();
      return;
    }
    await submitRunnerMutationRequest("call-status", { id, status }, groupId);
    state.modal = { type: "call-view", id };
    render();
  }
  async function endCallMaster(id, groupId) {
    if (!userCanMaster()) return;
    const changed = await mutateLiveGroup(groupId, (data) => {
      const c = data.calls.find((x) => x.id === id);
      if (!c) return false;
      c.status = "ended";
      c.updatedAt = now();
      return true;
    });
    if (changed === false) return notify("Звонок уже отсутствует.", "warn");
    await refreshData();
    state.modal = { type: "master-call", id, groupId, line: "" };
    render();
  }

  function toggleImportContact(id) {
    const m = state.modal;
    if (!m) return;
    m.selected ??= [];
    m.selected = m.selected.includes(id)
      ? m.selected.filter((x) => x !== id)
      : [...m.selected, id];
    render();
  }
  async function publishImported() {
    const m = state.modal;
    const selected = (m.items || []).filter((c) => m.selected?.includes(c.id));
    if (!selected.length) return;
    const targets = targetGroupIds(modalAudience());
    if (!targets.length) return notify("Выберите хотя бы одну группу.", "warn");
    const items = selected.map((c) => ({
      ...clone(c),
      id: c.id,
      source: "master",
      createdByUserId: text(game.user.id),
      updatedByUserId: text(game.user.id),
    }));
    await upsertMasterContactsShared(items);
    for (const groupId of targets) {
      await mutateLiveGroup(groupId, (data) => {
        for (const item of items) {
          const existing = data.contacts.find((c) => c.id === item.id);
          if (existing) {
            const keep = existing.id;
            Object.assign(existing, clone(item), {
              id: keep,
              updatedAt: now(),
            });
          } else
            data.contacts.unshift({
              ...clone(item),
              createdAt: now(),
              updatedAt: now(),
            });
        }
        return true;
      });
    }
    await refreshData();
    state.modal = null;
    render();
    notify(`Импортировано в общую GM-базу: ${items.length}.`);
  }

  function closeUI({ silent = false } = {}) {
    liveRenderPending = false;
    stopRingtoneLoop();
    clearTimeout(state.fxTimer);
    state.contextMenu = null;
    state.toasts = [];
    if (state.root) {
      state.root.replaceChildren();
      state.root.classList.remove("city-comm-link");
    }
    state.root = null;
    if (!silent) mountOptions.onClose?.();
  }

  async function open() {
    state.allowSetup = true;
    primeAudio();
    await refreshData();
    if (isPrimaryGm()) await processPendingRunnerMutationRequests();
    seedNotificationState();
    render();
  }

  // v0.8.1: select listeners are bound directly in bindEvents; no subtree MutationObserver.

  const hookIds = [];
  const pendingGroupDocs = new Map();
  let refreshTimer = null,
    refreshBusy = false,
    refreshQueued = false,
    fullRefreshPending = false,
    forceLiveRender = false,
    liveRenderPending = false;
  function liveInputBusy() {
    const active =
      state.root?.ownerDocument?.activeElement || document.activeElement;
    return !!(
      active &&
      state.root?.contains(active) &&
      active.matches?.("input,textarea,select")
    );
  }
  function requestLiveRender(force = false) {
    if (!commLinkUiOpen()) return;
    if (!force && (state.dragging || liveInputBusy())) {
      liveRenderPending = true;
      return;
    }
    render();
  }
  function snapshotGroupDoc(doc) {
    const raw = dataFlags(doc);
    if (!raw) return "";
    let allowed = true;
    if (!userCanMaster()) {
      try {
        allowed = doc.testUserPermission?.(game.user, "OBSERVER") ?? true;
      } catch (_error) {}
    }
    if (!allowed) return "";
    const groupId = text(raw.groupId) || doc.id;
    state.groupDocs.set(groupId, doc);
    state.groupData.set(
      groupId,
      normalizeNetworkData(
        raw,
        groupId,
        raw.groupName || doc.name?.replace(GROUP_PREFIX, "") || "Группа",
      ),
    );
    if (!userCanMaster()) {
      const actorId = currentRunnerActorId(),
        ids = [...state.groupData.keys()].filter((id) =>
          groupAllowsActor(id, actorId),
        );
      if (!state.activeGroupId || !ids.includes(state.activeGroupId))
        state.activeGroupId = ids[0] ?? "";
    }
    return groupId;
  }
  async function runNetworkRefresh() {
    if (refreshBusy) {
      refreshQueued = true;
      return;
    }
    const __diagLiveStart = diagNow();
    refreshBusy = true;
    try {
      do {
        refreshQueued = false;
        const docs = [...pendingGroupDocs.values()];
        pendingGroupDocs.clear();
        const doFull = fullRefreshPending;
        fullRefreshPending = false;
        const changedGroups = [];
        if (doFull) {
          await refreshData();
          detectIncomingNotifications();
        } else {
          for (const doc of docs) {
            const groupId = snapshotGroupDoc(doc);
            if (groupId) changedGroups.push(groupId);
          }
          for (const groupId of new Set(changedGroups))
            detectIncomingNotifications(groupId);
        }
      } while (refreshQueued || fullRefreshPending || pendingGroupDocs.size);
      const force = forceLiveRender;
      forceLiveRender = false;
      requestLiveRender(force);
    } catch (error) {
      recordDiagError("live-refresh", error);
      console.warn("COMM-LINK live refresh failed", error);
    } finally {
      recordPerf("liveRefresh", diagNow() - __diagLiveStart);
      refreshBusy = false;
    }
  }
  function scheduleFullNetworkRefresh() {
    fullRefreshPending = true;
    if (refreshTimer) diagState.coalescedSignals++;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(runNetworkRefresh, 140);
  }

  let mountOptions = {},
    hasMounted = false;
  const payoutQueues = new Map(),
    projectionStamps = new Map(),
    ackWaiters = new Map();
  const usersMessages = () =>
    game?.messages?.contents || [...(game?.messages?.values?.() || [])];
  const journalClass = () =>
    globalThis.foundry?.documents?.JournalEntry || globalThis.JournalEntry;
  const chatClass = () =>
    globalThis.foundry?.documents?.ChatMessage || globalThis.ChatMessage;
  const isPrimaryGm = () =>
    userCanMaster() && commLinkPrimaryGM(game)?.id === game.user.id;
  function requirePrimaryGm() {
    if (!isPrimaryGm())
      throw new Error(
        "Изменения сети выполняет активный GM. Откройте консоль у активного GM.",
      );
  }
  function gmOwnership() {
    return Object.fromEntries([
      ["default", ownershipLevel("NONE")],
      ...gmUsers().map((u) => [u.id, ownershipLevel("OWNER")]),
    ]);
  }
  function isMyCommLinkLine(line) {
    if (line.sender !== "player" && line.speaker !== "player") return false;
    const actorId = line.senderActorId || line.actorId;
    return actorId
      ? actorId === currentRunnerActorId()
      : line.authorUserId
        ? line.authorUserId === game.user.id
        : true;
  }
  const requestFlags = (message) =>
    message?.flags?.[FLAG_SCOPE]?.commLink?.runnerMutationRequest || null;
  const responseFlags = (message) =>
    message?.flags?.[FLAG_SCOPE]?.commLink?.response || null;
  function authenticatedAck(id, receiverId = game.user.id) {
    return (
      usersMessages()
        .filter(
          (m) =>
            commLinkAuthor(m)?.isGM &&
            responseFlags(m)?.requestId === id &&
            responseFlags(m)?.userId === receiverId,
        )
        .map(responseFlags)
        .sort((a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        )[0] || null
    );
  }
  function consumeAck(message) {
    const result = responseFlags(message);
    if (
      !result ||
      !commLinkAuthor(message)?.isGM ||
      result.userId !== game.user.id
    )
      return;
    const waiting = ackWaiters.get(result.requestId);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    ackWaiters.delete(result.requestId);
    if (result.status === "applied") waiting.resolve(result);
    else
      waiting.reject(
        new Error(
          result.error || "GM не подтвердил действие. Черновик сохранён.",
        ),
      );
  }
  function waitForAck(id) {
    if (ackWaiters.has(id)) return ackWaiters.get(id).promise;
    const entry = {};
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
      entry.timer = setTimeout(() => {
        ackWaiters.delete(id);
        reject(
          new Error(
            "Подтверждение GM ещё не получено. Запрос и черновик сохранены; используйте «Повторить синхронизацию».",
          ),
        );
      }, 15000);
    });
    entry.promise.catch(() => {});
    ackWaiters.set(id, entry);
    return entry.promise;
  }
  function cancelAckWait(id, error) {
    const entry = ackWaiters.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      ackWaiters.delete(id);
      entry.reject(error);
    }
  }
  async function acknowledgeRequest(_doc, request, result) {
    const previous = authenticatedAck(request.id, request.userId);
    if (previous?.status === "applied") return previous;
    const response = {
      ...result,
      requestId: request.id,
      userId: request.userId,
      actorId: request.actorId,
      groupId: request.groupId,
      createdAt: now(),
    };
    return chatClass().create({
      content: `<p>АГЕНТ · ${result.status === "applied" ? "Синхронизировано" : "Запрос требует внимания"}</p>`,
      whisper: [...new Set([request.userId, ...gmUsers().map((u) => u.id)])],
      flags: { [FLAG_SCOPE]: { commLink: { response } } },
    });
  }
  const operationProcessor = createCommLinkOperationProcessor({
    isPrimaryGM: isPrimaryGm,
    authenticate: async (doc, request) => {
      const validActions = [
        "contact-upsert",
        "contact-delete",
        "contact-message",
        "thread-reply",
        "gm-contact-reply",
        "job-status",
        "call-status",
        "call-line",
        "call-end",
      ];
      if (
        !request ||
        !validActions.includes(request.action) ||
        !/^[a-zA-Z0-9:_-]{1,180}$/.test(request.id || "") ||
        JSON.stringify(request.payload || {}).length > 150000
      )
        throw new Error("Некорректный формат запроса COMM-LINK.");
      const groupDoc =
        state.groupDocs.get(request.groupId) ||
        journals().find((d) => dataFlags(d)?.groupId === request.groupId);
      if (groupDoc) state.groupDocs.set(request.groupId, groupDoc);
      return authenticateCommLinkRequest(
        doc,
        request,
        actorById(request.actorId),
        dataFlags(groupDoc),
      );
    },
    readReceipt: (key, request) =>
      dataFlags(state.groupDocs.get(request.groupId))?.operations?.[key],
    commit: async (request, key) => {
      const author = users().find((u) => u.id === request.userId);
      await applyRunnerMutationRequest(request, author);
      return clone(
        dataFlags(state.groupDocs.get(request.groupId))?.operations?.[key] || {
          status: "applied",
        },
      );
    },
    acknowledge: acknowledgeRequest,
  });
  async function processRequest(doc, request) {
    try {
      return await operationProcessor(doc, request);
    } catch (error) {
      if (isPrimaryGm() && commLinkAuthor(doc)?.id === request?.userId) {
        try {
          await acknowledgeRequest(doc, request, {
            status: "error",
            error: text(error.message || error),
          });
        } catch (ackError) {
          recordDiagError("acknowledgement", ackError);
        }
      }
      throw error;
    }
  }
  async function submitEnvelope({
    actorId,
    groupId,
    action,
    payload,
    operationId = uid(),
  }) {
    const actor = actorById(actorId);
    if (!commLinkOwnsActor(actor, game.user))
      throw new Error("Нет OWNER-доступа к Actor.");
    const request = {
      id: operationId,
      userId: game.user.id,
      actorId,
      groupId,
      action,
      payload: clone(payload),
      createdAt: now(),
      version: 3,
    };
    if (isPrimaryGm()) return processRequest({ author: game.user }, request);
    if (!primaryActiveGm())
      throw new Error("Для действия нужен активный GM. Черновик сохранён.");
    const oldAck = authenticatedAck(operationId);
    if (oldAck?.status === "applied") return oldAck;
    const waiting = waitForAck(operationId);
    try {
      const existing = usersMessages().find(
        (m) =>
          commLinkAuthor(m)?.id === game.user.id &&
          requestFlags(m)?.id === operationId,
      );
      if (existing)
        await existing.update({ [`flags.${FLAG_ROOT}.retryAt`]: now() });
      else
        await chatClass().create({
          content: "<p>АГЕНТ · запрос синхронизации команды</p>",
          whisper: [...new Set([game.user.id, ...gmUsers().map((u) => u.id)])],
          flags: {
            [FLAG_SCOPE]: { commLink: { runnerMutationRequest: request } },
          },
        });
      return await waiting;
    } catch (error) {
      cancelAckWait(operationId, error);
      throw error;
    }
  }
  async function retryOwnRequests() {
    const requests = usersMessages().filter(
      (m) =>
        commLinkAuthor(m)?.id === game.user.id &&
        requestFlags(m) &&
        authenticatedAck(requestFlags(m).id)?.status !== "applied",
    );
    for (const message of requests)
      await message.update({ [`flags.${FLAG_ROOT}.retryAt`]: now() });
    notify(
      requests.length
        ? `Повторно отправлено: ${requests.length}. Черновики сохранены до подтверждения.`
        : "Все запросы подтверждены.",
    );
    if (commLinkUiOpen()) render();
  }
  function relayStatusMarkup() {
    const pending = usersMessages().filter(
      (m) =>
        commLinkAuthor(m)?.id === game.user.id &&
        requestFlags(m) &&
        authenticatedAck(requestFlags(m).id)?.status !== "applied",
    );
    if (!pending.length) return "";
    return `<aside class="cl-relay-status">${pending.length} запрос(а) ожидают синхронизации. ${esc(authenticatedAck(requestFlags(pending.at(-1)).id)?.error || "Записи сохраняются до подтверждения GM.")}<button data-action="relay-retry">Повторить синхронизацию</button></aside>`;
  }
  function payoutLedgerMarkup(job) {
    const ledger = job.payoutLedger;
    if (!ledger || job.settlement?.paidAt) return "";
    return `<aside class="cl-payout-attention"><b>Расчёт: ${esc(ledger.status)}</b>${Object.entries(
      ledger.receipts || {},
    )
      .map(
        ([id, r]) =>
          `<p>${esc(actorById(id)?.name || id)}: ${esc(r.amount)} Credits · ${esc(r.status)} ${esc(r.error || "")}</p>`,
      )
      .join(
        "",
      )}<small>Квитанции сохранены. Неопределённый перевод не повторяется автоматически; активный GM должен сверить кошельки. Подтверждённые доли повторно не начисляются.</small></aside>`;
  }
  async function projectAccessibleNetworks() {
    for (const group of state.groupData.values()) {
      for (const id of group.memberActorIds || []) {
        const actor = actorById(id);
        if (!actor) continue;
        const owners = userCanMaster()
          ? users().filter((u) => !u.isGM && commLinkOwnsActor(actor, u))
          : commLinkOwnsActor(actor, game.user)
            ? [game.user]
            : [];
        if (userCanMaster() && id === state.runnerActorId)
          owners.push(game.user);
        for (const owner of owners) {
          const key = `${owner.id}:${id}:${group.groupId}`,
            signature = JSON.stringify(group);
          if (projectionStamps.get(key) === signature) continue;
          try {
            await mutateCityArchive(owner.id, (store) =>
              projectCommLinkGroupIntoStore(store, { actor, group }),
            );
            projectionStamps.set(key, signature);
          } catch (error) {
            recordDiagError("archive-projection", error);
          }
        }
      }
    }
  }
  function datapadContacts() {
    const archive = readCityArchive(game.user.id),
      items = [];
    for (const [actorId, book] of Object.entries(archive.notebooks || {}))
      for (const section of ["people", "fixers"])
        for (const entry of book.entries?.[section] || []) {
          if (entry.commLinkGroupId) continue;
          const id = `archive-${encodeURIComponent(`${game.user.id}:${actorId}:${entry.id}`).replaceAll(".", "%2E")}`;
          items.push({
            id,
            name: text(entry.title) || "Контакт Архива",
            image: text(entry.image),
            summary: text(entry.summary),
            handle: text(entry.handle),
            tags: Array.isArray(entry.tags)
              ? entry.tags
              : text(entry.tags).split(",").map(text).filter(Boolean),
            actorId: text(entry.sourceActorId),
            actorUuid: text(entry.sourceActorUuid),
            source: "master",
          });
        }
    return items;
  }
  const serviceHook = (name, callback) => {
    const id = globalThis.Hooks?.on?.(name, callback);
    if (id !== undefined) hookIds.push([name, id]);
  };
  for (const name of [
    "createJournalEntry",
    "updateJournalEntry",
    "deleteJournalEntry",
  ])
    serviceHook(name, (doc, changes) => {
      if (dataFlags(doc) || controlFlags(doc) || masterDbFlags(doc)) {
        if (name === "deleteJournalEntry" || changes?.ownership)
          forceLiveRender = true;
        scheduleFullNetworkRefresh();
      }
    });
  const receiveMessage = (message) => {
    consumeAck(message);
    if (isPrimaryGm() && requestFlags(message))
      void processRunnerMutationRequest(message).catch((error) =>
        recordDiagError("relay", error),
      );
    if (responseFlags(message) && commLinkAuthor(message)?.isGM) {
      requestLiveRender();
    }
  };
  serviceHook("createChatMessage", receiveMessage);
  serviceHook("updateChatMessage", (message, changes) => {
    if (
      changes?.flags?.[FLAG_SCOPE]?.commLink?.retryAt ||
      changes?.[`flags.${FLAG_ROOT}.retryAt`]
    )
      receiveMessage(message);
  });
  serviceHook("updateActor", (_actor, changes) => {
    if (
      changes?.ownership ||
      changes?.name ||
      changes?.img ||
      changes?.prototypeToken
    ) {
      if (changes?.ownership) forceLiveRender = true;
      scheduleFullNetworkRefresh();
    }
  });
  serviceHook("deleteActor", () => {
    forceLiveRender = true;
    scheduleFullNetworkRefresh();
  });
  serviceHook("updateUser", (_user, changes) => {
    if (changes?.role !== undefined || changes?.active !== undefined) {
      forceLiveRender = true;
      scheduleFullNetworkRefresh();
      if (isPrimaryGm()) void processPendingRunnerMutationRequests();
    }
  });
  async function setActor(actorId) {
    const actor = actorById(actorId);
    if (!commLinkOwnsActor(actor, game.user))
      throw new Error("Нет OWNER-доступа к выбранному Actor.");
    await selectRunnerActor(actorId, { persist: false });
    if (!userCanMaster())
      state.mode = runnerProfile().pinHash ? "login" : "edgerunner";
    state.modal = null;
    await refreshData();
    seedNotificationState();
    render();
  }
  const controller = {
    async mount(root, options = {}) {
      if (!root?.replaceChildren)
        throw new Error("Нужен DOM-контейнер существующего Агента.");
      if (state.root && state.root !== root) {
        state.root.replaceChildren();
        state.root.classList.remove("city-comm-link");
      }
      mountOptions = options;
      state.root = root;
      root.classList.add("city-comm-link");
      if (!hasMounted) state.mode = userCanMaster() ? "master" : "edgerunner";
      const actorChanged =
        options.actorId && options.actorId !== state.runnerActorId;
      if (options.actorId) {
        if (!commLinkOwnsActor(actorById(options.actorId), game.user))
          throw new Error("Нет OWNER-доступа к выбранному Actor.");
        state.runnerActorId = options.actorId;
      }
      if (!userCanMaster() && (!hasMounted || actorChanged))
        state.mode = runnerProfile().pinHash ? "login" : "edgerunner";
      hasMounted = true;
      await open();
      return controller;
    },
    destroy() {
      closeUI({ silent: true });
    },
    async refresh() {
      await refreshData();
      if (isPrimaryGm()) await processPendingRunnerMutationRequests();
      if (commLinkUiOpen()) render();
    },
    async requestJobAcceptance({
      groupId,
      jobId,
      actorId,
      operationId = uid(),
      version,
    }) {
      await refreshData();
      const job = state.groupData
        .get(groupId)
        ?.jobs?.find((j) => j.id === jobId);
      if (!job) throw new Error("Предложение недоступно или удалено.");
      return submitEnvelope({
        actorId,
        groupId,
        operationId,
        action: "job-status",
        payload: {
          id: jobId,
          status: "accepted",
          version: version ?? job.version,
        },
      });
    },
    async processCityJobAcceptance(
      doc,
      {
        groupId,
        jobId,
        actorId,
        operationId,
        version,
        cityJobId,
        cityJobVersion,
      },
    ) {
      requirePrimaryGm();
      await refreshData();
      const author = commLinkAuthor(doc);
      return processRequest(doc, {
        id: `city:${operationId}`,
        userId: author?.id,
        groupId,
        actorId,
        action: "job-status",
        payload: {
          id: jobId,
          status: "accepted",
          version,
          cityJobId,
          cityJobVersion,
        },
      });
    },
    async setJobStatus({ groupId, jobId, status }) {
      requirePrimaryGm();
      if (
        ![
          "available",
          "accepted",
          "completed",
          "failed",
          "cancelled",
          "declined",
        ].includes(status)
      )
        throw new Error("Неверный статус заказа.");
      await refreshData();
      const changed = await mutateLiveGroup(groupId, (data) => {
        const job = data.jobs.find((j) => j.id === jobId);
        if (!job || data.jobTombstones?.[jobId]) return false;
        job.status = status;
        job.version = (Number(job.version) || 0) + 1;
        job.updatedAt = now();
        if (status === "available") {
          job.acceptedBy = "";
          job.acceptedActorId = "";
          job.acceptedUserId = "";
        }
      });
      if (changed === false) throw new Error("Заказ удалён.");
      await refreshData();
      return { status: "applied", groupId, jobId };
    },
    async editJob({ groupId, jobId, changes }) {
      requirePrimaryGm();
      await refreshData();
      const changed = await mutateLiveGroup(groupId, (data) => {
        const job = data.jobs.find((j) => j.id === jobId);
        if (!job) return false;
        for (const key of [
          "title",
          "summary",
          "details",
          "fixerName",
          "pay",
          "deadline",
          "cityMarkerId",
          "cityGiverMarkerId",
        ])
          if (changes[key] !== undefined) job[key] = text(changes[key]);
        if (changes.markerId !== undefined)
          job.cityMarkerId = text(changes.markerId);
        job.version = (Number(job.version) || 0) + 1;
        job.updatedAt = now();
      });
      if (changed === false) throw new Error("Заказ удалён.");
      await refreshData();
    },
    async deleteJob({ groupId, jobId }) {
      requirePrimaryGm();
      await refreshData();
      const target = state.groupData
        .get(groupId)
        ?.jobs?.find((j) => j.id === jobId);
      if (!target) {
        if (state.groupData.get(groupId)?.jobTombstones?.[jobId])
          return { status: "deleted" };
        throw new Error("Заказ удалён.");
      }
      if (target.cityJobId) {
        const { deleteCityJob } = await import("./city-jobs.mjs");
        await deleteCityJob(target.cityJobId, { reconcile: false });
      }
      await mutateLiveGroup(groupId, (data) => removeCommLinkJob(data, jobId));
      await refreshData();
      return { status: "deleted", groupId, jobId };
    },
    async openJob({ groupId, jobId, actorId }) {
      if (actorId) await setActor(actorId);
      await refreshData();
      const data = state.groupData.get(groupId);
      if (
        !data?.jobs?.some((job) => job.id === jobId) ||
        (!userCanMaster() &&
          !groupAllowsActor(groupId, actorId || currentRunnerActorId()))
      )
        throw new Error("Заказ недоступен или удалён.");
      if (userCanMaster()) {
        state.mode = "master";
        state.masterTab = "jobs";
        openMasterJob(groupId, jobId);
      } else {
        state.activeGroupId = groupId;
        state.runnerTab = "jobs";
        state.modal = { type: "job-view", id: jobId };
        render();
      }
      return controller;
    },
    setActor,
    unread(actorId = state.runnerActorId || game.user.character?.id) {
      const read = readState();
      let total = 0;
      for (const group of state.groupData.values()) {
        if (!(group.memberActorIds || []).includes(actorId)) continue;
        const bucket =
          read[`${actorId}:${group.groupId}`] || read[group.groupId] || {};
        total += (group.messages || []).filter(
          (m) =>
            !(
              m.sender === "player" &&
              (m.senderActorId === actorId ||
                (!m.senderActorId && m.authorUserId === game.user.id))
            ) && !(bucket.messages || []).includes(m.id),
        ).length;
        total += (group.calls || []).filter(
          (c) => c.status === "ringing",
        ).length;
        total += (group.jobs || []).filter(
          (j) =>
            j.status === "available" && !(bucket.jobs || []).includes(j.id),
        ).length;
      }
      return total;
    },
    async sendContactMessage({
      ownerUserId = game.user.id,
      actorId,
      contactId,
      body,
      operationId = uid(),
      asContact,
    }) {
      if (asContact === true && !userCanMaster())
        throw new Error("Ответ от имени NPC доступен только GM / MASTER.");
      if (ownerUserId !== game.user.id && !userCanMaster())
        throw new Error("Нет доступа к чужому Архиву.");
      const actor = actorById(actorId);
      if (!commLinkOwnsActor(actor, game.user))
        throw new Error("Нет OWNER-доступа к Actor.");
      await refreshData();
      let contact = readCityArchive(ownerUserId).notebooks?.[
        actorId
      ]?.entries?.people?.find((c) => c.id === contactId);
      if (
        !contact?.commLinkGroupId &&
        String(contactId).startsWith("comm-link-contact:")
      ) {
        for (const group of state.groupData.values()) {
          if (!(group.memberActorIds || []).includes(actorId)) continue;
          const source = (group.contacts || []).find(
            (c) => `comm-link-contact:${group.groupId}:${c.id}` === contactId,
          );
          const thread = (group.messages || []).find(
            (m) =>
              `comm-link-contact:${group.groupId}:thread:${m.threadId}` ===
                contactId && !m.contactId,
          );
          if (source || thread) {
            contact = {
              commLinkGroupId: group.groupId,
              commLinkContactId: source?.id || `thread:${thread.threadId}`,
            };
            break;
          }
        }
      }
      if (!contact?.commLinkGroupId)
        throw new Error("Контакт не принадлежит каналу команды COMM-LINK.");
      const authorizedGroup = state.groupData.get(contact.commLinkGroupId);
      if (!authorizedGroup?.memberActorIds?.includes(actorId))
        throw new Error("Actor не состоит в этой группе.");
      const messageBody = text(body);
      if (!messageBody) throw new Error("Введите сообщение.");
      await refreshData();
      const groupId = contact.commLinkGroupId,
        sourceId = contact.commLinkContactId;
      const synthetic = sourceId.startsWith("thread:"),
        gmReply =
          userCanMaster() &&
          (asContact === true || ownerUserId !== game.user.id);
      const result = await submitEnvelope({
        actorId,
        groupId,
        operationId,
        action: gmReply
          ? "gm-contact-reply"
          : synthetic
            ? "thread-reply"
            : "contact-message",
        payload: synthetic
          ? { threadId: sourceId.slice(7), body: messageBody }
          : { contactId: sourceId, body: messageBody },
      });
      await refreshData();
      return result;
    },
  };
  // Ready loads readable networks and recovers requests without creating a Journal.
  state.mode = userCanMaster() ? "master" : "edgerunner";
  void controller
    .refresh()
    .then(seedNotificationState)
    .catch((error) => recordDiagError("background-start", error));
  return controller;
}
