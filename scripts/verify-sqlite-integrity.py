#!/usr/bin/env python3
"""Global integrity proof for freshly persisted local D1 files.

The D1 caller supplies the exact schema/table inventory it read before dispose().
After every file is identified, a query-only native check validates constraints
and a checkpoint applies committed local WAL pages. The final immutable read-only
phase proves unchanged bytes and physical integrity.
No export, reconstruction, DML, DDL, or constraint bypass occurs.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time

try:
    import sqlite3
except ImportError:
    sys.stderr.write("SQLITE_INTEGRITY_PROOF_FAILED:SQLITE_UNAVAILABLE\n")
    sys.exit(1)


MAX_INPUT = 16 * 1024 * 1024
MAX_FILES = 4096
MAX_DEPTH = 16
MARKER = "migration_integrity_identity"
MARKER_SQL = (
    "CREATE TABLE migration_integrity_identity(role TEXT PRIMARY KEY,"
    "nonce TEXT NOT NULL,schema_sha256 TEXT NOT NULL)"
)
SCHEMA_SQL = (
    "SELECT type,name,sql FROM sqlite_schema "
    "WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' "
    "AND name<>'migration_integrity_identity' ORDER BY type,name"
)
TABLES_SQL = (
    "SELECT name FROM sqlite_schema WHERE type='table' "
    "AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name"
)
ROLES = ("original", "transport")


class ProofFailure(Exception):
    def __init__(self, code):
        self.code = code


def require(condition, code):
    if not condition:
        raise ProofFailure(code)


def text(value, maximum):
    return (
        type(value) is str
        and 0 < len(value) <= maximum
        and "\x00" not in value
        and not any(0xD800 <= ord(char) <= 0xDFFF for char in value)
    )


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "INPUT_INVALID")
        result[key] = value
    return result


def reject_constant(_value):
    raise ProofFailure("INPUT_INVALID")


def schema_digest(rows):
    # Match JSON.stringify([{type,name,sql},...]) from the D1 caller exactly.
    ordered = [
        {"type": row["type"], "name": row["name"], "sql": row["sql"]}
        for row in rows
    ]
    return hashlib.sha256(
        json.dumps(ordered, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def read_input():
    require(len(sys.argv) == 1, "INPUT_INVALID")
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    require(0 < len(raw) <= MAX_INPUT, "INPUT_INVALID")
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
        )
    except (ValueError, UnicodeError, RecursionError):
        raise ProofFailure("INPUT_INVALID") from None
    require(type(value) is dict, "INPUT_INVALID")
    required = {"version", "root", "nonce", "expected"}
    require(set(value) in (required, required | {"kind"}), "INPUT_INVALID")
    kind = value.get("kind", "migration_pair")
    require(
        type(kind) is str and kind in ("migration_pair", "isolated_fixture"),
        "INPUT_INVALID",
    )
    roles = ("fixture",) if kind == "isolated_fixture" else ROLES
    require(type(value["version"]) is int and value["version"] == 1, "INPUT_INVALID")
    require(text(value["root"], 8192), "INPUT_INVALID")
    require(
        text(value["nonce"], 128)
        and re.fullmatch(r"[A-Za-z0-9_-]{16,128}", value["nonce"]),
        "INPUT_INVALID",
    )
    expected = value["expected"]
    require(type(expected) is list and len(expected) == len(roles), "INPUT_INVALID")
    by_role = {}
    for item in expected:
        require(type(item) is dict, "INPUT_INVALID")
        require(
            set(item) == {"role", "schema", "schemaSha256", "d1Tables"},
            "INPUT_INVALID",
        )
        role = item["role"]
        require(type(role) is str and role in roles and role not in by_role, "INPUT_INVALID")
        require(
            type(item["schemaSha256"]) is str
            and re.fullmatch(r"[0-9a-f]{64}", item["schemaSha256"]),
            "INPUT_INVALID",
        )
        schema = item["schema"]
        require(type(schema) is list and 0 < len(schema) <= 20000, "INPUT_INVALID")
        keys = []
        for row in schema:
            require(type(row) is dict and set(row) == {"type", "name", "sql"}, "INPUT_INVALID")
            require(row["type"] in ("table", "index", "trigger", "view"), "INPUT_INVALID")
            require(text(row["name"], 1024), "INPUT_INVALID")
            require(row["sql"] is None or text(row["sql"], MAX_INPUT), "INPUT_INVALID")
            keys.append((row["type"], row["name"]))
        require(keys == sorted(keys) and len(set(keys)) == len(keys), "INPUT_INVALID")
        require(schema_digest(schema) == item["schemaSha256"], "INPUT_INVALID")
        tables = item["d1Tables"]
        require(type(tables) is list and 0 < len(tables) <= 4096, "INPUT_INVALID")
        require(all(text(name, 1024) for name in tables), "INPUT_INVALID")
        require(tables == sorted(tables) and len(set(tables)) == len(tables), "INPUT_INVALID")
        require(MARKER in tables, "INPUT_INVALID")
        by_role[role] = item
    require(set(by_role) == set(roles), "INPUT_INVALID")
    return value, by_role, roles


def validate_root(value):
    root = Path(value)
    require(root.is_absolute() and str(root) == value, "ROOT_INVALID")
    require(os.path.realpath(root) == value, "ROOT_INVALID")
    require(
        re.fullmatch(r"guteneo-migration-proof-[A-Za-z0-9_-]{6,}", root.name),
        "ROOT_INVALID",
    )
    require(root.parent == Path(os.path.realpath(tempfile.gettempdir())), "ROOT_INVALID")
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode), "ROOT_INVALID")
    require(stat.S_IMODE(info.st_mode) == 0o700, "ROOT_INVALID")
    require(info.st_uid == os.geteuid(), "ROOT_INVALID")
    # The caller also binds an unpredictable per-run nonce in both databases.
    require(-15 <= time.time() - info.st_ctime <= 3600, "ROOT_INVALID")
    return root


def fingerprint(path, info):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        require(
            (opened.st_dev, opened.st_ino) == (info.st_dev, info.st_ino),
            "FILE_CHANGED",
        )
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
        require(
            (opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns)
            == (after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            "FILE_CHANGED",
        )
        return (
            opened.st_dev,
            opened.st_ino,
            opened.st_mode,
            opened.st_size,
            opened.st_mtime_ns,
            opened.st_ctime_ns,
            digest.hexdigest(),
        )
    finally:
        os.close(descriptor)


def inventory(root, allow_wal=False):
    files = {}
    entries = 0

    def visit(directory, depth):
        nonlocal entries
        require(depth <= MAX_DEPTH, "RESOURCE_LIMIT")
        with os.scandir(directory) as listing:
            children = sorted(list(listing), key=lambda entry: entry.name)
        for entry in children:
            entries += 1
            require(entries <= MAX_FILES, "RESOURCE_LIMIT")
            path = Path(entry.path)
            info = entry.stat(follow_symlinks=False)
            require(info.st_uid == os.geteuid(), "PATH_INVALID")
            if stat.S_ISDIR(info.st_mode):
                visit(path, depth + 1)
                continue
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "PATH_INVALID")
            if path.name.endswith("-journal") or (
                path.name.endswith("-wal") and not allow_wal
            ):
                require(info.st_size == 0, "SIDECAR_NOT_EMPTY")
            files[str(path.relative_to(root))] = fingerprint(path, info)

    visit(root, 0)
    return files


def check_database(path, nonce, expected, immutable=True, prepare=False):
    try:
        suffix = "?mode=rw" if prepare else (
            "?mode=ro&immutable=1" if immutable else "?mode=ro"
        )
        connection = sqlite3.connect(path.as_uri() + suffix, uri=True, timeout=0)
        try:
            connection.execute("PRAGMA query_only=ON")
            require(connection.execute("PRAGMA query_only").fetchall() == [(1,)], "CHECK_MODE_INVALID")
            connection.execute("PRAGMA ignore_check_constraints=OFF")
            require(
                connection.execute("PRAGMA ignore_check_constraints").fetchall() == [(0,)],
                "CHECK_MODE_INVALID",
            )
            connection.execute("PRAGMA foreign_keys=ON")
            require(connection.execute("PRAGMA foreign_keys").fetchall() == [(1,)], "CHECK_MODE_INVALID")
            marker = connection.execute(
                "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?", (MARKER,)
            ).fetchall()
            if not marker:
                require(path.name == "metadata.sqlite", "DATABASE_UNIDENTIFIED")
                role = None
            else:
                require(path.name != "metadata.sqlite", "MARKER_INVALID")
                require(marker == [(MARKER_SQL,)], "MARKER_INVALID")
                identity = connection.execute(
                    "SELECT role,nonce,schema_sha256 FROM migration_integrity_identity"
                ).fetchall()
                require(len(identity) == 1, "MARKER_INVALID")
                role, actual_nonce, digest = identity[0]
                require(type(role) is str and role in expected, "MARKER_INVALID")
                require(actual_nonce == nonce and digest == expected[role]["schemaSha256"], "MARKER_INVALID")
                schema = [
                    {"type": kind, "name": name, "sql": sql}
                    for kind, name, sql in connection.execute(SCHEMA_SQL).fetchall()
                ]
                require(
                    schema == expected[role]["schema"] and schema_digest(schema) == digest,
                    "SCHEMA_MISMATCH",
                )
                tables = [row[0] for row in connection.execute(TABLES_SQL).fetchall()]
                require(tables == expected[role]["d1Tables"], "TABLES_MISMATCH")
            require(
                connection.execute("PRAGMA quick_check").fetchall() == [("ok",)],
                "INTEGRITY_FAILED",
            )
            require(connection.execute("PRAGMA foreign_key_check").fetchall() == [], "FOREIGN_KEYS_FAILED")
            if prepare:
                wal = Path(str(path) + "-wal")
                if wal.exists() and wal.stat().st_size:
                    try:
                        result = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
                    except sqlite3.Error as error:
                        busy = "locked" in str(error).lower() or "busy" in str(error).lower()
                        raise ProofFailure(
                            "CHECKPOINT_BUSY" if busy else "CHECKPOINT_FAILED"
                        ) from None
                    require(len(result) == 1 and result[0][0] == 0, "CHECKPOINT_BUSY")
                    require(result == [(0, 0, 0)], "CHECKPOINT_FAILED")
            return role
        finally:
            connection.close()
    except sqlite3.Error:
        raise ProofFailure("DATABASE_INVALID") from None


def classified(
    root, database_files, nonce, expected, immutable, prepare=False,
    selection_files=None,
):
    roles = {}
    metadata = 0
    for name in database_files:
        read_immutable = immutable
        if selection_files is not None:
            wal = selection_files.get(name + "-wal")
            # No committed WAL pages exist in this verified snapshot. Some
            # SQLite builds cannot open WAL-mode files read-only without their
            # empty sidecars; immutable reads avoid creating those sidecars.
            read_immutable = not (wal and wal[3])
        role = check_database(root / name, nonce, expected, read_immutable, prepare)
        if role is None:
            metadata += 1
            continue
        require(role not in roles, "DATABASE_AMBIGUOUS")
        roles[role] = name
    require(set(roles) == set(expected), "DATABASE_AMBIGUOUS")
    return roles, metadata


def selected_data(files, database_files):
    shared_memory = {name + "-shm" for name in database_files}
    wal_files = {name + "-wal" for name in database_files}
    # SQLite's read-only selection may create/remove an empty WAL or maintain
    # its disposable shared-memory index. Nonempty WAL pages and every database
    # inode/hash remain protected. The final immutable-phase inventory is strict.
    return {
        name: info for name, info in files.items()
        if name not in shared_memory and not (name in wal_files and info[3] == 0)
    }


def main():
    value, expected, roles = read_input()
    root = validate_root(value["root"])
    initial = inventory(root, allow_wal=True)
    database_files = [name for name in initial if name.endswith(".sqlite")]
    require(len(expected) <= len(database_files) <= MAX_FILES, "DATABASE_AMBIGUOUS")
    selected, metadata = classified(
        root, database_files, value["nonce"], expected, immutable=False,
        selection_files=initial,
    )
    after_selection = inventory(root, allow_wal=True)
    require(
        selected_data(after_selection, database_files)
        == selected_data(initial, database_files),
        "FILE_CHANGED",
    )
    validate_root(value["root"])
    # SQLite can omit CHECK expressions on an actual read-only connection even
    # with ignore_check_constraints=0. All files have already been identified;
    # mode=rw plus asserted query_only=1 validates them without admitting DML/DDL.
    # Only this announced preparation phase may checkpoint committed WAL pages,
    # explicitly below and also when its writable connection closes.
    prepared, metadata_prepared = classified(
        root, database_files, value["nonce"], expected, immutable=False, prepare=True,
    )
    require(prepared == selected and metadata_prepared == metadata, "FILE_CHANGED")
    before = inventory(root)
    require(
        [name for name in before if name.endswith(".sqlite")] == database_files,
        "FILE_CHANGED",
    )
    require(
        all(before[name][:2] == initial[name][:2] for name in database_files),
        "FILE_CHANGED",
    )
    proven, metadata_after = classified(
        root, database_files, value["nonce"], expected, immutable=True,
    )
    require(proven == selected and metadata_after == metadata, "FILE_CHANGED")
    databases = []
    for role in roles:
        name = proven[role]
        databases.append({
            "role": role,
            "sha256": before[name][-1],
            "tableCount": len(expected[role]["d1Tables"]),
            "quickCheck": "ok",
            "foreignKeyViolations": 0,
        })
    require(inventory(root) == before, "FILE_CHANGED")
    validate_root(value["root"])
    return {
        "version": 1,
        "kind": value.get("kind", "migration_pair"),
        "status": "passed",
        "sqliteVersion": sqlite3.sqlite_version,
        "databases": databases,
        "metadataFiles": metadata,
        "checkpointedBeforeReadOnly": True,
        "hostQueryOnlyConstraintsVerified": True,
    }


if __name__ == "__main__":
    try:
        result = main()
    except ProofFailure as error:
        sys.stderr.write("SQLITE_INTEGRITY_PROOF_FAILED:" + error.code + "\n")
        sys.exit(1)
    except (OSError, ValueError, UnicodeError):
        sys.stderr.write("SQLITE_INTEGRITY_PROOF_FAILED:PROOF_IO_FAILED\n")
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        sys.stderr.write("SQLITE_INTEGRITY_PROOF_FAILED:PROOF_INTERNAL_ERROR\n")
        sys.exit(1)
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
