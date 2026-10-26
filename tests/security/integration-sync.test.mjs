import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { packageFiles } from "../../integrations/package-files.mjs";
import {
  syncFile,
  syncIntegrationPackage,
  validateIntegrationSync,
} from "../../integrations/sync.mjs";

const manifests = [
  "package.json",
  "integrations/guteneo/plugin.json",
  "integrations/guteneo/.claude-plugin/plugin.json",
  "integrations/guteneo/.cursor-plugin/plugin.json",
  "integrations/claude/plugins/guteneo/.claude-plugin/plugin.json",
];

async function put(root, file, value) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

async function version(root, value) {
  for (const file of manifests)
    await put(root, file, JSON.stringify({ version: value }));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "guteneo-integration-sync-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await put(
    root,
    "apps/api/src/mcp.ts",
    'import { schema } from "../../../packages/contracts/src/mcp-input";\n',
  );
  await put(
    root,
    "packages/contracts/src/mcp-input.ts",
    'export const schema = "original";\n',
  );
  for (const file of packageFiles.filter(
    (file) => file !== "mcp-contract.json",
  ))
    await put(root, `integrations/guteneo/${file}`, `fixture ${file}\n`);
  await version(root, "0.3.4");
  return root;
}

test("the committed package synchronization record matches source", async () => {
  const state = await validateIntegrationSync();
  const plugin = JSON.parse(
    await readFile(
      new URL("../../integrations/guteneo/plugin.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(state.pluginVersion, plugin.version);
  assert.ok(state.sources["apps/api/src/mcp.ts"]);
  assert.ok(state.sources["apps/api/src/auth.ts"]);
});

test("unchanged synchronization is deterministic and does not bump versions", async (t) => {
  const root = await fixture(t);
  const first = await syncIntegrationPackage(root);
  const bytes = await readFile(join(root, syncFile));
  assert.deepEqual(await validateIntegrationSync(root), first);
  assert.deepEqual(await syncIntegrationPackage(root), first);
  assert.deepEqual(await readFile(join(root, syncFile)), bytes);
});

test("MCP changes fail until the plugin version and archive metadata are refreshed", async (t) => {
  const root = await fixture(t);
  const before = await syncIntegrationPackage(root);
  await put(
    root,
    "apps/api/src/mcp.ts",
    'export const tools = ["new-tool"];\n',
  );
  await assert.rejects(validateIntegrationSync(root), /plugin is stale/);
  await assert.rejects(syncIntegrationPackage(root), /higher plugin version/);
  await version(root, "0.3.5");
  const after = await syncIntegrationPackage(root);
  assert.equal(after.pluginVersion, "0.3.5");
  assert.notEqual(after.mcpSourceSha256, before.mcpSourceSha256);
  assert.notEqual(after.packageSha256, before.packageSha256);
  assert.deepEqual(await validateIntegrationSync(root), after);
});

test("shared schema edits and newly imported MCP files invalidate the record", async (t) => {
  const root = await fixture(t);
  await syncIntegrationPackage(root);
  await put(
    root,
    "packages/contracts/src/mcp-input.ts",
    'export const schema = "changed";\n',
  );
  await assert.rejects(validateIntegrationSync(root), /plugin is stale/);
  await version(root, "0.3.5");
  await syncIntegrationPackage(root);
  await put(root, "apps/api/src/new-tool.ts", 'export const tool = "new";\n');
  await put(
    root,
    "apps/api/src/mcp.ts",
    'import { tool } from "./new-tool";\n',
  );
  await assert.rejects(validateIntegrationSync(root), /plugin is stale/);
  await version(root, "0.3.6");
  const state = await syncIntegrationPackage(root);
  assert.ok(state.sources["apps/api/src/new-tool.ts"]);
  await put(
    root,
    "apps/api/src/new-tool.ts",
    'export const tool = "changed";\n',
  );
  await assert.rejects(validateIntegrationSync(root), /plugin is stale/);
});

test("changed skill content, mismatched versions and version downgrades are rejected", async (t) => {
  const root = await fixture(t);
  await syncIntegrationPackage(root);
  await put(
    root,
    "integrations/guteneo/skills/get-started/SKILL.md",
    "changed instructions\n",
  );
  await assert.rejects(validateIntegrationSync(root), /plugin is stale/);
  await assert.rejects(syncIntegrationPackage(root), /higher plugin version/);
  await put(root, "integrations/guteneo/plugin.json", '{"version":"0.3.5"}');
  await assert.rejects(syncIntegrationPackage(root), /versions disagree/);
  await version(root, "0.3.3");
  await assert.rejects(syncIntegrationPackage(root), /higher plugin version/);
});

test("a missing synchronization record fails validation", async (t) => {
  const root = await fixture(t);
  await assert.rejects(validateIntegrationSync(root), /record is missing/);
});
