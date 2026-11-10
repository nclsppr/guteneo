import { fr } from "./locales/fr";
import { en } from "./locales/en";
import { de } from "./locales/de";
import { lb } from "./locales/lb";
const catalogs = { fr, en, de, lb };
import { englishIndex } from "./message-catalog";
export { default as messageContexts } from "./locales/message-contexts.json";
import lifecycle from "./locales/messages-lifecycle.json";
import information from "./locales/messages-information.json";
import editorial from "./locales/messages-editorial.json";
import assistants from "./locales/messages-assistants.json";
import operations from "./locales/messages-operations.json";
import shell from "./locales/messages-shell.json";
import legal from "./locales/messages-legal.json";
import pricing from "./locales/messages-pricing.json";
import studioDemos from "./locales/messages-studio-demos.json";
import studioEditor from "./locales/messages-studio-editor.json";
import studioDatasets from "./locales/messages-studio-datasets.json";
import studioExtra from "./locales/messages-studio-extra.json";
import studioDistribution from "./locales/messages-studio-distribution-settings.json";
import roles from "./locales/messages-roles.json";
import secureDocuments from "./locales/messages-secure-documents.json";
import personalDocuments from "./locales/messages-personal-documents.json";
import administration from "./locales/messages-administration.json";
import identity from "./locales/messages-identity.json";
import pdfChecks from "./locales/messages-pdf-checks.json";
import dashboardV2 from "./locales/messages-dashboard-v2.json";
import usageActivity from "./locales/messages-usage-activity.json";
import publicSite from "./locales/messages-public-site.json";
import tables from "./locales/messages-tables.json";
import localPreview from "./locales/messages-local-preview.json";
import delivery from "../../../packages/contracts/src/delivery-messages.json" with { type: "json" };
import postalWorldwide from "./locales/messages-postal-worldwide.json";

function sourceMessages(
  source: unknown,
  targets: unknown[],
): Record<string, readonly string[]> {
  if (typeof source === "string") return { [source]: targets as string[] };
  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).flatMap(([key, value]) =>
      Object.entries(
        sourceMessages(
          value,
          targets.map((target) => (target as Record<string, unknown>)[key]),
        ),
      ),
    ),
  );
}

export function getMessageCatalogs(includeLocalPreview = false) {
  const sources: Record<string, readonly string[]>[] = [
    sourceMessages(catalogs.fr, [catalogs.en, catalogs.de, catalogs.lb]),
    tables,
    ...(includeLocalPreview ? [localPreview] : []),
    studioEditor,
    studioDemos,
    studioDatasets,
    studioExtra,
    studioDistribution,
    shell,
    pricing,
    roles,
    // Personal list translations take precedence over the older secure catalog.
    personalDocuments,
    administration,
    secureDocuments,
    identity,
    pdfChecks,
    dashboardV2,
    usageActivity,
    publicSite,
    legal,
    operations,
    assistants,
    editorial,
    information,
    delivery,
    postalWorldwide,
    lifecycle,
  ];
  const messages: Record<string, readonly string[]> = Object.assign(
    {},
    ...sources,
  );
  const english = englishIndex(sources);

  return { sources, messages, english };
}
