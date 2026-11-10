export type AttentionItem = {
  id: string;
  kind: "approval" | "quote_expiring" | "submission_unknown" | "protected_expiring" | "schedule_blocked";
  resourceId: string;
  route: string;
  expiresAt?: string;
  channel?: "fax" | "email" | "postal";
};
export type AttentionQueue = { items: AttentionItem[]; nextCursor: string | null; observedAt: string };
