import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const skills = [
  "document-studio",
  "email",
  "fax-pdf",
  "get-started",
  "pdf-accessibility",
  "postal-pdf",
  "secure-distribution",
];
const hostNotice =
  "Before using this skill, read the [Claude host contract](../../references/claude-host.md). Use the connected Guteneo tools and preserve the host’s permission prompts.";
const claudeFileTransport =
  "This Claude Code package includes no local upload adapter and does not qualify Claude attachment transfer. Reuse a verified Guteneo document through list_documents/get_document. If no separately configured and qualified exact-file transport is actually available, offer the person's own authenticated upload in [Guteneo Documents](https://guteneo.com/?lang=en#/app/documents), subject to the same content restrictions. Never publish a file to manufacture a URL, reconstruct an original from text, or invent download_url, file_id or an unavailable upload_local_pdf call.";

/** Common English skills are the source; only actual host differences are overlaid. */
export async function synchronizeClaudeWorkflows({
  check = false,
  marketplaceRoot = join(root, "claude"),
} = {}) {
  const changes = [];
  for (const name of skills) {
    const source = await readFile(
      join(root, "guteneo/skills", name, "SKILL.md"),
      "utf8",
    );
    let adapted = source
      .replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${hostNotice}\n`)
      .replaceAll(
        "In ChatGPT and Codex workflows, before requesting content, explain",
        "Before requesting content, explain",
      );
    if (name === "fax-pdf")
      adapted = adapted.replace(
        /In ChatGPT, use the exact host-provided file contract[\s\S]*?A local path or extracted text is not a remote download URL\./,
        claudeFileTransport,
      );
    const path = join(
      marketplaceRoot,
      "plugins/guteneo/skills",
      name,
      "SKILL.md",
    );
    if ((await readFile(path, "utf8")) !== adapted) {
      changes.push(path);
      if (!check) await writeFile(path, adapted);
    }
  }
  const reference = "skills/document-studio/references/template-authoring.md";
  const source = await readFile(join(root, "guteneo", reference), "utf8");
  const target = join(marketplaceRoot, "plugins/guteneo", reference);
  if ((await readFile(target, "utf8")) !== source) {
    changes.push(target);
    if (!check) await writeFile(target, source);
  }
  if (check && changes.length)
    throw new Error(
      "Claude workflow copies are stale. Run node integrations/sync-claude-workflows.mjs.",
    );
  return changes;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const changes = await synchronizeClaudeWorkflows({
    check: process.argv.includes("--check"),
  });
  console.log(`Claude workflow copies checked; ${changes.length} updated.`);
}
