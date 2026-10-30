import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  sourceFindings,
  canonicalLinkFindings,
  documentationDrift,
  interfaceSourceFindings,
} from "../../scripts/repository-standards.mjs";

test("authored comments, runtime errors and developer prose require English", () => {
  assert.equal(
    sourceFindings(
      "packages/example.ts",
      '// Vérifier les droits avant chaque envoi.\nthrow new Error("Le document doit être vérifié avant son envoi.");',
    ).length,
    2,
  );
  assert.equal(
    sourceFindings(
      "docs/example.md",
      "# Guide\n\nLe document doit être vérifié avant son envoi.",
    ).length,
    1,
  );
  assert.deepEqual(
    sourceFindings(
      "packages/example.ts",
      '// Check current rights before dispatch.\nthrow new Error("The document must be verified before dispatch.");',
    ),
    [],
  );
});

test("localised UI/video copy and exact quoted evidence remain valid", () => {
  assert.deepEqual(
    sourceFindings(
      "apps/web/src/locales/fr.ts",
      'export const copy = "Le document doit être vérifié avant son envoi.";',
    ),
    [],
  );
  assert.deepEqual(
    sourceFindings(
      "videos/film/src/Scene.tsx",
      'const narration = "Votre assistant prépare le document pour vous.";',
    ),
    [],
  );
  assert.equal(
    sourceFindings(
      "apps/web/src/locales/fr.ts",
      '// Vérifier les droits avant chaque envoi.\nexport const label = "Votre document est prêt pour vous.";',
    ).length,
    1,
  );
  assert.equal(
    sourceFindings(
      "videos/film/src/Scene.tsx",
      "// Vérifier les droits avant chaque envoi.",
    ).length,
    1,
  );
  assert.deepEqual(
    sourceFindings(
      "docs/proof.md",
      "Observed original message:\n\n> Le document doit être vérifié avant son envoi.\n\n```text\nLe document doit être vérifié avant son envoi.\n```",
    ),
    [],
  );
});

test("canonical English links reject newly emitted legacy URLs", () => {
  const aliases = { "/confidentialite/": "/privacy/" };
  assert.equal(
    canonicalLinkFindings(
      "apps/web/src/Page.tsx",
      '<a href="/confidentialite/">Privacy</a>',
      aliases,
    ).length,
    1,
  );
  assert.deepEqual(
    canonicalLinkFindings(
      "apps/web/src/Page.tsx",
      '<a href="/privacy/">Privacy</a>',
      aliases,
    ),
    [],
  );
});

test("feature changes require both registry and developer contract updates", () => {
  assert.equal(documentationDrift(["apps/api/src/documents.ts"]).length, 2);
  assert.equal(
    documentationDrift(["apps/api/src/documents.ts", "docs/feature-map.json"])
      .length,
    1,
  );
  assert.deepEqual(
    documentationDrift([
      "apps/api/src/documents.ts",
      "docs/feature-map.json",
      "docs/API_CONTRACT.md",
    ]),
    [],
  );
  assert.equal(
    documentationDrift([
      "apps/web/src/page.tsx",
      "docs/feature-map.json",
      "docs/README.md",
    ]).length,
    1,
  );
  assert.deepEqual(documentationDrift(["tests/unit/documents.test.ts"]), []);
});

test("dependency manifests do not invent product documentation changes", () => {
  const manifests = [
    "package.json",
    "package-lock.json",
    "apps/engineering/package.json",
    "apps/engineering/package-lock.json",
    "apps/pdf-validator/package.json",
    "apps/scanner/package-lock.json",
  ];
  assert.deepEqual(documentationDrift(manifests), []);
  assert.equal(
    documentationDrift([...manifests, "apps/web/src/Page.tsx"]).length,
    2,
  );
  assert.equal(
    documentationDrift([...manifests, "packages/example/package.json.ts"])
      .length,
    2,
  );
  assert.match(
    documentationDrift([...manifests, ".github/workflows/ci.yml"]).join("\n"),
    /authored engineering guide/,
  );
  for (const file of [
    "packages/new-runtime/package.json",
    "apps/api/src/package.json",
  ])
    assert.equal(documentationDrift([...manifests, file]).length, 2);
});

test("native, script and static shell prose follow the same English rule", () => {
  for (const file of [
    "ios/Guteneo/Example.swift",
    "scripts/example.sh",
    "scripts/example.py",
    "scripts/example.sql",
    "apps/example/index.html",
    "apps/example/style.css",
  ])
    assert.equal(
      sourceFindings(file, "// Vérifier les droits avant chaque envoi.").length,
      1,
    );
  assert.equal(
    sourceFindings("apps/web/index.html", '<html lang="fr">').length,
    1,
  );
  assert.deepEqual(
    sourceFindings("apps/web/index.html", '<html lang="en">'),
    [],
  );
});

test("operational and contribution changes require an authored engineering guide", () => {
  for (const file of [
    ".github/workflows/ci.yml",
    ".github/workflows/production-e2e.yml",
    ".github/actions/setup/action.yml",
    "wrangler.live.jsonc",
    "apps/status/wrangler.jsonc",
    "scripts/ci/verify-results.mjs",
    "scripts/repository-standards.mjs",
    "migrations/0060_example.sql",
    "scripts/deploy-public.mjs",
    "packages/providers/src/pingen.ts",
    "apps/api/src/auth.ts",
    "apps/api/src/maintenance.ts",
    "apps/api/src/index.ts",
    "apps/api/src/webhooks.ts",
    "packages/contracts/src/secure-distribution.ts",
    "apps/api/src/telnyx-readiness.ts",
    "AGENTS.md",
    "docs/BRAND_IDENTITY.md",
    "videos/guteneo-film/src/Film.tsx",
  ]) {
    const accompanying = ["docs/feature-map.json", "docs/ARCHITECTURE.md"];
    assert.match(
      documentationDrift([file, ...accompanying]).join("\n"),
      /authored engineering guide/,
      file,
    );
    assert.deepEqual(
      documentationDrift([
        file,
        ...accompanying,
        "apps/engineering/src/content/docs/engineering/ci-and-release.mdx",
      ]),
      [],
      file,
    );
  }
  assert.equal(
    documentationDrift([
      ".github/workflows/ci.yml",
      "apps/engineering/src/content/docs/features/platform.mdx",
      "docs/feature-map.json",
      "docs/ARCHITECTURE.md",
    ]).length,
    1,
  );
  assert.deepEqual(documentationDrift(["tests/unit/provider.test.ts"]), []);
  assert.equal(
    documentationDrift(
      [
        ".github/workflows/ci.yml",
        "docs/feature-map.json",
        "docs/ARCHITECTURE.md",
        "apps/engineering/src/content/docs/engineering/deleted.mdx",
      ],
      [
        ".github/workflows/ci.yml",
        "docs/feature-map.json",
        "docs/ARCHITECTURE.md",
      ],
    ).length,
    1,
  );
});

test("translated interface calls require English source and an explicit context catalog", () => {
  const keys = new Set(["Cancel", "Cancelled"]);
  const contexts = new Set(["generation-state\u0004Cancelled"]);
  assert.deepEqual(
    interfaceSourceFindings(
      "apps/web/src/page.tsx",
      'msg("Cancel"); msgIn("generation-state", "Cancelled");',
      keys,
      contexts,
    ),
    [],
  );
  assert.equal(
    interfaceSourceFindings(
      "apps/web/src/page.tsx",
      'msg("Annuler"); msgIn("unknown-context", "Cancelled");',
      keys,
      contexts,
    ).length,
    2,
  );
  assert.equal(
    interfaceSourceFindings(
      "apps/web/src/page.tsx",
      "msg(`Unregistered label`); msgIn(`missing-context`, `Cancel`);",
      keys,
      contexts,
    ).length,
    2,
  );
});

// Nimbus sources follow the same authored-language and feature maintenance rules.
test("engineering guides and Astro components require English and synchronized feature docs", () => {
  for (const file of [
    "apps/engineering/src/content/docs/example.mdx",
    "apps/engineering/src/components/Example.astro",
  ])
    assert.equal(
      sourceFindings(file, "Le document doit être vérifié avant son envoi.")
        .length,
      1,
    );
  assert.equal(
    documentationDrift(["apps/engineering/src/components/Example.astro"])
      .length,
    2,
  );
});
