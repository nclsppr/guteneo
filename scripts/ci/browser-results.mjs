import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const browserShardCount = 3;
export const browserProjects = [
  { project: "chromium", browsers: "chromium", preview: "desktop" },
  { project: "mobile-chromium", browsers: "chromium", preview: "" },
  { project: "iphone-webkit", browsers: "chromium webkit", preview: "iphone" },
];
const configs = {
  application: "playwright.config.ts",
  preview: "playwright.preview.config.ts",
  belvedere: "playwright.belvedere.config.ts",
  status: "playwright.status.config.ts",
};

export function browserMatrix() {
  return {
    include: browserProjects.flatMap((project) =>
      Array.from({ length: browserShardCount }, (_, index) => ({
        ...project,
        shardIndex: index + 1,
        shardTotal: browserShardCount,
      })),
    ),
  };
}

export function rowSuites(row) {
  const shard = { current: row.shardIndex, total: row.shardTotal };
  return [
    { suite: "application", project: row.project, shard },
    ...(row.preview ? [{ suite: "preview", project: row.preview, shard }] : []),
    ...(row.preview && row.shardIndex === 1
      ? [{ suite: "belvedere", project: row.preview, shard: null }]
      : []),
    ...(row.project === "chromium" && row.shardIndex === 1
      ? [{ suite: "status", project: "chromium", shard: null }]
      : []),
  ];
}

export function suitePlans() {
  const plans = new Map();
  for (const row of browserMatrix().include)
    for (const plan of rowSuites(row))
      plans.set(`${plan.suite}/${plan.project}`, {
        suite: plan.suite,
        project: plan.project,
        config: configs[plan.suite],
      });
  return [...plans.values()];
}

// These existing runtime skips select the viewport that owns the assertion.
// A new skip needs an explicit reviewed entry; a skip annotation alone is not a waiver.
const mobileProjects = ["mobile-chromium", "iphone-webkit"];
export const declaredBrowserSkips = [
  [
    "application",
    mobileProjects,
    "template-data.spec.ts",
    "API gallery template remains editable in the desktop studio and reusable by API",
    "Graphical editing is qualified on desktop; mobile consultation has its own scenario.",
  ],
  [
    "application",
    mobileProjects,
    "template-settings.spec.ts",
    "web table column creates an optional money field and renders missing values blank",
    "Graphical template settings are qualified on desktop.",
  ],
  [
    "application",
    mobileProjects,
    "template-advanced-settings.spec.ts",
    "business rules edited in the studio persist and govern real PDF totals, defaults and visibility",
    "Graphical template settings are qualified on desktop.",
  ],
  [
    "application",
    mobileProjects,
    "template-word.spec.ts",
    "Word import exposes conversion warnings, supports native visual editing and renders an actual PDF",
    "Native graphical editing is qualified on desktop.",
  ],
  [
    "application",
    mobileProjects,
    "template-images.spec.ts",
    "the image tool inserts a movable logo, saves original bytes and renders it into a PDF",
    "Native visual editing is qualified on desktop; the image importer remains available on mobile.",
  ],
  [
    "application",
    mobileProjects,
    "dashboard-v2.spec.ts",
    "V2 keeps every destination in view and in place on common desktop screens",
    "Desktop sidebar geometry; phones use the collapsed navigation.",
  ],
  [
    "application",
    ["chromium"],
    "mobile-account.spec.ts",
    "mobile private account links errors to fields and keeps every session and member action visible",
    "Mobile account layout with intercepted API fixtures",
  ],
  [
    "application",
    ["chromium"],
    "mobile-account.spec.ts",
    "mobile billing preserves dates, references and all amounts while top-up remains disabled",
    "Mobile billing layout with intercepted API fixtures",
  ],
  [
    "application",
    ["chromium"],
    "mobile-ses-errors.spec.ts",
    "mobile email refusals explain capacity and provider restrictions while uncertainty forbids a duplicate",
    "Mobile status copy with local API fixtures",
  ],
  [
    "preview",
    ["desktop"],
    "homepage-film.spec.ts",
    "a phone opened in landscape still receives the portrait movie and poster",
    "Requires a touch phone profile",
  ],
  [
    "preview",
    ["desktop"],
    "mobile-workspace.spec.ts",
    "mobile navigation preserves restored summary focus after deferred route frames",
    "iPhone WebKit keyboard and route-focus ordering coverage",
  ],
  [
    "preview",
    ["desktop"],
    "mobile-workspace.spec.ts",
    "mobile tables retain all fields without horizontal scrolling at 320px and in landscape",
    "iPhone WebKit reflow coverage",
  ],
  [
    "preview",
    ["desktop"],
    "mobile-workspace.spec.ts",
    "mobile PDF selection, download control and close retain their focus and page bounds",
    "iPhone WebKit PDF interaction coverage",
  ],
  [
    "preview",
    ["desktop"],
    "mobile-workspace.spec.ts",
    "mobile forms expose native validation, review and errors without a provider request",
    "iPhone WebKit form interaction coverage",
  ],
].map(([suite, projects, file, title, reason]) => ({
  suite,
  projects,
  file,
  title,
  reason,
}));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rowKey = (row) => `${row.project}/${row.shardIndex}`;
const suiteKey = (plan) => `${plan.suite}/${plan.project}`;
const entryKey = (entry) => JSON.stringify([entry.project, entry.id]);
export function reportEntries(report) {
  requireCondition(
    Array.isArray(report?.suites),
    "Browser report has no suite inventory.",
  );
  const entries = [];
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        requireCondition(
          typeof spec.id === "string" && spec.id.length > 0,
          "Browser test has no stable ID.",
        );
        for (const test of spec.tests ?? [])
          entries.push({
            id: spec.id,
            project: test.projectName,
            file: spec.file,
            title: spec.title,
            ok: spec.ok,
            test,
          });
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  return entries;
}

function plannedSkip(plan, entry) {
  return declaredBrowserSkips.find(
    (skip) =>
      skip.suite === plan.suite &&
      skip.projects.includes(plan.project) &&
      skip.file === entry.file &&
      skip.title === entry.title,
  );
}

function requireExecutedReport(report, plan) {
  requireCondition(
    report.errors?.length === 0,
    "Browser report contains a runner error.",
  );
  const shard = report.config?.shard ?? null;
  requireCondition(
    plan.shard === null
      ? shard === null
      : shard?.current === plan.shard.current &&
          shard?.total === plan.shard.total &&
          Object.keys(shard).length === 2,
    "Browser report belongs to a different shard.",
  );
  const entries = reportEntries(report);
  requireCondition(entries.length > 0, "Browser shard executed no tests.");
  let passed = 0,
    skipped = 0;
  for (const entry of entries) {
    requireCondition(
      entry.project === plan.project,
      "Browser report contains an unexpected project.",
    );
    const test = entry.test;
    requireCondition(
      entry.ok === true && test.results?.length === 1,
      "Every browser test needs one expected result without retries.",
    );
    const result = test.results[0];
    requireCondition(
      (result.retry ?? 0) === 0 && result.errors?.length === 0,
      "Browser retries and result errors cannot satisfy the gate.",
    );
    const skip = plannedSkip(plan, entry);
    const annotations = test.annotations ?? [];
    if (skip) {
      requireCondition(
        test.status === "skipped" &&
          test.expectedStatus === "skipped" &&
          result.status === "skipped" &&
          annotations.some(
            (annotation) =>
              annotation.type === "skip" &&
              annotation.description === skip.reason,
          ),
        "Only the exact declared viewport skip is allowed.",
      );
      skipped += 1;
    } else {
      requireCondition(
        test.status === "expected" &&
          test.expectedStatus === "passed" &&
          result.status === "passed" &&
          !annotations.some((annotation) =>
            ["skip", "fixme"].includes(annotation.type),
          ),
        "Unexpected browser skips, failures or interruptions cannot satisfy the gate.",
      );
      passed += 1;
    }
  }
  requireCondition(
    report.stats?.expected === passed &&
      report.stats?.skipped === skipped &&
      report.stats?.unexpected === 0 &&
      report.stats?.flaky === 0,
    "Browser report totals disagree with its results.",
  );
  return { entries, passed, skipped };
}

export function requireBrowserResults(inventories, rows, identity) {
  const expectedRows = browserMatrix().include;
  requireCondition(
    rows.length === expectedRows.length &&
      new Set(rows.map(rowKey)).size === rows.length,
    "Browser evidence has missing or duplicate project/shard rows.",
  );
  const actualBySuite = new Map();
  let passed = 0,
    skipped = 0;
  for (const row of rows) {
    const expected = expectedRows.find((item) => rowKey(item) === rowKey(row));
    requireCondition(
      expected &&
        row.schema === 1 &&
        row.shardTotal === browserShardCount &&
        row.revision === identity.revision &&
        row.runId === identity.runId &&
        /^[1-9]\d*$/.test(row.runAttempt ?? "") &&
        Number(row.runAttempt) <= Number(identity.runAttempt),
      "Browser evidence is not from every exact current-run shard.",
    );
    const plans = rowSuites(expected);
    requireCondition(
      Object.keys(row.reports).sort().join() ===
        plans
          .map((plan) => plan.suite)
          .sort()
          .join(),
      "Browser row has missing or unexpected suite reports.",
    );
    for (const plan of plans) {
      const result = requireExecutedReport(row.reports[plan.suite], plan);
      const key = suiteKey(plan);
      const actual = actualBySuite.get(key) ?? [];
      actual.push(...result.entries);
      actualBySuite.set(key, actual);
      passed += result.passed;
      skipped += result.skipped;
    }
  }
  const plans = suitePlans();
  requireCondition(
    Object.keys(inventories).sort().join() ===
      plans.map(suiteKey).sort().join(),
    "Independent browser inventories are incomplete.",
  );
  let discovered = 0;
  for (const plan of plans) {
    const inventory = inventories[suiteKey(plan)];
    requireCondition(
      inventory.errors?.length === 0 && inventory.config?.shard == null,
      "Expected browser inventory must be an independent unsharded list.",
    );
    const expected = reportEntries(inventory);
    requireCondition(
      expected.length > 0 &&
        expected.every((entry) => entry.project === plan.project),
      "Independent browser inventory has an unexpected project.",
    );
    const actual = actualBySuite.get(suiteKey(plan)) ?? [];
    const wanted = expected.map(entryKey).sort(),
      found = actual.map(entryKey).sort();
    requireCondition(
      new Set(wanted).size === wanted.length &&
        new Set(found).size === found.length &&
        JSON.stringify(wanted) === JSON.stringify(found),
      "Browser shards have missing, duplicated or unexpected test IDs.",
    );
    for (const skip of declaredBrowserSkips.filter(
      (skip) =>
        skip.suite === plan.suite && skip.projects.includes(plan.project),
    ))
      requireCondition(
        expected.some(
          (entry) => entry.file === skip.file && entry.title === skip.title,
        ),
        "A declared browser skip no longer matches the discovered test inventory.",
      );
    discovered += expected.length;
  }
  return {
    rows: rows.length,
    suites: plans.length,
    discovered,
    passed,
    declaredSkipped: skipped,
    evidenceAttempts: [...new Set(rows.map((row) => row.runAttempt))].sort(),
  };
}

function ciIdentity() {
  const identity = {
    revision: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  requireCondition(
    /^[a-f0-9]{40}$/.test(identity.revision ?? "") &&
      /^\d+$/.test(identity.runId ?? "") &&
      /^\d+$/.test(identity.runAttempt ?? ""),
    "Exact GitHub run identity is required for browser evidence.",
  );
  return identity;
}

async function recordRow(root, project, shardIndex) {
  const row = browserMatrix().include.find(
    (item) => item.project === project && item.shardIndex === shardIndex,
  );
  requireCondition(row, "Unknown browser project/shard.");
  const directory = join(
    root,
    "test-results/ci/browser",
    project,
    `shard-${shardIndex}`,
  );
  await mkdir(directory, { recursive: true });
  const reports = {};
  for (const plan of rowSuites(row)) {
    const bytes = await readFile(join(directory, `${plan.suite}.json`)).catch(
      () => null,
    );
    reports[plan.suite] = bytes ? digest(bytes) : null;
  }
  await writeFile(
    join(directory, "browser-row.json"),
    JSON.stringify({ schema: 1, ...row, ...ciIdentity(), reports }, null, 2) +
      "\n",
  );
  requireCondition(
    Object.values(reports).every(Boolean),
    "Browser shard did not produce every required report.",
  );
}

export async function verifyBrowserEvidence(root, evidenceDirectory) {
  const identity = ciIdentity();
  const inventories = {},
    rows = [];
  const inventoryDirectory = join(root, "test-results/ci/browser-inventories");
  await mkdir(inventoryDirectory, { recursive: true });
  for (const plan of suitePlans()) {
    const output = join(
      inventoryDirectory,
      `${plan.suite}-${plan.project}.json`,
    );
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        plan.config,
        "--project",
        plan.project,
        "--list",
        "--reporter=json",
      ],
      {
        cwd: root,
        timeout: 60000,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: output },
      },
    );
    inventories[suiteKey(plan)] = JSON.parse(await readFile(output, "utf8"));
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === "browser-row.json") {
        const row = JSON.parse(await readFile(path, "utf8"));
        const reports = {};
        requireCondition(
          row.reports && typeof row.reports === "object",
          "Browser row has no report digests.",
        );
        for (const [suite, sha256] of Object.entries(row.reports)) {
          requireCondition(
            Object.hasOwn(configs, suite) && typeof sha256 === "string",
            "Browser row has an absent or unexpected report.",
          );
          const bytes = await readFile(join(dirname(path), `${suite}.json`));
          requireCondition(
            digest(bytes) === sha256,
            "Browser evidence report digest differs.",
          );
          reports[suite] = JSON.parse(bytes);
        }
        rows.push({ ...row, reports });
      }
    }
  }
  await visit(evidenceDirectory);
  const proof = requireBrowserResults(inventories, rows, identity);
  await writeFile(
    join(root, "test-results/ci/browser-verified.json"),
    JSON.stringify({ ...identity, ...proof }, null, 2) + "\n",
  );
  return proof;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, project, shard] = process.argv.slice(2);
  if (command === "matrix")
    console.log(`matrix=${JSON.stringify(browserMatrix())}`);
  else if (command === "record")
    await recordRow(process.cwd(), project, Number(shard));
  else throw new Error("Expected browser matrix or record command.");
}
