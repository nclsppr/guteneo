import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// Wrangler runs through Node itself, as in secure-setup: `npx` is a shell shim
// that child_process cannot start without a shell on Windows.
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const children = [
  spawn(process.execPath, ["scripts/local-renderer.mjs"], { stdio: "inherit" }),
  spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--port",
      "8787",
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "9230",
      "--test-scheduled",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
for (const child of children) {
  child.on("exit", (code) => stop(code ?? 0));
  child.on("error", () => stop(1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
