import {
  EMAIL_BRAND_PORTRAIT_V1,
  emailBrandImageForHtml,
  emailBrandImageState,
} from "../contracts/src/email-branding";
import { EMAIL_BRAND_IMAGE_BASE64 } from "../contracts/src/email-branding-image";
import { EMAIL_BRAND_IMAGE_BASE64 as PORTRAIT_V1_BASE64 } from "../contracts/src/email-branding-portrait-v1-image";

export function emailBrandingValid(html: string): boolean {
  return emailBrandImageState(html) !== "invalid";
}

/** Decode only the compiled-in image matching the exact approved CID digest.
 * No arbitrary bytes, URL fetch or customer attachment slot is involved. */
export async function emailBrandAttachment(html: string) {
  const state = emailBrandImageState(html);
  if (state === "none") return undefined;
  const image = emailBrandImageForHtml(html);
  if (state !== "fixed" || !image) throw new Error("EMAIL_BRAND_IMAGE_INVALID");
  const base64 =
    image === EMAIL_BRAND_PORTRAIT_V1
      ? PORTRAIT_V1_BASE64
      : EMAIL_BRAND_IMAGE_BASE64;
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (bytes.byteLength !== image.bytes || hash !== image.sha256)
    throw new Error("EMAIL_BRAND_IMAGE_INTEGRITY");
  return {
    filename: image.filename,
    contentType: "image/png" as const,
    contentId: image.cid,
    bytes,
  };
}
