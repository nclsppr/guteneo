import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  discoverTests,
  requireJobs,
  requireTestResults,
} from "../../scripts/ci/verify-results.mjs";

const jobs = () =>
  Object.fromEntries(
    [
      "qualification",
      "dependencies",
      "pdf-validator",
      "scanner",
      "checks",
      "vitest",
      "security",
      "build",
      "browser",
      "distribution-e2e",
      "engineering",
    ].map((name) => [name, { result: "success" }]),
  );
const report = (names) => ({
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  numPassedTests: names.length,
  numTotalTests: names.length,
  testResults: names.map((name) => ({
    name: `/fixture/${name}`,
    status: "passed",
    assertionResults: [{ status: "passed" }],
  })),
});

test("the required gate refuses missing, failed, cancelled and skipped dependencies", () => {
  requireJobs(jobs());
  for (const name of Object.keys(jobs())) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const altered = jobs();
      altered[name].result = result;
      assert.throws(() => requireJobs(altered));
    }
    const missing = jobs();
    delete missing[name];
    assert.throws(() => requireJobs(missing));
  }
  assert.throws(() => requireJobs(null));
});

test("inventory automatically includes new nested tests without a fixed test count", async () => {
  const root = await mkdtemp(join(tmpdir(), "guteneo-ci-inventory-"));
  try {
    await mkdir(join(root, "tests/unit/new"), { recursive: true });
    await mkdir(join(root, "tests/integration"), { recursive: true });
    for (const path of [
      "tests/unit/old.test.ts",
      "tests/unit/new/added.test.ts",
      "tests/unit/helper.ts",
      "tests/integration/new.test.ts",
    ]) {
      await writeFile(join(root, path), "");
    }
    const files = await discoverTests(root);
    assert.deepEqual(files, [
      "tests/integration/new.test.ts",
      "tests/unit/new/added.test.ts",
      "tests/unit/old.test.ts",
    ]);
    assert.deepEqual(requireTestResults(report(files), files, "/fixture"), {
      files: 3,
      passed: 3,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a green partial/duplicate shard report cannot satisfy the complete gate", () => {
  const files = ["tests/unit/one.test.ts", "tests/integration/two.test.ts"];
  for (const actual of [
    files.slice(0, 1),
    [...files, files[0]],
    [files[0], "tests/unit/other.test.ts"],
  ]) {
    assert.throws(() => requireTestResults(report(actual), files, "/fixture"));
  }
  for (const state of ["failed", "pending", "todo", "skipped"]) {
    const altered = report(files);
    altered.testResults[0].assertionResults[0].status = state;
    assert.throws(() => requireTestResults(altered, files, "/fixture"));
  }
  const empty = report(files);
  empty.testResults[0].assertionResults = [];
  assert.throws(() => requireTestResults(empty, files, "/fixture"));
  const totals = report(files);
  totals.numTotalTests++;
  totals.numPassedTests++;
  assert.throws(() => requireTestResults(totals, files, "/fixture"));
});

test("actual Chromium integration tests run exactly once in the browser-equipped job", async () => {
  const root = new URL("../../", import.meta.url);
  const workflow = await readFile(
    new URL(".github/workflows/ci.yml", root),
    "utf8",
  );
  const shards = workflow.match(/^  vitest:\n([\s\S]*?)(?=^  [a-z])/m)?.[1];
  const security = workflow.match(/^  security:\n([\s\S]*?)(?=^  [a-z])/m)?.[1];
  assert.ok(shards);
  assert.ok(security);
  const excluded = [
    ...shards.matchAll(/--exclude=(tests\/\S+\.test\.ts)/g),
  ].map((match) => match[1]);
  const renderer = security
    .match(/npx vitest run ([^\n]+)/)?.[1]
    .trim()
    .split(/\s+/);
  assert.ok(renderer?.length);
  assert.deepEqual(
    [...excluded].sort(),
    [...renderer].sort(),
    "Every excluded file must retain one browser-equipped execution.",
  );
  assert.equal(new Set(renderer).size, renderer.length);
  const installation = security.indexOf(
    "npx playwright install --with-deps chromium",
  );
  assert.ok(
    installation >= 0 && installation < security.indexOf("npx vitest run"),
  );
  const files = await discoverTests(fileURLToPath(root));
  let actualRenderers = 0;
  for (const file of files.filter((file) =>
    file.startsWith("tests/integration/"),
  )) {
    const source = await readFile(new URL(file, root), "utf8");
    if (!/(?:chromium\.executablePath|puppeteer\.launch)\s*\(/u.test(source))
      continue;
    actualRenderers++;
    assert.ok(
      excluded.includes(file),
      `${file} needs the installed Chromium instead of an ordinary Vitest shard.`,
    );
    assert.equal(
      renderer.filter((entry) => entry === file).length,
      1,
      `${file} must execute once in the renderer job.`,
    );
  }
  assert.ok(actualRenderers > 0);
});

test("CI deduplication retains documentation guards and every Worker dry run", async () => {
  const root = new URL("../../", import.meta.url);
  const workflow = await readFile(
    new URL(".github/workflows/ci.yml", root),
    "utf8",
  );
  const checks = workflow.match(/^  checks:\n([\s\S]*?)(?=^  [a-z])/m)?.[1];
  const build = workflow.match(/^  build:\n([\s\S]*?)(?=^  [a-z])/m)?.[1];
  assert.ok(checks);
  assert.ok(build);
  const { scripts } = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );
  for (const guard of [
    "node docs/build-feature-map.mjs --check",
    "node scripts/build-mcp-annotation-docs.mjs --check",
  ])
    assert.ok(
      scripts["docs:check"].split(" && ").includes(guard),
      `${guard} must remain in the shared documentation check.`,
    );
  assert.equal((checks.match(/run: npm run docs:check/g) ?? []).length, 1);
  assert.doesNotMatch(
    checks,
    /run: node (?:docs\/build-feature-map|scripts\/build-mcp-annotation-docs)\.mjs --check/,
  );
  assert.equal((build.match(/run: npm run build:live/g) ?? []).length, 1);
  assert.doesNotMatch(build, /run: npm run build:web/);
  for (const dryRun of [
    "npx wrangler deploy --dry-run --outdir dist/worker",
    "npx wrangler deploy --config apps/documents/wrangler.jsonc --dry-run --outdir ../../dist/documents-worker",
    "npx wrangler deploy --config wrangler.live.jsonc --dry-run --outdir dist/live-worker",
    "npx wrangler deploy --config wrangler.status.jsonc --dry-run --outdir dist/status-worker",
  ]) {
    assert.ok(
      build.includes(`run: ${dryRun}`),
      `Required dry run retained: ${dryRun}`,
    );
    assert.ok(
      build.indexOf("run: npm run build:live") <
        build.indexOf(`run: ${dryRun}`),
    );
  }
  assert.ok(build.includes("run: npm run build:preview"));
  assert.ok(build.includes("run: npm run build:status"));
});

test("dependency preflight stops incompatible graphs before builds, renderers and browser matrices", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const section = (name) =>
    workflow.match(
      new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]|(?![\\s\\S]))`, "m"),
    )?.[1];
  const dependencies = section("dependencies");
  assert.ok(dependencies);
  const commands = [
    "run: npm ci",
    "run: npm run check:dependencies",
    "run: npm run audit:dependencies",
  ];
  let previous = -1;
  for (const command of commands) {
    const position = dependencies.indexOf(command);
    assert.ok(
      position > previous,
      `${command} must follow successful locked installation and compatibility checks.`,
    );
    previous = position;
  }
  assert.doesNotMatch(
    dependencies,
    /secrets\.|playwright install|deploy|build:live|vitest run/,
  );
  assert.match(dependencies, /persist-credentials: false/);
  for (const name of ["checks", "vitest", "security", "build", "engineering"])
    assert.match(section(name), /needs: \[dependencies, qualification\]/);
  for (const name of ["browser", "distribution-e2e"])
    assert.match(section(name), /needs: \[build, qualification\]/);
  for (const name of ["scanner", "pdf-validator"])
    assert.match(section(name), /needs: qualification/);
  assert.match(section("verify"), /if: always\(\)/);
  assert.match(section("verify"), /needs:[\s\S]*dependencies,/);
  assert.equal(
    (workflow.match(/run: npm run check:dependencies/g) ?? []).length,
    1,
  );
  assert.equal(
    (workflow.match(/run: npm run audit:dependencies/g) ?? []).length,
    1,
  );
});

test("main proof reuse preserves fresh audit, explicit scanner authority and a separate fail-closed gate", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const section = (name) =>
    workflow.match(
      new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]|(?![\\s\\S]))`, "m"),
    )?.[1];
  const qualification = section("qualification");
  assert.match(qualification, /actions: read/);
  assert.match(qualification, /pull-requests: read/);
  assert.doesNotMatch(
    qualification,
    /secrets\.|contents: write|actions: write|pull_request_target|run: npm/,
  );
  assert.match(
    qualification,
    /artifact-ids: \$\{\{ steps\.select\.outputs\.artifact_id \}\}/,
  );
  assert.match(qualification, /continue-on-error: true/);
  assert.match(qualification, /validation-proof\.mjs qualify/);
  assert.doesNotMatch(section("dependencies"), /^    if:|needs:/m);
  for (const name of [
    "pdf-validator",
    "checks",
    "vitest",
    "security",
    "build",
    "browser",
    "distribution-e2e",
    "engineering",
  ])
    assert.match(
      section(name),
      /if: needs\.qualification\.outputs\.reused != 'true'/,
    );
  assert.match(
    section("scanner"),
    /Reuse the scanner suite from the qualified complete PR run/,
  );
  assert.match(
    section("scanner"),
    /npm --prefix apps\/scanner test\n        if: needs\.qualification\.outputs\.reused != 'true'/,
  );
  assert.match(
    section("verify"),
    /if: always\(\) && needs\.qualification\.outputs\.reused == 'true'/,
  );
  assert.match(section("verify"), /validation-proof\.mjs verify-reused/);
  assert.match(
    section("verify"),
    /github\.event_name == 'pull_request' && needs\.qualification\.outputs\.reused != 'true'/,
  );
  assert.doesNotMatch(workflow, /pattern: ci-validation-proof/);
});
