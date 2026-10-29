import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// A deterministic regression guard, not a claim of automatic language detection.
// Human review still verifies natural English, terminology and semantic coverage.
const french =
  /\b(?:le|la|les|une|des|du|notre|votre|vos|nous|vous|cette|ces|avec|sans|pour|dans|doit|doivent|aucun|aucune|avant|après|depuis|seulement|envoi|envoyer|consulter|vérifier|préparer|saisissez|réponse|données|modèle|fichier)\b/giu;
const german =
  /\b(?:diese|dieser|dieses|werden|nicht|einen|keine|keinen|müssen|verfügbar|zurück|benutzer)\b/giu;
const luxembourgish =
  /\b(?:dësen|dës|déi|Är|keng|gëtt|sinn|wielt|sprooch)\b/giu;
const cleanProse = (text) =>
  text
    .replace(/\b(?:IBM Plex Sans|sans-serif)\b/g, "")
    .replace(/https?:\/\/[^\s)<>"']+/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\b[\w./-]+\.(?:md|tsx?|mjs|json|html|swift|png|webp|pdf)\b/g, "")
    .replace(/<[^>]*>|\{[^{}]*\}/g, "");
export function nonEnglishProse(text) {
  const value = cleanProse(text);
  return [french, german, luxembourgish].some(
    (pattern) => (value.match(pattern) ?? []).length >= 3,
  );
}
const localizedSource = (file) =>
  /\/locales\//.test(file) ||
  /(?:social-copy|roles-film-copy|public-http-error|setup-auth0-branding|mobile-locale)\.(?:ts|mjs)$/.test(
    file,
  ) ||
  file === "apps/web/src/locale.ts" ||
  file === "apps/api/src/mobile.ts" ||
  file.endsWith(".xcstrings") ||
  /\/Resources\/[^/]+\.lproj\//.test(file);
const immutableMedia = (file) =>
  /\/archive\//.test(file) ||
  /\/(?:media-parts|node_modules|dist)\//.test(file);
export function sourceFindings(file, source) {
  if (immutableMedia(file)) return [];
  const localized = localizedSource(file);
  if (localized && !/\.(?:ts|tsx|mjs|js)$/.test(file)) return [];
  const findings = [];
  const add = (position, text, kind) => {
    if (nonEnglishProse(text))
      findings.push({
        file,
        line: source.slice(0, position).split("\n").length,
        kind,
      });
  };
  if (/\.(?:ts|tsx|mjs|js)$/.test(file)) {
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node) {
      if (
        !localized &&
        !file.startsWith("videos/") &&
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node))
      )
        add(node.getStart(tree), node.text, "authored copy");
      ts.forEachChild(node, visit);
    }
    visit(tree);
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source,
    );
    let token;
    while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken)
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      )
        add(scanner.getTokenPos(), scanner.getTokenText(), "comment");
  } else if (/\.(?:swift|sh|sql|py|html|css|astro|svg)$/.test(file)) {
    // These sources do not share the TypeScript parser. Check prose per line;
    // localized resource files and test display fixtures have separate ownership.
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const videoContent =
        file.startsWith("videos/") &&
        !/^\s*(?:#|\/\/|\/\*|\*|<!--)/.test(lines[i]);
      if (!videoContent && nonEnglishProse(lines[i]))
        findings.push({ file, line: i + 1, kind: "authored source prose" });
    }
    if (file === "apps/web/index.html" && !/<html\s+lang="en"/.test(source))
      findings.push({
        file,
        line: 2,
        kind: "the unlocalized document shell must default to English",
      });
  } else if (/\.mdx?$/.test(file)) {
    // Exact fenced examples, quoted original evidence and declared video scripts
    // retain their bytes. Authored explanations around them remain English.
    if (
      file.startsWith("videos/") &&
      /(?:script|transcript|narration|screenplay)/i.test(file)
    )
      return [];
    let code = false;
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) {
        code = !code;
        continue;
      }
      if (!code && !/^\s*>/.test(lines[i]) && nonEnglishProse(lines[i]))
        findings.push({ file, line: i + 1, kind: "documentation" });
    }
  }
  return findings;
}
export function canonicalLinkFindings(file, source, aliases) {
  if (
    !/^(apps\/web\/src\/|ios\/Guteneo\/Views\/)/.test(file) ||
    /(?:public-navigation|public-routes)\./.test(file)
  )
    return [];
  const findings = [];
  for (const alias of Object.keys(aliases)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:href|url|URL|path|slug)\\s*[:=]\\s*[{"'\\x60]*${escaped}`,
      "g",
    );
    for (const match of source.matchAll(pattern))
      findings.push({
        file,
        line: source.slice(0, match.index).split("\n").length,
        kind: "legacy emitted URL",
      });
  }
  return findings;
}
export function interfaceSourceFindings(
  file,
  source,
  englishKeys,
  contextKeys = new Set(),
) {
  if (!file.startsWith("apps/web/src/") || localizedSource(file)) return [];
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["msg", "msgIn", "bmsg", "bmsgIn"].includes(node.expression.text)
    ) {
      const contextual = node.expression.text.endsWith("In");
      const value = node.arguments[contextual ? 1 : 0];
      if (value && ts.isStringLiteralLike(value)) {
        const key = value.text.trim();
        const context =
          contextual &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
            ? node.arguments[0].text
            : undefined;
        if (
          !englishKeys.has(key) ||
          (context && !contextKeys.has(`${context}\u0004${key}`))
        )
          findings.push({
            file,
            line:
              tree.getLineAndCharacterOfPosition(value.getStart(tree)).line + 1,
            kind: "interface copy needs an English source key and complete locale/context catalog",
          });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return findings;
}
export function documentationDrift(files, presentFiles = files) {
  const present = new Set(presentFiles);
  const updated = files.filter((file) => present.has(file));
  // A dependency update retains full CI, but does not add a product feature.
  // Keep this path exception exact: source changes alongside it still need docs.
  const dependencyManifests = new Set(
    ["", "apps/scanner/", "apps/pdf-validator/", "apps/engineering/"].flatMap(
      (directory) => [
        `${directory}package.json`,
        `${directory}package-lock.json`,
      ],
    ),
  );
  const featureChange = files.some(
    (f) =>
      !dependencyManifests.has(f) &&
      /^(apps\/(?:api|web|documents|status|engineering)\/|packages\/|ios\/Guteneo\/)/.test(
        f,
      ),
  );
  const missing = [];
  if (featureChange && !updated.includes("docs/feature-map.json"))
    missing.push(
      "Update docs/feature-map.json for changed feature behavior/surfaces.",
    );
  if (
    featureChange &&
    !updated.some(
      (f) =>
        /^docs\/.+\.md$/.test(f) &&
        !/[\/]FEATURE_MAP\.md$/.test(f) &&
        !/[\/](?:TEST_RESULTS|README)\.md$/.test(f),
    )
  )
    missing.push("Update the affected developer/technical contract in docs/.");
  const engineeringSources = [
    /^\.github\/(?:workflows|actions)\//,
    /^scripts\/ci\//,
    /^scripts\/repository-standards\.mjs$/,
    /^migrations\/.+\.sql$/,
    /(?:^|\/)wrangler[^/]*\.(?:jsonc?|json\.example)$/,
    /^apps\/(?:scanner|pdf-validator|documents)\/(?:Dockerfile|src\/)/,
    /^packages\/providers\//,
    /^packages\/contracts\/src\/secure-distribution\.ts$/,
    /^apps\/api\/src\/(?:index|maintenance|webhooks)\.ts$/,
    /^packages\/(?:contracts|domain)\/.*(?:pricing|price|tariff|live-delivery-quotes)/,
    /^apps\/api\/src\/(?:auth|auth0[^/]*|.*(?:provider|telnyx|pingen|resend|tariff|pricing|capabilit)[^/]*)\.[cm]?ts$/,
    /^scripts\/(?:deploy|provision|secure-setup|setup-|auth0-|production-|qualify-|provider-|verify-release|build-live|build-status|build-engineering|engineering-release|release-source|costs|sync-.*(?:tariff|price)|refresh-.*(?:tariff|price))[^/]*\.(?:mjs|ts)$/,
    /^AGENTS\.md$/,
    /^docs\/(?:BRAND_IDENTITY|REPOSITORY_STANDARDS|MULTILINGUAL|ACCESSIBILITY|HOMEPAGE_FILM|ROLES_FILM|VIDEO[^/]*)\.md$/,
    /^videos\/[^/]+\/(?:src\/|scripts\/|narration\/|public\/audio\/|package\.json$)/,
  ];
  const engineeringContractChange = files.some((file) =>
    engineeringSources.some((pattern) => pattern.test(file)),
  );
  if (
    engineeringContractChange &&
    !updated.some((file) =>
      /^apps\/engineering\/src\/content\/docs\/(?:engineering|architecture|workflows)\/.+\.mdx?$/.test(
        file,
      ),
    )
  )
    missing.push(
      "Update the affected authored engineering guide for CI/CD, Cloudflare, providers or contribution rules; generated feature pages are insufficient.",
    );
  return missing;
}
async function main() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const site = JSON.parse(
    await readFile("packages/contracts/src/public-site.json", "utf8"),
  );
  const findings = [];
  const englishKeys = new Set();
  for (const file of files.filter(
    (f) =>
      /^apps\/web\/src\/locales\/messages-.*\.json$/.test(f) ||
      f === "packages/contracts/src/delivery-messages.json",
  )) {
    const catalog = JSON.parse(await readFile(file, "utf8"));
    for (const values of Object.values(catalog))
      if (Array.isArray(values) && typeof values[0] === "string")
        englishKeys.add(values[0]);
  }
  const baseEnglish = await readFile("apps/web/src/locales/en.ts", "utf8");
  const englishTree = ts.createSourceFile(
    "en.ts",
    baseEnglish,
    ts.ScriptTarget.Latest,
    true,
  );
  function collect(node) {
    if (ts.isStringLiteral(node)) englishKeys.add(node.text);
    ts.forEachChild(node, collect);
  }
  collect(englishTree);
  const contextKeys = new Set(
    Object.keys(
      JSON.parse(
        await readFile("apps/web/src/locales/message-contexts.json", "utf8"),
      ),
    ),
  );
  for (const file of files.filter(
    (f) =>
      /\.(?:ts|tsx|js|mjs|md|mdx|swift|sh|sql|py|html|css|astro|svg)$/.test(
        f,
      ) &&
      !f.startsWith("tests/") &&
      !/^ios\/Guteneo(?:UI)?Tests\//.test(f),
  )) {
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    findings.push(
      ...sourceFindings(file, source),
      ...canonicalLinkFindings(file, source, site.aliases),
      ...interfaceSourceFindings(file, source, englishKeys, contextKeys),
    );
  }
  const baseIndex = process.argv.indexOf("--base");
  if (baseIndex >= 0) {
    const base = process.argv[baseIndex + 1];
    if (!base || base.startsWith("-"))
      throw Error("--base needs an explicit Git ref");
    const changed = execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    for (const message of documentationDrift(changed, files))
      findings.push({ file: "documentation", line: 1, kind: message });
  }
  if (findings.length) {
    const groups = Object.groupBy(findings, (f) => f.file);
    for (const [file, items] of Object.entries(groups)) {
      console.error(
        `${file}: ${items.length} issue(s); lines ${items
          .slice(0, 8)
          .map((f) => f.line)
          .join(", ")}`,
      );
      for (const item of items.slice(0, 8))
        console.error(`  ${item.line}: ${item.kind}`);
    }
    throw Error(
      `${findings.length} repository convention violations. Move UI/video translations to declared i18n resources; keep authored source/docs in English.`,
    );
  }
  console.log(
    "Repository conventions verified: authored language, canonical links and requested documentation coverage.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
