import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { DomainService } from "../../packages/domain/src/index";

let mf: Miniflare, db: D1Database;
const snapshot: Record<string, unknown[]> = {};
const date = new Date().toISOString();
const later = new Date(Date.now() + 3600000).toISOString();
const tables = [
  "browser_sessions",
  "authorized_connections",
  "development_mcp_tokens",
  "native_authorization_codes",
  "native_sessions",
  "document_analysis",
  "dispatches",
  "approvals",
  "reservations",
  "outbox",
];
async function applySql(source: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete migration");
  if (statements.length) await db.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql") && name < "0042_")
    .sort())
    await applySql(
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await applySql(
    await readFile(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES('legacy_operator','Historical operator','operator@example.invalid',?)",
      )
      .bind(date),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_atelier','legacy_operator','member',?)",
      )
      .bind(date),
    db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES('migration_session','legacy_operator','org_atelier','fixture',1,1,?,?)",
      )
      .bind(date, later),
    db
      .prepare(
        "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES('migration_connection','https://fictional.example/','legacy_operator','fictional-client','org_atelier','active',?,?)",
      )
      .bind(date, date),
    db
      .prepare(
        "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES('migration_token','legacy_operator','org_atelier',?)",
      )
      .bind(later),
    db
      .prepare(
        "INSERT INTO native_authorization_codes(code_hash,browser_session_hash,organization_id,user_id,code_challenge,expires_at,created_at) VALUES('migration_code','migration_session','org_atelier','legacy_operator',?,?,?)",
      )
      .bind("a".repeat(43), later, date),
    db
      .prepare(
        "INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at) VALUES('migration_native','migration_session','org_atelier','legacy_operator',?,?)",
      )
      .bind(date, later),
    db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES('migration_document','org_atelier','Historical.pdf',?,100,0,'quarantined','import','fictional/historical.pdf',?)",
      )
      .bind("a".repeat(64), date),
    db
      .prepare(
        "INSERT INTO document_analysis(organization_id,document_id,request_user_id,request_role,state,code,deadline_at,next_attempt_at,updated_at) VALUES('org_atelier','migration_document','legacy_operator','member','retryable','scanner_unavailable',?,?,?)",
      )
      .bind(Date.now() + 60000, Date.now(), Date.now()),
  ]);
  for (const id of ["historical_prepared", "historical_queued"]) {
    await db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,'org_atelier','email',?,'sender_atelier_email','atelier@example.invalid','Fixture','<p>Fixture</p>','Fixture','{}','prepared','simulation',1,1,'EUR',?,?,?,?,?)",
      )
      .bind(
        id,
        JSON.stringify({ email: "fictional@example.invalid" }),
        `${id}_fingerprint`,
        id,
        `${id}_hash`,
        date,
        date,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at) VALUES(?,'org_atelier',?,'legacy_operator',?,?,?)",
      )
      .bind(`${id}_approval`, id, `${id}_fingerprint`, later, date)
      .run();
  }
  await db
    .prepare(
      "UPDATE dispatches SET status='queued',updated_at=? WHERE id='historical_queued'",
    )
    .bind(date)
    .run();
  for (const table of tables)
    snapshot[table] = (
      await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    ).results;
  await applySql(
    await readFile(
      new URL("../../migrations/0042_workspace_roles.sql", import.meta.url),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => mf?.dispose());

describe("0042 roles migration on a populated D1 database", () => {
  it("preserves sessions, OAuth connections, native credentials, scan recovery and immutable dispatch evidence", async () => {
    for (const table of tables)
      expect(
        (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
          .results,
        table,
      ).toEqual(snapshot[table]);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
      quick_check: "ok",
    });
    expect(
      (
        await db
          .prepare("SELECT name FROM sqlite_master WHERE name LIKE '_roles_%'")
          .all()
      ).results,
    ).toEqual([]);
  });

  it("retains legacy role names with all new authority disabled and protects the last admin", async () => {
    expect(
      await db
        .prepare(
          "SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE user_id='legacy_operator'",
        )
        .first(),
    ).toEqual({
      role: "member",
      supervisor_can_approve: 0,
      supervisor_can_report: 0,
    });
    await expect(
      db
        .prepare(
          "UPDATE memberships SET role='supervisor' WHERE organization_id='org_atelier' AND user_id='user_atelier'",
        )
        .run(),
    ).rejects.toThrow("last_admin_required");
    await expect(
      db
        .prepare(
          "DELETE FROM memberships WHERE organization_id='org_atelier' AND user_id='user_atelier'",
        )
        .run(),
    ).rejects.toThrow("last_admin_required");
    await expect(
      db
        .prepare(
          "UPDATE memberships SET supervisor_can_approve=1 WHERE user_id='legacy_operator'",
        )
        .run(),
    ).rejects.toThrow();
  });

  it("refuses historical member approval for new acceptance without changing already queued work", async () => {
    const service = new DomainService(db, { mode: "simulation" });
    const admin = {
      organizationId: "org_atelier",
      userId: "user_atelier",
      role: "admin" as const,
      actor: "browser" as const,
    };
    await expect(
      service.confirmDispatch(admin, "historical_prepared", "after-migration"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await db
        .prepare("SELECT status FROM dispatches WHERE id='historical_prepared'")
        .first(),
    ).toEqual({ status: "prepared" });
    expect(
      await db
        .prepare("SELECT status FROM dispatches WHERE id='historical_queued'")
        .first(),
    ).toEqual({ status: "queued" });
    expect(
      (await db.prepare("SELECT * FROM reservations ORDER BY rowid").all())
        .results,
    ).toEqual(snapshot.reservations);
    expect(
      (await db.prepare("SELECT * FROM outbox ORDER BY rowid").all()).results,
    ).toEqual(snapshot.outbox);
    expect(
      (await db.prepare("SELECT * FROM idempotency_keys").all()).results,
    ).toEqual([]);
  });

  it("permits supervisor scan recovery without granting browser approval implicitly", async () => {
    await db
      .prepare(
        "UPDATE memberships SET role='supervisor' WHERE user_id='legacy_operator'",
      )
      .run();
    await db
      .prepare(
        "UPDATE document_analysis SET request_role='supervisor' WHERE document_id='migration_document'",
      )
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at) VALUES('new_supervisor_approval','org_atelier','historical_prepared','legacy_operator','historical_prepared_fingerprint',?,?)",
        )
        .bind(later, date)
        .run(),
    ).rejects.toThrow("approval_permission_required");
    expect(
      await db
        .prepare(
          "SELECT request_role FROM document_analysis WHERE document_id='migration_document'",
        )
        .first(),
    ).toEqual({ request_role: "supervisor" });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
