import test from "node:test";
import assert from "node:assert/strict";
import { createCityRefreshQueue } from "../runtime/city-refresh-queue.mjs";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("background refresh coalesces bursts without running a poll after the last event", async () => {
  let count = 0;
  const queue = createCityRefreshQueue(() => count++, { delay: 5 });
  for (let i = 0; i < 50; i++) queue.request();
  await wait(35);
  assert.equal(count, 1);
  await wait(25);
  assert.equal(count, 1);
  queue.cancel();
});

test("continuous events do not starve a scheduled update", async () => {
  let count = 0;
  let ready, fail;
  const first = new Promise((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  const queue = createCityRefreshQueue(
    () => {
      count++;
      ready();
    },
    { delay: 8 },
  );
  const deadline = setTimeout(
    () => fail(Error("Continuous events starved the refresh")),
    1000,
  );
  const interval = setInterval(() => queue.request(), 2);
  try {
    queue.request();
    await first;
    assert.ok(count >= 1);
  } finally {
    clearTimeout(deadline);
    clearInterval(interval);
    queue.cancel();
  }
});

test("events arriving during an async refresh produce one serialized follow-up", async () => {
  let count = 0,
    release;
  const queue = createCityRefreshQueue(
    async () => {
      count++;
      if (count === 1) await new Promise((resolve) => (release = resolve));
    },
    { delay: 3 },
  );
  queue.request();
  await wait(20);
  assert.equal(count, 1);
  for (let i = 0; i < 30; i++) queue.request();
  await wait(20);
  assert.equal(count, 1);
  release();
  await wait(25);
  assert.equal(count, 2);
  queue.cancel();
});

test("closing cancels a pending refresh and ignores future events", async () => {
  let count = 0;
  const queue = createCityRefreshQueue(() => count++, { delay: 5 });
  queue.request();
  queue.cancel();
  queue.request();
  await wait(25);
  assert.equal(count, 0);
});

test("a rejected refresh is reported once and does not block a later event", async () => {
  let count = 0;
  const errors = [];
  const queue = createCityRefreshQueue(
    () => {
      count++;
      if (count === 1) throw Error("Refresh failed");
    },
    { delay: 3, onError: (error) => errors.push(error.message) },
  );
  queue.request();
  await wait(20);
  queue.request();
  await wait(20);
  assert.equal(count, 2);
  assert.deepEqual(errors, ["Refresh failed"]);
  queue.cancel();
});
