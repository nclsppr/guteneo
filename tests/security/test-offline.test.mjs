import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SANDBOX_PROFILE,
  PRODUCTION_LOCAL_SUITES,
  PDF_SUITE,
  parseArguments,
  offlineEnvironment,
  sandboxInvocation,
  verifyNetworkBoundary,
  resultCounts,
  publicReport,
  failureReport,
  sourceInputs,
  captureSourceSnapshot,
  sourceUnchanged,
} from "../../scripts/test-offline.mjs";

const network = {
  loopbackAllowed: true,
  externalBlocked: true,
  childProcessProtected: true,
  denialCode: "EPERM",
};
const counts = {
  testsPassed: 3,
  testsFailed: 0,
  suitesPassed: 1,
  suitesFailed: 0,
  testsSkipped: 0,
};
const source = {
  sha256: "a".repeat(64),
  fileCount: 2,
  scope: ["apps/api", "package-lock.json"],
};

test("offline arguments select only the fixed local suites and optional installed PDF renderer", () => {
  assert.deepEqual(parseArguments([]), {
    withPdf: false,
    report: "reports/offline-qualification.json",
  });
  assert.deepEqual(
    parseArguments(["--with-pdf", "--report", "/tmp/qualification.json"]),
    { withPdf: true, report: "/tmp/qualification.json" },
  );
  for (const args of [
    ["--remote"],
    ["--", "npm", "install"],
    ["--report"],
    ["--report", "--with-pdf"],
    ["https://provider.example"],
  ])
    assert.throws(() => parseArguments(args), /OFFLINE_ARGUMENT_INVALID/);
  assert.equal(PRODUCTION_LOCAL_SUITES.length, 5);
  assert.ok(
    PRODUCTION_LOCAL_SUITES.every(
      (file) =>
        file.startsWith("tests/integration/") && file.endsWith(".test.ts"),
    ),
  );
  assert.equal(PDF_SUITE, "tests/integration/templates-renderer.test.ts");
});

test("environment never forwards credentials, remote bindings, proxies, preload hooks or download options", () => {
  const env = offlineEnvironment({
    PATH: "/usr/bin",
    HOME: "/safe-home",
    TMPDIR: "/tmp",
    LANG: "en_US.UTF-8",
    CLOUDFLARE_API_TOKEN: "private",
    AWS_SECRET_ACCESS_KEY: "private",
    RESEND_API_KEY: "private",
    HTTP_PROXY: "http://localhost:1234",
    HTTPS_PROXY: "http://localhost:1234",
    ALL_PROXY: "http://localhost:1234",
    NODE_OPTIONS: "--import=unexpected",
    NODE_EXTRA_CA_CERTS: "/secret",
    npm_config_registry: "https://remote",
    VITE_REMOTE_BINDINGS: "true",
    WRANGLER_REMOTE_BINDINGS: "true",
    PLAYWRIGHT_DOWNLOAD_HOST: "https://remote",
    GUTENEO_OFFLINE_SANDBOX: "macos-network",
  });
  for (const name of [
    "CLOUDFLARE_API_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "RESEND_API_KEY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NODE_OPTIONS",
    "NODE_EXTRA_CA_CERTS",
    "npm_config_registry",
    "VITE_REMOTE_BINDINGS",
    "WRANGLER_REMOTE_BINDINGS",
    "PLAYWRIGHT_DOWNLOAD_HOST",
    "GUTENEO_OFFLINE_SANDBOX",
  ])
    assert.equal(env[name], undefined);
  assert.equal(env.npm_config_offline, "true");
  assert.equal(env.npm_config_ignore_scripts, "true");
  assert.equal(env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, "1");
  assert.equal(env.WRANGLER_SEND_METRICS, "false");
  assert.equal(env.PATH, "/usr/bin");
});

test("unsupported systems fail closed instead of silently running online", () => {
  for (const platform of ["linux", "win32", "freebsd"])
    assert.throws(
      () => sandboxInvocation([], { platform }),
      /OFFLINE_SANDBOX_UNAVAILABLE/,
    );
  const command = sandboxInvocation(["local-test.mjs"], {
    platform: "darwin",
    node: "/installed/node",
  });
  assert.equal(command.command, "/usr/bin/sandbox-exec");
  assert.deepEqual(command.args, [
    "-p",
    SANDBOX_PROFILE,
    "/installed/node",
    "local-test.mjs",
  ]);
  assert.match(SANDBOX_PROFILE, /\(deny network-outbound\)/);
  assert.match(
    SANDBOX_PROFILE,
    /\(allow network-outbound \(remote ip "localhost:\*"\)\)/,
  );
});

test("result accounting requires exactly the selected files and no empty fixture report", () => {
  const root = "/fixture";
  const suites = ["tests/a.test.ts", "tests/b.test.ts"];
  const report = {
    testResults: [
      {
        name: path.join(root, suites[0]),
        status: "passed",
        assertionResults: [{ status: "passed" }, { status: "passed" }],
      },
      {
        name: path.join(root, suites[1]),
        status: "failed",
        assertionResults: [{ status: "failed" }, { status: "pending" }],
      },
    ],
  };
  assert.deepEqual(resultCounts(report, suites, root), {
    testsPassed: 2,
    testsFailed: 1,
    suitesPassed: 1,
    suitesFailed: 1,
    testsSkipped: 1,
  });
  assert.throws(
    () => resultCounts(report, [suites[0]], root),
    /OFFLINE_RESULTS_SCOPE_MISMATCH/,
  );
  assert.throws(
    () =>
      resultCounts(
        {
          testResults: [
            {
              name: "/fixture/tests/a.test.ts",
              status: "passed",
              assertionResults: [],
            },
          ],
        },
        [suites[0]],
        root,
      ),
    /OFFLINE_RESULTS_INVALID/,
  );
  assert.throws(
    () => resultCounts({}, suites, root),
    /OFFLINE_RESULTS_INVALID/,
  );
});

test("public qualification is sanitized, distinctly local and requires proven network isolation", () => {
  const report = publicReport({
    sourceBefore: source,
    sourceAfter: source,
    executedAt: "2026-10-10T00:00:00.000Z",
    withPdf: true,
    network,
    counts,
    exitCode: 0,
    durationMs: 1000,
    stdout: "private",
    token: "secret",
    cwd: "/private/user",
  });
  assert.equal(report.status, "passed");
  assert.equal(report.environment, "local");
  assert.equal(report.providerMode, "simulated");
  assert.equal(report.networkPolicy, "external_blocked");
  assert.equal(report.sourceCommit, null);
  assert.match(
    report.limitations.join(" "),
    /ne prouve pas le fonctionnement de la production/,
  );
  assert.doesNotMatch(JSON.stringify(report), /secret|private\/user|stdout/);
  for (const change of [
    { exitCode: 1 },
    { counts: { ...counts, testsSkipped: 1 } },
    { counts: { ...counts, testsPassed: 0 } },
    { counts: { ...counts, suitesFailed: 1 } },
    { network: { ...network, externalBlocked: false } },
    { network: { ...network, denialCode: "TIMEOUT" } },
  ])
    assert.equal(
      publicReport({
        sourceBefore: source,
        sourceAfter: source,
        executedAt: report.executedAt,
        withPdf: false,
        network,
        counts,
        exitCode: 0,
        durationMs: 1,
        ...change,
      }).status,
      "failed",
    );
  assert.equal(
    publicReport({
      sourceBefore: source,
      sourceAfter: source,
      executedAt: report.executedAt,
      withPdf: false,
      network: { ...network, externalBlocked: false },
      counts,
      exitCode: 0,
      durationMs: 1,
    }).networkPolicy,
    "unproven",
  );
  const failed = failureReport("OFFLINE_NETWORK_UNPROVEN");
  assert.equal(failed.status, "failed");
  assert.equal(failed.networkPolicy, "unproven");
  assert.equal(failed.counts.testsPassed, 0);
});

test("source provenance detects changed bytes, additions and removals before reporting a pass", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "offline-source-test-"));
  try {
    await mkdir(path.join(directory, "packages"));
    await writeFile(
      path.join(directory, "packages", "a.ts"),
      "export const value = 1;",
    );
    await writeFile(path.join(directory, "package-lock.json"), "{}");
    const before = await captureSourceSnapshot(directory, [
      "packages",
      "package-lock.json",
    ]);
    assert.equal(before.fileCount, 2);
    assert.match(before.sha256, /^[a-f0-9]{64}$/);
    assert.ok(before.files.every((file) => !file.path.startsWith("/")));
    assert.equal(
      sourceUnchanged(
        before,
        await captureSourceSnapshot(directory, [
          "packages",
          "package-lock.json",
        ]),
      ),
      true,
    );
    await writeFile(
      path.join(directory, "packages", "a.ts"),
      "export const value = 2;",
    );
    const changed = await captureSourceSnapshot(directory, [
      "packages",
      "package-lock.json",
    ]);
    assert.equal(sourceUnchanged(before, changed), false);
    const result = publicReport({
      executedAt: "2026-10-10T00:00:00.000Z",
      withPdf: false,
      network,
      counts,
      exitCode: 0,
      durationMs: 1,
      sourceBefore: before,
      sourceAfter: changed,
    });
    assert.equal(result.status, "failed");
    assert.equal(result.code, "OFFLINE_SOURCE_CHANGED");
    await writeFile(path.join(directory, "packages", "new.ts"), "export {};");
    assert.equal(
      sourceUnchanged(
        changed,
        await captureSourceSnapshot(directory, [
          "packages",
          "package-lock.json",
        ]),
      ),
      false,
    );
    await rm(path.join(directory, "packages", "a.ts"));
    assert.equal(
      sourceUnchanged(
        before,
        await captureSourceSnapshot(directory, [
          "packages",
          "package-lock.json",
        ]),
      ),
      false,
    );
    for (const input of [
      "apps/api",
      "apps/documents",
      "packages",
      "migrations",
      "tests/helpers",
      "tests/fixtures",
      "package-lock.json",
      "scripts/test-offline.mjs",
      "scripts/pdfme-spike.ts",
      PDF_SUITE,
    ])
      assert.ok(sourceInputs(true).includes(input));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Docker qualification refuses pulls and keeps container networking disabled", async () => {
  for (const file of [
    "apps/scanner/tests/qualify_docker.py",
    "apps/pdf-validator/tests/qualify_docker.py",
  ]) {
    const text = await readFile(
      new URL(`../../${file}`, import.meta.url),
      "utf8",
    );
    assert.match(text, /"run", "--pull=never"/);
    assert.match(text, /"--network", "none"/);
  }
});

test("only the local synthetic PDF harness can relax nested Chromium sandboxing after an inherited OS probe", async () => {
  const source = await readFile(
    new URL("../../scripts/pdfme-spike.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /process\.platform === "darwin"[\s\S]*process\.env\.GUTENEO_OFFLINE_SANDBOX === "macos-network"/,
  );
  assert.match(
    source,
    /if \(offlineSandbox\) await verifyInheritedNetworkBoundary\(\)/,
  );
  assert.match(
    source,
    /offlineSandbox \? \{ args: \["--no-sandbox"\] \} : \{\}/,
  );
  assert.ok(
    source.indexOf("await verifyInheritedNetworkBoundary()") <
      source.indexOf("puppeteer.launch"),
  );
});

test(
  "macOS blocks an actual external child connection while loopback remains usable",
  { skip: process.platform !== "darwin" },
  async () => {
    const proof = await verifyNetworkBoundary();
    assert.equal(proof.loopbackAllowed, true);
    assert.equal(proof.externalBlocked, true);
    assert.equal(proof.childProcessProtected, true);
    assert.ok(["EPERM", "EACCES"].includes(proof.denialCode));
  },
);
