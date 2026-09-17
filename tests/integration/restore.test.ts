import { it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  DomainService,
  sha256,
  type ActorContext,
  type ProviderHook,
} from "../../packages/domain/src/index";

type Row = Record<string, string | number | null>;
type TableSnapshot = { name: string; rows: Row[]; dependencies: string[] };
const ctx: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};

async function applySql(db: D1Database, sql: string) {
  let statement = "",
    trigger = false;
  for (const raw of sql.split("\n")) {
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
  if (statement.trim()) throw new Error("Incomplete migration SQL");
}
async function migrate(db: D1Database) {
  for (const name of readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await applySql(
      db,
      readFileSync(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
}
function runtime() {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
}
function safeIdentifier(name: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
    throw new Error("Unsafe fixture identifier");
  return `"${name}"`;
}

// Full migrations and logical copy across two independent D1/R2 runtimes can
// exceed 30s on shared CI runners. Keep every reconciliation assertion intact.
it("restores independent D1/R2 fixtures without resubmitting an uncertain physical command", async () => {
  const source = runtime(),
    restored = runtime();
  const started = Date.now();
  try {
    const sourceDb = (await source.getD1Database(
      "DB",
    )) as unknown as D1Database;
    const restoredDb = (await restored.getD1Database(
      "DB",
    )) as unknown as D1Database;
    const sourceBucket = await source.getR2Bucket("DOCUMENTS");
    const restoredBucket = await restored.getR2Bucket("DOCUMENTS");
    await migrate(sourceDb);
    await migrate(restoredDb);
    await applySql(
      sourceDb,
      readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
    );
    const sourceDomain = new DomainService(sourceDb, { mode: "simulation" });
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Guteneo - Simulation restore rehearsal", {
      x: 45,
      y: 780,
      font,
      size: 14,
    });
    const bytes = await pdf.save();
    const hash = await sha256(bytes);
    const storageKey = `org_atelier/${hash}.pdf`;
    await sourceBucket.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    const doc = await sourceDomain.registerDocument(ctx, {
      name: "restore-simulation.pdf",
      sha256: hash,
      size: bytes.byteLength,
      pages: 1,
      status: "ready",
      source: "render",
      storageKey,
    });
    const prepared = await sourceDomain.prepareDispatch(
      ctx,
      {
        channel: "postal",
        recipient: {
          name: "Destinataire de simulation",
          line1: "Adresse fictive de démonstration",
          postalCode: "00000",
          city: "Ville fictive",
          country: "FR",
        },
        documentId: doc.id,
      },
      "restore-postal",
    );
    await sourceDomain.approveDispatch(ctx, prepared.id, prepared.fingerprint);
    await sourceDomain.confirmDispatch(ctx, prepared.id, "restore-confirm");
    const queue: string[] = [];
    await sourceDomain.publishOutbox(async (message) => {
      queue.push(message.dispatchId);
    });
    expect(queue).toEqual([prepared.id]);
    let originalSubmissions = 0;
    await sourceDomain.processDispatch(prepared.id, {
      name: "simulation:postal",
      submit: async () => {
        originalSubmissions++;
        return {
          status: "submission_unknown",
          providerId: "simulation-known-postal-resource",
          errorCode: "SIMULATED_RESPONSE_LOSS",
        };
      },
    });
    expect(originalSubmissions).toBe(1);
    expect(
      (await sourceDomain.getDispatch(ctx, prepared.id)).dispatch.status,
    ).toBe("submission_unknown");

    // The producer and all consumers are quiesced here. No concurrent mutation is permitted while
    // collecting this logical snapshot; an online SQL backup must use its supported consistent export.
    const tables = (
      await sourceDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
        )
        .all<{ name: string }>()
    ).results;
    const snapshot: TableSnapshot[] = [];
    for (const { name } of tables) {
      const rows = (
        await sourceDb
          .prepare(`SELECT * FROM ${safeIdentifier(name)}`)
          .all<Row>()
      ).results;
      const dependencies = (
        await sourceDb
          .prepare(`PRAGMA foreign_key_list(${safeIdentifier(name)})`)
          .all<{ table: string }>()
      ).results.map((r) => r.table);
      snapshot.push({
        name,
        rows,
        dependencies: [...new Set(dependencies)].filter((n) => n !== name),
      });
    }
    const object = (await sourceBucket.get(storageKey))!;
    const objectBackup = new Uint8Array(await object.arrayBuffer());
    expect(await sha256(objectBackup)).toBe(hash);

    // Restore to a NEW isolated runtime. Business triggers are recreated after trusted fixture rows
    // so replaying the snapshot does not freeze insert order or synthesize new reservations/events.
    const triggers = (
      await restoredDb
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
    for (const trigger of triggers)
      await restoredDb
        .prepare(`DROP TRIGGER ${safeIdentifier(trigger.name)}`)
        .run();
    const remaining = [...snapshot],
      loaded = new Set<string>();
    while (remaining.length) {
      const index = remaining.findIndex((t) =>
        t.dependencies.every(
          (dep) => loaded.has(dep) || !snapshot.some((s) => s.name === dep),
        ),
      );
      if (index < 0) throw new Error("Restore table dependency cycle");
      const [table] = remaining.splice(index, 1);
      for (const row of table.rows) {
        const columns = Object.keys(row);
        await restoredDb
          .prepare(
            `INSERT INTO ${safeIdentifier(table.name)} (${columns.map(safeIdentifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .bind(...columns.map((c) => row[c]))
          .run();
      }
      loaded.add(table.name);
    }
    for (const trigger of triggers) await restoredDb.prepare(trigger.sql).run();
    await restoredBucket.put(storageKey, objectBackup, {
      httpMetadata: object.httpMetadata,
    });
    expect(
      (await restoredDb.prepare("PRAGMA foreign_key_check").all()).results,
    ).toHaveLength(0);

    const restoredDomain = new DomainService(restoredDb, {
      mode: "simulation",
    });
    let replaySubmissions = 0;
    const guarded: ProviderHook = {
      name: "simulation:postal",
      submit: async () => {
        replaySubmissions++;
        return { status: "accepted", providerId: "must-not-be-created" };
      },
    };
    const replay = await restoredDomain.processDispatch(prepared.id, guarded);
    expect(replay).toMatchObject({
      processed: false,
      status: "submission_unknown",
    });
    await restoredDomain.reconcileExpiredLeases();
    await restoredDomain.processDispatch(prepared.id, guarded);
    expect(replaySubmissions).toBe(0);
    expect(
      (await restoredDomain.getDispatch(ctx, prepared.id)).dispatch.provider_id,
    ).toBe("simulation-known-postal-resource");
    expect((await restoredDomain.usage(ctx)).items).toEqual(
      (await sourceDomain.usage(ctx)).items,
    );
    const restoredOutbox = await restoredDb
      .prepare("SELECT dispatch_id,status FROM outbox WHERE dispatch_id=?")
      .bind(prepared.id)
      .first();
    expect(restoredOutbox).toEqual({
      dispatch_id: prepared.id,
      status: "published",
    });
    const restoredObject = (await restoredBucket.get(storageKey))!;
    const restoredBytes = new Uint8Array(await restoredObject.arrayBuffer());
    expect(await sha256(restoredBytes)).toBe(hash);
    expect((await PDFDocument.load(restoredBytes)).getPageCount()).toBe(1);

    // Reconciliation of a verified fact (simulated here) resolves uncertainty, without re-execution.
    await restoredDomain.ingestEvent({
      provider: "simulation:postal",
      providerId: "simulation-known-postal-resource",
      eventId: "restore-reconciliation-fact",
      kind: "handed_to_post",
      occurredAt: new Date().toISOString(),
      payload: { simulation: true },
    });
    expect(
      (await restoredDomain.getDispatch(ctx, prepared.id)).dispatch.status,
    ).toBe("handed_to_post");
    expect(replaySubmissions).toBe(0);
    expect(
      (await restoredDomain.usage(ctx)).items.find(
        (r) => r.channel === "postal",
      ),
    ).toMatchObject({ reserved_count: 0, confirmed_count: 1 });
    mkdirSync(new URL("../../reports/", import.meta.url), { recursive: true });
    writeFileSync(
      new URL("../../reports/restore-proof.json", import.meta.url),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          mode: "simulation",
          runtime: "Miniflare D1 + R2, independent source/restore instances",
          tables: snapshot.length,
          rows: snapshot.reduce((n, t) => n + t.rows.length, 0),
          restoredPdf: { sha256: hash, bytes: restoredBytes.length, pages: 1 },
          originalSimulatedSubmissions: originalSubmissions,
          resubmissionsAfterRestore: replaySubmissions,
          uncertaintyResolvedBy: "simulated verified provider fact",
          foreignKeyViolations: 0,
          durationMs: Date.now() - started,
          limitations: [
            "Quiesced local logical snapshot; not a hosted Cloudflare consistent backup",
            "No production credentials, real provider or paid transport",
            "No proof of geographically independent encrypted storage, retention, RPO or RTO",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await source.dispose();
    await restored.dispose();
  }
}, 90_000);
