// The public browser report has its own state. It never changes the fourteen
// availability observations or turns missing authenticated coverage into a fault.
(() => {
  const byId = (id) => document.getElementById(id);
  const titles = {
    home_fr: "Accueil en français",
    home_en: "Accueil en anglais",
    home_de: "Accueil en allemand",
    home_lb: "Accueil en luxembourgeois",
    roles: "Guide des rôles",
    developers: "Guide développeur",
    chatgpt: "Guide ChatGPT",
  };
  const paths = {
    "/": "Accueil en français",
    "/?lang=en": "Accueil en anglais",
    "/?lang=de": "Accueil en allemand",
    "/?lang=lb": "Accueil en luxembourgeois",
    "/roles/": "Guide des rôles",
    "/developpeurs/": "Guide développeur",
    "/assistants/chatgpt/": "Guide ChatGPT",
    "/release.json": "Version publique",
    "/api/health": "État annoncé par l’API",
    "/api/capabilities": "Configuration annoncée",
    "/api/documents": "Documents refusés sans connexion",
    "/api/dispatches": "Envois refusés sans connexion",
    "/api/overview": "Synthèse refusée sans connexion",
    "/mcp": "Assistant refusé sans authentification",
  };
  const expectedIds = [
    ...["desktop", "phone"].flatMap((target) =>
      Object.keys(titles).map((id) => `browser:${target}:${id}`),
    ),
    ...Object.keys(paths).map((path) => `http:${path}`),
  ];
  const codes = new Set([
    "OK",
    "BROWSER_ASSERTION_FAILED",
    "EXECUTION_UNAVAILABLE",
    "TIMEOUT",
    "EMPTY_BODY",
    "RESPONSE_TOO_LARGE",
    "REDIRECT_REJECTED",
    "FETCH_FAILED",
    "HTTP_UNEXPECTED",
    "MANIFEST_INVALID",
    "HEALTH_INVALID",
    "CONFIGURATION_INVALID",
    "CACHE_POLICY_INVALID",
    "ASSET_MANIFEST_INVALID",
    "CONTENT_LENGTH_MISMATCH",
    "CONTENT_HASH_MISMATCH",
    "LANGUAGE_MISMATCH",
    "HEADERS_INVALID",
  ]);
  const sha = (value) =>
    typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const timestamp = (value) =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const states = new Set(["passed", "attention", "unknown"]);
  const date = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "medium",
  });
  const number = new Intl.NumberFormat("fr-FR");
  let snapshot = null;
  let busy = false;
  let unavailable = false;
  let lastRead = 0;

  function runUrl(id, attempt) {
    return `https://github.com/nclsppr/guteneo/actions/runs/${id}/attempts/${attempt}`;
  }
  function validRun(run, includeChecks = false) {
    if (
      !run ||
      typeof run.runId !== "string" ||
      !/^[1-9][0-9]{0,19}$/.test(run.runId) ||
      !Number.isInteger(run.attempt) ||
      run.attempt < 1 ||
      run.attempt > 10000 ||
      !timestamp(run.completedAt) ||
      !states.has(run.status) ||
      (run.testedReleaseCommit !== null && !sha(run.testedReleaseCommit))
    )
      return false;
    if (!includeChecks) return true;
    if (
      !sha(run.runnerCommit) ||
      run.runUrl !== runUrl(run.runId, run.attempt) ||
      !Array.isArray(run.checks) ||
      run.checks.length !== expectedIds.length ||
      new Set(run.checks.map((check) => check?.id)).size !== expectedIds.length
    )
      return false;
    if (
      !run.checks.every(
        (check) =>
          check &&
          expectedIds.includes(check.id) &&
          ["pass", "fail", "blocked"].includes(check.status) &&
          codes.has(check.code) &&
          Number.isInteger(check.durationMs) &&
          check.durationMs >= 0 &&
          check.durationMs <= 600000 &&
          (check.httpStatus === null ||
            (Number.isInteger(check.httpStatus) &&
              check.httpStatus >= 100 &&
              check.httpStatus <= 599)) &&
          (check.status === "pass"
            ? check.code === "OK"
            : check.status === "blocked"
              ? check.code === "EXECUTION_UNAVAILABLE"
              : !["OK", "EXECUTION_UNAVAILABLE"].includes(check.code)),
      )
    )
      return false;
    const expected =
      !run.testedReleaseCommit ||
      run.checks.some((check) => check.status === "blocked")
        ? "unknown"
        : run.checks.some((check) => check.status === "fail")
          ? "attention"
          : "passed";
    return run.status === expected;
  }
  function valid(data) {
    if (
      !data ||
      data.schema !== 1 ||
      !timestamp(data.generatedAt) ||
      !states.has(data.status) ||
      !["fresh", "stale", "missing"].includes(data.freshness) ||
      !["current", "changed", "unverified"].includes(data.releaseState) ||
      data.staleAfterSeconds !== 28800 ||
      (data.currentReleaseCommit !== null && !sha(data.currentReleaseCommit)) ||
      data.authenticated?.status !== "blocked" ||
      data.authenticated?.code !==
        "DEDICATED_STRONG_AUTH_FIXTURES_NOT_CONFIGURED" ||
      !Array.isArray(data.history) ||
      data.history.length > 20 ||
      !data.history.every((run) => validRun(run))
    )
      return false;
    if (data.latest === null)
      return (
        data.freshness === "missing" &&
        data.history.length === 0 &&
        data.status === "unknown"
      );
    if (!validRun(data.latest, true)) return false;
    const releaseState =
      !data.currentReleaseCommit || !data.latest.testedReleaseCommit
        ? "unverified"
        : data.currentReleaseCommit === data.latest.testedReleaseCommit
          ? "current"
          : "changed";
    const age =
      Date.parse(data.generatedAt) - Date.parse(data.latest.completedAt);
    const freshness =
      age >= 0 && age < data.staleAfterSeconds * 1000 ? "fresh" : "stale";
    const status =
      freshness === "fresh" && releaseState === "current"
        ? data.latest.status
        : "unknown";
    return (
      data.releaseState === releaseState &&
      data.freshness === freshness &&
      data.status === status
    );
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function put(id, text) {
    const element = byId(id);
    if (element.textContent !== text) element.textContent = text;
  }
  function badge(label, state) {
    return node("span", label, `badge ${state}`);
  }
  function reportStatus(status) {
    return status === "passed"
      ? ["Réussi", "success"]
      : status === "attention"
        ? ["À examiner", "failure"]
        : ["Incomplet", "historical"];
  }
  function updateFreshness() {
    const latest = snapshot?.latest;
    const age = latest ? Date.now() - Date.parse(latest.completedAt) : Infinity;
    const fresh =
      !!latest && age >= 0 && age < snapshot.staleAfterSeconds * 1000;
    const current =
      fresh && snapshot.releaseState === "current" && !unavailable;
    let label = "Aucun rapport",
      title = "Aucun rapport de navigateur reçu",
      detail =
        "Les contrôles publics ci-dessus restent la source du bilan de disponibilité.",
      state = "historical";
    if (unavailable) {
      label = "Lecture indisponible";
      title = "Rapport de navigateur indisponible";
      detail = latest
        ? "Le dernier résultat reste consultable avec sa date ; son actualité ne peut pas être confirmée."
        : "Aucune conclusion n’est tirée sur les parcours du navigateur. Le bilan de disponibilité reste indépendant.";
    } else if (latest && !fresh) {
      label = "Rapport ancien";
      title = "Rapport ancien — situation actuelle inconnue";
      detail =
        "L’exécution affichée décrit une observation passée. Une nouvelle exécution est nécessaire pour conclure.";
    } else if (latest && snapshot.releaseState === "changed") {
      label = "Autre version";
      title = "Une nouvelle version a été publiée depuis ce rapport";
      detail =
        "Le rapport reste une preuve de la version testée. Il ne qualifie pas la version publique actuelle.";
    } else if (latest && snapshot.releaseState === "unverified") {
      label = "Version à rapprocher";
      title = "La version du rapport reste à rapprocher";
      detail =
        "La version publique actuelle ou celle testée n’est pas établie. Aucun succès actuel n’est déduit du rapport.";
    } else if (current) {
      [label, state] = reportStatus(latest.status);
      title =
        latest.status === "passed"
          ? "Parcours publics vérifiés dans le navigateur"
          : latest.status === "attention"
            ? "Des parcours publics sont à examiner"
            : "L’exécution des parcours publics est incomplète";
      detail =
        latest.status === "passed"
          ? "Cette exécution récente correspond à la version publique observée. Elle couvre les pages et contrats publics indiqués ci-dessous."
          : latest.status === "attention"
            ? "Un écart a été observé dans cette exécution. Le rapport détaillé conserve le résultat exact et sa version."
            : "Certains contrôles n’ont pas pu être exécutés. Aucun succès global des parcours n’est annoncé.";
    }
    const status = byId("e2e-state");
    put("e2e-state", label);
    status.className = `badge ${state}`;
    put("e2e-title", title);
    put("e2e-detail", detail);
    put(
      "e2e-freshness",
      !latest
        ? "Aucun rapport reçu"
        : age < 0
          ? "Horloge à vérifier"
          : `${age < 60000 ? "Moins d’une minute" : age < 3600000 ? `${Math.floor(age / 60000)} min` : `${Math.floor(age / 3600000)} h`} · ${fresh ? "récent" : "ancien"}`,
    );
  }
  function checkLabel(id) {
    if (id.startsWith("http:")) return `Contrat public · ${paths[id.slice(5)]}`;
    const [, target, page] = id.split(":");
    return `${target === "desktop" ? "Navigateur ordinateur" : "Vue mobile"} · ${titles[page]}`;
  }
  function render(data) {
    const latest = data.latest;
    const completed = byId("e2e-completed");
    if (latest) completed.dateTime = latest.completedAt;
    else completed.removeAttribute("datetime");
    put(
      "e2e-completed",
      latest
        ? `${date.format(new Date(latest.completedAt))} · Paris`
        : "Aucune exécution reçue",
    );
    put(
      "e2e-tested-release",
      latest?.testedReleaseCommit
        ? latest.testedReleaseCommit.slice(0, 12)
        : "Non établie",
    );
    put(
      "e2e-current-release",
      data.currentReleaseCommit
        ? data.currentReleaseCommit.slice(0, 12)
        : "Non établie",
    );
    byId("e2e-run").hidden = !latest;
    if (latest)
      byId("e2e-run-link").href = runUrl(latest.runId, latest.attempt);
    else byId("e2e-run-link").removeAttribute("href");
    const list = byId("e2e-checks");
    list.replaceChildren();
    byId("e2e-check-details").hidden = !latest;
    if (latest) {
      const count = (state) =>
        latest.checks.filter((check) => check.status === state).length;
      put(
        "e2e-counts",
        `${count("pass")} contrôles réussis · ${count("fail")} en écart · ${count("blocked")} non exécutés. Vue mobile simulée ; aucun appareil physique ni envoi métier n’est testé.`,
      );
      for (const check of latest.checks) {
        const row = node("li"),
          text = node("div");
        text.append(
          node("strong", checkLabel(check.id)),
          node(
            "small",
            `${number.format(check.durationMs)} ms${check.httpStatus === null ? "" : ` · HTTP ${check.httpStatus}`}${check.code === "OK" ? "" : ` · ${check.code}`}`,
          ),
        );
        row.append(
          text,
          badge(
            check.status === "pass"
              ? "Réussi"
              : check.status === "fail"
                ? "En écart"
                : "Non exécuté",
            check.status === "pass"
              ? "success"
              : check.status === "fail"
                ? "failure"
                : "historical",
          ),
        );
        list.append(row);
      }
    } else put("e2e-counts", "Aucun résultat de navigateur reçu.");
    const history = byId("e2e-history");
    history.replaceChildren();
    byId("e2e-history-details").hidden = data.history.length === 0;
    for (const run of data.history) {
      const row = node("li"),
        text = node("div"),
        link = node("a", `${date.format(new Date(run.completedAt))} · Paris`);
      link.href = runUrl(run.runId, run.attempt);
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      text.append(
        link,
        node(
          "small",
          `Version testée : ${run.testedReleaseCommit ? run.testedReleaseCommit.slice(0, 12) : "non établie"}`,
        ),
      );
      const [label, state] = reportStatus(run.status);
      row.append(text, badge(label, state));
      history.append(row);
    }
    updateFreshness();
  }
  async function load() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch("/api/e2e-status", {
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("unavailable");
      const text = await response.text();
      if (text.length > 65536) throw new Error("size");
      const data = JSON.parse(text);
      if (!valid(data)) throw new Error("invalid");
      snapshot = data;
      unavailable = false;
      render(data);
    } catch {
      unavailable = true;
      updateFreshness();
    } finally {
      busy = false;
      lastRead = Date.now();
    }
  }
  byId("refresh").addEventListener("click", load);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastRead >= 900000) void load();
  });
  setInterval(() => {
    if (!document.hidden) void load();
  }, 900000);
  setInterval(updateFreshness, 60000);
  void load();
})();
