import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unzipSync } from "fflate";
import { buildIntegrationPackage } from "../../integrations/build.mjs";
import {
  claudeMarketplaceFiles,
  claudeMarketplaceRoot,
  claudePluginFiles,
  claudePluginRoot,
  validateClaudePackage,
} from "../../integrations/claude/package.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function withCopy(run) {
  const temp = await mkdtemp(join(tmpdir(), "guteneo-claude-contract-"));
  const marketplaceRoot = join(temp, "marketplace");
  try {
    await cp(claudeMarketplaceRoot, marketplaceRoot, { recursive: true });
    await run(marketplaceRoot);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function editJson(path, change) {
  const value = JSON.parse(await readFile(path, "utf8"));
  change(value);
  await writeFile(path, JSON.stringify(value));
}

test("Claude source is a version-aligned remote-only candidate", async () => {
  const result = await validateClaudePackage();
  const release = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8"),
  );
  assert.equal(result.version, release.version);
  assert.equal(result.endpoint, "https://guteneo.com/mcp");
  assert(claudePluginFiles.includes("skills/secure-distribution/SKILL.md"));
  const secure = await readFile(
    join(claudePluginRoot, "skills/secure-distribution/SKILL.md"),
    "utf8",
  );
  for (const tool of [
    "prepare_secure_distribution",
    "list_secure_distributions",
    "get_secure_distribution",
    "confirm_secure_distribution",
    "revoke_secure_distribution",
  ])
    assert(secure.includes(tool));
  assert(secure.includes("../../references/claude-host.md"));
  assert(secure.includes("non-refundable"));
});

test("Claude workflow copies cannot drift from common instructions and their host overlay", async () => {
  await withCopy(async (marketplaceRoot) => {
    const path = join(marketplaceRoot, "plugins/guteneo/skills/email/SKILL.md");
    await writeFile(
      path,
      (await readFile(path, "utf8")) + "\nStale copied instruction.\n",
    );
    await assert.rejects(
      validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      /stale/,
    );
  });
});

test("Claude packaging rejects credential, executable and identity substitutions", async () => {
  for (const mutate of [
    (server) => {
      server.headers = { Authorization: "Bearer fixture-not-a-real-secret" };
    },
    (server) => {
      server.command = "fixture-command";
    },
    (server) => {
      server.oauth.clientId = "REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID";
    },
    (server) => {
      server.url = "https://example.com/mcp";
    },
    (server) => {
      server.oauth.scopes += " invented:scope";
    },
  ]) {
    await withCopy(async (marketplaceRoot) => {
      await editJson(
        join(marketplaceRoot, "plugins/guteneo/.mcp.json"),
        (mcp) => mutate(mcp.mcpServers.guteneo),
      );
      await assert.rejects(
        validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      );
    });
  }
});

test("Claude packaging rejects added hooks, skill pre-approval and OpenAI transfer assumptions", async () => {
  await withCopy(async (marketplaceRoot) => {
    await editJson(
      join(marketplaceRoot, "plugins/guteneo/.claude-plugin/plugin.json"),
      (plugin) => {
        plugin.hooks = {};
      },
    );
    await assert.rejects(
      validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      /manifest fields/,
    );
  });
  for (const change of [
    (skill) =>
      skill.replace("name: email\n", "name: email\nallowed-tools: Bash(*)\n"),
    (skill) => `${skill}\nUse openai/fileParams here.\n`,
  ]) {
    await withCopy(async (marketplaceRoot) => {
      const path = join(
        marketplaceRoot,
        "plugins/guteneo/skills/email/SKILL.md",
      );
      await writeFile(path, change(await readFile(path, "utf8")));
      await assert.rejects(
        validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      );
    });
  }
});

test("Claude package paths cannot escape the archive or import undeclared files", async () => {
  await withCopy(async (marketplaceRoot) => {
    await editJson(
      join(marketplaceRoot, ".claude-plugin/marketplace.json"),
      (marketplace) => {
        marketplace.plugins[0].source = "../guteneo";
      },
    );
    await assert.rejects(
      validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      /inside the archive/,
    );
  });
  await withCopy(async (marketplaceRoot) => {
    await writeFile(
      join(marketplaceRoot, "plugins/guteneo/.env"),
      "fixture-only=true",
    );
    await assert.rejects(
      validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      /inventory/,
    );
  });
  await withCopy(async (marketplaceRoot) => {
    const path = join(marketplaceRoot, "plugins/guteneo/README.md");
    await rm(path);
    await symlink(join(repositoryRoot, "README.md"), path);
    await assert.rejects(
      validateClaudePackage({ marketplaceRoot, repositoryRoot }),
      /symlinks/,
    );
  });
});

test("the release builder emits complete, deterministic Claude plugin and marketplace ZIPs", async () => {
  const temp = await mkdtemp(join(tmpdir(), "guteneo-claude-archives-"));
  try {
    await buildIntegrationPackage(join(temp, "first"));
    await buildIntegrationPackage(join(temp, "second"));
    for (const [archiveName, root, files] of [
      ["guteneo-claude-code.zip", claudePluginRoot, claudePluginFiles],
      [
        "guteneo-claude-marketplace.zip",
        claudeMarketplaceRoot,
        claudeMarketplaceFiles,
      ],
    ]) {
      const first = await readFile(join(temp, "first", archiveName));
      assert.deepEqual(
        first,
        await readFile(join(temp, "second", archiveName)),
      );
      const entries = unzipSync(first);
      assert.deepEqual(Object.keys(entries).sort(), [...files].sort());
      for (const file of files)
        assert.deepEqual(
          Buffer.from(entries[file]),
          await readFile(join(root, file)),
        );
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
