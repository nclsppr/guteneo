import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deployPdfValidator } from "../../scripts/deploy-pdf-validator.mjs";

const privateConfig = {
  name: "guteneo-pdf-validator",
  account_id: "39ac9fada6cba44d9ecf09d467609e69",
  version_metadata: { binding: "CF_VERSION_METADATA" },
  workers_dev: false,
  preview_urls: false,
  vars: { QUALIFICATION_ENABLED: "false" },
  routes: [],
  observability: { enabled: false },
  containers: [
    {
      instance_type: "basic",
      max_instances: 1,
      constraints: { jurisdiction: "eu" },
    },
  ],
};

async function repository(t, config = privateConfig) {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-pdf-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "work");
  const origin = join(directory, "origin.git");
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  execFileSync("git", ["init", "--bare", origin], { stdio: "pipe" });
  await mkdir(root);
  git(["init", "--initial-branch=main"]);
  git(["config", "user.email", "qualification@example.invalid"]);
  git(["config", "user.name", "Release qualification"]);
  await mkdir(join(root, "apps/pdf-validator"), { recursive: true });
  await writeFile(
    join(root, "apps/pdf-validator/wrangler.jsonc"),
    JSON.stringify(config),
  );
  git(["add", "."]);
  git(["commit", "-m", "Private validator fixture"]);
  git(["remote", "add", "origin", origin]);
  git(["push", "--set-upstream", "origin", "main"]);
  return { root, git };
}

test("private validator publication uses an exact clean synchronized main", async (t) => {
  const { root, git } = await repository(t);
  const executions = [];
  const result = await deployPdfValidator({
    root,
    execute: (...args) => executions.push(args),
  });
  assert.equal(result.sourceCommit, git(["rev-parse", "HEAD"]));
  assert.equal(result.service, "guteneo-pdf-validator");
  assert.equal(result.qualificationEnabled, false);
  assert.equal(executions.length, 1);
  assert.deepEqual(executions[0][1].slice(1), [
    "deploy",
    "--config",
    join(root, "apps/pdf-validator/wrangler.jsonc"),
    "--var",
    "QUALIFICATION_ENABLED:false",
    "--var",
    `SOURCE_COMMIT:${result.sourceCommit}`,
  ]);
});

test("feature branches cannot provision the production validator", async (t) => {
  const { root, git } = await repository(t);
  git(["switch", "-c", "candidate"]);
  let executed = false;
  await assert.rejects(
    deployPdfValidator({ root, execute: () => (executed = true) }),
    /RELEASE_MAIN_REQUIRED/,
  );
  assert.equal(executed, false);
});

test("uncommitted files prevent provisioning", async (t) => {
  const { root } = await repository(t);
  await writeFile(join(root, "unreviewed.txt"), "Unreviewed source");
  let executed = false;
  await assert.rejects(
    deployPdfValidator({ root, execute: () => (executed = true) }),
    /RELEASE_CLEAN_TREE_REQUIRED/,
  );
  assert.equal(executed, false);
});

test("private release cannot acquire a public route, logs or extra instances", async (t) => {
  for (const overrides of [
    { account_id: "00000000000000000000000000000000" },
    { version_metadata: { binding: "UNREVIEWED_METADATA" } },
    { workers_dev: true },
    { preview_urls: true },
    { vars: { QUALIFICATION_ENABLED: "true" } },
    { routes: ["validator.example.invalid/*"] },
    { observability: { enabled: true } },
    {
      containers: [
        {
          instance_type: "standard-1",
          max_instances: 1,
          constraints: { jurisdiction: "eu" },
        },
      ],
    },
    { containers: [{ max_instances: 2, constraints: { jurisdiction: "eu" } }] },
    { containers: [{ max_instances: 1, constraints: { jurisdiction: "us" } }] },
  ]) {
    const { root } = await repository(t, { ...privateConfig, ...overrides });
    let executed = false;
    await assert.rejects(
      deployPdfValidator({ root, execute: () => (executed = true) }),
      /PDF_VALIDATOR_RELEASE_PRIVATE_CONFIG_REQUIRED/,
    );
    assert.equal(executed, false);
  }
});

test("temporary qualification checks closed Horizon only on the canonical production origin", async (t) => {
  const { root } = await repository(t);
  const visited = [];
  const executions = [];
  const result = await deployPdfValidator({
    root,
    qualification: true,
    readCapabilities: async (origin) => {
      visited.push(origin);
      if (origin !== "https://guteneo.com")
        throw new Error("Alternate production origin is closed");
      return { mode: "production", horizon: { available: false } };
    },
    execute: (...args) => executions.push(args),
  });
  assert.deepEqual(visited, ["https://guteneo.com"]);
  assert.equal(result.qualificationEnabled, true);
  assert.equal(executions.length, 1);
  assert.ok(executions[0][1].includes("QUALIFICATION_ENABLED:true"));
});

test("qualification fails closed on open, unknown or unreachable Horizon", async (t) => {
  const { root } = await repository(t);
  for (const capability of [
    { mode: "production", horizon: { available: true } },
    { mode: "production" },
    { mode: "simulation", horizon: { available: false } },
    null,
    new Error("Network unavailable"),
  ]) {
    let executed = false;
    await assert.rejects(
      deployPdfValidator({
        root,
        qualification: true,
        readCapabilities: async () => {
          if (capability instanceof Error) throw capability;
          return capability;
        },
        execute: () => (executed = true),
      }),
      /PDF_VALIDATOR_RELEASE_CLOSED_HORIZON_REQUIRED/,
    );
    assert.equal(executed, false);
  }
});
