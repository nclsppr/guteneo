import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

export async function readEngineeringConfig(path) {
  const parsed = ts.parseConfigFileTextToJson(
    String(path),
    await readFile(path, "utf8"),
  );
  if (parsed.error)
    throw new Error("Invalid engineering deployment configuration.");
  return parsed.config;
}

export function validateEngineeringConfig(config) {
  const allowed = new Set([
    "$schema",
    "name",
    "compatibility_date",
    "workers_dev",
    "preview_urls",
    "routes",
    "assets",
  ]);
  if (
    Object.keys(config).some((key) => !allowed.has(key)) ||
    config.name !== "guteneo-engineering" ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    JSON.stringify(config.routes) !==
      JSON.stringify([
        { pattern: "engineering.guteneo.com", custom_domain: true },
      ]) ||
    JSON.stringify(config.assets) !==
      JSON.stringify({
        directory: "./dist",
        html_handling: "force-trailing-slash",
        not_found_handling: "404-page",
      })
  )
    throw new Error(
      "Engineering publication must be the dedicated asset-only domain, with no runtime or business bindings.",
    );
}

export async function engineeringManifest(directory) {
  const entries = [];
  async function visit(relative = "") {
    for (const item of await readdir(resolve(directory, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink())
        throw new Error(`Publication contains a symbolic link: ${name}`);
      if (item.isDirectory()) await visit(name);
      else if (name !== "release.json") {
        if (
          /(?:^|\/)(?:docs|reports|archive|node_modules|\.git|\.env)(?:\/|$)|FEATURE_MAP|feature-map\.json|\.map$|\.(?:pem|key|log)$/.test(
            name,
          )
        )
          throw new Error(`Repository-only asset in publication: ${name}`);
        const bytes = await readFile(resolve(directory, name));
        if (
          /\.(?:html|mdx?|mmd|txt|json|xml|js|css|svg)$/.test(name) &&
          /(?:\/Users\/|\/home\/runner\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|cloudflare_api_token\s*[=:]\s*["']?[a-zA-Z0-9_-]{30})/i.test(
            bytes.toString(),
          )
        )
          throw new Error(
            `Private source or secret material in publication: ${name}`,
          );
        entries.push({
          path: name,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await visit();
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  for (const required of [
    "index.html",
    "404.html",
    "features/index.html",
    "features/permissions/index.html",
    "features/journeys/index.html",
    "llms.txt",
    "llms-full.txt",
    "_headers",
  ])
    if (!entries.some((entry) => entry.path === required))
      throw new Error(`Missing engineering output: ${required}`);
  return entries;
}
