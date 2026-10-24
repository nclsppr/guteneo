import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { deployEngineering } from "../../scripts/deploy-engineering.mjs";
import {
  createEngineeringRelease,
  readEngineeringConfig,
  engineeringSourceScope,
  engineeringSourceSnapshot,
  verifyEngineeringRelease,
} from "../../scripts/engineering-release.mjs";

const requiredAssets = [
  "index.html",
  "404.html",
  "features/index.html",
  "features/permissions/index.html",
  "features/journeys/index.html",
  "llms.txt",
  "llms-full.txt",
  "_headers",
  "guide.html",
];
const config = await readEngineeringConfig(
  new URL("../../apps/engineering/wrangler.jsonc", import.meta.url),
);
const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
async function fixture(context) {
  const temporary = await mkdtemp(
    join(tmpdir(), "guteneo-engineering-release-"),
  );
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "checkout"),
    remote = join(temporary, "origin.git");
  await mkdir(root);
  git(temporary, "init", "--bare", remote);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Synthetic release test");
  git(root, "config", "user.email", "release@example.test");
  await mkdir(join(root, "apps/engineering/src"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "apps/engineering/dist/\n");
  await writeFile(
    join(root, "apps/engineering/src/guide.md"),
    "# Synthetic guide\n",
  );
  await writeFile(
    join(root, "apps/engineering/wrangler.jsonc"),
    JSON.stringify(config),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Synthetic reviewed source");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-u", "origin", "main");
  const commit = git(root, "rev-parse", "HEAD");
  const output = join(root, "apps/engineering/dist");
  const manifestPath = join(output, "release.json");
  async function build() {
    for (const asset of requiredAssets) {
      const file = join(output, asset);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `Synthetic ${asset}\n`);
    }
    return seal();
  }
  async function seal() {
    const manifest = await createEngineeringRelease(root, {
      commit,
      dirty: false,
      snapshot: await engineeringSourceSnapshot(root),
    });
    await writeFile(manifestPath, JSON.stringify(manifest));
    return manifest;
  }
  return { root, commit, output, manifestPath, build, seal };
}
function execution(f, browser = async () => {}, build = f.build) {
  const calls = [];
  return {
    calls,
    execute: async (command, args) => {
      calls.push([command, ...args]);
      if (command === "npm" && args[1] === "build:engineering") await build();
      if (command === "npm" && args[1] === "test:engineering") await browser();
    },
  };
}
const deployed = (calls) =>
  calls.some((call) => call[0] === "npx" && call.includes("deploy"));

test("the source digest includes the actual engineering browser suite", async () => {
  const config = await readFile(
    new URL("../../playwright.engineering.config.ts", import.meta.url),
    "utf8",
  );
  const directory = config.match(/testDir:\s*["']([^"']+)["']/)?.[1];
  assert.ok(directory, "The browser test directory must be explicit.");
  assert.ok(engineeringSourceScope.includes(directory.replace(/^\.\//, "")));
});

test("engineering release validates real clean main and all artifacts before injected publication", async (context) => {
  const f = await fixture(context),
    runner = execution(f);
  assert.deepEqual(
    await deployEngineering(f.commit, {
      root: f.root,
      execute: runner.execute,
    }),
    { sourceCommit: f.commit },
  );
  assert.equal(deployed(runner.calls), true);
  assert.deepEqual(
    runner.calls.map((call) => call.join(" ")),
    [
      "npm run docs:check",
      "npm run build:engineering",
      "npm run test:engineering",
      "npx --no-install wrangler deploy",
      "node scripts/verify-engineering.mjs https://engineering.guteneo.com",
    ],
  );
  const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
  assert.match(manifest.sourceSnapshotSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.assetsSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.assets.length, requiredAssets.length);
});

for (const state of [
  "branch",
  "dirty",
  "untracked",
  "hidden-index",
  "stale-origin",
  "fetch-failure",
  "unreviewed-commit",
]) {
  test(`engineering release refuses ${state} before any build/deploy`, async (context) => {
    const f = await fixture(context),
      runner = execution(f);
    if (state === "branch") git(f.root, "checkout", "-b", "codex/synthetic");
    if (state === "dirty")
      await writeFile(
        join(f.root, "apps/engineering/src/guide.md"),
        "Changed source",
      );
    if (state === "untracked")
      await writeFile(join(f.root, "unexpected.txt"), "Unreviewed source");
    if (state === "hidden-index")
      git(
        f.root,
        "update-index",
        "--assume-unchanged",
        "apps/engineering/src/guide.md",
      );
    if (state === "stale-origin") {
      git(f.root, "commit", "--allow-empty", "-m", "New remote revision");
      git(f.root, "push", "origin", "main");
      git(f.root, "reset", "--hard", f.commit);
      git(f.root, "update-ref", "refs/remotes/origin/main", f.commit);
    }
    if (state === "fetch-failure")
      git(
        f.root,
        "remote",
        "set-url",
        "origin",
        join(f.root, "missing-origin.git"),
      );
    await assert.rejects(
      deployEngineering(
        state === "unreviewed-commit" ? "f".repeat(40) : f.commit,
        { root: f.root, execute: runner.execute },
      ),
      /RELEASE_|ENGINEERING_REVIEWED_COMMIT_MISMATCH/,
    );
    assert.equal(runner.calls.length, 0);
  });
}

for (const mutation of [
  "modified",
  "added",
  "removed",
  "consistent-replacement",
  "manifest-only",
]) {
  test(`engineering release refuses ${mutation} ignored artifacts after browser checks`, async (context) => {
    const f = await fixture(context);
    const runner = execution(f, async () => {
      if (mutation === "modified" || mutation === "consistent-replacement")
        await writeFile(join(f.output, "guide.html"), "Replacement output");
      if (mutation === "added")
        await writeFile(join(f.output, "extra.html"), "Unexpected output");
      if (mutation === "removed") await rm(join(f.output, "guide.html"));
      if (mutation === "consistent-replacement") await f.seal();
      if (mutation === "manifest-only") {
        const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
        manifest.assets[0].sha256 = "0".repeat(64);
        await writeFile(f.manifestPath, JSON.stringify(manifest));
      }
    });
    await assert.rejects(
      deployEngineering(f.commit, { root: f.root, execute: runner.execute }),
      /ENGINEERING_RELEASE_ASSETS_MISMATCH/,
    );
    assert.equal(deployed(runner.calls), false);
  });
}

for (const field of [
  "commit",
  "dirty",
  "sourceSnapshotSha256",
  "sourceSnapshotScope",
  "assetsSha256",
]) {
  test(`engineering release rejects a mismatched build ${field}`, async (context) => {
    const f = await fixture(context);
    const runner = execution(f, undefined, async () => {
      const manifest = await f.build();
      manifest[field] =
        field === "dirty"
          ? true
          : field === "sourceSnapshotScope"
            ? []
            : "0".repeat(64);
      await writeFile(f.manifestPath, JSON.stringify(manifest));
    });
    await assert.rejects(
      deployEngineering(f.commit, { root: f.root, execute: runner.execute }),
      /ENGINEERING_(MANIFEST_SOURCE|RELEASE_ASSETS)_MISMATCH/,
    );
    assert.equal(
      runner.calls.some((call) => call.includes("test:engineering")),
      false,
    );
    assert.equal(deployed(runner.calls), false);
  });
}

test("snapshot and clean-main checks independently reject source drift", async (context) => {
  const f = await fixture(context);
  const snapshot = await engineeringSourceSnapshot(f.root);
  await f.build();
  await writeFile(
    join(f.root, "apps/engineering/src/guide.md"),
    "Changed input\n",
  );
  await assert.rejects(
    createEngineeringRelease(f.root, {
      commit: f.commit,
      dirty: false,
      snapshot,
    }),
    /ENGINEERING_SOURCE_CHANGED/,
  );
  await assert.rejects(
    verifyEngineeringRelease(f.root, f.commit),
    /ENGINEERING_MANIFEST_SOURCE_MISMATCH/,
  );
});

test("source changes during browsers stop the release before Wrangler", async (context) => {
  const f = await fixture(context);
  const runner = execution(f, () =>
    writeFile(
      join(f.root, "apps/engineering/src/guide.md"),
      "Changed while testing\n",
    ),
  );
  await assert.rejects(
    deployEngineering(f.commit, { root: f.root, execute: runner.execute }),
    /RELEASE_CLEAN_TREE_REQUIRED/,
  );
  assert.equal(deployed(runner.calls), false);
});

test("a newly advanced remote main after browsers blocks publication", async (context) => {
  const f = await fixture(context);
  const runner = execution(f, async () => {
    git(
      f.root,
      "commit",
      "--allow-empty",
      "-m",
      "New upstream revision during validation",
    );
    git(f.root, "push", "origin", "main");
    git(f.root, "reset", "--hard", f.commit);
    git(f.root, "update-ref", "refs/remotes/origin/main", f.commit);
  });
  await assert.rejects(
    deployEngineering(f.commit, { root: f.root, execute: runner.execute }),
    /RELEASE_ORIGIN_MAIN_MISMATCH/,
  );
  assert.equal(deployed(runner.calls), false);
});
