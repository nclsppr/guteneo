import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { skillEntry } from "@modelcontextprotocol/server/ext/skills";
import { packageFiles } from "./package-files.mjs";

export const skillCatalogFile = "packages/contracts/src/mcp-skills.json";
const baseUri = "skill://guteneo/";
const pdfReference = "references/original-pdf-transfer.md";
const sharedLink = `../get-started/${pdfReference}`;

// Portable skills expose only Markdown from the package allowlist. Each skill
// must remain usable when a client downloads just that skill's manifest.
export async function buildSkillCatalog(projectRoot) {
  const sourceRoot = join(projectRoot, "integrations/guteneo");
  const groups = new Map();
  for (const path of packageFiles
    .filter((file) => file.startsWith("skills/") && file.endsWith(".md"))
    .sort()) {
    const [, name, ...parts] = path.split("/");
    if (!groups.has(name)) groups.set(name, {});
    groups.get(name)[parts.join("/")] = await readFile(
      join(sourceRoot, path),
      "utf8",
    );
  }

  const skills = [];
  const texts = {};
  for (const [name, files] of groups) {
    const instructions = files["SKILL.md"];
    if (instructions.includes(`](${sharedLink})`)) {
      files["SKILL.md"] = instructions.replaceAll(
        `](${sharedLink})`,
        `](${pdfReference})`,
      );
      files[pdfReference] = groups.get("get-started")[pdfReference];
    }

    for (const [path, markdown] of Object.entries(files)) {
      for (const [, target] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (target.startsWith("https://") || target.startsWith("#")) continue;
        const referenced = posix.join(
          posix.dirname(path),
          target.split("#")[0],
        );
        if (!Object.hasOwn(files, referenced))
          throw new Error(
            `Unbundled link in MCP skill ${name}/${path}: ${target}`,
          );
      }
    }

    const skill = await skillEntry(name, files, { baseUri });
    skills.push(skill);
    const directoryUri = new URL(".", skill.uri).href;
    for (const resource of skill.resources) {
      const path = decodeURIComponent(resource.uri.slice(directoryUri.length));
      if (!Object.hasOwn(files, path))
        throw new Error(`Unmapped MCP skill resource: ${resource.uri}`);
      texts[resource.digest] = files[path];
    }
  }
  return { skills, texts };
}
