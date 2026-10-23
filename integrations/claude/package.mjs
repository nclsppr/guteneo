import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const claudeMarketplaceRoot = dirname(fileURLToPath(import.meta.url));
export const claudePluginRoot = join(claudeMarketplaceRoot, "plugins/guteneo");
export const claudeSkillNames = [
  "document-studio",
  "email",
  "fax-pdf",
  "get-started",
  "pdf-accessibility",
  "postal-pdf",
];
export const claudePluginFiles = [
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "README.md",
  "assets/guteneo-mark.png",
  "references/claude-host.md",
  ...claudeSkillNames.map((name) => `skills/${name}/SKILL.md`),
  "skills/document-studio/references/template-authoring.md",
];
export const claudeMarketplaceFiles = [
  ".claude-plugin/marketplace.json",
  "README.md",
  ...claudePluginFiles.map((name) => `plugins/guteneo/${name}`),
];

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function keys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}

async function filesInside(root, directory = root) {
  const result = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const stat = await lstat(path);
    assert(
      !stat.isSymbolicLink(),
      `Claude package must not contain symlinks: ${name}`,
    );
    if (stat.isDirectory()) result.push(...(await filesInside(root, path)));
    else {
      assert(stat.isFile(), `Claude package entry must be a file: ${name}`);
      result.push(relative(root, path).split(sep).join("/"));
    }
  }
  return result;
}

// These checks enforce Guteneo's bounded distribution contract. Anthropic's
// `claude plugin validate` remains the authoritative host-format validator.
export async function validateClaudePackage({
  marketplaceRoot = claudeMarketplaceRoot,
  repositoryRoot = resolve(claudeMarketplaceRoot, "../.."),
} = {}) {
  const pluginRoot = join(marketplaceRoot, "plugins/guteneo");
  const release = await json(join(repositoryRoot, "package.json"));
  const plugin = await json(join(pluginRoot, ".claude-plugin/plugin.json"));
  keys(
    plugin,
    [
      "name",
      "version",
      "description",
      "author",
      "homepage",
      "repository",
      "icon",
      "privacyPolicyUrl",
      "termsOfServiceUrl",
      "supportUrl",
    ],
    "Claude manifest fields",
  );
  assert.equal(plugin.name, "guteneo");
  assert.equal(
    plugin.version,
    release.version,
    "Claude version must match the release",
  );
  assert.equal(plugin.homepage, "https://guteneo.com/a-propos/?lang=en");
  assert.equal(plugin.repository, "https://github.com/nclsppr/guteneo");
  assert.equal(plugin.icon, "./assets/guteneo-mark.png");
  assert.equal(
    plugin.privacyPolicyUrl,
    "https://guteneo.com/confidentialite/?lang=en",
  );
  assert.equal(
    plugin.termsOfServiceUrl,
    "https://guteneo.com/conditions/?lang=en",
  );
  assert.equal(plugin.supportUrl, "https://guteneo.com/support/?lang=en");
  assert.equal(typeof plugin.description, "string");
  assert(plugin.description.length > 0);
  keys(plugin.author, ["name"], "Claude author fields");
  assert.equal(plugin.author.name, "NICOLAS PATRICK HENRI FRANK PIEPER");

  const mcp = await json(join(pluginRoot, ".mcp.json"));
  keys(mcp, ["mcpServers"], "Claude MCP container");
  keys(mcp.mcpServers, ["guteneo"], "Claude MCP servers");
  const server = mcp.mcpServers.guteneo;
  keys(
    server,
    ["type", "url", "oauth"],
    "Remote-only MCP; no credentials or commands",
  );
  assert.equal(server.type, "http");
  assert.equal(server.url, "https://guteneo.com/mcp");
  keys(server.oauth, ["scopes"], "No fabricated OAuth registration");
  assert.deepEqual(
    mcp,
    await json(join(repositoryRoot, "integrations/guteneo/.mcp.json")),
    "Claude endpoint/scopes must match the shared connection",
  );

  const marketplace = await json(
    join(marketplaceRoot, ".claude-plugin/marketplace.json"),
  );
  keys(
    marketplace,
    ["name", "description", "owner", "plugins"],
    "Marketplace fields",
  );
  assert.equal(marketplace.name, "guteneo-plugins");
  assert.equal(typeof marketplace.description, "string");
  assert(marketplace.description.length > 0);
  assert.deepEqual(marketplace.owner, plugin.author);
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  keys(entry, ["name", "source", "description"], "Marketplace entry fields");
  assert.equal(entry.name, plugin.name);
  assert.equal(
    entry.source,
    "./plugins/guteneo",
    "Marketplace source must stay inside the archive",
  );
  assert.equal(entry.description, plugin.description);

  assert.deepEqual(
    (await filesInside(pluginRoot)).sort(),
    [...claudePluginFiles].sort(),
    "Claude plugin fixed file inventory",
  );
  for (const name of claudeMarketplaceFiles) {
    const stat = await lstat(join(marketplaceRoot, name));
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      `Unsafe marketplace entry: ${name}`,
    );
  }
  for (const name of claudeSkillNames) {
    const skill = await readFile(
      join(pluginRoot, `skills/${name}/SKILL.md`),
      "utf8",
    );
    const header = skill.match(/^---\n([\s\S]*?)\n---\n/);
    assert(header, `Missing skill frontmatter: ${name}`);
    assert.deepEqual(
      header[1]
        .split("\n")
        .map((line) => line.split(":", 1)[0])
        .sort(),
      ["description", "name"],
      "Skills must not grant permissions or run hooks",
    );
    assert(header[1].includes(`name: ${name}\n`));
    assert(skill.includes("../../references/claude-host.md"));
    assert(
      !/openai\/fileParams|agents\/openai\.yaml|Dans ChatGPT/.test(skill),
      "Claude skills must not assume OpenAI file transfer",
    );
  }
  return { name: plugin.name, version: plugin.version, endpoint: server.url };
}
