import { getLocale, catalogs } from "./locale";
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
import delivery from "../../../packages/contracts/src/delivery-messages.json" with { type: "json" };

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

export const messages: Record<string, readonly string[]> = {
  ...sourceMessages(catalogs.fr, [catalogs.en, catalogs.de, catalogs.lb]),
  ...studioEditor,
  ...studioDemos,
  ...studioDatasets,
  ...studioExtra,
  ...studioDistribution,
  ...shell,
  ...pricing,
  ...roles,
  ...legal,
  ...operations,
  ...assistants,
  ...editorial,
  ...information,
  ...delivery,
};
/** Only source-owned copy is passed here. User content is never translated. */
export function msg(source: string, ...values: unknown[]): string {
  const locale = getLocale();
  const key = source.trim();
  const translation =
    locale === "fr"
      ? key
      : (messages[key]?.[{ en: 0, de: 1, lb: 2 }[locale]] ?? key);
  const text =
    source.slice(0, source.length - source.trimStart().length) +
    translation +
    source.slice(source.trimEnd().length);
  return text.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) >= values.length
      ? placeholder
      : String(values[Number(index)]),
  );
}
