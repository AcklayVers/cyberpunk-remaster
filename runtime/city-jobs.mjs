import { createRuntimeId } from "./runtime-id.mjs";
import {
  CITY_MID as MID,
  CITY_SERVICES_HOOK,
  cityServices,
  updateCityServices,
  requireCityGM,
  cityPrivateDocuments,
  cityPrivateJournal,
  cityWritePrivate,
  cityValues,
  cityAuthor,
} from "./city-services-state.mjs";
import { readCityArchive, mutateCityArchive } from "./city-archive-service.mjs";
import { UNIFIED_ARCHIVE_SECTIONS } from "./neuro-archive-store.mjs";
import { getWorldCityMap } from "./world-city-map.mjs";
import {
  cityJobDeleted,
  readableCommLinkJobGroups,
  commLinkCityJobRow,
  parseCommLinkJobReadId,
  cityToCommLinkStatus,
} from "./city-jobs-comm-link.mjs";
const gmIds = () =>
  cityValues(game.users)
    .filter((u) => u.isGM)
    .map((u) => u.id);
const source = (id) =>
  cityPrivateDocuments("cityJob").find((d) => d.flags[MID].cityJob.id === id);
const jobOf = (d) => d.flags[MID].cityJob;
export function publicCityJob(job) {
  return Object.fromEntries(
    [
      "id",
      "version",
      "title",
      "description",
      "fixer",
      "reward",
      "markerId",
      "giverMarkerId",
      "status",
      "acceptedBy",
      "acceptedActorId",
    ]
      .filter((k) => job[k] !== undefined)
      .map((k) => [k, structuredClone(job[k])]),
  );
}
async function project(job) {
  const p = publicCityJob(job);
  await updateCityServices((s) => {
    s.jobs = s.jobs.filter((x) => x.id !== job.id);
    if (!job.audience.length && job.status !== "hidden") s.jobs.push(p);
  });
  if (job.audience.length)
    await ChatMessage.create({
      content: "<p>АГЕНТ · Обновление заказа</p>",
      whisper: [...new Set([...job.audience, ...gmIds()])],
      flags: { [MID]: { cityJobOffer: p } },
    });
  Hooks.callAll(CITY_SERVICES_HOOK);
}
export async function reconcileCityJobs() {
  const { initializeCityCommLink } =
    await import("./city-comm-link-runtime.mjs");
  return initializeCityCommLink().refresh();
}
export async function createCityJob(data) {
  requireCityGM();
  const job = {
    id: createRuntimeId(),
    version: 1,
    title: String(data.title || "Новый заказ"),
    description: String(data.description || ""),
    fixer: String(data.fixer || "Фиксер"),
    reward: String(data.reward || ""),
    markerId: String(data.markerId || ""),
    giverMarkerId: String(data.giverMarkerId || ""),
    status: ["hidden", "offer"].includes(data.status) ? data.status : "hidden",
    gmText: String(data.gmText || ""),
    audience: [
      ...new Set((data.audience || []).filter((id) => game.users.has(id))),
    ],
    requests: {},
  };
  await cityPrivateJournal(`Заказ: ${job.title}`, "cityJob", job);
  await project(job);
  await reconcileCityJobs();
  return job;
}
export function listCityJobs(options = {}) {
  const jobs = new Map(
    (game.user.isGM
      ? cityPrivateDocuments("cityJob").map(jobOf)
      : cityServices().jobs
    ).map((j) => [j.id, j]),
  );
  for (const doc of game.user.isGM ? [] : cityValues(game.messages))
    if (cityAuthor(doc)?.isGM) {
      const j =
        doc.flags?.[MID]?.cityJobOffer || doc.flags?.[MID]?.cityJobResult?.job;
      if (j && (!doc.whisper?.length || doc.whisper.includes(game.user.id)))
        if (!jobs.has(j.id) || jobs.get(j.id).version <= j.version)
          jobs.set(j.id, j);
    }
  const crewJobs = readableCommLinkJobGroups(options).flatMap(({ group }) =>
    (group.jobs || [])
      .filter(
        (j) =>
          !group.jobTombstones?.[j.id] &&
          !(j.cityJobId && cityJobDeleted(j.cityJobId)),
      )
      .map((j) => ({
        ...commLinkCityJobRow(j, group),
        ...(game.user.isGM && jobs.get(j.cityJobId)?.gmText
          ? { gmText: jobs.get(j.cityJobId).gmText }
          : {}),
      })),
  );
  const linked = new Set(crewJobs.map((j) => j.cityJobId).filter(Boolean));
  return [...jobs.values()]
    .filter(
      (j) =>
        !j.deletedAt &&
        !cityJobDeleted(j.id) &&
        !linked.has(j.id) &&
        (game.user.isGM || j.status !== "hidden"),
    )
    .concat(crewJobs);
}
export async function syncCityJobArchive(job, ownerUserId, actorId) {
  if (ownerUserId !== game.user.id && !game.user.isGM)
    throw new Error("Нет прав на Архив получателя.");
  if (cityJobDeleted(job.id)) return;
  const actor = game.actors.get(actorId);
  if (
    !actor ||
    (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
  )
    throw new Error("Нет прав на персонажа.");
  await mutateCityArchive(ownerUserId, (s) => {
    const book = ((s.notebooks ??= {})[actorId] ??= {
      actorId,
      actorName: actor.name,
      actorImg: actor.img,
      entries: Object.fromEntries(UNIFIED_ARCHIVE_SECTIONS.map((k) => [k, []])),
    });
    const entries = ((book.entries ??= {}).quests ??= []);
    let q = entries.find((q) => q.cityJobId === job.id);
    if (!q) {
      q = {
        id: `city-job-${job.id}`,
        type: "quests",
        cityJobId: job.id,
        content: "",
        tasks: [],
        createdAt: new Date().toISOString(),
      };
      entries.push(q);
    }
    Object.assign(q, {
      title: job.title,
      summary: job.description,
      cityJobStatus: job.status,
      status:
        {
          offer: "Новый",
          active: "В работе",
          done: "Выполнен",
          failed: "Провален",
          deleted: "Удалён",
        }[job.status] || job.status,
      reward: job.reward,
      cityMarkerId: job.markerId,
      cityJobVersion: job.version,
      updatedAt: new Date().toISOString(),
    });
  });
}
let requestQueue = Promise.resolve();
export function processCityJobRequest(doc) {
  const next = requestQueue.catch(() => {}).then(() => process(doc));
  requestQueue = next;
  return next;
}
async function process(doc) {
  requireCityGM();
  const r = doc.flags?.[MID]?.cityJobRequest,
    author = cityAuthor(doc);
  if (!r || !author) return { status: "denied" };
  if (cityJobDeleted(r.jobId)) return { status: "denied" };
  const journal = source(r.jobId);
  if (!journal) return { status: "denied" };
  const job = structuredClone(jobOf(journal)),
    actor = game.actors.get(r.actorId),
    ownerId = author.id,
    key = `${author.id}:${r.operationId}`;
  job.requests ??= {};
  if (!actor || (!author.isGM && !actor.testUserPermission?.(author, "OWNER")))
    return { status: "denied" };
  if (job.audience.length && !job.audience.includes(ownerId) && !author.isGM)
    return { status: "denied" };
  const linked = listCityJobs({ actorId: actor.id }).find(
    (j) => j.cityJobId === job.id,
  );
  if (linked) {
    const legacy = job.requests[key];
    if (
      legacy?.status === "accepted" &&
      legacy.actorId === actor.id &&
      legacy.ownerUserId === ownerId
    )
      return {
        ...legacy,
        operationId: r.operationId,
        job: publicCityJob(linked),
      };
    const group = readableCommLinkJobGroups().find(
      ({ group }) => group.groupId === linked.commLinkGroupId,
    )?.group;
    const receipt = group?.operations?.[`${ownerId}:city:${r.operationId}`];
    const applied =
      receipt?.status === "applied" &&
      receipt.actorId === actor.id &&
      receipt.action === "job-status";
    if (!applied && Number(r.version) !== Number(job.version))
      return { status: "denied" };
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    try {
      const result = await initializeCityCommLink().processCityJobAcceptance(
        doc,
        {
          groupId: linked.commLinkGroupId,
          jobId: linked.commLinkJobId,
          actorId: actor.id,
          operationId: r.operationId,
          version: linked.version,
          cityJobId: job.id,
          cityJobVersion: r.version,
        },
      );
      return {
        status: result.status === "applied" ? "accepted" : result.status,
        actorId: actor.id,
        ownerUserId: ownerId,
        operationId: r.operationId,
        job: publicCityJob(
          listCityJobs().find((j) => j.id === linked.id) || linked,
        ),
      };
    } catch {
      return { status: "denied" };
    }
  }
  let accepted = job.requests[key];
  const acknowledgment = cityValues(game.messages).find(
    (m) =>
      cityAuthor(m)?.isGM &&
      m.flags?.[MID]?.cityJobResult?.operationId === r.operationId &&
      m.whisper?.includes(ownerId),
  );
  if (acknowledgment) return acknowledgment.flags[MID].cityJobResult;
  if (!accepted) {
    if (job.status !== "offer" || job.version !== r.version)
      return { status: "denied" };
    accepted = { status: "accepted", actorId: actor.id, ownerUserId: ownerId };
    job.requests[key] = accepted;
    job.acceptedBy = ownerId;
    job.acceptedActorId = actor.id;
    job.status = "active";
    job.version++;
    await cityWritePrivate(journal, "cityJob", job);
  }
  await project(job);
  const result = {
    ...accepted,
    operationId: r.operationId,
    job: publicCityJob(job),
  };
  if (
    !cityValues(game.messages).some(
      (m) =>
        cityAuthor(m)?.isGM &&
        m.flags?.[MID]?.cityJobResult?.operationId === r.operationId &&
        m.whisper?.includes(ownerId),
    )
  )
    await ChatMessage.create({
      content: "<p>АГЕНТ · Заказ принят</p>",
      whisper: [...new Set([ownerId, ...gmIds()])],
      flags: { [MID]: { cityJobResult: result } },
    });
  return result;
}
export async function requestCityJobAcceptance({
  jobId,
  actorId,
  operationId = createRuntimeId(),
}) {
  const actor = game.actors.get(actorId);
  if (
    !actor ||
    (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
  )
    throw new Error("Нет прав на персонажа.");
  const job = listCityJobs({ actorId }).find(
    (j) => j.id === jobId || j.cityJobId === jobId,
  );
  if (!job) throw new Error("Предложение недоступно.");
  if (job.commLinkGroupId) {
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    return initializeCityCommLink().requestJobAcceptance({
      groupId: job.commLinkGroupId,
      jobId: job.commLinkJobId,
      actorId,
      operationId,
      version: job.version,
    });
  }
  const old = cityValues(game.messages).find(
    (d) =>
      cityAuthor(d)?.id === game.user.id &&
      d.flags?.[MID]?.cityJobRequest?.operationId === operationId,
  );
  const doc =
    old ||
    (await ChatMessage.create({
      content: "<p>АГЕНТ · Запрос принятия заказа</p>",
      whisper: [...new Set([game.user.id, ...gmIds()])],
      flags: {
        [MID]: {
          cityJobRequest: { jobId, actorId, operationId, version: job.version },
        },
      },
    }));
  if (game.user.isGM) return processCityJobRequest(doc);
  return { status: "pending", operationId };
}
export async function setCityJobStatus(id, status) {
  requireCityGM();
  if (
    ![
      "hidden",
      "offer",
      "active",
      "done",
      "failed",
      "cancelled",
      "declined",
    ].includes(status)
  )
    throw new Error("Неверный статус.");
  const link = parseCommLinkJobReadId(id);
  if (link) {
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    if (status === "hidden") {
      const row = listCityJobs().find((j) => j.id === id);
      if (!row?.cityJobId)
        throw new Error(
          "Для контракта команды используйте отмену или удаление.",
        );
      return setCityJobStatus(row.cityJobId, status);
    }
    return initializeCityCommLink().setJobStatus({
      ...link,
      status: cityToCommLinkStatus(status),
    });
  }
  const doc = source(id);
  if (!doc || cityJobDeleted(id)) throw new Error("Заказ удалён.");
  const job = structuredClone(jobOf(doc));
  const reopening = job.status === "hidden" && status === "offer";
  job.status = status;
  job.version++;
  await cityWritePrivate(doc, "cityJob", job);
  await project(job);
  await reconcileCityJobs();
  if (status !== "hidden" && !reopening) {
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    for (const { group } of readableCommLinkJobGroups())
      for (const contract of group.jobs || [])
        if (contract.cityJobId === id)
          await initializeCityCommLink().setJobStatus({
            groupId: group.groupId,
            jobId: contract.id,
            status: cityToCommLinkStatus(status),
          });
  }
  if (job.acceptedBy)
    await ChatMessage.create({
      content: "<p>АГЕНТ · Статус заказа изменён</p>",
      whisper: [...new Set([job.acceptedBy, ...gmIds()])],
      flags: {
        [MID]: {
          cityJobResult: {
            status: "accepted",
            ownerUserId: job.acceptedBy,
            actorId: job.acceptedActorId,
            operationId: `status:${job.id}:${job.version}`,
            job: publicCityJob(job),
          },
        },
      },
    });
  return job;
}
export async function setCityJobMarker(id, markerId) {
  requireCityGM();
  markerId = String(markerId || "").trim();
  if (
    markerId &&
    !getWorldCityMap().markers.some((marker) => marker.id === markerId)
  )
    throw new Error(
      "Точка удалена или недоступна. Выберите существующую точку карты.",
    );
  const link = parseCommLinkJobReadId(id);
  if (link) {
    const row = listCityJobs().find((job) => job.id === id);
    if (!row) throw new Error("Заказ удалён.");
    if (row.cityJobId) return setCityJobMarker(row.cityJobId, markerId);
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    await initializeCityCommLink().editJob({
      ...link,
      changes: { cityMarkerId: markerId },
    });
    return listCityJobs().find((job) => job.id === id);
  }
  const doc = source(id);
  if (!doc || cityJobDeleted(id)) throw new Error("Заказ удалён.");
  const job = { ...structuredClone(jobOf(doc)), markerId };
  job.version = (Number(job.version) || 0) + 1;
  await cityWritePrivate(doc, "cityJob", job);
  await project(job);
  await reconcileCityJobs();
  if (job.acceptedBy)
    await ChatMessage.create({
      content: "<p>АГЕНТ · Место заказа обновлено</p>",
      whisper: [...new Set([job.acceptedBy, ...gmIds()])],
      flags: {
        [MID]: {
          cityJobResult: {
            status: "accepted",
            ownerUserId: job.acceptedBy,
            actorId: job.acceptedActorId,
            operationId: `map:${job.id}:${job.version}`,
            job: publicCityJob(job),
          },
        },
      },
    });
  return job;
}

export async function deleteCityJob(id, { reconcile = true } = {}) {
  requireCityGM();
  const link = parseCommLinkJobReadId(id);
  if (link) {
    const { initializeCityCommLink } =
      await import("./city-comm-link-runtime.mjs");
    return initializeCityCommLink().deleteJob(link);
  }
  const doc = source(id);
  if (!doc) throw new Error("Заказ удалён.");
  const job = structuredClone(jobOf(doc));
  if (!job.deletedAt) {
    job.deletedAt = new Date().toISOString();
    job.status = "deleted";
    job.version = (Number(job.version) || 0) + 1;
    await cityWritePrivate(doc, "cityJob", job);
  }
  await updateCityServices((state) => {
    state.jobs = state.jobs.filter((j) => j.id !== id);
    (state.jobTombstones ??= {})[id] = {
      version: job.version,
      deletedAt: job.deletedAt,
    };
  });
  for (const user of cityValues(game.users)) {
    const archive = readCityArchive(user.id);
    if (
      !Object.values(archive.notebooks || {}).some((book) =>
        book.entries?.quests?.some((q) => q.cityJobId === id),
      )
    )
      continue;
    await mutateCityArchive(user.id, (state) => {
      for (const book of Object.values(state.notebooks || {}))
        for (const q of book.entries?.quests || [])
          if (q.cityJobId === id)
            Object.assign(q, {
              cityJobStatus: "deleted",
              status: "Удалён",
              cityJobDeleted: true,
            });
    });
  }
  if (reconcile) await reconcileCityJobs();
  Hooks.callAll(CITY_SERVICES_HOOK);
  return { id, status: "deleted", version: job.version };
}
export async function openCityJobNetwork(id, actorId) {
  const job = listCityJobs().find((j) => j.id === id);
  if (!job?.commLinkGroupId)
    throw new Error("Заказ появится в Сети после создания подходящей команды.");
  const { openCityCommLinkJob } = await import("./city-comm-link-runtime.mjs");
  return openCityCommLinkJob({
    groupId: job.commLinkGroupId,
    jobId: job.commLinkJobId,
    actorId,
  });
}
export function openCityJobInNetwork(id, { actorId } = {}) {
  return openCityJobNetwork(id, actorId);
}
export function registerCityJobs() {
  return Hooks.on("createChatMessage", (doc) => {
    if (
      doc.flags?.[MID]?.cityJobRequest &&
      game.user.isGM &&
      (!game.users.activeGM || game.users.activeGM.id === game.user.id)
    )
      void processCityJobRequest(doc).catch(console.error);
    const result = doc.flags?.[MID]?.cityJobResult;
    if (
      result &&
      !cityJobDeleted(result.job?.id) &&
      cityAuthor(doc)?.isGM &&
      result.ownerUserId === game.user.id
    )
      void syncCityJobArchive(result.job, game.user.id, result.actorId).catch(
        console.error,
      );
    if (doc.flags?.[MID]?.cityJobRequest || result || doc.flags?.[MID]?.cityJobOffer ||
      doc.flags?.[MID]?.cityMarketInvitation || doc.flags?.[MID]?.cityMarketRequest)
      Hooks.callAll(CITY_SERVICES_HOOK);
  });
}
export async function syncCityJobsInbox() {
  for (const d of cityValues(game.messages)) {
    const r = d.flags?.[MID]?.cityJobResult;
    if (
      r &&
      !cityJobDeleted(r.job?.id) &&
      cityAuthor(d)?.isGM &&
      r.ownerUserId === game.user.id
    )
      await syncCityJobArchive(r.job, game.user.id, r.actorId);
  }
}
export async function resumeCityJobRequests() {
  requireCityGM();
  for (const d of cityValues(game.messages))
    if (d.flags?.[MID]?.cityJobRequest) await processCityJobRequest(d);
}
export function cityJobArchiveLink(job, actorId, ownerUserId = game.user.id) {
  const q = readCityArchive(ownerUserId).notebooks?.[
    actorId
  ]?.entries?.quests?.find((q) =>
    job.commLinkGroupId
      ? q.commLinkGroupId === job.commLinkGroupId &&
        q.commLinkJobId === job.commLinkJobId
      : q.cityJobId === job.id,
  );
  return q ? { ownerUserId, actorId, section: "quests", entryId: q.id } : null;
}
