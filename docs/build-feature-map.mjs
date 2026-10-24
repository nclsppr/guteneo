import { access, readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const data = await read("feature-map.json");
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Use node docs/build-feature-map.mjs [--check]");
const unique = (items, label) => {
  if (new Set(items).size !== items.length)
    throw new Error(`Duplicate ${label}`);
};
const reference = async (path) => {
  if (!path || path.startsWith("/") || path.split("/").includes(".."))
    throw new Error(`Invalid repository reference: ${path}`);
  await access(new URL("../" + path, root));
};
if (
  data.schemaVersion !== 2 ||
  data.roles.length !== 5 ||
  data.permissions.some((row) => row.length !== data.roles.length + 1)
)
  throw new Error("Invalid feature schema or permission matrix");
unique(
  data.groups.map((g) => g.id),
  "domain ID",
);
unique(
  data.groups.map((g) => g.title),
  "domain title",
);
unique(
  data.journeys.map((j) => j.id),
  "journey ID",
);
for (const group of data.groups) {
  if (
    !/^[a-z][a-z0-9-]*$/.test(group.id) ||
    !group.category ||
    !group.features.length ||
    !group.tests.length ||
    !group.status ||
    !group.availability ||
    !group.surfaces ||
    !Array.isArray(group.tools) ||
    !Array.isArray(group.rest)
  )
    throw new Error(`Incomplete domain: ${group.id}`);
  unique(group.features, `feature in ${group.id}`);
  for (const path of ["docs/" + group.doc, group.source, ...group.tests])
    await reference(path);
}
for (const journey of data.journeys) {
  for (const key of [
    "id",
    "title",
    "actor",
    "steps",
    "branch",
    "doc",
    "failure",
  ])
    if (!journey[key])
      throw new Error(`Incomplete journey: ${journey.id}/${key}`);
  await reference("docs/" + journey.doc);
}
const coveredTools = data.groups.flatMap((g) => g.tools);
const coveredRest = data.groups.flatMap((g) => g.rest);
unique(coveredTools, "MCP tool ownership");
unique(coveredRest, "REST operation ownership");
const tools = (
  await read("../integrations/chatgpt/tool-annotations.json")
).tools.map((t) => t.name);
const openapi = await read("../apps/web/public/openapi.json");
const methods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);
const operations = Object.entries(openapi.paths).flatMap(([path, item]) =>
  Object.keys(item)
    .filter((m) => methods.has(m))
    .map((m) => `${m.toUpperCase()} ${path}`),
);
for (const [actual, registered, label] of [
  [tools, coveredTools, "MCP tool"],
  [operations, coveredRest, "OpenAPI operation"],
]) {
  const missing = actual.filter((id) => !registered.includes(id));
  const stale = registered.filter((id) => !actual.includes(id));
  if (missing.length || stale.length)
    throw new Error(
      `${label} coverage drift. Missing: ${missing.join(", ") || "none"}; stale: ${stale.join(", ") || "none"}. Update feature-map.json and developer contracts.`,
    );
}
const featureCount = data.groups.reduce((n, g) => n + g.features.length, 0);
const categories = [...new Set(data.groups.map((g) => g.category))];
const headers = ["Capability", ...data.roles];
const tree = categories
  .map(
    (category) =>
      `    ${category}\n${data.groups
        .filter((g) => g.category === category)
        .map(
          (g) =>
            `      ${g.title.replaceAll("&", "and")} (${g.features.length})`,
        )
        .join("\n")}`,
  )
  .join("\n");
const boundary =
  "This inventory describes repository implementation. Check current account capabilities, authority and dated release/runtime evidence before treating a feature as available. Local tests, deterministic simulation, deployed assets, authenticated clients and real provider delivery are separate evidence.";
const maintenance =
  "Every feature addition, change or removal must update feature-map.json, affected permissions/journeys, the developer guide and the detailed technical contract in the same PR. Include entry conditions, authority, result, errors/recovery, surfaces, privacy, activation gates, source and tests. Update OpenAPI/MCP contracts where relevant, regenerate both atlas views, and run npm run docs:check. The generator rejects missing or stale advertised REST/MCP operations. Review remains responsible for semantic coverage and factual status. These raw atlas files stay in the repository. The separate engineering site publishes only curated guides and the explicit generated feature projection; regenerate that projection with npm run docs:build.";
const markdown = `<!-- Generated from feature-map.json by node docs/build-feature-map.mjs -->
# Guteneo feature tree and developer atlas

**${data.groups.length} domains · ${featureCount} features · ${data.journeys.length} journeys · ${coveredRest.length} documented REST operations · ${coveredTools.length} MCP tools**
Updated ${data.updated}.

${data.scope}

Start here to find a feature, its authority and its technical owner. Read [repository standards](REPOSITORY_STANDARDS.md) and the [documentation index](README.md) for shared conventions. The [offline visual atlas](FEATURE_MAP.html) provides search; [feature-map.json](feature-map.json) is the single editable source. Regenerate with \`npm run docs:build\`.

## Feature tree

\`\`\`mermaid
mindmap
  root((Guteneo))
${tree}
\`\`\`

${categories
  .map(
    (category) =>
      `### ${category}\n\n${data.groups
        .filter((g) => g.category === category)
        .map(
          (g) =>
            `- [${g.title}](#${g.id}) — ${g.features.length} features; ${g.availability}.`,
        )
        .join("\n")}`,
  )
  .join("\n\n")}

## Availability and evidence

${boundary}

An availability label describes the access/gating model, never an assertion of live activation. \`partial\` and \`local-candidate\` mark material qualification gaps. Read each detailed contract and the dated [release record](LIVE_RELEASE.md); no hard-coded historical release summary is duplicated here.

## Roles and permissions

${data.roleNote}

| ${headers.join(" | ")} |
| ${headers.map(() => "---").join(" | ")} |
${data.permissions.map((p) => `| ${p.join(" | ")} |`).join("\n")}

Supervisor approval/reporting options are independent and off by default. Resource ownership/context checks still apply. See [workspace roles](WORKSPACE_ROLES.md), [expert approval](EXPERT_APPROVAL.md) and [studio access](TEMPLATES_DATA_DISTRIBUTION.md).

## Complete feature inventory

${data.groups.map((g) => `<a id="${g.id}"></a>\n### ${g.title}\n\n**Availability model:** ${g.availability}. ${g.status}\n\n**Surfaces:** ${g.surfaces}\n\n${g.features.map((f) => `- ${f}`).join("\n")}\n\n**Contract:** [${g.doc}](${g.doc}) · **Implementation:** [${g.source}](../${g.source})\n\n**Tests:** ${g.tests.map((t) => `[${t}](../${t})`).join(", ")}\n\n${g.rest.length ? `**Documented REST operations**\n\n${g.rest.map((r) => `- \`${r}\``).join("\n")}\n\n` : ""}${g.tools.length ? `**MCP tools**\n\n${g.tools.map((t) => `- \`${t}\``).join("\n")}` : ""}`).join("\n\n")}

## Customer journeys and recovery

${data.journeys.map((j) => `### ${j.id} · ${j.title}\n\n**Actor:** ${j.actor}. **Branch:** ${j.branch}.\n\n${j.steps}\n\n**Failure/recovery:** ${j.failure}\n\n[Detailed contract](${j.doc}).`).join("\n\n")}

## Required maintenance

${maintenance}

[Developer API guide](DEVELOPER_API.md) · [REST contract](API_CONTRACT.md) · [OpenAPI](../apps/web/public/openapi.json) · [MCP annotations](../integrations/chatgpt/tool-annotations.md) · [CI](CI.md) · [Dated test evidence](TEST_RESULTS.md).
`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const links = (items, prefix = "") =>
  items.map((p) => `<a href="${esc(prefix + p)}">${esc(p)}</a>`).join(" · ");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Guteneo feature tree and developer atlas</title><style>
:root{--paper:#f7f5ef;--ink:#182338;--blue:#204bc7;--muted:#536079;--line:#d5d9de}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,sans-serif}a{color:var(--blue);text-underline-offset:.2em}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid var(--blue);outline-offset:4px}::selection{background:#c9d7fc;color:var(--ink)}header{padding:64px max(24px,calc((100vw - 1160px)/2));background:var(--ink);color:var(--paper)}header a{color:#c5d5ff}h1{font:clamp(2.5rem,7vw,5.5rem)/1.04 Georgia,serif;max-width:15ch;margin:20px 0 28px;font-weight:400}h2{font:2.25rem/1.18 Georgia,serif;margin:0 0 20px}h3{font-size:1.2rem;margin:0}p{max-width:75ch}header p{color:#d5ddeb}header .identity{display:inline-block;background:var(--paper);color:#181b22;padding:6px 12px;text-decoration:none;font-weight:650;letter-spacing:.02em}.counts{display:flex;flex-wrap:wrap;gap:12px 28px;font-variant-numeric:tabular-nums}.counts span{white-space:nowrap}main{max-width:1208px;padding:32px 24px 72px;margin:auto}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding-bottom:28px;border-bottom:1px solid var(--line)}section{margin-top:56px}.note{background:#e9eefb;padding:18px 22px;border-radius:12px}.muted{color:var(--muted)}.toolbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:24px 0}label{font-weight:650}input{font:inherit;color:var(--ink);background:white;min-width:0;width:min(100%,38rem);padding:12px 16px;border:1px solid #919bad;border-radius:8px}.category{margin:36px 0}.category>h3{margin-bottom:12px;color:var(--blue)}.domain{border-top:1px solid var(--line);padding:0 0 8px}.domain:last-child{border-bottom:1px solid var(--line)}summary{cursor:pointer;min-height:56px;padding:16px 8px}.domain summary{font-weight:650}.meta{font-size:.875rem;color:var(--muted);font-weight:400;margin-left:12px}.domain-content{padding:0 8px 24px 28px}.domain ul{padding-left:20px;max-width:90ch}.domain li{margin:8px 0}.references{font-size:.875rem;overflow-wrap:anywhere}.operations{font-size:.875rem;margin-top:20px}.operations code{white-space:normal;overflow-wrap:anywhere;font-size:.875rem}.operations ul{columns:2;column-gap:32px}.operations li{break-inside:avoid}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:white;max-height:650px}table{border-collapse:collapse;width:100%;min-width:1024px;font-size:.875rem}th,td{padding:14px 16px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:var(--ink);color:white;position:sticky;top:0}tbody th{min-width:190px}tr:nth-child(even){background:#f3f6fc}.journey{border-top:1px solid var(--line)}.journey summary{font-weight:600}.journey>div{padding:0 8px 20px 28px}footer{margin-top:56px;padding-top:24px;border-top:1px solid var(--line);font-size:.875rem}[hidden]{display:none!important}@media(max-width:600px){header{padding:36px 24px}.meta{display:block;margin-left:20px}.domain-content,.journey>div{padding-left:8px}.operations ul{columns:1}h2{font-size:1.9rem}.toolbar{align-items:flex-start;flex-direction:column;width:100%}.toolbar input{width:100%}}@media print{header{color:var(--ink);background:white;padding:20px}header p{color:var(--ink)}main{max-width:none;padding:20px}nav,.toolbar{display:none}.table-wrap{max-height:none;overflow:visible}table{min-width:0;font-size:9px}th,td{padding:5px}thead th{position:static}.domain,.journey{break-inside:avoid}a{color:inherit}}
</style></head><body><header><a class="identity" href="README.md">guteneo · developer documentation</a><h1>The product,<br>branch by branch.</h1><p>One reference for features, authority, interfaces and recovery, linked to implementation and evidence.</p><p class="counts"><span>${data.groups.length} domains</span><span>${featureCount} features</span><span>${data.journeys.length} journeys</span><span>${coveredRest.length} REST operations</span><span>${coveredTools.length} MCP tools</span></p><p>Updated ${esc(data.updated)} · Repository inventory</p></header><main><nav aria-label="Atlas sections"><a href="#features">Feature tree</a><a href="#roles">Permissions</a><a href="#journeys">Journeys</a><a href="#maintenance">Maintenance</a><a href="FEATURE_MAP.md">Markdown view</a></nav><p class="note">${esc(boundary)}</p><section id="features"><h2>The feature tree</h2><p>Expand a domain to inspect its features and contracts. Search names, details, paths or tool identifiers. Availability labels describe gates, not verified live activation.</p><div class="toolbar"><label for="search">Find a feature</label><input id="search" type="search" placeholder="PDF, postal, language, quota…" autocomplete="off"><span id="count" role="status" aria-live="polite">${data.groups.length} domains</span></div><p id="empty" hidden>No matching domain. Try another feature, path or tool name.</p>${categories
  .map(
    (category) =>
      `<div class="category"><h3>${esc(category)}</h3>${data.groups
        .filter((g) => g.category === category)
        .map(
          (g) =>
            `<details class="domain" id="${esc(g.id)}" data-search="${esc([g.title, g.surfaces, ...g.features, ...g.tools, ...g.rest].join(" ").toLowerCase())}"><summary>${esc(g.title)}<span class="meta">${g.features.length} features · ${esc(g.availability)}</span></summary><div class="domain-content"><p>${esc(g.status)}</p><p class="muted">${esc(g.surfaces)}</p><ul>${g.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><p class="references">Contract: ${links([g.doc])}<br>Implementation: ${links([g.source], "../")}<br>Tests: ${links(g.tests, "../")}</p>${g.rest.length || g.tools.length ? `<div class="operations">${g.rest.length ? `<strong>Documented REST operations</strong><ul>${g.rest.map((r) => `<li><code>${esc(r)}</code></li>`).join("")}</ul>` : ""}${g.tools.length ? `<strong>MCP tools</strong><ul>${g.tools.map((t) => `<li><code>${esc(t)}</code></li>`).join("")}</ul>` : ""}</div>` : ""}</div></details>`,
        )
        .join("")}</div>`,
  )
  .join(
    "",
  )}</section><section id="roles"><h2>Who can do what?</h2><p>${esc(data.roleNote)}</p><div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable role permission matrix"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.permissions
  .map(
    (p) =>
      `<tr><th scope="row">${esc(p[0])}</th>${p
        .slice(1)
        .map((c) => `<td>${esc(c)}</td>`)
        .join("")}</tr>`,
  )
  .join(
    "",
  )}</tbody></table></div><p class="muted">Supervisor approval and reporting are independent and off by default. Ownership/context checks remain mandatory. Read the <a href="WORKSPACE_ROLES.md">role contract</a>.</p></section><section id="journeys"><h2>From intent to result</h2>${data.journeys.map((j) => `<details class="journey"><summary>${esc(j.id)} · ${esc(j.title)}</summary><div><p class="muted">${esc(j.actor)} · ${esc(j.branch)}</p><p>${esc(j.steps)}</p><p><strong>Failure and recovery.</strong> ${esc(j.failure)}</p><a href="${esc(j.doc)}">Read the detailed contract</a></div></details>`).join("")}</section><section id="maintenance"><h2>Keep the tree true</h2><p>${esc(maintenance)}</p><p><a href="feature-map.json">Editable source</a> · <a href="DEVELOPER_API.md">Developer API guide</a> · <a href="REPOSITORY_STANDARDS.md">Repository standards</a> · <a href="CI.md">CI</a> · <a href="TEST_RESULTS.md">Dated evidence</a></p></section><footer>Guteneo · repository documentation · offline, without external dependencies or network requests · raw atlas kept in the repository; curated engineering views are generated separately.</footer></main><script>
const search=document.getElementById('search');const domains=[...document.querySelectorAll('.domain')];search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();let count=0;for(const domain of domains){domain.hidden=!domain.dataset.search.includes(query);domain.open=!!query&&!domain.hidden;if(!domain.hidden)count++;}for(const category of document.querySelectorAll('.category'))category.hidden=![...category.querySelectorAll('.domain')].some(d=>!d.hidden);document.getElementById('count').textContent=count+' domain'+(count===1?'':'s');document.getElementById('empty').hidden=count!==0;});const printState=new Map();window.addEventListener('beforeprint',()=>{for(const item of document.querySelectorAll('details')){printState.set(item,item.open);item.open=true;}});window.addEventListener('afterprint',()=>{for(const[item,open]of printState)item.open=open;printState.clear();});
</script></body></html>`;
for (const [filename, content] of [
  ["FEATURE_MAP.md", markdown],
  ["FEATURE_MAP.html", html],
]) {
  const url = new URL(filename, root);
  if (check) {
    if ((await readFile(url, "utf8")) !== content)
      throw new Error(`Stale ${filename}; run npm run docs:build`);
  } else await writeFile(url, content);
}
console.log(
  `${check ? "Verified" : "Generated"} feature atlas: ${data.groups.length} domains, ${featureCount} features, ${data.journeys.length} journeys, ${coveredRest.length} REST operations, ${coveredTools.length} MCP tools.`,
);
