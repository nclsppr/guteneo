import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import belvedereCatalog from "../apps/web/src/locales/messages-belvedere.json" with { type: "json" };

const root = new URL("../", import.meta.url);
const [
  { getMessageCatalogs, messageContexts },
  { translateMessage, englishMessages },
  ...copyModules
] = await Promise.all([
  tsImport(
    new URL("apps/web/src/message-catalogs-source.ts", root).href,
    import.meta.url,
  ),
  tsImport(
    new URL("apps/web/src/message-catalog.ts", root).href,
    import.meta.url,
  ),
  ...["fr", "en", "de", "lb"].map((locale) =>
    tsImport(
      new URL(`apps/web/src/locales/${locale}.ts`, root).href,
      import.meta.url,
    ),
  ),
]);
const locales = ["fr", "en", "de", "lb"];
const belvedereEnglish = englishMessages(belvedereCatalog);
const output = new URL("apps/web/src/locales/runtime/", root);
await fs.mkdir(output, { recursive: true });
function compile(locale, includeLocalPreview) {
  const source = getMessageCatalogs(includeLocalPreview);
  const messages = Object.create(null);
  for (const key of new Set([
    ...Object.keys(source.english),
    ...Object.keys(source.messages),
  ])) {
    const translated = translateMessage(
      key,
      locale,
      source.english,
      source.messages,
      [],
    );
    if (translated !== key) messages[key] = translated;
  }
  const contexts = Object.fromEntries(
    Object.keys(messageContexts).map((key) => {
      const [context, label] = key.split("\u0004");
      return [
        key,
        translateMessage(
          label,
          locale,
          source.english,
          source.messages,
          [],
          context,
          messageContexts,
        ),
      ];
    }),
  );
  return { messages, contexts };
}
let stale = false;
for (const [index, locale] of locales.entries()) {
  const ordinary = compile(locale, false);
  const development = compile(locale, true);
  const strings = [...new Set(Object.values(ordinary.messages))];
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const indexedMessages = Object.fromEntries(
    Object.entries(ordinary.messages).map(([key, value]) => [
      key,
      stringIndex.get(value),
    ]),
  );
  const overrides = Object.fromEntries(
    Object.entries(development.messages).filter(
      ([key, value]) => ordinary.messages[key] !== value,
    ),
  );
  const belvedereMessages = Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(belvedereEnglish),
        ...Object.keys(belvedereCatalog),
      ]),
    ].map((key) => [
      key,
      translateMessage(key, locale, belvedereEnglish, belvedereCatalog, []),
    ]),
  );
  const sourceFrench = Object.fromEntries(
    [
      "Promotional credits are not revenue. Supplier invoices, refunds, taxes and fixed costs have not all been reconciled.",
      "Supplier costs, Cloudflare invoices and complete receipts are unavailable.",
    ].map((key) => [key, belvedereEnglish[key][0]]),
  );
  for (const [name, value] of [
    [
      `${locale}.json`,
      {
        copy: copyModules[index][locale],
        strings,
        messages: indexedMessages,
        contexts: ordinary.contexts,
      },
    ],
    [`development-${locale}.json`, overrides],
    [`belvedere-${locale}.json`, { messages: belvedereMessages, sourceFrench }],
  ]) {
    const file = new URL(name, output);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    if (process.argv.includes("--check")) {
      if ((await fs.readFile(file, "utf8").catch(() => "")) !== content) {
        console.error(`Stale locale projection: ${fileURLToPath(file)}`);
        stale = true;
      }
    } else await fs.writeFile(file, content);
  }
}
if (stale) process.exitCode = 1;
