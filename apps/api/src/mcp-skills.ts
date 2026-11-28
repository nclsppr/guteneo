import { SkillsExtension } from "@modelcontextprotocol/server/ext/skills";
import catalog from "../../../packages/contracts/src/mcp-skills.json" with { type: "json" };

// Built from public workflow documentation. Index only manifest entries so a
// resource URI can never resolve to a filesystem path or a tenant document.
const texts: Record<string, string> = catalog.texts;
const skills = new Map(catalog.skills.map((skill) => [skill.uri, skill]));
const files = new Map<string, string>();
for (const skill of catalog.skills) {
  for (const file of skill.resources) files.set(file.uri, texts[file.digest]);
}

export const guteneoSkills = new SkillsExtension({
  baseUri: "skill://guteneo/",
  strict: true,
  source: {
    async list() {
      return { skills: catalog.skills };
    },
    async get(uri) {
      return skills.get(uri);
    },
    async read(uri) {
      const text = files.get(uri);
      if (text !== undefined) return { text, mimeType: "text/markdown" };
    },
  },
});
