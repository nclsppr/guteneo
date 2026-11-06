/** The approved wordless portrait, identified by its exact immutable PNG bytes.
 * Keep artwork bytes out of shared template/browser bundles. */
export const EMAIL_BRAND_IMAGE_SHA256 =
  "b8587959f2e236c39663508b01ef2eb29d9669a0c8f6ac298351358a8668c07b";
export const EMAIL_BRAND_CID = `guteneo-portrait.${EMAIL_BRAND_IMAGE_SHA256}@guteneo.com`;
export const EMAIL_BRAND_CID_URL = `cid:${EMAIL_BRAND_CID}`;
export const EMAIL_BRAND_FILENAME =
  "guteneo-email-portrait-b8587959f2e236c3.png";
export const EMAIL_BRAND_ASSET_PATH = `/brand/${EMAIL_BRAND_FILENAME}`;
export const EMAIL_BRAND_ASSET_URL = `https://guteneo.com${EMAIL_BRAND_ASSET_PATH}`;
export const EMAIL_BRAND_IMAGE_BYTES = 17264;

export const emailBrandImageAttributes = () => ({
  src: EMAIL_BRAND_CID_URL,
  alt: "",
  width: "60",
  height: "60",
  style: "display:block;width:60px;border:0",
});

export function renderEmailBrandImage(): string {
  return `<img src="${EMAIL_BRAND_CID_URL}" alt="" width="60" height="60" style="display:block;width:60px;border:0">`;
}

/** Only a real image reference requests the built-in payload. A quoted CID in
 * ordinary customer text never changes the MIME content. */
export function emailBrandImageState(
  html: string,
): "none" | "fixed" | "invalid" {
  if (typeof html !== "string") return "invalid";
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  if (!images.length) return "none";
  if (images.length !== 1) return "invalid";
  return images[0].replace(/\s*\/?>$/, ">") === renderEmailBrandImage()
    ? "fixed"
    : "invalid";
}

export const hasEmailBrandImage = (html: string) =>
  emailBrandImageState(html) === "fixed";

/** Preview-only reconstruction; the caller supplies its fixed local asset URL.
 * Does not resolve any other CID, source or customer-controlled URL. */
export function resolveEmailBrandImage(
  html: string,
  source = EMAIL_BRAND_ASSET_URL,
): string {
  if (!hasEmailBrandImage(html)) return html;
  const escaped = source.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return html.replace(
    /<img\b[^>]*>/i,
    renderEmailBrandImage().replace(EMAIL_BRAND_CID_URL, escaped),
  );
}
