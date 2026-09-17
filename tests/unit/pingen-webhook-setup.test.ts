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
import {
  configurePingenWebhooks,
  PINGEN_WEBHOOK_CATEGORIES as CATEGORIES,
  PINGEN_WEBHOOK_SETUP as SETUP,
  type PingenWebhookCategory,
  type PingenWebhookSetupConfig,
} from "../../packages/providers/pingen-webhook-setup";
import type { Fetcher } from "../../packages/providers/types";

// Genuine local R2 CAS, exclusively fictional intercepted OAuth/provider responses.
let mf: Miniflare;
let bucket: R2Bucket;
const START = Date.parse("2026-09-17T08:00:00Z");
const secret = "0123456789abcdef0123456789abcdef";
const config: PingenWebhookSetupConfig = {
  clientId: "fixture-private-client",
  clientSecret: "fixture-private-client-secret",
  organisationId: "fixture-private-organisation",
  environment: "production",
  mode: "production",
  sandbox: "false",
  liveSendsEnabled: "false",
  webhookSecret: secret,
};
const token = {
  token_type: "Bearer",
  access_token: "fixture-private-bearer",
  scope: "webhook",
};
const endpoint = `https://api.pingen.com/organisations/${config.organisationId}/webhooks`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function webhook(name: PingenWebhookCategory = "sent", suffix = "1") {
  return {
    id: `fixture-private-id-${name}-${suffix}`,
    type: "webhooks",
    attributes: {
      event_category: name,
      url: String(SETUP.callbackUrl),
      signing_key: secret,
    },
    relationships: {
      organisation: {
        data: { type: "organisations", id: config.organisationId },
      },
    },
    links: { self: "https://private.invalid/not-followed" },
  };
}
function page(
  data: unknown[] = [],
  current = 1,
  total = data.length,
  perPage = 100,
) {
  return {
    data,
    meta: {
      current_page: current,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      total,
      per_page: perPage,
    },
    links: {
      next: "https://malicious.invalid/?PRIVATE_LINK",
      self: "https://private.invalid",
    },
  };
}
type FixtureResponse = unknown | (() => unknown | Promise<unknown>);
function mocked(responses: FixtureResponse[]) {
  return vi.fn<Fetcher>(async () => {
    let value = responses.shift();
    if (typeof value === "function") value = await value();
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    if (value === undefined) throw new Error("unexpected private request");
    return json(value);
  });
}
const run = (
  input: unknown,
  fetcher: Fetcher,
  overrides: Partial<PingenWebhookSetupConfig> = {},
  storage: Pick<R2Bucket, "get" | "put"> = bucket,
  now: () => number = () => START,
) =>
  configurePingenWebhooks({ ...config, ...overrides }, storage, input, {
    fetcher,
    now,
  });
const register = (fetcher: Fetcher, name: PingenWebhookCategory = "sent") =>
  run({ action: "register", category: name }, fetcher);
const key = (name: PingenWebhookCategory = "sent") =>
  `${SETUP.journalPrefix}${name}.json`;
const journal = async (name: PingenWebhookCategory = "sent") =>
  (await bucket.get(key(name)))!.json<Record<string, unknown>>();
const createdTransport = (name: PingenWebhookCategory = "sent") =>
  mocked([token, page(), json({ data: webhook(name) }, 201)]);

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "pingen-webhooks-local-test",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-17",
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
});
beforeEach(async () => {
  await bucket.delete(CATEGORIES.map((name) => key(name)));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mf.dispose();
});

describe("private Pingen webhook setup", () => {
  it("inspects all fixed categories with no signing secret, writes nothing and requests only webhook scope", async () => {
    const fetcher = mocked([token, page()]);
    const storage = {
      get: bucket.get.bind(bucket),
      put: vi.fn(bucket.put.bind(bucket)),
    };
    const result = await run(
      { action: "inspect" },
      fetcher,
      { webhookSecret: "" },
      storage,
    );
    expect(result).toMatchObject({
      status: "ok",
      action: "inspect",
      secretPresent: false,
      secretValid: false,
      listComplete: true,
      notificationsVerified: false,
      canSend: false,
    });
    expect(result.categories).toEqual(
      Object.fromEntries(
        CATEGORIES.map((name) => [
          name,
          { configuration: "missing", journal: "none" },
        ]),
      ),
    );
    expect(storage.put).not.toHaveBeenCalled();
    expect(
      new URLSearchParams(String(fetcher.mock.calls[0][1]?.body)).get("scope"),
    ).toBe("webhook");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://identity.pingen.com/auth/access-tokens",
      `${endpoint}?page%5Bnumber%5D=1&page%5Blimit%5D=100`,
    ]);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === "manual"),
    ).toBe(true);
  });

  it("observes existing callbacks without a secret as unverified, never leaking values or inventing a match", async () => {
    const result = await run(
      { action: "inspect" },
      mocked([token, page([webhook()])]),
      { webhookSecret: "" },
    );
    expect(result.status).toBe("ok");
    expect(result.categories.sent).toEqual({
      configuration: "unverified",
      journal: "none",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-private|0123456789abcdef|https:|PRIVATE_LINK/,
    );
    expect(await bucket.get(key())).toBeNull();
  });

  it("matches an existing subscription without adopting, changing or re-creating it", async () => {
    const fetcher = mocked([token, page([webhook()])]);
    const result = await register(fetcher);
    expect(result.categories.sent).toEqual({
      configuration: "matched",
      journal: "none",
    });
    expect(result.status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await bucket.get(key())).toBeNull();
  });

  it("creates exactly the selected category after a durable claim and filters all private data", async () => {
    const fetcher = mocked([
      token,
      page(),
      async () => {
        expect(await journal()).toMatchObject({
          state: "claimed",
          category: "sent",
          revision: 0,
        });
        return json({ data: webhook() }, 201);
      },
    ]);
    const result = await register(fetcher);
    expect(result).toMatchObject({
      status: "ok",
      categories: { sent: { configuration: "matched", journal: "registered" } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
      data: {
        type: "webhooks",
        attributes: {
          event_category: "sent",
          url: SETUP.callbackUrl,
          signing_key: secret,
        },
      },
    });
    expect(fetcher.mock.calls[2][0]).toBe(endpoint);
    expect(fetcher.mock.calls[2][1]?.method).toBe("POST");
    expect((await journal()).providerId).toBe(webhook().id);
    expect(JSON.stringify([result, await journal()])).not.toMatch(
      /fixture-private-client|fixture-private-organisation|fixture-private-bearer|0123456789abcdef|https:|PRIVATE_LINK/,
    );
    expect(JSON.stringify(result)).not.toContain(webhook().id);
    expect((await bucket.list()).objects).toHaveLength(1);
  });

  it.each(CATEGORIES)(
    "keeps %s registration isolated from every other category",
    async (name) => {
      const result = await register(createdTransport(name), name);
      expect(result.status).toBe("ok");
      expect((await journal(name)).category).toBe(name);
      for (const other of CATEGORIES.filter((item) => item !== name))
        expect(await bucket.get(key(other))).toBeNull();
    },
  );

  it("admits exactly one of simultaneous registrations using actual R2 if-none-match", async () => {
    let entered = 0;
    let release!: () => void;
    const bothListed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn<Fetcher>(async (url, init) => {
      if (String(url).includes("access-tokens")) return json(token);
      if (init?.method !== "POST") {
        entered++;
        if (entered === 2) release();
        await bothListed;
        return json(page());
      }
      return json({ data: webhook() }, 201);
    });
    const results = await Promise.all([register(fetcher), register(fetcher)]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(
      results.find((result) => result.status === "error")?.error?.code,
    ).toBe("journal_conflict");
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) => String(url) === endpoint && init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect((await journal()).state).toBe("registered");
  });

  it("reconciles an unknown POST in inspection without writes, then finalizes the journal without another POST", async () => {
    expect(
      (
        await register(
          mocked([token, page(), new Error("PRIVATE_PROVIDER_ERROR")]),
        )
      ).error?.code,
    ).toBe("request_failed");
    const before = await bucket.get(key());
    expect(await journal()).toMatchObject({ state: "unknown", revision: 1 });
    const inspected = await run(
      { action: "inspect" },
      mocked([token, page([webhook()])]),
    );
    expect(inspected.categories.sent).toEqual({
      configuration: "matched",
      journal: "unknown",
    });
    expect((await bucket.get(key()))!.etag).toBe(before!.etag);
    const fetcher = mocked([token, page([webhook()])]);
    const reconciled = await register(fetcher);
    expect(reconciled).toMatchObject({
      status: "ok",
      categories: { sent: { configuration: "matched", journal: "registered" } },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await journal()).revision).toBe(2);
  });

  it("never retries an unknown registration even when subsequent complete lists find nothing", async () => {
    await register(mocked([token, page(), new Error("private")]));
    const fetcher = mocked([token, page()]);
    expect((await register(fetcher)).error?.code).toBe("registration_pending");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await journal()).state).toBe("unknown");
  });

  it("keeps a crashed claim closed indefinitely, including after a newer operator process starts", async () => {
    await register(createdTransport());
    const prior = await journal();
    delete prior.providerId;
    await bucket.put(
      key(),
      JSON.stringify({ ...prior, state: "claimed", revision: 0 }),
    );
    const fetcher = mocked([token, page()]);
    const result = await run(
      { action: "register", category: "sent" },
      fetcher,
      {},
      bucket,
      () => START + 365 * 24 * 3600000,
    );
    expect(result.error?.code).toBe("registration_pending");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not POST if the durable claim response is lost, then refuses a later replay", async () => {
    const storage = {
      get: bucket.get.bind(bucket),
      put: async (...args: Parameters<R2Bucket["put"]>) => {
        await bucket.put(...args);
        throw new Error("lost private R2 response");
      },
    };
    const fetcher = mocked([token, page()]);
    const result = await run(
      { action: "register", category: "sent" },
      fetcher,
      {},
      storage,
    );
    expect(result.error?.code).toBe("journal_unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await journal()).state).toBe("claimed");
    expect((await register(mocked([token, page()]))).error?.code).toBe(
      "registration_pending",
    );
  });

  it("recovers a lost final journal write solely through exact provider observation", async () => {
    let writes = 0;
    const storage = {
      get: bucket.get.bind(bucket),
      put: async (...args: Parameters<R2Bucket["put"]>) => {
        writes++;
        if (writes === 2) throw new Error("lost final write");
        return bucket.put(...args);
      },
    };
    const result = await run(
      { action: "register", category: "sent" },
      createdTransport(),
      {},
      storage,
    );
    expect(result.error?.code).toBe("journal_unavailable");
    expect((await journal()).state).toBe("unknown");
    const fetcher = mocked([token, page([webhook()])]);
    expect((await register(fetcher)).status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 422])(
    "records HTTP%s rejection without enabling later mutation retries",
    async (status) => {
      expect(
        (
          await register(
            mocked([
              token,
              page(),
              json({ private: "PRIVATE_PROVIDER_ERROR" }, status),
            ]),
          )
        ).error,
      ).toEqual({ code: "http_error", httpStatus: status });
      expect((await journal()).state).toBe("rejected");
      expect((await register(mocked([token, page()]))).error?.code).toBe(
        "registration_rejected",
      );
    },
  );

  it.each([302, 408, 409, 429, 500])(
    "retains uncertain POST HTTP%s without following links or retrying",
    async (status) => {
      const fetcher = mocked([
        token,
        page(),
        new Response(null, {
          status,
          headers: { Location: "https://malicious.invalid/PRIVATE" },
        }),
      ]);
      expect((await register(fetcher)).error?.code).toBe("http_error");
      expect((await journal()).state).toBe("unknown");
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );

  it("rejects a mismatched created resource as unknown and does not persist its identity", async () => {
    const wrong = webhook("issues");
    expect(
      (await register(mocked([token, page(), json({ data: wrong }, 201)])))
        .error?.code,
    ).toBe("response_invalid");
    expect(await journal()).toMatchObject({ state: "unknown" });
    expect((await journal()).providerId).toBeUndefined();
  });

  it("uses bounded numeric pagination without following provider links and requires a complete coherent list", async () => {
    const other = webhook("issues");
    other.attributes.url = "https://other-app.invalid/callback";
    const fetcher = mocked([
      token,
      page([other], 1, 2, 1),
      page([webhook()], 2, 2, 1),
    ]);
    const result = await run({ action: "inspect" }, fetcher);
    expect(result.status).toBe("ok");
    expect(result.categories.issues.configuration).toBe("missing");
    expect(result.categories.sent.configuration).toBe("matched");
    expect(fetcher.mock.calls[2][0]).toBe(
      `${endpoint}?page%5Bnumber%5D=2&page%5Blimit%5D=100`,
    );
    expect(
      fetcher.mock.calls.every(([url]) => !String(url).includes("invalid")),
    ).toBe(true);
  });

  it.each([
    { ...page(), meta: undefined },
    {
      ...page(),
      meta: { current_page: 1, last_page: 6, total: 501, per_page: 100 },
    },
    {
      ...page([webhook()]),
      meta: { current_page: 2, last_page: 1, total: 1, per_page: 100 },
    },
    {
      ...page(),
      meta: { current_page: 1, last_page: 1, total: 1, per_page: 100 },
    },
  ])(
    "refuses creation on incomplete or excessive pagination %#",
    async (listing) => {
      const fetcher = mocked([token, listing]);
      const result = await register(fetcher);
      expect(["list_incomplete", "response_invalid"]).toContain(
        result.error?.code,
      );
      expect(result.listComplete).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(await bucket.get(key())).toBeNull();
    },
  );

  it("rejects duplicate identities across pages instead of treating them as a complete list", async () => {
    const fetcher = mocked([
      token,
      page([webhook()], 1, 2, 1),
      page([webhook()], 2, 2, 1),
    ]);
    expect((await register(fetcher)).error?.code).toBe("list_incomplete");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops every creation on canonical category duplicates or secret conflicts, preserving other subscriptions", async () => {
    const wrongKey = webhook("issues");
    wrongKey.attributes.signing_key = "f".repeat(32);
    for (const rows of [
      [webhook("issues"), webhook("issues", "2")],
      [wrongKey],
    ]) {
      const fetcher = mocked([token, page(rows)]);
      const result = await register(fetcher);
      expect(result.error?.code).toBe("webhook_conflict");
      expect(result.categories.issues.configuration).toBe("conflict");
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(await bucket.get(key())).toBeNull();
    }
  });

  it("detects a replaced identity after successful registration without modifying either resource", async () => {
    await register(createdTransport());
    const fetcher = mocked([token, page([webhook("sent", "replacement")])]);
    expect((await register(fetcher)).error?.code).toBe("webhook_conflict");
    expect((await journal()).providerId).toBe(webhook().id);
  });

  it("rejects foreign provider organisation and prevents account changes from reusing a journal", async () => {
    const wrong = webhook();
    wrong.relationships.organisation.data.id = "other-organisation";
    expect((await register(mocked([token, page([wrong])]))).error?.code).toBe(
      "response_invalid",
    );
    await register(createdTransport());
    const network = mocked([]);
    expect(
      (
        await run({ action: "inspect" }, network, {
          organisationId: "other-organisation",
        })
      ).error?.code,
    ).toBe("journal_invalid");
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { action: "inspect", category: "sent" },
    { action: "inspect", url: SETUP.callbackUrl },
    { action: "register", category: "channel_subscriptions" },
    { action: "register", category: "sent", secret },
    { action: "delete", category: "sent" },
  ])(
    "rejects unknown actions or extra caller capabilities %# before all network",
    async (input) => {
      const fetcher = mocked([]);
      expect((await run(input, fetcher)).error?.code).toBe("input_invalid");
      expect(fetcher).not.toHaveBeenCalled();
      expect((await bucket.list()).objects).toHaveLength(0);
    },
  );

  it.each([
    { environment: "development" },
    { mode: "simulation" },
    { sandbox: "true" },
    { sandbox: "" },
    { liveSendsEnabled: "true" },
    { liveSendsEnabled: "" },
    { clientId: "" },
    { clientSecret: "" },
    { organisationId: "../../other" },
  ])(
    "rejects unqualified registration configuration %# before network",
    async (overrides) => {
      const fetcher = mocked([]);
      expect(
        (
          await run(
            { action: "register", category: "sent" },
            fetcher,
            overrides,
          )
        ).error?.code,
      ).toBe("configuration_invalid");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["", "secret_required"],
    ["a".repeat(20), "secret_invalid"],
    ["a".repeat(33), "secret_invalid"],
    ["z".repeat(32), "secret_invalid"],
  ])(
    "requires a valid operator-owned signing secret %#",
    async (value, code) => {
      const fetcher = mocked([]);
      expect(
        (
          await run({ action: "register", category: "sent" }, fetcher, {
            webhookSecret: value,
          })
        ).error?.code,
      ).toBe(code);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("accepts omitted OAuth scope as the explicit requested scope per RFC6749", async () => {
    const result = await run(
      { action: "inspect" },
      mocked([{ ...token, scope: undefined }, page()]),
    );
    expect(result.status).toBe("ok");
  });

  it.each([null, "", "webhook letter", "organisation_read", "webhook webhook"])(
    "rejects malformed or excessive advertised OAuth scope %#",
    async (scope) => {
      const fetcher = mocked([{ ...token, scope }]);
      expect((await register(fetcher)).error?.code).toBe("scope_mismatch");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds streamed response bytes and rejects redirect before token disclosure to another origin", async () => {
    for (const response of [
      new Response("x".repeat(65_537)),
      new Response(null, {
        status: 302,
        headers: { Location: "https://private.invalid" },
      }),
    ]) {
      const fetcher = mocked([response]);
      expect((await register(fetcher)).status).toBe("error");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await bucket.get(key())).toBeNull();
    }
  });

  it("times out a hanging successful POST body, keeps the claim, and never runs another mutation", async () => {
    let reached!: () => void;
    const bodyStarted = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const fetcher = mocked([
      token,
      page(),
      () => {
        vi.useFakeTimers();
        reached();
        return new Response(
          new ReadableStream({
            start() {
              /* deliberately never completes */
            },
          }),
          { status: 201 },
        );
      },
    ]);
    const pending = register(fetcher);
    await bodyStarted;
    await vi.advanceTimersByTimeAsync(8_001);
    vi.useRealTimers();
    const result = await pending;
    expect(result.error?.code).toBe("request_timeout");
    expect((await journal()).state).toBe("unknown");
    expect((await register(mocked([token, page()]))).error?.code).toBe(
      "registration_pending",
    );
  });

  it("rejects corrupted journal before network instead of resetting its claim", async () => {
    await bucket.put(
      key(),
      JSON.stringify({ state: "claimed", secret: "private-corruption" }),
    );
    const fetcher = mocked([]);
    expect((await register(fetcher)).error?.code).toBe("journal_invalid");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await bucket.get(key()))!.size).toBeGreaterThan(0);
  });
});
