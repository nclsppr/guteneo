import { z } from "zod";
import { postalCountrySchema } from "./postal-destinations";

/** Keep these five fields and their historical limits unchanged. */
export const legacyPostalRecipientSchema = z
  .object({
    name: z.string().min(1).max(200),
    line1: z.string().min(1).max(200),
    postalCode: z.string().min(1).max(30),
    city: z.string().min(1).max(200),
    country: z.enum(["FR", "LU", "DE"]),
  })
  .strict();

/** Complete printed block, including the name and country line when required.
 * Lines are never trimmed, reordered, transliterated or completed by Guteneo. */
export const postalAddressBlockRecipientSchema = z
  .object({
    country: postalCountrySchema,
    addressLines: z
      .array(
        z
          .string()
          .min(1)
          .max(160)
          .refine(
            (line) =>
              line === line.trim() && !/[\u0000-\u001f\u007f]/u.test(line),
            "Each printed address line must be nonblank and contain no control characters or outer whitespace.",
          ),
      )
      .min(2)
      .max(6),
  })
  .strict();

export const postalRecipientSchema = z.union([
  legacyPostalRecipientSchema,
  postalAddressBlockRecipientSchema,
]);
export type LegacyPostalRecipient = z.infer<typeof legacyPostalRecipientSchema>;
export type PostalAddressBlockRecipient = z.infer<
  typeof postalAddressBlockRecipientSchema
>;
export type PostalRecipient = z.infer<typeof postalRecipientSchema>;
export type PostalAddressFormat = "legacy_fields" | "address_block";

export function isPostalAddressBlockRecipient(
  recipient: PostalRecipient | Record<string, unknown>,
): recipient is PostalAddressBlockRecipient {
  return Object.hasOwn(recipient, "addressLines");
}

export function postalRecipientFormat(
  recipient: PostalRecipient,
): PostalAddressFormat {
  return isPostalAddressBlockRecipient(recipient)
    ? "address_block"
    : "legacy_fields";
}
