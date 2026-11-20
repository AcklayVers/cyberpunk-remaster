import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportsToProtect = [
  "packs/cyberpunk-items/CURRENT",
  "packs/cyberpunk-items/000003.log",
  "content/exports/items.json",
  "content/exports/journals.json",
  "content/exports/macros.json",
  "data/item-folders.json",
];

async function digest(relative) {
  return crypto
    .createHash("sha256")
    .update(await fs.readFile(path.join(root, relative)))
    .digest("hex");
}

test("pack build is a pure consumer of canonical exports", async (t) => {
  const sandbox = await fs.mkdtemp(
    path.join(os.tmpdir(), "cyberpunk-build-test-"),
  );
  t.after(async () => {
    if (
      path.dirname(sandbox) !== os.tmpdir() ||
      !path.basename(sandbox).startsWith("cyberpunk-build-test-")
    )
      throw new Error("Unsafe test cleanup");
    await fs.rm(sandbox, { recursive: true, force: true });
  });
  for (const dir of ["scripts", "runtime", "content", "data"]) {
    await fs.cp(path.join(root, dir), path.join(sandbox, dir), {
      recursive: true,
    });
  }
  const before = new Map(
    await Promise.all(
      exportsToProtect.map(async (relative) => [
        relative,
        await digest(relative),
      ]),
    ),
  );
  await promisify(execFile)(
    process.execPath,
    [path.join(sandbox, "scripts", "build-packs.mjs")],
    {
      cwd: sandbox,
      timeout: 30_000,
      env: {
        ...process.env,
        CLASSIC_LEVEL_PATH: path.join(root, "node_modules", "classic-level"),
      },
    },
  );
  await fs.access(path.join(sandbox, "packs", "cyberpunk-items", "CURRENT"));
  for (const relative of exportsToProtect) {
    assert.equal(
      await digest(relative),
      before.get(relative),
      `${relative} was modified by the build`,
    );
  }
});
