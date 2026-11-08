import { afterAll, beforeAll, expect, it } from "vitest";
import { migratedD1 } from "../helpers/migrated-d1";
import { resetFixtureMemberships } from "../helpers/reset-memberships";

let fixture: Awaited<ReturnType<typeof migratedD1>>;
beforeAll(async () => {
  fixture = await migratedD1("membership-reset-fixture");
});
afterAll(async () => fixture?.mf.dispose());

it("resets disposable memberships while restoring both exact deployed administrator guards", async () => {
  const { db } = fixture;
  const guards = () =>
    db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN('memberships_keep_last_admin_delete','memberships_keep_last_active_admin_delete') ORDER BY name",
      )
      .all<{ name: string; sql: string }>();
  const before = (await guards()).results;
  expect(before).toHaveLength(2);
  const timestamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES('reset_org','Fixture','simulation',?)",
      )
      .bind(timestamp),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES('reset_user','Fixture','reset@example.invalid',?)",
      )
      .bind(timestamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('reset_org','reset_user','admin',?)",
      )
      .bind(timestamp),
  ]);
  await resetFixtureMemberships(db);
  expect(
    await db.prepare("SELECT count(*) n FROM memberships").first(),
  ).toEqual({
    n: 0,
  });
  expect((await guards()).results).toEqual(before);
  await db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('reset_org','reset_user','admin',?)",
    )
    .bind(timestamp)
    .run();
  await expect(db.prepare("DELETE FROM memberships").run()).rejects.toThrow(
    "last_admin_required",
  );
  expect(
    await db.prepare("SELECT count(*) n FROM memberships").first(),
  ).toEqual({
    n: 1,
  });
});
