// The public browser report has its own state. It never changes the fourteen
// availability observations or turns missing authenticated coverage into a fault.
(() => {
  const reportText = window.statusI18n.msg;
  const byId = (id) => document.getElementById(id);
  const titles = {
    home_fr: reportText("Homepage in French"),
    home_en: reportText("Homepage in English"),
    home_de: reportText("Homepage in German"),
    home_lb: reportText("Homepage in Luxembourgish"),
    roles: reportText("Role guide"),
    developers: reportText("Developer guide"),
    chatgpt: reportText("ChatGPT guide"),
  };
  const paths = {
    "/": reportText("Homepage in French"),
    "/?lang=en": reportText("Homepage in English"),
    "/?lang=de": reportText("Homepage in German"),
    "/?lang=lb": reportText("Homepage in Luxembourgish"),
    "/roles/": reportText("Role guide"),
    "/developers/": reportText("Developer guide"),
    "/assistants/chatgpt/": reportText("ChatGPT guide"),
    "/release.json": reportText("Public release"),
    "/api/health": reportText("State reported by the API"),
    "/api/capabilities": reportText("Reported configuration"),
    "/api/documents": reportText("Document access rejected without sign-in"),
    "/api/dispatches": reportText("Dispatch access rejected without sign-in"),
    "/api/overview": reportText("Overview access rejected without sign-in"),
    "/mcp": reportText("Assistant access rejected without authentication"),
  };
  const expectedIds = [
    ...["desktop", "phone"].flatMap((target) =>
      Object.keys(titles).map((id) => `browser:${target}:${id}`),
    ),
    ...Object.keys(paths).map((path) => `http:${path}`),
  ];
  // Display old signed reports without rewriting their recorded check IDs.
  const canonicalCheckId = (id) =>
    id === "http:/developpeurs/" ? "http:/developers/" : id;
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
  const date = new Intl.DateTimeFormat(window.statusI18n.locale, {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "medium",
  });
  const number = new Intl.NumberFormat(window.statusI18n.locale);
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
      new Set(run.checks.map((check) => canonicalCheckId(check?.id))).size !==
        expectedIds.length
    )
      return false;
    if (
      !run.checks.every(
        (check) =>
          check &&
          expectedIds.includes(canonicalCheckId(check.id)) &&
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
        "DEDICATED_AUTHENTICATED_FIXTURES_NOT_CONFIGURED" ||
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
      ? [reportText("Passed"), "success"]
      : status === "attention"
        ? [reportText("Review needed"), "failure"]
        : [reportText("Incomplete"), "historical"];
  }
  function updateFreshness() {
    const latest = snapshot?.latest;
    const age = latest ? Date.now() - Date.parse(latest.completedAt) : Infinity;
    const fresh =
      !!latest && age >= 0 && age < snapshot.staleAfterSeconds * 1000;
    const current =
      fresh && snapshot.releaseState === "current" && !unavailable;
    let label = reportText("No report"),
      title = reportText("No browser report received"),
      detail = reportText(
        "The public checks above remain the source of the availability summary.",
      ),
      state = "historical";
    if (unavailable) {
      label = reportText("Read unavailable");
      title = reportText("Browser report unavailable");
      detail = latest
        ? reportText(
            "The latest result remains available with its date; its freshness cannot be confirmed.",
          )
        : reportText(
            "No conclusion is drawn about browser journeys. The availability summary remains independent.",
          );
    } else if (latest && !fresh) {
      label = reportText("Old report");
      title = reportText("Old report — current state unknown");
      detail = reportText(
        "The displayed run describes a past observation. A new run is required to reach a conclusion.",
      );
    } else if (latest && snapshot.releaseState === "changed") {
      label = reportText("Different release");
      title = reportText("A new release has been published since this report");
      detail = reportText(
        "The report remains evidence of the tested release. It does not qualify the current public release.",
      );
    } else if (latest && snapshot.releaseState === "unverified") {
      label = reportText("Release comparison required");
      title = reportText("The report release still needs to be compared");
      detail = reportText(
        "The current public release or tested release is not established. No current success is inferred from the report.",
      );
    } else if (current) {
      [label, state] = reportStatus(latest.status);
      title =
        latest.status === "passed"
          ? reportText("Public journeys verified in the browser")
          : latest.status === "attention"
            ? reportText("Public journeys need review")
            : reportText("The public journey run is incomplete");
      detail =
        latest.status === "passed"
          ? reportText(
              "This recent run matches the observed public release. It covers the public pages and contracts listed below.",
            )
          : latest.status === "attention"
            ? reportText(
                "A discrepancy was observed in this run. The detailed report preserves the exact result and its release.",
              )
            : reportText(
                "Some checks could not run. No overall journey success is claimed.",
              );
    }
    const status = byId("e2e-state");
    put("e2e-state", label);
    status.className = `badge ${state}`;
    put("e2e-title", title);
    put("e2e-detail", detail);
    put(
      "e2e-freshness",
      !latest
        ? reportText("No report received")
        : age < 0
          ? reportText("Check the clock")
          : `${age < 60000 ? reportText("Less than a minute") : age < 3600000 ? `${Math.floor(age / 60000)} min` : `${Math.floor(age / 3600000)} h`} · ${fresh ? reportText("recent") : reportText("old")}`,
    );
  }
  function checkLabel(id) {
    if (id.startsWith("http:"))
      return reportText(
        "Public contract · {0}",
        paths[canonicalCheckId(id).slice(5)],
      );
    const [, target, page] = id.split(":");
    return `${target === "desktop" ? reportText("Desktop browser") : reportText("Mobile view")} · ${titles[page]}`;
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
        : reportText("No run received"),
    );
    put(
      "e2e-tested-release",
      latest?.testedReleaseCommit
        ? latest.testedReleaseCommit.slice(0, 12)
        : reportText("Not established"),
    );
    put(
      "e2e-current-release",
      data.currentReleaseCommit
        ? data.currentReleaseCommit.slice(0, 12)
        : reportText("Not established"),
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
        reportText(
          "{0} checks passed · {1} failed · {2} not run. Simulated mobile viewport; no physical device or business dispatch is tested.",
          count("pass"),
          count("fail"),
          count("blocked"),
        ),
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
              ? reportText("Passed")
              : check.status === "fail"
                ? reportText("Failed")
                : reportText("Not run"),
            check.status === "pass"
              ? "success"
              : check.status === "fail"
                ? "failure"
                : "historical",
          ),
        );
        list.append(row);
      }
    } else put("e2e-counts", reportText("No browser result received."));
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
          reportText(
            "Tested release: {0}",
            run.testedReleaseCommit
              ? run.testedReleaseCommit.slice(0, 12)
              : reportText("not established"),
          ),
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
