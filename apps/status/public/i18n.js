(() => {
  const requested = new URL(location.href).searchParams.getAll("lang");
  const browserLanguage = navigator.language?.split("-")[0];
  const language = requested.length
    ? requested.length === 1 && requested[0] === "fr"
      ? "fr"
      : "en"
    : browserLanguage === "fr"
      ? "fr"
      : "en";
  const catalog = language === "fr" ? window.STATUS_FRENCH_MESSAGES : {};
  const msg = (source, ...values) => {
    const translated = Object.hasOwn(catalog, source)
      ? catalog[source]
      : source;
    return translated.replace(/\{(\d+)\}/g, (token, index) =>
      values[index] === undefined ? token : String(values[index]),
    );
  };
  window.statusI18n = {
    language,
    locale: language === "fr" ? "fr-FR" : "en-GB",
    msg,
  };
  document.documentElement.lang = language;

  // Static copy and dynamic status labels use the same English source catalog.
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_TEXT,
  );
  let text;
  while ((text = walker.nextNode())) {
    if (["SCRIPT", "STYLE"].includes(text.parentElement?.tagName)) continue;
    const source = text.nodeValue.replace(/\s+/g, " ").trim();
    if (Object.hasOwn(catalog, source))
      text.nodeValue = text.nodeValue.replace(/\S(?:[\s\S]*\S)?/, () =>
        msg(source),
      );
  }
  for (const element of document.querySelectorAll(
    "[aria-label], [content], [placeholder]",
  )) {
    for (const attribute of ["aria-label", "content", "placeholder"]) {
      const source = element.getAttribute(attribute);
      if (source && Object.hasOwn(catalog, source))
        element.setAttribute(attribute, msg(source));
    }
  }
  const select = document.getElementById("status-language");
  select.value = language;
  select.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("lang", select.value);
    location.assign(url);
  });
})();
