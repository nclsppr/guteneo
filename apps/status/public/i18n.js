(() => {
  const languages = ["fr", "en", "de", "lb"];
  const normalize = (value) => {
    if (typeof value !== "string" || value.length > 64) return null;
    const tag = value.trim().replaceAll("_", "-").toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
    return languages.includes(tag.split("-")[0]) ? tag.split("-")[0] : null;
  };
  const requested = new URL(location.href).searchParams.getAll("lang");
  let stored = null;
  try {
    stored = normalize(localStorage.getItem("guteneo.locale"));
  } catch {
    /* Storage is optional. */
  }
  const browser =
    (navigator.languages?.length ? navigator.languages : [navigator.language])
      .map(normalize)
      .find(Boolean) ?? "fr";
  const explicit = requested.length === 1 ? normalize(requested[0]) : null;
  const tags = { fr: "fr-FR", en: "en-GB", de: "de-DE", lb: "lb-LU" };
  let language = explicit ?? stored ?? browser;
  const msg = (source, ...values) => {
    const index = { fr: 0, de: 1, lb: 2 }[language];
    const translated =
      language === "en"
        ? source
        : (window.STATUS_MESSAGES[source]?.[index] ?? source);
    return translated.replace(/\{(\d+)\}/g, (token, number) =>
      values[number] === undefined ? token : String(values[number]),
    );
  };
  window.statusI18n = { language, locale: tags[language], msg };
  function renderFooter() {
    const catalog = window.GUTENEO_PUBLIC_FOOTER;
    const nav = document.getElementById("public-footer-nav");
    if (!catalog?.groups) return;
    nav.setAttribute("aria-label", catalog.navigationLabel[language]);
    nav.replaceChildren();
    for (const group of catalog.groups) {
      const section = document.createElement("div");
      section.className = "footer-group";
      const heading = document.createElement("h2");
      heading.textContent = group.labels[language];
      section.append(heading);
      const list = document.createElement("ul");
      for (const item of group.links) {
        const row = document.createElement("li");
        const link = document.createElement("a");
        const url = new URL(item.href, "https://guteneo.com");
        if (["guteneo.com", "status.guteneo.com"].includes(url.hostname))
          url.searchParams.set("lang", language);
        link.href = url.href;
        link.textContent = item.labels[language];
        row.append(link);
        list.append(row);
      }
      section.append(list);
      nav.append(section);
    }
  }
  function applyLanguage(value) {
    language = value;
    const locale =
      language === "lb" &&
      (!Intl.NumberFormat.supportedLocalesOf(["lb-LU"]).length ||
        !Intl.DateTimeFormat.supportedLocalesOf(["lb-LU"]).length)
        ? "de-LU"
        : tags[language];
    Object.assign(window.statusI18n, { language, locale });
    document.documentElement.lang = language;
    document.title = "guteneo — " + msg("Service status");
    for (const element of document.querySelectorAll("[data-i18n]"))
      element.textContent = msg(element.dataset.i18n);
    for (const [attribute, data] of [
      ["aria-label", "i18nAria"],
      ["content", "i18nContent"],
    ])
      for (const element of document.querySelectorAll(
        `[data-${data.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}]`,
      ))
        element.setAttribute(attribute, msg(element.dataset[data]));
    for (const link of document.querySelectorAll("[data-public-link]")) {
      const url = new URL(link.href);
      url.searchParams.set("lang", language);
      link.href = url.href;
    }
    renderFooter();
    window.dispatchEvent(new CustomEvent("guteneo-status-language-change"));
  }
  applyLanguage(language);
  if (explicit)
    try {
      localStorage.setItem("guteneo.locale", explicit);
    } catch {
      /* Storage is optional. */
    }
  const select = document.getElementById("status-language");
  select.value = explicit ?? stored ?? "auto";
  select.addEventListener("change", () => {
    const url = new URL(location.href);
    if (select.value === "auto") {
      url.searchParams.delete("lang");
      try {
        localStorage.removeItem("guteneo.locale");
      } catch {
        /* Storage is optional. */
      }
    } else {
      url.searchParams.set("lang", select.value);
      try {
        localStorage.setItem("guteneo.locale", select.value);
      } catch {
        /* Storage is optional. */
      }
    }
    history.replaceState(history.state, "", url);
    applyLanguage(select.value === "auto" ? browser : select.value);
  });
  const theme = document.getElementById("status-theme");
  theme.value = window.statusTheme.getPreference();
  theme.addEventListener("change", () =>
    window.statusTheme.apply(theme.value, true),
  );
  window.addEventListener("guteneo-theme-change", (event) => {
    theme.value = event.detail.preference;
  });
})();
