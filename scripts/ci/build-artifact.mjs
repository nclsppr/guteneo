import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const targetNames = ["web", "preview"];
const digestPattern = /^[a-f0-9]{64}$/;
const objectIdPattern = /^[a-f0-9]{40}$/;
const maxIndexBytes = 8 * 1024 * 1024;
const maxFileBytes = 512 * 1024 * 1024;
const maxTotalBytes = 4 * 1024 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (reason) => {
  throw new Error(`CI_BUILD_ARTIFACT_${reason}`);
};
const requireCondition = (condition, reason) => {
  if (!condition) fail(reason);
};
function keys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}
function safePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\\x00-\x1f\x7f]/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}
function revision(root) {
  const [commit, tree] = execFileSync(
    "git",
    ["rev-parse", "HEAD", "HEAD^{tree}"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .trim()
    .split("\n");
  requireCondition(
    objectIdPattern.test(commit ?? "") && objectIdPattern.test(tree ?? ""),
    "SOURCE_INVALID",
  );
  return { commit, tree };
}
function sameRevision(left, right) {
  return left.commit === right.commit && left.tree === right.tree;
}
async function stat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function regularFile(path, limit = maxFileBytes) {
  const info = await lstat(path);
  requireCondition(info.isFile() && info.size <= limit, "FILE_INVALID");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = await handle.readFile();
    requireCondition(bytes.length === info.size, "FILE_CHANGED");
    return bytes;
  } finally {
    await handle.close();
  }
}
async function safeDirectory(root, path, create = false) {
  const local = relative(root, path).split("\\").join("/");
  requireCondition(!local || safePath(local), "DIRECTORY_INVALID");
  let current = root;
  for (const part of local ? local.split("/") : []) {
    current = join(current, part);
    const info = await stat(current);
    if (!info && create) await mkdir(current);
    else requireCondition(info?.isDirectory(), "DIRECTORY_INVALID");
  }
}
async function locations(root, directory) {
  root = resolve(root);
  const local = relative(root, resolve(root, directory)).split("\\").join("/");
  requireCondition(
    safePath(local) && local.split("/")[0] !== "dist",
    "DIRECTORY_INVALID",
  );
  root = await realpath(root);
  directory = resolve(root, local);
  return { root, directory };
}
function statistics(files) {
  const objects = new Map();
  let totalBytes = 0;
  for (const file of files) {
    requireCondition(
      !objects.has(file.sha256) || objects.get(file.sha256) === file.bytes,
      "INDEX_INVALID",
    );
    objects.set(file.sha256, file.bytes);
    totalBytes += file.bytes;
  }
  const uniqueBytes = [...objects.values()].reduce(
    (sum, size) => sum + size,
    0,
  );
  return {
    files: files.length,
    uniqueObjects: objects.size,
    totalBytes,
    uniqueBytes,
    duplicateBytes: totalBytes - uniqueBytes,
  };
}
function validateIndex(index, source) {
  requireCondition(
    keys(index, ["schema", "source", "files", "stats"]) &&
      index.schema === 1 &&
      keys(index.source, ["commit", "tree"]) &&
      sameRevision(index.source, source) &&
      Array.isArray(index.files) &&
      index.files.length > 0 &&
      index.files.length <= 20000,
    "INDEX_INVALID",
  );
  const paths = new Set();
  let previous = "";
  for (const file of index.files) {
    requireCondition(
      keys(file, ["path", "bytes", "sha256"]) &&
        safePath(file.path) &&
        targetNames.includes(file.path.split("/")[0]) &&
        file.path.includes("/") &&
        file.path > previous &&
        Number.isSafeInteger(file.bytes) &&
        file.bytes >= 0 &&
        file.bytes <= maxFileBytes &&
        digestPattern.test(file.sha256),
      "INDEX_INVALID",
    );
    previous = file.path;
    paths.add(file.path);
  }
  for (const path of paths) {
    const parts = path.split("/");
    for (let count = 1; count < parts.length; count++)
      requireCondition(
        !paths.has(parts.slice(0, count).join("/")),
        "INDEX_INVALID",
      );
  }
  for (const target of targetNames)
    requireCondition(paths.has(`${target}/release.json`), "INDEX_INVALID");
  const stats = statistics(index.files);
  requireCondition(
    keys(index.stats, Object.keys(stats)) &&
      Object.entries(stats).every(
        ([key, value]) => index.stats[key] === value,
      ) &&
      stats.totalBytes <= maxTotalBytes,
    "INDEX_INVALID",
  );
}
async function validateReleases(index, object, targets) {
  const files = new Map(index.files.map((file) => [file.path, file]));
  const json = async (path) =>
    JSON.parse((await object(files.get(path))).toString("utf8"));
  for (const target of targets) {
    const preview = target === "preview";
    const release = await json(`${target}/release.json`);
    const omitted = preview
      ? ["/release.json", "/health.json"]
      : ["/release.json"];
    const assets = index.files
      .filter((file) => file.path.startsWith(`${target}/`))
      .map((file) => ({
        path: file.path.slice(target.length),
        bytes: file.bytes,
        sha256: file.sha256,
      }))
      .filter((file) => !omitted.includes(file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    requireCondition(
      release.product === "Guteneo" &&
        release.sourceCommit === index.source.commit &&
        release.sourceDirty === false &&
        (!preview || release.sourceTree === index.source.tree) &&
        (release.sourceTree === undefined ||
          release.sourceTree === index.source.tree) &&
        release.mode === (preview ? "public-design-preview" : "production") &&
        release.publicPreview === preview &&
        typeof release.liveSendsEnabled === "boolean" &&
        (!preview || release.liveSendsEnabled === false) &&
        digestPattern.test(release.sourceSnapshotSha256 ?? "") &&
        typeof release.builtAt === "string" &&
        Number.isFinite(Date.parse(release.builtAt)) &&
        assets.length > 0 &&
        JSON.stringify(release.assets) === JSON.stringify(assets) &&
        release.assetsSha256 === hash(JSON.stringify(assets)),
      "RELEASE_INVALID",
    );
    if (preview) {
      requireCondition(files.has("preview/health.json"), "RELEASE_INVALID");
      const health = await json("preview/health.json");
      const expected = {
        status: "ok",
        mode: release.mode,
        liveSendsEnabled: false,
        sourceCommit: index.source.commit,
        sourceSnapshotSha256: release.sourceSnapshotSha256,
        assetsSha256: release.assetsSha256,
        builtAt: release.builtAt,
      };
      requireCondition(
        JSON.stringify(health) === JSON.stringify(expected),
        "RELEASE_INVALID",
      );
    }
  }
}

/** Freeze both built outputs into one content-addressed, source-bound artifact. */
export async function packBuildArtifact({ root = repository, directory }) {
  ({ root, directory } = await locations(root, directory));
  const source = revision(root);
  requireCondition(!(await stat(directory)), "DESTINATION_EXISTS");
  await safeDirectory(root, dirname(directory), true);
  const staging = await mkdtemp(join(dirname(directory), ".build-artifact-"));
  try {
    const objects = join(staging, "objects");
    await mkdir(objects);
    const files = [];
    const seen = new Set();
    async function visit(path, name) {
      const info = await lstat(path);
      if (info.isDirectory()) {
        for (const entry of await readdir(path))
          await visit(join(path, entry), `${name}/${entry}`);
      } else {
        const bytes = await regularFile(path);
        const sha256 = hash(bytes);
        files.push({ path: name, bytes: bytes.length, sha256 });
        if (!seen.has(sha256)) {
          await writeFile(join(objects, sha256), bytes, { flag: "wx" });
          seen.add(sha256);
        }
      }
    }
    for (const target of targetNames) {
      await safeDirectory(root, join(root, "dist", target));
      await visit(join(root, "dist", target), target);
    }
    files.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    const index = { schema: 1, source, files, stats: statistics(files) };
    validateIndex(index, source);
    await validateReleases(
      index,
      (file) => regularFile(join(objects, file.sha256)),
      targetNames,
    );
    requireCondition(sameRevision(source, revision(root)), "SOURCE_CHANGED");
    const serialized = JSON.stringify(index) + "\n";
    requireCondition(
      Buffer.byteLength(serialized) <= maxIndexBytes,
      "INDEX_INVALID",
    );
    await writeFile(join(staging, "index.json"), serialized, {
      flag: "wx",
    });
    await rename(staging, directory);
    return index;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

/** Validate the complete immutable bundle before restoring selected output trees. */
export async function restoreBuildArtifact({
  root = repository,
  directory,
  targets = targetNames,
}) {
  ({ root, directory } = await locations(root, directory));
  requireCondition(
    Array.isArray(targets) &&
      targets.length > 0 &&
      new Set(targets).size === targets.length &&
      targets.every((target) => targetNames.includes(target)),
    "TARGET_INVALID",
  );
  await safeDirectory(root, directory);
  const entries = (await readdir(directory)).sort();
  requireCondition(
    JSON.stringify(entries) === JSON.stringify(["index.json", "objects"]),
    "INVENTORY_INVALID",
  );
  await safeDirectory(root, join(directory, "objects"));
  const index = JSON.parse(
    (await regularFile(join(directory, "index.json"), maxIndexBytes)).toString(
      "utf8",
    ),
  );
  const source = revision(root);
  validateIndex(index, source);
  const expected = [...new Set(index.files.map((file) => file.sha256))].sort();
  const actual = (await readdir(join(directory, "objects"))).sort();
  requireCondition(
    JSON.stringify(actual) === JSON.stringify(expected),
    "INVENTORY_INVALID",
  );
  const sizes = new Map(index.files.map((file) => [file.sha256, file.bytes]));
  const object = async (file) => {
    requireCondition(Boolean(file), "RELEASE_INVALID");
    const bytes = await regularFile(join(directory, "objects", file.sha256));
    requireCondition(
      bytes.length === sizes.get(file.sha256) && hash(bytes) === file.sha256,
      "OBJECT_INVALID",
    );
    return bytes;
  };
  for (const sha256 of expected) await object({ sha256 });
  await validateReleases(index, object, targets);
  const dist = join(root, "dist");
  await safeDirectory(root, dist, true);
  for (const target of targets)
    requireCondition(!(await stat(join(dist, target))), "DESTINATION_EXISTS");
  const staging = await mkdtemp(join(dist, ".build-artifact-"));
  try {
    for (const file of index.files.filter((file) =>
      targets.includes(file.path.split("/")[0]),
    )) {
      const destination = join(staging, file.path);
      await mkdir(dirname(destination), { recursive: true });
      // CoW where supported; copies remain independent if a browser test writes.
      await copyFile(
        join(directory, "objects", file.sha256),
        destination,
        constants.COPYFILE_FICLONE,
      );
      const restored = await regularFile(destination);
      requireCondition(
        restored.length === file.bytes && hash(restored) === file.sha256,
        "OBJECT_INVALID",
      );
    }
    requireCondition(sameRevision(source, revision(root)), "SOURCE_CHANGED");
    for (const target of targets)
      await rename(join(staging, target), join(dist, target));
    return { ...index.stats, restoredTargets: targets };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main(args) {
  const [mode, directory, ...targets] = args;
  requireCondition(Boolean(directory), "OPTIONS_INVALID");
  if (mode === "pack" && targets.length === 0) {
    const index = await packBuildArtifact({ directory });
    console.log(JSON.stringify({ mode, source: index.source, ...index.stats }));
  } else if (mode === "restore") {
    console.log(
      JSON.stringify({
        mode,
        ...(await restoreBuildArtifact({ directory, targets })),
      }),
    );
  } else fail("OPTIONS_INVALID");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const code = /^CI_BUILD_ARTIFACT_[A-Z_]+$/.test(error.message)
      ? error.message
      : "CI_BUILD_ARTIFACT_INVALID";
    console.error(
      `Build artifact validation failed (${code}); no test may use this artifact.`,
    );
    process.exitCode = 1;
  }
}
