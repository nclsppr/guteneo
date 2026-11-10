import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DomainService, sha256 } from "../../packages/domain/src/index.ts";
import { PdfValidationService } from "../../apps/api/src/pdf-validation.ts";
import { DispatchScheduleService } from "../../apps/api/src/dispatch-schedules.ts";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
} from "../../packages/contracts/src/pdf-validation.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
let assertions = 0;
const proof = {
  equal(actual: unknown, expected: unknown) {
    assert.equal(actual, expected);
    assertions++;
  },
  deepEqual(actual: unknown, expected: unknown) {
    assert.deepEqual(actual, expected);
    assertions++;
  },
  notEqual(actual: unknown, expected: unknown) {
    assert.notEqual(actual, expected);
    assertions++;
  },
  ok(value: unknown) {
    assert.ok(value);
    assertions++;
  },
  async rejects(
    pending: Promise<unknown>,
    validator: (error: unknown) => boolean,
  ) {
    await assert.rejects(pending, validator);
    assertions++;
  },
};
// Requires Node 24.8+ for native node:sqlite. Run with the repository's pinned tsx.
// This adapter qualifies SQLite application logic, not Cloudflare D1/workerd.
// All state is in memory and provider/renderer calls below are local fakes.
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
const migrationFiles = readdirSync(root + "/migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort();
for (const file of migrationFiles)
  sql.exec(readFileSync(root + "/migrations/" + file, "utf8"));
sql.exec(readFileSync(root + "/scripts/seed.sql", "utf8"));
function statement(query, values = []) {
  return {
    bind(...args) {
      return statement(query, args);
    },
    async first(column) {
      const row = sql.prepare(query).get(...values);
      return row ? (column ? row[column] : row) : null;
    },
    async all() {
      return {
        success: true,
        results: sql.prepare(query).all(...values),
        meta: { changes: 0 },
      };
    },
    async run() {
      const result = sql.prepare(query).run(...values);
      return {
        success: true,
        results: [],
        meta: {
          changes: Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    },
    execute() {
      const stmt = sql.prepare(query);
      if (stmt.columns().length) {
        const results = stmt.all(...values);
        return {
          success: true,
          results,
          meta: { changes: Number(sql.prepare("SELECT changes() n").get().n) },
        };
      }
      const result = stmt.run(...values);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes) },
      };
    },
  };
}
const db = {
  prepare: statement,
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return results;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const actor = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
  documentSessionHash: "a".repeat(64),
};
const now = () => new Date().toISOString();
const restoreSession = () =>
  sql
    .prepare(
      "INSERT OR REPLACE INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',0,1,?,?)",
    )
    .run(
      actor.documentSessionHash,
      actor.userId,
      actor.organizationId,
      now(),
      new Date(Date.now() + 3600_000).toISOString(),
    );
restoreSession();
const domain = new DomainService(db, { mode: "simulation" });
const prepare = () =>
  domain.prepareDispatch(
    actor,
    {
      channel: "email",
      recipient: { email: "fictional@example.invalid" },
      subject: "Synthetic",
      text: "Synthetic immutable message",
    },
    crypto.randomUUID(),
  );
const first = await prepare();
const receipt = await domain.requestDispatchApproval(actor, first.id);
proof.deepEqual(await domain.requestDispatchApproval(actor, first.id), receipt);
proof.equal(
  sql
    .prepare(
      "SELECT count(*) n FROM audit_log WHERE action='dispatch.approval_requested'",
    )
    .get().n,
  1,
);
for (const table of ["approvals", "reservations", "outbox"])
  proof.equal(sql.prepare("SELECT count(*) n FROM " + table).get().n, 0);
sql
  .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
  .run(actor.documentSessionHash);
await proof.rejects(
  domain.requestDispatchApproval(actor, first.id),
  (e) => e.code === "FORBIDDEN",
);
restoreSession();
for (const kind of ["cancel", "session", "schedule"]) {
  const source = await prepare();
  let changed = false;
  const racedDb = {
    prepare: db.prepare,
    async batch(statements) {
      if (!changed) {
        changed = true;
        if (kind === "cancel") await domain.cancelDispatch(actor, source.id);
        if (kind === "session")
          sql
            .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
            .run(actor.documentSessionHash);
        if (kind === "schedule")
          await new DispatchScheduleService(
            { MODE: "simulation" },
            domain,
          ).create(
            actor,
            {
              dispatchId: source.id,
              executeAt: new Date(Date.now() + 180_000).toISOString(),
              maxTotalMinor: 100,
            },
            crypto.randomUUID(),
          );
      }
      return db.batch(statements);
    },
  };
  await proof.rejects(
    new DomainService(racedDb, { mode: "simulation" }).requestDispatchApproval(
      actor,
      source.id,
    ),
    (e) =>
      e.code ===
      (kind === "cancel"
        ? "INVALID_STATE"
        : kind === "schedule"
          ? "SCHEDULE_SOURCE_LOCKED"
          : "FORBIDDEN"),
  );
  proof.equal(
    sql
      .prepare(
        "SELECT count(*) n FROM audit_log WHERE action='dispatch.approval_requested' AND resource_id=?",
      )
      .get(source.id).n,
    0,
  );
  restoreSession();
}
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nSynthetic exact-byte fixture",
);
const hash = await sha256(bytes);
const document = await domain.registerDocument(actor, {
  name: "Synthetic.pdf",
  sha256: hash,
  size: bytes.length,
  pages: 1,
  status: "ready",
  source: "import",
  storageKey: "synthetic/file.pdf",
  privateToCreator: true,
});
let engineCalls = 0;
const env = {
  DB: db,
  MODE: "simulation",
  ENVIRONMENT: "local",
  APP_ORIGIN: "http://localhost:8787",
  PDF_VALIDATION_ENABLED: "true",
  DOCUMENTS: {
    async get() {
      return {
        size: bytes.length,
        async arrayBuffer() {
          return bytes.buffer;
        },
      };
    },
  },
  PDF_VALIDATOR: {
    async fetch(request) {
      engineCalls++;
      const profile = new URL(request.url).searchParams.get("profile");
      return Response.json({
        sha256: hash,
        profile,
        engine: { name: "veraPDF", version: "1.30.2" },
        compliant: true,
        passedRules: profile === "ua1" ? 106 : 129,
        failedRules: 0,
        failedChecks: 0,
        truncated: false,
        findings: [],
      });
    },
  },
};
const authority = {
  context: actor,
  async assertCurrent() {
    if (
      !sql
        .prepare("SELECT 1 FROM browser_sessions WHERE token_hash=?")
        .get(actor.documentSessionHash)
    )
      throw Object.assign(new Error("Synthetic session revoked"), {
        code: "SESSION_EXPIRED",
      });
  },
  sql() {
    return {
      condition: "EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)",
      values: [actor.documentSessionHash],
    };
  },
};
const service = new PdfValidationService(env, domain);
for (const profile of ["ua1", "1b"])
  await service.validate(
    authority,
    document.id,
    {
      profile,
      purchase: {
        confirmed: true,
        documentSha256: hash,
        priceMinor: PDF_VALIDATION_PRICE_MINOR,
        currency: "EUR",
        termsVersion: PDF_VALIDATION_TERMS_VERSION,
      },
    },
    crypto.randomUUID(),
  );
const countBefore = sql
  .prepare("SELECT count(*) n FROM pdf_validation_purchases")
  .get().n;
const page1 = await service.history(authority, undefined, 1);
proof.equal(page1.items.length, 1);
proof.ok(page1.nextCursor);
proof.equal(page1.items[0].status, "passed");
const page2 = await service.history(authority, page1.nextCursor, 1);
proof.equal(page2.items.length, 1);
proof.equal(page2.nextCursor, null);
proof.notEqual(page1.items[0].id, page2.items[0].id);
proof.equal(engineCalls, 2);
proof.equal(
  sql.prepare("SELECT count(*) n FROM pdf_validation_purchases").get().n,
  countBefore,
);
proof.equal(
  Object.keys(page1.items[0]).sort().join(","),
  "completedAt,createdAt,documentId,documentName,evidence,id,profile,status",
);
await proof.rejects(
  service.history(authority, "invalid"),
  (e) => e.code === "INVALID_CURSOR",
);
await proof.rejects(
  service.history(authority, undefined, 51),
  (e) => e.code === "INVALID_INPUT",
);
const other = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
proof.equal(
  (await service.history({ ...authority, context: other })).items.length,
  0,
);
proof.equal(sql.prepare("PRAGMA quick_check").get().quick_check, "ok");
proof.equal(sql.prepare("PRAGMA foreign_key_check").all().length, 0);
console.log(
  JSON.stringify({
    assertions,
    runtime: "Node native SQLite, synthetic D1 adapter, not Workers/D1",
    migrations: migrationFiles.length,
    approvalIdempotence: true,
    noSendingEffects: true,
    cancelSessionScheduleRaces: true,
    historyKeysetAndBounds: true,
    historyMetadataOnly: true,
    noHistoryPurchase: true,
    crossTenantIsolation: true,
    engineCalls,
    quickCheck: sql.prepare("PRAGMA quick_check").get().quick_check,
  }),
);

sql.close();
