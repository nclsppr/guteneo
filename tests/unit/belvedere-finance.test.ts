import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, expect, it } from "vitest";
import { hashSecret } from "../../apps/api/src/auth";
import { horizonPeriodEnd } from "../../apps/api/src/monthly-plan";
import type { BelvedereFinance } from "../../packages/contracts/src/belvedere";
import { readBelvedereFixture } from "../helpers/belvedere-reader";

let mf: Miniflare;
let db: D1Database;
const userId = "belvedere_finance_user";
const now = new Date();
const currentStart = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
);
const previousStart = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
);

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "belvedere-finance-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  await db
    .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
    .bind(
      userId,
      "Financial fixture",
      "finance@example.invalid",
      now.toISOString(),
    )
    .run();
});
afterAll(async () => mf?.dispose());

async function subscribeFixture(
  organizationId: string,
  evidence: "production" | "simulation",
  start: Date,
) {
  const stamp = start.toISOString();
  const tokenHash = await hashSecret(crypto.randomUUID());
  // These isolated synthetic records traverse the real immutable consent and
  // debit triggers. No provider is called or live subscription created.
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,?,?)",
      )
      .bind(organizationId, organizationId, evidence, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, stamp),
    db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'synthetic',1,0,?,?,1)",
      )
      .bind(
        tokenHash,
        userId,
        organizationId,
        stamp,
        new Date(now.getTime() + 3600000).toISOString(),
      ),
    db
      .prepare(
        "INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,user_id,session_hash,terms_version,amount_minor,currency,payment_source,interval,auto_renew,current_period_start,current_period_end,anchor_day,created_at) VALUES(?,?,?,'subscribe','browser',?,?,?,'horizon-2026-10-02-v1',3000,'EUR','account_credits','month',1,?,?,1,?)",
      )
      .bind(
        `${organizationId}_consent`,
        organizationId,
        `${organizationId}_subscribe`,
        evidence,
        userId,
        tokenHash,
        stamp,
        horizonPeriodEnd(start),
        stamp,
      ),
  ]);
}

it("includes dated Horizon debits once without inventing dispatches or mixing simulation", async () => {
  await subscribeFixture(
    "finance_production_previous",
    "production",
    previousStart,
  );
  await subscribeFixture(
    "finance_production_current",
    "production",
    currentStart,
  );
  await subscribeFixture("finance_simulation", "simulation", currentStart);
  const from = currentStart.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const read = (mode: "production" | "simulation", firstDay = from) =>
    readBelvedereFixture<BelvedereFinance>(
      db,
      userId,
      "finance_production_current",
      `finance?mode=${mode}&from=${firstDay}&to=${to}`,
    );

  const current = await read("production");
  expect(current).toMatchObject({
    periodBasis: "posted_ledger",
    customerConsumptionMinor: 3000,
    horizonConsumptionMinor: 3000,
    horizonCharges: 1,
    promotionalGrantedMinor: 10000,
    promotionalRemainingMinor: 4000,
    channels: [],
    monthly: [
      {
        month: from.slice(0, 7),
        consumptionMinor: 3000,
        horizonConsumptionMinor: 3000,
        dispatches: 0,
      },
    ],
  });
  const historical = await read(
    "production",
    previousStart.toISOString().slice(0, 10),
  );
  expect(historical.customerConsumptionMinor).toBe(6000);
  expect(historical.horizonConsumptionMinor).toBe(6000);
  expect(historical.horizonCharges).toBe(2);
  expect(historical.monthly).toHaveLength(2);
  expect(historical.monthly.every((month) => month.dispatches === 0)).toBe(
    true,
  );
  const simulation = await read("simulation");
  expect(simulation).toMatchObject({
    customerConsumptionMinor: 3000,
    horizonConsumptionMinor: 3000,
    horizonCharges: 1,
    promotionalGrantedMinor: 0,
    cashReceived: [],
    channels: [],
  });
  expect(simulation.monthly[0].dispatches).toBe(0);
  expect(
    await db.prepare("SELECT count(*) n FROM horizon_plan_charges").first(),
  ).toEqual({ n: 3 });
});
