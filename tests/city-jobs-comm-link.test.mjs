import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";

const MID = "cyberpunk-remaster";
function crew(e, id, members) {
  const data = {
    version: 8,
    revision: 0,
    groupId: id,
    groupName: id,
    memberActorIds: members,
    memberRoster: [],
    leaderActorId: members[0],
    contacts: [{ id: "fixer", name: "Fixer", source: "master" }],
    messages: [],
    calls: [],
    jobs: [],
    events: [],
    payments: [],
  };
  const doc = {
    id: `group-${id}`,
    ownership: { default: 0, a: 2, b: 2, g: 3 },
    flags: { [MID]: { commLink: { data } } },
    testUserPermission: (u) =>
      u.isGM ||
      members.some((actorId) =>
        game.actors.get(actorId)?.testUserPermission(u, "OWNER"),
      ),
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        let cursor = this;
        const keys = path.split(".");
        for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
        cursor[keys.at(-1)] = structuredClone(value);
      }
      Hooks.callAll("updateJournalEntry", this, changes);
      return this;
    },
  };
  e.journals.set(doc.id, doc);
  return doc;
}

test("city and Source contracts share crew status, acceptance and durable deletion without payments", async () => {
  const e = cityTestEnv();
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.document = { activeElement: null };
  const jobs = await import("../runtime/city-jobs.mjs");
  const city = await jobs.createCityJob({
    title: "City gig",
    description: "Public",
    gmText: "PRIVATE-GM",
    reward: "500",
    status: "offer",
    markerId: "pin",
  });
  assert.equal(
    jobs.listCityJobs().length,
    1,
    "a city job exists before a crew",
  );
  const first = crew(e, "first", ["aa"]),
    second = crew(e, "second", ["bb"]);
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "first",
                name: "first",
                journalId: first.id,
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
              {
                id: "second",
                name: "second",
                journalId: second.id,
                actorIds: ["bb"],
                leaderActorId: "bb",
              },
            ],
          },
        },
      },
    },
  });
  assert.equal(
    typeof jobs.reconcileCityJobs,
    "function",
    "existing city jobs must reconcile into existing crews",
  );
  await jobs.reconcileCityJobs();
  const source = (doc) => doc.flags[MID].commLink.data;
  assert.equal(source(first).jobs.length, 1);
  assert.equal(source(second).jobs.length, 1);
  assert.doesNotMatch(JSON.stringify(source(first)), /PRIVATE-GM|gmText/);
  const rows = jobs.listCityJobs();
  assert.equal(rows.length, 2);
  assert.equal(
    new Set(rows.map((r) => r.id)).size,
    2,
    "crew identities remain distinct",
  );
  const row = rows.find((r) => r.commLinkGroupId === "first");
  await jobs.requestCityJobAcceptance({
    jobId: row.id,
    actorId: "aa",
    operationId: "take-first",
  });
  assert.equal(source(first).jobs[0].status, "accepted");
  assert.equal(source(second).jobs[0].status, "available");
  assert.equal(
    jobs.listCityJobs().find((r) => r.id === row.id).status,
    "active",
  );
  await jobs.setCityJobStatus(row.id, "done");
  assert.equal(source(first).jobs[0].status, "completed");
  assert.equal(
    source(first).payments.length,
    0,
    "a status change never triggers payout",
  );
  const { initializeCityCommLink } =
    await import("../runtime/city-comm-link-runtime.mjs");
  const service = initializeCityCommLink();
  await service.setJobStatus({
    groupId: "first",
    jobId: source(first).jobs[0].id,
    status: "failed",
  });
  assert.equal(
    jobs.listCityJobs().find((r) => r.id === row.id).status,
    "failed",
  );
  const nativeId = source(first).jobs[0].id;
  await service.editJob({
    groupId: "first",
    jobId: nativeId,
    changes: { title: "Edited in Source", summary: "New briefing" },
  });
  assert.equal(
    jobs.listCityJobs().find((r) => r.id === row.id).title,
    "Edited in Source",
  );
  assert.equal(source(second).jobs[0].title, "Edited in Source");
  source(first).jobs[0].payoutLedger = {
    status: "paid",
    receipts: { aa: { status: "paid", amount: 500 } },
  };
  source(first).payments.push({
    id: "receipt",
    actorId: "aa",
    amount: 500,
    jobId: nativeId,
  });
  source(second).jobs[0].settlement = {
    paidAt: "2026-10-15T00:00:00.000Z",
    total: 250,
  };
  source(second).jobs[0].payoutLedger = {
    status: "paid",
    receipts: { bb: { status: "paid", amount: 250 } },
  };
  await service.deleteJob({ groupId: "first", jobId: nativeId });
  await jobs.reconcileCityJobs();
  assert.equal(
    jobs.listCityJobs().length,
    0,
    "Source deletion removes every live view of a linked city job",
  );
  assert.equal(source(first).jobs.length, 0);
  assert.equal(source(second).jobs.length, 0);
  assert.equal(
    source(first).payments[0].id,
    "receipt",
    "financial receipts survive deletion",
  );
  assert.equal(source(first).payoutLedgers[nativeId].status, "paid");
  assert.equal(
    source(second).payoutLedgers?.[nativeId]?.receipts.bb.amount,
    250,
    "global deletion preserves every crew's inline receipts",
  );
  assert.equal(source(second).jobSettlements?.[nativeId]?.total, 250);
  assert.ok(source(first).jobTombstones[nativeId]);
  game.user = e.users.get("a");
  assert.equal(jobs.listCityJobs().length, 0);
  await assert.rejects(
    () => jobs.requestCityJobAcceptance({ jobId: row.id, actorId: "aa" }),
    /недоступ|удал/,
  );
  await assert.rejects(() => jobs.deleteCityJob(row.id), /ведущ/);
  await assert.rejects(
    () => service.deleteJob({ groupId: "first", jobId: nativeId }),
    /MASTER|GM|ведущ/,
  );
  game.user = e.users.get("g");
  await service.refresh();
  assert.equal(
    jobs.listCityJobs().length,
    0,
    "reopening cannot resurrect the old publication",
  );
  source(first).jobs.push({
    id: "source-only",
    title: "Source contract",
    summary: "Briefing",
    status: "done",
    markerId: "pin",
    pay: "25",
  });
  await service.refresh();
  const native = jobs
    .listCityJobs()
    .find((r) => r.commLinkJobId === "source-only");
  assert.equal(
    native.status,
    "done",
    "legacy Source done normalizes to completed and City done",
  );
  assert.equal(
    native.markerId,
    "pin",
    "Source contracts retain their explicit place binding",
  );
  await jobs.setCityJobStatus(native.id, "offer");
  assert.equal(source(first).jobs[0].status, "available");
  await jobs.requestCityJobAcceptance({
    jobId: native.id,
    actorId: "aa",
    operationId: "source-native-take",
  });
  assert.equal(source(first).jobs[0].acceptedActorId, "aa");
  await jobs.deleteCityJob(native.id);
  assert.equal(jobs.listCityJobs().length, 0);
  assert.ok(source(first).jobTombstones["source-only"]);
  assert.ok(city.id);
});

test("deleted targeted legacy offers ignore old GM whispers while personal notes remain", async () => {
  const e = cityTestEnv();
  const jobs = await import("../runtime/city-jobs.mjs");
  const job = await jobs.createCityJob({
    title: "Legacy offer",
    audience: ["a"],
    status: "offer",
  });
  await jobs.syncCityJobArchive(job, "a", "aa");
  const archive = await import("../runtime/city-archive-service.mjs");
  await archive.mutateCityArchive("a", (s) => {
    s.notebooks.aa.entries.quests[0].content = "Personal notes";
  });
  assert.equal(
    typeof jobs.deleteCityJob,
    "function",
    "GM needs a deletion API",
  );
  await jobs.deleteCityJob(job.id);
  game.user = e.users.get("a");
  assert.equal(jobs.listCityJobs().length, 0);
  await jobs.syncCityJobsInbox();
  assert.equal(
    archive.readCityArchive("a").notebooks.aa.entries.quests[0].content,
    "Personal notes",
  );
  assert.equal(jobs.listCityJobs().length, 0);
});

test("hide and audience exclusion restore the same settled crew contract without exposing dormant briefing", async () => {
  const e = cityTestEnv();
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.document = { activeElement: null };
  const doc = crew(e, "reopen", ["aa"]);
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "reopen",
                name: "reopen",
                journalId: doc.id,
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
            ],
          },
        },
      },
    },
  });
  const jobs = await import("../runtime/city-jobs.mjs");
  const job = await jobs.createCityJob({
    title: "Settled contract",
    description: "DORMANT PRIVATE BRIEFING",
    reward: "500",
    status: "offer",
  });
  const source = () => doc.flags[MID].commLink.data;
  const nativeId = source().jobs[0].id;
  Object.assign(source().jobs[0], {
    status: "completed",
    acceptedBy: "aa",
    acceptedActorId: "aa",
    acceptedUserId: "a",
    settlement: {
      paidAt: "2026-10-15T00:00:00.000Z",
      total: 500,
      shares: [{ actorId: "aa", amount: 500 }],
    },
    payoutLedger: {
      status: "paid",
      paidAt: "2026-10-15T00:00:00.000Z",
      receipts: { aa: { status: "paid", amount: 500 } },
    },
  });
  source().payments.push({
    id: "old-receipt",
    actorId: "aa",
    jobId: nativeId,
    amount: 500,
  });
  await jobs.setCityJobStatus(job.id, "hidden");
  assert.equal(source().jobs.length, 0);
  assert.doesNotMatch(JSON.stringify(source()), /DORMANT PRIVATE BRIEFING/);
  assert.equal(
    source().jobTombstones[nativeId],
    undefined,
    "hiding is reversible, never deletion",
  );
  game.user = e.users.get("a");
  assert.equal(jobs.listCityJobs().length, 0);
  game.user = e.users.get("g");
  await jobs.setCityJobStatus(job.id, "offer");
  let restored = source().jobs.find((j) => j.id === nativeId);
  assert.equal(
    restored.settlement?.paidAt,
    "2026-10-15T00:00:00.000Z",
    "legacy inline settlement survives hide/reoffer",
  );
  assert.equal(restored.payoutLedger?.receipts.aa.status, "paid");
  assert.equal(
    restored.status,
    "completed",
    "reoffering a hidden publication preserves independent crew outcome",
  );
  assert.equal(restored.acceptedActorId, "aa");
  const journal = [...e.journals.values()].find(
    (d) => d.flags?.[MID]?.cityJob?.id === job.id,
  );
  journal.flags[MID].cityJob.audience = ["b"];
  await jobs.reconcileCityJobs();
  assert.equal(source().jobs.length, 0);
  assert.doesNotMatch(JSON.stringify(source()), /DORMANT PRIVATE BRIEFING/);
  journal.flags[MID].cityJob.audience = ["a"];
  await jobs.reconcileCityJobs();
  restored = source().jobs.find((j) => j.id === nativeId);
  assert.equal(restored.status, "completed");
  assert.equal(restored.acceptedActorId, "aa");
  assert.equal(restored.settlement.paidAt, "2026-10-15T00:00:00.000Z");
  assert.equal(source().payments.length, 1);
  assert.equal(source().payoutLedgers[nativeId].status, "paid");
  const { settleCommLinkPayout } =
    await import("../runtime/city-comm-link-core.mjs");
  let credits = 0;
  await settleCommLinkPayout({
    ledger: restored.payoutLedger,
    shares: [{ actorId: "aa", amount: 500 }],
    operationId: "repeat-after-hide",
    isPrimaryGM: () => true,
    getActor: () => ({
      inventory: {
        currency: { credits: 0 },
        addCoins: async () => {
          credits++;
        },
      },
    }),
    persist: async () => {},
  });
  assert.equal(
    credits,
    0,
    "restored paid ledger blocks a second native payout",
  );
});

test("legacy requests cannot accept revised city terms and applied crew receipts still replay", async () => {
  const e = cityTestEnv();
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.document = { activeElement: null };
  const doc = crew(e, "terms", ["aa"]);
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "terms",
                name: "terms",
                journalId: doc.id,
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
            ],
          },
        },
      },
    },
  });
  const jobs = await import("../runtime/city-jobs.mjs");
  const city = await jobs.createCityJob({
    title: "Original terms",
    reward: "500",
    status: "offer",
  });
  const request = (operationId, version) => ({
    author: e.users.get("a"),
    flags: {
      [MID]: {
        cityJobRequest: {
          jobId: city.id,
          actorId: "aa",
          operationId,
          version,
        },
      },
    },
  });
  const { initializeCityCommLink } =
    await import("../runtime/city-comm-link-runtime.mjs");
  const service = initializeCityCommLink();
  const nativeId = doc.flags[MID].commLink.data.jobs[0].id;
  await service.editJob({
    groupId: "terms",
    jobId: nativeId,
    changes: { pay: "5" },
  });
  const stale = await jobs.processCityJobRequest(
    request("old-offer", city.version),
  );
  assert.equal(
    stale.status,
    "denied",
    "the original city version is checked before translating to the crew version",
  );
  assert.equal(doc.flags[MID].commLink.data.jobs[0].status, "available");
  const journal = [...e.journals.values()].find(
    (d) => d.flags?.[MID]?.cityJob?.id === city.id,
  );
  const freshRequest = request(
    "current-offer",
    journal.flags[MID].cityJob.version,
  );
  assert.equal(
    (await jobs.processCityJobRequest(freshRequest)).status,
    "accepted",
  );
  const receiptCount = Object.keys(
    doc.flags[MID].commLink.data.operations,
  ).length;
  await service.editJob({
    groupId: "terms",
    jobId: nativeId,
    changes: { title: "Updated after acceptance" },
  });
  assert.equal(
    (await jobs.processCityJobRequest(freshRequest)).status,
    "accepted",
    "applied receipt remains idempotent after later edits",
  );
  assert.equal(
    Object.keys(doc.flags[MID].commLink.data.operations).length,
    receiptCount,
  );
});

test("an acceptance applied before crew creation stays idempotent after reconciliation", async () => {
  const e = cityTestEnv();
  const jobs = await import("../runtime/city-jobs.mjs");
  const city = await jobs.createCityJob({
    title: "Existing acceptance",
    status: "offer",
  });
  const request = {
    author: e.users.get("a"),
    flags: {
      [MID]: {
        cityJobRequest: {
          jobId: city.id,
          actorId: "aa",
          operationId: "pre-crew",
          version: city.version,
        },
      },
    },
  };
  assert.equal((await jobs.processCityJobRequest(request)).status, "accepted");
  const doc = crew(e, "later", ["aa"]);
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "later",
                name: "later",
                journalId: doc.id,
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
            ],
          },
        },
      },
    },
  });
  await jobs.reconcileCityJobs();
  const messageCount = e.messages.size;
  assert.equal((await jobs.processCityJobRequest(request)).status, "accepted");
  assert.equal(e.messages.size, messageCount);
  assert.equal(doc.flags[MID].commLink.data.jobs[0].acceptedActorId, "aa");
});
