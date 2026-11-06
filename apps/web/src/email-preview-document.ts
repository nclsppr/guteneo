import {
  hasEmailBrandImage,
  renderEmailBrandImage,
  resolveEmailBrandImage,
} from "../../../packages/contracts/src/email-branding";

let imageSource: string | null = null;
let imageSourceLoad: Promise<string> | undefined;
export const cachedEmailBrandPreviewSource = () => imageSource;

export function emailBrandPreviewSource(): Promise<string> {
  return (imageSourceLoad ??=
    import("../../../packages/contracts/src/email-branding-image").then(
      ({ EMAIL_BRAND_IMAGE_BASE64 }) => {
        imageSource = `data:image/png;base64,${EMAIL_BRAND_IMAGE_BASE64}`;
        return imageSource;
      },
    ));
}

/** No network source is permitted inside either raw custom drafts or reviewed
 * server output. Only trusted callers reconstruct our canonical tag as data. */
export function emailPreviewDocument(html: string, branded = false): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${branded ? "data:" : "'none'"}; base-uri 'none'; form-action 'none';"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 Georgia,serif;color:#181b22;margin:0;padding:24px;overflow-wrap:anywhere}body:has(>table[role="presentation"]){padding:0}img{max-width:100%}</style></head><body>${html}</body></html>`;
}

export function unillustratedEmailPreview(html: string): string {
  return hasEmailBrandImage(html) ? html.replace(/<img\b[^>]*>/i, "") : html;
}

export async function illustratedEmailPreview(html: string): Promise<string> {
  if (!hasEmailBrandImage(html)) return emailPreviewDocument(html);
  // Separate optional chunk: ordinary app/template loading never contains the
  // PNG payload, and user URLs cannot affect its module or image source.
  const rendered = resolveEmailBrandImage(
    html,
    await emailBrandPreviewSource(),
  );
  if (rendered.includes(renderEmailBrandImage()))
    throw new Error("EMAIL_BRAND_PREVIEW_UNAVAILABLE");
  return emailPreviewDocument(rendered, true);
}
