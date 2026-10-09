/** Loopback-only fictional design preview. No Worker bindings or credentials. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { fixtureBase, fixtureResponse } from "../tests/fixtures/belvedere.ts";

const root = resolve(fileURLToPath(new URL("../dist/web/", import.meta.url)));
const port = Number(process.env.GUTENEO_BELVEDERE_PREVIEW_PORT || 8794);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local preview port");
const shell = (await readFile(resolve(root, "index.html"), "utf8")).replace(
  "<head>",
  `<head><meta name="guteneo-belvedere" content="${fixtureBase}"><meta name="guteneo-belvedere-demo" content="true">`,
);
const mime = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (
    ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) ||
    !["GET", "HEAD"].includes(req.method)
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (
      url.pathname === "/" ||
      url.pathname === fixtureBase ||
      url.pathname === fixtureBase + "/"
    ) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(req.method === "HEAD" ? undefined : shell);
      return;
    }
    if (url.pathname.startsWith(fixtureBase + "/api/")) {
      const data = fixtureResponse(url);
      res.writeHead(data ? 200 : 404, { "Content-Type": "application/json" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify(
              data || {
                error: {
                  code: "FIXTURE_ROUTE_MISSING",
                  message: "Donnée fictive indisponible.",
                },
              },
            ),
      );
      return;
    }
    const file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + sep) || !mime[extname(file)]) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(file);
    res.setHeader("Content-Type", mime[extname(file)]);
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Belvédère — données fictives uniquement : http://127.0.0.1:${port}${fixtureBase}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
