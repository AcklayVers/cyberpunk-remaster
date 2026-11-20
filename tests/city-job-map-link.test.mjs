import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
import * as jobs from "../runtime/city-jobs.mjs";

const MID = "cyberpunk-remaster";
function setup() {
  const env = cityTestEnv();
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.document = { activeElement: null };
  env.settings.set(
    "worldCityMap",
    JSON.stringify({
      version: 5,
      markers: [
        { id: "bar", title: "Клуб", x: 0.4, y: 0.4 },
        { id: "clinic", title: "Клиника", x: 0.6, y: 0.6 },
      ],
    }),
  );
  return env;
}
function addCrew(env, groupId, member) {
  const doc = {
    id: groupId,
    ownership: { default: 0, g: 3, a: 2, b: 2 },
    flags: {
      [MID]: {
        commLink: {
          data: {
            groupId,
            groupName: groupId,
            memberActorIds: [member],
            leaderActorId: member,
            contacts: [],
            messages: [],
            calls: [],
            jobs: [],
            events: [],
            payments: [],
          },
        },
      },
    },
    testUserPermission: (u) =>
      u.isGM || game.actors.get(member).testUserPermission(u, "OWNER"),
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        let o = this;
        for (const k of keys.slice(0, -1)) o = o[k] ??= {};
        o[keys.at(-1)] = structuredClone(value);
      }
      return this;
    },
  };
  env.journals.set(doc.id, doc);
  return doc;
}

test("an existing city job can attach, change and clear an existing map point", async () => {
  const e = setup();
  const job = await jobs.createCityJob({
    title: "Delivery",
    status: "offer",
    reward: "8000",
  });
  assert.equal(typeof jobs.setCityJobMarker, "function");
  await jobs.setCityJobMarker(job.id, "bar");
  assert.equal(jobs.listCityJobs()[0].markerId, "bar");
  await jobs.setCityJobMarker(job.id, "clinic");
  assert.equal(jobs.listCityJobs()[0].markerId, "clinic");
  await assert.rejects(() => jobs.setCityJobMarker(job.id, "missing"), /точк/);
  assert.equal(jobs.listCityJobs()[0].markerId, "clinic");
  await jobs.setCityJobMarker(job.id, "");
  assert.equal(jobs.listCityJobs()[0].markerId, "");
  assert.equal(jobs.listCityJobs()[0].reward, "8000");
  game.user = e.users.get("a");
  await assert.rejects(() => jobs.setCityJobMarker(job.id, "bar"), /ведущ/);
});

test("point binding reaches every linked crew and preserves statuses and financial history", async () => {
  const e = setup();
  const first = addCrew(e, "first", "aa"),
    second = addCrew(e, "second", "bb");
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "first",
                name: "First",
                journalId: "first",
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
              {
                id: "second",
                name: "Second",
                journalId: "second",
                actorIds: ["bb"],
                leaderActorId: "bb",
              },
            ],
          },
        },
      },
    },
  });
  const job = await jobs.createCityJob({ title: "Linked", status: "offer" });
  const data = (doc) => doc.flags[MID].commLink.data;
  data(first).jobs[0].status = "completed";
  data(first).jobs[0].settlement = {
    paidAt: "2026-10-16T00:00:00Z",
    total: 8000,
  };
  const row = jobs.listCityJobs().find((j) => j.commLinkGroupId === "first");
  await jobs.setCityJobMarker(row.id, "bar");
  assert.equal(data(first).jobs[0].cityMarkerId, "bar");
  assert.equal(data(second).jobs[0].cityMarkerId, "bar");
  assert.equal(data(first).jobs[0].status, "completed");
  assert.equal(data(first).jobs[0].settlement.total, 8000);
  assert.equal(data(second).jobs[0].status, "available");
  await jobs.setCityJobMarker(job.id, "clinic");
  assert.ok(jobs.listCityJobs().every((j) => j.markerId === "clinic"));
  assert.equal(JSON.parse(e.settings.get("worldCityMap")).markers.length, 2);
});

test("a native Network job supports the same point binding without becoming a new city job", async () => {
  const e = setup(),
    crew = addCrew(e, "native", "aa");
  e.journals.set("control", {
    id: "control",
    flags: {
      [MID]: {
        commLink: {
          control: {
            groups: [
              {
                id: "native",
                name: "Native",
                journalId: "native",
                actorIds: ["aa"],
                leaderActorId: "aa",
              },
            ],
          },
        },
      },
    },
  });
  crew.flags[MID].commLink.data.jobs.push({
    id: "contract",
    title: "After closing",
    status: "accepted",
    pay: "8000",
    version: 2,
  });
  const id = jobs.listCityJobs()[0].id;
  await jobs.setCityJobMarker(id, "bar");
  assert.equal(jobs.listCityJobs()[0].markerId, "bar");
  await jobs.setCityJobMarker(id, "");
  assert.equal(jobs.listCityJobs()[0].markerId, "");
  assert.equal(jobs.listCityJobs()[0].status, "active");
  assert.equal(
    [...e.journals.values()].filter((j) => j.flags[MID].cityJob).length,
    0,
  );
});

test("GM cards expose map binding while player cards only expose map navigation", async () => {
  const e = setup();
  const { cityServicesHtml } = await import("../runtime/city-services-ui.mjs");
  const state = {
    tab: "jobs",
    jobs: [{ id: "job", title: "Contract", status: "offer", markerId: "bar" }],
    shops: [],
  };
  assert.match(cityServicesHtml(state), /data-service-action="job-link-map"/);
  game.user = e.users.get("a");
  const player = cityServicesHtml(state);
  assert.doesNotMatch(player, /data-service-action="job-link-map"/);
  assert.match(player, /data-service-action="job-map"/);
});
