// Local Linux fallback when Playwright's CDN is unreachable. Extract package-owned
// archives with tar --no-same-owner; container filesystems may not support chown.
import {
  createReadStream,
  createWriteStream,
  existsSync,
  chmodSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const source = new URL(
  "../node_modules/@sparticuz/chromium/bin/",
  import.meta.url,
);
const binary = join(tmpdir(), "chromium");
if (!existsSync(binary) || statSync(binary).size < 1000000) {
  await pipeline(
    createReadStream(new URL("chromium.br", source)),
    createBrotliDecompress(),
    createWriteStream(binary),
  );
  chmodSync(binary, 0o700);
}
for (const [archive, dest] of [
  ["fonts.tar.br", join(tmpdir(), "fonts")],
  ["swiftshader.tar.br", tmpdir()],
]) {
  mkdirSync(dest, { recursive: true });
  const child = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", dest], {
    stdio: ["pipe", "ignore", "inherit"],
  });
  const completion = new Promise((resolve, reject) =>
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Browser extraction failed")),
    ),
  );
  await pipeline(
    createReadStream(new URL(archive, source)),
    createBrotliDecompress(),
    child.stdin,
  );
  await completion;
}
console.log("Local Chromium fallback extracted.");
