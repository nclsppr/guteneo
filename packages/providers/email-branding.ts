import {
  EMAIL_BRAND_CID,
  EMAIL_BRAND_FILENAME,
  EMAIL_BRAND_IMAGE_BYTES,
  EMAIL_BRAND_IMAGE_SHA256,
  emailBrandImageState,
} from "../contracts/src/email-branding";
import { EMAIL_BRAND_IMAGE_BASE64 } from "../contracts/src/email-branding-image";

export function emailBrandingValid(html: string): boolean {
  return emailBrandImageState(html) !== "invalid";
}

/** Decode only the compiled-in image matching the exact approved CID digest.
 * No arbitrary bytes, URL fetch or customer attachment slot is involved. */
export async function emailBrandAttachment(html: string) {
  const state = emailBrandImageState(html);
  if (state === "none") return undefined;
  if (state !== "fixed") throw new Error("EMAIL_BRAND_IMAGE_INVALID");
  const bytes = Uint8Array.from(atob(EMAIL_BRAND_IMAGE_BASE64), (character) =>
    character.charCodeAt(0),
  );
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (
    bytes.byteLength !== EMAIL_BRAND_IMAGE_BYTES ||
    hash !== EMAIL_BRAND_IMAGE_SHA256
  )
    throw new Error("EMAIL_BRAND_IMAGE_INTEGRITY");
  return {
    filename: EMAIL_BRAND_FILENAME,
    contentType: "image/png" as const,
    contentId: EMAIL_BRAND_CID,
    bytes,
  };
}
