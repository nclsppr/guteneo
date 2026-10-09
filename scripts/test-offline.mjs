#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SANDBOX_PROFILE = `(version 1)
(allow default)
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))`;

export const PRODUCTION_LOCAL_SUITES = Object.freeze([
  "tests/integration/dispatch-validation.test.ts",
  "tests/integration/trusted-fax-quotes.test.ts",
  "tests/integration/live-delivery-quotes.test.ts",
  "tests/integration/resend-email.test.ts",
  "tests/integration/protected-documents.test.ts",
]);
export const PDF_SUITE = "tests/integration/templates-renderer.test.ts";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SANDBOX = "/usr/bin/sandbox-exec";
const VITEST = "node_modules/vitest/vitest.mjs";

export function sourceInputs(withPdf = false) {
  return [
    "apps/api",
    "apps/documents",
    "packages",
    "migrations",
    "tests/helpers",
    "tests/fixtures",
    ...PRODUCTION_LOCAL_SUITES,
    "package.json",
    "package-lock.json",
    "vitest.config.ts",
    "tsconfig.json",
    "scripts/test-offline.mjs",
    "scripts/test-offline.d.mts",
    ...(withPdf
      ? [PDF_SUITE, "scripts/pdfme-spike.ts", "scripts/pdfme-docx-fixture.ts"]
      : []),
  ];
}

/** Stable relative paths and exact content hashes; excludes generated output and installed dependencies. */
export async function captureSourceSnapshot(root, inputs) {
  const records = [];
  async function visit(relative) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw Error("OFFLINE_SOURCE_SYMLINK");
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) {
        if (["node_modules", ".git", ".wrangler", "dist"].includes(entry))
          continue;
        await visit(path.join(relative, entry));
      }
    } else if (info.isFile()) {
      records.push({
        path: relative.split(path.sep).join("/"),
        sha256: createHash("sha256")
          .update(await readFile(absolute))
          .digest("hex"),
      });
    } else throw Error("OFFLINE_SOURCE_TYPE_UNSUPPORTED");
  }
  for (const input of [...inputs].sort()) await visit(input);
  records.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const sha256 = createHash("sha256")
    .update(JSON.stringify({ schema: 1, files: records }))
    .digest("hex");
  return {
    sha256,
    fileCount: records.length,
    scope: [...inputs].sort(),
    files: records,
  };
}

export function sourceUnchanged(before, after) {
  return (
    /^[a-f0-9]{64}$/.test(before?.sha256 ?? "") &&
    before.sha256 === after?.sha256 &&
    before.fileCount > 0 &&
    before.fileCount === after?.fileCount &&
    JSON.stringify(before.scope) === JSON.stringify(after?.scope)
  );
}

// Literal documentation-only IP: this verifies an OS denial, never a provider.
const NETWORK_PROBE = `
import net from "node:net";
import { spawnSync } from "node:child_process";
const server = net.createServer(socket => socket.end("offline-loopback"));
await new Promise((resolve,reject) => server.once("error",reject).listen(0,"127.0.0.1",resolve));
const port = server.address().port;
const loopback = await new Promise((resolve,reject) => {
  const socket = net.connect(port,"127.0.0.1");
  socket.setTimeout(3000,() => {socket.destroy();reject(Error("LOOPBACK_TIMEOUT"));});
  socket.once("data",data => {socket.destroy();resolve(data.toString() === "offline-loopback");});
  socket.once("error",reject);
});
await new Promise(resolve => server.close(resolve));
const child = spawnSync(process.execPath,["--input-type=module","-e",\
  'import net from "node:net";const socket=net.connect(443,"192.0.2.1");socket.setTimeout(3000,()=>{socket.destroy();console.log("TIMEOUT")});socket.once("connect",()=>{socket.destroy();console.log("CONNECTED")});socket.once("error",error=>console.log(error.code));'\
],{encoding:"utf8",timeout:5000});
const code = child.stdout?.trim();
const blocked = child.status === 0 && ["EPERM","EACCES"].includes(code);
console.log(JSON.stringify({loopbackAllowed:loopback,externalBlocked:blocked,childProcessProtected:blocked,denialCode:blocked?code:"UNPROVEN"}));
process.exitCode = loopback && blocked ? 0 : 1;
`;

export function parseArguments(args) {
  const options = {
    withPdf: false,
    report: "reports/offline-qualification.json",
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--with-pdf") options.withPdf = true;
    else if (
      arg === "--report" &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    )
      options.report = args[++index];
    else throw Error("OFFLINE_ARGUMENT_INVALID");
  }
  return options;
}

/** No tokens, proxy settings, NODE_OPTIONS, remote bindings or package-manager hooks. */
export function offlineEnvironment(source = process.env) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
  ])
    if (typeof source[key] === "string") env[key] = source[key];
  return {
    ...env,
    CI: "1",
    NO_COLOR: "1",
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    WRANGLER_SEND_METRICS: "false",
  };
}

export function sandboxInvocation(
  args,
  { platform = process.platform, node = process.execPath } = {},
) {
  if (platform !== "darwin") throw Error("OFFLINE_SANDBOX_UNAVAILABLE");
  return { command: SANDBOX, args: ["-p", SANDBOX_PROFILE, node, ...args] };
}

async function execute(
  invocation,
  { cwd = ROOT, env = offlineEnvironment(), timeoutMs = 300000, log } = {},
) {
  return new Promise((resolve, reject) => {
    const output = log ? createWriteStream(log, { mode: 0o600 }) : undefined;
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      timedOut = false;
    child.stdout.on("data", (data) => {
      if (output) output.write(data);
      else if (stdout.length < 65536) stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      if (output) output.write(data);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Process already ended. */
      }
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      output?.end();
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const done = () => resolve({ code, signal, stdout, timedOut });
      if (output) output.end(done);
      else done();
    });
  });
}

async function verifyProbe(invocation) {
  const result = await execute(invocation, { timeoutMs: 10000 });
  let proof;
  try {
    proof = JSON.parse(result.stdout);
  } catch {
    throw Error("OFFLINE_NETWORK_UNPROVEN");
  }
  if (
    result.code !== 0 ||
    result.timedOut ||
    proof.loopbackAllowed !== true ||
    proof.externalBlocked !== true ||
    proof.childProcessProtected !== true ||
    !["EPERM", "EACCES"].includes(proof.denialCode)
  )
    throw Error("OFFLINE_NETWORK_UNPROVEN");
  return proof;
}

export function verifyNetworkBoundary() {
  return verifyProbe(
    sandboxInvocation(["--input-type=module", "-e", NETWORK_PROBE]),
  );
}

/** Used only by the synthetic PDF qualification before disabling nested Chromium sandboxing. */
export function verifyInheritedNetworkBoundary() {
  if (process.platform !== "darwin") throw Error("OFFLINE_SANDBOX_UNAVAILABLE");
  return verifyProbe({
    command: process.execPath,
    args: ["--input-type=module", "-e", NETWORK_PROBE],
  });
}

export function resultCounts(result, expectedSuites, root = ROOT) {
  if (!Array.isArray(result?.testResults))
    throw Error("OFFLINE_RESULTS_INVALID");
  const expected = [...expectedSuites]
    .map((name) => path.resolve(root, name))
    .sort();
  const actual = result.testResults
    .map((suite) => path.resolve(suite.name))
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw Error("OFFLINE_RESULTS_SCOPE_MISMATCH");
  const counts = {
    testsPassed: 0,
    testsFailed: 0,
    suitesPassed: 0,
    suitesFailed: 0,
    testsSkipped: 0,
  };
  for (const suite of result.testResults) {
    if (
      !Array.isArray(suite.assertionResults) ||
      suite.assertionResults.length === 0
    )
      throw Error("OFFLINE_RESULTS_INVALID");
    const passed =
      suite.status === "passed" &&
      suite.assertionResults.every((test) => test.status === "passed");
    counts[passed ? "suitesPassed" : "suitesFailed"]++;
    for (const test of suite.assertionResults) {
      if (test.status === "passed") counts.testsPassed++;
      else if (test.status === "failed") counts.testsFailed++;
      else counts.testsSkipped++;
    }
  }
  return counts;
}

export function publicReport({
  executedAt,
  withPdf,
  network,
  counts,
  exitCode,
  durationMs,
  sourceCommit = null,
  sourceBefore,
  sourceAfter,
}) {
  const networkProven =
    network?.externalBlocked === true &&
    network?.childProcessProtected === true &&
    network?.loopbackAllowed === true &&
    ["EPERM", "EACCES"].includes(network?.denialCode);
  const passed =
    networkProven &&
    sourceUnchanged(sourceBefore, sourceAfter) &&
    exitCode === 0 &&
    counts.testsPassed > 0 &&
    counts.testsFailed === 0 &&
    counts.testsSkipped === 0 &&
    counts.suitesFailed === 0;
  return {
    schema: 1,
    environment: "local",
    executedAt,
    status: passed ? "passed" : "failed",
    networkPolicy: networkProven ? "external_blocked" : "unproven",
    providerMode: "simulated",
    counts,
    scope: [
      "Fax, email et postal : devis existants, approbations et envois testés sur D1 locale.",
      "Diagnostics sans mutation métier, isolation des ateliers, rôles et droits sur les documents.",
      "Documents protégés et résultats fournisseur incertains avec transports synthétiques.",
      ...(withPdf
        ? [
            "Rendu PDF réel dans Chromium local : cinq documents synthétiques et gardes du moteur.",
          ]
        : []),
    ],
    limitations: [
      "Qualification locale sélectionnée ; ce résultat ne prouve pas le fonctionnement de la production.",
      "Aucun fournisseur réel, communication réelle, ressource payante, dépôt distant ou téléchargement.",
      "Le réseau sortant est bloqué pour le processus et ses descendants ; la boucle locale reste autorisée pour D1, R2 et les services de test.",
      "Les transports, réponses fournisseur et preuves de scan métier sont synthétiques ; les données sont fictives.",
      ...(withPdf
        ? [
            "Le rendu PDF local ne qualifie pas le service PDF ou l’antivirus déployé.",
          ]
        : [
            "Le rendu PDF réel, l’antivirus réel et les parcours navigateur ne font pas partie de cette sélection.",
          ]),
      "Les suites complètes, les moteurs Docker et les parcours réels nécessitent leurs preuves distinctes.",
    ],
    sourceCommit,
    sourceSnapshotSha256: sourceBefore?.sha256 ?? null,
    sourceSnapshotAlgorithm: "sha256-path-content-v1",
    sourceSnapshotScope: sourceBefore?.scope ?? [],
    sourceSnapshotFileCount: sourceBefore?.fileCount ?? 0,
    sourceUnchangedDuringRun: sourceUnchanged(sourceBefore, sourceAfter),
    ...(sourceBefore && !sourceUnchanged(sourceBefore, sourceAfter)
      ? { code: "OFFLINE_SOURCE_CHANGED" }
      : {}),
    durationMs,
    networkEvidence: {
      mechanism: "macos_sandbox_exec",
      loopbackAllowed: network.loopbackAllowed,
      externalBlocked: network.externalBlocked,
      childProcessProtected: network.childProcessProtected,
      denialCode: network.denialCode,
    },
  };
}

async function saveReport(report, destination) {
  const reportPath = path.resolve(ROOT, destination);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o644,
  });
}

export function failureReport(code) {
  return {
    schema: 1,
    environment: "local",
    executedAt: new Date().toISOString(),
    status: "failed",
    networkPolicy: "unproven",
    providerMode: "simulated",
    counts: {
      testsPassed: 0,
      testsFailed: 0,
      suitesPassed: 0,
      suitesFailed: 0,
      testsSkipped: 0,
    },
    scope: [],
    sourceCommit: null,
    limitations: [
      "La qualification ne s’est pas terminée ; aucun résultat de test ni blocage réseau n’est attesté par ce rapport.",
      "Aucun état de production ne peut être déduit de cet échec local.",
    ],
    code,
  };
}

export async function runQualification(options) {
  const start = Date.now(),
    executedAt = new Date(start).toISOString();
  // Fail before executing any suite if enforcement or installed dependencies are absent.
  sandboxInvocation([]);
  await access(SANDBOX);
  await access(path.join(ROOT, VITEST));
  const network = await verifyNetworkBoundary();
  const directory = await mkdtemp(path.join(tmpdir(), "guteneo-offline-"));
  const resultsFile = path.join(directory, "vitest.json");
  const suites = [
    ...PRODUCTION_LOCAL_SUITES,
    ...(options.withPdf ? [PDF_SUITE] : []),
  ];
  const sourceBefore = await captureSourceSnapshot(
    ROOT,
    sourceInputs(options.withPdf),
  );
  const result = await execute(
    sandboxInvocation([
      VITEST,
      "run",
      ...suites,
      "--reporter=json",
      `--outputFile=${resultsFile}`,
    ]),
    {
      log: path.join(directory, "tests.log"),
      env: {
        ...offlineEnvironment(),
        GUTENEO_OFFLINE_SANDBOX: "macos-network",
      },
    },
  );
  const raw = JSON.parse(await readFile(resultsFile, "utf8"));
  const sourceAfter = await captureSourceSnapshot(
    ROOT,
    sourceInputs(options.withPdf),
  );
  await writeFile(
    path.join(directory, "source-manifest.json"),
    `${JSON.stringify({ before: sourceBefore, after: sourceAfter }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const counts = resultCounts(raw, suites);
  const report = publicReport({
    executedAt,
    withPdf: options.withPdf,
    network,
    counts,
    exitCode: result.code,
    durationMs: Date.now() - start,
    sourceBefore,
    sourceAfter,
  });
  await saveReport(report, options.report);
  return { report, logDirectory: directory };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const { report, logDirectory } = await runQualification(options);
    console.log(JSON.stringify(report, null, 2));
    console.error(`Local diagnostic logs: ${logDirectory}`);
    process.exitCode = report.status === "passed" ? 0 : 1;
  } catch (error) {
    const code = /^OFFLINE_[A-Z_]+$/.test(error?.message ?? "")
      ? error.message
      : "OFFLINE_QUALIFICATION_FAILED";
    if (options) {
      try {
        await saveReport(failureReport(code), options.report);
      } catch {
        /* Report destination unavailable. */
      }
    }
    console.error(
      JSON.stringify({ code, status: "failed", environment: "local" }),
    );
    process.exitCode = 1;
  }
}
