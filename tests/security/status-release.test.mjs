import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildStatus } from "../../scripts/build-status.mjs";
import { deployStatus } from "../../scripts/deploy-status.mjs";

async function fixture(t, branch = "main") {
  const root = await mkdtemp(join(tmpdir(), "guteneo-status-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps/status/public"), { recursive: true });
  await writeFile(
    join(root, "apps/status/public/index.html"),
    "<h1>Status</h1>",
  );
  await writeFile(join(root, ".gitignore"), "dist/\n");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-b", branch);
  git("add", ".");
  git(
    "-c",
    "user.name=Status test",
    "-c",
    "user.email=status@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  return root;
}

test("status release binds the actual assets and source, preserving dirty evidence", async (t) => {
  const root = await fixture(t);
  const clean = await buildStatus(root);
  assert.equal(clean.sourceDirty, false);
  assert.equal(clean.assets.length, 1);
  assert.match(clean.sourceCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "dist/status/release.json"), "utf8")),
    clean,
  );
  await writeFile(
    join(root, "apps/status/public/index.html"),
    "<h1>Revised status</h1>",
  );
  const dirty = await buildStatus(root);
  assert.equal(dirty.sourceDirty, true);
  assert.notEqual(dirty.sourceSnapshotSha256, clean.sourceSnapshotSha256);
  assert.notEqual(dirty.assetsSha256, clean.assetsSha256);
});

test("a candidate branch cannot migrate or deploy the status service", async (t) => {
  const root = await fixture(t, "candidate");
  let commands = 0;
  await assert.rejects(
    deployStatus({
      root,
      execute: () => {
        commands++;
      },
    }),
    /RELEASE_MAIN_REQUIRED/,
  );
  assert.equal(commands, 0);
});

test("a dirty main cannot migrate or deploy the status service", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "unreviewed.txt"), "Unreviewed");
  let commands = 0;
  await assert.rejects(
    deployStatus({
      root,
      execute: () => {
        commands++;
      },
    }),
    /RELEASE_CLEAN_TREE_REQUIRED/,
  );
  assert.equal(commands, 0);
});

for (const target of ["index.html", "release.json"]) {
  test(`a replacement ${target} during migration prevents publication`, async (t) => {
    const root = await fixture(t);
    execFileSync("git", ["remote", "add", "origin", root], {
      cwd: root,
      stdio: "ignore",
    });
    const commands = [];
    await assert.rejects(
      deployStatus({
        root,
        execute: (_command, args) => {
          commands.push(args);
          if (args.includes("migrations"))
            writeFileSync(
              join(root, "dist/status", target),
              target === "release.json" ? "{}" : "changed",
            );
        },
      }),
      /STATUS_RELEASE_MISMATCH/,
    );
    assert.equal(commands.length, 1);
    assert.ok(commands[0].includes("migrations"));
  });
}
