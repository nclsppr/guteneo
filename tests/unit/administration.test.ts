import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { Miniflare } from "miniflare";
import { Hono } from "hono";
import { strFromU8, unzipSync } from "fflate";
import {
  DomainError,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
import {
  administrationActivity,
  administrationAudit,
  administrationAuthority,
  administrationConnections,
  administrationConsumption,
  administrationFilters,
  administrationMembers,
  administrationOverview,
  createAdministrationRoutes,
} from "../../apps/api/src/administration";
import { minorToDecimal } from "../../apps/api/src/administration-exports";
import { migratedD1 } from "../helpers/migrated-d1";

// Real migrated Workers SQLite with two fictional workspaces. Every read must
// stay inside the authenticated membership's workspace.
let mf: Miniflare, db: D1Database, env: Env;
const now = new Date();
const stamp = (offsetDays = 0) =>
  new Date(now.getTime() - offsetDays * 86_400_000).toISOString();
const period = stamp().slice(0, 7);
const actor = (
  userId: string,
  role: ActorContext["role"],
  organizationId = "org_alpha",
  kind: ActorContext["actor"] = "browser",
): ActorContext => ({
  organizationId,
  userId,
  role,
  actor: kind,
  documentSessionHash: createHash("sha256")
    .update(`${organizationId}:${userId}`)
    .digest("hex"),
  supervisorCanReport: role === "supervisor",
});
const filters = (query = "") =>
  administrationFilters(new URL(`https://guteneo.test/x?${query}`), now);

beforeAll(async () => {
  ({ mf, db } = await migratedD1("administration"));
  env = { DB: db, MODE: "simulation" } as unknown as Env;
  const dispatch = (
    id: string,
    organizationId: string,
    channel: string,
    status: string,
    recipient: Record<string, string>,
    created: string,
  ) =>
    db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,'sender@example.invalid','{}',?,'simulation',100,200,'EUR',?,?,?,?,?)",
      )
      .bind(
        id,
        organizationId,
        channel,
        JSON.stringify(recipient),
        `s_${organizationId}_${channel}`,
        status,
        `fp_${id}`,
        `key_${id}`,
        `hash_${id}`,
        created,
        created,
      );
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES('org_alpha','Atelier Alpha','simulation',?),('org_beta','Atelier Beta','simulation',?)",
      )
      .bind(stamp(60), stamp(60)),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES('u_admin','Admin Alpha','admin@alpha.invalid',?),('u_super','=Superviseur','super@alpha.invalid',?),('u_member','Membre Alpha','member@alpha.invalid',?),('u_beta','Admin Beta','admin@beta.invalid',?)",
      )
      .bind(stamp(60), stamp(60), stamp(60), stamp(60)),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at,supervisor_can_report) VALUES('org_alpha','u_admin','admin',?,0),('org_alpha','u_super','supervisor',?,1),('org_alpha','u_member','member',?,0),('org_beta','u_beta','admin',?,0)",
      )
      .bind(stamp(50), stamp(40), stamp(30), stamp(50)),
    ...["org_alpha", "org_beta"].flatMap((organization) =>
      ["email", "fax", "postal"].flatMap((channel) => [
        db
          .prepare(
            "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,100,50000,'EUR')",
          )
          .bind(organization, channel, period),
        db
          .prepare(
            "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,?,'Expéditeur fictif',?,'verified','simulation',?)",
          )
          .bind(
            `s_${organization}_${channel}`,
            organization,
            channel,
            `${organization}-${channel}@example.invalid`,
            stamp(60),
          ),
      ]),
    ),
    dispatch(
      "d_alpha_email",
      "org_alpha",
      "email",
      "delivered",
      { email: "secret-recipient@example.invalid" },
      stamp(2),
    ),
    dispatch(
      "d_alpha_fax",
      "org_alpha",
      "fax",
      "failed",
      { fax: "+352000000" },
      stamp(1),
    ),
    dispatch(
      "d_alpha_postal",
      "org_alpha",
      "postal",
      "prepared",
      { name: "Private Person", country: "LU" },
      stamp(0),
    ),
    dispatch(
      "d_beta_email",
      "org_beta",
      "email",
      "delivered",
      { email: "beta@example.invalid" },
      stamp(1),
    ),
    db
      .prepare(
        "INSERT INTO reservations(dispatch_id,organization_id,channel,period,amount_minor,status,created_at,updated_at) VALUES('d_alpha_email','org_alpha','email',?,120,'confirmed',?,?),('d_alpha_postal','org_alpha','postal',?,300,'reserved',?,?),('d_beta_email','org_beta','email',?,999,'confirmed',?,?)",
      )
      .bind(
        period,
        stamp(2),
        stamp(2),
        period,
        stamp(0),
        stamp(0),
        period,
        stamp(1),
        stamp(1),
      ),
    db
      .prepare(
        "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at) VALUES('ap_alpha','org_alpha','d_alpha_email','u_admin','fp_d_alpha_email',?,?)",
      )
      .bind(stamp(-1), stamp(2)),
    db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES('audit_alpha','org_alpha','u_admin','member.role_changed','u_member','{\"secret\":\"never exported\"}',?),('audit_beta','org_beta','u_beta','member.role_changed','u_beta','{}',?)",
      )
      .bind(stamp(3), stamp(3)),
    db
      .prepare(
        "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES('conn_alpha','https://issuer.invalid/','u_super','client','org_alpha','active',?,?),('conn_beta','https://issuer.invalid/','u_beta','client','org_beta','active',?,?)",
      )
      .bind(stamp(5), stamp(5), stamp(5), stamp(5)),
    db
      .prepare(
        "INSERT INTO connection_events(id,organization_id,user_id,kind,connection_id,country,occurred_at,day) VALUES('ev_alpha','org_alpha','u_super','mcp','conn_alpha','LU',?,?),('ev_beta','org_beta','u_beta','mcp','conn_beta','DE',?,?)",
      )
      .bind(stamp(1), stamp(1).slice(0, 10), stamp(1), stamp(1).slice(0, 10)),
  ]);
  await db.batch(
    [
      ...["u_admin", "u_super", "u_member"].map((userId) => ({
        userId,
        org: "org_alpha",
      })),
      { userId: "u_beta", org: "org_beta" },
    ].map(({ userId, org }) =>
      db
        .prepare(
          "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'synthetic',1,0,?,?,1)",
        )
        .bind(
          actor(userId, "admin", org).documentSessionHash,
          userId,
          org,
          stamp(),
          stamp(-1),
        ),
    ),
  );
});
afterAll(async () => {
  await mf?.dispose();
});

describe("workspace administration authority", () => {
  it("derives permissions from the current membership, in the browser only", async () => {
    const admin = await administrationAuthority(
      env,
      actor("u_admin", "admin"),
      "members",
    );
    expect(admin.workspace).toMatchObject({
      id: "org_alpha",
      name: "Atelier Alpha",
      mode: "simulation",
    });
    await expect(
      administrationAuthority(env, actor("u_super", "supervisor"), "reports"),
    ).resolves.toMatchObject({ organizationId: "org_alpha" });
    for (const [context, permission, code] of [
      [actor("u_super", "supervisor"), "members", "FORBIDDEN"],
      [actor("u_member", "member"), "reports", "FORBIDDEN"],
      [
        actor("u_admin", "admin", "org_alpha", "mcp"),
        "reports",
        "BROWSER_REQUIRED",
      ],
      // A session snapshot that no longer matches the membership.
      [actor("u_member", "admin"), "reports", "MEMBERSHIP_CHANGED"],
      [actor("u_admin", "admin", "org_beta"), "reports", "MEMBERSHIP_CHANGED"],
    ] as const)
      await expect(
        administrationAuthority(env, context, permission),
      ).rejects.toMatchObject({ code });
  });

  it("rejects unbounded periods and pages", () => {
    for (const query of [
      "from=2026-01-01&to=2027-06-01",
      "from=2026-02-30",
      "pageSize=101",
      "page=0",
      "channel=sms",
      "status=unknown",
    ])
      expect(() => filters(query)).toThrow(DomainError);
  });
});

describe("workspace administration reads", () => {
  it("summarizes only the authenticated workspace", async () => {
    const authority = await administrationAuthority(
      env,
      actor("u_admin", "admin"),
      "reports",
    );
    const overview = await administrationOverview(env, authority, filters());
    expect(overview.totals).toMatchObject({
      dispatches: 3,
      delivered: 1,
      attention: 1,
      consumptionMinor: 120,
      reservedMinor: 300,
      members: 3,
      activeConnections: 4,
    });
    expect(overview.trend).toHaveLength(30);
    expect(overview.channels.map((row) => row.channel).sort()).toEqual([
      "email",
      "fax",
      "postal",
    ]);
    expect(overview.incidents).toEqual([
      { kind: "dispatch_attention", count: 1, severity: "warning" },
    ]);
  });

  it("lists dispatch metadata without recipients and with server filters", async () => {
    const authority = await administrationAuthority(
      env,
      actor("u_super", "supervisor"),
      "reports",
    );
    const all = await administrationActivity(env, authority, filters());
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.id)).toEqual([
      "d_alpha_postal",
      "d_alpha_fax",
      "d_alpha_email",
    ]);
    expect(JSON.stringify(all)).not.toMatch(
      /secret-recipient|\+352000000|Private Person|beta/,
    );
    expect(all.items.find((item) => item.id === "d_alpha_email")).toMatchObject(
      {
        approvedBy: "Admin Alpha",
        consumptionMinor: 120,
        deliveryMode: "none",
      },
    );
    expect(
      all.items.find((item) => item.id === "d_alpha_postal"),
    ).toMatchObject({ destinationCountry: "LU", reservedMinor: 300 });
    const fax = await administrationActivity(
      env,
      authority,
      filters("channel=fax"),
    );
    expect(fax.items.map((item) => item.id)).toEqual(["d_alpha_fax"]);
    const attention = await administrationActivity(
      env,
      authority,
      filters("group=attention&pageSize=1"),
    );
    expect(attention).toMatchObject({ total: 1, pageSize: 1 });
  });

  it("reports members, connections, consumption and audit for one workspace", async () => {
    const authority = await administrationAuthority(
      env,
      actor("u_admin", "admin"),
      "members",
    );
    const members = await administrationMembers(env, authority, filters());
    expect(members.total).toBe(3);
    expect(members.items[0]).toMatchObject({
      userId: "u_admin",
      role: "admin",
      canApprove: true,
      canReport: true,
      approvals: 1,
    });
    expect(
      members.items.find((item) => item.userId === "u_super"),
    ).toMatchObject({ canReport: true, activeConnections: 2 });
    const connections = await administrationConnections(
      env,
      authority,
      filters(),
    );
    expect(
      connections.current.items.filter((item) => item.kind === "mcp"),
    ).toEqual([expect.objectContaining({ id: "conn_alpha", kind: "mcp" })]);
    expect(connections.events.items.map((item) => item.id)).toEqual([
      "ev_alpha",
    ]);
    expect(JSON.stringify(connections)).not.toContain("LU");
    const consumption = await administrationConsumption(
      env,
      authority,
      filters(),
    );
    expect(consumption).toMatchObject({
      basis: "simulation_confirmation",
      totalMinor: 120,
      reservedMinor: 300,
      services: [{ service: "dispatch", charges: 1, amountMinor: 120 }],
      channels: [{ channel: "email", dispatches: 1, consumptionMinor: 120 }],
    });
    const audit = await administrationAudit(env, authority, filters());
    expect(audit.items).toEqual([
      expect.objectContaining({
        id: "audit_alpha",
        actor: "Admin Alpha",
        resourceId: "u_member",
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain("never exported");
  });
});

describe("workspace administration exports", () => {
  function app(context: ActorContext, bindings = env) {
    const router = new Hono<{
      Bindings: Env;
      Variables: { actor: ActorContext };
    }>();
    router.use("*", async (c, next) => {
      c.set("actor", context);
      await next();
    });
    router.route("/", createAdministrationRoutes());
    router.onError((error, c) =>
      error instanceof DomainError
        ? c.json(
            { error: { code: error.code } },
            error.status as 400 | 403 | 422,
          )
        : c.json({ error: { code: "INTERNAL", message: String(error) } }, 500),
    );
    return (path: string) =>
      router.request(`https://guteneo.test${path}`, {}, bindings);
  }

  it("keeps integer minor units exact in decimal output", () => {
    expect(minorToDecimal(0)).toBe("0.00");
    expect(minorToDecimal(5)).toBe("0.05");
    expect(minorToDecimal(123456)).toBe("1234.56");
    expect(minorToDecimal(-120)).toBe("-1.20");
  });

  it("downloads a guarded CSV and records the export in the audit log", async () => {
    const response = await app(actor("u_admin", "admin"))(
      "/api/administration/exports/members?format=csv&locale=fr",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="guteneo-atelier-alpha-members-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-simulation\.csv"$/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    // UTF-8 byte-order mark, so spreadsheet applications keep accents.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("Membre,E-mail,Rôle")).toBe(true);
    // A leading "=" from a member name is never evaluated as a formula.
    expect(text).toContain("'=Superviseur");
    expect(text.trim().split("\r\n")).toHaveLength(4);
    const recorded = await db
      .prepare(
        "SELECT user_id,resource_id,details_json FROM audit_log WHERE organization_id='org_alpha' AND action='report.exported'",
      )
      .first<{ user_id: string; resource_id: string; details_json: string }>();
    expect(recorded).toMatchObject({
      user_id: "u_admin",
      resource_id: "members",
    });
    expect(JSON.parse(recorded!.details_json)).toMatchObject({
      format: "csv",
      rows: 3,
    });
  });

  it("builds a workbook with one sheet per table, limited by permission", async () => {
    const admin = await app(actor("u_admin", "admin"))(
      "/api/administration/exports/report?format=xlsx&locale=en",
    );
    expect(admin.status).toBe(200);
    const files = unzipSync(new Uint8Array(await admin.arrayBuffer()));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    for (const sheet of [
      "Summary",
      "Channels",
      "Activity",
      "Charges",
      "Members",
      "Connections",
      "Audit log",
    ])
      expect(workbook).toContain(`name="${sheet}"`);
    const sheets = Object.keys(files)
      .filter((name) => name.startsWith("xl/worksheets/"))
      .map((name) => strFromU8(files[name]))
      .join("");
    expect(sheets).toContain("d_alpha_email");
    expect(sheets).not.toMatch(/secret-recipient|d_beta_email|Atelier Beta/);
    const supervisor = await app(actor("u_super", "supervisor"))(
      "/api/administration/exports/report?format=xlsx",
    );
    const limited = strFromU8(
      unzipSync(new Uint8Array(await supervisor.arrayBuffer()))[
        "xl/workbook.xml"
      ],
    );
    expect(limited).toContain('name="Activity"');
    expect(limited).not.toContain('name="Members"');
    expect(
      (
        await app(actor("u_super", "supervisor"))(
          "/api/administration/exports/members?format=csv",
        )
      ).status,
    ).toBe(403);
  });

  it("renders a PDF report and refuses unavailable combinations", async () => {
    const pdf = await app(actor("u_admin", "admin"))(
      "/api/administration/exports/report?format=pdf&locale=de",
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const request = app(actor("u_admin", "admin"));
    expect(
      (await request("/api/administration/exports/report?format=csv")).status,
    ).toBe(400);
    expect(
      (
        await app(actor("u_admin", "admin", "org_alpha", "mcp"))(
          "/api/administration/exports/activity?format=csv",
        )
      ).status,
    ).toBe(403);
  });

  it("enforces every route against current roles, supervisor options, native and MCP actors", async () => {
    const reports = [
      "overview",
      "activity",
      "consumption",
      "exports/activity?format=csv",
      "exports/consumption?format=csv",
      "exports/report?format=xlsx",
    ];
    const members = [
      "members",
      "connections",
      "audit",
      "exports/members?format=csv",
      "exports/connections?format=csv",
      "exports/audit?format=csv",
    ];
    for (const kind of ["browser", "native", "mcp"] as const) {
      for (const path of [...reports, ...members]) {
        expect(
          (
            await app(actor("u_admin", "admin", "org_alpha", kind))(
              `/api/administration/${path}`,
            )
          ).status,
          `${kind} ${path}`,
        ).toBe(kind === "browser" ? 200 : 403);
      }
    }
    for (const path of [...reports, ...members])
      expect(
        (
          await app(actor("u_super", "supervisor"))(
            `/api/administration/${path}`,
          )
        ).status,
        path,
      ).toBe(reports.includes(path) ? 200 : 403);
    await db
      .prepare(
        "UPDATE memberships SET supervisor_can_report=0 WHERE organization_id='org_alpha' AND user_id='u_super'",
      )
      .run();
    try {
      for (const path of reports)
        expect(
          (
            await app(actor("u_super", "supervisor"))(
              `/api/administration/${path}`,
            )
          ).status,
        ).toBe(403);
    } finally {
      await db
        .prepare(
          "UPDATE memberships SET supervisor_can_report=1 WHERE organization_id='org_alpha' AND user_id='u_super'",
        )
        .run();
    }
    for (const role of ["member", "viewer"] as const) {
      await db
        .prepare(
          "UPDATE memberships SET role=? WHERE organization_id='org_alpha' AND user_id='u_member'",
        )
        .bind(role)
        .run();
      try {
        for (const path of [...reports, ...members])
          expect(
            (await app(actor("u_member", role))(`/api/administration/${path}`))
              .status,
          ).toBe(403);
      } finally {
        await db
          .prepare(
            "UPDATE memberships SET role='member' WHERE organization_id='org_alpha' AND user_id='u_member'",
          )
          .run();
      }
    }
  });

  it("rechecks a revoked administrator after a report read and before releasing an export", async () => {
    // Keep another administrator so the real last-administrator trigger permits
    // the tested revocation instead of rejecting the fixture mutation itself.
    await db
      .prepare(
        "UPDATE memberships SET role='admin' WHERE organization_id='org_alpha' AND user_id='u_member'",
      )
      .run();
    for (const [path, change, code] of [
      ["activity", "role", "MEMBERSHIP_CHANGED"],
      ["exports/activity?format=xlsx", "role", "MEMBERSHIP_CHANGED"],
      ["exports/activity?format=xlsx", "deleted", "SESSION_EXPIRED"],
      ["exports/activity?format=xlsx", "expired", "SESSION_EXPIRED"],
      ["exports/activity?format=xlsx", "reports", "FORBIDDEN"],
    ]) {
      const context =
        change === "reports"
          ? actor("u_super", "supervisor")
          : actor("u_admin", "admin");
      let revoked = false;
      const wrap = (
        statement: D1PreparedStatement,
        sql: string,
      ): D1PreparedStatement =>
        new Proxy(statement, {
          get(target, property) {
            if (property === "bind")
              return (...values: unknown[]) =>
                wrap(target.bind(...values), sql);
            if (property === "all")
              return async () => {
                const result = await target.all();
                if (!revoked && sql.includes("SELECT d.id,d.channel")) {
                  revoked = true;
                  if (change === "role")
                    await db
                      .prepare(
                        "UPDATE memberships SET role='member' WHERE organization_id='org_alpha' AND user_id='u_admin'",
                      )
                      .run();
                  else if (change === "reports")
                    await db
                      .prepare(
                        "UPDATE memberships SET supervisor_can_report=0 WHERE organization_id='org_alpha' AND user_id='u_super'",
                      )
                      .run();
                  else if (change === "deleted")
                    await db
                      .prepare(
                        "DELETE FROM browser_sessions WHERE token_hash=?",
                      )
                      .bind(context.documentSessionHash)
                      .run();
                  else
                    await db
                      .prepare(
                        "UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
                      )
                      .bind(context.documentSessionHash)
                      .run();
                }
                return result;
              };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      const proxy = new Proxy(db, {
        get(target, property) {
          if (property === "prepare")
            return (sql: string) => wrap(target.prepare(sql), sql);
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const before = await db
        .prepare(
          "SELECT count(*) n FROM audit_log WHERE action='report.exported'",
        )
        .first();
      try {
        const response = await app(context, {
          ...env,
          DB: proxy,
        })(`/api/administration/${path}`);
        expect(revoked).toBe(true);
        expect(response.status).toBe(code === "SESSION_EXPIRED" ? 401 : 403);
        expect(await response.json()).toEqual({
          error: { code },
        });
        expect(
          await db
            .prepare(
              "SELECT count(*) n FROM audit_log WHERE action='report.exported'",
            )
            .first(),
        ).toEqual(before);
      } finally {
        await db
          .prepare(
            "UPDATE memberships SET role='admin' WHERE organization_id='org_alpha' AND user_id='u_admin'",
          )
          .run();
        await db
          .prepare(
            "UPDATE memberships SET supervisor_can_report=1 WHERE organization_id='org_alpha' AND user_id='u_super'",
          )
          .run();
        if (change === "deleted")
          await db
            .prepare(
              "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,'u_admin','org_alpha','synthetic',1,0,?,?,1)",
            )
            .bind(context.documentSessionHash, stamp(), stamp(-1))
            .run();
        if (change === "expired")
          await db
            .prepare(
              "UPDATE browser_sessions SET expires_at=? WHERE token_hash=?",
            )
            .bind(stamp(-1), context.documentSessionHash)
            .run();
      }
    }
    await db
      .prepare(
        "UPDATE memberships SET role='member' WHERE organization_id='org_alpha' AND user_id='u_member'",
      )
      .run();
  });

  it("exports exactly 10,000 tenant rows and refuses 10,001 before recording success", async () => {
    await db.batch([
      db
        .prepare(
          "INSERT INTO organizations(id,name,mode,created_at) VALUES('org_volume','Synthetic volume','simulation',?)",
        )
        .bind(stamp()),
      db
        .prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_volume','u_admin','admin',?)",
        )
        .bind(stamp()),
      db
        .prepare(
          "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,'u_admin','org_volume','synthetic',1,0,?,?,1)",
        )
        .bind(
          actor("u_admin", "admin", "org_volume").documentSessionHash,
          stamp(),
          stamp(-1),
        ),
      db
        .prepare(
          "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('volume_sender','org_volume','email','Synthetic','synthetic@example.invalid','verified','simulation',?)",
        )
        .bind(stamp()),
      db
        .prepare(
          "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) SELECT 'volume_'||x,'org_volume','email','{}','volume_sender','synthetic@example.invalid','{}','prepared','simulation',0,0,'EUR','fp_'||x,'key_'||x,'hash_'||x,?1,?1 FROM n",
        )
        .bind(stamp()),
    ]);
    const request = app(actor("u_admin", "admin", "org_volume"));
    const response = await request(
      "/api/administration/exports/activity?format=csv",
    );
    expect(response.status).toBe(200);
    expect((await response.text()).trim().split("\r\n")).toHaveLength(10001);
    await db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES('volume_10001','org_volume','email','{}','volume_sender','synthetic@example.invalid','{}','prepared','simulation',0,0,'EUR','fp_extra','key_extra','hash_extra',?1,?1)",
      )
      .bind(stamp())
      .run();
    for (const format of ["csv", "xlsx", "pdf"]) {
      const refused = await request(
        `/api/administration/exports/activity?format=${format}`,
      );
      expect(refused.status).toBe(422);
      expect(await refused.json()).toEqual({
        error: { code: "EXPORT_TOO_LARGE" },
      });
    }
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM audit_log WHERE organization_id='org_volume' AND action='report.exported'",
        )
        .first(),
    ).toEqual({ n: 1 });
  });
});
