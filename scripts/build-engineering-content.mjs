import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Publish a deliberately selected view, never the repository atlas or runbooks.
const repository = new URL("../", import.meta.url);
const directory = new URL(
  "apps/engineering/src/content/docs/features/",
  repository,
);
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check"))
  throw new Error("Use node scripts/build-engineering-content.mjs [--check]");
const data = JSON.parse(
  await readFile(new URL("docs/feature-map.json", repository), "utf8"),
);
const prose = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const cell = (value) =>
  prose(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const frontmatter = (title, description, order) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\nsidebar:\n  order: ${order}\n---\n\n<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->\n\n`;
const guide = {
  identity: "/architecture/authority-and-tenancy/",
  team: "/architecture/authority-and-tenancy/",
  documents: "/workflows/documents/",
  templates: "/workflows/studio-and-data/",
  datasets: "/workflows/studio-and-data/",
  generation: "/workflows/studio-and-data/",
  fax: "/workflows/delivery-channels/",
  postal: "/workflows/delivery-channels/",
  email: "/workflows/delivery-channels/",
  "secure-distribution": "/workflows/secure-distribution/",
  "dry-run": "/architecture/dispatch-lifecycle/",
  campaigns: "/architecture/dispatch-lifecycle/",
  billing: "/architecture/dispatch-lifecycle/",
  assistants: "/integrations/mcp/",
  "reviewer-oauth": "/integrations/mcp/",
  native: "/getting-started/repository-map/",
  public: "/engineering/contributing/",
  dashboard: "/engineering/contributing/",
  "pdf-verification": "/workflows/pdf-diagnostics/",
  operations: "/engineering/security-and-reliability/",
  belvedere: "/administration/belvedere/",
  status: "/engineering/testing/",
  "engineering-docs": "/engineering/contributing/",
  "cloud-development": "/engineering/ai-contributions/",
};
const availability = {
  public: "Public reading surface",
  "browser-session": "Authenticated browser session",
  "capability-gated": "Current capability and authority required",
  "read-only": "Read-only assessment",
  partial: "Partial implementation; check the stated limits",
  "host-qualified": "Qualified assistant host required",
  "operator-gated": "Restricted operator authority required",
  "local-candidate": "Local candidate; distribution needs separate proof",
};
const groups = data.groups.map((group) => {
  if (!guide[group.id] || !availability[group.availability])
    throw new Error(`Curate the public guide and availability for ${group.id}`);
  // Explicit field selection prevents future source/evidence fields leaking by spread.
  return {
    id: group.id,
    title: group.title,
    category: group.category,
    features: group.features,
    status: group.status,
    availability: availability[group.availability],
    surfaces: group.surfaces,
    rest: group.rest,
    tools: group.tools,
  };
});
const featureCount = groups.reduce(
  (count, group) => count + group.features.length,
  0,
);
const categories = [...new Set(groups.map((group) => group.category))];
const files = new Map();
files.set(
  "index.md",
  frontmatter(
    "Feature tree",
    "One feature inventory, grouped by domain and connected to its engineering guide.",
    0,
  ) +
    `**${groups.length} domains · ${featureCount} capabilities · ${data.journeys.length} journeys · ${groups.flatMap((g) => g.rest).length} REST operations · ${groups.flatMap((g) => g.tools).length} MCP tools.**\n\n` +
    `Follow a branch to find its behavior, access boundary and engineering guide. Use the site search to find a specific capability.\n\n` +
    `This is an implementation inventory, not a live availability dashboard. Current account capabilities, authority, provider activation and release evidence determine what can run. See [evidence boundaries](/engineering/testing/).\n\n` +
    categories
      .map(
        (category) =>
          `## ${category}\n\n` +
          groups
            .filter((group) => group.category === category)
            .map(
              (group) =>
                `- [${group.title}](/features/${group.id}/) — ${group.features.length} capabilities`,
            )
            .join("\n"),
      )
      .join("\n\n") +
    `\n\n## Across the branches\n\n- [Roles and permissions](/features/permissions/) — four human roles and a separate connected assistant.\n- [Customer journeys](/features/journeys/) — entry, result and recovery across the product.\n- [Contribution rules](/engineering/contributing/) — update the inventory and developer documentation together.\n\nThe tree is generated from the repository's single feature source. Each feature change must update that source and the affected developer guide in the same change.\n`,
);
groups.forEach((group, index) => {
  const features = group.features
    .map((feature) => {
      const anchor = createHash("sha256")
        .update(feature)
        .digest("hex")
        .slice(0, 12);
      return `<li id="feature-${anchor}">${prose(feature)}</li>`;
    })
    .join("\n");
  const rest = group.rest.length
    ? `\n\n## REST operations\n\n${group.rest.map((operation) => `- \`${operation}\``).join("\n")}\n\nRead the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.`
    : "";
  const mcp = group.tools.length
    ? `\n\n## MCP tools\n\n${group.tools.map((tool) => `- \`${tool}\``).join("\n")}\n\nRead the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.`
    : "";
  files.set(
    `${group.id}.md`,
    frontmatter(
      group.title,
      `${group.features.length} capabilities in the ${group.category.toLowerCase()} branch of Guteneo.`,
      index + 1,
    ) +
      `**Access boundary:** ${group.availability}.\n\n${prose(group.status)}\n\n**Surfaces:** ${prose(group.surfaces)}\n\n[Read the engineering guide](${guide[group.id]}) · [All features](/features/)\n\n## Capabilities\n\n<ol>\n${features}\n</ol>${rest}${mcp}\n`,
  );
});
files.set(
  "permissions.md",
  frontmatter(
    "Roles and permissions",
    "Human membership roles and connected assistant authority, from the shared feature source.",
    90,
  ) +
    `There are four human membership roles. A connected assistant is a separate OAuth actor, never a fifth membership role. The server rechecks current membership, independent supervisor permissions, scopes and any bounded expert mandate. Installing an integration or renewing tokens grants no extra authority.\n\n` +
    `| Capability | ${data.roles.map(cell).join(" | ")} |\n| --- | ${data.roles.map(() => "---").join(" | ")} |\n` +
    data.permissions
      .map((row) => `| ${row.map(cell).join(" | ")} |`)
      .join("\n") +
    `\n\nRead [authority and tenancy](/architecture/authority-and-tenancy/) for the enforcement model and [MCP](/integrations/mcp/) for assistant constraints.\n`,
);
files.set(
  "journeys.md",
  frontmatter(
    "Customer journeys",
    "From actor and intent to result, including failure and recovery boundaries.",
    91,
  ) +
    `These journeys are generated from the same inventory as the [feature tree](/features/). They describe implementation and recovery; [live qualification is separate](/engineering/testing/).\n\n` +
    data.journeys
      .map(
        (journey) =>
          `## ${journey.id}: ${journey.title}\n\n**Actor:** ${prose(journey.actor)} · **Branch:** ${prose(journey.branch)}\n\n${prose(journey.steps)}\n\n**Failure and recovery:** ${prose(journey.failure)}`,
      )
      .join("\n\n") +
    "\n",
);
await mkdir(directory, { recursive: true });
for (const name of await readdir(directory)) {
  if (!files.has(name)) {
    if (check) throw new Error(`Stale generated feature page: ${name}`);
    await unlink(new URL(name, directory));
  }
}
for (const [name, output] of files) {
  const path = new URL(name, directory);
  if (check) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== output)
      throw new Error(
        `Stale engineering feature page: ${name}; run npm run docs:build`,
      );
  } else await writeFile(path, output);
}
console.log(
  `Engineering feature projection ${check ? "verified" : "generated"}: ${groups.length} domains, ${featureCount} capabilities, ${files.size} pages.`,
);
