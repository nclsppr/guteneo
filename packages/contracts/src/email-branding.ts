import current from "./email-branding-current.json" with { type: "json" };
import portraitV1 from "./email-branding-portrait-v1.json" with { type: "json" };

/** Immutable metadata only; artwork bytes stay outside initial browser bundles. */
export type EmailBrandAsset = Readonly<
  typeof current & {
    assetPath: string;
    assetUrl: string;
  }
>;

function asset(metadata: typeof current): EmailBrandAsset {
  const assetPath = `/brand/${metadata.filename}`;
  return Object.freeze({
    ...metadata,
    assetPath,
    assetUrl: `https://guteneo.com${assetPath}`,
  });
}

export const EMAIL_BRAND_CURRENT = asset(current);
/** Read/transport compatibility for already approved HTML. Never new input. */
export const EMAIL_BRAND_PORTRAIT_V1 = asset(portraitV1);
const assets = [EMAIL_BRAND_CURRENT, EMAIL_BRAND_PORTRAIT_V1];

export const EMAIL_BRAND_IMAGE_SHA256 = EMAIL_BRAND_CURRENT.sha256;
export const EMAIL_BRAND_CID = EMAIL_BRAND_CURRENT.cid;
export const EMAIL_BRAND_CID_URL = `cid:${EMAIL_BRAND_CID}`;
export const EMAIL_BRAND_FILENAME = EMAIL_BRAND_CURRENT.filename;
export const EMAIL_BRAND_ASSET_PATH = EMAIL_BRAND_CURRENT.assetPath;
export const EMAIL_BRAND_ASSET_URL = EMAIL_BRAND_CURRENT.assetUrl;
export const EMAIL_BRAND_IMAGE_BYTES = EMAIL_BRAND_CURRENT.bytes;
export const EMAIL_BRAND_IMAGE_WIDTH = EMAIL_BRAND_CURRENT.width;
export const EMAIL_BRAND_IMAGE_HEIGHT = EMAIL_BRAND_CURRENT.height;
export const EMAIL_BRAND_DISPLAY_WIDTH = EMAIL_BRAND_CURRENT.displayWidth;
export const EMAIL_BRAND_DISPLAY_HEIGHT = EMAIL_BRAND_CURRENT.displayHeight;

export const emailBrandImageAttributes = (image = EMAIL_BRAND_CURRENT) => ({
  src: `cid:${image.cid}`,
  alt: "",
  width: String(image.displayWidth),
  height: String(image.displayHeight),
  style: `display:block;width:${image.displayWidth}px;border:0`,
});

export function renderEmailBrandImage(image = EMAIL_BRAND_CURRENT): string {
  return `<img src="cid:${image.cid}" alt="" width="${image.displayWidth}" height="${image.displayHeight}" style="display:block;width:${image.displayWidth}px;border:0">`;
}

/** Only exact historical canonical tags request compiled artwork. A quoted CID
 * in ordinary text, arbitrary CID or modified image never selects bytes. */
export function emailBrandImageForHtml(
  html: string,
): EmailBrandAsset | undefined {
  if (typeof html !== "string") return undefined;
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  if (images.length !== 1) return undefined;
  const tag = images[0].replace(/\s*\/?>$/, ">");
  return assets.find((image) => tag === renderEmailBrandImage(image));
}

export function emailBrandImageState(
  html: string,
): "none" | "fixed" | "invalid" {
  if (typeof html !== "string") return "invalid";
  if (!/<img\b/i.test(html)) return "none";
  return emailBrandImageForHtml(html) ? "fixed" : "invalid";
}

export const hasEmailBrandImage = (html: string) =>
  emailBrandImageState(html) === "fixed";

/** Preview-only reconstruction; historical markup retains its original artwork
 * and dimensions. The caller may supply a fixed local image source. */
export function resolveEmailBrandImage(html: string, source?: string): string {
  const image = emailBrandImageForHtml(html);
  if (!image) return html;
  const escaped = (source ?? image.assetUrl)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  return html.replace(
    /<img\b[^>]*>/i,
    renderEmailBrandImage(image).replace(`cid:${image.cid}`, escaped),
  );
}
