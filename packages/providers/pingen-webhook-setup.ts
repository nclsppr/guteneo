import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Fetcher } from "./types";

export const PINGEN_WEBHOOK_CATEGORIES = [
  "issues",
  "sent",
  "undeliverable",
  "delivered",
] as const;
export type PingenWebhookCategory = (typeof PINGEN_WEBHOOK_CATEGORIES)[number];
export const PINGEN_WEBHOOK_SETUP = Object.freeze({
  callbackUrl: "https://guteneo.com/webhooks/pingen",
  journalPrefix: "configuration/pingen/webhooks/v1/",
});
const API = "https://api.pingen.com";
const IDENTITY = "https://identity.pingen.com/auth/access-tokens";
const category = z.enum(PINGEN_WEBHOOK_CATEGORIES);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect") }).strict(),
  z.object({ action: z.literal("register"), category }).strict(),
]);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const journalSchema = z
  .object({
    version: z.literal(1),
    accountHash: z.string().regex(/^[a-f0-9]{64}$/),
    category,
    state: z.enum(["claimed", "registered", "unknown", "rejected"]),
    startedAt: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    providerId: id.optional(),
  })
  .strict();
type Journal = z.infer<typeof journalSchema>;
type StoredJournal = { value: Journal; etag: string };
const webhookSchema = z.object({
  id,
  type: z.literal("webhooks"),
  attributes: z.object({
    event_category: z.enum([
      ...PINGEN_WEBHOOK_CATEGORIES,
      "channel_subscriptions",
    ]),
    url: z.string().min(1).max(200),
    signing_key: z.string().min(20).max(32),
  }),
  relationships: z.object({
    organisation: z.object({
      data: z.object({ id, type: z.literal("organisations") }),
    }),
  }),
});
type Webhook = z.infer<typeof webhookSchema>;
export type PingenWebhookSetupCode =
  | "input_invalid"
  | "configuration_invalid"
  | "secret_required"
  | "secret_invalid"
  | "request_failed"
  | "request_timeout"
  | "response_invalid"
  | "http_error"
  | "scope_mismatch"
  | "list_incomplete"
  | "webhook_conflict"
  | "journal_invalid"
  | "journal_unavailable"
  | "journal_conflict"
  | "registration_pending"
  | "registration_rejected";
export type PingenWebhookSetupResult = {
  provider: "pingen";
  environment: "production";
  mode: "webhook_setup";
  action: "inspect" | "register" | null;
  status: "ok" | "error";
  secretPresent: boolean;
  secretValid: boolean;
  listComplete: boolean;
  categories: Record<
    PingenWebhookCategory,
    {
      configuration:
        "unknown" | "missing" | "matched" | "unverified" | "conflict";
      journal: "none" | Journal["state"];
    }
  >;
  notificationsVerified: false;
  canSend: false;
  error?: { code: PingenWebhookSetupCode; httpStatus?: number };
};
export type PingenWebhookSetupConfig = {
  clientId: string;
  clientSecret: string;
  organisationId: string;
  environment: string;
  mode: string;
  sandbox: string;
  liveSendsEnabled: string;
  webhookSecret: string;
};
class Failure extends Error {
  constructor(
    readonly code: PingenWebhookSetupCode,
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}
function fail(code: PingenWebhookSetupCode): never {
  throw new Failure(code);
}
const bytes = (text: string) => new TextEncoder().encode(text);
const equalSecret = (left: string, right: string) => {
  const a = bytes(left);
  const b = bytes(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail("response_invalid");

/** Operator-only service-binding capability. No HTTP route, caller-selected account,
 * URL, secret or subscription ID. Inspection never writes, even when reconciling.
 * R2 records are separate from business state and contain no access/signing secret.
 */
export async function configurePingenWebhooks(
  config: PingenWebhookSetupConfig,
  bucket: Pick<R2Bucket, "get" | "put">,
  input: unknown,
  {
    fetcher = fetch,
    now = Date.now,
  }: { fetcher?: Fetcher; now?: () => number } = {},
): Promise<PingenWebhookSetupResult> {
  const parsed = inputSchema.safeParse(input);
  const result: PingenWebhookSetupResult = {
    provider: "pingen",
    environment: "production",
    mode: "webhook_setup",
    action: parsed.success ? parsed.data.action : null,
    status: "error",
    secretPresent: Boolean(config.webhookSecret),
    secretValid: /^[a-f0-9]{32}$/i.test(config.webhookSecret),
    listComplete: false,
    categories: {
      issues: { configuration: "unknown", journal: "none" },
      sent: { configuration: "unknown", journal: "none" },
      undeliverable: { configuration: "unknown", journal: "none" },
      delivered: { configuration: "unknown", journal: "none" },
    },
    notificationsVerified: false,
    canSend: false,
  };
  const journals = new Map<PingenWebhookCategory, StoredJournal>();
  let claimed: PingenWebhookCategory | undefined;
  let postStarted = false;
  const started = now();
  const remaining = () => {
    const time = now();
    if (
      !Number.isSafeInteger(time) ||
      time < started ||
      time >= started + 30_000
    )
      fail("request_timeout");
    return Math.min(8_000, started + 30_000 - time);
  };
  const save = async (next: Journal) => {
    const previous = journals.get(next.category);
    let stored: R2Object | null;
    try {
      stored = await bucket.put(
        `${PINGEN_WEBHOOK_SETUP.journalPrefix}${next.category}.json`,
        JSON.stringify(next),
        {
          onlyIf: previous
            ? { etagMatches: previous.etag }
            : { etagDoesNotMatch: "*" },
          httpMetadata: {
            contentType: "application/json",
            cacheControl: "no-store",
          },
        },
      );
    } catch {
      fail("journal_unavailable");
    }
    if (!stored) fail("journal_conflict");
    journals.set(next.category, { value: next, etag: stored.etag });
    result.categories[next.category].journal = next.state;
  };
  // One request only. Deadline covers headers AND body; provider bodies never escape.
  const call = async (url: string, init: RequestInit, status: number) => {
    const timeout = remaining();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const operation = (async () => {
      const response = await fetcher(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status !== status) {
        void response.body?.cancel().catch(() => undefined);
        throw new Failure("http_error", response.status);
      }
      if (Number(response.headers.get("content-length") ?? 0) > 65_536)
        fail("response_invalid");
      reader = response.body?.getReader();
      if (!reader) fail("response_invalid");
      let length = 0;
      let text = "";
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (controller.signal.aborted) fail("request_timeout");
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 65_536) fail("response_invalid");
        text += decoder.decode(chunk.value, { stream: true });
      }
      try {
        return JSON.parse(text + decoder.decode()) as unknown;
      } catch {
        return fail("response_invalid");
      }
    })();
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Failure("request_timeout"));
          }, timeout);
        }),
      ]);
    } catch (error) {
      throw error instanceof Failure ? error : new Failure("request_failed");
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    }
  };

  try {
    if (!parsed.success) fail("input_invalid");
    const action = parsed.data;
    if (
      config.environment !== "production" ||
      config.mode !== "production" ||
      config.sandbox !== "false" ||
      !id.safeParse(config.organisationId).success ||
      !config.clientId ||
      config.clientId.length > 4096 ||
      !config.clientSecret ||
      config.clientSecret.length > 4096 ||
      !Number.isSafeInteger(started) ||
      started < 0 ||
      (action.action === "register" && config.liveSendsEnabled !== "false")
    )
      fail("configuration_invalid");
    if (action.action === "register") {
      if (!result.secretPresent) fail("secret_required");
      if (!result.secretValid) fail("secret_invalid");
    }
    const accountHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          bytes(JSON.stringify([config.organisationId, config.clientId])),
        ),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    for (const name of PINGEN_WEBHOOK_CATEGORIES) {
      const stored = await bucket
        .get(`${PINGEN_WEBHOOK_SETUP.journalPrefix}${name}.json`)
        .catch(() => fail("journal_unavailable"));
      if (!stored) continue;
      if (stored.size > 4096) fail("journal_invalid");
      let value: Journal;
      try {
        value = journalSchema.parse(await stored.json());
      } catch {
        fail("journal_invalid");
      }
      if (
        value.accountHash !== accountHash ||
        value.category !== name ||
        (value.state === "registered" && !value.providerId)
      )
        fail("journal_invalid");
      journals.set(name, { value, etag: stored.etag });
      result.categories[name].journal = value.state;
    }
    const token = object(
      await call(
        IDENTITY,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            scope: "webhook",
          }).toString(),
        },
        200,
      ),
    );
    // RFC6749 §5.1: scope may be omitted when identical to the requested scope.
    if (
      token.scope !== undefined &&
      (typeof token.scope !== "string" || token.scope.trim() !== "webhook")
    )
      fail("scope_mismatch");
    if (
      token.token_type !== "Bearer" ||
      typeof token.access_token !== "string" ||
      !token.access_token ||
      token.access_token.length > 8192 ||
      /[\r\n\0]/.test(token.access_token)
    )
      fail("response_invalid");
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    };
    const endpoint = `${API}/organisations/${encodeURIComponent(config.organisationId)}/webhooks`;
    const hooks: Webhook[] = [];
    const seen = new Set<string>();
    let total: number | undefined;
    let lastPage: number | undefined;
    let perPage: number | undefined;
    for (let page = 1; page <= 5; page++) {
      const response = object(
        await call(
          `${endpoint}?page%5Bnumber%5D=${page}&page%5Blimit%5D=100`,
          { headers },
          200,
        ),
      );
      const meta = object(response.meta);
      const values = [
        meta.current_page,
        meta.last_page,
        meta.per_page,
        meta.total,
      ];
      if (
        !values.every(
          (value) => typeof value === "number" && Number.isSafeInteger(value),
        )
      )
        fail("list_incomplete");
      if (
        meta.current_page !== page ||
        Number(meta.last_page) < 1 ||
        Number(meta.last_page) > 5 ||
        Number(meta.per_page) < 1 ||
        Number(meta.per_page) > 100 ||
        Number(meta.total) < 0 ||
        Number(meta.total) > 500 ||
        Number(meta.last_page) !==
          Math.max(1, Math.ceil(Number(meta.total) / Number(meta.per_page)))
      )
        fail("list_incomplete");
      if (page === 1) {
        total = Number(meta.total);
        lastPage = Number(meta.last_page);
        perPage = Number(meta.per_page);
      }
      if (
        meta.total !== total ||
        meta.last_page !== lastPage ||
        meta.per_page !== perPage ||
        !Array.isArray(response.data) ||
        response.data.length !== Math.min(perPage!, total! - hooks.length)
      )
        fail("list_incomplete");
      for (const raw of response.data) {
        const parsedHook = webhookSchema.safeParse(raw);
        if (!parsedHook.success) fail("response_invalid");
        const hook = parsedHook.data;
        if (hook.relationships.organisation.data.id !== config.organisationId)
          fail("response_invalid");
        if (seen.has(hook.id)) fail("list_incomplete");
        seen.add(hook.id);
        hooks.push(hook);
      }
      if (page === lastPage) {
        result.listComplete = true;
        break;
      }
    }
    if (!result.listComplete || hooks.length !== total) fail("list_incomplete");
    for (const name of PINGEN_WEBHOOK_CATEGORIES) {
      const matches = hooks.filter(
        (hook) =>
          hook.attributes.url === PINGEN_WEBHOOK_SETUP.callbackUrl &&
          hook.attributes.event_category === name,
      );
      const old = journals.get(name)?.value;
      result.categories[name].configuration =
        matches.length === 0
          ? "missing"
          : matches.length > 1 ||
              (old?.providerId && matches[0].id !== old.providerId)
            ? "conflict"
            : !result.secretValid
              ? "unverified"
              : equalSecret(
                    matches[0].attributes.signing_key,
                    config.webhookSecret,
                  )
                ? "matched"
                : "conflict";
    }
    if (
      PINGEN_WEBHOOK_CATEGORIES.some(
        (name) => result.categories[name].configuration === "conflict",
      )
    )
      fail("webhook_conflict");
    if (action.action === "inspect") {
      result.status = "ok";
      return result;
    }

    const name = action.category;
    const old = journals.get(name)?.value;
    const match = hooks.find(
      (hook) =>
        hook.attributes.url === PINGEN_WEBHOOK_SETUP.callbackUrl &&
        hook.attributes.event_category === name,
    );
    if (result.categories[name].configuration === "matched") {
      // An exact provider observation can reconcile a lost POST response. No POST retry.
      if (old && old.state !== "registered")
        await save({
          ...old,
          state: "registered",
          providerId: match!.id,
          revision: old.revision + 1,
        });
      result.status = "ok";
      return result;
    }
    if (old)
      fail(
        old.state === "rejected"
          ? "registration_rejected"
          : "registration_pending",
      );
    remaining();
    await save({
      version: 1,
      accountHash,
      category: name,
      state: "claimed",
      startedAt: now(),
      revision: 0,
    });
    claimed = name;
    // No lease expires into permission to create again. Even a crash before POST stays claimed.
    remaining();
    postStarted = true;
    const created = object(
      await call(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: {
              type: "webhooks",
              attributes: {
                event_category: name,
                url: PINGEN_WEBHOOK_SETUP.callbackUrl,
                signing_key: config.webhookSecret,
              },
            },
          }),
        },
        201,
      ),
    );
    const verified = webhookSchema.safeParse(created.data);
    if (
      !verified.success ||
      verified.data.relationships.organisation.data.id !==
        config.organisationId ||
      verified.data.attributes.event_category !== name ||
      verified.data.attributes.url !== PINGEN_WEBHOOK_SETUP.callbackUrl ||
      !equalSecret(verified.data.attributes.signing_key, config.webhookSecret)
    )
      fail("response_invalid");
    await save({
      ...journals.get(name)!.value,
      state: "registered",
      providerId: verified.data.id,
      revision: 1,
    });
    result.categories[name].configuration = "matched";
    result.status = "ok";
  } catch (error) {
    const failure =
      error instanceof Failure ? error : new Failure("request_failed");
    if (claimed && journals.get(claimed)?.value.state === "claimed") {
      const rejected =
        postStarted &&
        failure.code === "http_error" &&
        (failure.httpStatus ?? 0) >= 400 &&
        (failure.httpStatus ?? 0) < 500 &&
        ![408, 409, 425, 429].includes(failure.httpStatus!);
      const state = rejected ? "rejected" : "unknown";
      // If this write is lost too, the original durable claim still prevents another POST.
      try {
        await save({ ...journals.get(claimed)!.value, state, revision: 1 });
      } catch {
        result.categories[claimed].journal = "unknown";
      }
    }
    result.error = {
      code: failure.code,
      ...(failure.httpStatus === undefined
        ? {}
        : { httpStatus: failure.httpStatus }),
    };
  }
  return result;
}
