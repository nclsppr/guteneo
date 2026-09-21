import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  authenticateMcp,
  hashSecret,
  type McpIdentity,
} from "../../apps/api/src/auth";
import {
  configurePostalSenderForMcp,
  getPostalSetupForMcp,
  handlePostalSetupRoute,
} from "../../apps/api/src/postal-setup";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers";
import worker from "../../apps/api/src/index";
import type { PostalSetup } from "../../packages/contracts/src/postal-setup";

let mf: Miniflare;
let db: D1Database;
let env: Env;
let org: string;
let otherOrg: string;
let beforeProfile: (() => Promise<void>) | undefined;
let country: string;
let position: string;
let calls: string[];
const issuer = "https://postal-setup-oauth-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "postal-setup",
  alg: "RS256",
  use: "sig",
};
const input = {
  name: "Atelier fictif",
  address: "12 rue du Test\nL-1234 Luxembourg",
};
const now = () => new Date().toISOString();
const providerFetch: Fetcher = async (url, init) => {
  const path = new URL(String(url)).pathname;
  calls.push(`${init?.method ?? "GET"} ${path}`);
  if (path === "/auth/access-tokens")
    return Response.json({
      access_token: "fixture-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "organisation_read",
    });
  if (path === "/organisations/pingen_org") {
    await beforeProfile?.();
    return Response.json({
      data: {
        id: "pingen_org",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: country,
          default_address_position: position,
        },
      },
    });
  }
  throw new Error("Unexpected provider operation in synthetic fixture");
};

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "postal-setup-oauth-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
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
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
    expect(statement.trim()).toBe("");
  }
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(async () => {
  org = `org_${crypto.randomUUID()}`;
  otherOrg = `org_${crypto.randomUUID()}`;
  beforeProfile = undefined;
  country = "LU";
  position = "left";
  calls = [];
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_AUDIENCE: "https://guteneo.example/mcp",
    AUTH0_CLIENT_ID: "fixture-browser-client",
    AUTH0_CLIENT_SECRET: "fixture-browser-secret",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "postal",
    POSTAL_DRAFTS_ENABLED: "true",
    PINGEN_SANDBOX: "false",
    PINGEN_CLIENT_ID: "fixture-client",
    PINGEN_CLIENT_SECRET: "fixture-secret",
    PINGEN_ORGANIZATION_ID: "pingen_org",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_WEBHOOK_SECRET: "fixture-webhook",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
    DOCUMENTS: {} as R2Bucket,
    DISPATCH_QUEUE: {} as Env["DISPATCH_QUEUE"],
    BULK_QUEUE: {} as Env["BULK_QUEUE"],
    ASSETS: {} as Env["ASSETS"],
  };
  for (const id of [org, otherOrg]) {
    const backup = `user_${crypto.randomUUID()}`;
    await db.batch([
      db
        .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
        .bind(id, now()),
      db.prepare("INSERT INTO channel_controls VALUES(?,'postal',0)").bind(id),
      db
        .prepare(
          "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
        )
        .bind(backup, now()),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(id, backup, now()),
    ]);
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (
      (url instanceof Request ? url.url : String(url)) ===
      `${issuer}.well-known/jwks.json`
    )
      return Response.json({ keys: [jwk] });
    throw new Error("Unexpected network access in synthetic fixture");
  });
});

type Principal = {
  identity: McpIdentity;
  connectionId: string;
  subject: string;
  clientId: string;
  scopes: string;
};
async function signedToken(
  subject: string,
  clientId: string,
  scopes: string,
  verified = true,
  mfa = true,
) {
  return new SignJWT({
    sub: subject,
    client_id: clientId,
    scope: scopes,
    amr: mfa ? ["mfa"] : ["pwd"],
    "https://guteneo.com/verified_account": verified,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
}
const authenticate = (token: string) =>
  authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
async function principal({
  organization = org,
  role = "admin",
  scopes = "documents:read dispatches:prepare",
} = {}): Promise<Principal> {
  const userId = `user_${crypto.randomUUID()}`;
  const subject = `auth0|${userId}`;
  const clientId = `client_${crypto.randomUUID()}`;
  const connectionId = crypto.randomUUID();
  const timestamp = new Date(Date.now() - 1000).toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
      )
      .bind(userId, timestamp),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,?,?)")
      .bind(organization, userId, role, timestamp),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, subject, userId, timestamp),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connectionId,
        issuer,
        userId,
        clientId,
        organization,
        timestamp,
        timestamp,
      ),
  ]);
  return {
    identity: await authenticate(await signedToken(subject, clientId, scopes)),
    connectionId,
    subject,
    clientId,
    scopes,
  };
}
async function refresh(p: Principal) {
  p.identity = await authenticate(
    await signedToken(p.subject, p.clientId, p.scopes),
  );
}
const configure = (p: Principal, fields = input) =>
  configurePostalSenderForMcp(p.identity, env, fields, {
    fetcher: providerFetch,
  });
async function count(table: string, organization = org) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(organization)
    .first<{ n: number }>())!.n;
}
async function revoke(p: Principal) {
  await db
    .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
    .bind(p.connectionId)
    .run();
}

function interceptSetupWrite(
  intercept: (statements: D1PreparedStatement[]) => Promise<D1Result[]>,
): D1Database {
  let writePrepared = false;
  return {
    prepare(query: string) {
      if (query.startsWith("INSERT INTO audit_log(")) writePrepared = true;
      return db.prepare(query);
    },
    batch(statements: D1PreparedStatement[]) {
      if (!writePrepared) return db.batch(statements);
      writePrepared = false;
      return intercept(statements);
    },
  } as D1Database;
}
async function expectUnconfigured() {
  for (const table of [
    "senders",
    "postal_sender_declarations",
    "postal_setup_policy_generations",
    "trusted_delivery_costs",
    "dispatches",
    "provider_drafts",
  ])
    expect(await count(table)).toBe(0);
  expect(
    await db
      .prepare(
        "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='postal'",
      )
      .bind(org)
      .first("enabled"),
  ).toBe(0);
}
async function browserRequest(
  p: Principal,
  {
    organization = p.identity.context.organizationId,
    path = "/api/postal/setup",
    body = { ...input, authorized: true } as object,
  } = {},
) {
  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64url");
  const csrf = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,0,0,?,?,1)",
    )
    .bind(
      await hashSecret(token),
      p.identity.context.userId,
      organization,
      csrf,
      now(),
      new Date(Date.now() + 3600000).toISOString(),
    )
    .run();
  return new Request(`${env.APP_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: env.APP_ORIGIN,
      Cookie: `__Host-guteneo_session=${token}`,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function rebind(p: Principal, organization: string) {
  const response = await worker.fetch(
    await browserRequest(p, {
      organization,
      path: "/api/connections",
      body: { clientId: p.clientId },
    }),
    { ...env, DB: db },
    {} as ExecutionContext,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    bound: true,
    reconnectRequired: true,
  });
}

describe("postal sender setup through current OAuth administrator authority", () => {
  it.each(["dispatches:read", "documents:read"])(
    "serves authenticated MCP capabilities with %s while respecting postal setup visibility",
    async (scope) => {
      await configure(await principal());
      const p = await principal({ scopes: scope });
      const before = calls.length;
      const response = await worker.fetch(
        new Request(`${env.APP_ORIGIN}/mcp`, {
          method: "POST",
          headers: {
            Host: new URL(env.APP_ORIGIN).hostname,
            Authorization: `Bearer ${p.identity.token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: { name: "get_capabilities", arguments: {} },
          }),
        }),
        env,
        {} as ExecutionContext,
      );
      const raw = await response.text();
      expect(response.status, raw).toBe(200);
      const payload = JSON.parse(
        raw.startsWith("event:") || raw.startsWith("data:")
          ? raw
              .split("\n")
              .find((line) => line.startsWith("data:"))!
              .slice(5)
          : raw,
      ) as {
        result: {
          isError?: boolean;
          structuredContent: {
            ok: boolean;
            data: {
              postal: {
                setup: PostalSetup | null;
                setupAccess: { available: boolean; requiredScope: string };
              };
            };
          };
        };
      };
      expect(payload.result.isError, raw).not.toBe(true);
      expect(payload.result.structuredContent.ok).toBe(true);
      const postal = payload.result.structuredContent.data.postal;
      expect(postal.setupAccess).toEqual({
        available: scope === "documents:read",
        requiredScope: "documents:read",
      });
      if (scope === "documents:read") {
        expect(postal.setup).toMatchObject({
          configured: true,
          canManage: false,
          sender: input,
        });
      } else {
        expect(postal.setup).toBeNull();
        expect(raw).not.toContain(input.name);
        expect(raw).not.toContain(input.address);
      }
      expect(calls).toHaveLength(before);
    },
  );

  it("records distinct immutable OAuth provenance and sixteen policies without transfer, sending, budget or delegation changes", async () => {
    const p = await principal();
    const grants = await count("welcome_credit_grants");
    const result = await configure(p);
    expect(result).toMatchObject({
      configured: true,
      canManage: true,
      channelEnabled: true,
      senderVerification: "oauth_administrator_submission",
      sender: { ...input, status: "verified" },
    });
    expect(calls).toEqual([
      "POST /auth/access-tokens",
      "GET /organisations/pingen_org",
    ]);
    expect(await count("senders")).toBe(1);
    expect(await count("trusted_delivery_costs")).toBe(16);
    expect(await count("welcome_credit_grants")).toBe(grants);
    for (const table of [
      "dispatches",
      "provider_drafts",
      "expert_approval_policies",
    ])
      expect(await count(table)).toBe(0);
    const declaration = await db
      .prepare(
        "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
      )
      .bind(org)
      .first();
    expect(declaration).toMatchObject({
      user_id: p.identity.context.userId,
      authorization_basis: "authenticated_administrator_declaration",
      physical_address_verified: 0,
      submission_origin: "oauth_administrator_submission",
      oauth_client_id: p.clientId,
      oauth_connection_id_snapshot: p.connectionId,
      oauth_issuer: issuer,
      oauth_authorization_revision:
        p.identity.connectionObservation!.authorizationRevision,
    });
    const audit = await db
      .prepare(
        "SELECT details_json FROM audit_log WHERE organization_id=? AND action='postal.sender.declared'",
      )
      .bind(org)
      .first<string>("details_json");
    expect(JSON.parse(audit!)).toMatchObject({
      authorizationBasis: "oauth_administrator_submission",
      humanConsentClaimed: false,
      physicalAddressVerified: false,
    });
    for (const secret of [
      input.name,
      input.address,
      p.identity.token,
      "fixture-secret",
    ])
      expect(audit).not.toContain(secret);
    await expect(
      db
        .prepare(
          "UPDATE postal_sender_declarations SET submission_origin='browser_administrator_declaration' WHERE organization_id=?",
        )
        .bind(org)
        .run(),
    ).rejects.toThrow("immutable_postal_sender_declaration");
    await expect(
      db
        .prepare(
          "DELETE FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .run(),
    ).rejects.toThrow("immutable_postal_sender_declaration");
  });

  it("reports read-only status and exact role/scope capabilities without provider calls", async () => {
    for (const role of ["member", "viewer"]) {
      const p = await principal({ role });
      expect(await getPostalSetupForMcp(p.identity, env)).toMatchObject({
        configured: false,
        canManage: false,
        reason: "setup_required",
      });
    }
    const readOnly = await principal({ scopes: "documents:read" });
    expect(await getPostalSetupForMcp(readOnly.identity, env)).toMatchObject({
      canManage: false,
    });
    const admin = await principal();
    expect(await getPostalSetupForMcp(admin.identity, env)).toMatchObject({
      canManage: true,
    });
    expect(calls).toEqual([]);
    await expectUnconfigured();
  });

  it("requires a signed scope and current admin role, rejecting claimed consent and caller-controlled authority fields", async () => {
    for (const role of ["member", "viewer"])
      await expect(configure(await principal({ role }))).rejects.toMatchObject({
        code: "POSTAL_SENDER_ADMIN_REQUIRED",
      });
    const readonly = await principal({ scopes: "documents:read" });
    await expect(configure(readonly)).rejects.toMatchObject({
      code: "INSUFFICIENT_SCOPE",
    });
    readonly.identity.scopes.push("dispatches:prepare");
    await expect(configure(readonly)).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
    const p = await principal();
    for (const extra of [
      { authorized: true },
      { organizationId: otherOrg },
      { clientId: "invented" },
      { senderId: "invented" },
      { priceMinor: 1 },
    ])
      await expect(configure(p, { ...input, ...extra })).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    expect(calls).toEqual([]);
    await expectUnconfigured();
  });

  it("keeps tenant identities isolated and supports independent existing accounts", async () => {
    const p = await principal();
    const outsider = await principal({ organization: otherOrg });
    const a = await configure(p);
    expect(await getPostalSetupForMcp(outsider.identity, env)).toMatchObject({
      configured: false,
      senderVerification: null,
    });
    const b = await configure(outsider, {
      ...input,
      name: "Autre atelier fictif",
    });
    expect(a.sender!.id).not.toBe(b.sender!.id);
    expect(await count("senders", otherOrg)).toBe(1);
    expect((await getPostalSetupForMcp(p.identity, env)).sender!.name).toBe(
      input.name,
    );
  });

  it("preserves historical tenant provenance when the same live OAuth connection is rebound through the browser", async () => {
    const p = await principal();
    const a = await configure(p);
    const before = await db
      .prepare(
        "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
      )
      .bind(org)
      .first();
    await db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(otherOrg, p.identity.context.userId, now())
      .run();
    await rebind(p, otherOrg);
    expect(
      await db
        .prepare(
          "SELECT organization_id FROM authorized_connections WHERE id=?",
        )
        .bind(p.connectionId)
        .first("organization_id"),
    ).toBe(otherOrg);
    expect(
      await db
        .prepare(
          "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .first(),
    ).toEqual(before);
    await expect(configure(p)).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
    await expect(getPostalSetupForMcp(p.identity, env)).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
    await refresh(p);
    expect(p.identity.context.organizationId).toBe(otherOrg);
    expect(await getPostalSetupForMcp(p.identity, env)).toMatchObject({
      configured: false,
      senderVerification: null,
    });
    const b = await configure(p, { ...input, name: "Atelier B fictif" });
    expect(b.sender!.id).not.toBe(a.sender!.id);
    const after = await db
      .prepare(
        "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
      )
      .bind(otherOrg)
      .first();
    expect(after).toMatchObject({
      organization_id: otherOrg,
      user_id: p.identity.context.userId,
      oauth_issuer: issuer,
      oauth_client_id: p.clientId,
      oauth_connection_id_snapshot: p.connectionId,
      oauth_authorization_revision:
        p.identity.connectionObservation!.authorizationRevision,
    });
    expect(after!.oauth_authorization_revision).not.toBe(
      before!.oauth_authorization_revision,
    );
    expect(
      await db
        .prepare(
          "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .first(),
    ).toEqual(before);
    const aReader = await principal({ scopes: "documents:read" });
    expect((await getPostalSetupForMcp(aReader.identity, env)).sender!.id).toBe(
      a.sender!.id,
    );
    expect(
      (
        await db
          .prepare("PRAGMA foreign_key_list(postal_sender_declarations)")
          .all<{ table: string }>()
      ).results.some((key) => key.table === "authorized_connections"),
    ).toBe(false);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });

  it.each(["provider", "transaction"] as const)(
    "rejects an A-to-B-to-A rebind during %s even when timestamps are identical",
    async (stage) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now());
      const p = await principal();
      await db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(otherOrg, p.identity.context.userId, now())
        .run();
      await db
        .prepare(
          "UPDATE authorized_connections SET not_before=?,updated_at=? WHERE id=?",
        )
        .bind(Math.floor(Date.now() / 1000), now(), p.connectionId)
        .run();
      await refresh(p);
      const original = await db
        .prepare("SELECT * FROM authorized_connections WHERE id=?")
        .bind(p.connectionId)
        .first();
      const originalRevision =
        p.identity.connectionObservation!.authorizationRevision;
      const change = async () => {
        await rebind(p, otherOrg);
        await rebind(p, org);
      };
      if (stage === "provider") beforeProfile = change;
      else
        env.DB = interceptSetupWrite(async (statements) => {
          await change();
          return db.batch(statements);
        });
      await expect(configure(p)).rejects.toMatchObject({
        code: "POSTAL_AUTHORITY_CHANGED",
      });
      expect(
        await db
          .prepare("SELECT * FROM authorized_connections WHERE id=?")
          .bind(p.connectionId)
          .first(),
      ).toEqual(original);
      expect(
        await db
          .prepare(
            "SELECT authorization_revision FROM connection_tool_observations WHERE connection_id=? AND organization_id=?",
          )
          .bind(p.connectionId, org)
          .first("authorization_revision"),
      ).toBe(originalRevision + 2);
      await expectUnconfigured();
    },
  );

  it.each(["issuer", "connection", "revision", "tenant"] as const)(
    "rejects a forged %s in persisted OAuth declaration snapshots",
    async (forged) => {
      const p = await principal();
      const outsider = await principal({ organization: otherOrg });
      const senderId = `sender_${crypto.randomUUID()}`;
      const auditId = `audit_${crypto.randomUUID()}`;
      await db.batch([
        db
          .prepare(
            "INSERT INTO senders VALUES(?,?,'postal',?,?,'verified','production',?)",
          )
          .bind(senderId, org, input.name, input.address, now()),
        db
          .prepare(
            "INSERT INTO audit_log VALUES(?,?,?,'postal.sender.declared',?,'{}',?)",
          )
          .bind(auditId, org, p.identity.context.userId, senderId, now()),
      ]);
      await expect(
        db
          .prepare(
            "INSERT INTO postal_sender_declarations(organization_id,sender_id,user_id,sender_name,sender_address,authorization_basis,physical_address_verified,profile_json,audit_id,created_at,submission_origin,oauth_client_id,oauth_connection_id_snapshot,oauth_issuer,oauth_authorization_revision) VALUES(?,?,?,?,?,'authenticated_administrator_declaration',0,'{}',?,?,'oauth_administrator_submission',?,?,?,?)",
          )
          .bind(
            org,
            senderId,
            forged === "tenant"
              ? outsider.identity.context.userId
              : p.identity.context.userId,
            input.name,
            input.address,
            auditId,
            now(),
            forged === "tenant" ? outsider.clientId : p.clientId,
            forged === "connection"
              ? "invented"
              : forged === "tenant"
                ? outsider.connectionId
                : p.connectionId,
            forged === "issuer" ? "https://other-identity.example/" : issuer,
            p.identity.connectionObservation!.authorizationRevision +
              Number(forged === "revision"),
          )
          .run(),
      ).rejects.toThrow("invalid_postal_sender_submission");
      expect(await count("postal_sender_declarations")).toBe(0);
    },
  );

  it("deduplicates concurrent browser and OAuth submissions and preserves the winning provenance", async () => {
    const p = await principal();
    const results = await Promise.all([
      configure(p),
      configure(p),
      handlePostalSetupRoute(await browserRequest(p), env, {
        fetcher: providerFetch,
      }),
    ]);
    expect(results).toHaveLength(3);
    expect(await count("senders")).toBe(1);
    expect(await count("trusted_delivery_costs")).toBe(16);
    expect(await count("postal_sender_declarations")).toBe(1);
    const provenance = (await getPostalSetupForMcp(p.identity, env))
      .senderVerification;
    const before = calls.length;
    expect((await configure(p)).senderVerification).toBe(provenance);
    expect(calls).toHaveLength(before);
    await expect(
      configure(p, { ...input, address: "99 autre rue\nL-2222 Luxembourg" }),
    ).rejects.toMatchObject({ code: "POSTAL_SENDER_EXISTS" });
  });

  it.each(["configured", "stopped"] as const)(
    "reads a coherent setup when another browser request commits %s after the declaration read",
    async (outcome) => {
      const p = await principal();
      const winnerRequest = await browserRequest(p);
      let injected = false;
      let winner: PostalSetup | undefined;
      const commitWinner = async () => {
        if (injected) return;
        injected = true;
        const response = await handlePostalSetupRoute(
          winnerRequest,
          { ...env, DB: db },
          { fetcher: providerFetch },
        );
        winner = (await response!.json()) as PostalSetup;
        if (outcome === "stopped")
          await db
            .prepare(
              "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='postal'",
            )
            .bind(org)
            .run();
      };
      env.DB = {
        prepare(query: string) {
          const statement = db.prepare(query);
          if (!query.startsWith("SELECT sender_id,sender_name"))
            return statement;
          return new Proxy(statement, {
            get(target, property) {
              if (property !== "bind") return Reflect.get(target, property);
              return (...args: (string | number | null)[]) => {
                const bound = statement.bind(...args);
                return new Proxy(bound, {
                  get(targetBound, method) {
                    if (method !== "first")
                      return Reflect.get(targetBound, method);
                    return async () => {
                      const result = await bound.first();
                      // Reproduces the old torn read: no declaration before commit,
                      // but the next separate sender query can see the winner.
                      await commitWinner();
                      return result;
                    };
                  },
                });
              };
            },
          });
        },
        async batch(statements: D1PreparedStatement[]) {
          const result = await db.batch(statements);
          // The fixed reader observes the complete pre-commit snapshot instead.
          // The winner commits only after that read transaction has completed.
          await commitWinner();
          return result;
        },
      } as D1Database;
      if (outcome === "configured") {
        const result = await configure(p);
        expect(result).toMatchObject({
          configured: true,
          channelEnabled: true,
          senderVerification: "administrator_declaration",
          sender: { id: winner!.sender!.id },
        });
      } else {
        await expect(configure(p)).rejects.toMatchObject({
          code: "ACCESS_CHANGED",
        });
      }
      expect(injected).toBe(true);
      expect(await count("senders")).toBe(1);
      expect(await count("postal_sender_declarations")).toBe(1);
      expect(await count("postal_setup_policy_generations")).toBe(1);
      expect(await count("trusted_delivery_costs")).toBe(16);
      expect(
        await db
          .prepare(
            "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='postal'",
          )
          .bind(org)
          .first("enabled"),
      ).toBe(Number(outcome === "configured"));
    },
  );

  it.each(["revoked", "expired", "demoted", "rebound", "revision"] as const)(
    "fails closed when OAuth authority is %s while the provider profile is inspected",
    async (change) => {
      const p = await principal();
      beforeProfile = async () => {
        if (change === "revoked") await revoke(p);
        if (change === "expired") {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(Date.now() + 3600000);
        }
        if (change === "demoted")
          await db
            .prepare(
              "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
            )
            .bind(org, p.identity.context.userId)
            .run();
        if (change === "revision")
          await db
            .prepare(
              "UPDATE authorized_connections SET updated_at=? WHERE id=?",
            )
            .bind(new Date(Date.now() + 1000).toISOString(), p.connectionId)
            .run();
        if (change === "rebound") {
          await db
            .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
            .bind(otherOrg, p.identity.context.userId, now())
            .run();
          await db
            .prepare(
              "UPDATE authorized_connections SET organization_id=? WHERE id=?",
            )
            .bind(otherOrg, p.connectionId)
            .run();
        }
      };
      await expect(configure(p)).rejects.toThrow();
      await expectUnconfigured();
      expect(await count("senders", otherOrg)).toBe(0);
    },
  );

  it("fences a connection revocation at the SQL transaction boundary after asynchronous checks", async () => {
    const p = await principal();
    env.DB = interceptSetupWrite(async (statements) => {
      await revoke(p);
      return db.batch(statements);
    });
    await expect(configure(p)).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
    await expectUnconfigured();
  });

  it("captures caller identity and input fields before awaited provider inspection", async () => {
    const p = await principal();
    const originalUser = p.identity.context.userId;
    const fields = { ...input };
    beforeProfile = async () => {
      p.identity.context.organizationId = otherOrg;
      p.identity.context.userId = "invented";
      p.identity.clientId = "invented";
      p.identity.scopes.length = 0;
      fields.name = "Changed during request";
    };
    const result = await configure(p, fields);
    expect(result.sender!.name).toBe(input.name);
    expect(await count("senders", otherOrg)).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT user_id FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .first("user_id"),
    ).toBe(originalUser);
  });

  it.each(["read", "replay"] as const)(
    "reauthenticates before returning %s results after concurrent revocation",
    async (operation) => {
      const p = await principal();
      await configure(p);
      const before = calls.length;
      let intercepted = false;
      env.DB = {
        prepare: db.prepare.bind(db),
        async batch(statements: D1PreparedStatement[]) {
          const result = await db.batch(statements);
          // Revoke after the coherent read completes, before its result returns.
          if (!intercepted) {
            intercepted = true;
            await revoke(p);
          }
          return result;
        },
      } as D1Database;
      await expect(
        operation === "read"
          ? getPostalSetupForMcp(p.identity, env)
          : configure(p),
      ).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
      expect(intercepted).toBe(true);
      expect(calls).toHaveLength(before);
      expect(await count("senders")).toBe(1);
    },
  );

  it("never clears a postal operator stop, including one racing the initial declaration", async () => {
    const p = await principal();
    beforeProfile = async () => {
      await db
        .prepare(
          "INSERT INTO audit_log VALUES(?,?,?,'channel.control','postal','{\"enabled\":false}',?)",
        )
        .bind(crypto.randomUUID(), org, p.identity.context.userId, now())
        .run();
    };
    await expect(configure(p)).rejects.toMatchObject({
      code: "ACCESS_CHANGED",
    });
    await expectUnconfigured();
    beforeProfile = undefined;
    await expect(configure(p)).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
  });

  it("leaves unrelated channel stops untouched", async () => {
    const p = await principal();
    await db.batch([
      db.prepare("INSERT INTO channel_controls VALUES(?,'email',0)").bind(org),
      db
        .prepare(
          "INSERT INTO audit_log VALUES(?,?,?,'channel.control','email','{\"enabled\":false}',?)",
        )
        .bind(crypto.randomUUID(), org, p.identity.context.userId, now()),
    ]);
    expect((await configure(p)).configured).toBe(true);
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
        )
        .bind(org)
        .first("enabled"),
    ).toBe(0);
  });

  it.each(["disabled", "channel", "revoked"] as const)(
    "does not restore %s configuration on repeated submissions",
    async (stop) => {
      const p = await principal();
      await configure(p);
      if (stop === "disabled")
        await db
          .prepare(
            "UPDATE senders SET status='disabled' WHERE organization_id=?",
          )
          .bind(org)
          .run();
      if (stop === "channel")
        await db
          .prepare(
            "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='postal'",
          )
          .bind(org)
          .run();
      if (stop === "revoked")
        await db
          .prepare(
            "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=?",
          )
          .bind(org)
          .run();
      await expect(configure(p)).rejects.toMatchObject({
        code: "POSTAL_SETUP_REVIEW_REQUIRED",
      });
      expect(await count("trusted_delivery_costs")).toBe(16);
    },
  );

  it("renews only by explicit write, preserving the browser declaration and recording the OAuth renewal authority", async () => {
    const p = await principal();
    await handlePostalSetupRoute(await browserRequest(p), env, {
      fetcher: providerFetch,
    });
    const original = await db
      .prepare(
        "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
      )
      .bind(org)
      .first();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 91 * 86400000);
    await refresh(p);
    const before = calls.length;
    expect(await getPostalSetupForMcp(p.identity, env)).toMatchObject({
      configured: false,
      reason: "pricing_expired",
      senderVerification: "administrator_declaration",
    });
    expect(await count("trusted_delivery_costs")).toBe(16);
    expect(calls).toHaveLength(before);
    expect(await configure(p)).toMatchObject({
      configured: true,
      senderVerification: "administrator_declaration",
    });
    expect(await count("trusted_delivery_costs")).toBe(32);
    expect(await count("postal_setup_policy_generations")).toBe(2);
    expect(
      await db
        .prepare(
          "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .first(),
    ).toEqual(original);
    const audit = await db
      .prepare(
        "SELECT details_json FROM audit_log WHERE organization_id=? AND action='postal.setup.pricing_renewed'",
      )
      .bind(org)
      .first<string>("details_json");
    expect(JSON.parse(audit!)).toMatchObject({
      authorizationBasis: "oauth_administrator_submission",
      oauthAuthoritySnapshot: {
        issuer,
        organizationId: org,
        userId: p.identity.context.userId,
        clientId: p.clientId,
        connectionId: p.connectionId,
        authorizationRevision:
          p.identity.connectionObservation!.authorizationRevision,
      },
      humanConsentClaimed: false,
    });
    await configure(p);
    expect(await count("trusted_delivery_costs")).toBe(32);
  });

  it.each(["profile", "revocation"] as const)(
    "rejects expired-price renewal after %s changes",
    async (change) => {
      const p = await principal();
      await configure(p);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 91 * 86400000);
      await refresh(p);
      if (change === "profile") position = "right";
      else
        await db
          .prepare(
            "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=?",
          )
          .bind(org)
          .run();
      await expect(configure(p)).rejects.toMatchObject({
        code: "POSTAL_SETUP_REVIEW_REQUIRED",
      });
      expect(await count("trusted_delivery_costs")).toBe(16);
    },
  );

  it("rolls back the sender, evidence and pricing if any statement fails", async () => {
    const p = await principal();
    env.DB = interceptSetupWrite((statements) =>
      db.batch([
        ...statements,
        db.prepare("INSERT INTO missing_table VALUES(1)"),
      ]),
    );
    await expect(configure(p)).rejects.toThrow();
    await expectUnconfigured();
  });

  it("fails closed for invalid production/provider configuration without creating a sender", async () => {
    const p = await principal();
    env.PINGEN_WEBHOOK_SECRET = "";
    await expect(configure(p)).rejects.toMatchObject({
      code: "POSTAL_SETUP_UNAVAILABLE",
    });
    expect(calls).toEqual([]);
    env.PINGEN_WEBHOOK_SECRET = "fixture-webhook";
    country = "FR";
    await expect(configure(p)).rejects.toMatchObject({
      code: "POSTAL_PROFILE_UNQUALIFIED",
    });
    env.MODE = "simulation";
    await expect(configure(p)).rejects.toMatchObject({
      code: "POSTAL_SETUP_UNAVAILABLE",
    });
    await expectUnconfigured();
  });
});
