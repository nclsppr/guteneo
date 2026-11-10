/* Resolve public presentation hints before server-rendered content can paint.
 * These hints grant no identity, membership or sending authority. */
(function () {
  var root = document.documentElement;
  if (
    !root.dataset.publicLocale ||
    root.dataset.publicPath !== location.pathname ||
    document.querySelector('meta[name="guteneo-belvedere"]')
  )
    return;
  // A hash is never sent to the server. Its public HTML fallback must not flash
  // behind a private entry while the authenticated language is being resolved.
  if (location.hash.startsWith("#/app")) {
    root.dataset.publicBootstrapPending = "true";
    return;
  }
  function normalize(value) {
    if (typeof value !== "string" || value.length > 64) return null;
    var tag = value.trim().replaceAll("_", "-").toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
    var base = tag.split("-")[0];
    return ["fr", "en", "de", "lb"].includes(base) ? base : null;
  }
  var url = new URL(location.href);
  var values = url.searchParams.getAll("lang");
  var requested = values.length === 1 ? normalize(values[0]) : null;
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
  var hint =
    matches.length === 1 &&
    /^(selection|account)\.(fr|en|de|lb)$/.test(matches[0])
      ? matches[0].split(".")[1]
      : null;
  var stored = null;
  try {
    stored = normalize(localStorage.getItem("guteneo.locale"));
  } catch {
    /* Storage is optional. */
  }
  var privateQuery = Array.from(url.searchParams.keys()).some(function (key) {
    return /^(auth|code|state|token|access_token|refresh_token|id_token|session|ticket|error|error_description)$/i.test(
      key,
    );
  });
  // Only an older localStorage-only choice needs a canonical navigation. Never
  // replay recovery/authentication query parameters into that navigation.
  if (
    !privateQuery &&
    !requested &&
    !hint &&
    stored &&
    stored !== root.dataset.publicLocale
  ) {
    url.searchParams.set("lang", stored);
    root.style.visibility = "hidden";
    location.replace(url.href);
    return;
  }
  var locale = requested || hint || stored || root.dataset.publicLocale;
  if (!["fr", "en", "de", "lb"].includes(locale)) return;
  // A static fallback or old cache may not have negotiated this presentation
  // hint. Hide only its inert SSR wrapper; React replaces that wrapper itself.
  if (locale !== root.dataset.publicLocale)
    root.dataset.publicBootstrapPending = "true";
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
