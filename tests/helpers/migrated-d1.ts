import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

/**
 * A disposable Workers SQLite database with every repository migration
 * applied in order, statement by statement as D1 does. Tests only.
 */
export async function migratedD1(name: string) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name,
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const directory = new URL("../../migrations/", import.meta.url);
  for (const filename of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const statements: D1PreparedStatement[] = [];
    let statement = "",
      trigger = false;
    for (const raw of (
      await readFile(new URL(filename, directory), "utf8")
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement) trigger = line.startsWith("CREATE TRIGGER");
      statement += `${line}\n`;
      if (
        (trigger && (line === "END;" || /\bBEGIN\b.+\bEND;$/.test(line))) ||
        (!trigger && line.endsWith(";"))
      ) {
        statements.push(db.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    if (statement.trim()) throw new Error(`Incomplete migration ${filename}`);
    if (statements.length) await db.batch(statements);
  }
  return { mf, db };
}
