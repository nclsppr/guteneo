import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";

const checker = fileURLToPath(
  new URL("../../scripts/verify-sqlite-integrity.py", import.meta.url),
);
const marker =
  "CREATE TABLE migration_integrity_identity(role TEXT PRIMARY KEY,nonce TEXT NOT NULL,schema_sha256 TEXT NOT NULL)";
const schemaSql =
  "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name<>'migration_integrity_identity' ORDER BY type,name";
const tablesSql =
  "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name";
const roots = new Set();
const hash = (value) => createHash("sha256").update(value).digest("hex");

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});
function rootDirectory() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "guteneo-migration-proof-")),
  );
  chmodSync(root, 0o700);
  roots.add(root);
  return root;
}
function python(code, value) {
  const result = spawnSync("python3", ["-c", code], {
    input: JSON.stringify(value),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout || "null");
}
function invoke(value) {
  return spawnSync("python3", [checker], {
    input: typeof value === "string" ? value : JSON.stringify(value),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  });
}
function failure(value, code) {
  const result = invoke(value);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "SQLITE_INTEGRITY_PROOF_FAILED:" + code + "\n");
  if (typeof value !== "string") {
    assert.ok(!result.stderr.includes(value.root));
    assert.ok(!result.stderr.includes(value.nonce));
  }
}
function files(root) {
  const found = {};
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else found[path] = hash(readFileSync(path));
    }
  }
  walk(root);
  return found;
}

function fixture(options = {}) {
  const root = rootDirectory();
  const nonce = randomUUID();
  const expected = python(
    String.raw`
import hashlib,json,os,pathlib,sqlite3,sys
value=json.load(sys.stdin);root=pathlib.Path(value['root']);expected=[];connections=[]
for role in value.get('roles',['original','transport'])+['metadata']:
 path=root/'d1'/('framework/metadata.sqlite' if role=='metadata' else 'data-'+role+'.sqlite')
 path.parent.mkdir(parents=True,exist_ok=True);db=sqlite3.connect(str(path));connections.append(db)
 if value.get('wal'):
  db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA wal_autocheckpoint=0')
 db.execute('CREATE TABLE parent(id TEXT PRIMARY KEY)')
 db.execute('CREATE TABLE sample(id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id TEXT NOT NULL REFERENCES parent(id),value INTEGER NOT NULL CHECK(value>0),payload TEXT NOT NULL CHECK(json_valid(payload)))')
 db.execute("CREATE VIEW localized AS SELECT 'é☀' AS label")
 db.execute("INSERT INTO parent VALUES('isolated-parent')")
 db.execute("INSERT INTO sample(parent_id,value,payload) VALUES('isolated-parent',1,'{}')")
 if role!='metadata':
  schema=[dict(zip(['type','name','sql'],row)) for row in db.execute(value['schemaSql'])]
  digest=hashlib.sha256(json.dumps(schema,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
  db.execute(value['marker']);db.execute('INSERT INTO migration_integrity_identity VALUES(?,?,?)',(role,value['nonce'],digest))
  tables=[row[0] for row in db.execute(value['tablesSql'])]
  expected.append({'role':role,'schema':schema,'schemaSha256':digest,'d1Tables':tables})
 db.commit()
print(json.dumps(expected,ensure_ascii=False),flush=True)
if value.get('wal'):os._exit(0)
for db in connections:db.close()
`,
    { root, nonce, marker, schemaSql, tablesSql, ...options },
  );
  return {
    version: 1,
    ...(options.kind ? { kind: options.kind } : {}),
    root,
    nonce,
    expected,
  };
}
function update(path, sql, args = []) {
  python(
    String.raw`
import json,sqlite3,sys
v=json.load(sys.stdin);db=sqlite3.connect(v['path']);db.execute(v['sql'],v['args']);db.commit();db.close()
print('null')
`,
    { path, sql, args },
  );
}
const original = (value) => join(value.root, "d1/data-original.sqlite");

test("proves exact complete SQLite files, Unicode schema hashes and metadata without rewriting bytes", () => {
  const value = fixture();
  const before = files(value.root);
  const result = invoke(value);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.version, 1);
  assert.equal(proof.kind, "migration_pair");
  assert.equal(proof.status, "passed");
  assert.match(proof.sqliteVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(proof.metadataFiles, 1);
  assert.equal(proof.checkpointedBeforeReadOnly, true);
  assert.equal(proof.hostQueryOnlyConstraintsVerified, true);
  assert.deepEqual(
    proof.databases,
    value.expected.map((item) => ({
      role: item.role,
      sha256: before[join(value.root, "d1/data-" + item.role + ".sqlite")],
      tableCount: item.d1Tables.length,
      quickCheck: "ok",
      foreignKeyViolations: 0,
    })),
  );
  assert.deepEqual(files(value.root), before);
});

test("identifies every committed WAL before checkpointing and proves the same database inodes afterwards", () => {
  const value = fixture({ wal: true });
  const before = Object.keys(files(value.root))
    .filter((path) => path.endsWith(".sqlite"))
    .map((path) => ({ path, inode: statSync(path).ino }));
  assert.ok(statSync(original(value) + "-wal").size > 0);
  const result = invoke(value);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.checkpointedBeforeReadOnly, true);
  assert.equal(proof.metadataFiles, 1);
  for (const { path, inode } of before) {
    assert.equal(statSync(path).ino, inode);
    assert.equal(files(value.root)[path], hash(readFileSync(path)));
  }
  for (const path of Object.keys(files(value.root)))
    if (path.endsWith("-wal")) assert.equal(statSync(path).size, 0);
  // SQLite versions may remove these empty sidecars when the final writable
  // connection closes. Recreate that state explicitly on every test platform.
  for (const { path } of before) {
    rmSync(path + "-wal", { force: true });
    rmSync(path + "-shm", { force: true });
  }
  const final = files(value.root);
  const repeated = invoke(value);
  assert.equal(repeated.status, 0, repeated.stderr);
  for (const { path } of before)
    assert.equal(files(value.root)[path], final[path]);
  for (const path of Object.keys(files(value.root)))
    if (path.endsWith("-wal")) assert.equal(statSync(path).size, 0);
});

test("selection permits empty sidecar lifecycle while protecting every nonempty WAL and database fingerprint", () => {
  python(
    String.raw`
import json,runpy,sys
value=json.load(sys.stdin);guard=runpy.run_path(value['checker'])['selected_data']
base=(1,2,384,4096,1,1,'isolated-base-hash')
empty=(1,3,384,0,1,1,'isolated-empty-hash')
pending=(1,3,384,100,1,1,'isolated-pending-hash')
before={'one.sqlite':base}
assert guard(before,['one.sqlite'])==guard({**before,'one.sqlite-wal':empty},['one.sqlite'])
for changed in [
 {'one.sqlite':(1,2,384,4096,1,1,'changed-base-hash')},
 {**before,'one.sqlite-wal':pending},
]:assert guard(before,['one.sqlite'])!=guard(changed,['one.sqlite'])
with_pending={**before,'one.sqlite-wal':pending}
for changed in [before,{**before,'one.sqlite-wal':empty},{**before,'one.sqlite-wal':(1,3,384,100,1,1,'changed-wal-hash')}]:
 assert guard(with_pending,['one.sqlite'])!=guard(changed,['one.sqlite'])
print('null')
`,
    { checker },
  );
});

test("rejects ambiguous roles before any checkpoint", () => {
  const value = fixture({ wal: true });
  copyFileSync(original(value), join(value.root, "d1/duplicate.sqlite"));
  copyFileSync(
    original(value) + "-wal",
    join(value.root, "d1/duplicate.sqlite-wal"),
  );
  const before = hash(readFileSync(original(value) + "-wal"));
  failure(value, "DATABASE_AMBIGUOUS");
  assert.equal(hash(readFileSync(original(value) + "-wal")), before);
});

test("rejects a wrong nonce, unexpected schema and foreign SQLite before checkpointing", () => {
  for (const kind of ["nonce", "schema", "foreign"]) {
    const value = fixture({ wal: true });
    if (kind === "nonce") value.nonce = randomUUID();
    if (kind === "schema") {
      value.expected[0].schema[0].sql += " ";
      value.expected[0].schemaSha256 = hash(
        JSON.stringify(value.expected[0].schema),
      );
    }
    if (kind === "foreign") {
      copyFileSync(
        join(value.root, "d1/framework/metadata.sqlite"),
        join(value.root, "d1/foreign.sqlite"),
      );
      copyFileSync(
        join(value.root, "d1/framework/metadata.sqlite-wal"),
        join(value.root, "d1/foreign.sqlite-wal"),
      );
    }
    const paths = Object.keys(files(value.root)).filter(
      (path) => path.endsWith(".sqlite") || path.endsWith("-wal"),
    );
    const before = paths.map((path) => hash(readFileSync(path)));
    failure(
      value,
      kind === "foreign" ? "DATABASE_UNIDENTIFIED" : "MARKER_INVALID",
    );
    assert.deepEqual(
      paths.map((path) => hash(readFileSync(path))),
      before,
    );
  }
});

test("rejects nonempty journals and symlinks before reading database content", () => {
  const journal = fixture();
  writeFileSync(original(journal) + "-journal", "isolated incomplete journal");
  failure(journal, "SIDECAR_NOT_EMPTY");
  const link = fixture();
  symlinkSync(original(link), join(link.root, "d1/link.sqlite"));
  failure(link, "PATH_INVALID");
});

test("checks the exact application inventory while internal tables remain in the global checks", () => {
  const value = fixture();
  assert.ok(!value.expected[0].d1Tables.includes("sqlite_sequence"));
  value.expected[0].d1Tables = value.expected[0].d1Tables.filter(
    (name) => name !== "sample",
  );
  failure(value, "TABLES_MISMATCH");
});

test("detects business, metadata and internal CHECK violations admitted only in isolated fixtures with checks OFF", () => {
  for (const role of ["original", "metadata", "internal"]) {
    const value = fixture();
    python(
      String.raw`
import json,sqlite3,sys
v=json.load(sys.stdin);db=sqlite3.connect(v['path']);db.execute('PRAGMA ignore_check_constraints=ON')
assert db.execute('PRAGMA ignore_check_constraints').fetchone()==(1,)
if v['internal']:
 db.execute('CREATE TABLE _cf_isolated(value INTEGER CHECK(value>0))');db.execute('INSERT INTO _cf_isolated VALUES(0)')
else:db.execute('UPDATE sample SET value=0')
db.commit();db.close();print('null')
`,
      {
        path:
          role === "metadata"
            ? join(value.root, "d1/framework/metadata.sqlite")
            : original(value),
        internal: role === "internal",
      },
    );
    failure(value, "INTEGRITY_FAILED");
  }
});

test("rejects stored FK violations independently of quick_check", () => {
  const value = fixture();
  update(original(value), "UPDATE sample SET parent_id='isolated-missing'");
  failure(value, "FOREIGN_KEYS_FAILED");
});

test("runs a real global check of the freelist rather than only table checks", () => {
  const value = fixture();
  const bytes = readFileSync(original(value));
  bytes.writeUInt32BE(bytes.readUInt32BE(28) + 10, 32);
  bytes.writeUInt32BE(1, 36);
  writeFileSync(original(value), bytes);
  failure(value, "INTEGRITY_FAILED");
});

test("rejects incomplete or changed marker definitions", () => {
  const value = fixture();
  update(
    original(value),
    "ALTER TABLE migration_integrity_identity ADD COLUMN extra TEXT",
  );
  failure(value, "MARKER_INVALID");
});

test("fails closed on missing roles, weak root permissions and malformed input", () => {
  const missing = fixture();
  rmSync(original(missing));
  failure(missing, "DATABASE_AMBIGUOUS");
  const permissions = fixture();
  chmodSync(permissions.root, 0o755);
  failure(permissions, "ROOT_INVALID");
  const value = fixture();
  failure({ ...value, unexpected: true }, "INPUT_INVALID");
  failure('{"version":1,"version":1}', "INPUT_INVALID");
  failure({ ...value, version: true }, "INPUT_INVALID");
  failure({ ...value, kind: "isolated_fixture" }, "INPUT_INVALID");
  failure({ ...value, kind: "unknown" }, "INPUT_INVALID");
});

test("accepts one explicitly isolated fixture without weakening the default migration pair", () => {
  const value = fixture({
    kind: "isolated_fixture",
    roles: ["fixture"],
    wal: true,
  });
  failure({ ...value, kind: "migration_pair" }, "INPUT_INVALID");
  const noKind = { ...value };
  delete noKind.kind;
  failure(noKind, "INPUT_INVALID");
  const result = invoke(value);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.deepEqual(
    proof.databases.map(({ role }) => role),
    ["fixture"],
  );
  assert.equal(proof.kind, "isolated_fixture");
  assert.equal(proof.hostQueryOnlyConstraintsVerified, true);
  assert.equal(proof.metadataFiles, 1);
  const pair = fixture({ kind: "migration_pair" });
  const paired = invoke(pair);
  assert.equal(paired.status, 0, paired.stderr);
  const pairProof = JSON.parse(paired.stdout);
  assert.equal(pairProof.kind, "migration_pair");
  assert.equal(pairProof.databases.length, 2);
});

test("a busy checkpoint fails closed and emits no proof", async () => {
  const value = fixture({ wal: true });
  const child = spawn(
    "python3",
    [
      "-u",
      "-c",
      "import sqlite3,sys; db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); db.execute('BEGIN'); db.execute('SELECT * FROM sample').fetchall(); print('ready',flush=True); sys.stdin.readline(); db.close()",
      original(value),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Fixture reader timeout")),
        5000,
      );
      child.once("error", reject);
      child.stdout.once("data", (data) => {
        clearTimeout(timer);
        assert.equal(String(data).trim(), "ready");
        resolve();
      });
    });
    failure(value, "CHECKPOINT_BUSY");
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.stdin.end("\n");
    await exited;
  }
});

test("proves both physical Miniflare databases after the complete migration history", async () => {
  const root = rootDirectory();
  const nonce = randomUUID();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("isolated")}}',
      compatibilityDate: "2026-09-16",
      resourcePersistencePath: root,
      d1Databases: { ORIGINAL: randomUUID(), TRANSPORT: randomUUID() },
    }),
  );
  const expected = [];
  try {
    const directory = new URL("../../migrations/", import.meta.url);
    const migrations = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    assert.ok(migrations.some((name) => name.startsWith("0071_")));
    for (const role of ["original", "transport"]) {
      const db = await mf.getD1Database(role.toUpperCase());
      for (const name of migrations)
        await db.batch(
          unstable_splitSqlQuery(
            readFileSync(new URL(name, directory), "utf8"),
          ).map((sql) => db.prepare(sql)),
        );
      const raw = (await db.prepare(schemaSql).all()).results;
      const schema = raw.map(({ type, name, sql }) => ({ type, name, sql }));
      const schemaSha256 = hash(JSON.stringify(schema));
      await db.prepare(marker).run();
      await db
        .prepare("INSERT INTO migration_integrity_identity VALUES(?,?,?)")
        .bind(role, nonce, schemaSha256)
        .run();
      const d1Tables = (await db.prepare(tablesSql).all()).results.map(
        ({ name }) => name,
      );
      expected.push({ role, schema, schemaSha256, d1Tables });
    }
  } finally {
    await mf.dispose();
  }
  const result = invoke({ version: 1, root, nonce, expected });
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.status, "passed");
  assert.equal(proof.databases.length, 2);
  assert.equal(proof.checkpointedBeforeReadOnly, true);
  assert.equal(proof.hostQueryOnlyConstraintsVerified, true);
  assert.ok(proof.metadataFiles >= 1);
  assert.deepEqual(
    proof.databases.map(({ tableCount }) => tableCount),
    expected.map(({ d1Tables }) => d1Tables.length),
  );
});
