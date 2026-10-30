// Local static fixture host only. Never imports the Worker or triggers collection.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import {
  statusFooterScript,
  statusApplicationScript,
} from "../build-status.mjs";
import { brandIconFiles } from "../brand-icons.mjs";
const root = fileURLToPath(
  new URL("../../apps/status/public/", import.meta.url),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const application = await statusApplicationScript(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const server = createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(request.method) ||
    request.headers.host !== "127.0.0.1:8799"
  ) {
    response.writeHead(403).end();
    return;
  }
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1:8799").pathname,
    );
    if (path === "/app.bundle.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(request.method === "HEAD" ? undefined : application);
      return;
    }
    if (path === "/footer.js") {
      const script = await statusFooterScript(
        fileURLToPath(new URL("../../", import.meta.url)),
      );
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(request.method === "HEAD" ? undefined : script);
      return;
    }
    if (brandIconFiles.includes(path.slice(1))) {
      const content = await readFile(
        new URL(`../../apps/web/public${path}`, import.meta.url),
      );
      response.writeHead(200, { "Content-Type": types[extname(path)] });
      response.end(request.method === "HEAD" ? undefined : content);
      return;
    }
    const target = resolve(root, path === "/" ? "index.html" : path.slice(1));
    if (
      !target.startsWith(root.endsWith(sep) ? root : root + sep) ||
      !types[extname(target)]
    ) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(8799, "127.0.0.1", () =>
  console.log("Status UI fixtures ready on loopback:8799"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
