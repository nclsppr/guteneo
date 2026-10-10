const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll("[data-tab]")];
const checkButtons = [...document.querySelectorAll("[data-check-filter]")];
const coverageButtons = [...document.querySelectorAll("[data-filter]")];
let latest = null,
  checkFilter = "all",
  coverageFilter = "all",
  busy = false,
  failed = false,
  starting = false,
  signature = "",
  lastReadAt = 0;
const openStates = new Map();
const time = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fullTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "long",
  timeStyle: "medium",
});
const names = {
  "/": "Afficher l’accueil en français",
  "/?lang=en": "Afficher l’accueil en anglais",
  "/?lang=de": "Afficher l’accueil en allemand",
  "/?lang=lb": "Afficher l’accueil en luxembourgeois",
  "/roles/": "Afficher le guide des rôles",
  "/developpeurs/": "Afficher le guide développeur",
  "/assistants/chatgpt/": "Afficher le guide ChatGPT",
  "/release.json": "Identifier la version publique",
  "/api/health": "Vérifier l’état annoncé par l’API",
  "/api/capabilities": "Vérifier la cohérence de la configuration",
  "/api/documents": "Refuser les documents sans connexion",
  "/api/dispatches": "Refuser les envois sans connexion",
  "/api/overview": "Refuser la synthèse sans connexion",
  "/mcp": "Refuser l’accès MCP sans authentification",
};
const expectations = {
  public_page:
    "HTTP 200, type HTML, taille et SHA-256 conformes au manifeste, langue attendue, nosniff, CSP avec frame-ancestors 'none' et absence de noindex/none dans X-Robots-Tag.",
  release:
    "HTTP 200, manifeste de production hors preview et source propre ; commit et empreintes au format attendu, liste d’assets présente. Indicateur d’envoi cohérent avec les capacités de cette collecte.",
  liveness:
    "HTTP 200, état déclaré « ok », mode production et indicateur d’envoi booléen cohérent avec les capacités.",
  configuration:
    "HTTP 200, mode production, simulation désactivée, inscription annoncée active et scanner annoncé raccordé. Canaux reconnus et interrupteurs fax, e-mail et postal cohérents avec le manifeste.",
  access_control: "HTTP 401 et en-tête Cache-Control contenant no-store.",
};
const limits = {
  public_page:
    "Contrôle du contenu publié et de protections ciblées ; les interactions du navigateur ne sont pas exercées.",
  release:
    "Les empreintes déclarées ne sont pas une attestation indépendante du build.",
  liveness:
    "Ne teste pas la base de données, les fichiers, Auth0, les files ni les fournisseurs.",
  configuration:
    "Une configuration annoncée ne prouve pas le fonctionnement réel du scanner ou des fournisseurs.",
  access_control:
    "Refus anonyme de cette route uniquement ; les rôles et l’isolation entre ateliers restent à qualifier.",
};
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function put(id, text) {
  if ($(id).textContent !== text) $(id).textContent = text;
}
function badge(text, state) {
  return node("span", text, `badge ${state}`);
}
function step(dl, label, value) {
  const row = node("div");
  row.append(node("dt", label), node("dd", value));
  dl.append(row);
}
function expectedKind(path) {
  if (
    ["/api/documents", "/api/dispatches", "/api/overview", "/mcp"].includes(
      path,
    )
  )
    return "access_control";
  return path === "/release.json"
    ? "release"
    : path === "/api/health"
      ? "liveness"
      : path === "/api/capabilities"
        ? "configuration"
        : "public_page";
}
function valid(d) {
  return (
    d &&
    d.schema === 1 &&
    (d.checkedAt === null || Number.isFinite(Date.parse(d.checkedAt))) &&
    Number.isInteger(d.staleAfterSeconds) &&
    d.staleAfterSeconds > 0 &&
    d.staleAfterSeconds <= 86400 &&
    ["fresh", "stale", "missing"].includes(d.freshness) &&
    Array.isArray(d.checks) &&
    d.checks.length ===
      (d.checkedAt === null ? 0 : Object.keys(names).length) &&
    new Set(d.checks.map((c) => c?.path)).size === d.checks.length &&
    Array.isArray(d.coverage) &&
    d.coverage.length === Object.keys(featureDescriptions).length &&
    new Set(d.coverage.map((c) => c?.feature)).size === d.coverage.length &&
    (d.sourceCommit === null ||
      (typeof d.sourceCommit === "string" &&
        /^[a-f0-9]{40}$/.test(d.sourceCommit))) &&
    ["public_checks_passed", "attention", "unknown"].includes(d.status) &&
    d.checks.every(
      (c) =>
        c &&
        ["pass", "fail"].includes(c.status) &&
        c.origin === "https://guteneo.com" &&
        Object.hasOwn(names, c.path) &&
        c.kind === expectedKind(c.path) &&
        (c.status !== "pass" ||
          c.httpStatus === (c.kind === "access_control" ? 401 : 200)),
    ) &&
    d.coverage.every(
      (c) =>
        c &&
        Object.hasOwn(featureDescriptions, c.feature) &&
        typeof c.evidence === "string" &&
        ["not_checked", "disabled"].includes(c.state),
    )
  );
}
function publicChecks() {
  return latest
    ? latest.checks.filter((c) => c.origin === "https://guteneo.com")
    : [];
}
function hasMeasure() {
  return !!latest && Number.isFinite(Date.parse(latest.checkedAt));
}
function ageLabel() {
  if (!hasMeasure()) return "Indisponible";
  const seconds = Math.floor(
    (Date.now() - Date.parse(latest.checkedAt)) / 1000,
  );
  if (seconds < 0)
    return seconds < -30 ? "Horloge à vérifier" : "Moins d’une minute";
  if (seconds < 60) return "Moins d’une minute";
  const minutes = Math.floor(seconds / 60);
  return minutes + " min";
}
function updateAge() {
  const label = ageLabel();
  put("measure-age", hasMeasure() ? "Âge : " + label : "Âge inconnu");
  put("operations-measure-age", label);
}
function setBadge(id, label, state) {
  const el = $(id);
  put(id, label);
  el.className = "badge " + state;
}
function setState(state, title, detail) {
  $("live-state").dataset.state = state;
  put("state-title", title);
  put("state-detail", detail);
  const current = ["pass", "attention"].includes(state);
  for (const id of ["summary-grid", "probes", "coverage"])
    $(id).dataset.current = String(current);
  put("proof-caption", current ? "Dernière mesure" : "Dernière preuve reçue");
  put(
    "freshness-label",
    current
      ? "Mesure récente"
      : state === "loading"
        ? "En attente"
        : "État actuel inconnu",
  );
  put(
    "service-explanation",
    current
      ? "Le fonctionnement complet de ces parcours n’est pas établi par les mesures publiques. Une preuve absente ne signifie pas une panne."
      : "La situation actuelle n’est pas connue. Les éventuels résultats ci-dessous proviennent de la dernière preuve reçue.",
  );
  put(
    "live-explanation",
    !current
      ? "Les résultats ci-dessous sont la dernière preuve reçue ; ils ne décrivent pas l’état actuel."
      : publicChecks().some((c) => c.status === "fail")
        ? "Les contrôles en écart sont à examiner. Ouvrez leur preuve pour comparer l’attendu et l’observé."
        : "Ces contrôles vérifient les pages, la configuration et le refus des accès anonymes. Les parcours métier sont évalués séparément.",
  );
  const checks = publicChecks(),
    bad = checks.filter((c) => c.status === "fail").length;
  setBadge(
    "public-evidence-state",
    current
      ? bad
        ? bad + " en écart"
        : checks.length + " contrôles réussis"
      : hasMeasure()
        ? "Preuve historique"
        : "Aucune mesure",
    current ? (bad ? "failure" : "success") : "historical",
  );
  setBadge(
    "operations-measure-state",
    current
      ? bad
        ? "À examiner"
        : "Mesure récente"
      : state === "loading"
        ? "En attente"
        : "État inconnu",
    current ? (bad ? "failure" : "success") : "historical",
  );
  put(
    "operations-measure-proof",
    hasMeasure()
      ? checks.length -
          bad +
          " contrôles réussis sur " +
          checks.length +
          " · " +
          fullTime.format(new Date(latest.checkedAt)) +
          " · Paris."
      : "Aucune mesure reçue.",
  );
}
function updateFreshness() {
  updateAge();
  if (failed) {
    setState(
      starting ? "loading" : "offline",
      starting
        ? "Première mesure en cours"
        : "Mesure indisponible — état actuel inconnu",
      latest
        ? "Les résultats précédents restent consultables avec leur date."
        : starting
          ? "Le moniteur prépare sa première preuve."
          : "Aucune mesure exploitable n’a été reçue.",
    );
    return;
  }
  if (!latest) return;
  if (!hasMeasure() || latest.freshness === "missing") {
    setState(
      "unknown",
      "Première mesure attendue",
      "Aucune observation de production exploitable n’est encore disponible.",
    );
    return;
  }
  const age = Date.now() - Date.parse(latest.checkedAt);
  if (
    age > latest.staleAfterSeconds * 1000 ||
    age < -30000 ||
    latest.freshness === "stale" ||
    latest.status === "unknown"
  ) {
    setState(
      "stale",
      "Preuve périmée — état actuel inconnu",
      "Les résultats précédents restent consultables avec leur date.",
    );
    return;
  }
  const checks = publicChecks(),
    bad = checks.filter((c) => c.status === "fail"),
    untested = latest.coverage.filter((c) => c.state === "not_checked").length;
  if (!checks.length)
    setState(
      "offline",
      "Aucun contrôle public exploitable",
      "Le fonctionnement du service reste à vérifier.",
    );
  else if (bad.length)
    setState(
      "attention",
      bad.length +
        " contrôle" +
        (bad.length > 1 ? "s" : "") +
        " public" +
        (bad.length > 1 ? "s" : "") +
        " en écart",
      "Une vérification est nécessaire. Ce constat ne suffit pas à qualifier tous les parcours.",
    );
  else if (checks.length !== 14)
    setState(
      "attention",
      "Mesure publique incomplète",
      checks.length + " contrôles reçus sur les 14 attendus.",
    );
  else if (untested)
    setState(
      "attention",
      "Site public vérifié · parcours métier à confirmer",
      checks.length +
        " contrôles publics réussis. " +
        untested +
        " fonctionnalités sans preuve complète en production.",
    );
  else
    setState(
      "pass",
      "Contrôles publics réussis",
      "Ce résultat porte uniquement sur les contrôles publics affichés.",
    );
}
function preserve(container) {
  for (const detail of container.querySelectorAll("details[data-key]"))
    openStates.set(detail.dataset.key, detail.open);
  return container.contains(document.activeElement)
    ? document.activeElement.dataset.focus
    : null;
}
function restore(container, key) {
  if (key)
    for (const el of container.querySelectorAll("[data-focus]"))
      if (el.dataset.focus === key) {
        el.focus({ preventScroll: true });
        break;
      }
}
function details(key, cls, defaultOpen = false) {
  const el = node("details", undefined, cls);
  el.dataset.key = key;
  el.open = openStates.has(key) ? openStates.get(key) : defaultOpen;
  return el;
}
function checkName(c) {
  return names[c.path] ?? c.path;
}
function groupId(c) {
  if (c.kind === "public_page") return "pages";
  if (c.kind === "access_control") return "access";
  return "api";
}
function renderChecks(forceOpen = false) {
  if (!latest) return;
  const list = $("probes"),
    focus = preserve(list),
    query = $("check-search").value.trim().toLocaleLowerCase("fr");
  const checks = publicChecks().filter(
    (c) =>
      (checkFilter === "all" || c.status === checkFilter) &&
      (!query ||
        `${checkName(c)} ${c.origin} ${c.path}`
          .toLocaleLowerCase("fr")
          .includes(query)),
  );
  list.replaceChildren();
  for (const [id, title] of [
    ["pages", "Pages publiques"],
    ["api", "API et configuration"],
    ["access", "Protection des accès"],
  ]) {
    const rows = checks.filter((c) => groupId(c) === id);
    if (!rows.length) continue;
    const fails = rows.filter((c) => c.status === "fail").length;
    const group = details(`group:${id}`, "feature-group", fails > 0);
    if (forceOpen && (query || checkFilter !== "all")) group.open = true;
    const summary = node("summary");
    summary.dataset.focus = `group:${id}`;
    summary.append(
      node("span", title),
      node("span", `${rows.length} contrôles`, "group-count"),
      badge(
        fails ? `${fails} en écart` : `${rows.length} réussis`,
        fails ? "failure" : "success",
      ),
    );
    group.append(summary);
    for (const c of rows) {
      const key = `probe:${c.origin}${c.path}`,
        item = details(key, "scenario");
      item.dataset.status = c.status;
      const heading = node("summary");
      heading.dataset.focus = key;
      heading.append(
        node("span", checkName(c), "scenario-name"),
        badge(
          c.status === "pass" ? "Réussi" : "En écart",
          c.status === "pass" ? "success" : "failure",
        ),
        node(
          "span",
          Number.isFinite(c.durationMs) ? `${c.durationMs} ms` : "—",
          "duration",
        ),
      );
      item.append(heading);
      const body = node("div", undefined, "detail-body"),
        steps = node("dl", undefined, "steps");
      step(steps, "Requête", `GET ${c.origin}${c.path}`);
      let expected =
        expectations[c.kind] ?? "Contrat non décrit pour ce type de contrôle.";
      step(steps, "Attendu", expected);
      const http = Number.isInteger(c.httpStatus)
        ? `HTTP ${c.httpStatus}`
        : "Aucun code HTTP reçu";
      step(
        steps,
        "Observé",
        `${http} · verdict du contrôle : ${c.status === "pass" ? "réussi" : "en écart"}.`,
      );
      if (c.status === "fail") {
        const expectedHttp = c.kind === "access_control" ? 401 : 200;
        if (typeof c.code === "string" && /^[A-Z0-9_]{1,80}$/.test(c.code))
          step(steps, "Diagnostic", c.code);
        step(
          steps,
          "Écart",
          c.httpStatus !== expectedHttp
            ? `HTTP ${expectedHttp} attendu ; ${http.toLowerCase()} observé.`
            : "Le code HTTP attendu a été reçu, mais l’ensemble du contrôle n’a pas été validé. Le détail de la condition en échec n’est pas exporté.",
        );
      }
      step(
        steps,
        "Mesure",
        `${fullTime.format(new Date(latest.checkedAt))} · heure de Paris`,
      );
      step(
        steps,
        "Portée",
        limits[c.kind] ?? "Résultat limité au contrat de cette sonde.",
      );
      body.append(steps);
      item.append(body);
      group.append(item);
    }
    list.append(group);
  }
  if (!checks.length)
    list.append(
      node("p", "Aucun contrôle ne correspond à ces filtres.", "empty"),
    );
  put(
    "result-count",
    `${checks.length} contrôle${checks.length > 1 ? "s" : ""} affiché${checks.length > 1 ? "s" : ""} sur ${publicChecks().length} · ouvrir un résultat pour voir sa preuve`,
  );
  restore(list, focus);
}
const featureNames = {
  "Connexion Auth0": "Connexion et session",
  "Cron, files, callbacks, sauvegardes": "Traitements et sauvegardes",
  "Assistants MCP": "Assistants connectés",
  "Horizon / validation PDF": "Diagnostic PDF",
  "Paiements Stripe": "Paiements",
  "Propositions IA": "Aide à la création",
};
const featureDescriptions = {
  "Connexion Auth0":
    "Se connecter à son atelier et conserver une session valide.",
  "PDF : import, antivirus, rendu":
    "Importer un PDF, vérifier sa sécurité et consulter toutes ses pages.",
  "Studio : modèles, données, génération":
    "Créer un document à partir d’un modèle et de données.",
  "Cron, files, callbacks, sauvegardes":
    "Terminer les traitements différés et préserver les données.",
  "Assistants MCP":
    "Utiliser un assistant autorisé pour consulter et préparer ses documents.",
  Fax: "Préparer un fax et suivre son acheminement.",
  "Courrier postal": "Préparer un courrier et suivre sa prise en charge.",
  "E-mail": "Préparer un message et suivre son acheminement.",
  "Horizon / validation PDF": "Obtenir un diagnostic automatique du PDF.",
  "Paiements Stripe": "Effectuer un paiement.",
  "Propositions IA":
    "Recevoir une proposition de contenu à vérifier avant utilisation.",
};
function renderCoverage() {
  if (!latest) return;
  const list = $("coverage"),
    focus = preserve(list),
    features = latest.coverage.filter(
      (c) => coverageFilter === "all" || c.state === coverageFilter,
    );
  list.replaceChildren();
  for (const feature of features) {
    const key = "feature:" + feature.feature,
      item = details(key, "business-row"),
      summary = node("summary");
    summary.dataset.focus = key;
    summary.append(
      node(
        "span",
        featureNames[feature.feature] ?? feature.feature,
        "scenario-name",
      ),
      badge(
        !hasMeasure()
          ? "État non mesuré"
          : feature.state === "disabled"
            ? "Désactivé"
            : "Non vérifié de bout en bout",
        feature.state === "disabled" ? "disabled" : "pending",
      ),
    );
    const body = node("div", undefined, "detail-body"),
      steps = node("dl", undefined, "steps");
    step(
      steps,
      "Fonction",
      featureDescriptions[feature.feature] ??
        "Fonctionnalité suivie dans le rapport.",
    );
    step(
      steps,
      "Situation connue",
      !hasMeasure()
        ? "Aucune mesure actuelle n’a été reçue pour cette fonctionnalité."
        : feature.state === "disabled"
          ? "Fonction annoncée désactivée dans la dernière configuration reçue."
          : "Aucune preuve complète et actuelle de ce parcours en production n’est disponible dans ce rapport.",
    );
    step(
      steps,
      "Portée",
      feature.state === "disabled"
        ? "Ce statut décrit sa configuration ; aucun succès de parcours n’est revendiqué."
        : "Les contrôles publics ne suffisent pas à conclure que cette fonction réussit ou échoue.",
    );
    body.append(steps);
    item.append(summary, body);
    list.append(item);
  }
  if (!features.length)
    list.append(
      node("p", "Aucune fonctionnalité dans cette catégorie.", "empty"),
    );
  put(
    "coverage-count",
    features.length +
      " fonctionnalité" +
      (features.length > 1 ? "s" : "") +
      " affichée" +
      (features.length > 1 ? "s" : "") +
      " sur " +
      latest.coverage.length,
  );
  restore(list, focus);
}
function renderSnapshot() {
  const checks = publicChecks(),
    pass = checks.filter((c) => c.status === "pass").length,
    bad = checks.length - pass;
  put("passed-count", hasMeasure() ? String(pass) : "—");
  put("failed-count", hasMeasure() ? String(bad) : "—");
  put(
    "untested-count",
    hasMeasure()
      ? String(latest.coverage.filter((c) => c.state === "not_checked").length)
      : "—",
  );
  put(
    "disabled-count",
    hasMeasure()
      ? String(latest.coverage.filter((c) => c.state === "disabled").length)
      : "—",
  );
  put("public-total", `${checks.length} contrôles`);
  put("business-total", `${latest.coverage.length} fonctionnalités`);
  put("tab-public-count", checks.length + " contrôles");
  put(
    "checked-time",
    hasMeasure()
      ? time.format(new Date(latest.checkedAt)) + " · Paris"
      : "Aucune mesure",
  );
  $("checked-time").dateTime = latest.checkedAt ?? "";
  $("checked-time").title = hasMeasure()
    ? fullTime.format(new Date(latest.checkedAt))
    : "";
  renderChecks();
  renderCoverage();
  updateFreshness();
}
const tabAliases = {
  business: "service",
  public: "verification",
  coverage: "operations",
};
function selectTab(name, focus = false) {
  name = tabAliases[name] ?? name;
  if (!tabs.some((b) => b.dataset.tab === name)) name = "service";
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`panel-${tab.dataset.tab}`).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  history.replaceState(null, "", `#${name}`);
}
function setCheckFilter(value) {
  checkFilter = value;
  for (const button of checkButtons)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.checkFilter === value),
    );
  renderChecks(true);
}
function setCoverageFilter(value) {
  coverageFilter = value;
  for (const button of coverageButtons)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === value),
    );
  renderCoverage();
}
async function refresh() {
  if (busy) return;
  busy = true;
  starting = false;
  $("refresh").disabled = true;
  try {
    const response = await fetch("/api/status", {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok && response.status !== 503) throw new Error("unavailable");
    const raw = await response.text();
    if (raw.length > 65536) throw new Error("size");
    const data = JSON.parse(raw);
    starting = data?.status === "starting";
    if (!valid(data)) throw new Error("invalid");
    if (response.status === 503) data.freshness = "stale";
    latest = data;
    lastReadAt = Date.now();
    failed = false;
    starting = false;
    const next = JSON.stringify(data);
    if (next !== signature) {
      signature = next;
      renderSnapshot();
    } else updateFreshness();
  } catch {
    failed = true;
    updateFreshness();
  } finally {
    busy = false;
    $("refresh").disabled = false;
  }
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next].dataset.tab, true);
  });
}
for (const button of checkButtons)
  button.addEventListener("click", () =>
    setCheckFilter(button.dataset.checkFilter),
  );
for (const button of coverageButtons)
  button.addEventListener("click", () =>
    setCoverageFilter(button.dataset.filter),
  );
for (const button of document.querySelectorAll("[data-shortcut]"))
  button.addEventListener("click", () => {
    const value = button.dataset.shortcut,
      isPublic = ["pass", "fail"].includes(value);
    if (isPublic) {
      $("check-search").value = "";
      setCheckFilter(value);
    } else setCoverageFilter(value);
    selectTab(isPublic ? "verification" : "service");
    const target = isPublic
      ? checkButtons.find((b) => b.dataset.checkFilter === value)
      : coverageButtons.find((b) => b.dataset.filter === value);
    target.focus({ preventScroll: true });
    $("panel-" + (isPublic ? "verification" : "service")).scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  });
$("check-search").addEventListener("input", () => renderChecks(true));
$("refresh").addEventListener("click", () => {
  refresh();
  loadHistory();
  loadQualification();
});
window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (tabs.some((b) => b.dataset.tab === name) || tabAliases[name])
    selectTab(name);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastReadAt >= 900000) {
    refresh();
    loadHistory();
  }
});

let historyDays = 7,
  historyRequest = 0;
const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
function dayLabel(value) {
  return dayFormat.format(new Date(value + "T00:00:00Z"));
}
function number(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(
    value,
  );
}
async function readJson(url) {
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("unavailable");
  const raw = await response.text();
  if (raw.length > 500000) throw new Error("size");
  return JSON.parse(raw);
}
function validHistory(d) {
  return (
    d &&
    d.schema === 1 &&
    d.days === historyDays &&
    Number.isFinite(Date.parse(d.generatedAt)) &&
    (d.collectionStartedAt === null ||
      Number.isFinite(Date.parse(d.collectionStartedAt))) &&
    Array.isArray(d.buckets) &&
    d.buckets.length === historyDays &&
    new Set(d.buckets.map((b) => b.date)).size === historyDays &&
    d.buckets.every(
      (b) =>
        b &&
        /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
        Number.isFinite(Date.parse(b.date + "T00:00:00Z")) &&
        [
          "expectedSamples",
          "observedSamples",
          "passedSamples",
          "unknownSamples",
        ].every((k) => Number.isInteger(b[k]) && b[k] >= 0) &&
        b.passedSamples <= b.observedSamples &&
        b.unknownSamples ===
          Math.max(0, b.expectedSamples - b.observedSamples) &&
        (b.availabilityPercent === null ||
          (Number.isFinite(b.availabilityPercent) &&
            b.availabilityPercent >= 0 &&
            b.availabilityPercent <= 100)) &&
        (b.latencyMs === null ||
          (Number.isFinite(b.latencyMs) && b.latencyMs >= 0)) &&
        (b.observedSamples === 0
          ? b.availabilityPercent === null
          : b.availabilityPercent !== null &&
            Math.abs(
              b.availabilityPercent -
                (100 * b.passedSamples) / b.observedSamples,
            ) <= 0.011),
    )
  );
}
function clearHistory(message) {
  put("history-state", message);
  for (const id of [
    "history-availability",
    "history-coverage",
    "history-latency",
  ])
    put(id, "—");
  $("history-chart").replaceChildren(
    node("p", "Aucune donnée exploitable pour cette période.", "history-empty"),
  );
  $("history-chart").setAttribute(
    "aria-label",
    "Historique indisponible ; aucune disponibilité ne peut être déduite.",
  );
  $("history-rows").replaceChildren();
  put("history-range", "Journées en UTC");
  put(
    "history-start",
    "L’historique ne peut pas être confirmé actuellement. Aucun jour vide n’est considéré comme réussi.",
  );
}
function renderHistory(data) {
  const buckets = [...data.buckets].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const observed = buckets.reduce((n, b) => n + b.observedSamples, 0),
    expected = buckets.reduce((n, b) => n + b.expectedSamples, 0),
    passed = buckets.reduce((n, b) => n + b.passedSamples, 0),
    unknown = buckets.reduce((n, b) => n + b.unknownSamples, 0);
  const latencyBuckets = buckets.filter(
      (b) => b.latencyMs !== null && b.observedSamples > 0,
    ),
    latencyWeight = latencyBuckets.reduce((n, b) => n + b.observedSamples, 0),
    latency = latencyWeight
      ? latencyBuckets.reduce(
          (n, b) => n + b.latencyMs * b.observedSamples,
          0,
        ) / latencyWeight
      : null;
  put(
    "history-availability",
    observed ? number((100 * passed) / observed) + " %" : "Aucune mesure",
  );
  put(
    "history-coverage",
    expected
      ? observed + " / " + expected
      : observed
        ? observed + " reçues"
        : "Aucune collecte",
  );
  put(
    "history-latency",
    latency === null ? "Non mesurée" : number(latency) + " ms",
  );
  put(
    "history-state",
    observed
      ? passed +
          (passed > 1 ? " mesures réussies sur " : " mesure réussie sur ") +
          observed +
          (observed > 1 ? " reçues." : " reçue.") +
          (unknown
            ? " " +
              unknown +
              (unknown > 1
                ? " mesures attendues non reçues."
                : " mesure attendue non reçue.")
            : "")
      : "Aucune mesure enregistrée sur cette période.",
  );
  put(
    "history-range",
    dayLabel(buckets[0].date) +
      " — " +
      dayLabel(buckets.at(-1).date) +
      " · UTC",
  );
  put(
    "history-start",
    data.collectionStartedAt
      ? "Collecte commencée le " +
          fullTime.format(new Date(data.collectionStartedAt)) +
          " · Paris. Aucun historique antérieur n’est reconstitué."
      : "La collecte n’a pas encore fourni de première mesure. Aucun historique antérieur n’est reconstitué.",
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 100");
  svg.setAttribute("aria-hidden", "true");
  const width = 1000 / buckets.length;
  for (const [index, bucket] of buckets.entries()) {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    const empty = bucket.observedSamples === 0;
    const height = empty
      ? 80
      : Math.max(3, (80 * bucket.availabilityPercent) / 100);
    rect.setAttribute("x", String(index * width));
    rect.setAttribute("y", String(85 - height));
    rect.setAttribute(
      "width",
      String(Math.max(0.8, width - (historyDays === 365 ? 0.7 : 2))),
    );
    rect.setAttribute("height", String(height));
    rect.setAttribute("rx", historyDays === 365 ? "0" : "1");
    rect.setAttribute(
      "class",
      empty
        ? "bar-empty"
        : bucket.availabilityPercent === 100
          ? "bar-success"
          : "bar-failure",
    );
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent =
      dayLabel(bucket.date) +
      " : " +
      (empty
        ? "aucune mesure"
        : number(bucket.availabilityPercent) + " % de réussite observée") +
      " ; " +
      bucket.observedSamples +
      " / " +
      bucket.expectedSamples +
      " mesures.";
    rect.append(title);
    svg.append(rect);
  }
  $("history-chart").replaceChildren(svg);
  $("history-chart").setAttribute(
    "aria-label",
    historyDays +
      " jours : " +
      (observed
        ? number((100 * passed) / observed) +
          " % de réussite sur les mesures reçues, couverture " +
          observed +
          " sur " +
          expected +
          "."
        : "aucune mesure enregistrée.") +
      " Les jours gris ne comportent aucune mesure. Le tableau fournit les valeurs exactes.",
  );
  const body = $("history-rows");
  body.replaceChildren();
  for (const bucket of buckets) {
    const row = node("tr"),
      label = node("th", dayLabel(bucket.date));
    label.scope = "row";
    row.append(
      label,
      node(
        "td",
        bucket.availabilityPercent === null
          ? "Sans mesure"
          : number(bucket.availabilityPercent) + " %",
      ),
      node("td", bucket.observedSamples + " / " + bucket.expectedSamples),
      node(
        "td",
        bucket.latencyMs === null
          ? "Non mesurée"
          : number(bucket.latencyMs) + " ms",
      ),
    );
    body.append(row);
  }
}
async function loadHistory() {
  const request = ++historyRequest;
  put("history-state", "Lecture de l’historique…");
  try {
    const data = await readJson("/api/history?days=" + historyDays);
    if (request !== historyRequest) return;
    if (!validHistory(data)) throw new Error("invalid");
    renderHistory(data);
  } catch {
    if (request === historyRequest)
      clearHistory("Historique indisponible. Réessayez en relisant la mesure.");
  }
}
for (const button of document.querySelectorAll("[data-days]"))
  button.addEventListener("click", () => {
    historyDays = Number(button.dataset.days);
    for (const b of document.querySelectorAll("[data-days]"))
      b.setAttribute("aria-pressed", String(b === button));
    loadHistory();
  });
function qualificationDetails(d) {
  const detail = $("qualification-detail");
  detail.hidden = true;
  for (const [id, items, title] of [
    ["qualification-scope", d?.scope, "Parcours exercés"],
    ["qualification-limits", d?.limitations, "Limites de la preuve"],
  ]) {
    const host = $(id);
    host.replaceChildren();
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > 20 ||
      !items.every((item) => typeof item === "string" && item.length < 1000)
    )
      continue;
    host.append(node("h4", title));
    const list = node("ul");
    for (const item of items) list.append(node("li", item));
    host.append(list);
    detail.hidden = false;
  }
}
async function loadQualification() {
  try {
    const d = await readJson("/qualification.json");
    if (
      !d ||
      d.schema !== 1 ||
      d.environment !== "local" ||
      !["passed", "failed"].includes(d.status) ||
      !Number.isFinite(Date.parse(d.executedAt)) ||
      !d.counts ||
      !["testsPassed", "testsFailed", "suitesPassed", "suitesFailed"].every(
        (k) => Number.isInteger(d.counts[k]) && d.counts[k] >= 0,
      )
    )
      throw new Error("invalid");
    const isolated = d.networkPolicy === "external_blocked",
      passed =
        d.status === "passed" &&
        d.counts.testsFailed === 0 &&
        d.counts.testsSkipped === 0 &&
        d.sourceUnchangedDuringRun === true &&
        typeof d.sourceSnapshotSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(d.sourceSnapshotSha256) &&
        d.counts.suitesFailed === 0 &&
        d.counts.suitesPassed > 0 &&
        d.counts.testsPassed > 0 &&
        isolated &&
        d.providerMode === "simulated";
    setBadge(
      "qualification-state",
      passed
        ? d.counts.testsPassed + " tests · local"
        : "Qualification incomplète",
      passed ? "success" : "pending",
    );
    put(
      "qualification-summary",
      passed
        ? "Code applicatif exercé localement : " +
            d.counts.testsPassed +
            " tests réussis, " +
            d.counts.suitesPassed +
            " fichiers de tests. Réseau externe bloqué ; fournisseur de livraison simulé. Cette preuve ne qualifie pas la production."
        : "Le rapport local ne permet pas de conclure à une qualification complète. " +
            (isolated
              ? "Le blocage du réseau externe est vérifié."
              : "Le blocage du réseau externe reste non prouvé.") +
            " Les détails d’exécution doivent être examinés par l’équipe.",
    );
    put(
      "qualification-date",
      "Exécuté le " +
        fullTime.format(new Date(d.executedAt)) +
        " · Paris." +
        (passed
          ? " Sources vérifiées : " + d.sourceSnapshotSha256.slice(0, 12) + "."
          : ""),
    );
    qualificationDetails(d);
  } catch {
    qualificationDetails(null);
    setBadge("qualification-state", "Preuve indisponible", "pending");
    put(
      "qualification-summary",
      "Aucun rapport local exploitable n’est disponible. Aucun résultat local ni de production n’est déduit de cette absence.",
    );
    put("qualification-date", "Date de qualification indisponible.");
  }
}

selectTab(location.hash.slice(1));
if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
  $("preview-banner").hidden = false;
refresh();
loadHistory();
loadQualification();
setInterval(() => {
  if (!document.hidden) {
    refresh();
    loadHistory();
  }
}, 900000);
setInterval(updateFreshness, 1000);
