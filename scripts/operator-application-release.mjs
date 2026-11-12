import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createValidationReader } from "./ci/validation-proof.mjs";
import {
  migrateReviewedIndexes,
  qualifyManualRelease,
  requireReviewedPlan,
} from "./ci/manual-application-release.mjs";
import {
  deployPublic,
  verifyMainSource,
  verifyReleaseTag,
} from "./deploy-public.mjs";
import { migrationPlan, verifyTransport } from "./migrate-remote.mjs";

const repository = "nclsppr/guteneo";
const account = "39ac9fada6cba44d9ecf09d467609e69";
const database = "f86235fa-58c1-404f-a9a6-e2d657315854";
const scopes = [
  "account:read",
  "user:read",
  "workers_scripts:write",
  "workers_routes:write",
  "d1:write",
  "zone:read",
  "offline_access",
];
const rootDefault = fileURLToPath(new URL("../", import.meta.url));
const positive = (value) => Number.isSafeInteger(value) && value > 0;
function demand(condition, code) {
  if (!condition) throw new Error(`OPERATOR_RELEASE_${code}`);
}
export function operatorContext(args) {
  demand(
    args.length === 7 &&
      args[0] === "--confirm-production" &&
      args[1] === "--commit" &&
      args[3] === "--ci-run-id" &&
      args[5] === "--ci-run-attempt",
    "ARGUMENTS_INVALID",
  );
  demand(
    /^[a-f0-9]{40}$/.test(args[2]) &&
      [args[4], args[6]].every(
        (value) => /^[1-9]\d*$/.test(value) && positive(Number(value)),
      ),
    "ARGUMENTS_INVALID",
  );
  return {
    repository,
    sourceCommit: args[2],
    runId: Number(args[4]),
    runAttempt: Number(args[6]),
  };
}
export function requireOperatorIdentity(identity) {
  demand(
    identity?.loggedIn === true &&
      identity.authType === "OAuth Token" &&
      identity.accounts?.length === 1 &&
      identity.accounts[0].id === account &&
      Array.isArray(identity.tokenPermissions) &&
      identity.tokenPermissions.length === scopes.length &&
      scopes.every((scope) => identity.tokenPermissions.includes(scope)),
    "EXISTING_SCOPED_OAUTH_REQUIRED",
  );
}
export function requireWranglerVersion(version) {
  demand(version === "4.152.0", "REVIEWED_WRANGLER_VERSION_REQUIRED");
}
async function requireInstalledWrangler(root) {
  const metadata = JSON.parse(
    await readFile(join(root, "node_modules/wrangler/package.json"), "utf8"),
  );
  requireWranglerVersion(metadata.version);
}
export async function requireOperatorEnvironment(env, root, stat = lstat) {
  demand(
    ![
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_API_KEY",
      "CLOUDFLARE_EMAIL",
      "CF_API_TOKEN",
      "CF_API_KEY",
      "CF_EMAIL",
      "CLOUDFLARE_ACCOUNT_ID",
      "CF_ACCOUNT_ID",
      "CLOUDFLARE_API_BASE_URL",
      "CF_API_BASE_URL",
      "CLOUDFLARE_BASE_URL",
      "CLOUDFLARE_API_ENVIRONMENT",
      "WRANGLER_API_ENVIRONMENT",
      "CLOUDFLARE_COMPLIANCE_REGION",
      "CLOUDFLARE_ENV",
      "WRANGLER_CI_OVERRIDE_NAME",
      "WRANGLER_AUTH_DOMAIN",
      "WRANGLER_AUTH_URL",
      "WRANGLER_TOKEN_URL",
      "WRANGLER_REVOKE_URL",
    ].some((name) => env[name]),
    "AMBIENT_CREDENTIAL_OVERRIDE",
  );
  demand(
    [undefined, "true", "1"].includes(env.CLOUDFLARE_AUTH_USE_KEYRING) &&
      [undefined, "true", "1"].includes(env.WRANGLER_LOG_SANITIZE),
    "ENCRYPTED_PROFILE_REQUIRED",
  );
  // Wrangler loads these even for non-development commands. Never inspect values.
  for (const name of [".env", ".env.local"]) {
    try {
      await stat(join(root, name));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error("OPERATOR_RELEASE_IMPLICIT_ENV_FILE");
  }
}
function command(command, args, root, env, limit = 4 * 1024 * 1024) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      maxBuffer: limit,
    });
  } catch {
    // Includes unknown mutation outcomes: never retry or expose process output.
    throw new Error("OPERATOR_RELEASE_COMMAND_RESPONSE_UNKNOWN");
  }
}
export function createOperatorGithubReader({
  root = rootDefault,
  env = process.env,
  execute = command,
} = {}) {
  return createValidationReader({
    fetcher: async (url) => {
      demand(
        url.startsWith(`https://api.github.com/repos/${repository}/`),
        "GITHUB_TARGET_INVALID",
      );
      return new Response(
        await execute(
          "gh",
          [
            "api",
            "--hostname",
            "github.com",
            url.slice("https://api.github.com/".length),
          ],
          root,
          env,
          1024 * 1024,
        ),
      );
    },
  });
}
export function createWranglerD1Client({
  root = rootDefault,
  env = process.env,
  execute = command,
} = {}) {
  return async (operation, batch) => {
    demand(
      operation === "bookmark" || operation === "query",
      "D1_OPERATION_INVALID",
    );
    if (operation === "query")
      demand(
        Array.isArray(batch) &&
          batch.length > 0 &&
          batch.length <= 4 &&
          batch.every(
            (entry) =>
              Object.keys(entry).length === 1 &&
              typeof entry.sql === "string" &&
              entry.sql.length <= 100_000 &&
              !entry.sql.includes("\0"),
          ),
        "D1_BATCH_INVALID",
      );
    // --command is a single query API batch. --file uses the separate import API.
    const args =
      operation === "bookmark"
        ? ["d1", "time-travel", "info", "DB", "--json"]
        : [
            "d1",
            "execute",
            "DB",
            "--remote",
            "--json",
            "--command",
            batch.map(({ sql }) => sql.trim().replace(/;?$/, ";")).join("\n"),
          ];
    let value;
    try {
      value = JSON.parse(
        await execute(
          process.execPath,
          [
            join(root, "node_modules/wrangler/bin/wrangler.js"),
            ...args,
            "--config",
            "wrangler.live.jsonc",
          ],
          root,
          env,
        ),
      );
    } catch {
      throw new Error("OPERATOR_RELEASE_D1_RESPONSE_UNKNOWN");
    }
    if (operation === "bookmark") {
      demand(
        typeof value?.bookmark === "string" &&
          /^[A-Za-z0-9-]{1,200}$/.test(value.bookmark),
        "BOOKMARK_REQUIRED",
      );
      return value.bookmark;
    }
    demand(
      Array.isArray(value) &&
        value.length === batch.length &&
        value.every(
          (entry) => entry.success === true && Array.isArray(entry.results),
        ),
      "D1_QUERY_FAILED",
    );
    return value;
  };
}
export async function requireNoActivePublishers(request) {
  const publishers = new Set([
    ".github/workflows/dependency-release.yml",
    ".github/workflows/manual-application-release.yml",
    ".github/workflows/manual-experience-release.yml",
  ]);
  for (const status of [
    "queued",
    "in_progress",
    "waiting",
    "pending",
    "requested",
  ]) {
    const value = await request(`actions/runs?status=${status}&per_page=100`);
    demand(
      Number.isSafeInteger(value?.total_count) &&
        value.total_count >= 0 &&
        value.total_count <= 100 &&
        Array.isArray(value.workflow_runs) &&
        value.workflow_runs.length === value.total_count,
      "PUBLISHER_INVENTORY_INVALID",
    );
    demand(
      value.workflow_runs.every((run) => !publishers.has(run.path)),
      "CONCURRENT_PUBLISHER",
    );
  }
}
export async function releaseWithOperator({
  context,
  root = rootDefault,
  reader = () => createOperatorGithubReader({ root }),
  request = createWranglerD1Client({ root }),
  source = verifyMainSource,
  tag = verifyReleaseTag,
  plan: getPlan = migrationPlan,
  transport = verifyTransport,
  publish = deployPublic,
  record = async () => {},
  identity,
  environment = async () => {},
  sessionId = randomUUID(),
}) {
  await environment();
  requireOperatorIdentity(await identity());
  const first = await reader()(`actions/runs/${context.runId}`);
  demand(
    positive(first?.repository?.id) &&
      first.repository.full_name === repository,
    "REPOSITORY_REQUIRED",
  );
  context = { ...context, repositoryId: first.repository.id };
  const qualify = async () => {
    await environment();
    requireOperatorIdentity(await identity());
    demand(source(root) === context.sourceCommit, "SOURCE_CHANGED");
    const api = reader();
    const proof = await qualifyManualRelease(context, api);
    // Each independent read phase retains its own bounded API deadline.
    await requireNoActivePublishers(reader());
    const anchor = await tag(root, context.sourceCommit);
    const value = {
      ...proof,
      version: anchor.version,
      tag: anchor.tag,
      sessionId,
      operator: "existing-scoped-wrangler-oauth",
    };
    await record("qualification", value);
    return value;
  };
  const qualification = await qualify();
  const plan = await getPlan();
  requireReviewedPlan(plan);
  const local = await transport(true);
  demand(
    local.schemaEquivalent === true &&
      local.quickCheck === "ok" &&
      local.foreignKeyViolations === 0 &&
      Array.isArray(local.schema),
    "LOCAL_MIGRATION_PROOF_REQUIRED",
  );
  const integrity = await request("query", [
    { sql: "PRAGMA quick_check" },
    { sql: "PRAGMA foreign_key_check" },
  ]);
  demand(
    integrity[0]?.results?.length === 1 &&
      integrity[0].results[0].quick_check === "ok" &&
      integrity[1]?.results?.length === 0,
    "PRE_MIGRATION_INTEGRITY_REQUIRED",
  );
  const schema = await migrateReviewedIndexes({
    plan,
    expectedSchema: local.schema,
    request,
    ensureCurrent: qualify,
    record: (value) =>
      record("schema", {
        ...qualification,
        preMigrationIntegrity: { quickCheck: "ok", foreignKeyViolations: 0 },
        ...value,
      }),
  });
  demand(
    schema.status === "schema-verified" &&
      schema.after.applied === 82 &&
      schema.quickCheck === "ok" &&
      schema.foreignKeyViolations === 0,
    "SCHEMA_PROOF_REQUIRED",
  );
  await qualify();
  await record("publication", {
    ...qualification,
    status: "publication-started",
    schemaSha256: schema.after.schemaSha256,
  });
  const result = await publish("live", {
    root,
    beforePublish: async () => {
      await qualify();
      requireOperatorIdentity(await identity());
    },
  });
  demand(
    result.sourceCommit === context.sourceCommit,
    "PUBLISHED_SOURCE_MISMATCH",
  );
  await record("publication", {
    ...qualification,
    status: "served-release-verified",
    schemaSha256: schema.after.schemaSha256,
    verifiedAt: new Date().toISOString(),
  });
  return result;
}
async function main(env) {
  const context = operatorContext(process.argv.slice(2));
  await requireOperatorEnvironment(env, rootDefault);
  await requireInstalledWrangler(rootDefault);
  demand(isAbsolute(env.XDG_CONFIG_HOME ?? ""), "ENCRYPTED_PROFILE_REQUIRED");
  const profile = join(env.XDG_CONFIG_HOME, ".wrangler");
  const preferences = JSON.parse(
    await readFile(join(profile, "preferences.json"), "utf8"),
  );
  demand(
    preferences.keyring_enabled === true &&
      (await lstat(join(profile, "config/default.enc"))).isFile(),
    "ENCRYPTED_PROFILE_REQUIRED",
  );
  const parsed = ts.parseConfigFileTextToJson(
    "wrangler.live.jsonc",
    await readFile(join(rootDefault, "wrangler.live.jsonc"), "utf8"),
  );
  demand(
    !parsed.error &&
      parsed.config?.account_id === account &&
      parsed.config.d1_databases?.find((entry) => entry.binding === "DB")
        ?.database_id === database,
    "FIXED_DATABASE_REQUIRED",
  );
  const lockPath = join(tmpdir(), "guteneo-production-application.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, ...context }) + "\n",
    );
    const evidence = await mkdtemp(join(tmpdir(), "guteneo-operator-release-"));
    console.log(`Operator release evidence: ${evidence}`);
    await releaseWithOperator({
      context,
      environment: async () => {
        await requireOperatorEnvironment(env, rootDefault);
        await requireInstalledWrangler(rootDefault);
      },
      identity: async () =>
        JSON.parse(
          command(
            process.execPath,
            [
              join(rootDefault, "node_modules/wrangler/bin/wrangler.js"),
              "whoami",
              "--json",
            ],
            rootDefault,
            env,
          ),
        ),
      record: (name, value) =>
        writeFile(
          join(evidence, `${name}.json`),
          JSON.stringify(value, null, 2) + "\n",
          { mode: 0o600 },
        ),
    });
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.env);
  } catch (error) {
    console.error(
      /^(OPERATOR_RELEASE|MANUAL_RELEASE|DEPENDENCY_RELEASE|VALIDATION_PROOF|RELEASE)_[A-Z_0-9]+$/.test(
        error?.message ?? "",
      )
        ? error.message
        : "OPERATOR_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
