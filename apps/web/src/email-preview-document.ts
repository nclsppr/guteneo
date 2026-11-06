import {
  EMAIL_BRAND_CURRENT,
  EMAIL_BRAND_PORTRAIT_V1,
  emailBrandImageForHtml,
  resolveEmailBrandImage,
  type EmailBrandAsset,
} from "../../../packages/contracts/src/email-branding";

const imageSources = new Map<string, string>();
const imageSourceLoads = new Map<string, Promise<string>>();
export const cachedEmailBrandPreviewSource = (image = EMAIL_BRAND_CURRENT) =>
  imageSources.get(image.cid) ?? null;

export function emailBrandPreviewSource(
  image: EmailBrandAsset = EMAIL_BRAND_CURRENT,
): Promise<string> {
  if (image !== EMAIL_BRAND_CURRENT && image !== EMAIL_BRAND_PORTRAIT_V1)
    return Promise.reject(new Error("EMAIL_BRAND_PREVIEW_UNAVAILABLE"));
  let loading = imageSourceLoads.get(image.cid);
  if (!loading) {
    // Fixed optional chunks; recipient input cannot choose a module or URL.
    const module =
      image === EMAIL_BRAND_PORTRAIT_V1
        ? import("../../../packages/contracts/src/email-branding-portrait-v1-image")
        : import("../../../packages/contracts/src/email-branding-image");
    loading = module.then(({ EMAIL_BRAND_IMAGE_BASE64 }) => {
      const source = `data:image/png;base64,${EMAIL_BRAND_IMAGE_BASE64}`;
      imageSources.set(image.cid, source);
      return source;
    });
    imageSourceLoads.set(image.cid, loading);
  }
  return loading;
}

/** No network source is permitted inside either raw custom drafts or reviewed
 * server output. Only trusted callers reconstruct our canonical tag as data. */
export function emailPreviewDocument(html: string, branded = false): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${branded ? "data:" : "'none'"}; base-uri 'none'; form-action 'none';"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 Georgia,serif;color:#181b22;margin:0;padding:24px;overflow-wrap:anywhere}body:has(>table[role="presentation"]){padding:0}img{max-width:100%}</style></head><body>${html}</body></html>`;
}

export function unillustratedEmailPreview(html: string): string {
  return emailBrandImageForHtml(html)
    ? html.replace(/<img\b[^>]*>/i, "")
    : html;
}

export async function illustratedEmailPreview(html: string): Promise<string> {
  const image = emailBrandImageForHtml(html);
  if (!image) return emailPreviewDocument(html);
  // Separate optional chunk: ordinary app/template loading never contains the
  // PNG payload, and user URLs cannot affect its module or image source.
  const rendered = resolveEmailBrandImage(
    html,
    await emailBrandPreviewSource(image),
  );
  return emailPreviewDocument(rendered, true);
}
