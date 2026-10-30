/** Loopback-only fictional design preview. No Worker bindings or credentials. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { fixtureBase, fixtureResponse } from "../tests/fixtures/belvedere.ts";
import {
  LocalBelvedereScenarioError,
  localBelvedereLanguage,
  localBelvedereResponse,
  localBelvedereScenario,
} from "../tests/fixtures/local-belvedere.ts";

const root = resolve(fileURLToPath(new URL("../dist/web/", import.meta.url)));
const port = Number(process.env.GUTENEO_BELVEDERE_PREVIEW_PORT || 8794);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local preview port");
const index = await readFile(resolve(root, "index.html"), "utf8");
const shell = (basePath = fixtureBase) =>
  index.replace(
    "<head>",
    `<head><meta name="guteneo-belvedere" content="${basePath}"><meta name="guteneo-belvedere-demo" content="true">`,
  );
const scenarioPrefix = `${fixtureBase}/scenario/`;
function scenarioPath(scenario) {
  return (
    scenarioPrefix + Buffer.from(JSON.stringify(scenario)).toString("base64url")
  );
}
function scenarioFromToken(token) {
  if (
    !/^[A-Za-z0-9_-]{1,2048}$/.test(token) ||
    Buffer.from(token, "base64url").toString("base64url") !== token
  )
    throw new LocalBelvedereScenarioError();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new LocalBelvedereScenarioError();
  }
  if (
    !parsed ||
    typeof parsed.seed !== "string" ||
    !parsed.counts ||
    typeof parsed.counts !== "object" ||
    Array.isArray(parsed.counts) ||
    !Number.isSafeInteger(parsed.members) ||
    !Number.isSafeInteger(parsed.connections)
  )
    throw new LocalBelvedereScenarioError();
  const scenario = localBelvedereScenario(
    new URLSearchParams({
      seed: parsed.seed,
      counts: JSON.stringify(parsed.counts),
      members: String(parsed.members),
      connections: String(parsed.connections),
    }),
  );
  if (scenarioPath(scenario) !== scenarioPrefix + token)
    throw new LocalBelvedereScenarioError();
  return scenario;
}
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
    if (url.pathname === "/scenario") {
      const scenario = localBelvedereScenario(url.searchParams);
      const language = localBelvedereLanguage(url.searchParams);
      res.writeHead(302, {
        Location:
          scenarioPath(scenario) + (language ? `?lang=${language}` : ""),
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith(scenarioPrefix)) {
      const tail = url.pathname.slice(scenarioPrefix.length);
      const separator = tail.indexOf("/api/");
      const token =
        separator < 0 ? tail.replace(/\/$/, "") : tail.slice(0, separator);
      const scenario = scenarioFromToken(token);
      const basePath = scenarioPath(scenario);
      if (separator < 0) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(req.method === "HEAD" ? undefined : shell(basePath));
      } else {
        const normalized = new URL(url);
        normalized.pathname = `${fixtureBase}${tail.slice(separator)}`;
        const data = localBelvedereResponse(normalized, scenario);
        res.writeHead(data ? 200 : 404, { "Content-Type": "application/json" });
        res.end(
          req.method === "HEAD"
            ? undefined
            : JSON.stringify(
                data ?? {
                  error: {
                    code: "FIXTURE_ROUTE_MISSING",
                    message: "Fictional data unavailable.",
                  },
                },
              ),
        );
      }
      return;
    }
    if (
      url.pathname === "/" ||
      url.pathname === fixtureBase ||
      url.pathname === fixtureBase + "/"
    ) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(req.method === "HEAD" ? undefined : shell());
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
                  message: "Fictional data unavailable.",
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
  } catch (error) {
    if (error instanceof LocalBelvedereScenarioError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({
              error: { code: "INVALID_LOCAL_SCENARIO", message: error.message },
            }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Belvédère — fictional data only: http://127.0.0.1:${port}${fixtureBase}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
