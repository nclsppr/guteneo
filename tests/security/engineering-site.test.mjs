import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  validateEngineeringConfig,
  readEngineeringConfig,
  engineeringManifest,
} from "../../scripts/engineering-release.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
test("downloadable Mermaid sources cannot disclose private filesystem paths", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "engineering-publication-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of [
    "index.html", "404.html", "features/index.html",
    "features/permissions/index.html", "features/journeys/index.html",
    "llms.txt", "llms-full.txt", "_headers",
  ]) {
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "Synthetic public fixture");
  }
  await mkdir(join(directory, "illustrations"));
  const source = join(directory, "illustrations/example.mmd");
  await writeFile(source, 'flowchart LR\n A["Public record"]');
  await assert.doesNotReject(() => engineeringManifest(directory));
  await writeFile(source, 'flowchart LR\n A["/Users/synthetic/private-source"]');
  await assert.rejects(
    () => engineeringManifest(directory),
    /Private source or secret material.*illustrations\/example\.mmd/,
  );
});
test("engineering publication rejects business bindings and alternate origins", async () => {
  const config = await readEngineeringConfig(
    new URL("apps/engineering/wrangler.jsonc", root),
  );
  assert.doesNotThrow(() => validateEngineeringConfig(config));
  for (const injection of [
    { main: "worker.ts" },
    { d1_databases: [] },
    { services: [] },
    { r2_buckets: [] },
    { vars: {} },
    { env: {} },
    { workers_dev: true },
  ])
    assert.throws(() => validateEngineeringConfig({ ...config, ...injection }));
  assert.throws(() =>
    validateEngineeringConfig({
      ...config,
      routes: [{ pattern: "guteneo.com", custom_domain: true }],
    }),
  );
});
test("every feature has a public domain page without publishing raw repository references", async () => {
  const data = JSON.parse(await read("docs/feature-map.json"));
  const directory = "apps/engineering/src/content/docs/features/";
  assert.equal(
    (await readdir(new URL(directory, root))).length,
    data.groups.length + 3,
  );
  for (const group of data.groups) {
    const page = await read(`${directory}${group.id}.md`);
    assert.equal(
      (page.match(/<li id="feature-/g) ?? []).length,
      group.features.length,
    );
    assert.ok(
      !page.includes(group.source),
      `${group.id} must not publish source references`,
    );
    for (const evidence of group.tests) assert.ok(!page.includes(evidence));
    assert.match(page, /Access boundary/);
  }
});
test("authored pages do not embed restricted runbooks or raw feature inventory", async () => {
  const config = await read("apps/engineering/astro.config.ts");
  assert.match(config, /output: "static"/);
  const files = await readdir(new URL("apps/engineering/public/", root), {
    recursive: true,
  });
  assert.ok(
    files.every(
      (file) =>
        !/FEATURE_MAP|feature-map\.json|RUNBOOK|TEST_RESULTS|\.env|\.pem/.test(
          file,
        ),
    ),
  );
});
