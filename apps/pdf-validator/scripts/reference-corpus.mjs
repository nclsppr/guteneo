import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RULE_COUNTS = {
  ua1: 106,
  ua2: 1727,
  "1b": 129,
  "2b": 144,
  "3b": 146,
  4: 109,
};
export const ENGINE = { name: "veraPDF", version: "1.30.2" };
const directory = new URL("../tests/references/", import.meta.url);

export function loadReferenceCorpus() {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", directory), "utf8"),
  );
  assert.equal(manifest.version, 1);
  const seen = new Set();
  const coverage = new Set();
  const fixtures = manifest.fixtures.map((fixture) => {
    assert.match(fixture.id, /^verapdf-(?:ua1|ua2|1b|2b|3b|4)-(?:pass|fail)$/);
    assert.match(fixture.file, /^(?:ua1|ua2|1b|2b|3b|4)-(?:pass|fail)\.pdf$/);
    assert.equal(seen.has(fixture.id), false);
    seen.add(fixture.id);
    assert.match(fixture.source.commit, /^[a-f0-9]{40}$/);
    assert.equal(fixture.source.repository, "veraPDF/veraPDF-corpus");
    assert.equal(
      fixture.source.url,
      `https://raw.githubusercontent.com/veraPDF/veraPDF-corpus/${fixture.source.commit}/${fixture.source.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    assert.equal(fixture.license.spdx, "CC-BY-4.0");
    assert.ok(fixture.license.attribution.length > 20);
    const bytes = readFileSync(new URL(fixture.file, directory));
    assert.ok(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      fixture.sha256,
    );
    for (const expected of fixture.profiles) {
      assert.ok(Object.hasOwn(RULE_COUNTS, expected.profile));
      assert.equal(typeof expected.compliant, "boolean");
      assert.equal(
        expected.passedRules + expected.failedRules,
        RULE_COUNTS[expected.profile],
      );
      assert.equal(
        expected.compliant,
        expected.failedRules === 0 && expected.failedChecks === 0,
      );
      coverage.add(`${expected.profile}:${expected.compliant}`);
    }
    return { ...fixture, bytes };
  });
  for (const profile of Object.keys(RULE_COUNTS))
    for (const compliant of [false, true])
      assert.ok(
        coverage.has(`${profile}:${compliant}`),
        `Missing real reference ${profile}/${compliant}`,
      );
  return fixtures;
}

export function assertReferenceResult(result, fixture, expected) {
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "sha256",
      "profile",
      "engine",
      "compliant",
      "passedRules",
      "failedRules",
      "failedChecks",
      "truncated",
      "findings",
    ].sort(),
  );
  assert.equal(result.sha256, fixture.sha256);
  assert.equal(result.profile, expected.profile);
  assert.deepEqual(result.engine, ENGINE);
  for (const key of ["compliant", "passedRules", "failedRules", "failedChecks"])
    assert.deepEqual(result[key], expected[key], `${fixture.id}/${key}`);
  assert.equal(result.truncated, false);
  const ordered = (findings) =>
    findings.toSorted(
      (left, right) =>
        left.specification.localeCompare(right.specification) ||
        left.clause.localeCompare(right.clause) ||
        left.testNumber - right.testNumber,
    );
  assert.deepEqual(
    ordered(result.findings),
    ordered(expected.findings),
    `${fixture.id}/findings`,
  );
}

export function loadBenchmarkCorpus() {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../tests/benchmark-fixtures/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.version, 1);
  assert.equal(manifest.fixtures.length, 1);
  const fixture = manifest.fixtures[0];
  const source = new URL("generate-benchmark-pdf.py", import.meta.url);
  // Import the deterministic stdlib generator; keep the 10 MiB PDF out of Git.
  const generated = spawnSync(
    "python3",
    [
      "-B",
      "-c",
      "import importlib.util,sys; s=importlib.util.spec_from_file_location('benchmark',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); sys.stdout.buffer.write(m.generate_pdf())",
      fileURLToPath(source),
    ],
    { maxBuffer: 11 * 1024 * 1024, timeout: 15000 },
  );
  assert.equal(
    generated.status,
    0,
    "Deterministic synthetic benchmark generation failed",
  );
  const bytes = generated.stdout;
  assert.equal(bytes.length, fixture.sizeBytes);
  assert.ok(
    bytes.length >= 9.5 * 1024 * 1024 && bytes.length <= 10 * 1024 * 1024,
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    fixture.sha256,
  );
  assert.equal(fixture.pageCount, 100);
  assert.equal(fixture.profiles.length, 6);
  return [{ ...fixture, bytes }];
}
