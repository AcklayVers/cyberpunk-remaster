import {
  CITY_MID as MID,
  cityValues,
  cityServices,
  cityPrivateDocuments,
  cityWritePrivate,
  requireCityGM,
  updateCityServices,
} from "./city-services-state.mjs";
import { commLinkOwnsActor } from "./city-comm-link-core.mjs";

export const cityToCommLinkStatus = (status) =>
  ({
    offer: "available",
    active: "accepted",
    done: "completed",
    failed: "failed",
    hidden: "cancelled",
    cancelled: "cancelled",
    declined: "declined",
  })[status] || status;
export const commLinkToCityStatus = (status) =>
  ({
    available: "offer",
    accepted: "active",
    completed: "done",
  })[status] || status;
export const commLinkJobReadId = (groupId, jobId) =>
  `comm-link-job:${encodeURIComponent(groupId)}:${encodeURIComponent(jobId)}`;
export function parseCommLinkJobReadId(id) {
  const match = /^comm-link-job:([^:]+):(.+)$/.exec(String(id || ""));
  if (!match) return null;
  try {
    return {
      groupId: decodeURIComponent(match[1]),
      jobId: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}
export function cityJobDeleted(id) {
  return (
    !!(game.settings?.get && cityServices().jobTombstones?.[id]) ||
    cityPrivateDocuments("cityJob").some(
      (doc) =>
        doc.flags[MID].cityJob.id === id && doc.flags[MID].cityJob.deletedAt,
    )
  );
}
export function cityJobTermsMatch(id, version) {
  const job = cityPrivateDocuments("cityJob").find(
    (doc) => doc.flags[MID].cityJob.id === id,
  )?.flags[MID].cityJob;
  return !!job && !job.deletedAt && Number(job.version) === Number(version);
}
export function readableCommLinkJobGroups({
  actorId = "",
  user = game.user,
} = {}) {
  return cityValues(game.journal).flatMap((doc) => {
    const group = doc.flags?.[MID]?.commLink?.data;
    if (!group?.groupId) return [];
    const members = group.memberActorIds || [];
    if (
      actorId &&
      (!members.includes(actorId) ||
        !commLinkOwnsActor(game.actors.get(actorId), user))
    )
      return [];
    if (
      !user?.isGM &&
      (doc.testUserPermission?.(user, "OBSERVER") !== true ||
        !members.some((id) => commLinkOwnsActor(game.actors.get(id), user)))
    )
      return [];
    return [{ doc, group }];
  });
}
export function commLinkCityJobRow(job, group) {
  return {
    id: commLinkJobReadId(group.groupId, job.id),
    version: Number(job.version) || 1,
    title: String(job.title || "Заказ"),
    description: String(job.details || job.summary || ""),
    fixer: String(job.fixerName || "Фиксер"),
    reward: String(job.pay || ""),
    status: commLinkToCityStatus(job.status),
    markerId: String(job.cityMarkerId || job.markerId || ""),
    giverMarkerId: String(job.cityGiverMarkerId || ""),
    acceptedBy: job.acceptedUserId || job.acceptedBy || "",
    acceptedActorId: job.acceptedActorId || "",
    cityJobId: job.cityJobId || "",
    commLinkGroupId: group.groupId,
    commLinkGroupName: group.groupName || group.groupId,
    commLinkJobId: job.id,
    crewActorIds: [...(group.memberActorIds || [])],
  };
}
function eligible(job, group) {
  if (!(group.memberActorIds || []).length) return false;
  if (!(job.audience || []).length) return true;
  const recipients = cityValues(game.users).filter(
    (user) =>
      !user.isGM &&
      (group.memberActorIds || []).some((id) =>
        commLinkOwnsActor(game.actors.get(id), user),
      ),
  );
  return (
    recipients.length > 0 &&
    recipients.every((user) => job.audience.includes(user.id))
  );
}
const fields = (job) => ({
  title: String(job.title || "Заказ"),
  summary: String(job.description || ""),
  details: String(job.description || ""),
  fixerName: String(job.fixer || "Фиксер"),
  pay: String(job.reward || ""),
  cityMarkerId: String(job.markerId || ""),
  cityGiverMarkerId: String(job.giverMarkerId || ""),
});
let crewStateQueue = Promise.resolve();
function preserveCrewState(doc, groupId, contract) {
  const next = crewStateQueue
    .catch(() => {})
    .then(async () => {
      const current = structuredClone(doc.flags[MID].cityJob);
      if (current.deletedAt) return;
      const state = Object.fromEntries(
        [
          "id",
          "cityJobId",
          "version",
          "status",
          "acceptedBy",
          "acceptedActorId",
          "acceptedUserId",
          "settlement",
          "payoutLedger",
          "createdAt",
          "updatedAt",
          "publicationId",
          "fixerId",
          "fixerActorId",
          "fixerImage",
          "deadline",
          "risk",
          "currency",
        ]
          .filter((key) => contract[key] !== undefined)
          .map((key) => [key, structuredClone(contract[key])]),
      );
      (current.commLinkCrewStates ??= {})[groupId] = state;
      await cityWritePrivate(doc, "cityJob", current);
    });
  crewStateQueue = next;
  return next;
}
function preserveJobReceipts(group, job) {
  if (job.payoutLedger)
    (group.payoutLedgers ??= {})[job.id] = structuredClone(job.payoutLedger);
  if (job.settlement)
    (group.jobSettlements ??= {})[job.id] = structuredClone(job.settlement);
}
export async function projectCityJobsIntoCommLink(group) {
  const before = JSON.stringify(group.jobs || []);
  group.jobs ??= [];
  group.jobTombstones ??= {};
  for (const doc of cityPrivateDocuments("cityJob")) {
    const job = doc.flags[MID].cityJob,
      id = `city-job:${job.id}`;
    let contract = group.jobs.find(
      (j) => j.cityJobId === job.id || j.id === id,
    );
    if (job.deletedAt || cityJobDeleted(job.id)) {
      if (contract) removeCommLinkJob(group, contract.id);
      if (contract || eligible(job, group))
        group.jobTombstones[id] ??= {
          deletedAt: job.deletedAt || new Date().toISOString(),
          cityJobId: job.id,
          version: job.version,
        };
      group.jobs = group.jobs.filter(
        (j) => j.cityJobId !== job.id && j.id !== id,
      );
      continue;
    }
    if (!eligible(job, group) || job.status === "hidden") {
      if (contract) {
        await preserveCrewState(doc, group.groupId, contract);
        preserveJobReceipts(group, contract);
      }
      group.jobs = group.jobs.filter(
        (j) => j.cityJobId !== job.id && j.id !== id,
      );
      continue;
    }
    if (group.jobTombstones[id]) continue;
    if (!contract) {
      const saved = job.commLinkCrewStates?.[group.groupId];
      contract = {
        id,
        cityJobId: job.id,
        version: 1,
        status: cityToCommLinkStatus(job.status),
        acceptedBy: job.acceptedActorId
          ? game.actors.get(job.acceptedActorId)?.name || ""
          : "",
        acceptedActorId: job.acceptedActorId || "",
        acceptedUserId: job.acceptedBy || "",
        risk: 3,
        currency: "Credits",
        createdAt: new Date().toISOString(),
        ...(saved ? structuredClone(saved) : {}),
        settlement: saved?.settlement || group.jobSettlements?.[id] || null,
        payoutLedger: saved?.payoutLedger || group.payoutLedgers?.[id] || null,
      };
      group.jobs.push(contract);
    }
    if (Number(contract.cityJobVersion) !== Number(job.version)) {
      Object.assign(contract, fields(job), {
        cityJobVersion: job.version,
        updatedAt: new Date().toISOString(),
      });
      contract.version = (Number(contract.version) || 0) + 1;
    }
  }
  group.jobs = group.jobs.filter(
    (job) =>
      !group.jobTombstones[job.id] &&
      !(job.cityJobId && cityJobDeleted(job.cityJobId)),
  );
  return before !== JSON.stringify(group.jobs);
}
export async function syncCityJobEditsFromCommLink(group, previous) {
  requireCityGM();
  for (const contract of group.jobs || []) {
    const old = previous?.jobs?.find((job) => job.id === contract.id);
    if (!contract.cityJobId || !old || cityJobDeleted(contract.cityJobId))
      continue;
    if (
      [
        "title",
        "summary",
        "details",
        "fixerName",
        "pay",
        "cityMarkerId",
        "cityGiverMarkerId",
      ].every((key) => contract[key] === old[key])
    )
      continue;
    const doc = cityPrivateDocuments("cityJob").find(
      (d) => d.flags[MID].cityJob.id === contract.cityJobId,
    );
    if (!doc) continue;
    const job = structuredClone(doc.flags[MID].cityJob);
    Object.assign(job, {
      title: contract.title,
      description:
        contract.details !== old.details ? contract.details : contract.summary,
      fixer: contract.fixerName,
      reward: contract.pay,
      markerId: contract.cityMarkerId || "",
      giverMarkerId: contract.cityGiverMarkerId || "",
      version: (Number(job.version) || 0) + 1,
    });
    await cityWritePrivate(doc, "cityJob", job);
    Object.assign(contract, fields(job));
    contract.cityJobVersion = job.version;
    await updateCityServices((state) => {
      const publicJob = state.jobs.find((j) => j.id === job.id);
      if (publicJob)
        Object.assign(publicJob, {
          title: job.title,
          description: job.description,
          fixer: job.fixer,
          reward: job.reward,
          markerId: job.markerId,
          giverMarkerId: job.giverMarkerId,
          version: job.version,
        });
    });
  }
}
export function removeCommLinkJob(group, id) {
  const job = group.jobs?.find((j) => j.id === id);
  if (!job) return false;
  (group.jobTombstones ??= {})[id] = {
    deletedAt: new Date().toISOString(),
    version: (Number(job.version) || 0) + 1,
    cityJobId: job.cityJobId || "",
  };
  preserveJobReceipts(group, job);
  group.jobs = group.jobs.filter((j) => j.id !== id);
  group.events = (group.events || []).filter(
    (e) => !(e.targetType === "job" && e.targetId === id),
  );
  return true;
}
