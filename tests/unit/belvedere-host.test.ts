import {
  afterAll,
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import application from "../../apps/api/src/index";
import { handleBelvedereHost } from "../../apps/api/src/belvedere-host";
import { BELVEDERE_ORIGIN } from "../../apps/api/src/belvedere-policy";
import { createSession } from "../../apps/api/src/auth";
import type { Env } from "../../apps/api/src/env";
import icons from "../../packages/contracts/src/brand-icons.json" with { type: "json" };

const canonical = "https://guteneo.com";
const slug = "fixture-platform-private-path-abcdefghijklmnopqrstuvwxyz";
const issuer = "https://belvedere-host-fixture.auth0.example/";
const key = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(key.publicKey)),
  kid: "platform-host-fixture",
  alg: "RS256",
  use: "sig",
};
let mf: Miniflare;
let db: D1Database;
let env: Env;
let ownerCookie: string;
let ownerCsrf: string;
let assetRequests: Request[] = [];
const request = (path: string, init: RequestInit = {}) =>
  new Request(`${BELVEDERE_ORIGIN}${path}`, {
    ...init,
    headers: { "CF-Connecting-IP": "192.0.2.1", ...init.headers },
  });
const privateRead = (path: string, headers: Record<string, string> = {}) =>
  request(path, { headers: { Cookie: ownerCookie, ...headers } });
async function total(table: "users" | "browser_sessions" | "auth_identities") {
  return (await db
    .prepare(`SELECT count(*) n FROM ${table}`)
    .first<{ n: number }>())!.n;
}
async function signedToken(audience: string, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key.privateKey);
}
async function startLogin() {
  const response = (await handleBelvedereHost(
    request(
      "/auth/login?returnTo=%2Fapi%2Fdocuments&context=personal&locale=fr",
      {
        headers: { Cookie: "__Host-guteneo_invitation=" + "x".repeat(43) },
      },
    ),
    env,
  ))!;
  const destination = new URL(response.headers.get("Location")!);
  expect(
    await db
      .prepare(
        "SELECT return_to,invitation_token_hash,account_context FROM auth_transactions ORDER BY rowid DESC LIMIT 1",
      )
      .first(),
  ).toMatchObject({
    return_to: "/",
    invitation_token_hash: null,
    account_context: "workshop",
  });
  return {
    response,
    destination,
    cookie: response.headers.get("Set-Cookie")!.split(";")[0],
  };
}
async function callback(changes: Record<string, unknown> = {}) {
  const login = await startLogin();
  const sub = (changes.sub as string | undefined) ?? "auth0|platform-owner";
  const id = await signedToken("fixture-browser", {
    sub,
    email: "nicolas@pieper.fr",
    email_verified: true,
    nonce: login.destination.searchParams.get("nonce"),
    "https://guteneo.com/verified_account": true,
    amr: ["pwd"],
    ...changes,
  });
  const access = await signedToken(`${canonical}/mcp`, {
    sub,
    client_id: "fixture-browser",
    "https://guteneo.com/verified_account": true,
  });
  const transport = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      if (target === `${issuer}.well-known/jwks.json`)
        return Response.json({ keys: [jwk] });
      if (target === `${issuer}oauth/token`) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          redirect_uri: `${BELVEDERE_ORIGIN}/auth/callback`,
          client_id: "fixture-browser",
        });
        return Response.json({ id_token: id, access_token: access });
      }
      throw new Error("Unexpected fixture network destination");
    });
  const response = await handleBelvedereHost(
    request(
      `/auth/callback?state=${login.destination.searchParams.get("state")}&code=fixture-code`,
      {
        headers: {
          Cookie: login.cookie,
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Mode": "navigate",
        },
      },
    ),
    env,
  );
  transport.mockRestore();
  return { ...login, completed: response! };
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "platform-host",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "",
      trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  const stamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES('platform-workspace','Fixture','production',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES('platform-owner','Fixture owner','nicolas@pieper.fr',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('platform-workspace','platform-owner','admin',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES(?,'auth0|platform-owner','platform-owner',?)",
      )
      .bind(issuer, stamp),
  ]);
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: canonical,
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_CLIENT_ID: "fixture-browser",
    AUTH0_CLIENT_SECRET: "synthetic-confidential-client",
    AUTH0_AUDIENCE: `${canonical}/mcp`,
    AUTH0_AUTH_POLICY: "verified_email",
    BELVEDERE_SECRET_SLUG: slug,
    BELVEDERE_AUTH0_SUBJECT: "auth0|platform-owner",
    ASSETS: {
      fetch: async (input: Request) => {
        assetRequests.push(input);
        return new URL(input.url).pathname.startsWith("/assets/") ||
          ["/theme-init.js", "/locale-init.js"].includes(
            new URL(input.url).pathname,
          )
          ? new Response("export {};", {
              headers: { "Content-Type": "application/javascript" },
            })
          : new Response(
              '<html><head></head><body><div id="root"></div></body></html>',
              { headers: { "Content-Type": "text/html" } },
            );
      },
    },
  } as unknown as Env;
});
beforeEach(async () => {
  assetRequests = [];
  const result = await createSession(
    env,
    {
      organization_id: "platform-workspace",
      organization_name: "Fixture",
      user_id: "platform-owner",
      user_name: "Fixture owner",
      user_email: "nicolas@pieper.fr",
      role: "admin",
      preferred_locale: "fr",
      preferred_dashboard_appearance: "classic",
      supervisor_can_approve: 0,
      supervisor_can_report: 0,
    },
    false,
    false,
    true,
    {
      verifiedEmail: "nicolas@pieper.fr",
      authenticatedAt: Math.floor(Date.now() / 1000),
      identityIssuer: issuer,
      identitySubject: "auth0|platform-owner",
    },
  );
  ownerCookie = result.cookie.split(";")[0];
  ownerCsrf = result.session.csrfToken;
  await db
    .prepare(
      "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) VALUES(?,?,'auth0|platform-owner','nicolas@pieper.fr',?)",
    )
    .bind(result.session.tokenHash, issuer, new Date().toISOString())
    .run();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await mf.dispose();
});

describe("isolated Belvedere custom host", () => {
  it("selects only the exact HTTPS hostname with reviewed production configuration", async () => {
    expect(
      await handleBelvedereHost(
        new Request(`${canonical}/`, {
          headers: { "X-Forwarded-Host": "belvedere.guteneo.com" },
        }),
        env,
      ),
    ).toBeNull();
    expect(
      await handleBelvedereHost(
        new Request("https://belvedere.guteneo.com.attacker.test/"),
        env,
      ),
    ).toBeNull();
    for (const target of [
      "http://belvedere.guteneo.com/",
      "https://belvedere.guteneo.com:8443/",
    ])
      expect(
        (await handleBelvedereHost(new Request(target), env))?.status,
      ).toBe(404);
    for (const changed of [
      { MODE: "simulation" },
      { ENVIRONMENT: "staging" },
      { APP_ORIGIN: "https://unreviewed.example" },
      { BELVEDERE_SECRET_SLUG: undefined },
    ])
      expect(
        (await handleBelvedereHost(request("/"), { ...env, ...changed } as Env))
          ?.status,
      ).toBe(404);
  });
  it("blocks customer APIs, signup, metadata and writes before customer routing or static fallback", async () => {
    for (const path of [
      "/api/documents",
      "/api/dispatches",
      "/api/billing",
      "/api/pdf-validation/pricing",
      "/api/plan/subscribe",
      "/auth/signup",
      "/mcp",
      "/.well-known/oauth-protected-resource",
      "/release.json",
      "/openapi.json",
      `/belvedere/${slug}`,
    ]) {
      const response = await application.fetch(privateRead(path), env);
      expect(response.status, path).toBe(404);
      expect(await response.text()).not.toContain(slug);
    }
    for (const path of ["/", "/api/overview", "/auth/login", "/api/documents"])
      expect(
        (
          await handleBelvedereHost(
            request(path, {
              method: "POST",
              headers: {
                Cookie: ownerCookie,
                Origin: BELVEDERE_ORIGIN,
                "X-CSRF-Token": ownerCsrf,
              },
            }),
            env,
          )
        )?.status,
      ).toBe(404);
    expect(assetRequests).toHaveLength(0);
  });
  it("protects root and read-only platform APIs without revealing the legacy private path", async () => {
    const anonymous = (await handleBelvedereHost(request("/"), env))!;
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get("Location")).toMatch(
      /^https:\/\/belvedere\.guteneo\.com\/auth\/login\?/,
    );
    expect(anonymous.headers.get("Location")).not.toContain(slug);
    const shell = (await handleBelvedereHost(privateRead("/"), env))!;
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain('name="guteneo-belvedere" content=""');
    expect(shell.headers.get("Cache-Control")).toContain("no-store");
    expect(shell.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(
      (await handleBelvedereHost(privateRead("/api/overview"), env))?.status,
    ).toBe(200);
    expect(
      (await handleBelvedereHost(request("/api/overview"), env))?.status,
    ).toBe(404);
    const rejectedHeaders: Record<string, string>[] = [
      { Authorization: "Bearer synthetic" },
      { Origin: canonical },
      { "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of rejectedHeaders)
      expect(
        (await handleBelvedereHost(privateRead("/api/overview", headers), env))
          ?.status,
      ).toBe(404);
  });
  it("uses browser-bound PKCE and separate host-only cookies for the same canonical identity", async () => {
    const login = await callback();
    expect(login.destination.searchParams.get("redirect_uri")).toBe(
      `${BELVEDERE_ORIGIN}/auth/callback`,
    );
    expect(login.destination.searchParams.get("audience")).toBe(
      `${canonical}/mcp`,
    );
    expect(login.destination.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(login.destination.searchParams.has("screen_hint")).toBe(false);
    const row = await db
      .prepare(
        "SELECT return_to,invitation_token_hash,account_context FROM auth_transactions ORDER BY rowid DESC LIMIT 1",
      )
      .first();
    // The completed transaction is one-use and is already consumed.
    expect(row).toBeNull();
    expect(login.completed.status).toBe(302);
    expect(login.completed.headers.get("Location")).toBe(
      `${BELVEDERE_ORIGIN}/`,
    );
    for (const response of [login.response, login.completed]) {
      const value = response.headers.get("Set-Cookie")!;
      expect(value).toContain("__Host-guteneo_");
      expect(value).toContain("HttpOnly");
      expect(value).toContain("Secure");
      expect(value).toContain("SameSite=Lax");
      expect(value).not.toMatch(/Domain=/i);
    }
    const signedCookie = login.completed.headers
      .get("Set-Cookie")!
      .match(/__Host-guteneo_session=[^;,]+/)![0];
    expect(
      (
        await handleBelvedereHost(
          request("/", { headers: { Cookie: signedCookie } }),
          env,
        )
      )?.status,
    ).toBe(200);
  });
  it("rejects other or unknown signed identities before provisioning users or sessions", async () => {
    for (const changes of [
      { email: "other@example.test" },
      { sub: "auth0|unknown-owner" },
      { nonce: "wrong" },
      { email_verified: false },
    ]) {
      const before = [
        await total("users"),
        await total("browser_sessions"),
        await total("auth_identities"),
      ];
      const result = await callback(changes);
      expect(result.completed.status).toBe(403);
      expect(result.completed.headers.get("Location")).toBeNull();
      const recovery = await result.completed.text();
      expect(recovery).not.toContain(slug);
      expect(recovery).toContain("/auth/login?fresh=1&amp;locale=");
      expect([
        await total("users"),
        await total("browser_sessions"),
        await total("auth_identities"),
      ]).toEqual(before);
    }
  });
  it("can leave a denied SSO identity through an explicit fresh browser login", async () => {
    const response = (await handleBelvedereHost(
      request("/auth/login?fresh=1&locale=fr"),
      env,
    ))!;
    const destination = new URL(response.headers.get("Location")!);
    expect(destination.searchParams.get("prompt")).toBe("login");
    expect(destination.searchParams.get("max_age")).toBe("0");
    expect(destination.searchParams.get("redirect_uri")).toBe(
      `${BELVEDERE_ORIGIN}/auth/callback`,
    );
  });
  it("requires the host origin and current CSRF to revoke only the selected local session", async () => {
    const before = await total("browser_sessions");
    expect(
      (
        await handleBelvedereHost(
          request("/api/logout", {
            method: "POST",
            headers: {
              Cookie: ownerCookie,
              Origin: canonical,
              "X-CSRF-Token": ownerCsrf,
            },
          }),
          env,
        )
      )?.status,
    ).toBe(404);
    expect(
      (
        await handleBelvedereHost(
          request("/api/logout", {
            method: "POST",
            headers: { Cookie: ownerCookie, Origin: BELVEDERE_ORIGIN },
          }),
          env,
        )
      )?.status,
    ).toBe(404);
    expect(await total("browser_sessions")).toBe(before);
    const response = (await handleBelvedereHost(
      request("/api/logout", {
        method: "POST",
        headers: {
          Cookie: ownerCookie,
          Origin: BELVEDERE_ORIGIN,
          "X-CSRF-Token": ownerCsrf,
        },
      }),
      env,
    ))!;
    expect(response.status).toBe(200);
    expect(await total("browser_sessions")).toBe(before - 1);
    expect(response.headers.get("Set-Cookie")).not.toMatch(/Domain=/i);
  });
  it("serves only necessary static bundle files without forwarding cookies or public HTML", async () => {
    const asset = (await handleBelvedereHost(
      privateRead("/assets/example.js"),
      env,
    ))!;
    expect(asset.status).toBe(200);
    expect(assetRequests[0].headers.has("Cookie")).toBe(false);
    const theme = (await handleBelvedereHost(
      privateRead("/theme-init.js", {
        Cookie: `${ownerCookie}; guteneo_theme=dark`,
      }),
      env,
    ))!;
    expect(theme.status).toBe(200);
    expect(theme.headers.get("Cache-Control")).toContain("no-store");
    expect(theme.headers.get("Content-Security-Policy")).toContain(
      "frame-src 'none'",
    );
    expect(assetRequests.at(-1)!.headers.has("Cookie")).toBe(false);
    const locale = (await handleBelvedereHost(
      privateRead("/locale-init.js"),
      env,
    ))!;
    expect(locale.status).toBe(200);
    expect(locale.headers.get("Content-Type")).toBe("application/javascript");
    expect(assetRequests.at(-1)!.headers.has("Cookie")).toBe(false);
    const portraitEnv = {
      ...env,
      ASSETS: {
        fetch: async (input: Request) => {
          assetRequests.push(input);
          return new Response(new Uint8Array([82, 73, 70, 70]), {
            headers: { "Content-Type": "image/webp" },
          });
        },
      },
    } as unknown as Env;
    for (const path of [
      "/brand/guteneo-portrait-128.webp",
      "/brand/guteneo-portrait-192.webp",
    ]) {
      const image = (await handleBelvedereHost(
        privateRead(path),
        portraitEnv,
      ))!;
      expect(image.status).toBe(200);
      expect(image.headers.get("Content-Type")).toBe("image/webp");
      expect(image.headers.get("Cache-Control")).toContain("no-store");
      expect(assetRequests.at(-1)!.headers.has("Cookie")).toBe(false);
      expect(assetRequests.at(-1)!.headers.has("Authorization")).toBe(false);
    }
    for (const path of [
      "/brand/guteneo-portrait-128.webp?token=private",
      "/brand/guteneo-portrait-512.webp",
      "/brand/guteneo-portrait-192.webp/other",
      "/brand/unrelated.webp",
    ]) {
      const count = assetRequests.length;
      expect(
        (await handleBelvedereHost(privateRead(path), portraitEnv))?.status,
      ).toBe(404);
      expect(assetRequests).toHaveLength(count);
    }
    for (const path of [
      "/theme-init.js?token=private",
      "/locale-init.js?token=private",
      "/theme-other.js",
      "/public/theme-init.js",
    ]) {
      expect((await handleBelvedereHost(privateRead(path), env))?.status).toBe(
        404,
      );
    }
    const invalidAsset = await handleBelvedereHost(
      privateRead("/theme-init.js"),
      {
        ...env,
        ASSETS: {
          fetch: async () =>
            new Response("<html>untrusted</html>", {
              headers: { "Content-Type": "text/html" },
            }),
        },
      } as unknown as Env,
    );
    expect(invalidAsset?.status).toBe(404);
    expect(
      (
        await handleBelvedereHost(
          privateRead("/assets/example.js?token=private"),
          env,
        )
      )?.status,
    ).toBe(404);
    expect(
      (
        await handleBelvedereHost(
          privateRead("/brand/guteneo-mark-128.webp"),
          env,
        )
      )?.status,
    ).toBe(404);
    const robots = (await handleBelvedereHost(request("/robots.txt"), env))!;
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  });
  it("serves the exact approved browser icons for GET and HEAD without forwarding identity", async () => {
    const bytes = new Map<string, Uint8Array<ArrayBuffer>>(
      await Promise.all(
        icons.files.map(
          async (name) =>
            [
              `/${name}`,
              new Uint8Array(
                await readFile(
                  new URL(`../../apps/web/public/${name}`, import.meta.url),
                ),
              ),
            ] as const,
        ),
      ),
    );
    const iconEnv = {
      ...env,
      ASSETS: {
        fetch: async (input: Request) => {
          assetRequests.push(input);
          const path = new URL(input.url).pathname;
          const content = bytes.get(path)!;
          return new Response(content, {
            headers: {
              "Content-Type": path.endsWith(".svg")
                ? "image/svg+xml"
                : path.endsWith(".ico")
                  ? "image/x-icon"
                  : "image/png",
              "Content-Length": String(content.byteLength),
              ETag: '"approved-icon"',
            },
          });
        },
      },
    } as unknown as Env;
    const favicon = new URL(icons.faviconUrl);
    const paths = [...bytes.keys(), favicon.pathname + favicon.search];
    for (const method of ["GET", "HEAD"]) {
      for (const path of paths) {
        const response = (await handleBelvedereHost(
          request(path, {
            method,
            headers: { Cookie: ownerCookie, "Sec-Fetch-Site": "same-origin" },
          }),
          iconEnv,
        ))!;
        const canonicalPath = new URL(path, BELVEDERE_ORIGIN).pathname;
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store, private");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Content-Security-Policy")).toContain(
          "img-src 'self'",
        );
        expect(response.headers.get("ETag")).toBe('"approved-icon"');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
          method === "HEAD" ? new Uint8Array() : bytes.get(canonicalPath),
        );
        const forwarded = assetRequests.at(-1)!;
        expect(forwarded.url).toBe(BELVEDERE_ORIGIN + canonicalPath);
        expect(forwarded.method).toBe(method);
        expect(forwarded.headers.has("Cookie")).toBe(false);
        expect(forwarded.headers.has("Authorization")).toBe(false);
      }
    }
    const before = assetRequests.length;
    for (const path of [
      "/favicon.svg?brand=other",
      "/favicon.svg?brand=20260917&brand=20260917",
      "/favicon.svg?brand=20260917&token=private",
      "/favicon.ico?brand=20260917",
      "/favicon-32.png?token=private",
      "/favicon-other.svg",
      "/favicon.svg/other",
      "/public/favicon.svg",
    ])
      expect((await handleBelvedereHost(request(path), iconEnv))?.status).toBe(
        404,
      );
    const rejected: RequestInit[] = [
      { method: "POST" },
      { headers: { Authorization: "Bearer synthetic" } },
      { headers: { Origin: canonical } },
      { headers: { "Sec-Fetch-Site": "cross-site" } },
    ];
    for (const init of rejected)
      expect(
        (await handleBelvedereHost(request("/favicon.svg", init), iconEnv))
          ?.status,
      ).toBe(404);
    expect(assetRequests).toHaveLength(before);
  });
  it("themes recovery without exposing the private route or accepting appearance as authority", async () => {
    const before = await total("browser_sessions");
    const response = (await handleBelvedereHost(
      request("/auth/callback?locale=en&state=invalid&code=invalid", {
        headers: { Cookie: "guteneo_theme=dark" },
      }),
      env,
    ))!;
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const html = await response.text();
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<meta name="theme-color" content="#2450db">');
    expect(html).not.toContain(slug);
    expect(html).not.toContain("<script");
    expect(await total("browser_sessions")).toBe(before);
  });
});
