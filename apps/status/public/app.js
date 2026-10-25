const statusText = window.statusI18n.msg;
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
const time = new Intl.DateTimeFormat(window.statusI18n.locale, {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fullTime = new Intl.DateTimeFormat(window.statusI18n.locale, {
  timeZone: "Europe/Paris",
  dateStyle: "long",
  timeStyle: "medium",
});
const legacyFeatureNames = {
  "Connexion Auth0": "Auth0 sign-in",
  "PDF : import, antivirus, rendu": "PDF: import, antivirus, rendering",
  "Studio : modèles, données, génération":
    "Studio: templates, data, generation",
  "Cron, files, callbacks, sauvegardes": "Cron, queues, callbacks, backups",
  "Assistants MCP": "MCP assistants",
  "Courrier postal": "Postal mail",
  "E-mail": "Email",
  "Paiements Stripe": "Stripe payments",
  "Propositions IA": "AI proposals",
};
const canonicalFeatureName = (name) =>
  Object.hasOwn(legacyFeatureNames, name)
    ? legacyFeatureNames[name]
    : /\/ (?:validation PDF|PDF validation)$/.test(name)
      ? "PDF verification"
      : name;
// Historical observations retain the URL that was actually checked.
const canonicalProbePath = (path) =>
  path === "/developpeurs/" ? "/developers/" : path;
const names = {
  "/": statusText("Show the homepage in French"),
  "/?lang=en": statusText("Show the homepage in English"),
  "/?lang=de": statusText("Show the homepage in German"),
  "/?lang=lb": statusText("Show the homepage in Luxembourgish"),
  "/roles/": statusText("Show the role guide"),
  "/developers/": statusText("Show the developer guide"),
  "/assistants/chatgpt/": statusText("Show the ChatGPT guide"),
  "/release.json": statusText("Identify the public release"),
  "/api/health": statusText("Check the state reported by the API"),
  "/api/capabilities": statusText("Check configuration consistency"),
  "/api/documents": statusText("Reject unauthenticated document access"),
  "/api/dispatches": statusText("Reject unauthenticated dispatch access"),
  "/api/overview": statusText("Reject unauthenticated overview access"),
  "/mcp": statusText("Reject unauthenticated MCP access"),
};
const expectations = {
  public_page: statusText(
    "HTTP 200, HTML content type, size and SHA-256 matching the manifest, expected language, nosniff, CSP with frame-ancestors 'none' and no noindex/none in X-Robots-Tag.",
  ),
  release: statusText(
    "HTTP 200, production manifest outside preview and clean source; commit and fingerprints in the expected format, asset list present. Dispatch flag consistent with capabilities from this collection.",
  ),
  liveness: statusText(
    "HTTP 200, reported state 'ok', production mode and a boolean dispatch flag consistent with capabilities.",
  ),
  configuration: statusText(
    "HTTP 200, production mode, simulation disabled, registration reported active and scanner reported connected. Recognised channels and fax, email and postal switches consistent with the manifest.",
  ),
  access_control: statusText(
    "HTTP 401 and a Cache-Control header containing no-store.",
  ),
};
const limits = {
  public_page: statusText(
    "Checks published content and selected protections; browser interactions are not exercised.",
  ),
  release: statusText(
    "Reported fingerprints are not an independent build attestation.",
  ),
  liveness: statusText(
    "Does not test the database, files, Auth0, queues or providers.",
  ),
  configuration: statusText(
    "Reported configuration does not prove that the scanner or providers work.",
  ),
  access_control: statusText(
    "Anonymous rejection for this route only; roles and workspace isolation still need qualification.",
  ),
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
    new Set(d.checks.map((c) => canonicalProbePath(c?.path))).size ===
      d.checks.length &&
    Array.isArray(d.coverage) &&
    d.coverage.length === Object.keys(featureDescriptions).length &&
    new Set(d.coverage.map((c) => canonicalFeatureName(c?.feature))).size ===
      d.coverage.length &&
    (d.sourceCommit === null ||
      (typeof d.sourceCommit === "string" &&
        /^[a-f0-9]{40}$/.test(d.sourceCommit))) &&
    ["public_checks_passed", "attention", "unknown"].includes(d.status) &&
    d.checks.every(
      (c) =>
        c &&
        ["pass", "fail"].includes(c.status) &&
        c.origin === "https://guteneo.com" &&
        Object.hasOwn(names, canonicalProbePath(c.path)) &&
        c.kind === expectedKind(c.path) &&
        (c.status !== "pass" ||
          c.httpStatus === (c.kind === "access_control" ? 401 : 200)),
    ) &&
    d.coverage.every(
      (c) =>
        c &&
        Object.hasOwn(featureDescriptions, canonicalFeatureName(c.feature)) &&
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
  if (!hasMeasure()) return statusText("Unavailable");
  const seconds = Math.floor(
    (Date.now() - Date.parse(latest.checkedAt)) / 1000,
  );
  if (seconds < 0)
    return seconds < -30
      ? statusText("Check the clock")
      : statusText("Less than a minute");
  if (seconds < 60) return statusText("Less than a minute");
  const minutes = Math.floor(seconds / 60);
  return minutes + " min";
}
function updateAge() {
  const label = ageLabel();
  put(
    "measure-age",
    hasMeasure() ? statusText("Age: ") + label : statusText("Unknown age"),
  );
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
  put(
    "proof-caption",
    current
      ? statusText("Latest measurement")
      : statusText("Latest evidence received"),
  );
  put(
    "freshness-label",
    current
      ? statusText("Recent measurement")
      : state === "loading"
        ? statusText("Pending")
        : statusText("Current state unknown"),
  );
  put(
    "service-explanation",
    current
      ? statusText(
          "These workflows need checks separate from availability measurements. Their coverage is documented below; it does not indicate an incident.",
        )
      : statusText(
          "The current state is unknown. Any results below come from the latest evidence received.",
        ),
  );
  for (const id of ["pages", "api", "access"]) {
    const checks = publicChecks().filter((check) => groupId(check) === id);
    const failures = checks.filter((check) => check.status === "fail").length;
    setBadge(
      `service-${id}-state`,
      !current
        ? hasMeasure()
          ? statusText("Old measurement")
          : statusText("Measurement unavailable")
        : failures
          ? statusText("{0} check{1} failed", failures, failures > 1 ? "s" : "")
          : statusText("{0}/{1} checks passed", checks.length, checks.length),
      !current ? "historical" : failures ? "failure" : "success",
    );
  }
  put(
    "live-explanation",
    !current
      ? statusText(
          "The results below are the latest evidence received; they do not describe the current state.",
        )
      : publicChecks().some((c) => c.status === "fail")
        ? statusText(
            "Examine failed checks. Open their evidence to compare expected and observed results.",
          )
        : statusText(
            "These checks verify pages, configuration and anonymous access rejection. Business workflows are assessed separately.",
          ),
  );
  const checks = publicChecks(),
    bad = checks.filter((c) => c.status === "fail").length;
  setBadge(
    "public-evidence-state",
    current
      ? bad
        ? bad + statusText(" failed")
        : checks.length + statusText(" checks passed")
      : hasMeasure()
        ? statusText("Historical evidence")
        : statusText("No measurement"),
    current ? (bad ? "failure" : "success") : "historical",
  );
  setBadge(
    "operations-measure-state",
    current
      ? bad
        ? statusText("Review needed")
        : statusText("Recent measurement")
      : state === "loading"
        ? statusText("Pending")
        : statusText("Unknown state"),
    current ? (bad ? "failure" : "success") : "historical",
  );
  put(
    "operations-measure-proof",
    hasMeasure()
      ? checks.length -
          bad +
          statusText(" checks passed out of ") +
          checks.length +
          " · " +
          fullTime.format(new Date(latest.checkedAt)) +
          " · Paris."
      : statusText("No measurement received."),
  );
}
function updateFreshness() {
  updateAge();
  if (failed) {
    setState(
      starting ? "loading" : "offline",
      starting
        ? statusText("First measurement in progress")
        : statusText("Measurement unavailable \u2014 current state unknown"),
      latest
        ? statusText("Earlier results remain available with their date.")
        : starting
          ? statusText("The monitor is preparing its first evidence.")
          : statusText("No usable measurement received."),
    );
    return;
  }
  if (!latest) return;
  if (!hasMeasure() || latest.freshness === "missing") {
    setState(
      "unknown",
      statusText("Waiting for the first measurement"),
      statusText("No usable production observation is available yet."),
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
      statusText("Stale evidence \u2014 current state unknown"),
      statusText("Earlier results remain available with their date."),
    );
    return;
  }
  const checks = publicChecks(),
    bad = checks.filter((c) => c.status === "fail");
  if (!checks.length)
    setState(
      "offline",
      statusText("No usable public check"),
      statusText("Service operation still needs verification."),
    );
  else if (bad.length)
    setState(
      "attention",
      statusText(
        "{0} public check{1} failed",
        bad.length,
        bad.length > 1 ? "s" : "",
      ),
      statusText(
        "An anomaly was detected. Review the affected services and check details.",
      ),
    );
  else if (checks.length !== 14)
    setState(
      "attention",
      statusText("Incomplete public measurement"),
      checks.length + statusText(" checks received out of the expected 14."),
    );
  else
    setState(
      "pass",
      statusText("Availability checks passed"),
      statusText(
        "{0} public checks passed. No anomaly detected within this scope.",
        checks.length,
      ),
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
  return names[canonicalProbePath(c.path)] ?? c.path;
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
    ["pages", statusText("Public pages")],
    ["api", statusText("API and configuration")],
    ["access", statusText("Access protection")],
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
      node("span", statusText("{0} checks", rows.length), "group-count"),
      badge(
        fails
          ? statusText("{0} failed", fails)
          : statusText("{0} passed", rows.length),
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
          c.status === "pass" ? statusText("Passed") : statusText("Failed"),
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
      step(steps, statusText("Request"), `GET ${c.origin}${c.path}`);
      let expected =
        expectations[c.kind] ??
        statusText("No contract described for this check type.");
      step(steps, statusText("Expected"), expected);
      const http = Number.isInteger(c.httpStatus)
        ? `HTTP ${c.httpStatus}`
        : statusText("No HTTP status received");
      step(
        steps,
        statusText("Observed"),
        statusText(
          "{0} \u00B7 check verdict: {1}.",
          http,
          c.status === "pass" ? statusText("passed") : statusText("failed"),
        ),
      );
      if (c.status === "fail") {
        const expectedHttp = c.kind === "access_control" ? 401 : 200;
        if (typeof c.code === "string" && /^[A-Z0-9_]{1,80}$/.test(c.code))
          step(steps, "Diagnostic", c.code);
        step(
          steps,
          statusText("Failure"),
          c.httpStatus !== expectedHttp
            ? statusText(
                "HTTP {0} expected; {1} observed.",
                expectedHttp,
                http.toLowerCase(),
              )
            : statusText(
                "The expected HTTP status was received, but the complete check did not pass. Details of the failed condition are not exported.",
              ),
        );
      }
      step(
        steps,
        statusText("Measurement"),
        statusText(
          "{0} \u00B7 Paris time",
          fullTime.format(new Date(latest.checkedAt)),
        ),
      );
      step(
        steps,
        statusText("Scope"),
        limits[c.kind] ??
          statusText("Result limited to this probe's contract."),
      );
      body.append(steps);
      item.append(body);
      group.append(item);
    }
    list.append(group);
  }
  if (!checks.length)
    list.append(
      node("p", statusText("No check matches these filters."), "empty"),
    );
  put(
    "result-count",
    statusText(
      "{0} check{1} displayed out of {3} \u00B7 open a result to view its evidence",
      checks.length,
      checks.length > 1 ? "s" : "",
      checks.length > 1 ? "s" : "",
      publicChecks().length,
    ),
  );
  restore(list, focus);
}
const featureNames = {
  "PDF: import, antivirus, rendering": statusText(
    "PDF import, scan and rendering",
  ),
  "Studio: templates, data, generation": statusText(
    "Studio: templates, data and generation",
  ),
  "Postal mail": statusText("Postal mail"),
  Email: statusText("Email"),
  "Auth0 sign-in": statusText("Sign-in and session"),
  "Cron, queues, callbacks, backups": statusText("Processing and backups"),
  "MCP assistants": statusText("Connected assistants"),
  "PDF verification": statusText("PDF verification"),
  "Stripe payments": statusText("Payments"),
  "AI proposals": statusText("Creation assistance"),
};
const featureDescriptions = {
  "Auth0 sign-in": statusText(
    "Sign in to your workspace and retain a valid session.",
  ),
  "PDF: import, antivirus, rendering": statusText(
    "Import a PDF, check its security and view every page.",
  ),
  "Studio: templates, data, generation": statusText(
    "Create a document from a template and data.",
  ),
  "Cron, queues, callbacks, backups": statusText(
    "Complete background processing and preserve data.",
  ),
  "MCP assistants": statusText(
    "Use an authorised assistant to view and prepare documents.",
  ),
  Fax: statusText("Prepare a fax and track delivery."),
  "Postal mail": statusText("Prepare postal mail and track acceptance."),
  Email: statusText("Prepare a message and track delivery."),
  "PDF verification": statusText(
    "Verify a PDF against an accessibility or archival profile.",
  ),
  "Stripe payments": statusText("Make a payment."),
  "AI proposals": statusText("Receive proposed content to review before use."),
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
        featureNames[canonicalFeatureName(feature.feature)] ??
          canonicalFeatureName(feature.feature),
        "scenario-name",
      ),
      badge(
        !hasMeasure()
          ? statusText("State not measured")
          : feature.state === "disabled"
            ? statusText("Not enabled")
            : statusText("Outside the scope of these checks"),
        "disabled",
      ),
    );
    const body = node("div", undefined, "detail-body"),
      steps = node("dl", undefined, "steps");
    step(
      steps,
      statusText("Feature"),
      featureDescriptions[canonicalFeatureName(feature.feature)] ??
        statusText("Feature monitored in this report."),
    );
    step(
      steps,
      statusText("Known state"),
      !hasMeasure()
        ? statusText("No current measurement received for this feature.")
        : feature.state === "disabled"
          ? statusText(
              "Feature reported disabled in the latest configuration received.",
            )
          : statusText(
              "No complete, current evidence of this production workflow is available in this report.",
            ),
    );
    step(
      steps,
      statusText("Scope"),
      feature.state === "disabled"
        ? statusText(
            "This status describes its configuration; no workflow success is claimed.",
          )
        : statusText(
            "Public checks cannot establish whether this feature succeeds or fails.",
          ),
    );
    body.append(steps);
    item.append(summary, body);
    list.append(item);
  }
  if (!features.length)
    list.append(node("p", statusText("No feature in this category."), "empty"));
  put(
    "coverage-count",
    statusText(
      "{0} feature{1} displayed out of {2}",
      features.length,
      features.length > 1 ? "s" : "",
      latest.coverage.length,
    ),
  );
  restore(list, focus);
}
function renderSnapshot() {
  const checks = publicChecks(),
    pass = checks.filter((c) => c.status === "pass").length,
    bad = checks.length - pass;
  put("passed-count", hasMeasure() ? String(pass) : "—");
  put("failed-count", hasMeasure() ? String(bad) : "—");
  put("public-total", statusText("{0} checks", checks.length));
  put("business-total", statusText("{0} features", latest.coverage.length));
  put("tab-public-count", checks.length + statusText(" checks"));
  put(
    "checked-time",
    hasMeasure()
      ? time.format(new Date(latest.checkedAt)) + " · Paris"
      : statusText("No measurement"),
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
  business: "verification",
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
    selectTab("verification");
    const target = isPublic
      ? checkButtons.find((b) => b.dataset.checkFilter === value)
      : coverageButtons.find((b) => b.dataset.filter === value);
    target.focus({ preventScroll: true });
    $("panel-verification").scrollIntoView({
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
const dayFormat = new Intl.DateTimeFormat(window.statusI18n.locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
function dayLabel(value) {
  return dayFormat.format(new Date(value + "T00:00:00Z"));
}
function number(value) {
  return new Intl.NumberFormat(window.statusI18n.locale, {
    maximumFractionDigits: 1,
  }).format(value);
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
    node("p", statusText("No usable data for this period."), "history-empty"),
  );
  $("history-chart").setAttribute(
    "aria-label",
    statusText("History unavailable; availability cannot be inferred."),
  );
  $("history-rows").replaceChildren();
  put("history-range", statusText("Days in UTC"));
  put(
    "history-start",
    statusText(
      "History cannot currently be confirmed. Empty days never count as successful.",
    ),
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
    observed
      ? number((100 * passed) / observed) + " %"
      : statusText("No measurement"),
  );
  put(
    "history-coverage",
    expected
      ? observed + " / " + expected
      : observed
        ? observed + statusText(" received")
        : statusText("No collection"),
  );
  put(
    "history-latency",
    latency === null ? statusText("Not measured") : number(latency) + " ms",
  );
  put(
    "history-state",
    observed
      ? statusText(
          "{0} successful measurement{1} out of {2} received.",
          passed,
          passed > 1 ? "s" : "",
          observed,
          observed > 1 ? "s" : "",
        ) +
          (unknown
            ? " " +
              statusText(
                "{0} expected measurement{1} not received.",
                unknown,
                unknown > 1 ? "s" : "",
              )
            : "")
      : statusText("No measurement recorded for this period."),
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
      ? statusText("Collection started on ") +
          fullTime.format(new Date(data.collectionStartedAt)) +
          statusText(" \u00B7 Paris. No earlier history is reconstructed.")
      : statusText(
          "Collection has not provided its first measurement yet. No earlier history is reconstructed.",
        ),
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
        ? statusText("no measurement")
        : number(bucket.availabilityPercent) +
          statusText(" % observed success")) +
      " ; " +
      bucket.observedSamples +
      " / " +
      bucket.expectedSamples +
      statusText(" measurements.");
    rect.append(title);
    svg.append(rect);
  }
  $("history-chart").replaceChildren(svg);
  $("history-chart").setAttribute(
    "aria-label",
    historyDays +
      statusText(" days: ") +
      (observed
        ? number((100 * passed) / observed) +
          statusText(" % success among received measurements, coverage ") +
          observed +
          statusText(" out of ") +
          expected +
          "."
        : statusText("no measurement recorded.")) +
      statusText(
        " Grey days have no measurement. The table provides exact values.",
      ),
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
          ? statusText("No measurement")
          : number(bucket.availabilityPercent) + " %",
      ),
      node("td", bucket.observedSamples + " / " + bucket.expectedSamples),
      node(
        "td",
        bucket.latencyMs === null
          ? statusText("Not measured")
          : number(bucket.latencyMs) + " ms",
      ),
    );
    body.append(row);
  }
}
async function loadHistory() {
  const request = ++historyRequest;
  put("history-state", statusText("Loading history\u2026"));
  try {
    const data = await readJson("/api/history?days=" + historyDays);
    if (request !== historyRequest) return;
    if (!validHistory(data)) throw new Error("invalid");
    renderHistory(data);
  } catch {
    if (request === historyRequest)
      clearHistory(
        statusText("History unavailable. Try refreshing the measurement."),
      );
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
    ["qualification-scope", d?.scope, statusText("Tested workflows")],
    [
      "qualification-limits",
      d?.limitations,
      statusText("Evidence limitations"),
    ],
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
        : statusText("Incomplete qualification"),
      passed ? "success" : "pending",
    );
    put(
      "qualification-summary",
      passed
        ? statusText("Application code exercised locally: ") +
            d.counts.testsPassed +
            statusText(" tests passed, ") +
            d.counts.suitesPassed +
            statusText(
              " test files. External network blocked; delivery provider simulated. This evidence does not qualify production.",
            )
        : statusText(
            "The local report does not establish complete qualification. ",
          ) +
            (isolated
              ? statusText("External network blocking is verified.")
              : statusText("External network blocking remains unproven.")) +
            statusText(" The team must review execution details."),
    );
    put(
      "qualification-date",
      statusText("Executed on ") +
        fullTime.format(new Date(d.executedAt)) +
        " · Paris." +
        (passed
          ? statusText(" Verified sources: ") +
            d.sourceSnapshotSha256.slice(0, 12) +
            "."
          : ""),
    );
    qualificationDetails(d);
  } catch {
    qualificationDetails(null);
    setBadge(
      "qualification-state",
      statusText("Evidence unavailable"),
      "pending",
    );
    put(
      "qualification-summary",
      statusText(
        "No usable local report is available. Its absence establishes no local or production result.",
      ),
    );
    put("qualification-date", statusText("Qualification date unavailable."));
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
