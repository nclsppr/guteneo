import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAssets, sha256, sourceSnapshot } from "./release-source.mjs";
import { captureSourceSnapshot, sourceInputs } from "./test-offline.mjs";
import { brandIconSourcePaths, copyBrandIcons } from "./brand-icons.mjs";

export const statusScope = Object.freeze([
  "apps/status",
  ...brandIconSourcePaths,
  "scripts/brand-icons.mjs",
  "packages/contracts/src/brand-icons.json",
  "packages/contracts/src/public-footer.json",
  "wrangler.status.jsonc",
  "scripts/build-status.mjs",
  "scripts/deploy-status.mjs",
  "scripts/release-source.mjs",
  "scripts/deploy-public.mjs",
  "scripts/test-offline.mjs",
  "package.json",
  "package-lock.json",
]);

/** One authored footer catalog serves the web client and the static status UI. */
export async function statusFooterScript(root) {
  const catalog = JSON.parse(
    await readFile(
      join(root, "packages/contracts/src/public-footer.json"),
      "utf8",
    ),
  );
  const labels = (value) =>
    ["fr", "en", "de", "lb"].every(
      (language) =>
        typeof value?.[language] === "string" &&
        value[language].trim().length > 0,
    );
  if (
    !labels(catalog.navigationLabel) ||
    !Array.isArray(catalog.groups) ||
    !catalog.groups.length ||
    catalog.groups.some(
      (group) =>
        !labels(group.labels) ||
        !Array.isArray(group.links) ||
        group.links.some(
          (link) => typeof link.href !== "string" || !labels(link.labels),
        ),
    )
  )
    throw new Error("STATUS_FOOTER_CATALOG_INVALID");
  return `window.GUTENEO_PUBLIC_FOOTER = ${JSON.stringify(catalog)};\n`;
}

function approvedQualificationInputs(scope) {
  return [false, true]
    .map((withPdf) => sourceInputs(withPdf).sort())
    .find((inputs) => JSON.stringify(inputs) === JSON.stringify(scope));
}

export async function verifyQualificationSource(root, expected) {
  if (expected === null) return;
  const inputs = approvedQualificationInputs(expected?.scope);
  if (!inputs) throw new Error("STATUS_QUALIFICATION_SOURCE_MISMATCH");
  const current = await captureSourceSnapshot(root, inputs);
  if (
    current.sha256 !== expected.sha256 ||
    current.fileCount !== expected.fileCount
  )
    throw new Error("STATUS_QUALIFICATION_SOURCE_MISMATCH");
}

async function qualifiedSource(root, output) {
  const file = join(output, "qualification.json");
  try {
    const report = JSON.parse(await readFile(file, "utf8"));
    if (
      report.schema !== 1 ||
      report.environment !== "local" ||
      report.status !== "passed" ||
      report.sourceSnapshotAlgorithm !== "sha256-path-content-v1" ||
      report.sourceUnchangedDuringRun !== true ||
      !/^[a-f0-9]{64}$/.test(report.sourceSnapshotSha256 ?? "") ||
      !Number.isSafeInteger(report.sourceSnapshotFileCount) ||
      report.sourceSnapshotFileCount <= 0
    )
      throw new Error("STATUS_QUALIFICATION_INVALID");
    const expected = {
      sha256: report.sourceSnapshotSha256,
      fileCount: report.sourceSnapshotFileCount,
      scope: report.sourceSnapshotScope,
    };
    await verifyQualificationSource(root, expected);
    return expected;
  } catch {
    // A dated local report is usable only for these exact business sources.
    // Absence is rendered as unavailable, never as a newly qualified result.
    await rm(file, { force: true });
    return null;
  }
}

export async function buildStatus(
  root = fileURLToPath(new URL("../", import.meta.url)),
) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const sourceCommit = git("rev-parse", "HEAD");
  const sourceDirty = !!git("status", "--porcelain", "--", ...statusScope);
  const sourceSnapshotSha256 = await sourceSnapshot(root, statusScope);
  const output = join(root, "dist/status");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, "apps/status/public"), output, { recursive: true });
  await copyBrandIcons(root, output);
  if (
    (await readFile(join(output, "index.html"), "utf8")).includes(
      'src="/footer.js"',
    )
  )
    await writeFile(join(output, "footer.js"), await statusFooterScript(root));
  const qualificationSource = await qualifiedSource(root, output);
  const assets = await collectAssets(output, ["/release.json"]);
  const manifest = {
    product: "Guteneo Status",
    mode: "production-observation",
    sourceCommit,
    sourceDirty,
    sourceSnapshotSha256,
    qualificationSource,
    builtAt: new Date().toISOString(),
    assetsSha256: sha256(JSON.stringify(assets)),
    assets,
  };
  if (sourceSnapshotSha256 !== (await sourceSnapshot(root, statusScope)))
    throw new Error("STATUS_SOURCE_CHANGED");
  await verifyQualificationSource(root, qualificationSource);
  await writeFile(
    join(output, "release.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = await buildStatus();
  console.log(
    `Status assets built from ${manifest.sourceCommit}${manifest.sourceDirty ? " (local changes)" : ""}.`,
  );
}
