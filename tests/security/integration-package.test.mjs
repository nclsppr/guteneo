import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { validateIntegrationPackage } from "../../integrations/build.mjs";

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-package-guard-"));
  const files = [
    "plugin.json",
    "mcp.json",
    ".mcp.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
  ];
  try {
    for (const file of files) {
      const target = join(directory, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        await readFile(
          new URL(`../../integrations/guteneo/${file}`, import.meta.url),
        ),
      );
    }
    await run(directory, async (filename, mutate) => {
      const path = join(directory, filename);
      const manifest = JSON.parse(await readFile(path, "utf8"));
      mutate(manifest);
      await writeFile(path, JSON.stringify(manifest));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("validates the synchronized portable and host-specific manifests", () =>
  fixture((directory) => validateIntegrationPackage(directory)));

test("all packaged clients discover the same secure distribution server without granting personal authority", async () => {
  for (const relative of [
    "guteneo/mcp.json",
    "guteneo/.mcp.json",
    "claude/plugins/guteneo/.mcp.json",
    "config/cursor-mcp.json",
    "config/cursor-static-oauth.json",
    "config/claude-static-oauth.json",
    "config/copilot-vscode-mcp.json",
    "config/copilot-cli-mcp.json",
  ]) {
    const value = JSON.parse(
      await readFile(
        new URL(`../../integrations/${relative}`, import.meta.url),
        "utf8",
      ),
    );
    const server = (value.mcpServers ?? value.servers).guteneo;
    assert.equal(server.url, "https://guteneo.com/mcp", relative);
    if (server.tools)
      assert(
        server.tools.includes("*"),
        "A static allowlist must not hide secure distribution tools",
      );
    const scopes =
      server.oauth?.scopes ??
      server.auth?.scopes ??
      server.extensions?.["com.openai"]?.auth?.defaultScopes;
    if (scopes)
      for (const scope of [
        "dispatches:read",
        "dispatches:prepare",
        "dispatches:send",
      ])
        assert(
          (Array.isArray(scopes) ? scopes : scopes.split(" ")).includes(scope),
          `${relative}: ${scope}`,
        );
    assert.doesNotMatch(
      JSON.stringify(server),
      /personal:|vault:|claim:|binding:/,
    );
  }
});

for (const file of [
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
]) {
  test(`refuses a stale release in ${file}`, () =>
    fixture(async (directory, edit) => {
      await edit(file, (manifest) => {
        manifest.version = "0.0.1";
      });
      await assert.rejects(
        validateIntegrationPackage(directory),
        /versions differ|Release version differs/,
      );
    }));
}

test("refuses a different endpoint in a shadow compatibility configuration", () =>
  fixture(async (directory, edit) => {
    await edit(".mcp.json", (manifest) => {
      manifest.mcpServers.guteneo.url = "https://example.invalid/mcp";
    });
    await assert.rejects(
      validateIntegrationPackage(directory),
      /MCP connections differ/,
    );
  }));

test("refuses a hidden private app binding in a public compatibility manifest", () =>
  fixture(async (directory, edit) => {
    await edit(".claude-plugin/plugin.json", (manifest) => {
      manifest.extensions = { "com.openai": { apps: "./.app.json" } };
    });
    await assert.rejects(
      validateIntegrationPackage(directory),
      /private app bindings/,
    );
  }));
