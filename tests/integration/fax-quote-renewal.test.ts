import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { MCP_SCOPES, type AuthEnv } from "../../apps/api/src/auth";
import { DomainService, type Dispatch } from "../../packages/domain/src/index";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

let mf: Miniflare, db: D1Database, clock: number;
let f: Awaited<ReturnType<typeof createFaxUsageFixture>>;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("isolated")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.batch(
      unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(
        (s) => db.prepare(s),
      ),
    );
});
beforeEach(async () => {
  clock = Date.now();
  f = await createFaxUsageFixture(db, () => clock);
});
afterAll(async () => {
  await mf?.dispose();
});
const prepare = () => f.domain.prepareDispatch(f.ctx, f.input, "initial");
const expire = (d: Dispatch) => {
  clock = Date.parse(d.quote_expires_at!) + 1;
};
async function rows(table: string) {
  return (
    await db
      .prepare(`SELECT * FROM ${table} WHERE organization_id=? ORDER BY rowid`)
      .bind(f.ctx.organizationId)
      .all()
  ).results;
}
async function funding() {
  return {
    usage: await rows("usage"),
    credits: await rows("welcome_credit_entries"),
    grants: await rows("welcome_credit_grants"),
    reservations: await rows("reservations"),
    holds: await rows("welcome_credit_reservations"),
    outbox: await rows("outbox"),
    attempts: await rows("attempts"),
  };
}

describe("fax quote renewal — local D1, no provider request", () => {
  it("atomically replaces an expired quote without inheriting consent or touching funding", async () => {
    const old = await prepare();
    await f.domain.approveDispatch(f.ctx, old.id, old.fingerprint);
    const untouched = await f.domain.prepareDispatch(
      f.ctx,
      f.input,
      "another-draft",
    );
    const quotes = await rows("live_fax_quotes_v3"),
      funds = await funding();
    expire(old);
    const renewed = await f.domain.renewFaxQuote(f.ctx, old.id);
    expect(renewed.id).not.toBe(old.id);
    expect(renewed.fingerprint).not.toBe(old.fingerprint);
    for (const field of [
      "recipient_json",
      "document_id",
      "sender_id",
      "sender_address",
      "options_json",
      "ceiling_minor",
      "campaign_id",
    ] as const)
      expect(renewed[field]).toEqual(old[field]);
    expect(renewed.status).toBe("prepared");
    expect(Date.parse(renewed.quote_expires_at!)).toBe(clock + 300000);
    expect((await f.domain.getDispatch(f.ctx, old.id)).dispatch.status).toBe(
      "cancelled",
    );
    expect((await f.domain.getDispatch(f.ctx, untouched.id)).dispatch).toEqual(
      untouched,
    );
    expect((await rows("live_fax_quotes_v3")).slice(0, 2)).toEqual(quotes);
    expect(await funding()).toEqual(funds);
    expect(await rows("approvals")).toHaveLength(1);
    expect((await f.domain.getDispatch(f.ctx, renewed.id)).approval).toBeNull();
    await expect(
      f.domain.confirmDispatch(f.ctx, renewed.id, "unapproved"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(
      f.domain.approveDispatch(f.ctx, renewed.id, old.fingerprint),
    ).rejects.toMatchObject({ code: "FINGERPRINT_MISMATCH" });
    await expect(
      f.domain.approveDispatch(f.ctx, old.id, old.fingerprint),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("deduplicates simultaneous renewals and replays after the replacement has been queued", async () => {
    const old = await prepare();
    expire(old);
    const [a, b] = await Promise.all([
      f.domain.renewFaxQuote(f.ctx, old.id),
      f.domain.renewFaxQuote(f.ctx, old.id),
    ]);
    expect(a.id).toBe(b.id);
    expect(await rows("dispatches")).toHaveLength(2);
    expect(
      (await rows("audit_log")).filter((x) => x.action === "fax.quote_renewed"),
    ).toHaveLength(1);
    await f.domain.approveDispatch(f.ctx, a.id, a.fingerprint);
    await f.domain.confirmDispatch(f.ctx, a.id, "send-new");
    const funds = await funding();
    const replay = await f.domain.renewFaxQuote(f.ctx, old.id);
    expect(replay.id).toBe(a.id);
    expect(replay.status).toBe("queued");
    expect(await rows("dispatches")).toHaveLength(2);
    expect(await funding()).toEqual(funds);
  });
  it("rejects still-valid, cross-tenant and modified-content renewal requests", async () => {
    const old = await prepare();
    await expect(f.domain.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "QUOTE_STILL_VALID",
    });
    const other = await createFaxUsageFixture(db, () => clock);
    await expect(
      other.domain.renewFaxQuote(other.ctx, old.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expire(old);
    for (const change of [
      { documentId: "another-document" },
      { phone: "+352499866400" },
      { ceilingMinor: 101 },
      { senderId: "another-sender" },
    ])
      await expect(
        f.domain.renewFaxQuote(f.ctx, old.id, {
          documentId: f.documentId,
          phone: f.input.recipient.phone,
          ceilingMinor: 100,
          ...change,
        }),
      ).rejects.toMatchObject({ code: "RENEWAL_CONTENT_MISMATCH" });
    expect(await rows("dispatches")).toHaveLength(1);
  });
  it("preserves the original and the real configuration error when preparation is no longer possible", async () => {
    const old = await prepare();
    expire(old);
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(f.tariff.id)
      .run();
    const before = await funding();
    await expect(f.domain.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    expect((await f.domain.getDispatch(f.ctx, old.id)).dispatch.status).toBe(
      "prepared",
    );
    expect(await rows("dispatches")).toHaveLength(1);
    expect(await funding()).toEqual(before);
  });
  it("keeps the exact cap instead of silently increasing it for a new tariff", async () => {
    const old = await prepare();
    expire(old);
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(f.tariff.id)
      .run();
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...f.tariff,
      id: "expensive_" + old.id,
      minute_nano_usd: 1000000000,
    });
    await expect(f.domain.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "INVALID_CEILING",
    });
    expect((await f.domain.getDispatch(f.ctx, old.id)).dispatch.status).toBe(
      "prepared",
    );
  });
  it("refuses queued or uncertain sends without touching their existing hold", async () => {
    const old = await prepare();
    await f.domain.approveDispatch(f.ctx, old.id, old.fingerprint);
    await f.domain.confirmDispatch(f.ctx, old.id, "queued");
    expire(old);
    const queuedFunds = await funding();
    await expect(f.domain.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "FAX_QUOTE_RENEWAL_UNSAFE",
    });
    expect(await funding()).toEqual(queuedFunds);
    // Synthetic state fence; no provider is called.
    await db
      .prepare(
        "UPDATE dispatches SET status='submission_unknown' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, old.id)
      .run();
    const unknownFunds = await funding();
    await expect(f.domain.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "FAX_QUOTE_RENEWAL_UNSAFE",
    });
    expect(await funding()).toEqual(unknownFunds);
    expect(await rows("dispatches")).toHaveLength(1);
  });
  it("loses safely when confirmation commits between renewal validation and its batch", async () => {
    const old = await prepare();
    const nextIdentity = { ...f.identity, accountId: "next-account" };
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...f.tariff,
      id: "next_" + old.id,
      account_id: nextIdentity.accountId,
    });
    await f.domain.approveDispatch(f.ctx, old.id, old.fingerprint);
    let raced = false;
    const racingDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          await f.domain.confirmDispatch(f.ctx, old.id, "rival-confirm");
        }
        return db.batch(statements);
      },
    } as D1Database;
    const renewing = new DomainService(racingDb, {
      mode: "production",
      now: () => clock,
      liveFaxIdentity: nextIdentity,
    });
    await expect(renewing.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "FAX_QUOTE_RENEWAL_UNSAFE",
    });
    expect((await f.domain.getDispatch(f.ctx, old.id)).dispatch.status).toBe(
      "queued",
    );
    expect(await rows("dispatches")).toHaveLength(1);
    expect(await rows("outbox")).toHaveLength(1);
    expect(await rows("welcome_credit_reservations")).toHaveLength(1);
    expect(
      (await rows("audit_log")).filter((x) => x.action === "fax.quote_renewed"),
    ).toHaveLength(0);
  });
  it("does not cancel the original when another preparation takes the renewal key during the batch race", async () => {
    const old = await prepare();
    expire(old);
    let raced = false;
    const racingDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          await f.domain.prepareDispatch(
            f.ctx,
            { ...f.input, recipient: { phone: "+33100000002" } },
            `fax-renew:${old.id}`,
          );
        }
        return db.batch(statements);
      },
    } as D1Database;
    const renewing = new DomainService(racingDb, {
      mode: "production",
      now: () => clock,
      liveFaxIdentity: f.identity,
    });
    await expect(renewing.renewFaxQuote(f.ctx, old.id)).rejects.toMatchObject({
      code: "FAX_QUOTE_RENEWAL_UNSAFE",
    });
    expect((await f.domain.getDispatch(f.ctx, old.id)).dispatch.status).toBe(
      "prepared",
    );
    expect(
      (await rows("audit_log")).filter((x) => x.action === "fax.quote_renewed"),
    ).toHaveLength(0);
    expect(await rows("outbox")).toHaveLength(0);
    expect(await rows("welcome_credit_reservations")).toHaveLength(0);
  });
  it("exposes the exact expiry and safe renewal through MCP prepare_fax", async () => {
    const old = await prepare();
    expire(old);
    const server = createGuteneoMcpServer(
      {
        context: { ...f.ctx, actor: "mcp" },
        scopes: [...MCP_SCOPES],
        clientId: "fixture",
        token: "fixture",
        expiresAt: Date.now() + 60000,
      },
      { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
      {
        domain: f.domain,
        documents: {
          importFile: async () => {
            throw Error("unused");
          },
          render: async () => {
            throw Error("unused");
          },
        },
        capabilities: () => ({ mode: "production" }),
      },
    );
    const client = new Client({ name: "renewal-fixture", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const status = await client.callTool({
        name: "get_dispatch_status",
        arguments: { dispatchId: old.id },
      });
      expect(status.structuredContent).toMatchObject({
        ok: true,
        data: {
          quoteExpiresAt: old.quote_expires_at,
          attemptCount: 0,
        },
      });
      const args = {
        renewalOf: old.id,
        documentId: f.documentId,
        phone: f.input.recipient.phone,
        ceilingMinor: 100,
        idempotencyKey: "stable-renewal",
      };
      const result = await client.callTool({
        name: "prepare_fax",
        arguments: args,
      });
      expect(result.isError).not.toBe(true);
      const data = (
        result.structuredContent as {
          data: { id: string; quoteExpiresAt: string };
        }
      ).data;
      const saved = await f.domain.getDispatch(f.ctx, data.id);
      expect(data.quoteExpiresAt).toBe(saved.dispatch.quote_expires_at);
      expect(saved.approval).toBeNull();
      const replay = await client.callTool({
        name: "prepare_fax",
        arguments: { ...args, idempotencyKey: "another-host-key" },
      });
      expect(replay.structuredContent).toMatchObject({
        ok: true,
        data: { id: data.id },
      });
      expect(await rows("dispatches")).toHaveLength(2);
      expect(await rows("outbox")).toHaveLength(0);
      expect(await rows("attempts")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
