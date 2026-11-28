import { readdirSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { it, expect, vi } from "vitest";
import {
  createLiveProviderHook,
  type LiveProviderEnv,
} from "../../apps/api/src/live-providers";
import { DomainService, sha256 } from "../../packages/domain/src/index";
import { createFaxUsageFixture } from "../helpers/fax-usage-fixture";

it("submits a cold-start Japanese fax to the intercepted Telnyx transport after the final price, approval and PDF checks", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response()}}",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  try {
    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    const documents = (await mf.getR2Bucket(
      "DOCUMENTS",
    )) as unknown as R2Bucket;
    const directory = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      await db.batch(
        unstable_splitSqlQuery(
          readFileSync(new URL(file, directory), "utf8"),
        ).map((query) => db.prepare(query)),
      );
    }
    const fixture = await createFaxUsageFixture(db, Date.now);
    const env = {
      DB: db,
      DOCUMENTS: documents,
      APP_ORIGIN: "https://guteneo.invalid",
      MODE: "production",
      ENVIRONMENT: "staging",
      LIVE_SENDS_ENABLED: "true",
      LIVE_SEND_CHANNELS: "fax",
      TELNYX_API_KEY: "synthetic-transport",
      TELNYX_FAX_DESTINATIONS: "worldwide",
      TELNYX_ACCOUNT_ID: fixture.identity.accountId,
      TELNYX_CONNECTION_ID: fixture.identity.connectionId,
      TELNYX_OUTBOUND_VOICE_PROFILE_ID: fixture.identity.outboundProfileId,
      TELNYX_FROM: fixture.identity.senderAddress,
    } as LiveProviderEnv;
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        { data: { id: "fax-isolated-all-countries", status: "queued" } },
        { status: 202 },
      ),
    );
    const provider = createLiveProviderHook(env, "fax", { fetcher: transport });
    const domain = new DomainService(db, {
      mode: "production",
      liveFaxIdentity: provider.liveFaxIdentity,
    });
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = new Uint8Array(await doc.save());
    const documentId = crypto.randomUUID();
    const key = "test/fax.pdf";
    await documents.put(key, bytes);
    await domain.registerDocument(fixture.ctx, {
      id: documentId,
      name: "test.pdf",
      sha256: await sha256(bytes),
      size: bytes.length,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: key,
      scanVerified: true,
    });
    const draft = await domain.prepareDispatch(
      fixture.ctx,
      {
        ...fixture.input,
        documentId,
        recipient: { phone: "+81 3 1234 5678" },
        ceilingMinor: 50,
      },
      "japan-provider",
    );
    expect(draft.faxPricing).toMatchObject({
      referenceBasis: "guteneo_continuity_v1",
      estimatedHighNanoeur: 250_000_000,
    });
    await domain.approveDispatch(fixture.ctx, draft.id, draft.fingerprint);
    await domain.confirmDispatch(fixture.ctx, draft.id, "accepted-japan");
    const result = await domain.processDispatch(draft.id, provider);
    expect(result).toMatchObject({ status: "accepted" });
    expect(transport).toHaveBeenCalledOnce();
    const [url, options] = transport.mock.calls[0];
    expect(String(url)).toBe("https://api.telnyx.com/v2/faxes");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toMatchObject({
      to: "+81312345678",
      from: fixture.identity.senderAddress,
      connection_id: fixture.identity.connectionId,
      media_url: expect.stringMatching(/^https:\/\/guteneo\.invalid\/media\//),
    });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) FROM document_access_grants WHERE organization_id=? AND dispatch_id=? AND provider='telnyx'",
        )
        .bind(fixture.ctx.organizationId, draft.id)
        .first("COUNT(*)"),
    ).toBe(1);
  } finally {
    await mf.dispose();
  }
});
