import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repository = "nclsppr/guteneo";
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const validVersion = (value) =>
  typeof value === "string" &&
  value === value.trim() &&
  versionPattern.test(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value, expected) =>
  object(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
const positive = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 10000000;
const identity = (value) =>
  typeof value === "string" &&
  /^[1-9]\d*$/.test(value) &&
  Number.isSafeInteger(Number(value));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function demand(condition, code) {
  if (!condition) throw new Error(`RELEASE_EVIDENCE_${code}`);
}

function counts(value, attempt) {
  const browser = value?.browser;
  demand(
    keys(value, ["files", "passed", "browser"]) &&
      positive(value.files) &&
      positive(value.passed) &&
      keys(browser, [
        "rows",
        "suites",
        "discovered",
        "passed",
        "declaredSkipped",
        "evidenceAttempts",
      ]) &&
      browser.rows === 9 &&
      browser.suites === 8 &&
      positive(browser.discovered) &&
      positive(browser.passed) &&
      Number.isSafeInteger(browser.declaredSkipped) &&
      browser.declaredSkipped >= 0 &&
      browser.passed + browser.declaredSkipped === browser.discovered &&
      Array.isArray(browser.evidenceAttempts) &&
      browser.evidenceAttempts.length > 0 &&
      browser.evidenceAttempts.length <= 100 &&
      new Set(browser.evidenceAttempts).size ===
        browser.evidenceAttempts.length &&
      browser.evidenceAttempts.every(
        (n) => identity(n) && Number(n) <= Number(attempt),
      ),
    "COUNTS_INVALID",
  );
  return structuredClone(value);
}

function verifiedSummary(verification, context, sealed) {
  if (verification?.reused !== true)
    return {
      mode: "full",
      counts: counts(verification, context.runAttempt),
      prior: null,
    };
  demand(
    keys(verification, [
      "schema",
      "reused",
      "full",
      "sourceCommit",
      "tree",
      "priorRunId",
      "priorRunAttempt",
      "artifactId",
      "artifactDigest",
      "evidenceSha256",
      "counts",
      "toolchain",
    ]) &&
      verification.schema === 1 &&
      verification.full === false &&
      verification.sourceCommit === context.sourceCommit &&
      verification.tree === context.sourceTree &&
      Number.isSafeInteger(verification.priorRunId) &&
      verification.priorRunId > 0 &&
      Number.isSafeInteger(verification.priorRunAttempt) &&
      verification.priorRunAttempt > 0 &&
      Number.isSafeInteger(verification.artifactId) &&
      verification.artifactId > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(verification.artifactDigest ?? "") &&
      digest.test(verification.evidenceSha256 ?? ""),
    "REUSE_INVALID",
  );
  const selection = sealed?.selection;
  const proof = sealed?.proof;
  demand(
    sealed?.schema === 1 &&
      selection?.candidate === true &&
      selection.main?.sha === context.sourceCommit &&
      selection.main.tree === context.sourceTree &&
      selection.main.runId === Number(context.runId) &&
      selection.main.runAttempt === Number(context.runAttempt) &&
      selection.candidateRun?.runId === verification.priorRunId &&
      selection.candidateRun.runAttempt === verification.priorRunAttempt &&
      selection.artifact?.id === verification.artifactId &&
      selection.artifact.digest === verification.artifactDigest &&
      proof?.repository === repository &&
      proof.reusable === true &&
      proof.run?.id === verification.priorRunId &&
      proof.run.attempt === verification.priorRunAttempt &&
      sha.test(proof.tested?.commit ?? "") &&
      proof.tested.tree === context.sourceTree &&
      proof.evidence?.sha256 === verification.evidenceSha256 &&
      typeof sealed.evidenceText === "string" &&
      Buffer.byteLength(sealed.evidenceText) <= 131072 &&
      hash(sealed.evidenceText) === verification.evidenceSha256 &&
      isDeepStrictEqual(proof.evidence.summary, verification.counts) &&
      isDeepStrictEqual(JSON.parse(sealed.evidenceText), verification.counts),
    "REUSE_PROVENANCE_INVALID",
  );
  const summary = counts(
    verification.counts,
    String(verification.priorRunAttempt),
  );
  demand(
    summary.browser.evidenceAttempts.length === 1 &&
      Number(summary.browser.evidenceAttempts[0]) ===
        verification.priorRunAttempt,
    "REUSE_MIXED_ATTEMPTS",
  );
  return {
    mode: "reused",
    counts: summary,
    prior: {
      runId: String(verification.priorRunId),
      runAttempt: String(verification.priorRunAttempt),
      testedCommit: proof.tested.commit,
      testedTree: proof.tested.tree,
      artifactId: verification.artifactId,
      artifactDigest: verification.artifactDigest,
      evidenceSha256: verification.evidenceSha256,
    },
  };
}

function notesLines(notes, version) {
  demand(
    typeof notes === "string" &&
      Buffer.byteLength(notes) <= 32768 &&
      notes.trim().length >= 100 &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(notes),
    "NOTES_REQUIRED",
  );
  const lines = notes.trim().split(/\r?\n/);
  demand(
    lines[0] === `# Guteneo ${version}` ||
      lines[0].startsWith(`# Guteneo ${version} — `),
    "NOTES_VERSION_MISMATCH",
  );
  demand(
    lines.slice(1).some((line) => /^##\s+\S/.test(line)),
    "NOTES_SECTIONS_REQUIRED",
  );
  return lines.slice(1);
}

function linkTarget(target, context) {
  let url;
  try {
    url = new URL(target);
  } catch {
    demand(false, "NOTES_LINK_INVALID");
  }
  demand(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      (url.origin === "https://guteneo.com" ||
        url.origin === "https://engineering.guteneo.com" ||
        (url.origin === "https://github.com" &&
          url.pathname.startsWith(`/${context.repository}/`))),
    "NOTES_LINK_INVALID",
  );
  return url.href;
}
function inline(text, context) {
  const pattern = /\[([^\]\n]+)\]\(([^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let result = "",
    offset = 0;
  for (const item of text.matchAll(pattern)) {
    result += escape(text.slice(offset, item.index));
    result += item[1]
      ? `<a href="${escape(linkTarget(item[2], context))}">${escape(item[1])}</a>`
      : item[3]
        ? `<code>${escape(item[3])}</code>`
        : `<strong>${escape(item[4])}</strong>`;
    offset = item.index + item[0].length;
  }
  return result + escape(text.slice(offset));
}
const imageLine = /^!\[([^\]\n]{1,200})\]\(([^\s)]+)\)$/;
function notesHtml(lines, images, context) {
  const output = [];
  let paragraph = [],
    list = [];
  const flush = () => {
    if (paragraph.length)
      output.push(`<p>${inline(paragraph.join(" "), context)}</p>`);
    if (list.length)
      output.push(
        `<ul>${list.map((line) => `<li>${inline(line, context)}</li>`).join("")}</ul>`,
      );
    paragraph = [];
    list = [];
  };
  for (const line of lines) {
    const image = line.match(imageLine);
    if (!line.trim() || /^#{1,6}\s/.test(line) || image) {
      flush();
      if (image) {
        const found = images.find(
          (item) => item.destination === image[2] && item.caption === image[1],
        );
        demand(found, "IMAGE_MISSING");
        output.push(
          `<figure><img src="data:image/png;base64,${found.base64}" alt="${escape(found.caption)}" width="${found.width}" height="${found.height}"><figcaption>${escape(found.caption)}<br><small>Repository illustration; separate from the CI inventory below. <code>${escape(found.path)}</code> · SHA-256 <code>${found.sha256}</code></small></figcaption></figure>`,
        );
      } else if (line.trim())
        output.push(
          `<h3>${inline(line.replace(/^#{1,6}\s+/, ""), context)}</h3>`,
        );
    } else if (/^-\s+/.test(line)) {
      if (paragraph.length) flush();
      list.push(line.replace(/^-\s+/, ""));
    } else {
      if (list.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return output.join("\n");
}

function png(bytes) {
  demand(
    bytes.length >= 33 &&
      bytes.length <= 2097152 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.toString("ascii", 12, 16) === "IHDR",
    "IMAGE_INVALID",
  );
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  demand(
    width > 0 && height > 0 && width * height <= 25000000,
    "IMAGE_INVALID",
  );
  return { width, height };
}

/** A presentation of the existing verified gate, never a replacement qualification. */
export function renderReleaseEvidence({
  version,
  notes,
  verification,
  context,
  sealed = null,
  images = [],
}) {
  demand(
    validVersion(version) &&
      context?.repository === repository &&
      sha.test(context.sourceCommit ?? "") &&
      sha.test(context.sourceTree ?? "") &&
      sha.test(context.headCommit ?? "") &&
      identity(context.runId) &&
      identity(context.runAttempt) &&
      ["push", "pull_request"].includes(context.event) &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(
        context.generatedAt ?? "",
      ) &&
      Number.isFinite(Date.parse(context.generatedAt)),
    "CONTEXT_INVALID",
  );
  const lines = notesLines(notes, version);
  demand(Array.isArray(images) && images.length <= 6, "IMAGES_INVALID");
  let total = 0;
  for (const image of images) {
    const bytes = Buffer.from(image.base64 ?? "", "base64");
    const dimensions = png(bytes);
    total += bytes.length;
    demand(
      /^(?:docs\/evidence|ios\/QA\/Screenshots)\/[A-Za-z0-9_.-]+\.png$/.test(
        image.path ?? "",
      ) &&
        bytes.toString("base64") === image.base64 &&
        hash(bytes) === image.sha256 &&
        bytes.length === image.bytes &&
        dimensions.width === image.width &&
        dimensions.height === image.height &&
        typeof image.caption === "string" &&
        image.caption.length <= 200 &&
        total <= 8388608,
      "IMAGE_INVALID",
    );
  }
  const summary = verifiedSummary(verification, context, sealed);
  const runUrl = `https://github.com/${repository}/actions/runs/${context.runId}/attempts/${context.runAttempt}`;
  const proof = {
    schema: 1,
    version,
    generatedAt: context.generatedAt,
    source: {
      commit: context.sourceCommit,
      tree: context.sourceTree,
      headCommit: context.headCommit,
    },
    ci: {
      runId: context.runId,
      runAttempt: context.runAttempt,
      event: context.event,
      url: runUrl,
      mode: summary.mode,
    },
    counts: summary.counts,
    prior: summary.prior,
    notesSha256: hash(notes),
    images: images.map(({ path, caption, bytes, sha256 }) => ({
      path,
      caption,
      bytes,
      sha256,
    })),
    limits: [
      "Deterministic CI fixtures; no real communication or provider delivery is established.",
      "This report does not establish production publication, activation, authenticated live journeys or physical-device qualification.",
      "Repository images illustrate their dated source; they are not a new execution of the pictured journey.",
      "Generated during the verification job; the linked GitHub run owns the final workflow outcome.",
    ],
  };
  const number = (value) => value.toLocaleString("en-US");
  const browser = proof.counts.browser;
  const sourceLink = (commit) =>
    `<a href="https://github.com/${repository}/commit/${commit}"><code>${commit}</code></a>`;
  const provenance = summary.prior
    ? `<p>This main revision reuses a complete prior PR test run after the existing qualifier checked the same full Git tree. These tests were not rerun on main.</p><dl><dt>Prior test run</dt><dd><a href="https://github.com/${repository}/actions/runs/${summary.prior.runId}/attempts/${summary.prior.runAttempt}">${summary.prior.runId}, attempt ${summary.prior.runAttempt}</a></dd><dt>Tested execution commit</dt><dd>${sourceLink(summary.prior.testedCommit)}</dd><dt>Immutable proof artifact</dt><dd>${summary.prior.artifactId} · <code>${summary.prior.artifactDigest}</code></dd><dt>Verified evidence SHA-256</dt><dd><code>${summary.prior.evidenceSha256}</code></dd></dl>`
    : `<p>The test inventory below was verified in this workflow run. Browser evidence retains its actual attempts: ${browser.evidenceAttempts.map(escape).join(", ")}. An aggregate retry does not turn older evidence into a fresh run.</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>guteneo ${escape(version)} · test evidence</title>
<style>:root{color-scheme:light;--ink:#181b22;--paper:#f6f5ef;--line:#c8c9c4;--link:#204bc6;font:17px/1.65 system-ui,sans-serif;color:var(--ink);background:var(--paper)}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:40px clamp(18px,5vw,60px) 80px}header,section{padding-bottom:32px;border-bottom:1px solid var(--line);margin-bottom:32px}.brand{font:32px Georgia,serif;color:var(--ink)}h1,h2{font-family:Georgia,serif;line-height:1.15;text-wrap:balance}h1{font-size:clamp(36px,7vw,64px);max-width:18ch;margin:32px 0 16px;letter-spacing:-.02em}h2{font-size:32px;margin:0 0 20px}h3{font-size:21px;margin:32px 0 12px}p,li{max-width:72ch}a{color:var(--link);text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid var(--link);outline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:24px}nav a{padding:8px 0;min-height:44px}code{font-size:.86em;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(160px,1fr) minmax(0,3fr);gap:12px 24px}dt{font-weight:650}dd{margin:0;min-width:0}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}caption{text-align:left;font-weight:650;margin-bottom:12px}th,td{padding:12px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}td:last-child{text-align:right}figure{margin:32px 0}img{max-width:100%;height:auto;display:block;border:1px solid var(--line)}figcaption{margin-top:12px;max-width:75ch}small{font-size:14px}details{margin-top:24px}summary{cursor:pointer;padding:10px 0;min-height:44px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;background:#fff;padding:20px;border:1px solid var(--line)}::selection{background:#d7e2ff;color:var(--ink)}@media(max-width:600px){dl{grid-template-columns:minmax(0,1fr);gap:4px}dd{margin-bottom:16px}h2{font-size:28px}th,td{padding-right:12px}}@media print{main{max-width:none;padding:0}a{color:inherit}details>pre{display:block}figure,table{break-inside:avoid}}</style></head><body><main>
<header><span class="brand">guteneo</span><h1>${escape(version)}<br>Test evidence</h1><p>Verified test inventory and human release notes, in one portable file. No connection or sign-in is needed to read this report.</p><nav aria-label="Report sections"><a href="#changes">Release notes</a><a href="#tests">Test results</a><a href="#source">Source and provenance</a><a href="#limits">Qualification limits</a></nav></header>
<section id="changes"><h2>What changed</h2>${notesHtml(lines, images, context)}</section>
<section id="tests"><h2>Test results</h2><table><caption>Independently accounted-for CI inventory</caption><thead><tr><th scope="col">Evidence</th><th scope="col">Count</th></tr></thead><tbody><tr><th scope="row">Vitest files</th><td>${number(proof.counts.files)}</td></tr><tr><th scope="row">Passing Vitest assertions</th><td>${number(proof.counts.passed)}</td></tr><tr><th scope="row">Passing browser results</th><td>${number(browser.passed)}</td></tr><tr><th scope="row">Reviewed browser skips</th><td>${number(browser.declaredSkipped)}</td></tr><tr><th scope="row">Discovered browser identities</th><td>${number(browser.discovered)}</td></tr><tr><th scope="row">Browser shard rows / suite-project inventories</th><td>${browser.rows} / ${browser.suites}</td></tr></tbody></table><p>Vitest failures, pending tests and TODOs are refused by the upstream verifier. Browser failures, unreviewed skips, flaky results and missing or duplicated test identities cannot satisfy that gate. Separate native, security and provider counts are not added to these totals.</p></section>
<section id="source"><h2>Source and provenance</h2><dl><dt>Execution commit</dt><dd>${sourceLink(context.sourceCommit)}</dd><dt>Complete Git tree</dt><dd><code>${context.sourceTree}</code></dd><dt>Reviewed head</dt><dd>${sourceLink(context.headCommit)}</dd><dt>Workflow verification</dt><dd><a href="${runUrl}">${context.runId}, attempt ${context.runAttempt}</a> · ${summary.mode === "full" ? "full inventory" : "qualified identical-source reuse"}</dd><dt>Report generated</dt><dd><time datetime="${context.generatedAt}">${context.generatedAt}</time></dd></dl>${provenance}<p>A pull-request execution commit can be a synthetic merge. It is shown separately from the reviewed head. A GitHub tag or this report alone does not establish a deployed version.</p></section>
<section id="limits"><h2>Qualification limits</h2><ul>${proof.limits.map((line) => `<li>${escape(line)}</li>`).join("")}</ul><details><summary>Inspect the portable machine-readable proof</summary><pre>${escape(JSON.stringify(proof, null, 2))}</pre></details></section>
</main></body></html>\n`;
  return { html, proof };
}

async function regularFile(path, limit) {
  const info = await lstat(path);
  demand(
    info.isFile() &&
      !info.isSymbolicLink() &&
      info.size > 0 &&
      info.size <= limit,
    "FILE_INVALID",
  );
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = await file.readFile();
    demand(bytes.length === info.size && bytes.length <= limit, "FILE_CHANGED");
    return bytes;
  } finally {
    await file.close();
  }
}
function localPath(root, path) {
  const target = resolve(root, path),
    local = relative(root, target);
  demand(
    local &&
      local !== ".." &&
      !local.startsWith(`..${sep}`) &&
      !isAbsolute(local),
    "PATH_INVALID",
  );
  return target;
}
async function parentsAreDirectories(root, path) {
  let current = root;
  for (const part of relative(root, dirname(path)).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    demand(info.isDirectory() && !info.isSymbolicLink(), "PATH_INVALID");
  }
}
async function createParents(root, path) {
  let current = root;
  for (const part of relative(root, dirname(path)).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const info = await lstat(current);
    demand(info.isDirectory() && !info.isSymbolicLink(), "OUTPUT_PATH_INVALID");
  }
}

export async function writeReleaseEvidence({
  root,
  verificationPath,
  outputPath,
  context,
  sealed = null,
}) {
  root = resolve(root);
  const read = async (path, limit) => {
    const target = localPath(root, path);
    await parentsAreDirectories(root, target);
    return regularFile(target, limit);
  };
  const manifest = JSON.parse(await read("package.json", 262144));
  demand(validVersion(manifest.version), "VERSION_INVALID");
  const notes = (
    await read(`docs/releases/${manifest.version}.md`, 32768)
  ).toString("utf8");
  const lines = notesLines(notes, manifest.version);
  const images = [];
  for (const line of lines) {
    const found = line.match(imageLine);
    if (!found) continue;
    demand(
      images.length < 6 && !/[\\\x00-\x1f%]/.test(found[2]),
      "IMAGE_PATH_INVALID",
    );
    const path = relative(
      root,
      resolve(
        root,
        /^(?:docs|ios)\//.test(found[2])
          ? found[2]
          : `docs/releases/${found[2]}`,
      ),
    )
      .split(sep)
      .join("/");
    demand(
      /^(?:docs\/evidence|ios\/QA\/Screenshots)\/[A-Za-z0-9_.-]+\.png$/.test(
        path,
      ),
      "IMAGE_PATH_INVALID",
    );
    const bytes = await read(path, 2097152);
    images.push({
      destination: found[2],
      caption: found[1],
      path,
      bytes: bytes.length,
      base64: bytes.toString("base64"),
      sha256: hash(bytes),
      ...png(bytes),
    });
  }
  const result = renderReleaseEvidence({
    version: manifest.version,
    notes,
    verification: JSON.parse(await read(verificationPath, 131072)),
    context,
    sealed,
    images,
  });
  const output = localPath(root, outputPath);
  demand(
    relative(root, output).split(sep)[0] === "test-results",
    "OUTPUT_PATH_INVALID",
  );
  await createParents(root, output);
  await mkdir(output);
  await writeFile(
    join(output, "test-proof.json"),
    JSON.stringify(result.proof, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(join(output, "test-proof.html"), result.html, { flag: "wx" });
  return result;
}

async function main(env, args) {
  const root = process.cwd();
  const git = (revision) =>
    execFileSync("git", ["rev-parse", revision], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  demand(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_REPOSITORY === repository &&
      git("HEAD") === env.GITHUB_SHA,
    "CI_CONTEXT_REQUIRED",
  );
  let headCommit = env.GITHUB_SHA;
  if (env.GITHUB_EVENT_NAME === "pull_request") {
    const event = JSON.parse(await regularFile(env.GITHUB_EVENT_PATH, 1048576));
    headCommit = event.pull_request?.head?.sha;
  }
  let sealed = null;
  if (env.REUSE_PROOF_B64) {
    demand(
      env.REUSE_PROOF_B64.length <= 180000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(env.REUSE_PROOF_B64),
      "REUSE_INVALID",
    );
    sealed = JSON.parse(
      Buffer.from(env.REUSE_PROOF_B64, "base64").toString("utf8"),
    );
  }
  demand(args.length === 2, "ARGUMENTS_INVALID");
  await writeReleaseEvidence({
    root,
    verificationPath: args[0],
    outputPath: args[1],
    sealed,
    context: {
      repository: env.GITHUB_REPOSITORY,
      sourceCommit: env.GITHUB_SHA,
      sourceTree: git("HEAD^{tree}"),
      headCommit,
      runId: env.GITHUB_RUN_ID,
      runAttempt: env.GITHUB_RUN_ATTEMPT,
      event: env.GITHUB_EVENT_NAME,
      generatedAt: new Date().toISOString(),
    },
  });
  console.log(
    "Portable release test evidence generated; no publication performed.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.env, process.argv.slice(2)).catch((error) => {
    console.error(
      /^RELEASE_EVIDENCE_[A-Z_]+$/.test(error?.message ?? "")
        ? error.message
        : "RELEASE_EVIDENCE_UNAVAILABLE",
    );
    process.exitCode = 1;
  });
}
