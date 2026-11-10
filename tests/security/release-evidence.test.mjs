import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  renderReleaseEvidence,
  writeReleaseEvidence,
} from "../../scripts/ci/release-evidence.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const notes = `# Guteneo 1.2.0

This synthetic release fixture describes visible improvements in ordinary language.

## What changed

- A clear outcome remains available after leaving its original view.
- Browser state follows the current account and selected language.

## Validation

The report below preserves actual counts and separates CI fixtures from production.
`;
const context = {
  repository: "nclsppr/guteneo",
  sourceCommit: "a".repeat(40),
  sourceTree: "b".repeat(40),
  headCommit: "c".repeat(40),
  runId: "123",
  runAttempt: "2",
  event: "pull_request",
  generatedAt: "2026-11-10T12:00:00.000Z",
};
const verification = {
  files: 200,
  passed: 4000,
  browser: {
    rows: 9,
    suites: 8,
    discovered: 1000,
    passed: 976,
    declaredSkipped: 24,
    evidenceAttempts: ["1", "2"],
  },
};
function fixture(overrides = {}) {
  return {
    version: "1.2.0",
    notes,
    context: structuredClone(context),
    verification: structuredClone(verification),
    ...overrides,
  };
}
function reuse() {
  const counts = structuredClone(verification);
  counts.browser.evidenceAttempts = ["1"];
  const evidenceText = JSON.stringify(counts);
  const report = {
    schema: 1,
    reused: true,
    full: false,
    sourceCommit: context.sourceCommit,
    tree: context.sourceTree,
    priorRunId: 100,
    priorRunAttempt: 1,
    artifactId: 99,
    artifactDigest: `sha256:${"d".repeat(64)}`,
    evidenceSha256: hash(evidenceText),
    counts,
    toolchain: { node: "v24.13.0" },
  };
  const sealed = {
    schema: 1,
    selection: {
      candidate: true,
      main: {
        sha: context.sourceCommit,
        tree: context.sourceTree,
        runId: 123,
        runAttempt: 2,
      },
      candidateRun: { runId: 100, runAttempt: 1 },
      artifact: { id: 99, digest: report.artifactDigest },
    },
    proof: {
      repository: context.repository,
      reusable: true,
      run: { id: 100, attempt: 1 },
      tested: { commit: "e".repeat(40), tree: context.sourceTree },
      evidence: { sha256: report.evidenceSha256, summary: counts },
    },
    evidenceText,
  };
  return fixture({
    verification: report,
    sealed,
    context: { ...context, event: "push" },
  });
}

test("portable full evidence preserves every verified count and actual attempt without claiming deployment", () => {
  const input = fixture();
  const before = structuredClone(input);
  const { html, proof } = renderReleaseEvidence(input);
  assert.deepEqual(input, before);
  assert.deepEqual(proof.counts, verification);
  assert.equal(proof.ci.mode, "full");
  assert.equal(proof.source.commit, context.sourceCommit);
  assert.equal(proof.source.headCommit, context.headCommit);
  assert.equal(proof.notesSha256, hash(notes));
  assert.match(html, /Browser evidence retains its actual attempts: 1, 2/);
  assert.match(html, /4,000/);
  assert.match(html, /Reviewed browser skips/);
  assert.match(html, /does not establish a deployed version/);
  assert.doesNotMatch(html, /<script|<iframe|<link\b|src="https?:/i);
  assert.match(html, /default-src 'none'/);
});

test("reused evidence distinguishes the prior tested SHA from current main and retains its immutable proof", () => {
  const { html, proof } = renderReleaseEvidence(reuse());
  assert.equal(proof.ci.mode, "reused");
  assert.equal(proof.source.commit, context.sourceCommit);
  assert.equal(proof.prior.testedCommit, "e".repeat(40));
  assert.equal(proof.prior.testedTree, context.sourceTree);
  assert.equal(proof.prior.artifactId, 99);
  assert.equal(proof.prior.artifactDigest, `sha256:${"d".repeat(64)}`);
  assert.deepEqual(proof.counts.browser.evidenceAttempts, ["1"]);
  assert.match(html, /These tests were not rerun on main/);
  assert.match(html, /actions\/runs\/100\/attempts\/1/);
});

test("the renderer refuses missing rows, inconsistent counters, unknown fields and future attempts", () => {
  for (const mutate of [
    (f) => delete f.verification.files,
    (f) => (f.verification.passed = 0),
    (f) => (f.verification.browser.rows = 8),
    (f) => (f.verification.browser.suites = 7),
    (f) => (f.verification.browser.discovered += 1),
    (f) => (f.verification.browser.declaredSkipped = -1),
    (f) => (f.verification.browser.evidenceAttempts = ["1", "1"]),
    (f) => (f.verification.browser.evidenceAttempts = ["3"]),
    (f) => (f.verification.browser.evidenceAttempts = ["9007199254740992"]),
    (f) =>
      (f.verification.privateResponse = "SECRET_RESPONSE_MUST_NOT_BE_RENDERED"),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(
      () => renderReleaseEvidence(f),
      /RELEASE_EVIDENCE_COUNTS_INVALID/,
    );
  }
});

test("reused source, run, digest and attempt disagreements cannot become portable evidence", () => {
  for (const mutate of [
    (f) => (f.verification.sourceCommit = "f".repeat(40)),
    (f) => (f.verification.tree = "f".repeat(40)),
    (f) => (f.verification.priorRunId += 1),
    (f) => (f.verification.artifactDigest = `sha256:${"f".repeat(64)}`),
    (f) => (f.sealed.proof.tested.tree = "f".repeat(40)),
    (f) => (f.sealed.proof.tested.commit = "not-a-sha"),
    (f) => (f.sealed.selection.main.runAttempt += 1),
    (f) => (f.sealed.evidenceText += " "),
    (f) => (f.sealed = null),
  ]) {
    const f = reuse();
    mutate(f);
    assert.throws(() => renderReleaseEvidence(f), /RELEASE_EVIDENCE_REUSE_/);
  }
  const f = reuse();
  f.verification.priorRunAttempt = 2;
  f.verification.counts.browser.evidenceAttempts = ["1", "2"];
  f.sealed.selection.candidateRun.runAttempt = 2;
  f.sealed.proof.run.attempt = 2;
  f.sealed.evidenceText = JSON.stringify(f.verification.counts);
  f.sealed.proof.evidence.sha256 = f.verification.evidenceSha256 = hash(
    f.sealed.evidenceText,
  );
  assert.throws(() => renderReleaseEvidence(f), /REUSE_MIXED_ATTEMPTS/);
});

test("future versions need authored matching notes with an actual section", () => {
  for (const version of [["1.2.0"], 1.2, { version: "1.2.0" }, " 1.2.0"])
    assert.throws(
      () => renderReleaseEvidence(fixture({ version })),
      /CONTEXT_INVALID/,
    );
  for (const notes of [
    "",
    "# Guteneo 1.1.34\n" + "Earlier release. ".repeat(15),
    "# Guteneo 1.2.0\n" + "No sections. ".repeat(15),
  ])
    assert.throws(
      () => renderReleaseEvidence(fixture({ notes })),
      /RELEASE_EVIDENCE_NOTES_/,
    );
  assert.throws(
    () => renderReleaseEvidence(fixture({ version: "1.2.1" })),
    /NOTES_VERSION_MISMATCH/,
  );
});

test("only bounded fixed-origin identity and credential-free documentation links are accepted", () => {
  for (const mutate of [
    (f) => (f.context.repository = "another/repository"),
    (f) => (f.context.sourceCommit = "bad"),
    (f) => (f.context.sourceTree = "bad"),
    (f) => (f.context.headCommit = "bad"),
    (f) => (f.context.runId = "123/path"),
    (f) => (f.context.runAttempt = "0"),
    (f) => (f.context.event = "workflow_dispatch"),
    (f) => (f.context.generatedAt = "invalid"),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => renderReleaseEvidence(f), /CONTEXT_INVALID/);
  }
  for (const url of [
    "javascript:alert(1)",
    "https://attacker.invalid/x",
    "https://github.com/another/repo",
    "https://user:password@guteneo.com/",
    "https://guteneo.com/?token=SECRET",
  ])
    assert.throws(
      () =>
        renderReleaseEvidence(fixture({ notes: notes + `\n[Unsafe](${url})` })),
      /NOTES_LINK_INVALID/,
    );
  const { html } = renderReleaseEvidence(
    fixture({
      notes:
        notes +
        "\n[Source](https://github.com/nclsppr/guteneo/blob/main/docs/CI.md) and **readable** `code`.\n\n<script>SECRET</script>",
    }),
  );
  assert.match(html, /<strong>readable<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /&lt;script&gt;SECRET&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XQAAAAASUVORK5CYII=",
  "base64",
);
const imageNotes =
  notes + "\n![Synthetic screenshot](../evidence/fixture.png)\n";
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "guteneo-release-evidence-"));
  await mkdir(join(root, "docs/releases"), { recursive: true });
  await mkdir(join(root, "docs/evidence"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "1.2.0" }),
  );
  await writeFile(join(root, "docs/releases/1.2.0.md"), imageNotes);
  await writeFile(join(root, "docs/evidence/fixture.png"), pixel);
  await writeFile(join(root, "verified.json"), JSON.stringify(verification));
  return root;
}

test("file generation embeds bounded local PNG bytes and produces exactly two portable files", async () => {
  const root = await workspace();
  try {
    const result = await writeReleaseEvidence({
      root,
      verificationPath: "verified.json",
      outputPath: "test-results/proof",
      context,
    });
    assert.equal(result.proof.images[0].sha256, hash(pixel));
    assert.equal(result.proof.images[0].path, "docs/evidence/fixture.png");
    assert.equal(result.proof.images[0].bytes, pixel.length);
    assert.match(result.html, /src="data:image\/png;base64,/);
    assert.match(
      result.html,
      /Repository illustration; separate from the CI inventory/,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(join(root, "test-results/proof/test-proof.json")),
      ),
      result.proof,
    );
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "verified.json",
        outputPath: "test-results/proof",
        context,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("image and output paths reject escape, symlinks, unsupported files and oversized data", async () => {
  const root = await workspace();
  try {
    for (const target of [
      "../../package.json",
      "https://guteneo.com/picture.png",
      "/tmp/picture.png",
      "../evidence/fixture.svg",
      "../evidence/%66ixture.png",
    ]) {
      await writeFile(
        join(root, "docs/releases/1.2.0.md"),
        notes + `\n![Bad image](${target})\n`,
      );
      await assert.rejects(
        writeReleaseEvidence({
          root,
          verificationPath: "verified.json",
          outputPath: "test-results/proof",
          context,
        }),
        /IMAGE_PATH_INVALID/,
      );
    }
    await writeFile(join(root, "docs/releases/1.2.0.md"), imageNotes);
    await rm(join(root, "docs/evidence/fixture.png"));
    await symlink(
      join(root, "package.json"),
      join(root, "docs/evidence/fixture.png"),
    );
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "verified.json",
        outputPath: "test-results/proof",
        context,
      }),
      /FILE_INVALID/,
    );
    await rm(join(root, "docs/evidence/fixture.png"));
    await writeFile(
      join(root, "docs/evidence/fixture.png"),
      Buffer.alloc(2097153),
    );
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "verified.json",
        outputPath: "test-results/proof",
        context,
      }),
      /FILE_INVALID/,
    );
    await writeFile(join(root, "docs/evidence/fixture.png"), pixel);
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "../verified.json",
        outputPath: "test-results/proof",
        context,
      }),
      /PATH_INVALID/,
    );
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "verified.json",
        outputPath: "dist/proof",
        context,
      }),
      /OUTPUT_PATH_INVALID/,
    );
    await mkdir(join(root, "test-results"));
    await symlink(join(root, "docs"), join(root, "test-results/escape"));
    await assert.rejects(
      writeReleaseEvidence({
        root,
        verificationPath: "verified.json",
        outputPath: "test-results/escape/proof",
        context,
      }),
      /OUTPUT_PATH_INVALID/,
    );
    await assert.rejects(readFile(join(root, "docs/proof/test-proof.html")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the portable report loads offline at desktop and phone widths with embedded images, no requests or overflow", async () => {
  const root = await workspace();
  let browser;
  try {
    const { html } = await writeReleaseEvidence({
      root,
      verificationPath: "verified.json",
      outputPath: "test-results/proof",
      context,
    });
    browser = await chromium.launch();
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.context().setOffline(true);
    await page.setContent(html);
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page
          .getByRole("heading", { name: "1.2.0 Test evidence" })
          .count(),
        1,
      );
      assert.equal(
        await page
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth === 1),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("link", { name: "Release notes", exact: true })
        .evaluate((link) => link === document.activeElement),
      true,
    );
    assert.deepEqual(requests, []);
  } finally {
    await browser?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("CI renders on full and reused paths without extra npm installation and retains the downloadable files", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const step = workflow.match(
    /- name: Render portable test evidence[^]*?(?=\n      - uses:)/,
  )?.[0];
  assert.ok(step);
  assert.match(step, /if: success\(\)/);
  assert.doesNotMatch(step, /reused !=/);
  assert.match(
    step,
    /REUSE_PROOF_B64: \$\{\{ needs\.qualification\.outputs\.proof_b64 \}\}/,
  );
  assert.match(workflow, /\/docs\/releases\//);
  assert.match(workflow, /\/docs\/evidence\/\*\.png/);
  assert.match(workflow, /test-results\/ci\/release-evidence\//);
  assert.ok(
    workflow.indexOf("node scripts/ci/release-evidence.mjs") >
      workflow.indexOf("node scripts/ci/verify-results.mjs"),
  );
});
