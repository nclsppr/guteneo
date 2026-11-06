import fixtures from "./locales/email-preview.json" with { type: "json" };
import type { SupportedLocale } from "../packages/contracts/src/locale";

/** Fictional editorial examples, kept separate from generated product defaults. */
export const EMAIL_PREVIEW_FIXTURES: Record<
  SupportedLocale,
  {
    workspace: string;
    documentTitle: string;
    messageSubject: string;
    message: string;
    documents: Record<"my_documents" | "protected_link" | "attachment", string>;
  }
> = fixtures;
