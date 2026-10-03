import { access, readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const data = JSON.parse(
  await readFile(new URL("feature-map.json", root), "utf8"),
);
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Use node docs/build-feature-map.mjs [--check]");
if (
  data.roles.length !== 5 ||
  data.permissions.some((row) => row.length !== data.roles.length + 1)
)
  throw new Error("Invalid permission matrix");
if (
  new Set(data.groups.map((g) => g.title)).size !== data.groups.length ||
  new Set(data.journeys.map((j) => j.id)).size !== data.journeys.length
)
  throw new Error("Duplicate domain or journey");
for (const group of data.groups) {
  if (
    !group.features.length ||
    !group.tests.length ||
    !group.status ||
    !group.surfaces
  )
    throw new Error("Incomplete feature domain");
  for (const path of ["docs/" + group.doc, group.source, ...group.tests]) {
    if (path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("Invalid repository reference");
    await access(new URL("../" + path, root));
  }
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
    if (!journey[key]) throw new Error("Incomplete customer journey");
  await access(new URL(journey.doc, root));
}
async function emit(url, content) {
  if (check) {
    if ((await readFile(url, "utf8")) !== content)
      throw new Error(
        "Developer atlas is stale; run node docs/build-feature-map.mjs",
      );
  } else await writeFile(url, content);
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const cells = (row) => row.map((c) => `<td>${esc(c)}</td>`).join("");
const headers = ["Capacité", ...data.roles];
const table = `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.permissions.map((p) => `<tr><th scope="row">${esc(p[0])}</th>${cells(p.slice(1))}</tr>`).join("")}</tbody></table></div>`;
const featureCount = data.groups.reduce((n, g) => n + g.features.length, 0);
const markdown = `<!-- Generated from feature-map.json by node docs/build-feature-map.mjs -->
# Guteneo · atlas technique

> **${data.groups.length} domaines · ${featureCount} fonctionnalités · ${data.journeys.length} parcours** — mis à jour le ${data.updated}.
> ${data.scope}

Vue visuelle hors ligne : ouvrir [FEATURE_MAP.html](FEATURE_MAP.html) dans un navigateur. Source éditable : [feature-map.json](feature-map.json). Régénérer avec \`node docs/build-feature-map.mjs\`.

## Vue d’ensemble

\`\`\`mermaid
mindmap
  root((Guteneo))
    Accès
      Identité et sessions
      Équipe et droits
    Créer
      Documents sécurisés
      Modèles et designer
      Données et mappings
      Génération PDF
    Distribuer
      Fax
      Courrier postal
      E-mail et liens protégés
      Campagnes et lots
    Piloter
      Suivi et rapports
      Crédits et facturation
      Horizon et diagnostics
    Interfaces
      Web multilingue
      Assistants et API
      iPhone et iPad
    Exploiter
      Sécurité et confidentialité
      CI et publication depuis main
\`\`\`

## Droits en un coup d’œil

${data.roleNote}

| ${headers.join(" | ")} |
| ${headers.map(() => "---").join(" | ")} |
${data.permissions.map((p) => `| ${p.join(" | ")} |`).join("\n")}

Les deux options du superviseur sont indépendantes et fermées par défaut. Le rôle appartient à un atelier ; changer de rôle révoque les accès et les approbations encore en attente. Les scopes OAuth n’élèvent jamais les droits. La lecture de l’atelier n’ouvre pas les données ou PDF privés d’un autre créateur. Une demande liée peut donner une revue bornée aux approbateurs actuels ; elle n’ouvre pas la bibliothèque privée. Voir [le contrat des rôles](WORKSPACE_ROLES.md) et [le contrat du studio](TEMPLATES_DATA_DISTRIBUTION.md).

## Arbre exhaustif des fonctionnalités

${data.groups.map((g, i) => `### ${String(i + 1).padStart(2, "0")} · ${g.title}\n\n**État :** ${g.status}.\n\nContrat : [${g.doc}](${g.doc}) · Source : [${g.source}](../${g.source}).\n\n**Surfaces :** ${g.surfaces}. **Tests :** ${g.tests.map((t) => `[${t}](../${t})`).join(", ")}.\n\n${g.features.map((f) => `- ${f}`).join("\n")}`).join("\n\n")}

## Parcours clients et reprise sur erreur

${data.journeys.map((j) => `### ${j.id} · ${j.title}\n\n**Acteur :** ${j.actor}. **Branche :** ${j.branch}.\n\n${j.steps}\n\n**Blocage / reprise :** ${j.failure}\n\nRéférence : [${j.doc}](${j.doc}).`).join("\n\n")}

## Frontières d’activation et preuves

- Un merge ne prouve ni un déploiement ni l’ouverture d’un canal. Lire les capacités du compte, le manifeste public et la version distante.
- Les cartes de partage et boutons lecture sont intégrés à main par PR #43. Horizon, les garde-fous plugin #38 et cet atlas #47 sont réunis dans le candidat d’intégration #41 ; la preuve de publication reste distincte.
- Horizon requiert migrations 0050–0051, service privé qualifié et activation explicite. Souscription : administrateur navigateur ; diagnostic : droits, propriété, abonnement et quota courants.
- Invitations, e-mail, fournisseurs réels et IA ont leurs propres conditions. Ne pas activer ces services pour rendre une démonstration possible.
- Une simulation ne qualifie pas un envoi réel. Une issue inconnue exige un rapprochement ; pas de nouvelle tentative aveugle.
- Tests et qualification : [CI](CI.md), [TEST_RESULTS](TEST_RESULTS.md), [MAIN_RELEASE](MAIN_RELEASE.md). Les résultats datés restent historiques.

## Maintenance obligatoire

Chaque PR qui ajoute, modifie ou retire une fonction met à jour cet arbre, les droits et les parcours concernés dans le même changement. Décrire entrée, étapes, sortie, erreurs/reprise, canaux, données privées, activation et preuve de test. Ajouter un lien vers le contrat détaillé, le code et les tests pertinents. Régénérer Markdown et HTML, puis vérifier liens, mise en page et cohérence avec le code. La CI exécute node docs/build-feature-map.mjs --check : vues synchronisées, matrice cohérente, références existantes et parcours complets ; la revue contrôle la couverture sémantique. Aucun de ces fichiers n’est relié au build ou à la navigation du site officiel.
`;
// Backticks in the command above are emitted literally for Markdown.
await emit(new URL("FEATURE_MAP.md", root), markdown.replaceAll("\\`", "`"));
await emit(
  new URL("FEATURE_MAP.html", root),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guteneo · Atlas technique</title><style>
:root{color-scheme:light;--ink:#182338;--blue:#2153dd;--paper:#f6f3ec;--line:#dbdedf}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}a{color:var(--blue)}header{background:var(--ink);color:white;padding:54px max(24px,calc((100vw - 1280px)/2));border-bottom:7px solid var(--blue)}.eyebrow{letter-spacing:.17em;text-transform:uppercase;font-size:12px}h1{font:clamp(40px,6vw,76px)/1.08 Georgia,serif;margin:18px 0}h2{font:36px/1.2 Georgia,serif;margin-top:0}h3{margin:0 0 12px;font-size:20px}header p{max-width:750px;color:#d2dae8}.stats{display:flex;flex-wrap:wrap;gap:28px;margin-top:28px}.stats strong{font:34px Georgia,serif;display:block}.stats span{font-size:13px;color:#d2dae8}main{max-width:1280px;margin:auto;padding:28px 24px 64px}nav{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 32px}nav a{padding:8px 14px;border:1px solid var(--line);border-radius:24px;background:white;text-decoration:none}section{margin:36px 0}.note{background:#e9eefc;border-left:4px solid var(--blue);padding:16px 20px}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:24px 0}input{font:inherit;padding:12px 16px;border:1px solid #99a4b6;border-radius:8px;min-width:240px;flex:1}label{font-weight:600}.tree{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:18px}.branch{background:white;border:1px solid var(--line);border-top:4px solid var(--blue);padding:24px;border-radius:10px}.index{color:var(--blue);font:13px ui-monospace,monospace;display:block;margin-bottom:12px}.badge{display:inline-block;font-size:12px;background:#eef2fc;color:#224495;padding:4px 9px;border-radius:5px;margin-bottom:12px}.branch ul{padding-left:20px;font-size:14px}.branch li{margin:8px 0}.links{font-size:12px;overflow-wrap:anywhere}.table-wrap{overflow-x:auto;background:white;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:980px;font-size:13px}th,td{padding:14px 16px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:var(--ink);color:white}tbody th{width:230px}tr:nth-child(even){background:#f7f9fc}details{background:white;border:1px solid var(--line);border-radius:8px;margin:12px 0;padding:18px 22px}summary{cursor:pointer;font-weight:650}summary span{color:var(--blue);font:13px ui-monospace,monospace;margin-right:16px}.steps{border-left:3px solid var(--blue);padding-left:18px}.muted{color:#536079;font-size:14px}footer{border-top:1px solid var(--line);padding-top:24px;font-size:13px}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid var(--blue);outline-offset:4px}[hidden]{display:none!important}@media print{header{color:var(--ink);background:white}.toolbar,nav{display:none}.tree{display:block}.branch,details{break-inside:avoid;margin-bottom:16px}header p,.stats span{color:var(--ink)}table{min-width:0;font-size:10px}th,td{padding:6px}}@media(max-width:600px){header{padding:36px 24px}main{padding:20px 16px}.stats{gap:20px}h2{font-size:30px}}
</style></head><body><header><div class="eyebrow">Documentation développeurs · ${esc(data.updated)}</div><h1>Le produit,<br>branche par branche.</h1><p>Un atlas pour comprendre Guteneo : fonctionnalités, responsabilités et parcours clients, reliés aux contrats et aux sources.</p><div class="stats"><div><strong>${data.groups.length}</strong><span>domaines</span></div><div><strong>${featureCount}</strong><span>fonctionnalités</span></div><div><strong>${data.journeys.length}</strong><span>parcours</span></div><div><strong>4 + 1</strong><span>rôles humains + acteur assistant</span></div></div></header><main><nav aria-label="Sections"><a href="#roles">Droits</a><a href="#features">Arbre des features</a><a href="#journeys">Parcours clients</a><a href="#boundaries">Activation & maintenance</a></nav><p class="note">${esc(data.scope)} Cette vue reste dans le dépôt ; aucun lien depuis le site officiel.</p><section id="roles"><div class="eyebrow">01 / Responsabilités</div><h2>Qui peut faire quoi ?</h2><p>${esc(data.roleNote)}</p>${table}<p class="muted">Superviseur : Approbation et Rapports sont indépendants. OAuth n’élève pas le rôle. Les données et PDF privés restent soumis à la propriété ; une revue d’envoi ouvre seulement son contexte lié.</p></section><section id="features"><div class="eyebrow">02 / Cartographie</div><h2>L’arbre des fonctionnalités</h2><div class="toolbar"><label for="search">Rechercher</label><input id="search" type="search" placeholder="Fax, modèle, langue, quota…"><span id="count" role="status" aria-live="polite">${data.groups.length} domaines</span></div><div class="tree">${data.groups.map((g, i) => `<article class="branch" data-search="${esc([g.title, ...g.features].join(" ").toLocaleLowerCase("fr"))}"><span class="index">GUTENEO / ${String(i + 1).padStart(2, "0")}</span><h3>${esc(g.title)}</h3><span class="badge">${esc(g.status)}</span><p class="muted">${esc(g.surfaces)}</p><ul>${g.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><p class="links"><a href="${esc(g.doc)}">Contrat technique ↗</a><br><a href="../${esc(g.source)}">${esc(g.source)}</a><br>${g.tests.map((t) => `<a href="../${esc(t)}">Test : ${esc(t)}</a>`).join("<br>")}</p></article>`).join("")}</div><p id="empty" hidden>Aucun domaine trouvé. Essayez un autre terme.</p></section><section id="journeys"><div class="eyebrow">03 / Expérience client</div><h2>Du besoin au résultat</h2><p>Chaque parcours nomme l’acteur, les étapes et la conduite à tenir en cas de blocage.</p>${data.journeys.map((j) => `<details><summary><span>${esc(j.id)}</span>${esc(j.title)}</summary><p class="muted">${esc(j.actor)} · ${esc(j.branch)}</p><p class="steps">${esc(j.steps)}</p><p><strong>Blocage / reprise.</strong> ${esc(j.failure)}</p><a href="${esc(j.doc)}">Ouvrir le contrat technique ↗</a></details>`).join("")}</section><section id="boundaries"><div class="eyebrow">04 / Contrat développeur</div><h2>Maintenir une carte fidèle</h2><p class="note">Chaque évolution doit mettre à jour l’arbre, la matrice des droits et les parcours affectés dans la même PR.</p><p>Décrire entrées, sorties, erreurs/reprise, confidentialité, surfaces, activation, sources et tests. La source éditable est <a href="feature-map.json">feature-map.json</a> ; régénérer avec <code>node docs/build-feature-map.mjs</code>. Le <a href="FEATURE_MAP.md">Markdown</a> offre la même carte sur GitHub.</p><p>Les cartes de partage (#43) sont intégrées à main. Horizon, les garde-fous plugin (#38) et cet atlas (#47) sont réunis dans le candidat d’intégration #41. Un merge ne prouve ni activation ni publication. Les capacités du compte, <code>/release.json</code>, la CI du commit et la preuve distante font foi. Les services fermés restent fermés jusqu’à qualification ; les simulations restent distinctes des opérations réelles.</p><p><a href="MAIN_RELEASE.md">Publication depuis main</a> · <a href="CI.md">CI</a> · <a href="WORKSPACE_ROLES.md">Contrat des rôles</a> · <a href="TEST_RESULTS.md">Preuves datées</a></p></section><footer>Guteneo · documentation technique du dépôt · sans dépendance externe, sans requête réseau, sans intégration au site officiel.</footer></main><script>
const search=document.getElementById('search');const cards=[...document.querySelectorAll('.branch')];search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase('fr');let visible=0;for(const card of cards){card.hidden=!card.dataset.search.includes(query);if(!card.hidden)visible++;}document.getElementById('count').textContent=visible+' domaine'+(visible>1?'s':'');document.getElementById('empty').hidden=visible!==0;});
</script></body></html>`,
);
console.log(
  `${check ? "Verified" : "Generated"} developer map: ${data.groups.length} domains, ${featureCount} features, ${data.journeys.length} journeys.`,
);
