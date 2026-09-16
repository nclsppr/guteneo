import { readFileSync } from "node:fs";
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
import {
  createLiveProviderHook,
  preparePostalDraft,
  serveProviderMedia,
  type LiveProviderEnv,
  type PreparePostalDraftInput,
} from "../../apps/api/src/live-providers";
import {
  canonicalJson,
  DomainService,
  sha256,
  type ActorContext,
  type Channel,
  type Dispatch,
  type ProviderHook,
} from "../../packages/domain/src/index";
import { validateRecipient } from "../../packages/contracts/src/content";
import type { Fetcher } from "../../packages/providers";

let mf: Miniflare;
let db: D1Database;
let bucket: R2Bucket;
let domain: DomainService;
let env: LiveProviderEnv;
let pdfBytes: Uint8Array<ArrayBuffer>;
let documentSha: string;
const ctx: ActorContext = {
  organizationId: "org_live_fixture",
  userId: "user_fixture",
  role: "admin",
  actor: "browser",
};
const postalRecipient = {
  name: "Fixture Recipient",
  line1: "1 Fixture Street",
  postalCode: "00000",
  city: "Fixture City",
  country: "FR",
};
const postalOptions = {
  addressPosition: "left",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
} as const;
const expectedAddress =
  "Fixture Recipient\n1 Fixture Street\n00000 Fixture City";
const json = (value: unknown, status = 200) => Response.json(value, { status });
async function applySql(sql: string) {
  let statement = "";
  let trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete migration fixture");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const migration of [
    "0001_core",
    "0003_operations",
    "0004_core_hardening",
    "0005_content_limits",
    "0006_maintenance",
    "0007_live_drafts",
  ])
    await applySql(
      readFileSync(
        new URL(`../../migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdfBytes = new Uint8Array(await pdf.save());
  documentSha = await sha256(pdfBytes);
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    "document_access_grants",
    "provider_drafts",
    "provider_events",
    "attempts",
    "outbox",
    "reservations",
    "approvals",
    "idempotency_keys",
    "audit_log",
    "dispatches",
    "campaigns",
    "documents",
    "suppressions",
    "senders",
    "channel_controls",
    "usage",
    "memberships",
    "users",
    "organizations",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
    .bind(ctx.organizationId, now)
    .run();
  await db
    .prepare(
      "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
    )
    .bind(ctx.userId, now)
    .run();
  await db
    .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
    .bind(ctx.organizationId, ctx.userId, now)
    .run();
  for (const [channel, address] of [
    ["fax", "+33100000000"],
    ["email", "sender@example.invalid"],
    ["postal", "Fixture return address"],
  ]) {
    await db
      .prepare(
        "INSERT INTO senders VALUES(?,?,?,'Fixture',?,'verified','production',?)",
      )
      .bind(`sender_${channel}`, ctx.organizationId, channel, address, now)
      .run();
    await db
      .prepare("INSERT INTO channel_controls VALUES(?,?,1)")
      .bind(ctx.organizationId, channel)
      .run();
    await db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,100,100000,'EUR')",
      )
      .bind(ctx.organizationId, channel, now.slice(0, 7))
      .run();
  }
  domain = new DomainService(db, { mode: "production" });
  await domain.registerDocument(ctx, {
    id: "doc_fixture",
    name: "exact.pdf",
    sha256: documentSha,
    size: pdfBytes.length,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey: "fixture/exact.pdf",
    scanVerified: true,
  });
  await bucket.put("fixture/exact.pdf", pdfBytes);
  env = {
    DB: db,
    DOCUMENTS: bucket,
    ENVIRONMENT: "staging",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    LIVE_SENDS_ENABLED: "true",
    TELNYX_API_KEY: "test-only",
    TELNYX_CONNECTION_ID: "connection-fixture",
    TELNYX_FROM: "+33100000000",
    TELNYX_ALLOWED_PREFIXES: "+33,+352,+49",
    AWS_ACCESS_KEY_ID: "TESTKEY",
    AWS_SECRET_ACCESS_KEY: "test-only",
    AWS_REGION: "eu-west-1",
    SES_CONFIGURATION_SET: "fixture",
    SES_SANDBOX: "true",
    PINGEN_CLIENT_ID: "test-client",
    PINGEN_CLIENT_SECRET: "test-only",
    PINGEN_ORGANIZATION_ID: "pingen-fixture",
    PINGEN_SANDBOX: "true",
    PINGEN_UPLOAD_ORIGINS: "https://objects.cloudscale.ch",
  } as LiveProviderEnv;
});

/** Fixture-only insertion bypasses the deliberately closed live-pricing preparation gate.
 * Approval and acceptance still execute the real SQL reservation/outbox triggers. */
async function queueFixture(
  channel: Channel,
  options: Record<string, unknown> = {},
  recipientOverride?: Record<string, unknown>,
): Promise<Dispatch> {
  const recipient = validateRecipient(
    channel,
    recipientOverride ??
      (channel === "fax"
        ? { phone: "+33100000001" }
        : channel === "email"
          ? { email: "recipient@example.invalid" }
          : postalRecipient),
  );
  const id = `dsp_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const sender = await db
    .prepare("SELECT address FROM senders WHERE id=?")
    .bind(`sender_${channel}`)
    .first<{ address: string }>();
  const frozen = {
    channel,
    recipient,
    documentId: "doc_fixture",
    documentSha256: documentSha,
    senderId: `sender_${channel}`,
    senderAddress: sender!.address,
    subject: channel === "email" ? "Fixture subject" : null,
    html: channel === "email" ? "<p>Approved HTML.</p>" : null,
    text: channel === "email" ? "Approved text." : null,
    options,
    campaignId: null,
    estimatedMinor: 100,
    ceilingMinor: 200,
    currency: "EUR",
    mode: "production",
  };
  const fingerprint = await sha256(canonicalJson(frozen));
  await db
    .prepare(
      "INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'prepared','production',100,200,'EUR',?,?,?,?,?)",
    )
    .bind(
      id,
      ctx.organizationId,
      channel,
      canonicalJson(recipient),
      "doc_fixture",
      frozen.senderId,
      frozen.senderAddress,
      frozen.subject,
      frozen.html,
      frozen.text,
      canonicalJson(options),
      fingerprint,
      id,
      fingerprint,
      now,
      now,
    )
    .run();
  await domain.approveDispatch(ctx, id, fingerprint);
  return domain.confirmDispatch(ctx, id, `confirm-${id}`);
}
function pingenFixtureFetch() {
  return vi.fn<Fetcher>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/access-tokens"))
      return json({ access_token: "fixture-access", expires_in: 43200 });
    if (url.endsWith("/file-upload"))
      return json({
        data: {
          attributes: {
            url: "https://objects.cloudscale.ch/fixture.pdf?signature=fixture",
            url_signature: "fixture-signature",
          },
        },
      });
    if (url.startsWith("https://objects.cloudscale.ch/"))
      return new Response("", { status: 200 });
    if (url.endsWith("/deliveries/letters") && method === "POST")
      return json(
        {
          data: { id: "letter-fixture", attributes: { status: "processing" } },
        },
        201,
      );
    if (url.endsWith("/letters/letter-fixture"))
      return json({
        data: {
          id: "letter-fixture",
          attributes: {
            address: expectedAddress,
            country: "FR",
            paper_types: ["normal"],
            status: "valid",
          },
          meta: { abilities: { self: { submit: "ok" } } },
        },
      });
    if (url.endsWith("/price-calculator"))
      return json({ data: { attributes: { currency: "EUR", price: "1.23" } } });
    if (url.endsWith("/letter-fixture/send")) return json({}, 202);
    throw new Error("Unexpected fixture endpoint");
  });
}
const draftInput = (): PreparePostalDraftInput => ({
  documentId: "doc_fixture",
  senderId: "sender_postal",
  recipient: postalRecipient,
  options: postalOptions,
  ceilingMinor: 200,
  idempotencyKey: "draft-fixture",
});

describe("Live provider bridge — real D1/R2, intercepted external fetch only", () => {
  it.each([
    { ENVIRONMENT: "local" },
    { MODE: "simulation" },
    { LIVE_SENDS_ENABLED: "false" },
    { LIVE_SENDS_ENABLED: undefined },
  ])(
    "fails the activation gate without external calls: %j",
    async (override) => {
      const row = await queueFixture("fax");
      const fetcher = vi.fn<Fetcher>();
      const result = await createLiveProviderHook(
        { ...env, ...override } as LiveProviderEnv,
        "fax",
        { fetcher },
      ).submit(row);
      expect(result).toEqual({
        status: "rejected",
        errorCode: "LIVE_TRANSPORT_DISABLED",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("cannot send a queued row directly without the durable active approved attempt", async () => {
    const fetcher = vi.fn<Fetcher>();
    expect(
      await createLiveProviderHook(env, "fax", { fetcher }).submit(
        await queueFixture("fax"),
      ),
    ).toMatchObject({ errorCode: "ACTIVE_APPROVED_ATTEMPT_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("submits Telnyx with the frozen sender and creates a hashed, scoped, expiring media capability", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>(async () =>
      json({ data: { id: "fax-fixture", status: "queued" } }, 202),
    );
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "fax", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      from: "+33100000000",
      to: "+33100000001",
      connection_id: "connection-fixture",
      webhook_url: "https://guteneo.example/webhooks/telnyx",
    });
    const media = new URL(payload.media_url);
    const token = media.pathname.split("/").at(-1)!;
    expect(media.origin).toBe("https://guteneo.example");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const grant = await db
      .prepare("SELECT * FROM document_access_grants")
      .first();
    expect(grant).toMatchObject({
      token_hash: await sha256(token),
      document_id: "doc_fixture",
      dispatch_id: row.id,
      organization_id: ctx.organizationId,
      provider: "telnyx",
      document_sha256: documentSha,
    });
    expect(JSON.stringify(grant)).not.toContain(token);
    const response = await serveProviderMedia(env, new Request(media), token);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(
      (
        await serveProviderMedia(env, new Request(media), token, {
          now: () => Date.now() + 46 * 60_000,
        })
      ).status,
    ).toBe(404);
    expect(
      (await serveProviderMedia(env, new Request(media), "a".repeat(43)))
        .status,
    ).toBe(404);
    expect(
      (
        await serveProviderMedia(
          env,
          new Request(media, { method: "HEAD" }),
          token,
        )
      ).status,
    ).toBe(404);
    await db
      .prepare("UPDATE dispatches SET status='delivered' WHERE id=?")
      .bind(row.id)
      .run();
    expect(
      (await serveProviderMedia(env, new Request(media), token)).status,
    ).toBe(404);
  });

  it("blocks missing scan evidence and changed R2 content before provider submission", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>();
    await db
      .prepare("DELETE FROM audit_log WHERE action='document.scan_verified'")
      .run();
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "fax", { fetcher }),
      ),
    ).toMatchObject({ status: "failed" });
    expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject({
      error_code: "VERIFIED_SCAN_REQUIRED",
    });
    const second = await queueFixture("fax");
    await db
      .prepare(
        "INSERT INTO audit_log VALUES('scan',?,NULL,'document.scan_verified',?,'{}',?)",
      )
      .bind(ctx.organizationId, documentSha, new Date().toISOString())
      .run();
    const altered = pdfBytes.slice();
    altered[20] ^= 1;
    await bucket.put("fixture/exact.pdf", altered);
    await domain.processDispatch(
      second.id,
      createLiveProviderHook(env, "fax", { fetcher }),
    );
    expect(
      (await domain.getDispatch(ctx, second.id)).attempts[0],
    ).toMatchObject({ error_code: "DOCUMENT_INTEGRITY_MISMATCH" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a sender/config mismatch and a forged approval fingerprint without network", async () => {
    const fetcher = vi.fn<Fetcher>();
    const row = await queueFixture("fax");
    await domain.processDispatch(
      row.id,
      createLiveProviderHook({ ...env, TELNYX_FROM: "+49100000000" }, "fax", {
        fetcher,
      }),
    );
    expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject({
      error_code: "FAX_SENDER_CONFIG_MISMATCH",
    });
    const other = await queueFixture("fax");
    const live = createLiveProviderHook(env, "fax", { fetcher });
    await domain.processDispatch(other.id, {
      name: live.name,
      submit: (active) =>
        live.submit({
          ...active,
          recipient_json: canonicalJson({ phone: "+49100000001" }),
        }),
    });
    expect((await domain.getDispatch(ctx, other.id)).attempts[0]).toMatchObject(
      { error_code: "ACTIVE_APPROVED_ATTEMPT_REQUIRED" },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows only one invocation under concurrent bridge calls and retains unknown outcomes", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("lost response");
    });
    const hook = createLiveProviderHook(env, "fax", { fetcher });
    const results: Awaited<ReturnType<ProviderHook["submit"]>>[] = [];
    await domain.processDispatch(row.id, {
      name: hook.name,
      async submit(active) {
        results.push(
          ...(await Promise.all([hook.submit(active), hook.submit(active)])),
        );
        return results[0];
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      results.every((result) => result.status === "submission_unknown"),
    ).toBe(true);
    expect(
      results.some((result) => result.errorCode === "ATTEMPT_ALREADY_INVOKED"),
    ).toBe(true);
    expect(
      (await db
        .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
        .bind(row.id)
        .first())!.status,
    ).toBe("reserved");
  });

  it("sends SES one frozen recipient and unmodified HTML, text and optional PDF attachment", async () => {
    const row = await queueFixture("email");
    const fetcher = vi.fn<Fetcher>(async () =>
      json({ MessageId: "ses-fixture" }),
    );
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "email", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    const request = fetcher.mock.calls[0][0] as Request;
    const payload = (await request.json()) as {
      FromEmailAddress: string;
      Destination: { ToAddresses: string[] };
      Content: {
        Simple: {
          Body: {
            Html: { Charset: string; Data: string };
            Text: { Charset: string; Data: string };
          };
          Attachments: { RawContent: string }[];
        };
      };
    };
    expect(payload.FromEmailAddress).toBe("sender@example.invalid");
    expect(payload.Destination).toEqual({
      ToAddresses: ["recipient@example.invalid"],
    });
    expect(payload.Content.Simple.Body).toEqual({
      Html: { Charset: "UTF-8", Data: "<p>Approved HTML.</p>" },
      Text: { Charset: "UTF-8", Data: "Approved text." },
    });
    expect(payload.Content.Simple.Attachments).toHaveLength(1);
    expect(
      Uint8Array.from(
        atob(payload.Content.Simple.Attachments[0].RawContent),
        (character) => character.charCodeAt(0),
      ),
    ).toEqual(pdfBytes);
    expect(request.headers.get("Authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("persists a Pingen non-sending draft and only submits a matching frozen, tenant-bound draft", async () => {
    const fetcher = pingenFixtureFetch();
    const prepared = await preparePostalDraft(env, domain, ctx, draftInput(), {
      fetcher,
    });
    expect(prepared).toMatchObject({
      preparedLetterId: "letter-fixture",
      expectedAddress,
      documentSha256: documentSha,
      ceilingMinor: 200,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      new Uint8Array(fetcher.mock.calls[2][1]?.body as ArrayBuffer),
    ).toEqual(pdfBytes);
    expect(
      JSON.parse(String(fetcher.mock.calls[3][1]?.body)).data.attributes
        .auto_send,
    ).toBe(false);
    expect(
      await preparePostalDraft(env, domain, ctx, draftInput(), { fetcher }),
    ).toEqual(prepared);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const row = await queueFixture("postal", {
      ...postalOptions,
      providerDraftId: prepared.providerDraftId,
      preparedLetterId: prepared.preparedLetterId,
      expectedAddress,
    });
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "postal", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/file-upload"),
      ),
    ).toHaveLength(1);
    const [, sent] = fetcher.mock.calls[7];
    expect(sent?.method).toBe("PATCH");
    expect(new Headers(sent?.headers).get("Idempotency-Key")).toBe(row.id);
    expect(JSON.parse(String(sent?.body)).data.attributes).toEqual({
      delivery_product: "cheap",
      print_mode: "duplex",
      print_spectrum: "grayscale",
    });
    const reused = await queueFixture("postal", {
      ...postalOptions,
      providerDraftId: prepared.providerDraftId,
      preparedLetterId: prepared.preparedLetterId,
      expectedAddress,
    });
    await domain.processDispatch(
      reused.id,
      createLiveProviderHook(env, "postal", { fetcher }),
    );
    expect(
      (await domain.getDispatch(ctx, reused.id)).attempts[0],
    ).toMatchObject({ error_code: "POSTAL_DRAFT_ALREADY_USED" });
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it("does not trust a supplied provider letter ID, changed recipient or missing persisted draft", async () => {
    const draftFetch = pingenFixtureFetch();
    const prepared = await preparePostalDraft(env, domain, ctx, draftInput(), {
      fetcher: draftFetch,
    });
    const fetcher = vi.fn<Fetcher>();
    for (const patch of [
      { providerDraftId: "foreign-draft" },
      { preparedLetterId: "unowned-letter" },
      { expectedAddress: "Other address" },
      { printMode: "simplex" },
    ]) {
      const row = await queueFixture("postal", {
        ...postalOptions,
        providerDraftId: prepared.providerDraftId,
        preparedLetterId: prepared.preparedLetterId,
        expectedAddress,
        ...patch,
      });
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "postal", { fetcher }),
      );
      expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject(
        { error_code: "POSTAL_DRAFT_APPROVAL_MISMATCH" },
      );
    }
    const changed = await queueFixture(
      "postal",
      {
        ...postalOptions,
        providerDraftId: prepared.providerDraftId,
        preparedLetterId: prepared.preparedLetterId,
        expectedAddress,
      },
      { ...postalRecipient, name: "Different recipient" },
    );
    await domain.processDispatch(
      changed.id,
      createLiveProviderHook(env, "postal", { fetcher }),
    );
    expect(
      (await domain.getDispatch(ctx, changed.id)).attempts[0],
    ).toMatchObject({ error_code: "POSTAL_DRAFT_APPROVAL_MISMATCH" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires a human document-transfer request and never retries an uncertain draft automatically", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("lost draft response");
    });
    await expect(
      preparePostalDraft(env, domain, { ...ctx, actor: "mcp" }, draftInput(), {
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "HUMAN_DOCUMENT_TRANSFER_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      preparePostalDraft(env, domain, ctx, draftInput(), { fetcher }),
    ).rejects.toMatchObject({ code: "POSTAL_DRAFT_RECONCILIATION_REQUIRED" });
    expect(
      (await db.prepare("SELECT status FROM provider_drafts").first())!.status,
    ).toBe("unknown");
    await expect(
      preparePostalDraft(env, domain, ctx, draftInput(), { fetcher }),
    ).rejects.toMatchObject({ code: "POSTAL_DRAFT_RECONCILIATION_REQUIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      preparePostalDraft(
        env,
        domain,
        ctx,
        { ...draftInput(), ceilingMinor: 201 },
        { fetcher },
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps the production tariff gate closed even when all provider environment values are present", async () => {
    await expect(
      domain.prepareDispatch(
        ctx,
        {
          channel: "fax",
          recipient: { phone: "+33100000001" },
          documentId: "doc_fixture",
        },
        "real-prepare",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
});
