(() => {
  const key = "guteneo.theme";
  const media = matchMedia("(prefers-color-scheme: dark)");
  const normalize = (value) =>
    ["system", "light", "dark"].includes(value) ? value : "system";
  let preference = "system";
  try {
    preference = normalize(localStorage.getItem(key));
  } catch {
    /* Storage is optional. */
  }
  function apply(value, persist = false) {
    preference = normalize(value);
    const resolved =
      preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    if (persist)
      try {
        localStorage.setItem(key, preference);
      } catch {
        /* Storage is optional. */
      }
    window.dispatchEvent(
      new CustomEvent("guteneo-theme-change", {
        detail: { preference, resolved },
      }),
    );
  }
  media.addEventListener("change", () => {
    if (preference === "system") apply(preference);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
  window.statusTheme = { apply, getPreference: () => preference };
  apply(preference);
})();
