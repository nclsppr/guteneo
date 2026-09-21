import { readFile, readdir } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import api from "../../apps/api/src/index";
import {
  PostalService,
  cleanupPostalEvidence,
} from "../../apps/api/src/postal";
import {
  postalBrowserAuthority,
  type PostalAuthority,
} from "../../apps/api/src/postal-authority";
import { hashSecret } from "../../apps/api/src/auth";
import {
  DomainService,
  canonicalJson,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
import type { PostalReviewInput } from "../../packages/contracts/src/postal-review";
import type { Fetcher } from "../../packages/providers";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";

const openapi = JSON.parse(
  await readFile(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const schemaValidator = new AjvJsonSchemaValidator();
const validateReview = schemaValidator.getValidator({
  ...openapi.components.schemas.PostalReview,
  components: openapi.components,
});
const validateRequirements = schemaValidator.getValidator({
  ...openapi.components.schemas.PostalRequirements,
  components: openapi.components,
});

let mf: Miniflare, env: Env, domain: DomainService;
let bytes: Uint8Array<ArrayBuffer>,
  hash: string,
  authority: PostalAuthority,
  request: Request;
let profileCountry = "LU",
  profilePosition = "left";
let calls: { url: string; method: string; body: BodyInit | null | undefined }[];
const token = "s".repeat(43),
  csrf = "fixture-csrf";
const ctx: ActorContext = {
  organizationId: "postal_org",
  userId: "postal_user",
  role: "admin",
  actor: "browser",
};
const input: PostalReviewInput = {
  documentId: "postal_document",
  senderId: "postal_sender",
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
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const report = () => ({
  version: PINGEN_PREFLIGHT_VERSION,
  status: "review_required",
  sha256: hash,
  pages: 2,
  canSend: false,
  issues: [],
  requiredReviews: ["printed_recipient_matches"],
  rendering: {
    dpi: 144,
    complete: true,
    pages: [1, 2].map((page) => ({
      page,
      width: 1191,
      height: 1684,
      rasterSha256: "a".repeat(64),
    })),
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
let renderer: ReturnType<typeof vi.fn>;
const profileFetch: Fetcher = async (url, init) => {
  const parsed = new URL(String(url));
  calls.push({
    url: parsed.origin + parsed.pathname,
    method: init?.method ?? "GET",
    body: init?.body,
  });
  if (parsed.pathname === "/auth/access-tokens")
    return Response.json({
      access_token: "fixture-token",
      token_type: "Bearer",
      expires_in: 3600,
    });
  if (parsed.pathname === "/organisations/pingen_org")
    return Response.json({
      data: {
        id: "pingen_org",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: profileCountry,
          default_address_position: profilePosition,
        },
      },
    });
  if (parsed.pathname === "/file-upload")
    return Response.json({
      data: {
        attributes: {
          url: "https://upload.pingen.example/synthetic.pdf?signature=fixture",
          url_signature: "fixture-signature",
        },
      },
    });
  if (parsed.origin === "https://upload.pingen.example")
    return new Response(null, { status: 200 });
  if (
    parsed.pathname === "/organisations/pingen_org/deliveries/letters" &&
    init?.method === "POST"
  )
    return Response.json(
      { data: { id: "fixture-letter", attributes: { status: "draft" } } },
      { status: 201 },
    );
  throw new Error("unexpected synthetic provider call");
};
const service = (
  fetcher: Fetcher = profileFetch,
  overrides: Partial<Env> = {},
  deadlineMs?: number,
) =>
  new PostalService({ ...env, ...overrides }, domain, { fetcher, deadlineMs });
const renders = async () =>
  (
    await env.DB.prepare(
      "SELECT renders FROM content_usage WHERE organization_id=?",
    )
      .bind(ctx.organizationId)
      .first<{ renders: number }>()
  )?.renders ?? 0;
const transfers = () =>
  calls.filter(
    (call) => call.method === "PUT" || call.url.endsWith("/letters"),
  );
async function login(
  user = ctx.userId,
  org = ctx.organizationId,
  secret = token,
) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,0,0,?,?,1)",
  )
    .bind(
      await hashSecret(secret),
      user,
      org,
      csrf,
      new Date().toISOString(),
      new Date(Date.now() + 3600_000).toISOString(),
    )
    .run();
  return new Request("https://guteneo.example/api/postal/preflights", {
    method: "POST",
    headers: {
      Cookie: `__Host-guteneo_session=${secret}`,
      Origin: env.APP_ORIGIN,
      "X-CSRF-Token": csrf,
    },
  });
}
// Historical v1 records are inserted through the real D1 constraints, never by
// disabling immutability guards or relabelling a v2 report. Provider data is synthetic.
async function legacyReview(
  state:
    "not_started" | "preparing" | "stale_preparing" | "unknown" | "prepared",
) {
  const id = `legacy_${state}`;
  const created = new Date(Date.now() - 300_000).toISOString();
  const profile = {
    accountId: "pingen_org",
    environment: "production",
    defaultCountry: "LU",
    addressPosition: "left",
    version: "pingen-2026-09-17-v1",
  };
  const options = { ...input.options, addressPosition: "left" };
  const expectedAddress = [
    input.recipient.name,
    input.recipient.line1,
    `${input.recipient.postalCode} ${input.recipient.city}`,
  ].join("\n");
  const requestHash = await sha256(
    canonicalJson({
      ...input,
      options,
      profile,
      documentSha256: hash,
      senderAddress: "Return fixture",
    }),
  );
  const record = {
    id,
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    document_id: input.documentId,
    document_sha256: hash,
    sender_id: input.senderId,
    sender_address: "Return fixture",
    recipient_json: canonicalJson(input.recipient),
    options_json: canonicalJson(options),
    profile_json: canonicalJson(profile),
    expected_address: expectedAddress,
    ceiling_minor: input.ceilingMinor,
    request_hash: requestHash,
    input_hash: await sha256(canonicalJson(input)),
    idempotency_key: id,
    status: "processing",
    budget_day: created.slice(0, 10),
    processing_until: new Date(Date.now() - 210_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    created_at: created,
    updated_at: created,
  };
  await env.DB.prepare(
    `INSERT INTO postal_preflights(${Object.keys(record).join(",")}) VALUES(${Object.keys(
      record,
    )
      .map(() => "?")
      .join(",")})`,
  )
    .bind(...Object.values(record))
    .run();
  await env.DB.prepare(
    "UPDATE postal_preflights SET status='review_required',report_json=? WHERE id=?",
  )
    .bind(canonicalJson({ ...report(), version: profile.version }), id)
    .run();
  if (state !== "not_started") {
    await env.DB.prepare(
      "INSERT INTO postal_transfer_consents(preflight_id,organization_id,user_id,fingerprint,reviewed,transfer_only,created_at) VALUES(?,?,?,?,1,1,?)",
    )
      .bind(id, ctx.organizationId, ctx.userId, requestHash, created)
      .run();
    await env.DB.prepare(
      "UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=? WHERE id=?",
    )
      .bind(
        new Date(
          Date.now() - (state === "stale_preparing" ? 180_000 : 10_000),
        ).toISOString(),
        id,
      )
      .run();
    if (state === "unknown")
      await env.DB.prepare(
        "UPDATE postal_preflights SET transfer_status='unknown' WHERE id=?",
      )
        .bind(id)
        .run();
    if (state === "prepared") {
      await env.DB.prepare(
        "INSERT INTO provider_drafts(id,organization_id,document_id,document_sha256,sender_id,sender_address,provider,provider_id,recipient_json,expected_address,options_json,ceiling_minor,currency,status,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,'pingen',?,?,?,?,?,'EUR','prepared',?,?,?,?)",
      )
        .bind(
          "legacy_draft",
          ctx.organizationId,
          input.documentId,
          hash,
          input.senderId,
          "Return fixture",
          "legacy_letter",
          canonicalJson(input.recipient),
          expectedAddress,
          canonicalJson(options),
          input.ceilingMinor,
          requestHash,
          id,
          created,
          created,
        )
        .run();
      await env.DB.prepare(
        "UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id='legacy_draft' WHERE id=?",
      )
        .bind(id)
        .run();
    }
  }
  return id;
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "postal-service-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  const DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const source = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    let statement = "",
      trigger = false;
    const statements: D1PreparedStatement[] = [];
    for (const raw of source.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += line + "\n";
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        statements.push(DB.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    if (statements.length) await DB.batch(statements);
  }
  env = {
    DB,
    DOCUMENTS: (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    AUTH0_DOMAIN: "fixture.auth0.com",
    AUTH0_CLIENT_ID: "fixture-client",
    AUTH0_CLIENT_SECRET: "fixture-confidential-client",
    AUTH0_AUDIENCE: "https://guteneo.example",
    POSTAL_DRAFTS_ENABLED: "true",
    LIVE_SENDS_ENABLED: "false",
    PINGEN_CLIENT_ID: "fixture-client",
    PINGEN_CLIENT_SECRET: "fixture-secret",
    PINGEN_ORGANIZATION_ID: "pingen_org",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_SANDBOX: "false",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
  } as Env;
  domain = new DomainService(DB, { mode: "production" });
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  pdf.addPage([595.28, 841.89]);
  bytes = new Uint8Array(await pdf.save());
  hash = await sha256(bytes);
  for (const suffix of ["", "_other"]) {
    const org = ctx.organizationId + suffix,
      user = ctx.userId + suffix;
    await DB.batch([
      DB.prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'production',?)",
      ).bind(org, "Postal fixture", new Date().toISOString()),
      DB.prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
      ).bind(
        user,
        "Fixture",
        `${user}@example.invalid`,
        new Date().toISOString(),
      ),
      DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      ).bind(org, user, new Date().toISOString()),
      DB.prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,10,20971520,3)",
      ).bind(org),
    ]);
  }
  await DB.prepare(
    "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('postal_sender',?,'postal','Fixture','Return fixture','verified','production',?)",
  )
    .bind(ctx.organizationId, new Date().toISOString())
    .run();
  await domain.registerDocument(ctx, {
    id: input.documentId,
    name: "fixture.pdf",
    sha256: hash,
    pages: 2,
    size: bytes.length,
    status: "ready",
    source: "import",
    storageKey: "postal/fixture.pdf",
    scanVerified: true,
  });
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM postal_transfer_consents"),
    env.DB.prepare("DELETE FROM postal_preflights"),
    env.DB.prepare("DELETE FROM provider_drafts"),
    env.DB.prepare("DELETE FROM content_usage"),
    env.DB.prepare("DELETE FROM browser_sessions"),
    env.DB.prepare("UPDATE senders SET status='verified'"),
    env.DB.prepare("DELETE FROM documents WHERE id='postal_document'"),
  ]);
  await env.DOCUMENTS.put("postal/fixture.pdf", bytes);
  await domain.registerDocument(ctx, {
    id: input.documentId,
    name: "fixture.pdf",
    sha256: hash,
    pages: 2,
    size: bytes.length,
    status: "ready",
    source: "import",
    storageKey: "postal/fixture.pdf",
    scanVerified: true,
  });

  profileCountry = "LU";
  env.PINGEN_DEFAULT_COUNTRY = "LU";
  profilePosition = "left";
  calls = [];
  renderer = vi.fn(async (request: Request) => {
    expect(request.headers.get("X-Guteneo-Source-Sha256")).toBe(hash);
    expect(request.headers.get("X-Guteneo-Scan-Sha256")).toBe(hash);
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
    return Response.json(report());
  });
  env.DOCUMENT_RENDERER = {
    fetch: renderer,
  } as unknown as Env["DOCUMENT_RENDERER"];
  request = await login();
  authority = await postalBrowserAuthority(request, env, true);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mf?.dispose();
});

describe("server-owned postal review and consent", () => {
  it("reads a qualified destination template without PDF, storage writes or render credit", async () => {
    const requirements = await service().requirements(authority, "FR");
    expect(requirements).toMatchObject({
      provider: "pingen",
      qualified: true,
      profile: { defaultCountry: "LU", addressPosition: "left" },
      country: "FR",
      addressGuidance: {
        destination: "FR",
        route: "dhl_international",
        recipientSchema: {
          renderedLines: 4,
          additionalAddressLinesSupported: false,
        },
        addressRules: { countryLine: { required: true, value: "FRANCE" } },
        verification: {
          textVisibility: "not_verified",
          mcpEmbeddedVisualEvidenceAvailable: false,
        },
      },
      layout: { profile: "general", edgeMm: 5 },
      canSend: false,
    });
    expect(validateRequirements(requirements)).toMatchObject({ valid: true });
    expect(
      validateRequirements({ ...requirements, invented: true }),
    ).toMatchObject({ valid: false });
    expect(requirements.limits).toMatchObject({
      pdfBytes: 8000000,
      pages: 100,
      renderDpi: 144,
    });
    expect(JSON.stringify(requirements)).not.toContain("pingen_org");
    expect(JSON.stringify(requirements)).not.toContain("fixture-secret");
    expect(await renders()).toBe(0);
    expect(renderer).not.toHaveBeenCalled();
    expect(transfers()).toHaveLength(0);
  });
  it("does not publish a profile after revocation during the organization read", async () => {
    const fetcher: Fetcher = async (url, init) => {
      const result = await profileFetch(url, init);
      if (String(url).endsWith("/organisations/pingen_org"))
        await env.DB.prepare("DELETE FROM browser_sessions").run();
      return result;
    };
    await expect(
      service(fetcher).requirements(authority, "LU"),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("refuses an unqualified or mismatching account template", async () => {
    profileCountry = "FR";
    await expect(service().requirements(authority, "FR")).rejects.toMatchObject(
      { code: "POSTAL_PROFILE_UNQUALIFIED" },
    );
    expect(await renders()).toBe(0);
  });

  it("uses exact private bytes and qualified account profile, consumes one render and returns a review without sending", async () => {
    const result = await service().create(authority, input, "first");
    expect(result).toMatchObject({
      status: "review_required",
      canTransfer: true,
      canSend: false,
      transferStatus: "not_started",
      address: {
        matches: true,
        textVisibility: "not_verified",
        cropAccess: "authenticated_browser_session_only",
        mcpEmbeddedVisualEvidenceAvailable: false,
      },
      transferPolicy: {
        canTransferMeaning: "browser_session_only",
        expertEligibilityEvaluated: false,
        requiresVisualReview: true,
      },
      checks: { complete: true, dpi: 144 },
    });
    expect(validateReview(result)).toMatchObject({ valid: true });
    expect(validateReview({ ...result, invented: true })).toMatchObject({
      valid: false,
    });
    expect(
      validateReview({
        ...result,
        address: { ...result.address, textVisibility: undefined },
      }),
    ).toMatchObject({ valid: false });
    expect(result.options.addressPosition).toBe("left");
    expect(await renders()).toBe(1);
    expect(transfers()).toHaveLength(0);
    expect(renderer).toHaveBeenCalledTimes(1);
    const crop = await service().crop(authority, result.id);
    expect(crop.headers.get("Content-Type")).toBe("image/png");
    expect(crop.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(JSON.stringify(result)).not.toContain(png);
  });
  it.each([
    "not_started",
    "preparing",
    "stale_preparing",
    "unknown",
    "prepared",
  ] as const)(
    "keeps the historical v1 %s state readable without permitting a new transfer or quote",
    async (state) => {
      const id = await legacyReview(state);
      const stored = await env.DB.prepare(
        "SELECT profile_json,report_json,transfer_status,provider_draft_id FROM postal_preflights WHERE id=?",
      )
        .bind(id)
        .first();
      const result = await service().get(authority, id);
      expect(validateReview(result)).toMatchObject({ valid: true });
      expect(result).toMatchObject({
        id,
        status: "blocked",
        canTransfer: false,
        canSend: false,
        transferStatus: state === "stale_preparing" ? "unknown" : state,
        draftId: state === "prepared" ? "legacy_draft" : null,
        address: { matches: true, textVisibility: "not_verified" },
      });
      expect(result.checks.issues).toContainEqual({
        code: "POSTAL_PREFLIGHT_VERSION_CHANGED",
      });
      expect(await service().crop(authority, id)).toMatchObject({
        status: 200,
      });
      expect(await service().create(authority, input, id)).toEqual(result);
      if (state === "not_started") {
        await expect(
          service().transfer(authority, id, {
            reviewed: true,
            consentToTransfer: true,
          }),
        ).rejects.toMatchObject({ code: "POSTAL_PREFLIGHT_VERSION_CHANGED" });
      } else {
        expect(
          await service().transfer(authority, id, {
            reviewed: true,
            consentToTransfer: true,
          }),
        ).toEqual(result);
      }
      await expect(
        service().quote(authority, id, "legacy-quote"),
      ).rejects.toMatchObject({
        code:
          state === "prepared"
            ? "POSTAL_PREFLIGHT_VERSION_CHANGED"
            : "POSTAL_PREPARED_DRAFT_REQUIRED",
      });
      expect(
        await env.DB.prepare(
          "SELECT profile_json,report_json,transfer_status,provider_draft_id FROM postal_preflights WHERE id=?",
        )
          .bind(id)
          .first(),
      ).toEqual(stored);
      expect(renderer).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(await renders()).toBe(1);
    },
  );

  it("concurrent same-key preparation reserves/renders once, and changed replay conflicts", async () => {
    const results = await Promise.all([
      service().create(authority, input, "same"),
      service().create(authority, input, "same"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await renders()).toBe(1);
    expect(renderer).toHaveBeenCalledTimes(1);
    await expect(
      service().create(authority, { ...input, ceilingMinor: 600 }, "same"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await renders()).toBe(1);
  });
  it("existing daily limit is atomically shared with renders and never refilled", async () => {
    await env.DB.prepare(
      "INSERT INTO content_usage(organization_id,day,renders) VALUES(?,?,2)",
    )
      .bind(ctx.organizationId, new Date().toISOString().slice(0, 10))
      .run();
    const settled = await Promise.allSettled([
      service().create(authority, input, "quota1"),
      service().create(authority, input, "quota2"),
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await renders()).toBe(3);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(settled.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "RENDER_QUOTA_EXCEEDED" },
    });
  });
  it("tenant isolation prevents reading a preflight, crop or foreign original", async () => {
    const review = await service().create(authority, input, "own");
    const other = await postalBrowserAuthority(
      await login(
        ctx.userId + "_other",
        ctx.organizationId + "_other",
        "o".repeat(43),
      ),
      env,
      true,
    );
    for (const action of [
      () => service().get(other, review.id),
      () => service().crop(other, review.id),
      () =>
        service().transfer(other, review.id, {
          reviewed: true,
          consentToTransfer: true,
        }),
    ])
      await expect(action()).rejects.toMatchObject({
        code: "POSTAL_PREFLIGHT_NOT_FOUND",
      });
    await expect(service().create(other, input, "other")).rejects.toMatchObject(
      { code: "DOCUMENT_NOT_READY" },
    );
  });
  it("rejects forged browser proof/options and tampered bytes before render/consumption", async () => {
    await expect(
      service().create(
        authority,
        {
          ...input,
          options: { ...input.options, addressPosition: "center" },
        } as unknown as PostalReviewInput,
        "forged",
      ),
    ).rejects.toThrow();
    await env.DOCUMENTS.put("postal/fixture.pdf", new Uint8Array(bytes.length));
    await expect(
      service().create(authority, input, "tampered"),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_MISMATCH" });
    expect(await renders()).toBe(0);
    expect(renderer).not.toHaveBeenCalled();
  });
  it("missing or foreign canonical scan cannot be borrowed", async () => {
    await env.DB.prepare(
      "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
    )
      .bind(ctx.organizationId, hash)
      .run();
    await env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,action,resource_id,details_json,created_at) VALUES(?,?,'document.scan_verified',?,'{}',?)",
    )
      .bind(
        crypto.randomUUID(),
        ctx.organizationId + "_other",
        hash,
        new Date().toISOString(),
      )
      .run();
    await expect(
      service().create(authority, input, "no-scan"),
    ).rejects.toMatchObject({ code: "VERIFIED_SCAN_REQUIRED" });
    expect(await renders()).toBe(0);
    await env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,action,resource_id,details_json,created_at) VALUES(?,?,'document.scan_verified',?,'{}',?)",
    )
      .bind(
        crypto.randomUUID(),
        ctx.organizationId,
        hash,
        new Date().toISOString(),
      )
      .run();
  });
  it.each(["hash", "missing_page", "address", "incomplete", "old_version"])(
    "never authorizes transfer on %s proof",
    async (fault) => {
      renderer.mockImplementationOnce(async () => {
        const r = report();
        if (fault === "old_version")
          return Response.json({ ...r, version: "pingen-2026-09-17-v1" });
        if (fault === "hash") r.sha256 = "b".repeat(64);
        if (fault === "missing_page") r.rendering.pages.pop();
        if (fault === "address") r.address.lines[0] = "OTHER RECIPIENT";
        if (fault === "incomplete") r.rendering.complete = false;
        return Response.json(r);
      });
      const result = await service().create(authority, input, fault);
      expect(result.canTransfer).toBe(false);
      expect(result.status).toBe(fault === "address" ? "blocked" : "failed");
      expect(await renders()).toBe(1);
      expect(transfers()).toHaveLength(0);
      await expect(
        service().transfer(authority, result.id, {
          reviewed: true,
          consentToTransfer: true,
        }),
      ).rejects.toMatchObject({ code: "POSTAL_PREFLIGHT_REQUIRED" });
    },
  );
  it("timeout retains one render, never returns readiness and replay does not render again", async () => {
    renderer.mockImplementationOnce(() => new Promise(() => {}));
    const result = await service(profileFetch, {}, 5).create(
      authority,
      input,
      "timeout",
    );
    expect(result.status).toBe("failed");
    expect(result.canTransfer).toBe(false);
    expect(await renders()).toBe(1);
    await service().create(authority, input, "timeout");
    expect(renderer).toHaveBeenCalledTimes(1);
  });
  it("session revoked during rendering fences final proof and returns no report", async () => {
    renderer.mockImplementationOnce(async () => {
      await env.DB.prepare("DELETE FROM browser_sessions").run();
      return Response.json(report());
    });
    await expect(
      service().create(authority, input, "revoked"),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(
      await env.DB.prepare(
        "SELECT status,report_json FROM postal_preflights",
      ).first(),
    ).toMatchObject({ status: "failed", report_json: null });
    expect(await renders()).toBe(1);
  });
  it("separate transfer gate leaves review usable while actual transfer is disabled", async () => {
    const result = await service(profileFetch, {
      POSTAL_DRAFTS_ENABLED: "false",
    }).create(authority, input, "gate");
    expect(result.status).toBe("review_required");
    expect(result.canTransfer).toBe(false);
    await expect(
      service(profileFetch, { POSTAL_DRAFTS_ENABLED: "false" }).transfer(
        authority,
        result.id,
        { reviewed: true, consentToTransfer: true },
      ),
    ).rejects.toMatchObject({ code: "POSTAL_DRAFT_TRANSFER_DISABLED" });
    expect(transfers()).toHaveLength(0);
  });
  it("browser consent binds the immutable review and deposits exactly once with auto_send false, independently of live sending", async () => {
    const ready = await service().create(authority, input, "review");
    const results = await Promise.all([
      service().transfer(authority, ready.id, {
        reviewed: true,
        consentToTransfer: true,
      }),
      service().transfer(authority, ready.id, {
        reviewed: true,
        consentToTransfer: true,
      }),
    ]);
    expect(results.some((r) => r.transferStatus === "prepared")).toBe(true);
    const final = await service().transfer(authority, ready.id, {
      reviewed: true,
      consentToTransfer: true,
    });
    expect(final.transferStatus).toBe("prepared");
    expect(final.draftId).toMatch(/^pd_/);
    expect(final.canSend).toBe(false);
    expect(await renders()).toBe(1);
    expect(transfers()).toHaveLength(2);
    const deposit = transfers().find((call) => call.method === "POST")!;
    expect(JSON.parse(String(deposit.body)).data.attributes.auto_send).toBe(
      false,
    );
    expect(
      new Uint8Array(
        transfers().find((call) => call.method === "PUT")!.body as ArrayBuffer,
      ),
    ).toEqual(bytes);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) count FROM postal_transfer_consents",
      ).first(),
    ).toEqual({ count: 1 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) count FROM outbox").first(),
    ).toEqual({ count: 0 });
    await expect(
      env.DB.prepare(
        "UPDATE postal_transfer_consents SET user_id='other'",
      ).run(),
    ).rejects.toThrow(/immutable_postal_transfer_consent/);
  });
  it("assistant context and untrue consent never upload", async () => {
    const ready = await service().create(authority, input, "review");
    await expect(
      service().transfer(
        { ...authority, context: { ...ctx, actor: "mcp" } },
        ready.id,
        { reviewed: true, consentToTransfer: true },
      ),
    ).rejects.toMatchObject({ code: "HUMAN_DOCUMENT_TRANSFER_REQUIRED" });
    await expect(
      service().transfer(authority, ready.id, {
        reviewed: false,
        consentToTransfer: true,
      } as never),
    ).rejects.toThrow();
    expect(transfers()).toHaveLength(0);
  });
  it("changed server profile invalidates earlier consent before any file upload", async () => {
    const ready = await service().create(authority, input, "review");
    profileCountry = "DE";
    env.PINGEN_DEFAULT_COUNTRY = "DE";
    await expect(
      service().transfer(authority, ready.id, {
        reviewed: true,
        consentToTransfer: true,
      }),
    ).rejects.toMatchObject({ code: "POSTAL_PROFILE_CHANGED" });
    expect(transfers()).toHaveLength(0);
  });
  it("revocation after obtaining signed upload location prevents the first content transfer", async () => {
    const ready = await service().create(authority, input, "review");
    const fetcher: Fetcher = async (url, init) => {
      const response = await profileFetch(url, init);
      if (String(url).endsWith("/file-upload"))
        await env.DB.prepare("DELETE FROM browser_sessions").run();
      return response;
    };
    await expect(
      service(fetcher).transfer(authority, ready.id, {
        reviewed: true,
        consentToTransfer: true,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(transfers()).toHaveLength(0);
    expect(
      await env.DB.prepare(
        "SELECT transfer_status FROM postal_preflights",
      ).first(),
    ).toEqual({ transfer_status: "unknown" });
  });
  it("unknown provider response is durably held and never automatically retried", async () => {
    const ready = await service().create(authority, input, "review");
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === "POST" && String(url).endsWith("/letters")) {
        await profileFetch(url, init);
        throw new Error("lost private response");
      }
      return profileFetch(url, init);
    };
    const result = await service(fetcher).transfer(authority, ready.id, {
      reviewed: true,
      consentToTransfer: true,
    });
    expect(result.transferStatus).toBe("unknown");
    const count = transfers().length;
    await service(fetcher).transfer(authority, ready.id, {
      reviewed: true,
      consentToTransfer: true,
    });
    expect(transfers()).toHaveLength(count);
  });
});

describe("postal HTTP boundary", () => {
  const call = (
    path: string,
    method: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    api.fetch(
      new Request(env.APP_ORIGIN + path, {
        method,
        headers: {
          Cookie: `__Host-guteneo_session=${token}`,
          Origin: env.APP_ORIGIN,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
          "Idempotency-Key": "http-create",
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  it("routes exact preparation, private review and PNG without provider transfer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(profileFetch);
    const created = await call("/api/postal/preflights", "POST", input);
    expect(created.status).toBe(201);
    const result = (await created.json()) as { id: string; status: string };
    expect(result.status).toBe("review_required");
    const review = await call(`/api/postal/preflights/${result.id}`, "GET");
    expect(review.status).toBe(200);
    expect(((await review.json()) as { id: string }).id).toBe(result.id);
    const crop = await call(
      `/api/postal/preflights/${result.id}/address.png`,
      "GET",
    );
    expect(crop.headers.get("Content-Type")).toBe("image/png");
    expect(transfers()).toHaveLength(0);
  });
  it("requires current browser CSRF for consent and rejects proof/quote body forgery", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(profileFetch);
    const ready = await service().create(authority, input, "review");
    const missing = await call(
      `/api/postal/preflights/${ready.id}/transfer`,
      "POST",
      { reviewed: true, consentToTransfer: true },
      { "X-CSRF-Token": "wrong" },
    );
    expect(missing.status).toBe(403);
    const forged = await call("/api/postal/preflights", "POST", {
      ...input,
      sha256: hash,
      report: report(),
    });
    expect(forged.status).toBe(400);
    const quote = await call(
      `/api/postal/preflights/${ready.id}/quote`,
      "POST",
      { ceilingMinor: 0, providerDraftId: "forged" },
    );
    expect(quote.status).toBe(400);
    expect(await renders()).toBe(1);
    expect(transfers()).toHaveLength(0);
  });
});

it("prepares the quote only from persisted reviewed inputs and returns a pending analysis as a safe code", async () => {
  const ready = await service().create(authority, input, "quote-review");
  await expect(
    service().quote(authority, ready.id, "quote-key"),
  ).rejects.toMatchObject({ code: "POSTAL_PREPARED_DRAFT_REQUIRED" });
  const prepared = await service().transfer(authority, ready.id, {
    reviewed: true,
    consentToTransfer: true,
  });
  const prepare = vi
    .spyOn(domain, "prepareDispatch")
    .mockRejectedValueOnce(new Error("postal_document_not_ready"));
  await expect(
    service().quote(authority, ready.id, "quote-key"),
  ).rejects.toMatchObject({ code: "POSTAL_DRAFT_NOT_READY" });
  expect(prepare).toHaveBeenCalledWith(
    ctx,
    {
      channel: "postal",
      documentId: input.documentId,
      senderId: input.senderId,
      recipient: input.recipient,
      ceilingMinor: input.ceilingMinor,
      options: {
        ...input.options,
        addressPosition: "left",
        providerDraftId: prepared.draftId,
        preparedLetterId: "fixture-letter",
        expectedAddress: "ATELIER EXEMPLE\nRue du Test 12\nL-1234 LUXEMBOURG",
      },
    },
    "quote-key",
  );
  expect(
    await env.DB.prepare("SELECT COUNT(*) count FROM approvals").first(),
  ).toEqual({ count: 0 });
  expect(
    await env.DB.prepare("SELECT COUNT(*) count FROM outbox").first(),
  ).toEqual({ count: 0 });
});

it("purged originals lose derived crop/text in the bounded cleanup and cannot reuse the evidence", async () => {
  const ready = await service().create(authority, input, "cleanup");
  await expect(
    env.DB.prepare("UPDATE postal_preflights SET report_json=NULL WHERE id=?")
      .bind(ready.id)
      .run(),
  ).rejects.toThrow(/immutable_postal_preflight/);
  await env.DB.prepare("UPDATE documents SET status='purged' WHERE id=?")
    .bind(input.documentId)
    .run();
  await cleanupPostalEvidence(env.DB);
  expect(
    await env.DB.prepare("SELECT report_json FROM postal_preflights WHERE id=?")
      .bind(ready.id)
      .first(),
  ).toEqual({ report_json: null });
  await expect(service().crop(authority, ready.id)).rejects.toThrow();
  expect((await service().get(authority, ready.id)).canTransfer).toBe(false);
});

it.each(["get", "crop"] as const)(
  "revocation during final document read prevents a %s response",
  async (method) => {
    const ready = await service().create(authority, input, "private-read");
    const original = domain.getDocument.bind(domain);
    vi.spyOn(domain, "getDocument").mockImplementationOnce(async (...args) => {
      const document = await original(...args);
      await env.DB.prepare("DELETE FROM browser_sessions").run();
      return document;
    });
    await expect(service()[method](authority, ready.id)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  },
);

it("accepts the shared idempotency key contract without an invented ASCII restriction", async () => {
  const result = await service().create(
    authority,
    input,
    "préparation numéro 1 / a?b",
  );
  expect(result.status).toBe("review_required");
  for (const invalid of ["", "x".repeat(201), "line\nfeed", "zero\0byte"])
    await expect(
      service().create(authority, input, invalid),
    ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
  expect(await renders()).toBe(1);
});

it("selects the right window per letter and retains it through rendering, transfer and quote", async () => {
  const rightInput: PostalReviewInput = {
    ...input,
    options: { ...input.options, addressPosition: "right" },
  };
  const requirements = await service().requirements(authority, "LU", "right");
  expect(requirements.profile).toMatchObject({
    addressPosition: "right",
    addressPositions: ["left", "right"],
  });
  expect(requirements.layout.address.x).toBe(118);
  const review = await service().create(authority, rightInput, "right-window");
  expect(review.options.addressPosition).toBe("right");
  const renderedRequest = renderer.mock.calls[0][0] as Request;
  expect(
    JSON.parse(renderedRequest.headers.get("X-Guteneo-Pingen-Options")!),
  ).toMatchObject({ addressPosition: "right" });
  await expect(
    service().create(
      authority,
      {
        ...rightInput,
        options: { ...rightInput.options, addressPosition: "left" },
      },
      "right-window",
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const prepared = await service().transfer(authority, review.id, {
    reviewed: true,
    consentToTransfer: true,
  });
  expect(prepared.transferStatus).toBe("prepared");
  const created = calls.find(
    (call) =>
      call.method === "POST" && call.url.endsWith("/deliveries/letters"),
  );
  expect(JSON.parse(String(created!.body)).data.attributes).toMatchObject({
    address_position: "right",
    auto_send: false,
  });
  const prepare = vi
    .spyOn(domain, "prepareDispatch")
    .mockRejectedValueOnce(new Error("postal_document_not_ready"));
  await expect(
    service().quote(authority, review.id, "right-quote"),
  ).rejects.toMatchObject({ code: "POSTAL_DRAFT_NOT_READY" });
  expect(prepare.mock.calls[0][1].options).toMatchObject({
    addressPosition: "right",
  });
});

it("does not change a reviewed letter when only the account default window changes", async () => {
  const review = await service().create(authority, input, "stable-window");
  profilePosition = "right";
  const prepared = await service().transfer(authority, review.id, {
    reviewed: true,
    consentToTransfer: true,
  });
  expect(prepared.transferStatus).toBe("prepared");
  expect(prepared.options.addressPosition).toBe("left");
});

it("refuses a left window on a French account before rendering or uploading", async () => {
  profileCountry = "FR";
  profilePosition = "right";
  env.PINGEN_DEFAULT_COUNTRY = "FR";
  expect((await service().requirements(authority, "DE")).profile).toMatchObject(
    { addressPosition: "right", addressPositions: ["right"] },
  );
  await expect(
    service().create(
      authority,
      { ...input, options: { ...input.options, addressPosition: "left" } },
      "unsupported-left",
    ),
  ).rejects.toMatchObject({ code: "POSTAL_PROFILE_UNQUALIFIED" });
  expect(renderer).not.toHaveBeenCalled();
  expect(transfers()).toHaveLength(0);
});
