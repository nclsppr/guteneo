import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  packBuildArtifact,
  restoreBuildArtifact,
} from "../../scripts/ci/build-artifact.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "guteneo-build-artifact-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "--quiet");
  await writeFile(join(root, "source.txt"), "reviewed synthetic source");
  git(root, "add", "source.txt");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Synthetic source",
  );
  const source = {
    commit: git(root, "rev-parse", "HEAD"),
    tree: git(root, "rev-parse", "HEAD^{tree}"),
  };
  const original = new Map();
  for (const target of ["web", "preview"]) {
    const files = {
      "index.html": Buffer.from(`<main>${target}</main>`),
      "videos/current.mp4": Buffer.from(
        "identical synthetic media in both outputs",
      ),
      "assets/code.js": Buffer.from(`const target = '${target}';`),
      ".well-known/synthetic.json": Buffer.from('{"synthetic":true}'),
    };
    const assets = Object.entries(files)
      .map(([path, bytes]) => ({
        path: `/${path}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const preview = target === "preview";
    const release = {
      product: "Guteneo",
      mode: preview ? "public-design-preview" : "production",
      publicPreview: preview,
      liveSendsEnabled: false,
      sourceCommit: source.commit,
      ...(preview ? { sourceTree: source.tree } : {}),
      sourceDirty: false,
      sourceSnapshotSha256: "a".repeat(64),
      builtAt: "2026-10-30T08:00:00.000Z",
      assetsSha256: hash(JSON.stringify(assets)),
      assets,
    };
    files["release.json"] = Buffer.from(JSON.stringify(release));
    if (preview)
      files["health.json"] = Buffer.from(
        JSON.stringify({
          status: "ok",
          mode: release.mode,
          liveSendsEnabled: false,
          sourceCommit: source.commit,
          sourceSnapshotSha256: release.sourceSnapshotSha256,
          assetsSha256: release.assetsSha256,
          builtAt: release.builtAt,
        }),
      );
    for (const [path, bytes] of Object.entries(files)) {
      const output = join(root, "dist", target, path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
      original.set(`${target}/${path}`, bytes);
    }
  }
  return {
    root,
    source,
    original,
    directory: join(root, "bundle"),
    pack() {
      return packBuildArtifact({ root, directory: this.directory });
    },
    restore(targets = ["web", "preview"]) {
      return restoreBuildArtifact({ root, directory: this.directory, targets });
    },
    clear() {
      return rm(join(root, "dist"), { recursive: true, force: true });
    },
  };
}
async function editIndex(f, change) {
  const path = join(f.directory, "index.json");
  const index = JSON.parse(await readFile(path, "utf8"));
  change(index);
  await writeFile(path, JSON.stringify(index));
}

test("deduplicates bytes once and reconstructs both exact independent output trees", async (t) => {
  const f = await fixture(t);
  const index = await f.pack();
  assert.deepEqual(index.source, f.source);
  assert.equal(index.stats.files, 11);
  assert.equal(index.stats.uniqueObjects, 9);
  assert.equal(
    index.stats.duplicateBytes,
    Buffer.byteLength("identical synthetic media in both outputs") +
      Buffer.byteLength('{"synthetic":true}'),
  );
  assert.equal((await readdir(join(f.directory, "objects"))).length, 9);
  await f.clear();
  await f.restore();
  for (const [path, bytes] of f.original)
    assert.deepEqual(await readFile(join(f.root, "dist", path)), bytes, path);
  await writeFile(
    join(f.root, "dist/web/videos/current.mp4"),
    "changed by a test",
  );
  assert.deepEqual(
    await readFile(join(f.root, "dist/preview/videos/current.mp4")),
    f.original.get("preview/videos/current.mp4"),
  );
  const media = index.files.find(
    (file) => file.path === "web/videos/current.mp4",
  );
  assert.equal(
    hash(await readFile(join(f.directory, "objects", media.sha256))),
    media.sha256,
  );
});

test("restores only the explicitly selected application target", async (t) => {
  const f = await fixture(t);
  await f.pack();
  await f.clear();
  const result = await f.restore(["web"]);
  assert.deepEqual(result.restoredTargets, ["web"]);
  assert.deepEqual(await readdir(join(f.root, "dist")), ["web"]);
});

test("packing refuses symlinks and leaves no published partial artifact", async (t) => {
  const f = await fixture(t);
  await symlink(join(f.root, "source.txt"), join(f.root, "dist/web/link"));
  await assert.rejects(f.pack(), /FILE_INVALID/);
  assert.equal((await readdir(f.root)).includes("bundle"), false);
  assert.equal(
    (await readdir(f.root)).some((name) => name.startsWith(".build-artifact-")),
    false,
  );
});

test("packing refuses a symlinked target directory or bundle ancestor", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, "dist/web"), { recursive: true });
  await symlink(join(f.root, "dist/preview"), join(f.root, "dist/web"));
  await assert.rejects(f.pack(), /DIRECTORY_INVALID/);
  const other = await fixture(t);
  await symlink(join(other.root, "dist"), join(other.root, "linked"));
  await assert.rejects(
    packBuildArtifact({ root: other.root, directory: "linked/bundle" }),
    /DIRECTORY_INVALID/,
  );
});

test("refuses source commits, trees or statistics that do not match the checkout", async (t) => {
  for (const change of [
    (index) => {
      index.source.commit = "b".repeat(40);
    },
    (index) => {
      index.source.tree = "b".repeat(40);
    },
    (index) => {
      index.stats.uniqueBytes++;
    },
  ]) {
    const f = await fixture(t);
    await f.pack();
    await f.clear();
    await editIndex(f, change);
    await assert.rejects(f.restore(), /INDEX_INVALID/);
    assert.equal((await readdir(f.root)).includes("dist"), false);
  }
});

test("refuses traversal, absolute paths, duplicate paths and file/directory conflicts", async (t) => {
  for (const path of [
    "web/../../escaped",
    "/web/file",
    "web\\file",
    "web/./file",
    "other/file",
    "web/index.html",
  ]) {
    const f = await fixture(t);
    await f.pack();
    await f.clear();
    await editIndex(f, (index) => {
      index.files[0].path = path;
    });
    await assert.rejects(f.restore(), /INDEX_INVALID/);
  }
  const f = await fixture(t);
  await f.pack();
  await f.clear();
  await editIndex(f, (index) => {
    index.files.find((file) => file.path === "preview/health.json").path =
      "preview/assets";
    index.files.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
  });
  await assert.rejects(f.restore(), /INDEX_INVALID/);
});

test("refuses extra or missing bundle files, including objects not used by the selected target", async (t) => {
  for (const change of [
    async (f) => writeFile(join(f.directory, "unexpected"), "extra"),
    async (f) =>
      writeFile(join(f.directory, "objects", "b".repeat(64)), "extra"),
    async (f) => {
      const index = JSON.parse(
        await readFile(join(f.directory, "index.json"), "utf8"),
      );
      const file = index.files.find(
        (file) => file.path === "preview/index.html",
      );
      await rm(join(f.directory, "objects", file.sha256));
    },
  ]) {
    const f = await fixture(t);
    await f.pack();
    await f.clear();
    await change(f);
    await assert.rejects(f.restore(["web"]), /INVENTORY_INVALID/);
  }
});

test("refuses tampered objects, false lengths and symlinked object bytes", async (t) => {
  for (const mutate of [
    async (path) => writeFile(path, "tampered"),
    async (path, f) => {
      await rm(path);
      await symlink(join(f.root, "source.txt"), path);
    },
  ]) {
    const f = await fixture(t);
    const index = await f.pack();
    await f.clear();
    await mutate(join(f.directory, "objects", index.files[0].sha256), f);
    await assert.rejects(f.restore(), /(?:OBJECT|FILE)_INVALID/);
  }
  const f = await fixture(t);
  await f.pack();
  await f.clear();
  await editIndex(f, (index) => {
    index.files[0].bytes++;
  });
  await assert.rejects(f.restore(), /INDEX_INVALID/);
});

test("packing rejects stale source, dirty release flags, missing assets and a forged release digest", async (t) => {
  for (const change of [
    (release) => {
      release.sourceCommit = "b".repeat(40);
    },
    (release) => {
      release.sourceTree = "b".repeat(40);
    },
    (release) => {
      release.sourceDirty = true;
    },
    (release) => {
      release.assets.pop();
    },
    (release) => {
      release.assetsSha256 = "b".repeat(64);
    },
  ]) {
    const f = await fixture(t);
    const path = join(f.root, "dist/preview/release.json");
    const release = JSON.parse(await readFile(path, "utf8"));
    change(release);
    await writeFile(path, JSON.stringify(release));
    await assert.rejects(f.pack(), /RELEASE_INVALID/);
  }
});

test("validates preview health and rejects unmanifested output files", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "dist/preview/health.json"), "{}");
  await assert.rejects(f.pack(), /RELEASE_INVALID/);
  const other = await fixture(t);
  await writeFile(join(other.root, "dist/web/extra.bin"), "not in release");
  await assert.rejects(other.pack(), /RELEASE_INVALID/);
});

test("restore checks release and health contracts even when their new object hashes are consistent", async (t) => {
  for (const path of ["web/release.json", "preview/health.json"]) {
    const f = await fixture(t);
    const index = await f.pack();
    await f.clear();
    const entry = index.files.find((file) => file.path === path);
    const oldPath = join(f.directory, "objects", entry.sha256);
    const value = JSON.parse(await readFile(oldPath, "utf8"));
    value.sourceCommit = "b".repeat(40);
    const bytes = Buffer.from(JSON.stringify(value));
    entry.sha256 = hash(bytes);
    entry.bytes = bytes.length;
    await rm(oldPath);
    await writeFile(join(f.directory, "objects", entry.sha256), bytes);
    const unique = new Map(
      index.files.map((file) => [file.sha256, file.bytes]),
    );
    index.stats.totalBytes = index.files.reduce(
      (sum, file) => sum + file.bytes,
      0,
    );
    index.stats.uniqueBytes = [...unique.values()].reduce(
      (sum, size) => sum + size,
      0,
    );
    index.stats.duplicateBytes =
      index.stats.totalBytes - index.stats.uniqueBytes;
    await writeFile(join(f.directory, "index.json"), JSON.stringify(index));
    await assert.rejects(f.restore(), /RELEASE_INVALID/);
    assert.equal((await readdir(f.root)).includes("dist"), false);
  }
});

test("does not overwrite existing destinations or follow a symlinked dist directory", async (t) => {
  const f = await fixture(t);
  await f.pack();
  await assert.rejects(f.pack(), /DESTINATION_EXISTS/);
  await assert.rejects(f.restore(), /DESTINATION_EXISTS/);
  await f.clear();
  await symlink(f.directory, join(f.root, "dist"));
  await assert.rejects(f.restore(), /DIRECTORY_INVALID/);
});

test("rejects invalid target selections, index schema and malformed JSON", async (t) => {
  const f = await fixture(t);
  await f.pack();
  await f.clear();
  for (const targets of [[], ["web", "web"], ["unknown"]])
    await assert.rejects(f.restore(targets), /TARGET_INVALID/);
  await editIndex(f, (index) => {
    index.unexpected = true;
  });
  await assert.rejects(f.restore(), /INDEX_INVALID/);
  await writeFile(join(f.directory, "index.json"), "not JSON");
  await assert.rejects(f.restore(), SyntaxError);
});

test("CLI fails closed without reflecting malformed arguments", () => {
  const script = new URL(
    "../../scripts/ci/build-artifact.mjs",
    import.meta.url,
  );
  const run = spawnSync(
    process.execPath,
    [script.pathname, "invalid", "fictional-private-value"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /CI_BUILD_ARTIFACT_OPTIONS_INVALID/);
  assert.doesNotMatch(run.stderr + run.stdout, /fictional-private-value/);
});
