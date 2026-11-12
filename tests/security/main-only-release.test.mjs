import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deployPublic,
  verifyReleaseTag,
} from "../../scripts/deploy-public.mjs";
import {
  collectAssets,
  releaseProfiles,
  sha256,
  sourceSnapshot,
  liveReleaseSending,
} from "../../scripts/release-source.mjs";

function git(root, ...args) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-release-guard-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "checkout");
  const origin = join(directory, "origin.git");
  await mkdir(root);
  git(directory, "init", "--bare", "--initial-branch=main", origin);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.email", "release-test@example.invalid");
  git(root, "config", "user.name", "Release fixture");
  git(root, "config", "core.hooksPath", "/dev/null");
  await mkdir(join(root, "apps/web"), { recursive: true });
  await mkdir(join(root, "reports"));
  await mkdir(join(root, "docs/releases"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "1.0.0" }),
  );
  await writeFile(
    join(root, "docs/releases/1.0.0.md"),
    "# Guteneo 1.0.0\n\nSynthetic release notes.\n",
  );
  await writeFile(join(root, ".gitignore"), "dist/\nnode_modules/\n.env*\n");
  await writeFile(
    join(root, "apps/web/source.js"),
    "export const realApplication = true;\n",
  );
  await writeFile(join(root, "reports/tracked-proof.json"), "{}\n");
  await writeFile(
    join(root, "wrangler.live.jsonc"),
    JSON.stringify({
      vars: {
        ENVIRONMENT: "production",
        MODE: "production",
        LIVE_SENDS_ENABLED: "false",
      },
    }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "initial source");
  git(root, "remote", "add", "origin", origin);
  git(root, "push", "-u", "origin", "main");
  git(root, "tag", "-a", "v1.0.0", "-m", "Synthetic release anchor");
  git(root, "push", "origin", "refs/tags/v1.0.0");
  const initial = git(root, "rev-parse", "HEAD");
  return { root, origin, initial, directory };
}
async function buildFixture(root, target) {
  const profile = releaseProfiles[target];
  const output = join(root, profile.output);
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "index.html"),
    "<!doctype html><title>Committed fixture</title>\n",
  );
  await writeFile(join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
  const assets = await collectAssets(output);
  const release = {
    product: "Guteneo",
    version: "1.0.0",
    mode: profile.mode,
    publicPreview: profile.publicPreview,
    ...(target === "live"
      ? await liveReleaseSending(root)
      : { liveSendsEnabled: false }),
    sourceCommit: git(root, "rev-parse", "HEAD"),
    sourceDirty: false,
    ...(target === "preview"
      ? { sourceTree: git(root, "rev-parse", "HEAD^{tree}") }
      : {}),
    sourceSnapshotScope: profile.scope,
    sourceSnapshotSha256: await sourceSnapshot(root, profile.scope),
    builtAt: "2026-09-17T08:00:00.000Z",
    assets,
    assetsSha256: sha256(JSON.stringify(assets)),
  };
  await writeFile(join(output, "release.json"), JSON.stringify(release));
  if (target === "preview")
    await writeFile(
      join(output, "health.json"),
      JSON.stringify({
        status: "ok",
        mode: release.mode,
        liveSendsEnabled: false,
        sourceCommit: release.sourceCommit,
        sourceSnapshotSha256: release.sourceSnapshotSha256,
        assetsSha256: release.assetsSha256,
        builtAt: release.builtAt,
      }),
    );
  return release;
}
function executor(
  root,
  target,
  { afterBuild, afterDeploy, verify, build = true } = {},
) {
  const calls = [];
  return {
    calls,
    async execute(command, args, options) {
      calls.push({ command, args, options });
      assert.equal(command, process.execPath);
      assert.equal(options.cwd, root);
      if (calls.length === 1) {
        assert.deepEqual(args, [join(root, releaseProfiles[target].build)]);
        if (build) await buildFixture(root, target);
        await afterBuild?.();
      } else if (calls.length === 2) {
        assert.deepEqual(args, [
          join(root, "node_modules/wrangler/bin/wrangler.js"),
          "deploy",
          "--config",
          releaseProfiles[target].config,
        ]);
        await afterDeploy?.();
      } else {
        assert.equal(target, "live");
        assert.equal(calls.length, 3);
        assert.deepEqual(args, [
          join(root, "scripts/verify-release.mjs"),
          "https://guteneo.com",
          join(root, "dist/web/release.json"),
        ]);
        await verify?.();
      }
    },
  };
}
async function mutateManifest(root, changes, target = "live") {
  const path = join(root, releaseProfiles[target].output, "release.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify({ ...manifest, ...changes }));
}
async function advanceOrigin(f) {
  const other = join(f.directory, "publisher");
  git(f.directory, "clone", f.origin, other);
  git(other, "config", "user.email", "other-test@example.invalid");
  git(other, "config", "user.name", "Other fixture");
  git(other, "config", "core.hooksPath", "/dev/null");
  await writeFile(join(other, "new-main.txt"), "New upstream revision\n");
  git(other, "add", ".");
  git(other, "commit", "-m", "advance upstream");
  git(other, "push", "origin", "main");
}

async function withVerificationConcurrency(value, action) {
  const key = "GUTENEO_RELEASE_VERIFY_CONCURRENCY";
  const previous = process.env[key];
  try {
    process.env[key] = value;
    return await action();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

test("invalid live verification concurrency refuses before source checks or any build or publication", async () => {
  let executed = 0;
  for (const value of ["", "0", "5", "1.5", " 1", "1 ", "1\n"])
    await withVerificationConcurrency(value, async () => {
      await assert.rejects(
        deployPublic("live", {
          // A source check would fail with a different error before this code.
          root: "/nonexistent-release-preflight-fixture",
          execute() {
            executed++;
            assert.fail(
              "Invalid concurrency must not run build or publication.",
            );
          },
        }),
        { message: "RELEASE_VERIFY_CONCURRENCY_INVALID" },
      );
    });
  assert.equal(executed, 0);
});

test("live verification receives the preflight concurrency despite a later environment change", async (t) => {
  const f = await fixture(t);
  await withVerificationConcurrency("1", async () => {
    const runner = executor(f.root, "live", {
      afterBuild() {
        process.env.GUTENEO_RELEASE_VERIFY_CONCURRENCY = "invalid";
      },
    });
    await deployPublic("live", { root: f.root, execute: runner.execute });
    assert.equal(runner.calls.length, 3);
    assert.equal(
      runner.calls[2].options.env.GUTENEO_RELEASE_VERIFY_CONCURRENCY,
      "1",
    );
  });
});

test("preview ignores the live-only verification concurrency environment", async (t) => {
  const f = await fixture(t);
  await withVerificationConcurrency("invalid", async () => {
    const runner = executor(f.root, "preview");
    await deployPublic("preview", { root: f.root, execute: runner.execute });
    assert.equal(runner.calls.length, 2);
    assert.ok(runner.calls.every((call) => call.options.env === undefined));
  });
});

test("a fresh operator gate after the build can refuse before any publication", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", {
      root: f.root,
      execute: runner.execute,
      beforePublish: async () => {
        throw new Error("OPERATOR_RELEASE_SOURCE_CHANGED");
      },
    }),
    /OPERATOR_RELEASE_SOURCE_CHANGED/,
  );
  assert.equal(runner.calls.length, 1);
});

test("assets cannot change while the final operator gate is running", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", {
      root: f.root,
      execute: runner.execute,
      beforePublish: async () => {
        await writeFile(join(f.root, "dist/web/index.html"), "changed");
      },
    }),
    /RELEASE_ASSETS_MISMATCH/,
  );
  assert.equal(runner.calls.length, 1);
});

for (const target of ["live", "preview"]) {
  test(`${target} publishes only a clean exact main with verified fresh artifacts`, async (t) => {
    const f = await fixture(t);
    const runner = executor(f.root, target);
    assert.deepEqual(
      await deployPublic(target, { root: f.root, execute: runner.execute }),
      { target, sourceCommit: f.initial },
    );
    assert.equal(runner.calls.length, target === "live" ? 3 : 2);
    assert.equal(
      git(f.root, "rev-parse", "refs/remotes/origin/main"),
      f.initial,
    );
  });
}

test("version anchor accepts annotated and lightweight exact remote tags", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await verifyReleaseTag(f.root, f.initial), {
    version: "1.0.0",
    tag: "v1.0.0",
    sourceCommit: f.initial,
  });
  git(f.root, "tag", "-f", "v1.0.0", f.initial);
  git(f.root, "push", "--force", "origin", "refs/tags/v1.0.0");
  assert.equal(
    (await verifyReleaseTag(f.root, f.initial)).sourceCommit,
    f.initial,
  );
});

test("an absent remote version tag refuses live before building despite a cached local tag", async (t) => {
  const f = await fixture(t);
  git(f.root, "push", "origin", ":refs/tags/v1.0.0");
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_REMOTE_TAG_REQUIRED/,
  );
  assert.equal(runner.calls.length, 0);
  assert.equal(git(f.root, "rev-parse", "v1.0.0^{}"), f.initial);
});

test("a moved remote tag refuses publication while the cached tag still matches", async (t) => {
  const f = await fixture(t);
  git(f.root, "commit", "--allow-empty", "-m", "different source");
  const other = git(f.root, "rev-parse", "HEAD");
  git(f.root, "push", "origin", `${other}:refs/tags/v1.0.0`, "--force");
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_ORIGIN_MAIN_MISMATCH/,
  );
  await assert.rejects(
    verifyReleaseTag(f.root, f.initial),
    /RELEASE_REMOTE_TAG_MISMATCH/,
  );
  assert.equal(runner.calls.length, 0);
  assert.equal(git(f.root, "rev-parse", "v1.0.0^{}"), f.initial);
});

test("deleting the remote version tag during build refuses deployment", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "live", {
    afterBuild() {
      git(f.root, "push", "origin", ":refs/tags/v1.0.0");
    },
  });
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_REMOTE_TAG_REQUIRED/,
  );
  assert.equal(runner.calls.length, 1);
});

test("preview remains independent of production version tags", async (t) => {
  const f = await fixture(t);
  git(f.root, "push", "origin", ":refs/tags/v1.0.0");
  const runner = executor(f.root, "preview");
  await deployPublic("preview", { root: f.root, execute: runner.execute });
  assert.equal(runner.calls.length, 2);
});

test("version anchor refuses unreachable origin instead of trusting a local tag", async (t) => {
  const f = await fixture(t);
  git(f.root, "remote", "set-url", "origin", join(f.directory, "missing.git"));
  await assert.rejects(
    verifyReleaseTag(f.root, f.initial),
    /RELEASE_GIT_CHECK_FAILED/,
  );
});

for (const version of [
  "../outside",
  "1.0",
  "1.0.0-rc.1",
  "01.0.0",
  "1.0.0\n",
  null,
]) {
  test(`version anchor refuses invalid version ${JSON.stringify(version)}`, async (t) => {
    const f = await fixture(t);
    await writeFile(join(f.root, "package.json"), JSON.stringify({ version }));
    await assert.rejects(
      verifyReleaseTag(f.root, f.initial),
      /RELEASE_VERSION_INVALID/,
    );
  });
}

test("version anchor requires human notes matching the exact version", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, "docs/releases/1.0.0.md"));
  await assert.rejects(
    verifyReleaseTag(f.root, f.initial),
    /RELEASE_NOTES_REQUIRED/,
  );
  await writeFile(
    join(f.root, "docs/releases/1.0.0.md"),
    "# Guteneo 1.0.1\nWrong version\n",
  );
  await assert.rejects(
    verifyReleaseTag(f.root, f.initial),
    /RELEASE_NOTES_VERSION_MISMATCH/,
  );
});

test("live publication waits for full verification of the exact published manifest", async (t) => {
  const f = await fixture(t);
  let published = false;
  let checked = false;
  const runner = executor(f.root, "live", {
    afterDeploy() {
      published = true;
    },
    async verify() {
      assert.equal(published, true);
      const manifest = JSON.parse(
        await readFile(join(f.root, "dist/web/release.json"), "utf8"),
      );
      assert.equal(manifest.sourceCommit, f.initial);
      assert.equal(manifest.sourceDirty, false);
      checked = true;
    },
  });
  await deployPublic("live", { root: f.root, execute: runner.execute });
  assert.equal(checked, true);
  assert.equal(runner.calls.length, 3);
});

test("post-deployment verification failure fails the release without redeploying", async (t) => {
  const f = await fixture(t);
  let published = false;
  const runner = executor(f.root, "live", {
    afterDeploy() {
      published = true;
    },
    verify() {
      throw new Error("Synthetic served-asset mismatch");
    },
  });
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_VERIFICATION_FAILED/,
  );
  assert.equal(published, true);
  assert.equal(runner.calls.length, 3);
});

test("a failed deployment never reaches public verification", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "live", {
    afterDeploy() {
      throw new Error("Synthetic deployment failure");
    },
    verify() {
      assert.fail("A failed deployment must not qualify a previous release.");
    },
  });
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /Synthetic deployment failure/,
  );
  assert.equal(runner.calls.length, 2);
});

async function configureSending(f, channels, enabled = true) {
  await writeFile(
    join(f.root, "wrangler.live.jsonc"),
    JSON.stringify({
      vars: {
        ENVIRONMENT: "production",
        MODE: "production",
        LIVE_SENDS_ENABLED: String(enabled),
        LIVE_SEND_CHANNELS: channels,
      },
    }),
  );
  git(f.root, "add", "wrangler.live.jsonc");
  git(f.root, "commit", "-m", "review transport configuration");
  git(f.root, "push", "origin", "main");
  publishFixtureTag(f.root);
}

// Every fixture has its own disposable bare remote, never the product remote.
function publishFixtureTag(root) {
  git(root, "tag", "-f", "-a", "v1.0.0", "-m", "Synthetic release anchor");
  git(root, "push", "--force", "origin", "refs/tags/v1.0.0");
}

for (const channels of ["fax,postal", "fax", "postal", "postal,fax"]) {
  test(`reviewed transport ${channels} publishes its exact channel metadata`, async (t) => {
    const f = await fixture(t);
    await configureSending(f, channels);
    const runner = executor(f.root, "live");
    await deployPublic("live", { root: f.root, execute: runner.execute });
    assert.equal(runner.calls.length, 3);
    const manifest = JSON.parse(
      await readFile(join(f.root, "dist/web/release.json"), "utf8"),
    );
    assert.equal(manifest.liveSendsEnabled, true);
    assert.deepEqual(manifest.liveSendChannels, channels.split(","));
  });
}

test("reviewed Resend email configuration preserves fax/postal and publishes all three channels", async (t) => {
  const f = await fixture(t);
  const configuration = {
    ENVIRONMENT: "production",
    MODE: "production",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "fax,postal,email",
    EMAIL_PROVIDER: "resend",
    RESEND_SENDS_ENABLED: "true",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_ACCOUNT_ID: "fictional-test-team",
    RESEND_DOMAIN_ID: "00000000-0000-4000-8000-000000000001",
    RESEND_TARIFF_QUALIFIED_UNTIL: "2099-01-01T00:00:00.000Z",
  };
  await writeFile(
    join(f.root, "wrangler.live.jsonc"),
    JSON.stringify({ vars: configuration }),
  );
  git(f.root, "add", "wrangler.live.jsonc");
  git(f.root, "commit", "-m", "review Resend transport");
  git(f.root, "push", "origin", "main");
  publishFixtureTag(f.root);
  const runner = executor(f.root, "live");
  await deployPublic("live", { root: f.root, execute: runner.execute });
  const manifest = JSON.parse(
    await readFile(join(f.root, "dist/web/release.json"), "utf8"),
  );
  assert.deepEqual(manifest.liveSendChannels, ["fax", "postal", "email"]);
  for (const key of [
    "EMAIL_PROVIDER",
    "RESEND_SENDS_ENABLED",
    "RESEND_ACCOUNT_ID",
    "RESEND_DOMAIN_ID",
    "RESEND_VERIFIED_DOMAIN",
    "RESEND_TARIFF_QUALIFIED_UNTIL",
  ]) {
    const vars = { ...configuration };
    delete vars[key];
    await writeFile(
      join(f.root, "wrangler.live.jsonc"),
      JSON.stringify({ vars }),
    );
    await assert.rejects(
      liveReleaseSending(f.root),
      /RELEASE_SENDING_CONFIGURATION_INVALID/,
    );
  }
});

test("disabling reviewed transport publishes an empty active channel list", async (t) => {
  const f = await fixture(t);
  await configureSending(f, "fax,postal", false);
  const runner = executor(f.root, "live");
  await deployPublic("live", { root: f.root, execute: runner.execute });
  assert.equal(runner.calls.length, 3);
  const manifest = JSON.parse(
    await readFile(join(f.root, "dist/web/release.json"), "utf8"),
  );
  assert.equal(manifest.liveSendsEnabled, false);
  assert.deepEqual(manifest.liveSendChannels, []);
});

for (const channels of [
  undefined,
  null,
  ["fax", "postal"],
  "",
  "email",
  "fax,email",
  "fax,postal,email",
  "fax,sms",
  "fax,fax",
  "fax,postal,postal",
  "fax, postal",
  "fax,",
  ",postal",
  "fax,,postal",
]) {
  test(`enabled production refuses unreviewed transport list ${JSON.stringify(channels)}`, async (t) => {
    const f = await fixture(t);
    await writeFile(
      join(f.root, "wrangler.live.jsonc"),
      JSON.stringify({
        vars: {
          ENVIRONMENT: "production",
          MODE: "production",
          LIVE_SENDS_ENABLED: "true",
          LIVE_SEND_CHANNELS: channels,
        },
      }),
    );
    await assert.rejects(
      liveReleaseSending(f.root),
      /RELEASE_SENDING_CONFIGURATION_INVALID/,
    );
  });
}

for (const channels of [[], ["fax"], ["fax", "postal", "email"]]) {
  test(`postal activation rejects inconsistent manifest channels ${JSON.stringify(channels)}`, async (t) => {
    const f = await fixture(t);
    await configureSending(f, "fax,postal");
    const runner = executor(f.root, "live", {
      afterBuild: () => mutateManifest(f.root, { liveSendChannels: channels }),
    });
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_MANIFEST_MISMATCH/,
    );
    assert.equal(runner.calls.length, 1);
  });
}

test("preview cannot publish an enabled transport or a channel list", async (t) => {
  const f = await fixture(t);
  for (const changes of [
    { liveSendsEnabled: true },
    { liveSendChannels: ["fax"] },
  ]) {
    const runner = executor(f.root, "preview", {
      afterBuild: () => mutateManifest(f.root, changes, "preview"),
    });
    await assert.rejects(
      deployPublic("preview", { root: f.root, execute: runner.execute }),
      /RELEASE_MANIFEST_MISMATCH/,
    );
    assert.equal(runner.calls.length, 1);
  }
});

for (const branch of ["feature/test", "detached"]) {
  test(`refuses ${branch} before running build or deployment`, async (t) => {
    const f = await fixture(t);
    if (branch === "detached") git(f.root, "checkout", "--detach");
    else git(f.root, "checkout", "-b", branch);
    const runner = executor(f.root, "live");
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_(MAIN_REQUIRED|GIT_CHECK_FAILED)/,
    );
    assert.equal(runner.calls.length, 0);
  });
}

for (const dirty of ["tracked", "staged", "untracked", "outside-build-scope"]) {
  test(`refuses ${dirty} changes before any build or deploy effect`, async (t) => {
    const f = await fixture(t);
    const path =
      dirty === "untracked"
        ? "untracked.txt"
        : dirty === "outside-build-scope"
          ? "reports/tracked-proof.json"
          : "apps/web/source.js";
    await writeFile(join(f.root, path), "uncommitted changes\n");
    if (dirty === "staged") git(f.root, "add", path);
    const runner = executor(f.root, "live");
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_CLEAN_TREE_REQUIRED/,
    );
    assert.equal(runner.calls.length, 0);
  });
}

test("fetch failure cannot fall back to an apparently matching cached origin/main", async (t) => {
  const f = await fixture(t);
  await rm(f.origin, { recursive: true, force: true });
  assert.equal(git(f.root, "rev-parse", "origin/main"), f.initial);
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_GIT_CHECK_FAILED/,
  );
  assert.equal(runner.calls.length, 0);
});

for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
  test(`refuses source hidden by ${flag} before building`, async (t) => {
    const f = await fixture(t);
    git(f.root, "update-index", flag, "apps/web/source.js");
    await writeFile(
      join(f.root, "apps/web/source.js"),
      "hidden uncommitted bytes\n",
    );
    assert.equal(git(f.root, "status", "--porcelain"), "");
    const runner = executor(f.root, "live");
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_CLEAN_TREE_REQUIRED/,
    );
    assert.equal(runner.calls.length, 0);
  });
}

test("fresh fetch discovers that main advanced remotely and prevents the build", async (t) => {
  const f = await fixture(t);
  await advanceOrigin(f);
  assert.equal(git(f.root, "rev-parse", "origin/main"), f.initial);
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_ORIGIN_MAIN_MISMATCH/,
  );
  assert.equal(runner.calls.length, 0);
});

test("a local main commit absent upstream cannot publish", async (t) => {
  const f = await fixture(t);
  git(f.root, "commit", "--allow-empty", "-m", "not pushed");
  const runner = executor(f.root, "live");
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_ORIGIN_MAIN_MISMATCH/,
  );
  assert.equal(runner.calls.length, 0);
});

for (const change of [
  "upstream",
  "source",
  "branch",
  "fetch-failure",
  "new-main",
]) {
  test(`rechecks ${change} after build and refuses before deployment`, async (t) => {
    const f = await fixture(t);
    const runner = executor(f.root, "live", {
      afterBuild: async () => {
        if (change === "upstream") await advanceOrigin(f);
        if (change === "source")
          await writeFile(
            join(f.root, "apps/web/source.js"),
            "changed during build",
          );
        if (change === "branch") git(f.root, "checkout", "-b", "other");
        if (change === "fetch-failure")
          await rm(f.origin, { recursive: true, force: true });
        if (change === "new-main") {
          git(f.root, "commit", "--allow-empty", "-m", "different main");
          git(f.root, "push", "origin", "main");
        }
      },
    });
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_/,
    );
    assert.equal(runner.calls.length, 1);
  });
}

for (const [field, value] of [
  ["sourceCommit", "f".repeat(40)],
  ["version", "9.9.9"],
  ["sourceDirty", true],
  ["sourceDirty", null],
  ["mode", "public-design-preview"],
  ["publicPreview", true],
  ["liveSendsEnabled", true],
  ["liveSendChannels", ["fax"]],
  ["sourceSnapshotScope", []],
  ["sourceSnapshotSha256", "0".repeat(64)],
  ["assetsSha256", "0".repeat(64)],
]) {
  test(`rejects an inconsistent manifest ${field} before deployment`, async (t) => {
    const f = await fixture(t);
    const runner = executor(f.root, "live", {
      afterBuild: () => mutateManifest(f.root, { [field]: value }),
    });
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_(MANIFEST|SOURCE_DIGEST|ASSETS)_MISMATCH/,
    );
    assert.equal(runner.calls.length, 1);
  });
}

for (const alteration of ["modified", "missing", "extra", "symlink"]) {
  test(`refuses ${alteration} build assets even when source Git status is clean`, async (t) => {
    const f = await fixture(t);
    const output = join(f.root, "dist/web");
    const runner = executor(f.root, "live", {
      afterBuild: async () => {
        if (alteration === "modified")
          await writeFile(join(output, "index.html"), "tampered");
        if (alteration === "missing") await rm(join(output, "index.html"));
        if (alteration === "extra")
          await writeFile(join(output, "unexpected.js"), "unreviewed bytes");
        if (alteration === "symlink")
          await symlink(
            join(f.root, "apps/web/source.js"),
            join(output, "unexpected.js"),
          );
        assert.equal(git(f.root, "status", "--porcelain"), "");
      },
    });
    await assert.rejects(
      deployPublic("live", { root: f.root, execute: runner.execute }),
      /RELEASE_ASSETS_MISMATCH|regular files/,
    );
    assert.equal(runner.calls.length, 1);
  });
}

test("preview health is verified separately rather than silently excluded", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "preview", {
    afterBuild: () =>
      writeFile(join(f.root, "dist/preview/health.json"), '{"status":"ok"}'),
  });
  await assert.rejects(
    deployPublic("preview", { root: f.root, execute: runner.execute }),
    /RELEASE_HEALTH_MISMATCH/,
  );
  assert.equal(runner.calls.length, 1);
});

test("preview sourceTree must match the same committed Git tree", async (t) => {
  const f = await fixture(t);
  const runner = executor(f.root, "preview", {
    afterBuild: () =>
      mutateManifest(f.root, { sourceTree: "0".repeat(40) }, "preview"),
  });
  await assert.rejects(
    deployPublic("preview", { root: f.root, execute: runner.execute }),
    /RELEASE_MANIFEST_MISMATCH/,
  );
  assert.equal(runner.calls.length, 1);
});

test("missing build output or failed build never reaches the deployment command", async (t) => {
  const f = await fixture(t);
  const noOutput = executor(f.root, "live", { build: false });
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: noOutput.execute }),
    /RELEASE_MANIFEST_INVALID/,
  );
  assert.equal(noOutput.calls.length, 1);
  let calls = 0;
  await assert.rejects(
    deployPublic("live", {
      root: f.root,
      execute: () => {
        calls++;
        throw new Error("build failed");
      },
    }),
    /build failed/,
  );
  assert.equal(calls, 1);
});

test("target input cannot select alternate configs or append Wrangler flags", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  for (const target of [
    "__proto__",
    "other",
    "live --config other.jsonc",
    "../live",
  ])
    await assert.rejects(
      deployPublic(target, {
        root: f.root,
        execute: () => {
          calls++;
        },
      }),
      /RELEASE_TARGET_INVALID/,
    );
  assert.equal(calls, 0);
});

test("source snapshot includes the guard and shared digest helper, including ignored-index content drift", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, "scripts"));
  await writeFile(
    join(f.root, "scripts/deploy-public.mjs"),
    "original guard\n",
  );
  await writeFile(
    join(f.root, "scripts/release-source.mjs"),
    "original helper\n",
  );
  git(f.root, "add", ".");
  git(f.root, "commit", "-m", "fixture tooling");
  git(f.root, "push", "origin", "main");
  publishFixtureTag(f.root);
  const runner = executor(f.root, "live", {
    afterBuild: async () => {
      git(
        f.root,
        "update-index",
        "--assume-unchanged",
        "scripts/deploy-public.mjs",
      );
      await writeFile(
        join(f.root, "scripts/deploy-public.mjs"),
        "changed bytes hidden from git status\n",
      );
      assert.equal(git(f.root, "status", "--porcelain"), "");
    },
  });
  await assert.rejects(
    deployPublic("live", { root: f.root, execute: runner.execute }),
    /RELEASE_CLEAN_TREE_REQUIRED/,
  );
  assert.equal(runner.calls.length, 1);
  for (const profile of Object.values(releaseProfiles)) {
    assert.ok(profile.scope.includes("scripts/deploy-public.mjs"));
    assert.ok(profile.scope.includes("scripts/release-source.mjs"));
  }
});
