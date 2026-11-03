import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import type { Env } from "../../apps/api/src/env";
import {
  authenticatePersonalBrowser,
  createPersonalBrowserSession,
} from "../../apps/api/src/auth";
import type { PersonalPrincipal } from "../../apps/api/src/personal-auth";
import { PersonalDocumentsService } from "../../apps/api/src/personal-documents";
import type { PersonalDocumentItem } from "../../packages/contracts/src/secure-distribution";
import type { PersonalDocumentPage } from "../../packages/contracts/src/personal-documents";
import { migratedD1 } from "../helpers/migrated-d1";

// Hundreds of synthetic received documents in a real migrated database. The
// single paged query must keep the semantics of the per-document projection.
let mf: Miniflare, db: D1Database, env: Env;
let recipient: PersonalPrincipal, service: PersonalDocumentsService;
const origin = "https://guteneo.example.test";
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const hex = (n: number, prefix: string) =>
  `${prefix}_${n.toString(16).padStart(32, "0")}`;
const sha = (n: number) => n.toString(16).padStart(64, "0");
const SHARED = 240;
const expected = { available: 0, pending: 0, expiring: 0, ended: 0 };

beforeAll(async () => {
  ({ mf, db } = await migratedD1("personal-document-list"));
  env = {
    DB: db,
    APP_ORIGIN: origin,
    MODE: "simulation",
    ENVIRONMENT: "local",
    SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account",
    AUTH0_AUTH_POLICY: "verified_email",
  } as unknown as Env;
  const created = at(-400);
  const policy = JSON.stringify({
    retentionDays: 30,
    allowOriginalDownload: false,
    allowVaultDeposit: true,
    personalRetentionDays: 365,
  });
  const statements: D1PreparedStatement[] = [
    db.prepare(
      "UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1",
    ),
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES('org_alpha','Atelier Alpha','simulation',?),('org_beta','Cabinet Été','simulation',?)",
      )
      .bind(created, created),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES('u_sender','Expéditeur','sender@example.test',?),('u_recipient','Destinataire','recipient@example.test',?),('u_other','Autre','other@example.test',?)",
      )
      .bind(created, created, created),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_alpha','u_sender','admin',?),('org_beta','u_sender','admin',?)",
      )
      .bind(created, created),
    db
      .prepare(
        "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/','u_recipient','u_recipient',?)",
      )
      .bind(created),
  ];
  for (let n = 1; n <= SHARED + 5; n++) {
    const organization = n % 3 === 0 ? "org_beta" : "org_alpha";
    const owner = n > SHARED ? "u_other" : "u_recipient";
    // Ten documents per state cycle: bound and current, unbound, expiring
    // soon, expired and revoked.
    const state = n % 10;
    const bound = state !== 1;
    const status = state === 4 ? "revoked" : "active";
    const expires =
      state === 2 ? at(3) : state === 3 ? at(-1) : at(30 + (n % 7));
    if (owner === "u_recipient") {
      if (state === 4 || state === 3) expected.ended++;
      else if (!bound) expected.pending++;
      else {
        expected.available++;
        if (state === 2) expected.expiring++;
      }
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES(?,?,?,?,10,1,'ready','import',?,?)",
        )
        .bind(`doc_${n}`, organization, `src ${n}`, sha(n), `k/${n}`, created),
      db
        .prepare(
          `INSERT INTO secure_distributions(id,organization_id,source_id,source_sha256,source_name,source_pages,created_by,request_key,request_hash,recipient_address,recipient_user_id,bound_at,binding_method,token_hash,sealed_token,policy_json,quote_json,input_json,service_fee_minor,price_version,status,created_at,prepared_expires_at,activated_at,expires_at,revoked_at)
           VALUES(?,?,?,?,?,1,'u_sender',?,?,?,?,?,?,?,'sealed',?,'{}','{}',0,'secure-distribution-2026-10-24-v1',?,?,?,?,?,?)`,
        )
        .bind(
          hex(n, "sd"),
          organization,
          `doc_${n}`,
          sha(n),
          // Accented, mixed-case titles exercise the cursor encoding.
          `${n % 2 ? "Été" : "avis"} ${String(n).padStart(3, "0")}.pdf`,
          `req_${n}`,
          `hash_${n}`,
          `${owner}@example.test`,
          owner,
          bound ? at(-300 + n) : null,
          bound ? "verified_email" : null,
          sha(100_000 + n),
          policy,
          status,
          created,
          at(-300),
          // Several documents share an activation instant: id breaks ties.
          at(-300 + Math.floor(n / 2)),
          expires,
          status === "revoked" ? at(-1) : null,
        ),
    );
  }
  // One kept copy derived from document 5, one from the other account.
  for (const [n, owner] of [
    [5, "u_recipient"],
    [SHARED + 1, "u_other"],
  ] as const)
    statements.push(
      db
        .prepare(
          "INSERT INTO secure_personal_documents(id,user_id,source_organization_id,source_distribution_id,source_sha256,source_name,sender_name,policy_json,original_key,manifest_sha256,status,created_at,expires_at) VALUES(?,?,?,?,?,?,'Atelier Alpha',?,?,?,'active',?,?)",
        )
        .bind(
          hex(n, "pd"),
          owner,
          n % 3 === 0 ? "org_beta" : "org_alpha",
          hex(n, "sd"),
          sha(n),
          `Copie ${n}.pdf`,
          policy,
          `copy/${n}`,
          sha(200_000 + n),
          at(-10),
          at(300),
        ),
    );
  for (let index = 0; index < statements.length; index += 50)
    await db.batch(statements.slice(index, index + 50));
  const session = await createPersonalBrowserSession(env, {
    userId: "u_recipient",
    verifiedEmail: "recipient@example.test",
    mfa: false,
    verifiedAccount: true,
    authenticatedAt: Math.floor(Date.now() / 1000),
    amr: ["pwd"],
    strongAuthentication: false,
    authenticationPolicyVersion: null,
    identityIssuer: "https://fixture.invalid/",
    identitySubject: "u_recipient",
    development: false,
  });
  recipient = await authenticatePersonalBrowser(
    new Request(`${origin}/api/personal/session`, {
      headers: { Cookie: session.cookie.split(";")[0] },
    }),
    env,
  );
  service = new PersonalDocumentsService(env);
});
afterAll(async () => {
  await mf?.dispose();
});

async function everyPage(
  query: Parameters<PersonalDocumentsService["list"]>[1],
) {
  const items: PersonalDocumentItem[] = [];
  let cursor: string | undefined;
  let first: PersonalDocumentPage | undefined;
  do {
    const page = await service.list(recipient, { ...query, cursor });
    first ??= page;
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, total: first!.total };
}

describe("My documents at volume", () => {
  it("keeps database requests bounded independently of page size", async () => {
    const statements: string[] = [];
    const measuredDatabase = new Proxy(db, {
      get(target, property) {
        if (property === "prepare")
          return (sql: string) => {
            statements.push(sql);
            return target.prepare(sql);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const measured = new PersonalDocumentsService({
      ...env,
      DB: measuredDatabase,
    });
    for (const limit of [1, 25, 50]) {
      statements.length = 0;
      const page = await measured.list(recipient, { kind: "shared", limit });
      expect(page.items).toHaveLength(limit);
      // One session-fenced rate-limit statement, one hydrated page and one total.
      expect(statements).toHaveLength(3);
      expect(statements.filter((sql) => sql.startsWith("SELECT"))).toHaveLength(
        2,
      );
    }
    statements.length = 0;
    await measured.summary(recipient);
    expect(statements).toHaveLength(5);
    expect(statements.filter((sql) => sql.startsWith("SELECT"))).toHaveLength(
      4,
    );
  });

  it("pages through every received document exactly once, newest first", async () => {
    const { items, total } = await everyPage({ kind: "shared", limit: 50 });
    expect(total).toBe(SHARED);
    expect(items).toHaveLength(SHARED);
    expect(new Set(items.map((item) => item.id)).size).toBe(SHARED);
    expect(items.every((item) => item.kind === "shared")).toBe(true);
    const keys = items.map((item) => `${item.createdAt}|${item.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
    // Another account's documents never appear.
    expect(items.map((item) => item.id)).not.toContain(hex(SHARED + 1, "sd"));
  });

  it("keeps the per-document projection for every listed item", async () => {
    const { items } = await everyPage({ limit: 50 });
    expect(items).toHaveLength(SHARED + 1);
    const projection = service as unknown as {
      item(
        principal: PersonalPrincipal,
        id: string,
      ): Promise<PersonalDocumentItem>;
    };
    for (const item of items)
      expect(item).toEqual(await projection.item(recipient, item.id));
    expect(items.find((item) => item.id === hex(5, "sd"))).toMatchObject({
      allowVaultDeposit: false,
      depositedDocumentId: hex(5, "pd"),
    });
    expect(items.find((item) => item.id === hex(1, "sd"))).toMatchObject({
      status: "pending",
      title: "Document awaiting verification",
    });
  });

  it("filters by status and sender and counts every category", async () => {
    for (const status of ["available", "pending", "expiring", "ended"] as const)
      expect(
        (await everyPage({ kind: "shared", status, limit: 50 })).total,
      ).toBe(expected[status]);
    const pending = await service.list(recipient, {
      kind: "shared",
      status: "pending",
    });
    expect(pending.items.every((item) => item.status === "pending")).toBe(true);
    const beta = await everyPage({
      kind: "shared",
      sender: "Cabinet Été",
      limit: 50,
    });
    expect(beta.total).toBe(SHARED / 3);
    expect(beta.items.every((item) => item.sender === "Cabinet Été")).toBe(
      true,
    );
    const summary = await service.summary(recipient);
    expect(summary.shared).toEqual({ total: SHARED, ...expected });
    expect(summary.personal).toMatchObject({ total: 1, available: 1 });
    expect(summary.senders).toEqual([
      { name: "Atelier Alpha", documents: 161 },
      { name: "Cabinet Été", documents: 80 },
    ]);
    expect(summary.sendersTotal).toBe(2);
  });

  it("sorts by title, expiry and oldest across pages with stable cursors", async () => {
    const byTitle = await everyPage({
      kind: "shared",
      sort: "title",
      limit: 37,
    });
    expect(byTitle.items).toHaveLength(SHARED);
    const titles = byTitle.items
      .filter((item) => item.status !== "pending")
      .map((item) => item.title.toLowerCase());
    expect(titles).toEqual([...titles].sort());
    // Hidden titles of unassociated shares sort as empty, never by their name.
    expect(byTitle.items[0].status).toBe("pending");
    const byExpiry = await everyPage({
      kind: "shared",
      sort: "expiry",
      limit: 50,
    });
    const expiries = byExpiry.items.map((item) => item.expiresAt);
    expect(expiries).toEqual([...expiries].sort());
    expect(new Set(byExpiry.items.map((item) => item.id)).size).toBe(SHARED);
    const byOldest = await everyPage({
      kind: "shared",
      sort: "oldest",
      limit: 50,
    });
    const activations = byOldest.items.map(
      (item) => `${item.createdAt}|${item.id}`,
    );
    expect(activations).toEqual([...activations].sort());
    expect(new Set(byOldest.items.map((item) => item.id)).size).toBe(SHARED);
  });

  it("searches without revealing unassociated titles", async () => {
    const result = await everyPage({ kind: "shared", q: "été 01", limit: 50 });
    expect(result.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Été 017.pdf", "Été 013.pdf"]),
    );
    // Document 11 is unassociated: its title must not be searchable.
    expect(result.items.map((item) => item.id)).not.toContain(hex(11, "sd"));
  });

  it("accepts earlier recency cursors and refuses cursors from another sort", async () => {
    const first = await service.list(recipient, { kind: "shared", limit: 10 });
    const last = first.items.at(-1)!;
    const legacy = btoa(
      JSON.stringify({ createdAt: last.createdAt, id: last.id }),
    );
    const next = await service.list(recipient, {
      kind: "shared",
      limit: 10,
      cursor: legacy,
    });
    expect(next.items[0].id).not.toBe(last.id);
    await expect(
      service.list(recipient, {
        kind: "shared",
        sort: "title",
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});
