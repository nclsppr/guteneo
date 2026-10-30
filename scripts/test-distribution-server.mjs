import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import {
  distributionOrigin,
  distributionPort,
  distributionRendererPort,
} from "./test-distribution-origin.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const vite = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);
const state = process.env.GUTENEO_DISTRIBUTION_E2E_STATE;
const authentication =
  process.env.GUTENEO_DISTRIBUTION_E2E_AUTHENTICATION ?? "strong";
if (!["strong", "verified_account"].includes(authentication))
  throw new Error("Unknown local distribution authentication policy.");
if (!state || !/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state))
  throw new Error(
    "Start the isolated local test server through npm run test:distribution.",
  );
const env = {
  ...process.env,
  E2E_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  LIVE_SENDS_ENABLED: "false",
};
const children = new Set();
let stopping = false;

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = start(args);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`Local test preparation failed (${signal ?? code}).`));
    });
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());

try {
  await mkdir(new URL("../test-results/", import.meta.url), {
    recursive: true,
  });
  if (process.env.GUTENEO_E2E_PREBUILT !== "true") {
    await run([vite, "build", "--config", "apps/web/vite.config.ts"]);
    await run(["integrations/build.mjs", "dist/web/integrations"]);
  }
  await run([
    wrangler,
    "d1",
    "migrations",
    "apply",
    "guteneo-local",
    "--local",
    "--persist-to",
    state,
  ]);
  for (const file of ["scripts/seed.sql", "scripts/seed-content.sql"])
    await run([
      wrangler,
      "d1",
      "execute",
      "guteneo-local",
      "--local",
      "--persist-to",
      state,
      "--file",
      file,
    ]);
  if (!stopping) {
    for (const args of [
      ["scripts/local-renderer.mjs"],
      [
        wrangler,
        "dev",
        "--local",
        "--var",
        "ENVIRONMENT:local",
        "--var",
        "MODE:simulation",
        "--var",
        "LIVE_SENDS_ENABLED:false",
        "--var",
        `SENSITIVE_DOCUMENT_AUTHENTICATION:${authentication}`,
        "--var",
        `AUTH0_AUTH_POLICY:${authentication === "verified_account" ? "verified_email" : "verified_email_and_mfa"}`,
        "--var",
        `APP_ORIGIN:${distributionOrigin}`,
        "--var",
        `DOCUMENT_RENDERER_URL:http://127.0.0.1:${distributionRendererPort}`,
        "--persist-to",
        state,
        "--port",
        String(distributionPort),
        "--ip",
        "127.0.0.1",
        "--inspector-port",
        "9231",
        "--test-scheduled",
      ],
    ]) {
      const child = start(args);
      child.once("error", () => stop(1));
      child.once("exit", () => {
        if (!stopping) stop(1);
      });
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Test server failed.");
  stop(1);
}
