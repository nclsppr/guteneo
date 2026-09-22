import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import { hashSecret } from "../../apps/api/src/auth";
import {
  authenticateNative,
  handleMobileRoute,
} from "../../apps/api/src/mobile";
import { DomainService } from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
import worker from "../../apps/api/src/index";

let mf: Miniflare;
let env: Env;
let db: D1Database;
let domain: DomainService;
let owner: Login;
let outsider: Login;
type Login = {
  userId: string;
  org: string;
  cookie: string;
  csrf: string;
  hash: string;
};
const now = () => new Date().toISOString();
const random = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const caps = {
  mode: "simulation",
  simulation: true,
  channels: [{ id: "fax", name: "Fax", liveSending: false }],
};
const prefix = "/api/mobile/v1";
const verifier = random();
const state = random();
let challenge: string;

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    const statements: D1PreparedStatement[] = [];
    for (const rawLine of sql.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        statements.push(db.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    if (statement.trim()) throw new Error("Incomplete migration");
    if (statements.length) await db.batch(statements);
  }
  env = {
    DB: db,
    DOCUMENTS: (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: "http://localhost:8787",
  } as Env;
  domain = new DomainService(db, { mode: "simulation" });
  challenge = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  ).toString("base64url");
});
afterAll(async () => mf?.dispose());
async function login(): Promise<Login> {
  const org = `org_${crypto.randomUUID()}`;
  const userId = `user_${crypto.randomUUID()}`;
  const token = random();
  const hash = await hashSecret(token);
  const csrf = random();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'simulation',?)",
      )
      .bind(org, "Espace test privé", now()),
    db
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .bind(userId, "Utilisateur test", "fixture@example.invalid", now()),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(org, userId, now()),
    db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,?,1,1,?,?)",
      )
      .bind(
        hash,
        userId,
        org,
        csrf,
        now(),
        new Date(Date.now() + 3600000).toISOString(),
      ),
    db
      .prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,100,104857600,50)",
      )
      .bind(org),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Test','fixture@example.invalid','verified','simulation',?)",
      )
      .bind(`sender_${crypto.randomUUID()}`, org, now()),
  ]);
  return { org, userId, hash, csrf, cookie: `guteneo_session=${token}` };
}
beforeEach(async () => {
  owner = await login();
  outsider = await login();
});
function req(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${env.APP_ORIGIN}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `GuteneoNative ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const response = await handleMobileRoute(
    req(prefix + path, token, method, body, extra),
    env,
    domain,
    caps,
  );
  if (!response) throw new Error("Expected mobile response");
  return response;
}
function authorizeReq(
  principal: Login,
  method = "GET",
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  if (method === "POST") params.set("csrf", principal.csrf);
  return new Request(
    `${env.APP_ORIGIN}/auth/mobile/authorize${method === "GET" ? `?${params}` : ""}`,
    {
      method,
      headers: {
        Cookie: principal.cookie,
        ...(method === "POST"
          ? {
              Origin: env.APP_ORIGIN,
              "Content-Type": "application/x-www-form-urlencoded",
            }
          : {}),
        ...extra,
      },
      ...(method === "POST" ? { body: params.toString() } : {}),
    },
  );
}
async function code(principal = owner) {
  const response = (await handleMobileRoute(
    authorizeReq(principal, "POST"),
    env,
    domain,
    caps,
  ))!;
  const callback = new URL(response.headers.get("Location")!);
  expect(callback.pathname).toBe("/callback");
  expect(callback.protocol).toBe("guteneo:");
  expect(callback.hostname).toBe("auth");
  expect(callback.searchParams.get("state")).toBe(state);
  return callback.searchParams.get("code")!;
}
async function connect(principal = owner) {
  const response = await call("/session", undefined, "POST", {
    code: await code(principal),
    codeVerifier: verifier,
  });
  return (await response.json()) as {
    token: string;
    expiresAt: string;
    session: {
      organization: { id: string };
      user: { id: string };
      simulation: boolean;
    };
  };
}

describe("native mobile boundary on actual D1 and R2", () => {
  it("redirects an unauthenticated native login through existing Auth0 with the exact safe return path", async () => {
    const url = new URL(authorizeReq(owner).url);
    const response = (await handleMobileRoute(
      new Request(url),
      env,
      domain,
      caps,
    ))!;
    const loginUrl = new URL(response.headers.get("Location")!);
    expect(loginUrl.pathname).toBe("/auth/login");
    expect(loginUrl.searchParams.get("returnTo")).toBe(
      url.pathname + url.search,
    );
  });
  it("requires a visible browser confirmation and CSRF before issuing a code", async () => {
    const page = (await handleMobileRoute(
      authorizeReq(owner),
      env,
      domain,
      caps,
    ))!;
    expect(await page.text()).toContain("Connecter l’application");
    expect(page.headers.get("Location")).toBeNull();
    await expect(
      handleMobileRoute(
        authorizeReq(owner, "POST", { Origin: "https://attacker.invalid" }),
        env,
        domain,
        caps,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    const bad = authorizeReq({ ...owner, csrf: "wrong" }, "POST");
    await expect(
      handleMobileRoute(bad, env, domain, caps),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
  });
  it("binds code to S256, consumes it once atomically, and stores only credential hashes", async () => {
    const issued = await code();
    await expect(
      call("/session", undefined, "POST", {
        code: issued,
        codeVerifier: random(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_EXCHANGE" });
    const exchanges = await Promise.allSettled([
      call("/session", undefined, "POST", {
        code: issued,
        codeVerifier: verifier,
      }),
      call("/session", undefined, "POST", {
        code: issued,
        codeVerifier: verifier,
      }),
    ]);
    expect(
      exchanges.filter((item) => item.status === "fulfilled"),
    ).toHaveLength(1);
    const success = exchanges.find((item) => item.status === "fulfilled");
    if (success?.status !== "fulfilled")
      throw new Error("Missing successful exchange");
    const result = (await success.value.json()) as {
      token: string;
      session: { organization: { id: string } };
    };
    expect(result.session.organization.id).toBe(owner.org);
    const stored = await db
      .prepare("SELECT token_hash FROM native_sessions WHERE user_id=?")
      .bind(owner.userId)
      .all<{ token_hash: string }>();
    expect(stored.results.map((row) => row.token_hash)).toEqual([
      await hashSecret(result.token),
    ]);
    expect(
      await db
        .prepare("SELECT 1 FROM native_authorization_codes WHERE code_hash=?")
        .bind(await hashSecret(issued))
        .first(),
    ).toBeNull();
  });
  it("refuses expired codes, browser/MCP credentials and cross-origin transport", async () => {
    const issued = await code();
    await db
      .prepare(
        "UPDATE native_authorization_codes SET expires_at='2020-01-01' WHERE code_hash=?",
      )
      .bind(await hashSecret(issued))
      .run();
    await expect(
      call("/session", undefined, "POST", {
        code: issued,
        codeVerifier: verifier,
      }),
    ).rejects.toMatchObject({ code: "INVALID_EXCHANGE" });
    const { token } = await connect();
    for (const headers of [
      { Cookie: owner.cookie },
      { Origin: env.APP_ORIGIN },
    ] as Record<string, string>[])
      await expect(
        call("/session", token, "GET", undefined, headers),
      ).rejects.toMatchObject({ code: "NATIVE_TRANSPORT_REQUIRED" });
    await expect(
      call("/session", undefined, "GET", undefined, {
        Authorization: "Bearer fake-mcp-token",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(call("/session")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });
  it("reflects current role and invalidates native access after parent session revocation or native expiry", async () => {
    const { token } = await connect();
    const session = await authenticateNative(
      req(prefix + "/session", token),
      env,
    );
    expect(session.context).toMatchObject({
      actor: "native",
      organizationId: owner.org,
    });
    await db
      .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
      .bind(owner.hash)
      .run();
    await expect(call("/session", token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    const other = await connect(outsider);
    await db
      .prepare(
        "UPDATE native_sessions SET expires_at='2020-01-01' WHERE token_hash=?",
      )
      .bind(await hashSecret(other.token))
      .run();
    await expect(call("/session", other.token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
  it("rechecks current membership and verified-account/MFA policy instead of trusting native token possession", async () => {
    const { token } = await connect();
    await db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(owner.org, outsider.userId, now())
      .run();
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(owner.org, owner.userId)
      .run();
    expect(await (await call("/session", token)).json()).toMatchObject({
      user: { role: "viewer" },
    });
    await expect(
      call(
        "/dispatches",
        token,
        "POST",
        {
          channel: "email",
          recipient: { email: "fixture@example.invalid" },
          subject: "Blocked",
          text: "Blocked",
        },
        { "Idempotency-Key": "viewer-write-test" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.batch([
      db
        .prepare(
          "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
        )
        .bind(owner.org, owner.userId),
      db
        .prepare(
          "UPDATE browser_sessions SET is_development=0,verified_account=0,mfa=0 WHERE token_hash=?",
        )
        .bind(owner.hash),
      db
        .prepare("UPDATE organizations SET mode='production' WHERE id=?")
        .bind(owner.org),
    ]);
    const production: Env = {
      ...env,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.com",
      AUTH0_AUTH_POLICY: "verified_email",
    };
    const request = new Request("https://guteneo.com/api/mobile/v1/session", {
      headers: { Authorization: `GuteneoNative ${token}` },
    });
    await expect(authenticateNative(request, production)).rejects.toMatchObject(
      { code: "ACCOUNT_VERIFICATION_REQUIRED" },
    );
    await db
      .prepare(
        "UPDATE browser_sessions SET verified_account=1 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    expect(
      (await authenticateNative(request, production)).verifiedAccount,
    ).toBe(true);
    await expect(
      authenticateNative(request, {
        ...production,
        AUTH0_AUTH_POLICY: "verified_email_and_mfa",
      }),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    await db.batch([
      db
        .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
        .bind(owner.hash),
      db
        .prepare(
          "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
        )
        .bind(owner.org, owner.userId),
    ]);
    await expect(authenticateNative(request, production)).rejects.toMatchObject(
      { code: "SESSION_EXPIRED" },
    );
  });

  it("isolates document metadata, PDF bytes and rescan by tenant, and exposes no unused deletion route", async () => {
    const one = await connect();
    const two = await connect(outsider);
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const bytes = await pdf.save();
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(bytes)], "confidentiel.pdf", {
        type: "application/pdf",
      }),
    );
    const uploaded = (await handleMobileRoute(
      new Request(env.APP_ORIGIN + prefix + "/documents", {
        method: "POST",
        headers: { Authorization: `GuteneoNative ${one.token}` },
        body: form,
      }),
      env,
      domain,
      caps,
    ))!;
    const document = (await uploaded.json()) as { id: string; status: string };
    expect(document.status).toBe("ready");
    const content = await call(`/documents/${document.id}/content`, one.token);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(
      new Uint8Array(bytes),
    );
    for (const [suffix, method] of [
      ["", "GET"],
      ["/content", "GET"],
      ["/rescan", "POST"],
    ])
      await expect(
        call(`/documents/${document.id}${suffix}`, two.token, method),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await (await call("/documents", two.token)).json()).toMatchObject({
      items: [],
    });
    for (const token of [one.token, two.token])
      expect(
        (await call(`/documents/${document.id}`, token, "DELETE")).status,
      ).toBe(404);
    expect(
      new Uint8Array(
        await (
          await call(`/documents/${document.id}/content`, one.token)
        ).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array(bytes));
  });
  it("keeps a page of maximum-size email bodies within the native response budget while preserving exact detail", async () => {
    const { token } = await connect();
    const identity = await authenticateNative(
      req(prefix + "/session", token),
      env,
    );
    const text = "A".repeat(128 * 1024);
    const html = `<p>${"B".repeat(128 * 1024 - 7)}</p>`;
    let firstId = "";
    for (let i = 0; i < 31; i++) {
      const prepared = await domain.prepareDispatch(
        identity.context,
        {
          channel: "email",
          recipient: { email: "fixture@example.invalid" },
          subject: `Large fixture ${i}`,
          text,
          html,
        },
        `large-native-list:${crypto.randomUUID()}`,
      );
      if (i === 0) firstId = prepared.id;
    }
    const full = await domain.listDispatches(identity.context);
    expect(Buffer.byteLength(JSON.stringify(full))).toBeGreaterThan(
      4 * 1024 * 1024,
    );
    const response = await call("/dispatches", token);
    const serialized = await response.text();
    expect(Buffer.byteLength(serialized)).toBeLessThan(4 * 1024 * 1024);
    const page = JSON.parse(serialized) as {
      items: Record<string, unknown>[];
      nextCursor: string;
    };
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBeTruthy();
    for (const item of page.items) {
      expect(item).not.toHaveProperty("html");
      expect(item).not.toHaveProperty("text");
      expect(item).toHaveProperty("recipient_json");
      expect(item).toHaveProperty("fingerprint");
    }
    const following = (await (
      await call(
        `/dispatches?cursor=${encodeURIComponent(page.nextCursor)}`,
        token,
      )
    ).json()) as {
      items: Record<string, unknown>[];
      nextCursor: string | null;
    };
    expect(following.items).toHaveLength(1);
    expect(following.nextCursor).toBeNull();
    expect(following.items[0]).not.toHaveProperty("text");
    const detail = (await (
      await call(`/dispatches/${firstId}`, token)
    ).json()) as { dispatch: { html: string; text: string } };
    expect(detail.dispatch.html).toBe(html);
    expect(detail.dispatch.text).toBe(text);
  }, 60_000);
  it("prepares idempotently, returns exact browser review, and denies approve/send/expert/billing", async () => {
    const { token } = await connect();
    const input = {
      channel: "email",
      recipient: { email: "fixture@example.invalid" },
      subject: "Native fixture",
      text: "Fictional local test",
      html: "<p>Fictional local test</p>",
    };
    const idempotency = `ios:${crypto.randomUUID()}`;
    const prepared = (await (
      await call("/dispatches", token, "POST", input, {
        "Idempotency-Key": idempotency,
      })
    ).json()) as { id: string; fingerprint: string; approvalUrl: string };
    const replay = (await (
      await call("/dispatches", token, "POST", input, {
        "Idempotency-Key": idempotency,
      })
    ).json()) as { id: string };
    expect(replay.id).toBe(prepared.id);
    expect(prepared.approvalUrl).toBe(
      `${env.APP_ORIGIN}/auth/mobile/review/${prepared.id}`,
    );
    const identity = await authenticateNative(
      req(prefix + "/session", token),
      env,
    );
    await expect(
      domain.approveDispatch(
        identity.context,
        prepared.id,
        prepared.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    await expect(
      domain.confirmDispatch(
        identity.context,
        prepared.id,
        "native-confirm-test",
      ),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    for (const path of [
      `/dispatches/${prepared.id}/approve`,
      `/dispatches/${prepared.id}/confirm`,
      "/account/expert-approval",
      "/billing",
      "/billing/portal",
    ])
      expect((await call(path, token, "POST", {})).status).toBe(404);
    expect(
      await (
        await call(`/dispatches/${prepared.id}/cancel`, token, "POST", {})
      ).json(),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await db
        .prepare("SELECT 1 FROM outbox WHERE dispatch_id=?")
        .bind(prepared.id)
        .first(),
    ).toBeNull();
  });
  it("reviews and confirms only through explicit browser consent, with no funding or dashboard navigation", async () => {
    const { token } = await connect();
    const preparation = (await (
      await call(
        "/dispatches",
        token,
        "POST",
        {
          channel: "email",
          recipient: { email: "fixture@example.invalid" },
          subject: "Exact content",
          text: "Fixture",
          html: "<p>Fixture</p>",
        },
        { "Idempotency-Key": `review:${crypto.randomUUID()}` },
      )
    ).json()) as { id: string; fingerprint: string; approvalUrl: string };
    const browserRequest = (
      principal = owner,
      fields?: Record<string, string>,
      extra: Record<string, string> = {},
    ) =>
      new Request(preparation.approvalUrl, {
        method: fields ? "POST" : "GET",
        headers: {
          Cookie: principal.cookie,
          ...(fields
            ? {
                Origin: env.APP_ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
              }
            : {}),
          ...extra,
        },
        ...(fields
          ? {
              body: new URLSearchParams({
                csrf: principal.csrf,
                fingerprint: preparation.fingerprint,
                ...fields,
              }).toString(),
            }
          : {}),
      });
    const review = async (request: Request) =>
      (await handleMobileRoute(request, env, domain, caps))!;
    const page = await review(browserRequest());
    const text = await page.text();
    expect(text).toContain("Valider cette version");
    expect(text).not.toMatch(
      /recharg|ajout de crédit|billing|stripe|#\/app|top.?up/i,
    );
    expect(
      (await review(req(new URL(preparation.approvalUrl).pathname, token)))
        .status,
    ).toBe(403);
    expect((await review(browserRequest(outsider))).status).toBe(404);
    expect(
      (
        await review(
          browserRequest(owner, {
            action: "approve",
            reviewed: "yes",
            csrf: "wrong",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await review(
          browserRequest(owner, {
            action: "approve",
            reviewed: "yes",
            fingerprint: "f".repeat(64),
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await review(browserRequest(owner, { action: "approve" }))).status,
    ).toBe(409);
    expect(
      (
        await review(
          browserRequest(owner, { action: "approve", reviewed: "yes" }),
        )
      ).status,
    ).toBe(303);
    expect(
      await db
        .prepare("SELECT 1 FROM outbox WHERE dispatch_id=?")
        .bind(preparation.id)
        .first(),
    ).toBeNull();
    expect(await (await review(browserRequest())).text()).toContain(
      "Lancer la simulation",
    );
    expect(
      (await review(browserRequest(owner, { action: "confirm" }))).status,
    ).toBe(409);
    const denied = await review(
      browserRequest(owner, { action: "confirm", sendConfirmed: "yes" }),
    );
    expect(denied.status).toBe(409);
    expect(await denied.text()).not.toMatch(
      /recharg|ajout de crédit|billing|stripe|#\/app|top.?up/i,
    );
    await db.batch([
      db
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,50000,'EUR')",
        )
        .bind(owner.org, now().slice(0, 7)),
      db
        .prepare(
          "INSERT INTO channel_controls(organization_id,channel,enabled) VALUES(?,'email',1)",
        )
        .bind(owner.org),
    ]);
    expect(
      (
        await review(
          browserRequest(owner, { action: "confirm", sendConfirmed: "yes" }),
        )
      ).status,
    ).toBe(303);
    const current = await db
      .prepare("SELECT status FROM dispatches WHERE id=?")
      .bind(preparation.id)
      .first<{ status: string }>();
    expect(current?.status).toBe("queued");
    expect(
      await db
        .prepare("SELECT 1 FROM outbox WHERE dispatch_id=?")
        .bind(preparation.id)
        .first(),
    ).not.toBeNull();
  });

  it("offers browser renewal only for an expired unattempted fax and redirects to the fresh review", async () => {
    const { token } = await connect();
    const identity = await authenticateNative(
      req(prefix + "/session", token),
      env,
    );
    const prepared = await domain.prepareDispatch(
      identity.context,
      {
        channel: "email",
        recipient: { email: "fixture@example.invalid" },
        subject: "Fixture",
        text: "Fixture",
        html: "<p>Fixture</p>",
      },
      `renew-review:${crypto.randomUUID()}`,
    );
    const actual = await domain.getDispatch(identity.context, prepared.id);
    const projected = {
      ...actual,
      dispatch: {
        ...actual.dispatch,
        channel: "fax" as const,
        quote_expires_at: "2020-01-01T00:00:00.000Z",
      },
    };
    const renewed = { ...projected.dispatch, id: `dsp_${crypto.randomUUID()}` };
    const read = vi.spyOn(domain, "getDispatch").mockResolvedValue(projected);
    const renew = vi.spyOn(domain, "renewFaxQuote").mockResolvedValue(renewed);
    const route = `${env.APP_ORIGIN}/auth/mobile/review/${prepared.id}`;
    const request = (post = false) =>
      new Request(route, {
        method: post ? "POST" : "GET",
        headers: {
          Cookie: owner.cookie,
          ...(post
            ? {
                Origin: env.APP_ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
              }
            : {}),
        },
        ...(post
          ? {
              body: new URLSearchParams({
                csrf: owner.csrf,
                fingerprint: prepared.fingerprint,
                action: "renew",
              }).toString(),
            }
          : {}),
      });
    try {
      const page = (await handleMobileRoute(request(), env, domain, caps))!;
      expect(await page.text()).toContain("Renouveler le devis</button>");
      const response = (await handleMobileRoute(
        request(true),
        env,
        domain,
        caps,
      ))!;
      expect(response.headers.get("Location")).toBe(
        `${env.APP_ORIGIN}/auth/mobile/review/${renewed.id}`,
      );
      expect(renew).toHaveBeenCalledWith(
        expect.objectContaining({ actor: "browser", userId: owner.userId }),
        prepared.id,
      );
      read.mockResolvedValue({
        ...projected,
        dispatch: {
          ...projected.dispatch,
          quote_expires_at: "2099-01-01T00:00:00.000Z",
        },
      });
      expect(
        (await handleMobileRoute(request(true), env, domain, caps))!.status,
      ).toBe(409);
      expect(renew).toHaveBeenCalledTimes(1);
    } finally {
      read.mockRestore();
      renew.mockRestore();
    }
  });

  it("preserves preparation-only scope in native reads and denies browser approval and confirmation", async () => {
    const { token } = await connect();
    const identity = await authenticateNative(
      req(prefix + "/session", token),
      env,
    );
    const prepared = await domain.prepareDispatch(
      identity.context,
      {
        channel: "email",
        recipient: { email: "fixture@example.invalid" },
        subject: "Scope fixture",
        text: "Content under review",
        html: "<p>Content under review</p>",
      },
      `scope-review:${crypto.randomUUID()}`,
    );
    const actual = await domain.getDispatch(identity.context, prepared.id);
    const pricing = {
      version: 3 as const,
      currency: "EUR" as const,
      basis: "qualified_usage_ex_tax" as const,
      executionScope: "review_prepare_only" as const,
      routeQualification: "operator_authorized_test" as const,
      estimatedLowNanoeur: 1000000,
      estimatedHighNanoeur: 2000000,
      ceilingMinor: 200,
      fx: {
        numerator: 1,
        denominator: 1,
        date: "2026-09-22",
        source: "fixture",
      },
      settlement: {
        status: "not_reserved" as const,
        customerNanoeur: null,
        chargedMinor: null,
        settledAt: null,
      },
    };
    const projected = {
      ...actual,
      dispatch: {
        ...actual.dispatch,
        channel: "fax" as const,
        mode: "production" as const,
        faxPricing: pricing,
        quote_expires_at: "2099-01-01T00:00:00.000Z",
      },
    };
    const read = vi.spyOn(domain, "getDispatch").mockResolvedValue(projected);
    const list = vi.spyOn(domain, "listDispatches").mockResolvedValue({
      items: [projected.dispatch],
      nextCursor: null,
    });
    const approve = vi.spyOn(domain, "approveDispatch");
    const confirm = vi.spyOn(domain, "confirmDispatch");
    const renew = vi.spyOn(domain, "renewFaxQuote").mockResolvedValue({
      ...projected.dispatch,
      id: `dsp_${crypto.randomUUID()}`,
    });
    const route = `${env.APP_ORIGIN}/auth/mobile/review/${prepared.id}`;
    const browser = (action?: string) =>
      new Request(route, {
        method: action ? "POST" : "GET",
        headers: {
          Cookie: owner.cookie,
          ...(action
            ? {
                Origin: env.APP_ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
              }
            : {}),
        },
        ...(action
          ? {
              body: new URLSearchParams({
                csrf: owner.csrf,
                fingerprint: prepared.fingerprint,
                action,
                reviewed: "yes",
                sendConfirmed: "yes",
              }).toString(),
            }
          : {}),
      });
    try {
      const nativeDetail = (await (
        await call(`/dispatches/${prepared.id}`, token)
      ).json()) as { dispatch: { faxPricing: typeof pricing } };
      const nativeList = (await (await call("/dispatches", token)).json()) as {
        items: { faxPricing: typeof pricing }[];
      };
      expect(nativeDetail.dispatch.faxPricing.executionScope).toBe(
        "review_prepare_only",
      );
      expect(nativeList.items[0].faxPricing.executionScope).toBe(
        "review_prepare_only",
      );
      const page = await (await handleMobileRoute(
        browser(),
        env,
        domain,
        caps,
      ))!.text();
      expect(page).toContain("ne peut être ni approuvé ni envoyé");
      expect(page).toContain("Aucun montant n’est réservé ou débité");
      expect(page).not.toMatch(
        /value="(?:approve|confirm)"|Valider cette version|Confirmer l’envoi|plafond est réservé|crédit|recharg/i,
      );
      for (const action of ["approve", "confirm"]) {
        const response = (await handleMobileRoute(
          browser(action),
          env,
          domain,
          caps,
        ))!;
        expect(response.status).toBe(409);
        expect(await response.text()).toContain(
          "Ce devis est réservé à la consultation",
        );
      }
      expect(approve).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      read.mockResolvedValue({
        ...projected,
        dispatch: {
          ...projected.dispatch,
          quote_expires_at: "2020-01-01T00:00:00.000Z",
        },
      });
      const expired = await (await handleMobileRoute(
        browser(),
        env,
        domain,
        caps,
      ))!.text();
      expect(expired).toContain("Renouveler le devis</button>");
      const renewal = (await (
        await call(`/dispatches/${prepared.id}/renew-quote`, token, "POST", {})
      ).json()) as { faxPricing: typeof pricing };
      expect(renewal.faxPricing.executionScope).toBe("review_prepare_only");
      // The real domain's non-promotion guard is exercised by fax-review-preparation.test.ts.
      for (const table of ["approvals", "reservations", "attempts", "outbox"]) {
        expect(
          await db
            .prepare(
              `SELECT COUNT(*) AS n FROM ${table} WHERE organization_id=?`,
            )
            .bind(owner.org)
            .first(),
        ).toEqual({ n: 0 });
      }
    } finally {
      read.mockRestore();
      list.mockRestore();
      approve.mockRestore();
      confirm.mockRestore();
      renew.mockRestore();
    }
  });

  it("persists an idempotent deletion request without claiming completion or deleting business evidence", async () => {
    const { token } = await connect();
    expect(
      await (await call("/account/deletion-request", token)).json(),
    ).toEqual({ request: null });
    await expect(
      call("/account/deletion-request", token, "POST", { confirmed: false }),
    ).rejects.toThrow();
    const first = (await (
      await call("/account/deletion-request", token, "POST", {
        confirmed: true,
      })
    ).json()) as { id: string };
    const second = await (
      await call("/account/deletion-request", token, "POST", {
        confirmed: true,
      })
    ).json();
    expect(second).toMatchObject({
      id: first.id,
      status: "requested",
      completedAt: null,
    });
    expect(
      await db
        .prepare("SELECT 1 FROM users WHERE id=?")
        .bind(owner.userId)
        .first(),
    ).not.toBeNull();
    const other = await connect(outsider);
    expect(
      await (await call("/account/deletion-request", other.token)).json(),
    ).toEqual({ request: null });
  });
  it("mounts before MCP middleware, exposes no billing hints, and revokes native logout", async () => {
    const { token } = await connect();
    const mounted = await worker.fetch(req(prefix + "/session", token), env);
    expect(mounted.status).toBe(200);
    const capabilities = await (await call("/capabilities", token)).json();
    expect(capabilities).toMatchObject({
      nativeApproval: false,
      humanApproval: "authenticated_browser",
    });
    expect(JSON.stringify(capabilities)).not.toMatch(
      /billing|credit|topup|stripe/i,
    );
    expect((await worker.fetch(req("/api/session", token), env)).status).toBe(
      401,
    );
    expect(await (await call("/session", token, "DELETE")).json()).toEqual({
      signedOut: true,
    });
    await expect(call("/session", token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});
