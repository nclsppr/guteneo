import type { TemplateEnvelope } from "../../../packages/contracts/src/templates";
import { getLocale, type SupportedLocale } from "./locale";
import { msg } from "./messages";

// PDF number and date formats the template contract accepts for each language.
const documentLocales: Record<SupportedLocale, TemplateEnvelope["locale"]> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  lb: "de-DE",
};

// Strings under the chosen keys only: paths, required lists and enums stay as they are.
function translated<T>(
  value: T,
  translate: (key: string) => boolean,
  key = "",
): T {
  if (typeof value === "string")
    return (translate(key) ? msg(value) : value) as T;
  if (Array.isArray(value))
    return value.map((item) => translated(item, translate, key)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [
      name,
      translated(item, translate, name),
    ]),
  ) as T;
}

/**
 * A private copy of a Guteneo demo template in the reader's language. Only
 * Guteneo's own demo copy goes through msg(); a customer template never does.
 */
export function galleryCopy(envelope: TemplateEnvelope): TemplateEnvelope {
  const copy = structuredClone(envelope);
  copy.name = msg(copy.name);
  if (copy.description) copy.description = msg(copy.description);
  copy.locale = documentLocales[getLocale()];
  // Text blocks and table headings; a table's JSON content stays as it is.
  const blocks = <B extends object>(block: B): B => {
    const { content, head } = block as { content?: unknown; head?: unknown };
    return {
      ...block,
      ...(typeof content === "string" && !content.startsWith("[")
        ? { content: msg(content) }
        : {}),
      ...(Array.isArray(head)
        ? { head: head.map((title) => msg(String(title))) }
        : {}),
    };
  };
  copy.definition.basePdf.staticSchema =
    copy.definition.basePdf.staticSchema?.map(blocks);
  copy.definition.schemas = copy.definition.schemas.map((page) =>
    page.map(blocks),
  );
  copy.inputSchema = translated(
    copy.inputSchema,
    (key) => key === "title" || key === "default",
  );
  copy.bindings = translated(copy.bindings, (key) =>
    ["prefix", "suffix", "title"].includes(key),
  );
  copy.sampleData = translated(copy.sampleData, () => true);
  return copy;
}
