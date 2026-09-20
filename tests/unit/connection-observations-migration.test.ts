import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";

let mf: Miniflare;
let db: D1Database;
const directory = new URL("../../migrations/", import.meta.url);
const migrationName = "0032_connection_tool_observations.sql";
async function apply(source: string) {
  return db.batch(unstable_splitSqlQuery(source).map((sql) => db.prepare(sql)));
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql") && name < migrationName)
    .sort()) {
    await apply(await readFile(new URL(name, directory), "utf8"));
  }
  await apply(
    await readFile(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  await apply(`INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,not_before,created_at,updated_at)
    VALUES('existing-active','https://identity.example/','user_atelier','opaque-active','org_atelier','active',123,'2026-09-20T10:00:00.000Z','2026-09-20T10:00:00.000Z'),
    ('existing-revoked','https://identity.example/','user_atelier','opaque-revoked','org_atelier','revoked',123,'2026-09-20T10:00:00.000Z','2026-09-20T10:00:00.000Z');`);
});
afterAll(async () => {
  await mf?.dispose();
});

it("upgrades populated D1 without rewriting authority or inventing past tool successes, and rolls back atomically", async () => {
  const connections = () =>
    db.prepare("SELECT * FROM authorized_connections ORDER BY id").all();
  const before = (await connections()).results;
  const source = await readFile(new URL(migrationName, directory), "utf8");
  await expect(
    apply(
      `${source}\nCREATE UNIQUE INDEX authorized_connections_tenant_identity ON authorized_connections(id);`,
    ),
  ).rejects.toThrow(/already exists/);
  expect((await connections()).results).toEqual(before);
  expect(
    (
      await db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name='connection_tool_observations'",
        )
        .all()
    ).results,
  ).toEqual([]);
  await apply(source);
  expect((await connections()).results).toEqual(before);
  expect(
    (
      await db
        .prepare(
          "SELECT * FROM connection_tool_observations ORDER BY connection_id",
        )
        .all()
    ).results,
  ).toEqual([
    {
      connection_id: "existing-active",
      organization_id: "org_atelier",
      user_id: "user_atelier",
      authorization_revision: 0,
      last_successful_tool_at: null,
    },
    {
      connection_id: "existing-revoked",
      organization_id: "org_atelier",
      user_id: "user_atelier",
      authorization_revision: 0,
      last_successful_tool_at: null,
    },
  ]);
  await apply(`INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_studio','user_atelier','admin','2026-09-20T10:00:00.000Z');
    UPDATE connection_tool_observations SET last_successful_tool_at='2026-09-20T10:01:00.000Z' WHERE connection_id='existing-active';
    UPDATE authorized_connections SET organization_id='org_studio' WHERE id='existing-active';`);
  expect(
    await db
      .prepare(
        "SELECT * FROM connection_tool_observations WHERE connection_id='existing-active'",
      )
      .first(),
  ).toEqual({
    connection_id: "existing-active",
    organization_id: "org_studio",
    user_id: "user_atelier",
    authorization_revision: 1,
    last_successful_tool_at: null,
  });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
  expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
    quick_check: "ok",
  });
});
