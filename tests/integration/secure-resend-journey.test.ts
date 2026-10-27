import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { chromium } from "@playwright/test";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { loadPdfScripts } from "../../apps/documents/pdfjs-assets.mjs";
import { handleExpertReviewPages } from "../../apps/documents/src/expert-review";
import {
  authenticateBrowser,
  authenticateMcp,
  authenticatePersonalBrowser,
  createSession,
  memberships,
  MCP_SCOPES,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { DocumentService } from "../../apps/api/src/documents";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { postalMcpAuthority } from "../../apps/api/src/postal-authority";
import type { Env } from "../../apps/api/src/env";
import { createLiveProviderHook } from "../../apps/api/src/live-providers";
import {
  SecureDistributionService,
  type SecurePreparationAuthority,
} from "../../apps/api/src/secure-distributions";
import { handleWebhook } from "../../apps/api/src/webhooks";
import {
  DomainService,
  canonicalJson,
  sha256,
} from "../../packages/domain/src/index";
import {
  emailRateComponents,
  type PublicEmailRateEvidence,
} from "../../packages/domain/src/live-delivery-quotes";
import type { Fetcher } from "../../packages/providers";
import type {
  SecureDistributionInput,
  SecureDistributionView,
} from "../../packages/contracts/src/secure-distribution";

// This combines actual local Chromium/PDF.js, isolated Workers SQLite/R2,
// persisted non-development authentication, approval, outbox, the production
// Resend adapter and signed callback ingestion. Provider HTTP is intercepted:
// neither these production-mode fixtures nor their credentials leave the test.
let mf: Miniflare, db: D1Database, bucket: R2Bucket;
let scripts: Awaited<ReturnType<typeof loadPdfScripts>>;
let original: Uint8Array<ArrayBuffer>;
const origin = "https://guteneo.example.test";
const webhookKey = new Uint8Array(32).fill(73);
const webhookSecret = `whsec_${Buffer.from(webhookKey).toString("base64")}`;
const opaque = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const stamp = () => new Date().toISOString();

async function applyMigration(source: string) {
  const statements: D1PreparedStatement[] = [];
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement) trigger = line.startsWith("CREATE TRIGGER");
    statement += `${line}\n`;
    if (
      (trigger && (line === "END;" || /\bBEGIN\b.+\bEND;$/.test(line))) ||
      (!trigger && line.endsWith(";"))
    ) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete migration fixture");
  if (statements.length) await db.batch(statements);
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "secure-resend-journey",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const directory = new URL("../../migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await applyMigration(await readFile(new URL(name, directory), "utf8"));
  await db
    .prepare(
      "UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1",
    )
    .run();
  scripts = await loadPdfScripts();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([595, 842])
    .drawText("SYNTHETIC SECURE DISTRIBUTION - NEVER SEND", {
      x: 40,
      y: 750,
      size: 12,
      font,
    });
  original = new Uint8Array(await pdf.save());
});

afterAll(async () => {
  await mf?.dispose();
});

async function fixture() {
  const organizationId = opaque("org"),
    userId = opaque("usr"),
    senderId = opaque("sender");
  const createdAt = stamp(),
    now = Date.now();
  const ownerEmail = `${userId}@example.test`;
  const identity = {
    provider: "resend" as const,
    accountId: opaque("account"),
    routeId: "resend:secure_fixture:guteneo.com",
  };
  const render = vi.fn((request: Request) =>
    handleExpertReviewPages(request, {
      scripts,
      launch: () =>
        puppeteer.launch({
          executablePath: chromium.executablePath(),
          headless: true,
        }),
    }),
  );
  const renderQueue = vi.fn(async (_message: unknown) => {});
  const env = {
    DB: db,
    DOCUMENTS: bucket,
    APP_ORIGIN: origin,
    ENVIRONMENT: "production",
    MODE: "production",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "email",
    EMAIL_PROVIDER: "resend",
    RESEND_ACCOUNT_ID: identity.accountId,
    RESEND_DOMAIN_ID: "secure_fixture",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: "re_synthetic_journey_key",
    RESEND_WEBHOOK_SECRET: webhookSecret,
    RESEND_SENDS_ENABLED: "true",
    SECURE_DISTRIBUTION_ENABLED: "true",
    SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account",
    AUTH0_AUTH_POLICY: "verified_email",
    SECURE_DOCUMENTS_KEY: Buffer.from(new Uint8Array(32).fill(83)).toString(
      "base64",
    ),
    DOCUMENT_RENDERER: { fetch: render },
    DISPATCH_QUEUE: { send: renderQueue },
  } as unknown as Env;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Synthetic journey','production',?)",
      )
      .bind(organizationId, createdAt),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic owner',?,?)",
      )
      .bind(userId, ownerEmail, createdAt),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, createdAt),
    db
      .prepare(
        "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://identity.example.test/',?,?,?)",
      )
      .bind(userId, userId, createdAt),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Synthetic sender','documents@guteneo.com','verified','production',?)",
      )
      .bind(senderId, organizationId, createdAt),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(organizationId),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,50000,'EUR')",
      )
      .bind(organizationId, createdAt.slice(0, 7)),
    db
      .prepare(
        "INSERT INTO resend_send_limit_policies(account_id,max_recipients_24h,max_recipients_month,min_interval_ms,qualified_at_ms,expires_at_ms,source_sha256,status) VALUES(?,100,3000,200,?,?,?,'qualified')",
      )
      .bind(identity.accountId, now - 60000, now + 3600000, "a".repeat(64)),
  ]);
  const rate: PublicEmailRateEvidence = {
    usdMicrosPerMessage: 900,
    eurPerUsdNumerator: 10000,
    eurPerUsdDenominator: 11537,
    attachmentBasis: "included_pdf",
    pricingBasis: "public_list_price_ex_tax",
    plan: "Pro",
    tier: "additional_emails",
    unit: "recipient",
    currency: "USD",
    tariffSource: "https://resend.com/pricing",
    tariffDate: createdAt.slice(0, 10),
    fxBasis: "commercial_fixed_reference",
    fxSource: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    fxDate: createdAt.slice(0, 10),
  };
  const components = emailRateComponents(rate);
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,pricing_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,'email','resend',?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost','public_list_price_ex_tax',900,'ISOLATED SYNTHETIC TEST - NOT PRODUCTION',?,?,?,'qualified',?)",
    )
    .bind(
      opaque("cost"),
      organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
      canonicalJson(rate),
      components.base_numerator,
      components.byte_numerator,
      components.rate_denominator,
      await sha256(canonicalJson(rate)),
      new Date(now - 60000).toISOString(),
      new Date(now + 3600000).toISOString(),
      createdAt,
    )
    .run();
  const session = await createSession(
    env,
    (await memberships(env, userId))[0],
    false,
    false,
    true,
    {
      verifiedEmail: ownerEmail,
      authenticatedAt: Math.floor(now / 1000),
      amr: ["pwd"],
      strongAuthentication: false,
      authenticationPolicyVersion: null,
      identityIssuer: "https://identity.example.test/",
      identitySubject: userId,
    },
  );
  const request = new Request(`${origin}/api/session`, {
    headers: { Cookie: session.cookie.split(";")[0] },
  });
  const ctx = (await authenticateBrowser(request, env)).context;
  const principal = await authenticatePersonalBrowser(request, env);
  const domain = new DomainService(db, {
    mode: "production",
    sensitiveDocumentAuthentication: "verified_account",
    liveDeliveryIdentity: { email: identity },
  });
  const storageKey = `synthetic-journey/${organizationId}.pdf`;
  const source = await domain.registerDocument(ctx, {
    name: "Synthetic secure document.pdf",
    sha256: await sha256(original),
    size: original.length,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey,
    scanVerified: true,
  });
  await bucket.put(storageKey, original);
  const service = new SecureDistributionService(env, domain);
  return {
    env,
    ctx,
    principal,
    domain,
    service,
    source,
    render,
    renderQueue,
    organizationId,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function queued(
  f: Fixture,
  options: Partial<
    Pick<
      SecureDistributionInput,
      "costCeilingMinor" | "retentionDays" | "allowVaultDeposit"
    >
  > = {},
) {
  const prepared = await f.service.prepare(
    f.ctx,
    {
      documentId: f.source.id,
      recipient: { address: "synthetic-recipient@example.test" },
      recipientBinding: "verified_email",
      retentionDays: 7,
      allowOriginalDownload: false,
      allowVaultDeposit: false,
      personalRetentionDays: 365,
      ...options,
    },
    opaque("prepare"),
  );
  expect(prepared.status).toBe("preparing");
  expect(f.renderQueue).toHaveBeenCalledWith({
    dispatchId: `secure_render:${prepared.id}`,
  });
  await f.service.processRender(prepared.id);
  const complete = await f.service.get(f.ctx, prepared.id);
  const hostingMinor =
    complete.quote.sharedMinor + complete.quote.personalMinor;
  expect(
    complete.status,
    "The actual PDF renderer and email quote must complete",
  ).toBe("prepared");
  expect(f.render).toHaveBeenCalledTimes(1);
  const dispatchId = complete.dispatchId!;
  const frozen = (await f.domain.getDispatch(f.ctx, dispatchId)).dispatch;
  expect(frozen.document_id).toBeNull();
  expect(frozen.html?.includes("#/app/my-documents?invitation=")).toBe(true);
  await expect(
    f.service.confirm(f.ctx, complete.id, opaque("unapproved")),
  ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
  await f.service.approve(f.ctx, complete.id, f.principal, true, true);
  await f.service.confirm(f.ctx, complete.id, opaque("confirm"));
  const publish = vi.fn(async (_message: unknown) => {});
  await f.domain.publishOutbox(publish);
  expect(publish).toHaveBeenCalledWith({
    dispatchId,
    organizationId: f.organizationId,
    channel: "email",
  });
  expect((await f.domain.getDispatch(f.ctx, dispatchId)).dispatch.status).toBe(
    "queued",
  );
  expect(
    await db
      .prepare(
        "SELECT amount_minor,status FROM reservations WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(f.organizationId, dispatchId)
      .first(),
  ).toEqual({
    amount_minor: frozen.ceiling_minor - hostingMinor,
    status: "reserved",
  });
  return { distributionId: complete.id, dispatchId, frozen, hostingMinor };
}

async function callback(
  dispatchId: string,
  providerId: string,
  kind: "delivered" | "failed",
) {
  const eventId = opaque("event"),
    timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: `email.${kind}`,
    created_at: stamp(),
    data: { email_id: providerId, tags: { "guteneo-dispatch": dispatchId } },
  });
  const key = await crypto.subtle.importKey(
    "raw",
    webhookKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${eventId}.${timestamp}.${body}`),
  );
  return () =>
    new Request(`${origin}/webhooks/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${Buffer.from(signature).toString("base64")}`,
      },
      body,
    });
}

async function commitments(f: Fixture, dispatchId: string) {
  return {
    hosting: await db
      .prepare(
        "SELECT amount_minor,evidence FROM secure_distribution_charges WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(f.organizationId, dispatchId)
      .first(),
    outbox: await db
      .prepare(
        "SELECT COUNT(*) AS count FROM outbox WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(f.organizationId, dispatchId)
      .first(),
    attempts: await db
      .prepare(
        "SELECT COUNT(*) AS count FROM attempts WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(f.organizationId, dispatchId)
      .first(),
  };
}

describe("Secure distribution through the real Resend bridge with intercepted transport", () => {
  it("prepares and tracks the same distribution through the actual MCP SDK while browser approval controls activation", async () => {
    const f = await fixture();
    const issuer = "https://identity.example.test/";
    const connectionId = opaque("connection");
    const clientId = opaque("client");
    Object.assign(f.env, {
      AUTH0_DOMAIN: new URL(issuer).hostname,
      AUTH0_CLIENT_ID: "synthetic-browser",
      AUTH0_AUDIENCE: `${origin}/mcp`,
    });
    const createdAt = stamp();
    await db
      .prepare(
        "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,not_before,created_at,updated_at) VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connectionId,
        issuer,
        f.ctx.userId,
        clientId,
        f.organizationId,
        createdAt,
        createdAt,
      )
      .run();
    const keys = await generateKeyPair("RS256");
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: opaque("key"),
      alg: "RS256",
    };
    const token = await new SignJWT({
      client_id: clientId,
      scope: MCP_SCOPES.join(" "),
      amr: ["pwd"],
      "https://guteneo.com/verified_account": true,
    })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setSubject(f.ctx.userId)
      .setAudience(f.env.AUTH0_AUDIENCE!)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(keys.privateKey);
    // Signature verification and later authority rechecks use real auth code.
    // Every network destination is intercepted; no OAuth issuer is contacted.
    const jwksFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === `${issuer}.well-known/jwks.json`)
          return Response.json({ keys: [jwk] });
        throw new Error(
          "External HTTP is forbidden in the MCP journey fixture",
        );
      });
    let client: Client | undefined;
    let server: ReturnType<typeof createGuteneoMcpServer> | undefined;
    try {
      const identity = await authenticateMcp(
        new Request(`${origin}/mcp`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        f.env,
      );
      expect(identity.connectionObservation).toEqual({
        connectionId,
        authorizationRevision: 0,
      });
      const secure = async (current: McpIdentity, scope: string) => {
        const authority = await postalMcpAuthority(current, f.env, scope);
        const snapshot: SecurePreparationAuthority = {
          kind: "oauth",
          ...current.connectionObservation!,
          expiresAt: current.expiresAt,
        };
        return new SecureDistributionService(
          f.env,
          f.domain,
          authority,
          snapshot,
        );
      };
      server = createGuteneoMcpServer(identity, f.env, {
        domain: f.domain,
        documents: new DocumentService(f.env, f.domain),
        capabilities: () => ({ mode: "production" }),
        secureDistribution: {
          prepare: async (current, input, key) =>
            (await secure(current, "dispatches:prepare")).prepare(
              current.context,
              input,
              key,
            ),
          list: async (current, query) =>
            (await secure(current, "dispatches:read")).list(
              current.context,
              query,
            ),
          get: async (current, id) =>
            (await secure(current, "dispatches:read")).get(current.context, id),
          confirm: async (current, id, key) =>
            (await secure(current, "dispatches:send")).confirm(
              current.context,
              id,
              key,
            ),
          revoke: async (current, id) =>
            (await secure(current, "dispatches:send")).revoke(
              current.context,
              id,
            ),
        },
      });
      client = new Client({
        name: "synthetic-secure-resend-journey",
        version: "1",
      });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await server.connect(st);
      await client.connect(ct);
      const prepareArgs = {
        documentId: f.source.id,
        recipient: { address: "synthetic-recipient@example.test" },
        recipientBinding: "verified_email",
        retentionDays: 7,
        allowOriginalDownload: false,
        allowVaultDeposit: false,
        personalRetentionDays: 365,
        idempotencyKey: opaque("mcp_prepare"),
      };
      const prepared = await client.callTool({
        name: "prepare_secure_distribution",
        arguments: prepareArgs,
      });
      expect(prepared.isError).not.toBe(true);
      const preparation = (
        prepared.structuredContent as { data: SecureDistributionView }
      ).data;
      expect(preparation.status).toBe("preparing");
      const repeat = await client.callTool({
        name: "prepare_secure_distribution",
        arguments: prepareArgs,
      });
      expect(repeat.isError).not.toBe(true);
      expect(
        (repeat.structuredContent as { data: SecureDistributionView }).data.id,
      ).toBe(preparation.id);
      const poll = async () =>
        client!.callTool({
          name: "get_secure_distribution",
          arguments: { distributionId: preparation.id },
        });
      expect(
        ((await poll()).structuredContent as { data: SecureDistributionView })
          .data.status,
      ).toBe("preparing");
      const persisted = await db
        .prepare(
          "SELECT preparation_authority_json FROM secure_distributions WHERE organization_id=? AND id=?",
        )
        .bind(f.organizationId, preparation.id)
        .first<{ preparation_authority_json: string }>();
      expect(JSON.parse(persisted!.preparation_authority_json)).toEqual({
        kind: "oauth",
        connectionId,
        authorizationRevision: 0,
        expiresAt: identity.expiresAt,
      });
      await f.service.processRender(preparation.id);
      const complete = (await poll()).structuredContent as {
        data: SecureDistributionView;
      };
      expect(complete.data.status).toBe("prepared");
      const dispatchId = complete.data.dispatchId!;
      const premature = await client.callTool({
        name: "confirm_secure_distribution",
        arguments: {
          distributionId: preparation.id,
          idempotencyKey: opaque("mcp_unapproved"),
        },
      });
      expect(premature.isError).toBe(true);
      expect(premature.structuredContent).toMatchObject({
        ok: false,
        error: { code: "HUMAN_APPROVAL_REQUIRED" },
      });
      expect(await commitments(f, dispatchId)).toEqual({
        hosting: null,
        outbox: { count: 0 },
        attempts: { count: 0 },
      });
      // These are the two real browser service operations: review approval,
      // then activation. The MCP client never creates human consent.
      await f.service.approve(f.ctx, preparation.id, f.principal, true, true);
      await f.service.confirm(
        f.ctx,
        preparation.id,
        opaque("browser_activate"),
      );
      expect(
        ((await poll()).structuredContent as { data: SecureDistributionView })
          .data.status,
      ).toBe("active");
      const publish = vi.fn(async (_message: unknown) => {});
      await f.domain.publishOutbox(publish);
      expect(publish).toHaveBeenCalledWith({
        dispatchId,
        organizationId: f.organizationId,
        channel: "email",
      });
      const providerId = crypto.randomUUID();
      const resend = vi
        .fn<Fetcher>()
        .mockResolvedValue(Response.json({ id: providerId }));
      const hook = createLiveProviderHook(f.env, "email", { fetcher: resend });
      await f.domain.processDispatch(dispatchId, hook);
      expect(resend).toHaveBeenCalledTimes(1);
      const signedCallback = await callback(
        dispatchId,
        providerId,
        "delivered",
      );
      expect(
        (await handleWebhook(signedCallback(), f.env, f.domain))?.status,
      ).toBe(200);
      const tracking = await client.callTool({
        name: "get_dispatch_status",
        arguments: { dispatchId },
      });
      expect(tracking.isError).not.toBe(true);
      expect(tracking.structuredContent).toMatchObject({
        ok: true,
        data: { status: "delivered", attemptCount: 1 },
      });
      const observation = await db
        .prepare(
          "SELECT authorization_revision,last_successful_tool_at FROM connection_tool_observations WHERE connection_id=? AND organization_id=? AND user_id=?",
        )
        .bind(connectionId, f.organizationId, f.ctx.userId)
        .first<{
          authorization_revision: number;
          last_successful_tool_at: string | null;
        }>();
      expect(observation?.authorization_revision).toBe(0);
      expect(
        Number.isFinite(Date.parse(observation?.last_successful_tool_at ?? "")),
      ).toBe(true);
      expect(f.render).toHaveBeenCalledTimes(1);
      await f.domain.processDispatch(dispatchId, hook);
      expect(resend).toHaveBeenCalledTimes(1);
    } finally {
      await client?.close();
      await server?.close();
      jwksFetch.mockRestore();
    }
  });

  it.each([
    {
      kind: "delivered",
      options: { retentionDays: 30, allowVaultDeposit: true },
      expectedHostingMinor: 298,
    },
    {
      kind: "failed",
      options: { costCeilingMinor: 500 },
      expectedHostingMinor: 49,
    },
  ] as const)(
    "projects a signed $kind callback without changing the hosting commitment or resending",
    async ({ kind, options, expectedHostingMinor }) => {
      const f = await fixture();
      const { dispatchId, distributionId, frozen } = await queued(f, options);
      const providerId = crypto.randomUUID();
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(Response.json({ id: providerId }));
      const hook = createLiveProviderHook(f.env, "email", { fetcher });
      await f.domain.processDispatch(dispatchId, hook);
      const result = await f.domain.getDispatch(f.ctx, dispatchId);
      expect(
        result.dispatch.status,
        JSON.stringify(result.attempts.map((attempt) => attempt.error_code)),
      ).toBe("accepted");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        `guteneo/${dispatchId}`,
      );
      const submitted = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      // On failure, report booleans rather than invitation-bearing email bodies.
      expect({
        subjectMatches: submitted.subject === frozen.subject,
        htmlMatches: submitted.html === frozen.html,
        textMatches: submitted.text === frozen.text,
        hasAttachments: Object.hasOwn(submitted, "attachments"),
      }).toEqual({
        subjectMatches: true,
        htmlMatches: true,
        textMatches: true,
        hasAttachments: false,
      });
      const before = await commitments(f, dispatchId);
      expect(before).toEqual({
        hosting: { amount_minor: expectedHostingMinor, evidence: "production" },
        outbox: { count: 1 },
        attempts: { count: 1 },
      });
      const request = await callback(dispatchId, providerId, kind);
      expect((await handleWebhook(request(), f.env, f.domain))?.status).toBe(
        200,
      );
      expect((await handleWebhook(request(), f.env, f.domain))?.status).toBe(
        200,
      );
      expect(
        (await f.domain.getDispatch(f.ctx, dispatchId)).dispatch.status,
      ).toBe(kind);
      expect((await f.service.get(f.ctx, distributionId)).status).toBe(
        "active",
      );
      await f.domain.processDispatch(dispatchId, hook);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await commitments(f, dispatchId)).toEqual(before);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM provider_events WHERE organization_id=? AND dispatch_id=? AND kind=?",
          )
          .bind(f.organizationId, dispatchId, kind)
          .first(),
      ).toEqual({ count: 1 });
    },
  );

  it("retains an unknown provider outcome and reconciles its signed callback without a second submission", async () => {
    const f = await fixture();
    const { dispatchId } = await queued(f);
    const fetcher = vi
      .fn<Fetcher>()
      .mockRejectedValue(new Error("Synthetic lost provider response"));
    const hook = createLiveProviderHook(f.env, "email", { fetcher });
    await f.domain.processDispatch(dispatchId, hook);
    const result = await f.domain.getDispatch(f.ctx, dispatchId);
    expect(
      result.dispatch.status,
      JSON.stringify(result.attempts.map((attempt) => attempt.error_code)),
    ).toBe("submission_unknown");
    expect(
      await db
        .prepare(
          "SELECT status FROM reservations WHERE organization_id=? AND dispatch_id=?",
        )
        .bind(f.organizationId, dispatchId)
        .first(),
    ).toEqual({ status: "reserved" });
    const before = await commitments(f, dispatchId);
    await f.domain.processDispatch(dispatchId, hook);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await commitments(f, dispatchId)).toEqual(before);
    const request = await callback(
      dispatchId,
      crypto.randomUUID(),
      "delivered",
    );
    expect((await handleWebhook(request(), f.env, f.domain))?.status).toBe(200);
    expect(
      (await f.domain.getDispatch(f.ctx, dispatchId)).dispatch.status,
    ).toBe("delivered");
    await f.domain.processDispatch(dispatchId, hook);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await commitments(f, dispatchId)).toEqual(before);
  });

  it.each(["reservation", "ceiling"] as const)(
    "refuses a changed %s before the provider HTTP request",
    async (changed) => {
      const f = await fixture();
      const { dispatchId } = await queued(f);
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(Response.json({ id: crypto.randomUUID() }));
      const hook = createLiveProviderHook(f.env, "email", { fetcher });
      if (changed === "reservation") {
        // Isolated corruption fixture: the frozen ceiling and approval stay intact.
        await db
          .prepare(
            "UPDATE reservations SET amount_minor=amount_minor-1 WHERE organization_id=? AND dispatch_id=? AND status='reserved'",
          )
          .bind(f.organizationId, dispatchId)
          .run();
      }
      await f.domain.processDispatch(
        dispatchId,
        changed === "ceiling"
          ? {
              ...hook,
              submit: (dispatch) =>
                hook.submit({
                  ...dispatch,
                  ceiling_minor: dispatch.ceiling_minor + 1,
                }),
            }
          : hook,
      );
      expect(fetcher).not.toHaveBeenCalled();
      const result = await f.domain.getDispatch(f.ctx, dispatchId);
      expect(result.dispatch.status).toBe("failed");
      expect(result.attempts).toMatchObject([
        { status: "rejected", error_code: "ACTIVE_APPROVED_ATTEMPT_REQUIRED" },
      ]);
      expect((await commitments(f, dispatchId)).hosting).toEqual({
        amount_minor: 49,
        evidence: "production",
      });
    },
  );
});
