import { z } from "zod";
import { postalRecipientSchema } from "./postal-recipient";

export const savedRecipientInput = z.discriminatedUnion("channel", [
  z.object({ label: z.string().trim().min(1).max(160), channel: z.literal("fax"), recipient: z.object({ phone: z.string().min(1).max(80) }).strict() }).strict(),
  z.object({ label: z.string().trim().min(1).max(160), channel: z.literal("email"), recipient: z.object({ email: z.string().min(1).max(320) }).strict() }).strict(),
  z.object({ label: z.string().trim().min(1).max(160), channel: z.literal("postal"), recipient: postalRecipientSchema }).strict(),
]);
export const savedRecipientMutation = z.object({
  expectedRevision: z.number().int().positive(),
  value: savedRecipientInput,
}).strict();
export const savedRecipientDelete = z.object({ expectedRevision: z.number().int().positive() }).strict();
export type SavedRecipientInput = z.infer<typeof savedRecipientInput>;
export type SavedRecipientView = SavedRecipientInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
