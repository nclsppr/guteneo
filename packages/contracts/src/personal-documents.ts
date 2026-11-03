/** My documents list contract: owner-bound filters, sorting and counts. */
import type { PersonalDocumentItem } from "./secure-distribution";

/** Server-side list filters; every value is evaluated for the owner only. */
export const personalDocumentStatusFilters = [
  "available",
  "pending",
  "expiring",
  "ended",
] as const;
export type PersonalDocumentStatusFilter =
  (typeof personalDocumentStatusFilters)[number];
export const personalDocumentSorts = [
  "recent",
  "oldest",
  "expiry",
  "title",
] as const;
export type PersonalDocumentSort = (typeof personalDocumentSorts)[number];
/** Available documents whose access or retention ends within this window. */
export const PERSONAL_DOCUMENT_EXPIRING_DAYS = 14;
export interface PersonalDocumentPage {
  items: PersonalDocumentItem[];
  nextCursor: string | null;
  /** Every owner document matching the same filters, not only this page. */
  total: number;
}
export interface PersonalDocumentCounts {
  total: number;
  available: number;
  pending: number;
  expiring: number;
  ended: number;
}
export interface PersonalDocumentSummary {
  shared: PersonalDocumentCounts;
  personal: PersonalDocumentCounts;
  /** Sender names as displayed in the list, most frequent first. */
  senders: { name: string; documents: number }[];
  sendersTotal: number;
  expiringDays: number;
}
