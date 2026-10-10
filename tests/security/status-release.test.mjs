import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildStatus } from "../../scripts/build-status.mjs";
import { deployStatus } from "../../scripts/deploy-status.mjs";
import {
  captureSourceSnapshot,
  sourceInputs,
} from "../../scripts/test-offline.mjs";

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

async function qualifiedFixture(t) {
  const root = await fixture(t);
  const directories = new Set([
    "apps/api",
    "apps/documents",
    "packages",
    "migrations",
    "tests/helpers",
    "tests/fixtures",
  ]);
  for (const input of sourceInputs(true)) {
    const file = join(
      root,
      input,
      ...(directories.has(input) ? ["fixture.txt"] : []),
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `Reviewed fixture: ${input}\n`);
  }
  await writeFile(
    join(root, ".gitignore"),
    "dist/\npackages/runtime-ignored.txt\n",
  );
  await writeFile(join(root, "packages/runtime-ignored.txt"), "original");
  const snapshot = await captureSourceSnapshot(root, sourceInputs(true));
  const report = {
    schema: 1,
    environment: "local",
    status: "passed",
    executedAt: "2026-10-09T22:41:04.304Z",
    sourceCommit: null,
    sourceSnapshotAlgorithm: "sha256-path-content-v1",
    sourceSnapshotSha256: snapshot.sha256,
    sourceSnapshotFileCount: snapshot.fileCount,
    sourceSnapshotScope: snapshot.scope,
    sourceUnchangedDuringRun: true,
  };
  await writeFile(
    join(root, "apps/status/public/qualification.json"),
    JSON.stringify(report),
  );
  for (const args of [
    ["add", "."],
    [
      "-c",
      "user.name=Status test",
      "-c",
      "user.email=status@example.invalid",
      "commit",
      "-m",
      "qualification fixture",
    ],
    ["remote", "add", "origin", root],
  ])
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  return { root, report, snapshot };
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

test("matching approved qualification sources preserve the dated evidence through deployment", async (t) => {
  const { root, report, snapshot } = await qualifiedFixture(t);
  const commands = [];
  await deployStatus({
    root,
    execute: (_command, args) => commands.push(args),
  });
  assert.equal(commands.length, 2);
  assert.ok(commands[0].includes("migrations"));
  assert.ok(commands[1].includes("deploy"));
  const published = JSON.parse(
    await readFile(join(root, "dist/status/qualification.json"), "utf8"),
  );
  assert.deepEqual(published, report);
  assert.equal(published.sourceCommit, null);
  const manifest = JSON.parse(
    await readFile(join(root, "dist/status/release.json"), "utf8"),
  );
  assert.deepEqual(manifest.qualificationSource, {
    sha256: snapshot.sha256,
    fileCount: snapshot.fileCount,
    scope: snapshot.scope,
  });
});

test("changed business sources remove stale qualification from the built assets", async (t) => {
  const { root, report } = await qualifiedFixture(t);
  await writeFile(join(root, "apps/api/fixture.txt"), "changed business logic");
  const manifest = await buildStatus(root);
  assert.equal(manifest.qualificationSource, null);
  assert.ok(
    !manifest.assets.some((asset) => asset.path === "/qualification.json"),
  );
  await assert.rejects(readFile(join(root, "dist/status/qualification.json")), {
    code: "ENOENT",
  });
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(root, "apps/status/public/qualification.json"),
        "utf8",
      ),
    ),
    report,
  );
});

test("self-consistent qualification hashes cannot choose a reduced source scope", async (t) => {
  const { root, report } = await qualifiedFixture(t);
  for (const scope of [["packages"], []]) {
    const snapshot = await captureSourceSnapshot(root, scope);
    await writeFile(
      join(root, "apps/status/public/qualification.json"),
      JSON.stringify({
        ...report,
        sourceSnapshotSha256: snapshot.sha256,
        sourceSnapshotFileCount: snapshot.fileCount,
        sourceSnapshotScope: snapshot.scope,
      }),
    );
    const manifest = await buildStatus(root);
    assert.equal(manifest.qualificationSource, null);
    assert.ok(
      !manifest.assets.some((asset) => asset.path === "/qualification.json"),
    );
  }
});

test("an ignored business source changed during migration prevents publication", async (t) => {
  const { root } = await qualifiedFixture(t);
  const commands = [];
  await assert.rejects(
    deployStatus({
      root,
      execute: (_command, args) => {
        commands.push(args);
        if (args.includes("migrations")) {
          writeFileSync(
            join(root, "packages/runtime-ignored.txt"),
            "changed while migrating",
          );
          assert.equal(
            execFileSync("git", ["status", "--porcelain"], {
              cwd: root,
              encoding: "utf8",
            }).trim(),
            "",
          );
        }
      },
    }),
    /STATUS_QUALIFICATION_SOURCE_MISMATCH/,
  );
  assert.equal(commands.length, 1);
  assert.ok(commands[0].includes("migrations"));
});
