#!/usr/bin/env node
// Keeps the four web applications independent and on one design system.
// The ownership manifest is apps/web/applications.json; docs/WEB_APPLICATIONS.md
// explains the rules. Exit code 1 lists every violation.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2] ?? "apps/web/applications.json";
const manifest = JSON.parse(
  readFileSync(join(repository, manifestPath), "utf8"),
);
const root = join(repository, manifest.root);

function sources(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css|json)$/.test(name) ? [relative(root, path)] : [];
  });
}

function matches(pattern, file) {
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
  return pattern === file;
}
// A file named explicitly belongs there, even inside another owner's folder.
function owns(owner, file, everyone) {
  if (owner.files.includes(file)) return true;
  return (
    owner.files.some((pattern) => matches(pattern, file)) &&
    !everyone.some((other) => other.files.includes(file))
  );
}

const owners = [
  ...Object.entries(manifest.layers).map(([name, layer]) => ({
    name,
    kind: name,
    files: layer.files,
  })),
  ...Object.entries(manifest.applications).map(([name, application]) => ({
    name,
    kind: "application",
    files: application.files,
  })),
];
const problems = [];
const ownerOf = new Map();
const files = sources(root);
for (const file of files) {
  const found = owners.filter((owner) => owns(owner, file, owners));
  if (found.length === 0)
    problems.push(
      `${file}: not owned. Add it to one layer or application in ${manifestPath}.`,
    );
  else if (found.length > 1)
    problems.push(
      `${file}: owned by ${found.map((owner) => owner.name).join(" and ")}.`,
    );
  else ownerOf.set(file, found[0]);
}
for (const owner of owners)
  for (const pattern of owner.files)
    if (!files.some((file) => matches(pattern, file)))
      problems.push(`${manifestPath}: ${owner.name} lists missing ${pattern}.`);

/** Who may depend on whom: applications never on each other. */
function allowed(from, to) {
  if (from.kind === "host") return true;
  if (to.kind === "shared") return true;
  if (from.kind === "public") return to.kind === "public";
  if (from.kind === "application") return to.name === from.name;
  return false;
}

function resolve(from, specifier) {
  const target = normalize(join(dirname(from), specifier));
  for (const candidate of [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    join(target, "index.ts"),
  ])
    if (
      existsSync(join(root, candidate)) &&
      statSync(join(root, candidate)).isFile()
    )
      return candidate;
  return undefined;
}

const importPattern =
  /(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)|import\s+["'](\.[^"']+)["']|@import\s+(?:url\()?["'](\.[^"']+)["']/g;
const usedImportExceptions = new Set();
for (const file of files) {
  const from = ownerOf.get(file);
  if (!from || file.endsWith(".json")) continue;
  const text = readFileSync(join(root, file), "utf8");
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    const target = resolve(file, specifier);
    const to = target && ownerOf.get(target);
    if (!to) continue;
    // The host loads each application on demand, so one never ships in another.
    const eager =
      from.kind === "host" &&
      to.kind === "application" &&
      match[2] === undefined &&
      !/^import\s+type\b/.test(match[0]);
    if (!eager && allowed(from, to)) continue;
    const exception = manifest.importExceptions.find(
      (item) => item.from === file && item.to === target,
    );
    if (exception) {
      usedImportExceptions.add(exception);
      continue;
    }
    problems.push(
      `${file} (${from.name}) imports ${target} (${to.name}). ` +
        (eager
          ? "Load an application with import() so it stays in its own chunk."
          : from.kind === "application"
            ? "Applications share code only through the shared layer."
            : `The ${from.name} layer cannot depend on ${to.name}.`),
    );
  }
}
for (const exception of manifest.importExceptions)
  if (!usedImportExceptions.has(exception))
    problems.push(
      `${manifestPath}: remove the import exception ${exception.from} -> ${exception.to}; it no longer occurs.`,
    );

// Design rules: tokens live in the design system; everything else uses them.
const shell = new RegExp(`\\.(${manifest.shellSelectors.join("|")})(?![\\w-])`);
function blocks(file) {
  const text = readFileSync(join(root, file), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  return text.split("}").map((block) => {
    const [selector = "", body = ""] = block.split("{").slice(-2);
    return { selector, body };
  });
}
/** Custom properties the design system declares on the root: its tokens. */
const tokens = new Set(
  manifest.designSystem.flatMap((file) =>
    blocks(file)
      .filter(({ selector }) => selector.includes(":root"))
      .flatMap(({ body }) =>
        [...body.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
      ),
  ),
);
function cssRules(file, owner) {
  const counts = {};
  const add = (rule) => (counts[rule] = (counts[rule] ?? 0) + 1);
  for (const { selector, body } of blocks(file)) {
    if (owner.kind === "application" && shell.test(selector))
      add("shell-selector");
    for (const declaration of body.split(";")) {
      const [property = "", ...rest] = declaration.split(":");
      const name = property.trim();
      const value = rest.join(":").trim();
      if (!name || !value) continue;
      if (tokens.has(name)) add("token-override");
      if (
        /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/.test(
          value,
        )
      )
        add("raw-color");
      if (
        name === "font-family" &&
        !/^(inherit|var\(--font-[a-z-]+\))$/.test(value)
      )
        add("font-family");
    }
  }
  return counts;
}
const designFiles = new Set(manifest.designSystem);
const usedDesignExceptions = new Set();
for (const file of files) {
  const owner = ownerOf.get(file);
  if (
    !owner ||
    !file.endsWith(".css") ||
    designFiles.has(file) ||
    !["shared", "application"].includes(owner.kind)
  )
    continue;
  for (const [rule, count] of Object.entries(cssRules(file, owner))) {
    const exception = manifest.designExceptions.find(
      (item) => item.file === file && item.rule === rule,
    );
    if (exception) usedDesignExceptions.add(exception);
    const allowedCount = exception?.count ?? 0;
    if (count > allowedCount)
      problems.push(
        `${file}: ${count} ${rule} (allowed ${allowedCount}). Use the design-system tokens and shared frame.`,
      );
    else if (count < allowedCount)
      problems.push(
        `${manifestPath}: lower the ${rule} allowance of ${file} to ${count}.`,
      );
  }
}
for (const exception of manifest.designExceptions)
  if (!usedDesignExceptions.has(exception))
    problems.push(
      `${manifestPath}: remove the ${exception.rule} allowance of ${exception.file}; it no longer occurs.`,
    );

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `Applications: ${files.length} files owned; ${Object.keys(manifest.applications).join(", ")} stay independent on one design system.`,
);
