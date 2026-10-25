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
  "This package grants no filesystem access or local upload adapter. For an allowed private original, use begin_document_upload only when actually exposed and the host computing environment can read its exact bytes and make the permitted Guteneo PUT. Compute its real size/SHA-256, use the returned bounded client/grant, then recover get_document_upload on the same ID without another binary attempt. Keep the capability private and preserve host permissions/egress. This requires a compatible runtime, not a native iPhone extension; source tests qualify no actual host. Reuse a Guteneo document where available. If exact transfer is unavailable, explain that specific limit and let the person choose an alternative; never publish a file, reconstruct it from text, invent download_url/file_id or call an unavailable upload_local_pdf.";

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
  for (const file of ["scripts/upload-private-pdf.py"]) {
    const source = await readFile(join(root, "guteneo", file), "utf8");
    const target = join(marketplaceRoot, "plugins/guteneo", file);
    const previous = await readFile(target, "utf8").catch(() => null);
    if (previous !== source) {
      changes.push(target);
      if (!check) {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source);
      }
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
