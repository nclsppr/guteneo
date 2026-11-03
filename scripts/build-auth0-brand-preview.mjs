import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import {
  EMAIL_LOCALES,
  EMAIL_LOGO,
  TEMPLATE_NAMES,
  localizedEmail,
} from "./auth0-email-templates.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "integrations/auth0/emails");
const engine = new Liquid({ strictFilters: true });

export async function writeEmailTemplates({
  check = false,
  output = directory,
} = {}) {
  const templates = Object.fromEntries(
    TEMPLATE_NAMES.map((name) => [name, localizedEmail(name)]),
  );
  const files = Object.fromEntries(
    TEMPLATE_NAMES.map((name) => [
      `${name}.html.liquid`,
      templates[name].body + "\n",
    ]),
  );
  files["subjects.json"] =
    JSON.stringify(
      Object.fromEntries(
        TEMPLATE_NAMES.map((name) => [name, templates[name].subject]),
      ),
      null,
      2,
    ) + "\n";
  if (!check) await mkdir(output, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      if (check) {
        if ((await readFile(join(output, name), "utf8")) !== content)
          throw new Error(`STALE_EMAIL_TEMPLATE:${name}`);
      } else await writeFile(join(output, name), content);
    }),
  );
  return Object.keys(files);
}

export async function buildBrandPreview(
  output = join(root, "reports/auth0-email-preview"),
) {
  await mkdir(output, { recursive: true });
  await copyFile(
    join(root, "apps/web/public/brand/guteneo-stamp.png"),
    join(output, "guteneo-stamp.png"),
  );
  const pages = [];
  for (const name of TEMPLATE_NAMES)
    for (const language of EMAIL_LOCALES) {
      const template = localizedEmail(name);
      const context = {
        request_language: language,
        url: "https://example.invalid/auth0-preview?ticket=synthetic&mode=preview",
      };
      const html = (
        await engine.parseAndRender(template.body, context)
      ).replaceAll(EMAIL_LOGO, "./guteneo-stamp.png");
      const filename = `${name}-${language}.html`;
      await writeFile(join(output, filename), html);
      pages.push(filename);
    }
  await writeFile(
    join(output, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auth0 email previews</title><h1>Auth0 email previews</h1><p>Synthetic, local rendering only. No provider settings or delivery tested.</p><ul>${pages.map((page) => `<li><a href="${page}">${page}</a></li>`).join("")}</ul></html>\n`,
  );
  return {
    output,
    pages: pages.length,
    sendsPerformed: 0,
    liveRenderingVerified: false,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
    throw new Error("INVALID_ARGUMENTS");
  await writeEmailTemplates({ check: args[0] === "--check" });
  if (!args.length)
    console.log(JSON.stringify(await buildBrandPreview(), null, 2));
}
