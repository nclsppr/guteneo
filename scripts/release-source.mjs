import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const common = [
  "scripts/release-source.mjs",
  "scripts/deploy-public.mjs",
  "scripts/build-public-pages.mjs",
  "scripts/verify-release.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
export const releaseProfiles = Object.freeze({
  live: Object.freeze({
    output: "dist/web",
    config: "wrangler.live.jsonc",
    build: "scripts/build-live.mjs",
    mode: "production",
    publicPreview: false,
    scope: Object.freeze([
      "apps/api",
      "apps/web",
      "packages",
      "migrations",
      "integrations",
      "scripts/build-live.mjs",
      "wrangler.live.jsonc",
      ...common,
    ]),
  }),
  preview: Object.freeze({
    output: "dist/preview",
    config: "wrangler.preview.jsonc",
    build: "scripts/build-preview.mjs",
    mode: "public-design-preview",
    publicPreview: true,
    scope: Object.freeze([
      "apps/web",
      "apps/preview",
      "packages",
      "scripts/build-preview.mjs",
      "wrangler.preview.jsonc",
      ...common,
    ]),
  }),
});
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

/** Shared by build and deployment: hash the exact bytes, not only the Git tree. */
export async function sourceSnapshot(root, scope) {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...scope,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const digest = createHash("sha256");
  for (const path of paths) {
    try {
      digest
        .update(path)
        .update("\0")
        .update(await readFile(join(root, path)))
        .update("\0");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return digest.digest("hex");
}

export async function collectAssets(output, omit = []) {
  const assets = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const path = `/${relative(output, file).split("\\").join("/")}`;
      if (omit.includes(path)) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        const bytes = await readFile(file);
        assets.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error("Release assets must be regular files.");
    }
  }
  await visit(output);
  return assets.sort((left, right) => left.path.localeCompare(right.path));
}
