const statusText = window.statusI18n.msg;
const $ = (id) => document.getElementById(id);
let numberFormat, percentFormat, dateFormat, monthFormat, checkedFormat;
function configureFormatters() {
  numberFormat = new Intl.NumberFormat(window.statusI18n.locale);
  percentFormat = new Intl.NumberFormat(window.statusI18n.locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  dateFormat = new Intl.DateTimeFormat(window.statusI18n.locale, {
    timeZone: "UTC",
    dateStyle: "medium",
  });
  monthFormat = new Intl.DateTimeFormat(window.statusI18n.locale, {
    timeZone: "UTC",
    month: "short",
    year: "2-digit",
  });
  checkedFormat = new Intl.DateTimeFormat(window.statusI18n.locale, {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
configureFormatters();
const paths = [
  "/",
  "/?lang=en",
  "/?lang=de",
  "/?lang=lb",
  "/roles/",
  "/developers/",
  "/assistants/chatgpt/",
  "/release.json",
  "/api/health",
  "/api/capabilities",
  "/api/documents",
  "/api/dispatches",
  "/api/overview",
  "/mcp",
];
const canonicalPath = (path) =>
  path === "/developpeurs/" ? "/developers/" : path;
const checkKind = (path) =>
  paths.indexOf(canonicalPath(path)) < 7
    ? "public_page"
    : path === "/release.json"
      ? "release"
      : path === "/api/health"
        ? "liveness"
        : path === "/api/capabilities"
          ? "configuration"
          : "access_control";
const groupId = (check) =>
  check.kind === "public_page"
    ? "pages"
    : check.kind === "access_control"
      ? "access"
      : "api";
let latest = null,
  statusFailed = false,
  busy = false,
  lastReadAt = 0;
let latestHistory = null,
  historyError = false,
  selectedHistoryDate = null;
let historyDays = 30,
  historyRequest = 0,
  historyBusy = false;
const put = (id, text) => {
  if ($(id).textContent !== text) $(id).textContent = text;
};
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const dateLabel = (date) => dateFormat.format(new Date(date + "T00:00:00Z"));
const count = (value) => numberFormat.format(value);
const percentage = (passed, observed) =>
  percentFormat.format(passed / observed);
function validStatus(data) {
  return (
    data &&
    data.schema === 1 &&
    (data.checkedAt === null || Number.isFinite(Date.parse(data.checkedAt))) &&
    Number.isInteger(data.staleAfterSeconds) &&
    data.staleAfterSeconds > 0 &&
    data.staleAfterSeconds <= 86400 &&
    ["fresh", "stale", "missing"].includes(data.freshness) &&
    ["public_checks_passed", "attention", "unknown"].includes(data.status) &&
    Array.isArray(data.checks) &&
    (data.status === "unknown" ||
      data.status ===
        (data.checks.some((check) => check?.status === "fail")
          ? "attention"
          : "public_checks_passed")) &&
    data.checks.length === (data.checkedAt === null ? 0 : paths.length) &&
    new Set(data.checks.map((check) => canonicalPath(check?.path))).size ===
      data.checks.length &&
    data.checks.every(
      (check) =>
        check &&
        check.origin === "https://guteneo.com" &&
        paths.includes(canonicalPath(check.path)) &&
        ["pass", "fail"].includes(check.status) &&
        check.kind === checkKind(check.path) &&
        (check.status !== "pass" ||
          check.httpStatus === (check.kind === "access_control" ? 401 : 200)),
    )
  );
}
function renderStatus() {
  let state = "unknown",
    title = "Current availability is unknown",
    detail = "No recent observation is available. Try refreshing.";
  const age = latest?.checkedAt
    ? Date.now() - Date.parse(latest.checkedAt)
    : null;
  const fresh =
    !statusFailed &&
    latest?.freshness === "fresh" &&
    age !== null &&
    age >= -30000 &&
    age <= latest.staleAfterSeconds * 1000 &&
    latest.status !== "unknown";
  if (statusFailed)
    detail = "The latest observation could not be loaded. Try refreshing.";
  else if (
    latest?.checkedAt &&
    (latest.freshness === "stale" ||
      (age !== null && age > latest.staleAfterSeconds * 1000))
  )
    detail =
      "The last observation is old. Earlier results remain in the history.";
  else if (latest?.checkedAt && !fresh)
    detail = "Current availability could not be confirmed. Try refreshing.";
  else if (fresh) {
    const attention =
      latest.status === "attention" ||
      latest.checks.some((check) => check.status === "fail");
    state = attention ? "attention" : "pass";
    title = attention
      ? "Some checks need attention"
      : "Public access is available";
    detail = attention
      ? "An issue was observed in the services listed below."
      : "The latest automatic checks passed.";
  }
  $("live-state").dataset.state = state;
  put("state-title", statusText(title));
  put("state-detail", statusText(detail));
  if (latest?.checkedAt) {
    $("checked-time").dateTime = latest.checkedAt;
    put("checked-time", checkedFormat.format(new Date(latest.checkedAt)));
  } else {
    $("checked-time").removeAttribute("datetime");
    put("checked-time", statusText("No observation yet"));
  }
  for (const group of ["pages", "api", "access"]) {
    const failed = latest?.checks.some(
      (check) => groupId(check) === group && check.status === "fail",
    );
    const badge = $("service-" + group + "-state");
    const kind = !fresh ? "unknown" : failed ? "attention" : "success";
    badge.className = "service-state " + kind;
    badge.textContent = statusText(
      kind === "unknown"
        ? "Unknown"
        : kind === "attention"
          ? "Issue detected"
          : group === "access"
            ? "Active"
            : group === "api"
              ? "Responding"
              : "Available",
    );
  }
}
async function readJson(url, limit = 500000, allow503 = false) {
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok && !(allow503 && response.status === 503))
    throw new Error("unavailable");
  const raw = await response.text();
  if (raw.length > limit) throw new Error("size");
  const data = JSON.parse(raw);
  if (allow503 && response.status === 503) data.freshness = "stale";
  return data;
}
function updateRefresh() {
  $("refresh").disabled = busy || historyBusy;
}
async function refreshStatus() {
  if (busy) return;
  busy = true;
  updateRefresh();
  try {
    const data = await readJson("/api/status", 65536, true);
    if (!validStatus(data)) throw new Error("invalid");
    latest = data;
    statusFailed = false;
    lastReadAt = Date.now();
  } catch {
    statusFailed = true;
  } finally {
    renderStatus();
    busy = false;
    updateRefresh();
  }
}
function validHistory(data, days) {
  return (
    data &&
    data.schema === 1 &&
    data.days === days &&
    Number.isFinite(Date.parse(data.generatedAt)) &&
    (data.collectionStartedAt === null ||
      Number.isFinite(Date.parse(data.collectionStartedAt))) &&
    Array.isArray(data.buckets) &&
    data.buckets.length === days &&
    new Set(data.buckets.map((bucket) => bucket?.date)).size === days &&
    data.buckets.every(
      (bucket) =>
        bucket &&
        /^\d{4}-\d{2}-\d{2}$/.test(bucket.date) &&
        new Date(bucket.date + "T00:00:00Z").toISOString().slice(0, 10) ===
          bucket.date &&
        [
          "expectedSamples",
          "observedSamples",
          "passedSamples",
          "unknownSamples",
        ].every(
          (key) => Number.isSafeInteger(bucket[key]) && bucket[key] >= 0,
        ) &&
        bucket.passedSamples <= bucket.observedSamples &&
        bucket.unknownSamples ===
          Math.max(0, bucket.expectedSamples - bucket.observedSamples) &&
        (bucket.observedSamples === 0
          ? bucket.availabilityPercent === null
          : Number.isFinite(bucket.availabilityPercent) &&
            Math.abs(
              bucket.availabilityPercent -
                (100 * bucket.passedSamples) / bucket.observedSamples,
            ) <= 0.011),
    )
  );
}
function summary(bucket) {
  const result = bucket.observedSamples
    ? statusText(
        "{0} of recorded checks passed.",
        percentage(bucket.passedSamples, bucket.observedSamples),
      )
    : statusText("No observations recorded.");
  return (
    result +
    (bucket.expectedSamples
      ? " " +
        statusText(
          "{0} of {1} observations recorded.",
          count(bucket.observedSamples),
          count(bucket.expectedSamples),
        )
      : "")
  );
}
function periodBuckets(buckets) {
  if (historyDays !== 365)
    return buckets.map((bucket) => ({
      ...bucket,
      label: dateLabel(bucket.date),
      short: count(Number(bucket.date.slice(8))),
    }));
  const months = new Map();
  for (const bucket of buckets) {
    const month = bucket.date.slice(0, 7);
    let total = months.get(month);
    if (!total) {
      total = {
        date: bucket.date,
        end: bucket.date,
        expectedSamples: 0,
        observedSamples: 0,
        passedSamples: 0,
        unknownSamples: 0,
        label: monthFormat.format(new Date(bucket.date + "T00:00:00Z")),
        short: monthFormat.format(new Date(bucket.date + "T00:00:00Z")),
      };
      months.set(month, total);
    }
    total.end = bucket.date;
    for (const key of [
      "expectedSamples",
      "observedSamples",
      "passedSamples",
      "unknownSamples",
    ])
      total[key] += bucket[key];
  }
  return [...months.values()].map((bucket) => ({
    ...bucket,
    label: dateLabel(bucket.date) + " – " + dateLabel(bucket.end),
  }));
}
function renderHistory(data) {
  latestHistory = data;
  historyError = false;
  const buckets = [...data.buckets].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const totals = { expectedSamples: 0, observedSamples: 0, passedSamples: 0 };
  for (const bucket of buckets)
    for (const key of Object.keys(totals)) totals[key] += bucket[key];
  put("history-state", summary(totals));
  put(
    "history-range",
    dateLabel(buckets[0].date) + " – " + dateLabel(buckets.at(-1).date),
  );
  put(
    "history-start",
    data.collectionStartedAt
      ? statusText(
          "History begins on {0}.",
          dateLabel(data.collectionStartedAt.slice(0, 10)),
        )
      : statusText("History begins with the first recorded observation."),
  );
  const chart = $("history-chart");
  chart.dataset.period = String(historyDays);
  chart.replaceChildren();
  const periods = periodBuckets(buckets);
  const select = (index, focus = false) => {
    selectedHistoryDate = periods[index].date;
    for (const [position, button] of [...chart.children].entries()) {
      button.setAttribute("aria-pressed", String(position === index));
      button.tabIndex = position === index ? 0 : -1;
      if (position === index && focus) button.focus({ preventScroll: true });
    }
    put(
      "history-selection",
      periods[index].label + " · " + summary(periods[index]),
    );
  };
  for (const [index, bucket] of periods.entries()) {
    const state = !bucket.observedSamples
      ? "unknown"
      : bucket.passedSamples === bucket.observedSamples
        ? "success"
        : "attention";
    const button = node(
      "button",
      bucket.short,
      "history-cell " +
        state +
        (bucket.unknownSamples && bucket.observedSamples ? " partial" : ""),
    );
    button.type = "button";
    button.setAttribute("aria-label", bucket.label + ". " + summary(bucket));
    button.addEventListener("click", () => select(index));
    button.addEventListener("keydown", (event) => {
      const next =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? Math.min(index + 1, periods.length - 1)
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? Math.max(0, index - 1)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? periods.length - 1
                : null;
      if (next !== null) {
        event.preventDefault();
        select(next, true);
      }
    });
    chart.append(button);
  }
  const retained = periods.findIndex(
    (bucket) => bucket.date === selectedHistoryDate,
  );
  select(retained >= 0 ? retained : periods.length - 1);
  const body = $("history-rows");
  body.replaceChildren();
  for (const bucket of [...buckets].reverse()) {
    const row = node("tr");
    const label = node("th", dateLabel(bucket.date));
    label.scope = "row";
    row.append(
      label,
      node(
        "td",
        bucket.observedSamples
          ? percentage(bucket.passedSamples, bucket.observedSamples)
          : statusText("No data"),
      ),
      node(
        "td",
        count(bucket.observedSamples) + " / " + count(bucket.expectedSamples),
      ),
    );
    body.append(row);
  }
}
function renderHistoryError() {
  put(
    "history-state",
    statusText("History could not be loaded. Try refreshing."),
  );
  for (const id of ["history-selection", "history-start", "history-range"])
    put(id, "");
}
async function loadHistory() {
  const request = ++historyRequest,
    days = historyDays;
  historyBusy = true;
  updateRefresh();
  put("history-state", statusText("Loading history…"));
  $("history-chart").setAttribute("aria-busy", "true");
  try {
    const data = await readJson("/api/history?days=" + days);
    if (request !== historyRequest) return;
    if (!validHistory(data, days)) throw new Error("invalid");
    renderHistory(data);
  } catch {
    if (request !== historyRequest) return;
    historyError = true;
    renderHistoryError();
    $("history-chart").replaceChildren(
      node(
        "p",
        statusText("No usable history for this period."),
        "history-empty",
      ),
    );
    $("history-rows").replaceChildren();
    for (const id of ["history-selection", "history-start", "history-range"])
      put(id, "");
  } finally {
    if (request === historyRequest) {
      historyBusy = false;
      $("history-chart").removeAttribute("aria-busy");
      updateRefresh();
    }
  }
}
for (const button of document.querySelectorAll("[data-days]"))
  button.addEventListener("click", () => {
    historyDays = Number(button.dataset.days);
    for (const control of document.querySelectorAll("[data-days]"))
      control.setAttribute("aria-pressed", String(button === control));
    loadHistory();
  });
function refreshAll() {
  refreshStatus();
  loadHistory();
}
$("refresh").addEventListener("click", refreshAll);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastReadAt >= 900000) refreshAll();
});
setInterval(() => {
  if (!document.hidden) renderStatus();
}, 30000);
setInterval(() => {
  if (!document.hidden) refreshAll();
}, 900000);
if (["localhost", "127.0.0.1"].includes(location.hostname))
  $("preview-banner").hidden = false;
refreshAll();

window.addEventListener("guteneo-status-language-change", () => {
  configureFormatters();
  renderStatus();
  if (historyBusy) put("history-state", statusText("Loading history…"));
  else if (historyError) {
    renderHistoryError();
    $("history-chart").replaceChildren(
      node(
        "p",
        statusText("No usable history for this period."),
        "history-empty",
      ),
    );
  } else if (latestHistory) renderHistory(latestHistory);
});
