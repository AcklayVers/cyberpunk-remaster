import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv, cityArchive } from "./fixtures/city-services.mjs";
test("job authority accepts one concurrent claimant, retries once and keeps secrets private", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-jobs.mjs").catch(() => null);
  assert.ok(m, "job service must exist");
  const job = await m.createCityJob({
    title: "Delivery",
    status: "offer",
    description: "Public",
    gmText: "SECRET",
    audience: [],
    markerId: "p",
  });
  const doc = (user, actor, op) => ({
    id: op,
    author: e.users.get(user),
    flags: {
      "cyberpunk-remaster": {
        cityJobRequest: {
          jobId: job.id,
          actorId: actor,
          operationId: op,
          version: job.version,
        },
      },
    },
  });
  const [a, b] = await Promise.all([
    m.processCityJobRequest(doc("a", "aa", "op1")),
    m.processCityJobRequest(doc("b", "bb", "op2")),
  ]);
  assert.equal([a, b].filter((r) => r.status === "accepted").length, 1);
  assert.equal(
    (await m.processCityJobRequest(doc("a", "aa", "op1"))).status,
    "accepted",
  );
  assert.doesNotMatch(
    JSON.stringify(e.settings.get("cityServicesV1")),
    /SECRET|gmText/,
  );
  game.user = e.users.get("b");
  assert.equal(
    m.listCityJobs().some((j) => j.gmText),
    false,
  );
  await assert.rejects(() => m.createCityJob({ title: "Forged" }), /ведущ/);
});
test("targeted offers remain private and syncing a job preserves personal notes and tasks", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-jobs.mjs").catch(() => null);
  assert.ok(m);
  const job = await m.createCityJob({
    title: "Private offer",
    status: "offer",
    audience: ["a"],
    description: "TARGETED",
    gmText: "GM",
  });
  assert.doesNotMatch(
    JSON.stringify(e.settings.get("cityServicesV1")),
    /TARGETED|Private offer/,
  );
  game.user = e.users.get("b");
  assert.equal(m.listCityJobs().length, 0);
  game.user = e.users.get("a");
  e.users.get("a").flags = {
    cyberpunkRemaster: { neuroArchive: { data: cityArchive() } },
  };
  await m.syncCityJobArchive({ ...job, status: "active" }, "a", "aa");
  const { mutateCityArchive, readCityArchive } =
    await import("../runtime/city-archive-service.mjs");
  await mutateCityArchive("a", (s) => {
    const q = s.notebooks.aa.entries.quests[0];
    q.content = "My notes";
    q.tasks = [{ id: "t", text: "Custom" }];
  });
  await m.syncCityJobArchive({ ...job, status: "done" }, "a", "aa");
  const q = readCityArchive("a").notebooks.aa.entries.quests;
  assert.equal(q.length, 1);
  assert.equal(q[0].content, "My notes");
  assert.equal(q[0].tasks[0].text, "Custom");
});

test("pending job requests resume when a GM returns and replay does not redeliver personal offers", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-jobs.mjs");
  const job = await m.createCityJob({
    title: "Private",
    status: "offer",
    audience: ["a"],
  });
  game.user = e.users.get("a");
  await m.requestCityJobAcceptance({
    jobId: job.id,
    actorId: "aa",
    operationId: "offline",
  });
  game.user = e.users.get("g");
  assert.equal(typeof m.resumeCityJobRequests, "function");
  await m.resumeCityJobRequests();
  const count = e.messages.size;
  await m.resumeCityJobRequests();
  assert.equal(e.messages.size, count);
  assert.ok(
    [...e.messages.values()].some(
      (d) =>
        d.flags?.["cyberpunk-remaster"]?.cityJobResult?.status === "accepted",
    ),
  );
});
test("hiding a targeted offer removes the old invitation from the player list", async () => {
  const e = cityTestEnv();
  const m = await import("../runtime/city-jobs.mjs");
  const job = await m.createCityJob({
    title: "Targeted",
    status: "offer",
    audience: ["a"],
  });
  game.user = e.users.get("a");
  assert.equal(m.listCityJobs().length, 1);
  game.user = e.users.get("g");
  await m.setCityJobStatus(job.id, "hidden");
  game.user = e.users.get("a");
  assert.equal(m.listCityJobs().length, 0);
});
