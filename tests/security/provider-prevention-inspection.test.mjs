import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const report = {
  version: 1,
  qualification: "private_operational_prevention_only",
  activeTasks: 1,
  notifications: [
    { status: "pending", count: 1 },
    { status: "sending", count: 0 },
    { status: "sent", count: 0 },
    { status: "unknown", count: 0 },
    { status: "failed", count: 0 },
    { status: "superseded", count: 0 },
  ],
  actions: [
    {
      family: "fax_authority",
      mode: "operator",
      stage: "operator_7d",
      action: "renew_or_retire_authority",
      deadline: "2027-02-28T22:59:59.999Z",
      count: 1,
    },
  ],
  truncated: false,
};

async function runReadiness(failure = false) {
  const directory = await mkdtemp(
    join(tmpdir(), "guteneo-prevention-cli-test-"),
  );
  try {
    const source = await readFile(
      new URL("../../scripts/provider-readiness.mjs", import.meta.url),
      "utf8",
    );
    // Replace only the remote binding dependency. Execute the actual CLI branch
    // without reading a credential, creating a Worker or contacting a provider.
    const driver = source.replace(
      'import { getPlatformProxy } from "wrangler";',
      `const getPlatformProxy = async options => {
        if (options.persist !== false) throw new Error("Unexpected persistence");
        return {
          env: { PROVIDERS: {
            async inspectProviderPrevention() {
              ${failure ? 'throw new Error("PRIVATE_TOKEN_RECIPIENT");' : `return ${JSON.stringify(report)};`}
            }
          } },
          async dispose() {}
        };
      };`,
    );
    assert.notEqual(driver, source);
    const path = join(directory, "provider-readiness.mjs");
    await writeFile(path, driver, { mode: 0o600 });
    return spawnSync(process.execPath, [path, "freshness-prevention"], {
      encoding: "utf8",
      timeout: 10_000,
      env: { PATH: process.env.PATH },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the operator CLI reads the private prevention report through the existing service binding", async () => {
  const result = await runReadiness();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), report);
  assert.equal(result.stderr, "");
});

test("private prevention inspection failures expose no raw exception or credential", async () => {
  const result = await runReadiness(true);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Provider inspection unavailable/);
  assert.doesNotMatch(result.stderr, /PRIVATE_TOKEN_RECIPIENT/);
});

test("prevention inspection is a private read-only RPC and its entrypoint has no HTTP route", async () => {
  const workerPath = fileURLToPath(
    new URL("../../apps/api/src/worker.ts", import.meta.url),
  );
  const built = await build({
    entryPoints: [workerPath],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "private-entrypoint-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === "entry-point") return;
            return {
              namespace: "inspection-fixture",
              path:
                args.path === "cloudflare:workers"
                  ? "runtime"
                  : args.path === "./freshness-prevention"
                    ? "report"
                    : args.path === "./account-deletion"
                      ? "deletion"
                      : "unrelated",
            };
          });
          builder.onLoad(
            { filter: /.*/, namespace: "inspection-fixture" },
            ({ path }) => ({
              contents:
                path === "runtime"
                  ? "export class WorkerEntrypoint {}"
                  : path === "report"
                    ? `export async function readPrivatePreventionReport(db) {
                        db.inspections++;
                        return ${JSON.stringify(report)};
                      }`
                    : path === "deletion"
                      ? `export class AccountDeletionService {
                          constructor() { throw new Error("Unexpected deletion service invocation"); }
                        }`
                      : `export default {};
                      export const inspectTelnyxReadiness = () => {};
                      export const telnyxAccountReference = () => {};
                      export const inspectPingenReadiness = () => {};
                      export const inspectPingenUploadOrigin = () => {};
                      export const inspectResendReadiness = () => {};
                      export const inspectSesPrincipal = () => {};
                      export const qualifyPingenSynthetic = () => {};
                      export const configurePingenWebhooks = () => {};
                      export const handleBelvedereHost = () => {};
                      export const servePublicAssets = () => {};
                      export const publicHttpError = () => {};
                      export const startObservation = () => {};
                      export const inspectTelnyxFaxTariffCatalog = () => {};
                      export const inspectResendPolicySources = () => {};`,
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  const module = { exports: {} };
  new Function("module", "exports", built.outputFiles[0].text)(
    module,
    module.exports,
  );
  const db = { inspections: 0 };
  const entrypoint = Object.create(module.exports.ProviderInspection.prototype);
  entrypoint.env = { DB: db };
  for (const operation of ["plan", "begin", "advance", "notice", "complete"])
    assert.equal(entrypoint[operation], undefined);
  for (const method of ["GET", "POST"])
    assert.equal(
      entrypoint.fetch(
        new Request("https://guteneo.invalid/inspectProviderPrevention", {
          method,
        }),
      ).status,
      404,
    );
  assert.equal(db.inspections, 0);
  assert.deepEqual(await entrypoint.inspectProviderPrevention(), report);
  assert.equal(db.inspections, 1);
});
