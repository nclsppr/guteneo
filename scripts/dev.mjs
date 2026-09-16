import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["scripts/local-renderer.mjs"], { stdio: "inherit" }),
  spawn(
    "npx",
    [
      "wrangler",
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
for (const child of children) child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
