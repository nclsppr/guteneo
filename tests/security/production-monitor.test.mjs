import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createHash } from "node:crypto";
import {
  currentSnapshot,
  productionMonitor,
  serveProductionMonitor,
} from "../../scripts/production-monitor.mjs";

const sha = "a".repeat(40);
const paths = [
  "/",
  "/?lang=en",
  "/?lang=de",
  "/?lang=lb",
  "/roles/",
  "/developpeurs/",
  "/assistants/chatgpt/",
];
function fixture(change = () => {}) {
  const pages = new Map(
    paths.map((path) => {
      const url = new URL(path, "https://guteneo.com");
      const lang = url.searchParams.get("lang") ?? "fr";
      const body = `<html lang="${lang}"><title>Guteneo</title><p>Public</p></html>`;
      return [
        path,
        {
          body,
          path: `${url.search ? `/__public-locales/${lang}` : ""}${url.pathname}index.html`,
        },
      ];
    }),
  );
  const release = {
    mode: "production",
    publicPreview: false,
    sourceDirty: false,
    sourceCommit: sha,
    sourceSnapshotSha256: "b".repeat(64),
    assetsSha256: "c".repeat(64),
    liveSendsEnabled: true,
    liveSendChannels: ["fax", "postal"],
    assets: [...pages.values()].map((p) => ({
      path: p.path,
      bytes: Buffer.byteLength(p.body),
      sha256: createHash("sha256").update(p.body).digest("hex"),
    })),
  };
  const capabilities = {
    mode: "production",
    simulation: false,
    liveSending: true,
    registration: { enabled: true },
    scanner: "connected",
    channels: ["fax", "email", "postal"].map((id) => ({
      id,
      liveSending: id !== "email",
    })),
    horizon: { available: false },
    billing: { chargingEnabled: false },
    studio: { ai: { configured: false } },
  };
  const requests = [];
  return {
    requests,
    fetcher: async (input, options) => {
      const url = new URL(input);
      assert.ok(
        [
          "https://guteneo.com",
          "https://guteneo-app.nclsppr.workers.dev",
        ].includes(url.origin),
      );
      assert.equal(options.method, "GET");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.ok(!options.body);
      assert.ok(!options.headers.Authorization);
      assert.ok(options.signal);
      requests.push(url.href);
      const path = `${url.pathname}${url.search}`;
      const result = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: "",
      };
      if (url.origin === "https://guteneo-app.nclsppr.workers.dev") {
        result.status = 404;
        result.body = "{}";
      } else if (path === "/release.json")
        result.body = JSON.stringify(release);
      else if (path === "/api/health")
        result.body = JSON.stringify({
          status: "ok",
          mode: "production",
          liveSending: true,
        });
      else if (path === "/api/capabilities")
        result.body = JSON.stringify(capabilities);
      else if (pages.has(path)) {
        result.body = pages.get(path).body;
        result.headers = {
          "Content-Type": "text/html",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "frame-ancestors 'none'",
          ...(url.origin !== "https://guteneo.com"
            ? { "X-Robots-Tag": "noindex" }
            : {}),
        };
      } else if (
        ["/api/documents", "/api/dispatches", "/api/overview", "/mcp"].includes(
          path,
        )
      ) {
        result.status = 401;
        result.body = '{"error":{"code":"UNAUTHORIZED"}}';
      } else assert.fail(`Unexpected route ${path}`);
      change(result, url);
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    },
  };
}

test("live evidence is bounded, anonymous and explicitly partial even when all public checks pass", async () => {
  const { fetcher, requests } = fixture();
  const report = await productionMonitor(fetcher, sha);
  assert.equal(report.status, "public_checks_passed");
  assert.equal(report.qualification, "partial");
  assert.equal(report.checks.length, 17);
  assert.equal(requests.length, 20);
  assert.equal(
    report.coverage.find((c) => c.feature === "E-mail").state,
    "disabled",
  );
  assert.equal(
    report.coverage.find((c) => c.feature === "Fax").state,
    "not_checked",
  );
  assert.ok(
    report.coverage.every((c) => ["disabled", "not_checked"].includes(c.state)),
  );
  assert.equal(report.staleAfterSeconds, 120);
});

test("wrong release, corrupted bytes, access regression, missing bindings and malformed public data cannot pass", async () => {
  const scenarios = [
    (r, u) => {
      if (u.origin === "https://guteneo-app.nclsppr.workers.dev")
        r.status = 200;
    },
    (r, u) => {
      if (u.pathname === "/release.json") {
        const d = JSON.parse(r.body);
        d.sourceSnapshotSha256 = { toString: "PRIVATE" };
        r.body = JSON.stringify(d);
      }
    },
    (r, u) => {
      if (u.pathname === "/api/capabilities") {
        const d = JSON.parse(r.body);
        d.channels = [null];
        r.body = JSON.stringify(d);
      }
    },
    (r, u) => {
      if (u.pathname === "/release.json" && u.host === "guteneo.com")
        r.body = r.body.replace(sha, "d".repeat(40));
    },
    (r, u) => {
      if (u.pathname === "/roles/") r.body += "changed";
    },
    (r, u) => {
      if (u.pathname === "/api/documents") r.status = 200;
    },
    (r, u) => {
      if (u.pathname === "/api/capabilities")
        r.body = r.body.replace(
          '"scanner":"connected"',
          '"scanner":"missing_quarantine"',
        );
    },
    (r, u) => {
      if (u.pathname === "/api/capabilities")
        r.body = r.body.replace('"enabled":true', '"enabled":false');
    },
    (r, u) => {
      if (u.pathname === "/api/capabilities") {
        const d = JSON.parse(r.body);
        d.channels = {};
        r.body = JSON.stringify(d);
      }
    },
    (r, u) => {
      if (u.pathname === "/release.json") {
        const d = JSON.parse(r.body);
        d.assets = [null];
        r.body = JSON.stringify(d);
      }
    },
    (r, u) => {
      if (u.pathname === "/release.json") r.body = "x".repeat(524289);
    },
    (r, u) => {
      if (u.pathname === "/api/health") r.body = "PRIVATE_INVALID_JSON";
    },
    (r, u) => {
      if (u.pathname === "/api/health")
        throw new Error("PRIVATE_NETWORK_ERROR");
    },
    (r, u) => {
      if (u.pathname === "/") delete r.headers["Content-Security-Policy"];
    },
    (r, u) => {
      if (u.pathname === "/api/documents") delete r.headers["Cache-Control"];
    },
    (r, u) => {
      if (u.pathname === "/api/capabilities") {
        const d = JSON.parse(r.body);
        d.channels[0].liveSending = false;
        r.body = JSON.stringify(d);
      }
    },
  ];
  for (const [i, change] of scenarios.entries()) {
    const report = await productionMonitor(fixture(change).fetcher, sha);
    assert.equal(report.status, "attention", `scenario ${i}`);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  }
  assert.equal(
    (await productionMonitor(fixture().fetcher, "d".repeat(40))).status,
    "attention",
  );
  await assert.rejects(productionMonitor(fixture().fetcher, "not-a-sha"));
});

test("loopback dashboard refuses foreign hosts, cross-origin access and mutations; reads never trigger probes", async () => {
  let samples = 0;
  const server = await serveProductionMonitor({
    port: 0,
    sample: async () => {
      samples++;
      return { status: "attention", checkedAt: new Date().toISOString() };
    },
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.ok(
      page.headers
        .get("content-security-policy")
        .includes("frame-ancestors 'none'"),
    );
    assert.ok(
      page.headers
        .get("content-security-policy")
        .includes("script-src 'sha256-"),
    );
    assert.equal(page.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${origin}/status`)).status, 200);
    assert.equal(
      await new Promise((resolve, reject) => {
        const call = request(
          `${origin}/status`,
          { headers: { Host: "attacker.test" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        call.on("error", reject);
        call.end();
      }),
      403,
    );
    assert.equal(
      (
        await fetch(`${origin}/status`, {
          headers: { Origin: "https://attacker.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${origin}/status`, { method: "POST" })).status,
      405,
    );
    assert.equal((await fetch(`${origin}/unknown`)).status, 404);
    assert.equal(samples, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("JSON consumers also lose a green result when the last observation expires", () => {
  const now = Date.now();
  const report = {
    status: "public_checks_passed",
    checkedAt: new Date(now - 120001).toISOString(),
  };
  assert.equal(currentSnapshot(report, now).status, "stale");
  assert.equal(
    currentSnapshot({ ...report, checkedAt: "invalid" }, now).freshness,
    "stale",
  );
  assert.equal(
    currentSnapshot(
      { ...report, checkedAt: new Date(now + 1).toISOString() },
      now,
    ).status,
    "stale",
  );
  assert.equal(
    currentSnapshot({ ...report, checkedAt: new Date(now).toISOString() }, now)
      .status,
    "public_checks_passed",
  );
});
