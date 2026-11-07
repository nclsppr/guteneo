import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
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
import type { Env } from "../../apps/api/src/env";
import { processPreventionNotifications } from "../../apps/api/src/provider-prevention-notifications";

const NOW = Date.parse("2026-11-07T10:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const OPERATOR = "private-operator@example.invalid";
const SENDING_KEY = "fixture-prevention-sending-key";
const ACK = "12345678-1234-4123-8123-123456789abc";
const ZERO = {
  providerPreventionNotificationsSent: 0,
  providerPreventionNotificationsFailed: 0,
  providerPreventionNotificationsUnknown: 0,
};
type PreventionEnv = Env & {
  PROVIDER_PREVENTION_EMAILS_ENABLED?: string;
  PROVIDER_PREVENTION_EMAIL_FROM?: string;
  PROVIDER_PREVENTION_EMAIL_TO?: string;
  PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT?: string;
};
type Notification = {
  organization_id: string;
  notification_sha256: string;
  task_sha256: string;
  occurrence: number;
  stage: string;
  status: string;
  envelope_sha256: string | null;
  claimed_at: string | null;
  lease_until: string | null;
  provider_reference: string | null;
  finished_at: string | null;
  error_code: string | null;
};
let mf: Miniflare;
let db: D1Database;
let sequence = 0;
const stamp = (at = NOW) => new Date(at).toISOString();
const hash = (id: number) => id.toString(16).padStart(64, "0");
const environment = (changes: Partial<PreventionEnv> = {}): Env =>
  ({
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    RESEND_SENDS_ENABLED: "true",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: SENDING_KEY,
    PROVIDER_PREVENTION_EMAILS_ENABLED: "true",
    PROVIDER_PREVENTION_EMAIL_FROM: "operations@guteneo.com",
    PROVIDER_PREVENTION_EMAIL_TO: OPERATOR,
    ...changes,
  }) as Env;

/** Genuine D1 constraints and transitions, with synthetic operational metadata.
 * No business dispatch, provider credential or tenant-controlled recipient is
 * involved in this independent notification outbox fixture. */
async function pending(
  options: {
    id?: number;
    organizationId?: string;
    stage?: "operator_7d" | "operator_3d";
    at?: number;
  } = {},
) {
  const id = options.id ?? ++sequence;
  const org = options.organizationId ?? `org_notice_${id}`;
  const stage = options.stage ?? "operator_3d";
  const at = options.at ?? NOW;
  const binding = hash(id * 10 + 1);
  const task = hash(id * 10 + 2);
  const notification = hash(id * 10 + 3);
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO organizations(id,mode) VALUES(?,'production')",
      )
      .bind(org),
    db
      .prepare(
        "INSERT INTO provider_freshness_bindings(organization_id,family,binding_sha256,active,evaluated_at,evaluation_sha256) VALUES(?,'fax_authority',?,1,?,?)",
      )
      .bind(org, binding, stamp(at), hash(id * 10 + 4)),
    db
      .prepare(
        "INSERT INTO provider_freshness_prevention_tasks(organization_id,task_sha256,family,binding_sha256,revision_sha256,deadline_at,renewal_mode,stage,stage_rank,state,occurrence,opened_at,last_evaluated_at) VALUES(?,?,'fax_authority',?,?,?,'operator',?,?,'active',1,?,?)",
      )
      .bind(
        org,
        task,
        binding,
        hash(id * 10 + 5),
        stamp(at + (stage === "operator_7d" ? 7 : 3) * DAY),
        stage,
        stage === "operator_7d" ? 1 : 2,
        stamp(at - 60_000),
        stamp(at),
      ),
    db
      .prepare(
        "INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,created_at,updated_at) VALUES(?,?,?,1,?,?,?)",
      )
      .bind(
        org,
        notification,
        task,
        stage,
        stamp(at - 60_000),
        stamp(at - 60_000),
      ),
  ]);
  return { org, binding, task, notification };
}
async function notices() {
  return (
    await db
      .prepare(
        "SELECT organization_id,notification_sha256,task_sha256,occurrence,stage,status,envelope_sha256,claimed_at,lease_until,provider_reference,finished_at,error_code FROM provider_freshness_prevention_notifications ORDER BY created_at,notification_sha256",
      )
      .all<Notification>()
  ).results;
}
function dependencies(fetcher: typeof fetch, at = NOW) {
  return { fetch: fetcher, now: () => new Date(at) };
}
function successfulFetch() {
  return vi.fn<typeof fetch>(async () => Response.json({ id: ACK }));
}
async function outgoing(call: Parameters<typeof fetch>) {
  const request = new Request(call[0], call[1]);
  return {
    url: request.url,
    method: request.method,
    redirect: request.redirect,
    headers: request.headers,
    body: (await request.json()) as {
      from: string;
      to: string | string[];
      subject?: string;
      text?: string;
      html?: string;
    },
  };
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await db.exec(
    "CREATE TABLE organizations(id TEXT PRIMARY KEY,mode TEXT NOT NULL DEFAULT 'production')",
  );
  for (const filename of [
    "0068_provider_freshness_alerts.sql",
    "0074_provider_freshness_prevention.sql",
  ]) {
    const sql = readFileSync(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    await db.batch(
      unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
    );
  }
});
beforeEach(async () => {
  await db.exec("DROP TRIGGER IF EXISTS reject_notice_ack");
  await db.exec("DROP TRIGGER IF EXISTS resolve_notice_after_claim");
  await db.exec("DROP TRIGGER IF EXISTS invalidate_binding_after_claim");
  await db.exec("DELETE FROM organizations");
  sequence = 0;
  // Even a missing dependency injection must never reach a real provider.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error(
        "Unexpected network fallback in a synthetic notifier test",
      );
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(async () => mf?.dispose());

describe("bounded operational prevention notifications", () => {
  it.each([
    { PROVIDER_PREVENTION_EMAILS_ENABLED: undefined },
    { PROVIDER_PREVENTION_EMAILS_ENABLED: "false" },
    { ENVIRONMENT: "local" as const },
    { ENVIRONMENT: "staging" as const },
    { MODE: "simulation" as const },
  ])(
    "keeps the outbox untouched when the live gate is closed: %j",
    async (changes) => {
      await pending();
      const before = await notices();
      const fetcher = successfulFetch();
      expect(
        await processPreventionNotifications(
          environment(changes),
          dependencies(fetcher),
        ),
      ).toEqual(ZERO);
      expect(fetcher).not.toHaveBeenCalled();
      expect(await notices()).toEqual(before);
    },
  );

  it.each([
    { RESEND_SENDS_ENABLED: "false" },
    { RESEND_API_KEY: undefined },
    { PROVIDER_PREVENTION_EMAIL_FROM: undefined },
    { PROVIDER_PREVENTION_EMAIL_TO: undefined },
    { RESEND_VERIFIED_DOMAIN: "another.example.invalid" },
    {
      PROVIDER_PREVENTION_EMAIL_FROM:
        "operations@guteneo.com\r\nBcc: attacker@example.invalid",
    },
    { PROVIDER_PREVENTION_EMAIL_TO: "one@example.invalid,two@example.invalid" },
    { PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT: "0" },
    { PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT: "21" },
    { PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT: "1.5" },
    { PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT: "unlimited" },
  ])(
    "refuses incomplete or unsafe enabled configuration without a provider attempt: %j",
    async (changes) => {
      await pending();
      const fetcher = successfulFetch();
      const result = await processPreventionNotifications(
        environment(changes),
        dependencies(fetcher),
      );
      expect(result.providerPreventionNotificationsFailed).toBe(1);
      expect(fetcher).not.toHaveBeenCalled();
      expect((await notices())[0]).toMatchObject({
        status: "pending",
        claimed_at: null,
        envelope_sha256: null,
      });
    },
  );

  it("claims once across overlapping cron invocations and records provider acknowledgement", async () => {
    await pending();
    const fetcher = successfulFetch();
    const results = await Promise.all([
      processPreventionNotifications(environment(), dependencies(fetcher)),
      processPreventionNotifications(environment(), dependencies(fetcher)),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      results.reduce(
        (sum, result) => sum + result.providerPreventionNotificationsSent,
        0,
      ),
    ).toBe(1);
    expect((await notices())[0]).toMatchObject({
      status: "sent",
      provider_reference: ACK,
      error_code: null,
      claimed_at: stamp(),
      finished_at: stamp(),
    });
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "timeout",
      async () => {
        throw new DOMException("private provider timeout", "AbortError");
      },
    ],
    [
      "server error",
      async () => new Response("private provider response", { status: 503 }),
    ],
    [
      "request timeout",
      async () => new Response("private provider response", { status: 408 }),
    ],
    [
      "conflict",
      async () => new Response("private provider response", { status: 409 }),
    ],
    [
      "invalid success JSON",
      async () => new Response("not-json", { status: 200 }),
    ],
    ["missing success reference", async () => Response.json({ id: null })],
  ] as const)(
    "retains %s as unknown and never retries after the lease or idempotency window",
    async (_kind, response) => {
      await pending();
      const fetcher = vi.fn<typeof fetch>(response);
      const first = await processPreventionNotifications(
        environment(),
        dependencies(fetcher),
      );
      expect(first.providerPreventionNotificationsUnknown).toBe(1);
      expect((await notices())[0]).toMatchObject({
        status: "unknown",
        provider_reference: null,
        claimed_at: stamp(),
      });
      expect((await notices())[0].error_code).toMatch(/^[A-Z0-9_]+$/);
      expect(
        (
          await processPreventionNotifications(
            environment(),
            dependencies(fetcher, NOW + 2 * DAY),
          )
        ).providerPreventionNotificationsUnknown,
      ).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((await notices())[0].status).toBe("unknown");
    },
  );

  it.each([400, 401, 403, 422, 429])(
    "keeps a known HTTP %s refusal terminal",
    async (status) => {
      await pending();
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response("private provider rejection", { status }),
      );
      expect(
        (
          await processPreventionNotifications(
            environment(),
            dependencies(fetcher),
          )
        ).providerPreventionNotificationsFailed,
      ).toBe(1);
      expect((await notices())[0].status).toBe("failed");
      await processPreventionNotifications(
        environment(),
        dependencies(fetcher, NOW + 2 * DAY),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((await notices())[0].status).toBe("failed");
    },
  );

  it("recovers a stale claimed lease as unknown without making another provider call", async () => {
    const item = await pending();
    await db
      .prepare(
        "UPDATE provider_freshness_prevention_notifications SET status='sending',envelope_sha256=?,claimed_at=?,lease_until=?,updated_at=? WHERE organization_id=? AND notification_sha256=?",
      )
      .bind(
        hash(999),
        stamp(NOW - 30_000),
        stamp(NOW - 1),
        stamp(),
        item.org,
        item.notification,
      )
      .run();
    const fetcher = successfulFetch();
    expect(
      (
        await processPreventionNotifications(
          environment(),
          dependencies(fetcher),
        )
      ).providerPreventionNotificationsUnknown,
    ).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await notices())[0]).toMatchObject({
      status: "unknown",
      provider_reference: null,
    });
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never resubmits when the provider acknowledged but D1 could not persist the result", async () => {
    await pending();
    await db.exec(
      "CREATE TRIGGER reject_notice_ack BEFORE UPDATE ON provider_freshness_prevention_notifications WHEN NEW.status='sent' BEGIN SELECT RAISE(ABORT,'synthetic_ack_persistence_failure'); END",
    );
    const fetcher = successfulFetch();
    await expect(
      processPreventionNotifications(environment(), dependencies(fetcher)),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await notices())[0]).toMatchObject({
      status: "sending",
      claimed_at: stamp(),
      provider_reference: null,
    });
    await db.exec("DROP TRIGGER reject_notice_ack");
    expect(
      (
        await processPreventionNotifications(
          environment(),
          dependencies(fetcher, NOW + 120_001),
        )
      ).providerPreventionNotificationsUnknown,
    ).toBe(1);
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await notices())[0].status).toBe("unknown");
  });

  it("rechecks a task resolved between the atomic claim and the provider call", async () => {
    await pending();
    await db.exec(
      "CREATE TRIGGER resolve_notice_after_claim AFTER UPDATE ON provider_freshness_prevention_notifications WHEN OLD.status='pending' AND NEW.status='sending' BEGIN UPDATE provider_freshness_prevention_tasks SET state='resolved',resolution='disabled',resolved_at=NEW.updated_at,last_evaluated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND task_sha256=NEW.task_sha256; END",
    );
    const fetcher = successfulFetch();
    expect(
      await processPreventionNotifications(
        environment(),
        dependencies(fetcher),
      ),
    ).toEqual(ZERO);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await notices())[0]).toMatchObject({
      status: "failed",
      error_code: "TASK_CHANGED",
    });
  });

  it.each(["disabled", "newer evaluation"])(
    "does not claim an old preventive task after its binding has a %s state",
    async (change) => {
      const item = await pending();
      const before = await notices();
      await db
        .prepare(
          "UPDATE provider_freshness_bindings SET active=?,evaluated_at=?,evaluation_sha256=? WHERE organization_id=? AND family='fax_authority' AND binding_sha256=?",
        )
        .bind(
          change === "disabled" ? 0 : 1,
          stamp(NOW + 1),
          hash(888),
          item.org,
          item.binding,
        )
        .run();
      const fetcher = successfulFetch();
      expect(
        await processPreventionNotifications(
          environment(),
          dependencies(fetcher, NOW + 2),
        ),
      ).toEqual(ZERO);
      expect(fetcher).not.toHaveBeenCalled();
      expect(await notices()).toEqual(before);
    },
  );

  it.each(["disabled", "newer evaluation"])(
    "rechecks a %s binding immediately after claiming and before calling the provider",
    async (change) => {
      await pending();
      const mutation =
        change === "disabled"
          ? "active=0"
          : "evaluated_at='2026-11-07T10:00:00.001Z'";
      await db.exec(
        `CREATE TRIGGER invalidate_binding_after_claim AFTER UPDATE ON provider_freshness_prevention_notifications WHEN OLD.status='pending' AND NEW.status='sending' BEGIN UPDATE provider_freshness_bindings SET ${mutation} WHERE organization_id=NEW.organization_id AND family='fax_authority'; END`,
      );
      const fetcher = successfulFetch();
      expect(
        await processPreventionNotifications(
          environment(),
          dependencies(fetcher),
        ),
      ).toEqual(ZERO);
      expect(fetcher).not.toHaveBeenCalled();
      expect((await notices())[0]).toMatchObject({
        status: "failed",
        claimed_at: stamp(),
        error_code: "TASK_CHANGED",
      });
    },
  );

  it("bounds provider acknowledgement bodies and retains private errors only as closed codes", async () => {
    await pending();
    const privateMarker = "PRIVATE_PROVIDER_BODY_should_never_be_logged";
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: ACK, details: privateMarker.repeat(400) }),
    );
    const logs = ["log", "warn", "error"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}),
    );
    expect(
      (
        await processPreventionNotifications(
          environment(),
          dependencies(fetcher),
        )
      ).providerPreventionNotificationsUnknown,
    ).toBe(1);
    expect((await notices())[0]).toMatchObject({
      status: "unknown",
      provider_reference: null,
    });
    const retained = JSON.stringify([
      await notices(),
      ...logs.map((spy) => spy.mock.calls),
    ]);
    for (const privateValue of [privateMarker, OPERATOR, SENDING_KEY])
      expect(retained).not.toContain(privateValue);
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cannot claim an obsolete lower milestone while the current milestone is pending", async () => {
    const item = await pending({ stage: "operator_7d", at: NOW - 4 * DAY });
    await db.batch([
      db
        .prepare(
          "UPDATE provider_freshness_bindings SET evaluated_at=? WHERE organization_id=? AND family='fax_authority' AND binding_sha256=?",
        )
        .bind(stamp(), item.org, item.binding),
      db
        .prepare(
          "UPDATE provider_freshness_prevention_tasks SET stage='operator_3d',stage_rank=2,last_evaluated_at=? WHERE organization_id=? AND task_sha256=?",
        )
        .bind(stamp(), item.org, item.task),
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,created_at,updated_at) VALUES(?,?,?,1,'operator_3d',?,?)",
        )
        .bind(item.org, hash(9999), item.task, stamp(), stamp()),
    ]);
    const fetcher = successfulFetch();
    await processPreventionNotifications(environment(), dependencies(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await notices()).find(
        (row) => row.notification_sha256 === item.notification,
      )?.claimed_at,
    ).toBeNull();
    expect(
      (await notices()).find((row) => row.stage === "operator_3d")?.status,
    ).toBe("sent");
  });

  it("reserves the global hourly allowance atomically across organizations", async () => {
    await pending();
    await pending();
    const fetcher = successfulFetch();
    await Promise.all([
      processPreventionNotifications(environment(), dependencies(fetcher)),
      processPreventionNotifications(environment(), dependencies(fetcher)),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await notices()).filter((row) => row.claimed_at !== null),
    ).toHaveLength(1);
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + HOUR + 1),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("enforces the default daily allowance of four independently of tenant count", async () => {
    for (let id = 1; id <= 6; id++) await pending({ id });
    const fetcher = successfulFetch();
    for (let hour = 0; hour < 6; hour++)
      await processPreventionNotifications(
        environment(),
        dependencies(fetcher, NOW + hour * HOUR + hour),
      );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      (await notices()).filter((row) => row.claimed_at !== null),
    ).toHaveLength(4);
    expect(
      (await notices()).filter((row) => row.status === "pending"),
    ).toHaveLength(2);
  });

  it("a configured daily cap remains atomic when different tenants race for the last slot", async () => {
    await pending();
    await pending();
    const fetcher = successfulFetch();
    const limited = environment({ PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT: "1" });
    await Promise.all([
      processPreventionNotifications(limited, dependencies(fetcher)),
      processPreventionNotifications(limited, dependencies(fetcher)),
    ]);
    await processPreventionNotifications(
      limited,
      dependencies(fetcher, NOW + 2 * HOUR),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await notices()).filter((row) => row.claimed_at !== null),
    ).toHaveLength(1);
  });

  it("sends only closed operational metadata to the configured private operator with a stable idempotency key", async () => {
    const item = await pending({
      id: 41,
      organizationId: "org_tenant_recipient_cannot_override",
    });
    const fetcher = successfulFetch();
    const logs = ["log", "warn", "error"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}),
    );
    await processPreventionNotifications(environment(), dependencies(fetcher));
    const first = await outgoing(fetcher.mock.calls[0]);
    expect(first.url).toBe("https://api.resend.com/emails");
    expect(first.method).toBe("POST");
    expect(first.redirect).toBe("manual");
    expect(first.headers.get("Authorization")).toBe(`Bearer ${SENDING_KEY}`);
    expect(first.headers.get("Idempotency-Key")).toContain(item.notification);
    expect([first.body.to].flat()).toEqual([OPERATOR]);
    expect(first.body.from).toBe("operations@guteneo.com");
    const metadata = [
      first.body.subject,
      first.body.text,
      first.body.html,
    ].join("\n");
    expect(metadata).toMatch(/fax/i);
    expect(metadata).toMatch(/2026-11-10/);
    for (const privateValue of [
      item.org,
      item.binding,
      item.task,
      item.notification,
      SENDING_KEY,
    ])
      expect(metadata).not.toContain(privateValue);
    const logged = JSON.stringify(logs.map((spy) => spy.mock.calls));
    expect(logged).not.toContain(OPERATOR);
    expect(logged).not.toContain(SENDING_KEY);
    // Repeated processing retains the same claimed identity and never creates
    // another request for it, even after the provider idempotency window.
    const original = (await notices())[0];
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await notices())[0]).toEqual(original);
    const next = await pending({
      id: 42,
      organizationId: item.org,
      at: NOW + 2 * DAY + HOUR,
    });
    await processPreventionNotifications(
      environment(),
      dependencies(fetcher, NOW + 2 * DAY + HOUR),
    );
    const second = await outgoing(fetcher.mock.calls[1]);
    expect(second.headers.get("Idempotency-Key")).toContain(next.notification);
    expect(second.headers.get("Idempotency-Key")).not.toBe(
      first.headers.get("Idempotency-Key"),
    );
  });
});
