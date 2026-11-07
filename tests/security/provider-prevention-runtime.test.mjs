import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";

test(
  "the prevention notifier uses native workerd global fetch once without receiver errors or real network",
  { timeout: 30_000 },
  async (t) => {
    const now = "2026-11-07T10:00:00.000Z";
    const acknowledgement = "12345678-1234-4123-8123-123456789abc";
    const notification = "e".repeat(64);
    const source = fileURLToPath(
      new URL(
        "../../apps/api/src/provider-prevention-notifications.ts",
        import.meta.url,
      ),
    );
    const compiled = await build({
      stdin: {
        contents: `import {processPreventionNotifications} from ${JSON.stringify(source)};
        export default { async fetch(request, env) {
          // Inject only the clock: fetch must be the real workerd global.
          return Response.json(await processPreventionNotifications(env, {
            now: () => new Date(request.headers.get("x-fixture-now") ?? env.TEST_NOW)
          }));
        }};`,
        resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
    });
    const calls = [];
    let redirect = false;
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: compiled.outputFiles[0].text,
        compatibilityDate: "2026-09-16",
        d1Databases: ["DB"],
        bindings: {
          TEST_NOW: now,
          ENVIRONMENT: "production",
          MODE: "production",
          RESEND_SENDS_ENABLED: "true",
          RESEND_VERIFIED_DOMAIN: "guteneo.com",
          RESEND_API_KEY: "synthetic-native-sending-key",
          PROVIDER_PREVENTION_EMAILS_ENABLED: "true",
          PROVIDER_PREVENTION_EMAIL_FROM: "operations@guteneo.com",
          PROVIDER_PREVENTION_EMAIL_TO: "private-operator@example.invalid",
        },
        // This service receives every outbound fetch. No provider connection or
        // credential lookup is possible in this deterministic runtime regression.
        outboundService: async (request) => {
          const body = await request.json();
          calls.push({
            url: request.url,
            method: request.method,
            authorization: request.headers.get("Authorization"),
            idempotency: request.headers.get("Idempotency-Key"),
            body,
          });
          assert.equal(request.url, "https://api.resend.com/emails");
          if (redirect)
            return new Response(null, {
              status: 307,
              headers: {
                Location: "https://untrusted.example.invalid/credentials",
              },
            });
          return Response.json({ id: acknowledgement });
        },
      }),
    );
    t.after(() => runtime.dispose());
    const db = await runtime.getD1Database("DB");
    await db.exec(
      "CREATE TABLE organizations(id TEXT PRIMARY KEY,mode TEXT NOT NULL DEFAULT 'production')",
    );
    for (const filename of [
      "0068_provider_freshness_alerts.sql",
      "0074_provider_freshness_prevention.sql",
    ]) {
      const sql = await readFile(
        new URL(`../../migrations/${filename}`, import.meta.url),
        "utf8",
      );
      await db.batch(
        unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
      );
    }
    await db.batch([
      db.prepare("INSERT INTO organizations(id) VALUES('org_native')"),
      db
        .prepare(
          "INSERT INTO provider_freshness_bindings(organization_id,family,binding_sha256,active,evaluated_at,evaluation_sha256) VALUES('org_native','fax_authority',?,1,?,?)",
        )
        .bind("a".repeat(64), now, "d".repeat(64)),
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_tasks(organization_id,task_sha256,family,binding_sha256,revision_sha256,deadline_at,renewal_mode,stage,stage_rank,state,occurrence,opened_at,last_evaluated_at) VALUES('org_native',?,'fax_authority',?,?,'2026-11-10T10:00:00.000Z','operator','operator_3d',2,'active',1,?,?)",
        )
        .bind("b".repeat(64), "a".repeat(64), "c".repeat(64), now, now),
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,created_at,updated_at) VALUES('org_native',?,?,1,'operator_3d',?,?)",
        )
        .bind(notification, "b".repeat(64), now, now),
    ]);

    const first = await runtime.dispatchFetch(
      "https://notifier.example.invalid/cron",
    );
    assert.equal(first.status, 200);
    assert.equal(
      calls.length,
      1,
      "the native default fetch reached the synthetic outbound service",
    );
    assert.deepEqual(await first.json(), {
      providerPreventionNotificationsSent: 1,
      providerPreventionNotificationsFailed: 0,
      providerPreventionNotificationsUnknown: 0,
    });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].authorization, "Bearer synthetic-native-sending-key");
    assert.ok(calls[0].idempotency.includes(notification));
    assert.deepEqual(calls[0].body.to, ["private-operator@example.invalid"]);
    assert.equal(calls[0].body.from, "operations@guteneo.com");
    assert.deepEqual(
      await db
        .prepare(
          "SELECT status,provider_reference,claimed_at FROM provider_freshness_prevention_notifications WHERE organization_id='org_native' AND notification_sha256=?",
        )
        .bind(notification)
        .first(),
      { status: "sent", provider_reference: acknowledgement, claimed_at: now },
    );

    const second = await runtime.dispatchFetch(
      "https://notifier.example.invalid/cron",
    );
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), {
      providerPreventionNotificationsSent: 0,
      providerPreventionNotificationsFailed: 0,
      providerPreventionNotificationsUnknown: 0,
    });
    assert.equal(calls.length, 1);

    // A genuine native fetch must also leave a redirect target untouched. The
    // ambiguous first provider request becomes terminal unknown, without resend.
    await db.batch([
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_tasks(organization_id,task_sha256,family,binding_sha256,revision_sha256,deadline_at,renewal_mode,stage,stage_rank,state,occurrence,opened_at,last_evaluated_at) SELECT organization_id,?,family,binding_sha256,?,deadline_at,renewal_mode,stage,stage_rank,state,occurrence,opened_at,last_evaluated_at FROM provider_freshness_prevention_tasks WHERE organization_id='org_native' AND task_sha256=?",
        )
        .bind("1".repeat(64), "2".repeat(64), "b".repeat(64)),
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,created_at,updated_at) VALUES('org_native',?,?,1,'operator_3d',?,?)",
        )
        .bind("3".repeat(64), "1".repeat(64), now, now),
    ]);
    redirect = true;
    const later = { headers: { "x-fixture-now": "2026-11-07T12:00:00.000Z" } };
    const redirected = await runtime.dispatchFetch(
      "https://notifier.example.invalid/cron",
      later,
    );
    assert.equal(redirected.status, 200);
    assert.deepEqual(await redirected.json(), {
      providerPreventionNotificationsSent: 0,
      providerPreventionNotificationsFailed: 0,
      providerPreventionNotificationsUnknown: 1,
    });
    assert.equal(calls.length, 2);
    assert.ok(
      calls.every((call) => call.url === "https://api.resend.com/emails"),
    );
    const repeated = await runtime.dispatchFetch(
      "https://notifier.example.invalid/cron",
      later,
    );
    assert.equal(repeated.status, 200);
    assert.equal(calls.length, 2);
  },
);
