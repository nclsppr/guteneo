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
import { PDFDocument, PDFName, PDFDict, PDFArray } from "pdf-lib";
import {
  qualifyPingenSynthetic,
  PINGEN_QUALIFICATION as Q,
  type PingenQualificationConfig,
} from "../../packages/providers/pingen-qualification";
import {
  PINGEN_SYNTHETIC_SHA256,
  pingenSyntheticPdf,
} from "../../packages/providers/pingen-synthetic-pdf";
import type { Fetcher } from "../../packages/providers/types";

// Genuine local R2 conditional writes, entirely fictional intercepted provider responses.
let mf: Miniflare;
let bucket: R2Bucket;
const START = Date.parse("2026-09-17T04:00:00.000Z");
const config: PingenQualificationConfig = {
  clientId: "fixture-private-client",
  clientSecret: "fixture-private-secret",
  organisationId: "fixture-org",
  environment: "production",
  mode: "production",
  sandbox: "false",
  liveSendsEnabled: "false",
  uploadOrigins: Q.uploadOrigin,
};
const token = {
  token_type: "Bearer",
  access_token: "fixture-bearer",
  expires_in: 3600,
  scope: "organisation_read letter",
};
const profile = {
  data: {
    id: config.organisationId,
    type: "organisations",
    attributes: {
      billing_currency: "EUR",
      default_country: "LU",
      default_address_position: "left",
    },
  },
};
const upload = {
  data: {
    type: "file_uploads",
    attributes: {
      url: `${Q.uploadOrigin}/PRIVATE_PATH?SECRET_SIGNATURE`,
      url_signature: "PRIVATE_SIGNATURE",
    },
  },
};
const created = { data: { type: "letters", id: "fixture-created-letter" } };
const details = () => ({
  data: {
    id: "fixture-created-letter",
    type: "letters",
    attributes: {
      file_original_name: String(Q.filename),
      submitted_at: null,
      created_at: new Date(START).toISOString(),
      address: "ATELIER EXEMPLE\nRue du Test 12\nL-1234 LUXEMBOURG",
      country: "LU",
      file_pages: 1,
      paper_types: ["normal"],
      fonts: [{ name: "PRIVATE_FONT", is_embedded: true }],
      status: "PRIVATE_STATUS",
    },
    relationships: {
      organisation: {
        data: { type: "organisations", id: config.organisationId },
      },
    },
    meta: {
      abilities: { self: { delete: "ok", submit: "ok", "get-pdf-raw": "ok" } },
    },
    links: { self: "https://private.invalid/PRIVATE_LINK" },
  },
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
function mocked(responses: (unknown | (() => unknown | Promise<unknown>))[]) {
  return vi.fn<Fetcher>(async () => {
    let value = responses.shift();
    if (typeof value === "function") value = await value();
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    if (value === undefined) throw new Error("unexpected fixture request");
    return json(value);
  });
}
const transport = () =>
  mocked([
    token,
    profile,
    upload,
    new Response(null, { status: 200 }),
    json(created, 201),
  ]);
const run = (
  phase: string,
  fetcher: Fetcher,
  overrides: Partial<PingenQualificationConfig> = {},
  now: () => number = () => START,
  storage = bucket,
) =>
  qualifyPingenSynthetic(
    { ...config, ...overrides },
    storage,
    { phase },
    { fetcher, now },
  );
const journal = async () =>
  (await bucket.get(Q.journalKey))!.json<Record<string, unknown>>();
const updateJournal = async (changes: Record<string, unknown>) =>
  bucket.put(
    Q.journalKey,
    JSON.stringify({ ...(await journal()), ...changes }),
  );
async function seed() {
  expect((await run("create", transport())).status).toBe("ok");
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "pingen-qualification-test",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-17",
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
});
beforeEach(async () => {
  await bucket.delete(Q.journalKey);
});
afterAll(async () => {
  await mf.dispose();
});

describe("fixed Pingen provider qualification", () => {
  it("contains exactly the reviewed one-page PDF with embedded fonts and frozen SHA", async () => {
    const bytes = pingenSyntheticPdf();
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", bytes),
    ).toString("hex");
    expect(hash).toBe(PINGEN_SYNTHETIC_SHA256);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((210 * 72) / 25.4, 5);
    const fontMap = doc
      .getPage(0)
      .node.Resources()!
      .lookup(PDFName.of("Font"), PDFDict);
    expect(fontMap.entries().length).toBeGreaterThan(0);
    for (const [, ref] of fontMap.entries()) {
      const font = doc.context.lookup(ref, PDFDict);
      const descendants = font.lookup(PDFName.of("DescendantFonts"), PDFArray);
      const descriptor = descendants
        .lookup(0, PDFDict)
        .lookup(PDFName.of("FontDescriptor"), PDFDict);
      expect(descriptor.has(PDFName.of("FontFile2"))).toBe(true);
    }
  });
  it("claims durably before upload and creates one unsubmitted fixed document without leaking secrets", async () => {
    const fetcher = transport();
    const result = await run("create", fetcher);
    expect(result).toMatchObject({
      status: "ok",
      state: "created",
      canSend: false,
      liveSendingVerified: false,
      appJourneyVerified: false,
    });
    const calls = fetcher.mock.calls;
    expect(calls).toHaveLength(5);
    expect(new URLSearchParams(String(calls[0][1]?.body)).get("scope")).toBe(
      "letter organisation_read",
    );
    expect(new Headers(calls[3][1]?.headers).has("Authorization")).toBe(false);
    expect(calls[3][1]?.body).toEqual(pingenSyntheticPdf());
    expect(JSON.parse(String(calls[4][1]?.body)).data.attributes).toEqual({
      file_original_name: Q.filename,
      file_url: upload.data.attributes.url,
      file_url_signature: "PRIVATE_SIGNATURE",
      address_position: "left",
      auto_send: false,
    });
    for (const [url, init] of calls) {
      expect(String(url)).not.toMatch(
        /\/(send|cancel|apply-preset|batches)(\/|$)/,
      );
      expect(init?.redirect).toBe("manual");
    }
    expect(JSON.stringify([result, await journal()])).not.toMatch(
      /fixture-private|fixture-bearer|PRIVATE_PATH|PRIVATE_SIGNATURE|SECRET_SIGNATURE/,
    );
  });
  it("uses real R2 if-none-match to admit exactly one of simultaneous creates", async () => {
    const fetcher = vi.fn<Fetcher>(async (url, init) => {
      if (String(url).includes("access-tokens")) return json(token);
      if (String(url).endsWith(`/organisations/${config.organisationId}`))
        return json(profile);
      if (String(url).endsWith("/file-upload")) return json(upload);
      if (init?.method === "PUT") return new Response();
      return json(created, 201);
    });
    const results = await Promise.all([
      run("create", fetcher),
      run("create", fetcher),
    ]);
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/deliveries/letters"),
      ),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
    expect((await run("create", mocked([]))).error?.code).toBe(
      "already_claimed",
    );
  });
  it("blocks all network when R2 claim outcome is uncertain", async () => {
    const fetcher = transport();
    const storage = {
      get: bucket.get.bind(bucket),
      put: async () => {
        throw new Error("PRIVATE_STORAGE_ERROR");
      },
    } as Pick<R2Bucket, "get" | "put">;
    const result = await qualifyPingenSynthetic(
      config,
      storage,
      { phase: "create" },
      { fetcher, now: () => START },
    );
    expect(result.error?.code).toBe("journal_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains an unknown POST and never creates again, including after expiry", async () => {
    const fetcher = mocked([
      token,
      profile,
      upload,
      new Response(),
      new Error("PRIVATE_NETWORK_ERROR"),
    ]);
    expect((await run("create", fetcher)).state).toBe("create_unknown");
    expect((await journal()).state).toBe("create_unknown");
    const retry = mocked([]);
    expect((await run("create", retry)).error?.code).toBe("already_claimed");
    expect(
      (await run("create", retry, {}, () => Date.parse(Q.createBefore))).error
        ?.code,
    ).toBe("expired");
    expect(retry).not.toHaveBeenCalled();
  });
  it("preserves a known created ID when the first journal completion write fails", async () => {
    let writes = 0;
    const storage = {
      get: bucket.get.bind(bucket),
      put: (...args: Parameters<R2Bucket["put"]>) => {
        if (++writes === 2)
          throw new Error("fixture write failed before commit");
        return bucket.put(...args);
      },
    } as Pick<R2Bucket, "get" | "put">;
    const result = await qualifyPingenSynthetic(
      config,
      storage,
      { phase: "create" },
      { fetcher: transport(), now: () => START },
    );
    expect(result.state).toBe("create_unknown");
    expect((await journal()).providerId).toBe("fixture-created-letter");
    expect(
      (
        await run(
          "cleanup",
          mocked([token, details(), new Response(null, { status: 204 })]),
        )
      ).state,
    ).toBe("deleted");
  });
  it.each([
    undefined,
    "https://evil.invalid/pdf",
    `${Q.uploadOrigin}@evil.invalid/pdf`,
    `${Q.uploadOrigin}/x#fragment`,
  ])("refuses unqualified upload target %s", async (url) => {
    const fetcher = mocked([
      token,
      profile,
      {
        data: {
          type: "file_uploads",
          attributes: { url, url_signature: "SECRET" },
        },
      },
    ]);
    expect((await run("create", fetcher)).status).toBe("error");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rechecks the create deadline after awaited profile access before any upload", async () => {
    let current = START;
    const fetcher = mocked([
      token,
      () => {
        current = Date.parse(Q.createBefore);
        return profile;
      },
    ]);
    expect((await run("create", fetcher, {}, () => current)).error?.code).toBe(
      "expired",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { sandbox: "true" },
    { liveSendsEnabled: "true" },
    { environment: "local" },
    { mode: "simulation" },
    { uploadOrigins: `${Q.uploadOrigin},https://evil.invalid` },
  ])("rejects invalid config without network %j", async (override) => {
    const fetcher = mocked([]);
    expect((await run("calculator", fetcher, override)).error?.code).toBe(
      "configuration_invalid",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects arbitrary RPC input and changed organisation", async () => {
    const fetcher = mocked([]);
    expect(
      (
        await qualifyPingenSynthetic(
          config,
          bucket,
          { phase: "create", providerId: "foreign" },
          { fetcher, now: () => START },
        )
      ).error?.code,
    ).toBe("input_invalid");
    await seed();
    expect(
      (await run("cleanup", fetcher, { organisationId: "other" })).error?.code,
    ).toBe("journal_invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("projects only calculator EUR minor units, without creating a letter or journal", async () => {
    const fetcher = mocked([
      token,
      profile,
      {
        data: {
          type: "letter_price_calculator",
          attributes: { currency: "EUR", price: 1.23, secret: "PRIVATE_PRICE" },
        },
      },
    ]);
    const result = await run("calculator", fetcher);
    expect(result.price).toEqual({ currency: "EUR", minor: 123 });
    expect(await bucket.get(Q.journalKey)).toBeNull();
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("/price-calculator");
  });
  it("never treats calculator202 or a foreign currency as a quote", async () => {
    expect(
      (
        await run(
          "calculator",
          mocked([token, profile, new Response(null, { status: 202 })]),
        )
      ).error?.code,
    ).toBe("price_pending");
    expect(
      (
        await run(
          "calculator",
          mocked([
            token,
            profile,
            {
              data: {
                type: "letter_price_calculator",
                attributes: { currency: "USD", price: 1.23 },
              },
            },
          ]),
        )
      ).price,
    ).toBeUndefined();
  });
  it("reads only the created draft and observes a preview redirect without following or exposing it", async () => {
    await seed();
    const fetcher = mocked([
      token,
      details(),
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/SECRET_LOCATION" },
      }),
    ]);
    const result = await run("inspect", fetcher);
    expect(result.draft).toEqual({
      addressMatches: true,
      countryMatches: true,
      pages: 1,
      normalPaper: true,
      fontsEmbedded: true,
      deleteAllowed: true,
      readyForSending: true,
      previewRedirectObserved: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|SECRET|fixture-created|https?:/,
    );
  });
  it.each([
    "organisation",
    "id",
    "filename",
    "createdAt",
    "submitted",
    "deleteAbility",
  ])("refuses cleanup with invalid %s provenance", async (change) => {
    await seed();
    const detail = details();
    if (change === "organisation")
      detail.data.relationships.organisation.data.id = "other-org";
    if (change === "id") detail.data.id = "other-letter";
    if (change === "filename")
      detail.data.attributes.file_original_name = "other.pdf";
    if (change === "createdAt")
      detail.data.attributes.created_at = "2020-01-01T00:00:00Z";
    if (change === "submitted")
      Object.assign(detail.data.attributes, {
        submitted_at: "2026-09-17T04:01:00Z",
      });
    if (change === "deleteAbility")
      detail.data.meta.abilities.self.delete = "permission";
    const fetcher = mocked([token, detail]);
    expect((await run("cleanup", fetcher)).status).toBe("error");
    expect(
      fetcher.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });
  it("allows inspection and cleanup after creation expiry, retains the tombstone and denies replay", async () => {
    await seed();
    const late = () => Date.parse("2027-01-01T00:00:00Z");
    expect(
      (
        await run(
          "inspect",
          mocked([token, details(), new Response(null, { status: 302 })]),
          {},
          late,
        )
      ).status,
    ).toBe("ok");
    const fetcher = mocked([
      token,
      details(),
      new Response(null, { status: 204 }),
    ]);
    expect((await run("cleanup", fetcher, {}, late)).state).toBe("deleted");
    const after = mocked([]);
    expect((await run("cleanup", after, {}, late)).state).toBe("deleted");
    expect(after).not.toHaveBeenCalled();
    expect((await journal()).state).toBe("deleted");
  });
  it("serializes concurrent cleanup via real R2 CAS and reconciles lost DELETE204", async () => {
    await seed();
    const fetcher = vi.fn<Fetcher>(async (url, init) => {
      if (String(url).includes("access-tokens")) return json(token);
      if (init?.method === "DELETE") throw new Error("lost DELETE response");
      return json(details());
    });
    await Promise.all([run("cleanup", fetcher), run("cleanup", fetcher)]);
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(1);
    expect((await journal()).state).toBe("delete_unknown");
    const reconcile = mocked([token, new Response(null, { status: 404 })]);
    expect((await run("cleanup", reconcile)).state).toBe("deleted");
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
  it("recovers an abandoned deletion claim explicitly after its short lease", async () => {
    await seed();
    await updateJournal({ state: "delete_claimed", deleteClaimedAt: START });
    expect((await run("cleanup", mocked([token, details()]))).error?.code).toBe(
      "cleanup_pending",
    );
    expect(
      (
        await run(
          "cleanup",
          mocked([token, details(), new Response(null, { status: 204 })]),
          {},
          () => START + 120_001,
        )
      ).state,
    ).toBe("deleted");
  });
  it("rejects broad token scopes, malformed/oversized JSON and all non-preview redirects", async () => {
    expect(
      (
        await run(
          "calculator",
          mocked([{ ...token, scope: "letter organisation_read webhook" }]),
        )
      ).error?.code,
    ).toBe("scope_mismatch");
    expect(
      (await run("calculator", mocked([new Response("x".repeat(65537))]))).error
        ?.code,
    ).toBe("response_invalid");
    expect(
      (
        await run(
          "calculator",
          mocked([
            new Response(null, {
              status: 302,
              headers: { Location: "https://evil.invalid" },
            }),
          ]),
        )
      ).error?.httpStatus,
    ).toBe(302);
  });
  it("bounds a hanging response body without exposing its partial content", async () => {
    const fetcher = mocked([
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("PRIVATE_PARTIAL"));
          },
        }),
      ),
    ]);
    const result = await run("calculator", fetcher);
    expect(result.error?.code).toBe("request_timeout");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
