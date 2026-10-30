/* Runs before styles and page content; allowed by the same-origin script policy. */
(function () {
  if (window.__guteneoTheme) return;
  var root = document.documentElement;
  var media = matchMedia("(prefers-color-scheme: dark)");
  var changeEvent = "guteneo-theme-change";
  function valid(value) {
    return value === "light" || value === "dark" || value === "system";
  }
  function updateToggle(button) {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    var label = button.getAttribute("data-theme-label-" + next);
    if (!label) return;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
  function updateToggles() {
    document.querySelectorAll("[data-theme-toggle]").forEach(updateToggle);
  }
  function updateSource(source) {
    source.setAttribute(
      "media",
      root.dataset.theme === "dark" ? "all" : "not all",
    );
  }
  function updateSources() {
    document
      .querySelectorAll('source[data-theme-source="dark"]')
      .forEach(updateSource);
  }
  function apply(preference, notify) {
    var resolved =
      preference === "system" ? (media.matches ? "dark" : "light") : preference;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
    updateToggles();
    updateSources();
    if (!notify) return;
    try {
      document.cookie =
        "guteneo_theme=" +
        preference +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch {
      /* Cookie blocking never prevents an in-page appearance choice. */
    }
    window.dispatchEvent(
      new CustomEvent(changeEvent, {
        detail: { preference: preference, resolved: resolved },
      }),
    );
  }
  function setPreference(preference) {
    if (!valid(preference)) return;
    try {
      localStorage.setItem("guteneo.theme", preference);
    } catch {
      /* In-memory changes remain available when storage is blocked. */
    }
    apply(preference, true);
  }
  var preference = "system";
  var stored;
  try {
    stored = localStorage.getItem("guteneo.theme");
    if (valid(stored)) preference = stored;
  } catch {
    /* System preference remains available when storage is blocked. */
  }
  if (!valid(stored)) {
    try {
      var header = document.cookie;
      var matches =
        header.length <= 8192
          ? header.split(";").filter(function (entry) {
              return entry.trim().startsWith("guteneo_theme=");
            })
          : [];
      var cookie = matches.length === 1 ? matches[0].trim().slice(14) : "";
      if (valid(cookie)) preference = cookie;
    } catch {
      /* A rejected cookie read leaves the system choice intact. */
    }
  }
  apply(preference, false);
  window.__guteneoTheme = { setPreference: setPreference };
  document.addEventListener("click", function (event) {
    var button =
      event.target instanceof Element
        ? event.target.closest("button[data-theme-toggle]")
        : null;
    if (!button || button.disabled || event.defaultPrevented) return;
    setPreference(root.dataset.theme === "dark" ? "light" : "dark");
  });
  media.addEventListener("change", function () {
    if (root.dataset.themePreference === "system") apply("system", true);
  });
  window.addEventListener("storage", function (event) {
    if (event.key === "guteneo.theme" || event.key === null)
      apply(valid(event.newValue) ? event.newValue : "system", true);
  });
  // Static public headers can be used before the application or route chunk loads.
  // Observe only the initial parse; React reads the current theme when it mounts.
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (!(node instanceof Element)) return;
        if (node.matches("[data-theme-toggle]")) updateToggle(node);
        node.querySelectorAll("[data-theme-toggle]").forEach(updateToggle);
        if (node.matches('source[data-theme-source="dark"]'))
          updateSource(node);
        node
          .querySelectorAll('source[data-theme-source="dark"]')
          .forEach(updateSource);
      });
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener(
    "DOMContentLoaded",
    function () {
      observer.disconnect();
      updateToggles();
      updateSources();
    },
    { once: true },
  );
})();
