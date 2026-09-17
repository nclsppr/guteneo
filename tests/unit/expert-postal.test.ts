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
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  authenticateMcp,
  hashSecret,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { expertPostalAuthority } from "../../apps/api/src/expert-approval";
import {
  postalBrowserAuthority,
  postalMcpAuthority,
} from "../../apps/api/src/postal-authority";
import { PostalService } from "../../apps/api/src/postal";
import { preparePostalDraft } from "../../apps/api/src/live-providers";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers";
import type {
  PostalReview,
  PostalReviewInput,
} from "../../packages/contracts/src/postal-review";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";

const issuer = "https://expert-postal-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "expert-postal",
  alg: "RS256",
  use: "sig",
};
const now = () => new Date().toISOString();
const later = () => new Date(Date.now() + 3600000).toISOString();
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let mf: Miniflare,
  db: D1Database,
  env: Env,
  domain: DomainService,
  service: PostalService;
let ctx: ActorContext,
  identity: McpIdentity,
  connection: string,
  input: PostalReviewInput;
let bytes: Uint8Array<ArrayBuffer>, hash: string, ready: PostalReview;
let calls: {
  path: string;
  method: string;
  body: BodyInit | null | undefined;
}[];
let beforeUploadLocation: (() => Promise<void>) | undefined;

const provider: Fetcher = async (url, init) => {
  const parsed = new URL(String(url));
  const method = init?.method ?? "GET";
  calls.push({ path: parsed.pathname, method, body: init?.body });
  if (parsed.pathname === "/auth/access-tokens")
    return Response.json({
      access_token: "fixture-access",
      token_type: "Bearer",
      expires_in: 3600,
    });
  if (parsed.pathname === "/organisations/fixture-pingen")
    return Response.json({
      data: {
        id: "fixture-pingen",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: "LU",
          default_address_position: "left",
        },
      },
    });
  if (parsed.pathname === "/file-upload") {
    await beforeUploadLocation?.();
    return Response.json({
      data: {
        attributes: {
          url: "https://upload.pingen.example/fixture.pdf?signature=synthetic",
          url_signature: "fixture-signature",
        },
      },
    });
  }
  if (parsed.origin === "https://upload.pingen.example" && method === "PUT") {
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(bytes);
    return new Response(null, { status: 200 });
  }
  if (
    parsed.pathname === "/organisations/fixture-pingen/deliveries/letters" &&
    method === "POST"
  )
    return Response.json(
      { data: { id: `draft-${connection}`, attributes: { status: "draft" } } },
      { status: 201 },
    );
  throw new Error(
    "Unexpected fixture provider operation: no live network allowed",
  );
};
const transfers = () =>
  calls.filter((c) => c.method === "PUT" || c.path.endsWith("/letters"));

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    let statement = "",
      trigger = false;
    const statements: D1PreparedStatement[] = [];
    for (const raw of (
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      )
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += line + "\n";
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        statements.push(db.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    expect(statement.trim()).toBe("");
    if (statements.length) await db.batch(statements);
  }
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  bytes = new Uint8Array(await pdf.save());
  hash = await sha256(bytes);
});
afterAll(async () => mf?.dispose());
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const suffix = crypto.randomUUID();
  ctx = {
    organizationId: `org_${suffix}`,
    userId: `usr_${suffix}`,
    role: "admin",
    actor: "mcp",
  };
  connection = crypto.randomUUID();
  calls = [];
  beforeUploadLocation = undefined;
  env = {
    DB: db,
    DOCUMENTS: (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_AUDIENCE: "https://guteneo.example/mcp",
    AUTH0_CLIENT_ID: "browser-fixture",
    AUTH0_CLIENT_SECRET: "fixture-secret",
    AUTH0_AUTH_POLICY: "verified_email",
    POSTAL_DRAFTS_ENABLED: "true",
    LIVE_SENDS_ENABLED: "false",
    PINGEN_CLIENT_ID: "fixture-client",
    PINGEN_CLIENT_SECRET: "fixture-secret",
    PINGEN_ORGANIZATION_ID: "fixture-pingen",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_SANDBOX: "false",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
  } as Env;
  const date = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Postal expert fixture','production',?)",
      )
      .bind(ctx.organizationId, date),
    db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
      )
      .bind(ctx.userId, date),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(ctx.organizationId, ctx.userId, date),
    db
      .prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,20,20971520,20)",
      )
      .bind(ctx.organizationId),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'postal','Fixture','Fixture return address','verified','production',?)",
      )
      .bind(`sender_${suffix}`, ctx.organizationId, date),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, `auth0|${ctx.userId}`, ctx.userId, date),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connection,
        issuer,
        ctx.userId,
        "expert-postal-client",
        ctx.organizationId,
        date,
        date,
      ),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (value) => {
    const url = value instanceof Request ? value.url : String(value);
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error(
      "No external network permitted by the expert postal fixture",
    );
  });
  const token = await new SignJWT({
    sub: `auth0|${ctx.userId}`,
    client_id: "expert-postal-client",
    scope:
      "documents:read documents:write dispatches:read dispatches:prepare dispatches:send",
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
  identity = await authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  domain = new DomainService(db, { mode: "production" });
  const storageKey = `${ctx.organizationId}/fixture.pdf`;
  await env.DOCUMENTS.put(storageKey, bytes);
  await domain.registerDocument(ctx, {
    id: `doc_${suffix}`,
    name: "fixture.pdf",
    sha256: hash,
    pages: 1,
    size: bytes.length,
    status: "ready",
    source: "import",
    storageKey,
    scanVerified: true,
  });
  input = {
    documentId: `doc_${suffix}`,
    senderId: `sender_${suffix}`,
    recipient: {
      name: "ATELIER EXEMPLE",
      line1: "Rue du Test 12",
      postalCode: "L-1234",
      city: "LUXEMBOURG",
      country: "LU",
    },
    options: {
      deliveryProduct: "cheap",
      printMode: "simplex",
      printSpectrum: "grayscale",
    },
    ceilingMinor: 500,
  };
  env.DOCUMENT_RENDERER = {
    fetch: async (request: Request) => {
      expect(request.headers.get("X-Guteneo-Source-Sha256")).toBe(hash);
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      return Response.json({
        version: PINGEN_PREFLIGHT_VERSION,
        status: "review_required",
        sha256: hash,
        pages: 1,
        canSend: false,
        issues: [],
        requiredReviews: ["printed_recipient_matches"],
        rendering: {
          dpi: 144,
          complete: true,
          pages: [
            {
              page: 1,
              width: 1191,
              height: 1684,
              rasterSha256: "a".repeat(64),
            },
          ],
        },
        address: {
          lines: ["ATELIER EXEMPLE", "Rue du Test 12", "L-1234 LUXEMBOURG"],
          issues: [],
          textVisibility: "not_verified",
          crop: {
            pngBase64: png,
            width: 1,
            height: 1,
            boundsMm: { x: 20, y: 50, width: 90, height: 40 },
          },
        },
      });
    },
  } as unknown as Env["DOCUMENT_RENDERER"];
  service = new PostalService(env, domain, { fetcher: provider });
  ready = await service.create(
    await postalMcpAuthority(identity, env, "dispatches:prepare"),
    input,
    crypto.randomUUID(),
  );
  expect(ready.transferStatus).toBe("not_started");
  expect(transfers()).toHaveLength(0);
  calls = [];
});
async function grant(channels = '["postal"]') {
  await db
    .prepare(
      "INSERT INTO expert_approval_policies VALUES(?,?,?,1,1,?,500,1000,5,?,?,?)",
    )
    .bind(
      connection,
      ctx.organizationId,
      ctx.userId,
      channels,
      later(),
      now(),
      now(),
    )
    .run();
}
const delegated = () =>
  expertPostalAuthority(identity, env, ready.id, ready.fingerprint!);
const consent = { reviewed: true, consentToTransfer: true } as const;
const storedConsent = () =>
  db
    .prepare(
      "SELECT consent_kind,expert_connection_id,expert_policy_revision,fingerprint FROM postal_transfer_consents WHERE organization_id=? AND preflight_id=?",
    )
    .bind(ctx.organizationId, ready.id)
    .first();

describe("expert postal transfer authority", () => {
  it("transfers exact reviewed bytes once under a distinct delegated consent and never sends a letter", async () => {
    await grant();
    const authority = await delegated();
    const result = await service.transfer(authority, ready.id, consent);
    expect(result.transferStatus).toBe("prepared");
    expect(await storedConsent()).toEqual({
      consent_kind: "expert",
      expert_connection_id: connection,
      expert_policy_revision: 1,
      fingerprint: ready.fingerprint,
    });
    expect(transfers()).toHaveLength(2);
    const letter = JSON.parse(
      String(transfers().find((c) => c.method === "POST")!.body),
    );
    expect(letter.data.attributes.auto_send).toBe(false);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await service.transfer(authority, ready.id, consent);
    expect(transfers()).toHaveLength(2);
    for (const table of ["dispatches", "outbox"])
      expect(
        await db
          .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
          .bind(ctx.organizationId)
          .first(),
      ).toEqual({ n: 0 });
  });

  it.each([undefined, '["email"]'])(
    "refuses a missing or non-postal grant before any provider request (%s)",
    async (channels) => {
      if (channels) await grant(channels);
      await expect(delegated()).rejects.toMatchObject({
        code: channels ? "EXPERT_CHANNEL_DISABLED" : "EXPERT_OPT_IN_REQUIRED",
      });
      expect(calls).toHaveLength(0);
      expect(await storedConsent()).toBeNull();
    },
  );

  it("binds authority to the precise preflight fingerprint before any provider request", async () => {
    await grant();
    await expect(
      expertPostalAuthority(identity, env, ready.id, "0".repeat(64)),
    ).rejects.toMatchObject({ code: "EXPERT_REVIEW_INVALID" });
    expect(calls).toHaveLength(0);
    expect(await storedConsent()).toBeNull();
  });

  it("does not widen the draft bridge to an ordinary MCP identity with a grant but no server credential closure", async () => {
    await grant();
    const beforeTransfer = vi.fn(async () => undefined);
    await expect(
      preparePostalDraft(
        env,
        domain,
        ctx,
        {
          ...input,
          options: { ...input.options, addressPosition: "left" },
          preflightId: ready.id,
          idempotencyKey: ready.id,
        },
        { fetcher: provider, beforeTransfer },
      ),
    ).rejects.toMatchObject({ code: "HUMAN_DOCUMENT_TRANSFER_REQUIRED" });
    expect(beforeTransfer).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(await storedConsent()).toBeNull();
  });

  it.each(["role", "policy", "connection"] as const)(
    "rechecks a changed %s after authority creation and before provider access",
    async (changed) => {
      await grant();
      const authority = await delegated();
      if (changed === "role") {
        const otherAdmin = `usr_${crypto.randomUUID()}`;
        await db.batch([
          db
            .prepare(
              "INSERT INTO users VALUES(?,'Second admin','second@example.invalid',?)",
            )
            .bind(otherAdmin, now()),
          db
            .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
            .bind(ctx.organizationId, otherAdmin, now()),
        ]);
        await db
          .prepare(
            "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
          )
          .bind(ctx.organizationId, ctx.userId)
          .run();
      }
      if (changed === "policy")
        await db
          .prepare(
            "UPDATE expert_approval_policies SET enabled=0,revision=revision+1,updated_at=? WHERE connection_id=?",
          )
          .bind(now(), connection)
          .run();
      if (changed === "connection")
        await db
          .prepare(
            "UPDATE authorized_connections SET status='revoked',updated_at=? WHERE id=?",
          )
          .bind(now(), connection)
          .run();
      await expect(
        service.transfer(authority, ready.id, consent),
      ).rejects.toBeInstanceOf(Error);
      expect(calls).toHaveLength(0);
      expect(await storedConsent()).toBeNull();
    },
  );

  it("revocation after the signed upload location prevents bytes and keeps uncertainty closed to replay", async () => {
    await grant();
    const authority = await delegated();
    beforeUploadLocation = async () => {
      await db
        .prepare(
          "UPDATE expert_approval_policies SET enabled=0,revision=revision+1,updated_at=? WHERE connection_id=?",
        )
        .bind(now(), connection)
        .run();
    };
    await expect(
      service.transfer(authority, ready.id, consent),
    ).rejects.toBeInstanceOf(Error);
    expect(calls.some((c) => c.path === "/file-upload")).toBe(true);
    expect(transfers()).toHaveLength(0);
    expect(
      await db
        .prepare("SELECT transfer_status FROM postal_preflights WHERE id=?")
        .bind(ready.id)
        .first(),
    ).toEqual({ transfer_status: "unknown" });
    beforeUploadLocation = undefined;
    await db
      .prepare(
        "UPDATE expert_approval_policies SET enabled=1,revision=revision+1,updated_at=? WHERE connection_id=?",
      )
      .bind(now(), connection)
      .run();
    const replay = await service.transfer(await delegated(), ready.id, consent);
    expect(replay.transferStatus).toBe("unknown");
    expect(transfers()).toHaveLength(0);
  });

  it("keeps browser consent separate even when that user has an active expert grant", async () => {
    await grant();
    const secret = "b".repeat(43);
    await db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture-csrf',0,0,?,?,1)",
      )
      .bind(
        await hashSecret(secret),
        ctx.userId,
        ctx.organizationId,
        now(),
        later(),
      )
      .run();
    const authority = await postalBrowserAuthority(
      new Request(
        `${env.APP_ORIGIN}/api/postal/preflights/${ready.id}/transfer`,
        {
          method: "POST",
          headers: {
            Cookie: `__Host-guteneo_session=${secret}`,
            Origin: env.APP_ORIGIN,
            "X-CSRF-Token": "fixture-csrf",
          },
        },
      ),
      env,
    );
    expect(
      (await service.transfer(authority, ready.id, consent)).transferStatus,
    ).toBe("prepared");
    expect(await storedConsent()).toEqual({
      consent_kind: "browser",
      expert_connection_id: null,
      expert_policy_revision: null,
      fingerprint: ready.fingerprint,
    });
  });
});
