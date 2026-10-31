import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSecret, type AuthContext } from "../../apps/api/src/auth";
import {
  getPdfValidationPricing,
  handlePdfValidationPricingRoute,
  pdfValidationAvailable,
  type PdfValidationPricingEnv,
} from "../../apps/api/src/pdf-validation-pricing";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
} from "../../packages/contracts/src/pdf-validation";
import { readWelcomeCredit } from "../../packages/domain/src/welcome-credit";

let mf: Miniflare, DB: D1Database, LEGACY: D1Database;
const origin = "http://localhost:8787";
async function apply(db: D1Database, source: string) {
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  expect(statement.trim()).toBe("");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB", "LEGACY"],
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  LEGACY = (await mf.getD1Database("LEGACY")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    await apply(DB, sql);
    if (name < "0060_") await apply(LEGACY, sql);
  }
});
afterAll(async () => mf?.dispose());
async function fixture(
  mode: "production" | "simulation" = "simulation",
  db = DB,
  at = new Date(),
) {
  const suffix = crypto.randomUUID();
  const now = at.toISOString();
  const actor: AuthContext = {
    organizationId: `org_${suffix}`,
    userId: `user_${suffix}`,
    role: "admin",
    actor: "browser",
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'PDF check fixture',?,?)",
      )
      .bind(actor.organizationId, mode, now),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Fixture',?,?)",
      )
      .bind(actor.userId, `${suffix}@example.invalid`, now),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(actor.organizationId, actor.userId, now),
  ]);
  const secret = crypto.randomUUID().replaceAll("-", "") + "01234567890",
    tokenHash = await hashSecret(secret);
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture-csrf',1,0,?,?,1)",
    )
    .bind(
      tokenHash,
      actor.userId,
      actor.organizationId,
      now,
      new Date(at.getTime() + 3600000).toISOString(),
    )
    .run();
  const env: PdfValidationPricingEnv = {
    DB: db,
    ENVIRONMENT: "local",
    MODE: mode,
    APP_ORIGIN: origin,
    PDF_VALIDATION_ENABLED: "true",
    PDF_VALIDATOR: {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher,
    SCANNER:
      mode === "production"
        ? ({ fetch: async () => new Response("fixture") } as unknown as Fetcher)
        : undefined,
  };
  const request = (
    path = "/api/pdf-validation/pricing",
    method = "GET",
    headers: HeadersInit = {},
  ) =>
    new Request(`${origin}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: `guteneo_session=${secret}`,
        "X-CSRF-Token": "fixture-csrf",
        ...headers,
      },
    });
  return { actor, env, request, tokenHash, now };
}
describe("explicit PDF check pricing and recurring-plan retirement", () => {
  it("offers one 10-cent check with no monthly access or charge", async () => {
    const f = await fixture("production");
    const response = await handlePdfValidationPricingRoute(f.request(), f.env);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({
      enabled: true,
      priceMinor: PDF_VALIDATION_PRICE_MINOR,
      currency: "EUR",
      taxBasis: "excluding_tax",
      termsVersion: PDF_VALIDATION_TERMS_VERSION,
      paymentSource: "account_credits",
      purchaseAllowed: true,
      creditAvailableMinor: 5000,
      evidence: "production",
    });
    expect(await readWelcomeCredit(DB, f.actor.organizationId)).toMatchObject({
      spentMinor: 0,
      reservedMinor: 0,
      availableMinor: 5000,
    });
  });
  it("hides available credits and purchase authority from assistants and other members", async () => {
    const f = await fixture();
    expect(
      await getPdfValidationPricing(f.env, { ...f.actor, actor: "mcp" }),
    ).toMatchObject({ purchaseAllowed: false, creditAvailableMinor: null });
    await expect(
      handlePdfValidationPricingRoute(
        f.request(undefined, "GET", { Authorization: "Bearer fixture" }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "BILLING_BROWSER_REQUIRED" });
    await expect(
      getPdfValidationPricing(f.env, { ...f.actor, organizationId: "foreign" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires the new explicit flag and production service gates", async () => {
    const f = await fixture("production");
    expect(
      pdfValidationAvailable({ ...f.env, PDF_VALIDATION_ENABLED: undefined }),
    ).toBe(false);
    expect(pdfValidationAvailable({ ...f.env, PDF_VALIDATOR: undefined })).toBe(
      false,
    );
    expect(pdfValidationAvailable({ ...f.env, SCANNER: undefined })).toBe(
      false,
    );
    expect(
      pdfValidationAvailable({
        ...f.env,
        ENVIRONMENT: "production",
        MODE: "simulation",
      }),
    ).toBe(false);
  });
  it("retires subscription reads and mutations without writing a debit or action", async () => {
    const f = await fixture();
    for (const [path, method] of [
      ["/api/plan", "GET"],
      ["/api/plan/subscribe", "POST"],
      ["/api/plan/cancel", "POST"],
    ]) {
      const response = await handlePdfValidationPricingRoute(
        f.request(path, method),
        f.env,
      );
      expect(response?.status).toBe(410);
      expect(await response?.json()).toMatchObject({
        error: { code: "MONTHLY_PLAN_RETIRED" },
      });
    }
    expect(
      await DB.prepare(
        "SELECT count(*) count FROM horizon_plan_actions WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ count: 0 });
    expect(
      await DB.prepare(
        "SELECT count(*) count FROM pdf_validation_purchases WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ count: 0 });
  });
  it("bounds pricing reads and authenticates browser sessions", async () => {
    const f = await fixture();
    await DB.prepare(
      "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,180)",
    )
      .bind(f.actor.organizationId, Math.floor(Date.now() / 60000))
      .run();
    const limited = await handlePdfValidationPricingRoute(f.request(), f.env);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBe("60");
    await expect(
      handlePdfValidationPricingRoute(
        new Request(`${origin}/api/pdf-validation/pricing`),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("preserves an already posted subscription debit while permanently blocking new ones", async () => {
    const reference = new Date();
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const f = await fixture("production", LEGACY, start);
    const statement = LEGACY.prepare(
      "INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,user_id,session_hash,terms_version,amount_minor,currency,payment_source,interval,auto_renew,current_period_start,current_period_end,anchor_day,created_at) VALUES(?,?,?,'subscribe','browser','production',?,?,'horizon-2026-10-02-v1',3000,'EUR','account_credits','month',1,?,?,?,?)",
    );
    const bind = (id: string) =>
      statement.bind(
        id,
        f.actor.organizationId,
        id,
        f.actor.userId,
        f.tokenHash,
        f.now,
        end.toISOString(),
        new Date(f.now).getUTCDate(),
        f.now,
      );
    await bind(crypto.randomUUID()).run();
    const before = await readWelcomeCredit(LEGACY, f.actor.organizationId);
    expect(before).toMatchObject({ spentMinor: 3000, availableMinor: 2000 });
    await apply(
      LEGACY,
      await readFile(
        new URL(
          "../../migrations/0060_pdf_validation_per_check.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(await readWelcomeCredit(LEGACY, f.actor.organizationId)).toEqual(
      before,
    );
    await expect(bind(crypto.randomUUID()).run()).rejects.toThrow(
      "monthly_plan_retired",
    );
    expect(await getPdfValidationPricing(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 2000,
      purchaseAllowed: true,
    });
    await expect(
      LEGACY.prepare("DELETE FROM horizon_plan_charges WHERE organization_id=?")
        .bind(f.actor.organizationId)
        .run(),
    ).rejects.toThrow();
  });
});
