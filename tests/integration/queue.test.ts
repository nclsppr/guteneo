import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
// The unrelated MCP transport depends on Workers-only runtime modules. Queue tests invoke the real
// exported consumer, domain and D1/R2; this unused transport boundary is deliberately not executed.
vi.mock("../../apps/api/src/mcp", () => ({
  handleMcp: () => {
    throw new Error("MCP is outside the queue test");
  },
}));
import worker from "../../apps/api/src/index";

let runtime: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  env: Env,
  domain: DomainService;
const atelier: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const studio: ActorContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
async function sql(source: string) {
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete SQL");
}
function message(id: string, body: unknown) {
  return {
    id,
    body,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}
function batch(
  messages: ReturnType<typeof message>[],
  queue = "guteneo-dispatch",
) {
  return {
    queue,
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<{ dispatchId: string }>;
}
async function queued(id: string, ctx = atelier) {
  const row = await domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      recipient: { email: "queue-recipient@example.invalid" },
      subject: "Simulation queue",
      html: "<p>Simulation uniquement.</p>",
    },
    id,
  );
  await domain.approveDispatch(ctx, row.id, row.fingerprint);
  return domain.confirmDispatch(ctx, row.id, `confirm:${id}`);
}
async function attempts() {
  return (await db
    .prepare("SELECT count(*) AS count FROM attempts")
    .first<{ count: number }>())!.count;
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await runtime.getD1Database("DB")) as unknown as D1Database;
  bucket = (await runtime.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const file of readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await sql(
      readFileSync(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await sql(
    readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  env = {
    DB: db,
    DOCUMENTS: bucket,
    MODE: "simulation",
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://localhost:8787",
  } as Env;
  domain = new DomainService(db, { mode: "simulation" });
});
afterAll(async () => runtime?.dispose());
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Network forbidden in queue simulation fixture");
  });
});
afterEach(() => vi.restoreAllMocks());

it("captures dead letters durably and idempotently without starting a provider attempt", async () => {
  const row = await queued("dead-letter");
  const before = await attempts();
  const first = message("dlq-replayed-id", { dispatchId: row.id });
  await worker.queue(batch([first], "guteneo-dispatch-dlq"), env);
  expect(first.ack).toHaveBeenCalledOnce();
  expect(first.retry).not.toHaveBeenCalled();
  const snapshot = await db
    .prepare("SELECT * FROM dead_letters WHERE id=?")
    .bind(first.id)
    .first();
  expect(snapshot).toMatchObject({
    dispatch_id: row.id,
    queue: "guteneo-dispatch-dlq",
    resolved_at: null,
  });
  const duplicate = message(first.id, { dispatchId: row.id });
  await worker.queue(batch([duplicate], "guteneo-dispatch-dlq"), env);
  expect(duplicate.ack).toHaveBeenCalledOnce();
  expect(
    await db
      .prepare("SELECT * FROM dead_letters WHERE id=?")
      .bind(first.id)
      .first(),
  ).toEqual(snapshot);
  expect(await attempts()).toBe(before);
  expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
    "queued",
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it("quarantines invalid messages without crashing or persisting their arbitrary body", async () => {
  const before = await attempts();
  const invalid = message("invalid-body", {
    dispatchId: 55,
    privateDocument: "must-not-be-stored",
  });
  const missing = message("missing-dispatch", {
    dispatchId: "nonexistent-business-command",
  });
  await expect(
    worker.queue(batch([invalid, missing]), env),
  ).resolves.toBeUndefined();
  expect(invalid.ack).toHaveBeenCalledOnce();
  expect(missing.ack).toHaveBeenCalledOnce();
  expect(invalid.retry).not.toHaveBeenCalled();
  const saved = await db
    .prepare("SELECT * FROM dead_letters WHERE id=?")
    .bind(invalid.id)
    .first();
  expect(saved).toMatchObject({ dispatch_id: null, queue: "guteneo-dispatch" });
  expect(JSON.stringify(saved)).not.toContain("must-not-be-stored");
  expect(await attempts()).toBe(before);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it("does not start production attempts when live sends are disabled", async () => {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES('org_queue_production','Production gate test','production',?)",
      )
      .bind(now),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('sender_queue_production','org_queue_production','email','Fixture sender','sender@example.invalid','verified','production',?)",
      )
      .bind(now),
  ]);
  // A previously accepted production command can exist independently of the current pricing gate.
  // Insert a trusted restoration fixture in queued state; this does not authorize a live send.
  await db
    .prepare(
      "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES('production-queued-fixture','org_queue_production','email','{\"email\":\"recipient@example.invalid\"}','sender_queue_production','sender@example.invalid','Fixture','<p>Fixture</p>','Fixture','{}','queued','production',1,1,'EUR',?,'production-gate',?,?,?)",
    )
    .bind("a".repeat(64), "b".repeat(64), now, now)
    .run();
  const productionEnv = {
    ...env,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.example.invalid",
    AUTH0_DOMAIN: "tenant.example.invalid",
    AUTH0_CLIENT_ID: "fixture-only",
    AUTH0_AUDIENCE: "https://guteneo.example.invalid",
    LIVE_SENDS_ENABLED: "false",
  } as Env;
  const before = await attempts();
  const item = message("production-gated", {
    dispatchId: "production-queued-fixture",
  });
  await worker.queue(batch([item]), productionEnv);
  expect(item.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
  expect(item.ack).not.toHaveBeenCalled();
  expect(await attempts()).toBe(before);
  expect(
    await db
      .prepare(
        "SELECT status,active_attempt_id FROM dispatches WHERE id='production-queued-fixture'",
      )
      .first(),
  ).toEqual({ status: "queued", active_attempt_id: null });
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it("processes duplicate simulation delivery once through the real consumer and domain", async () => {
  const row = await queued("duplicated-simulation");
  const before = await attempts();
  const first = message("queue-first", { dispatchId: row.id });
  const duplicate = message("queue-second", { dispatchId: row.id });
  await Promise.all([
    worker.queue(batch([first]), env),
    worker.queue(batch([duplicate]), env),
  ]);
  expect(first.ack).toHaveBeenCalledOnce();
  expect(duplicate.ack).toHaveBeenCalledOnce();
  expect(first.retry).not.toHaveBeenCalled();
  expect(duplicate.retry).not.toHaveBeenCalled();
  expect(await attempts()).toBe(before + 1);
  const detail = await domain.getDispatch(atelier, row.id);
  expect(detail.dispatch.status).toBe("delivered");
  expect(detail.dispatch.mode).toBe("simulation");
  expect(detail.attempts).toHaveLength(1);
  expect(
    detail.events.some((e) => String(e.payload_json).includes("simulation")),
  ).toBe(true);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it("keeps each organization administrator’s dead letters isolated", async () => {
  const row = await queued("studio-dlq", studio);
  const item = message("studio-private-dlq", { dispatchId: row.id });
  await worker.queue(batch([item], "guteneo-bulk-dlq"), env);
  const atelierRow = await queued("atelier-admin-dlq");
  await worker.queue(
    batch(
      [message("atelier-private-dlq", { dispatchId: atelierRow.id })],
      "guteneo-dispatch-dlq",
    ),
    env,
  );
  const atelierAdmin = await domain.admin(atelier);
  const studioAdmin = await domain.admin(studio);
  expect(studioAdmin.deadLetters.map((r) => r.id)).toContain(
    "studio-private-dlq",
  );
  expect(atelierAdmin.deadLetters.map((r) => r.id)).not.toContain(
    "studio-private-dlq",
  );
  expect(atelierAdmin.deadLetters.map((r) => r.id)).toContain(
    "atelier-private-dlq",
  );
  expect(studioAdmin.deadLetters.map((r) => r.id)).not.toContain(
    "atelier-private-dlq",
  );
  expect(atelierAdmin.deadLetters.map((r) => r.id)).not.toContain(
    "invalid-body",
  );
  expect(studioAdmin.deadLetters.map((r) => r.id)).not.toContain(
    "invalid-body",
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
