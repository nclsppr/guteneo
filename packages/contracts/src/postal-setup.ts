import { z } from "zod";

export const postalSetupInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
    address: z
      .string()
      .trim()
      .min(10)
      .max(500)
      .regex(/^[^\u0000-\u0009\u000b-\u001f\u007f]+$/),
    authorized: z.literal(true),
  })
  .strict();

export type PostalSetupInput = z.infer<typeof postalSetupInput>;
export type PostalSetup = {
  available: boolean;
  canManage: boolean;
  configured: boolean;
  channelEnabled: boolean;
  sender?: {
    id: string;
    name: string;
    address: string;
    status: "verified" | "pending" | "disabled";
  };
  /** Authorization to use this identity; never physical-address verification. */
  senderVerification: "administrator_declaration" | null;
  pricingBasis: "public_list_price_ex_tax";
  defaultCountry: string;
  reason?:
    | "service_unavailable"
    | "setup_required"
    | "sender_disabled"
    | "channel_stopped"
    | "pricing_expired"
    | "operator_review_required";
};
