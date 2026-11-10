/* Resolve legacy device preferences before public content can paint. */
(function () {
  var root = document.documentElement;
  if (
    !root.dataset.publicLocale ||
    root.dataset.publicPath !== location.pathname ||
    document.querySelector('meta[name="guteneo-belvedere"]') ||
    location.hash.startsWith("#/app")
  )
    return;
  function normalize(value) {
    if (typeof value !== "string" || value.length > 64) return null;
    var tag = value.trim().replaceAll("_", "-").toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
    var base = tag.split("-")[0];
    return ["fr", "en", "de", "lb"].includes(base) ? base : null;
  }
  var url = new URL(location.href);
  // Recovery/authentication URLs must never be replayed or copied into a redirect.
  if (
    Array.from(url.searchParams.keys()).some(function (key) {
      return /^(auth|code|state|token|access_token|refresh_token|id_token|session|ticket|error|error_description)$/i.test(
        key,
      );
    })
  )
    return;
  var values = url.searchParams.getAll("lang");
  if (values.length === 1 && normalize(values[0])) return;
  var cookie = "";
  try {
    cookie = document.cookie;
  } catch {
    /* Storage is optional. */
  }
  var matches =
    cookie.length <= 8192
      ? cookie.split(";").flatMap(function (entry) {
          var separator = entry.indexOf("=");
          var name = (separator < 0 ? entry : entry.slice(0, separator)).trim();
          return name === "guteneo_locale"
            ? [separator < 0 ? "" : entry.slice(separator + 1).trim()]
            : [];
        })
      : [];
  if (
    matches.length === 1 &&
    /^(selection|account)\.(fr|en|de|lb)$/.test(matches[0])
  )
    return;
  var stored = null;
  try {
    stored = normalize(localStorage.getItem("guteneo.locale"));
  } catch {
    /* Storage is optional. */
  }
  // New preferences reach the Worker through a bounded cookie. Only an older
  // localStorage-only selection needs this one pre-paint canonical navigation.
  if (stored && stored !== root.dataset.publicLocale) {
    url.searchParams.set("lang", stored);
    // Navigation is asynchronous: the superseded document must not paint while
    // the correctly localized immutable page is on its way.
    root.style.visibility = "hidden";
    location.replace(url.href);
  }
})();

/* Preload the server-selected public language alongside the entry module.
 * Private entry waits for authenticated preference; this hint grants no rights. */
(function () {
  var root = document.documentElement;
  if (
    !root.dataset.publicLocale ||
    root.dataset.publicPath !== location.pathname ||
    root.style.visibility === "hidden" ||
    location.hash.startsWith("#/app") ||
    document.querySelector('meta[name="guteneo-belvedere"]')
  )
    return;
  var locale = root.dataset.publicLocale;
  if (!["fr", "en", "de", "lb"].includes(locale)) return;
  var asset = document.querySelector(
    'meta[name="guteneo-locale-' + locale + '"]',
  );
  if (!asset || !/^\/assets\/[a-zA-Z0-9_.-]+\.js$/.test(asset.content)) return;
  var link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = asset.content;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
})();
