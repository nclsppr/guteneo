/* Runs before styles and the application: applies the saved appearance and
   language so the first paint is already correct. Same-origin script only. */
(function () {
  var root = document.documentElement;
  var theme = null;
  var locale = null;
  try {
    theme = localStorage.getItem("guteneo.experience.theme");
    locale = localStorage.getItem("guteneo.experience.locale");
  } catch {
    /* Storage can be unavailable; the defaults below still apply. */
  }
  var night =
    theme === "night" ||
    (theme !== "day" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = night ? "night" : "day";
  var supported = ["fr", "en", "de", "lb"];
  var requested = new URLSearchParams(location.search).get("lang");
  var candidates = [requested, locale].concat(navigator.languages || []);
  for (var index = 0; index < candidates.length; index += 1) {
    var tag = String(candidates[index] || "")
      .toLowerCase()
      .split("-")[0];
    if (supported.indexOf(tag) >= 0) {
      root.lang = tag;
      return;
    }
  }
  root.lang = "fr";
})();
