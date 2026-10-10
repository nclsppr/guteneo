import type { Page, Route } from "@playwright/test";
export const origin = "http://127.0.0.1:8799";
const paths = [
  "/",
  "/?lang=en",
  "/?lang=de",
  "/?lang=lb",
  "/roles/",
  "/developpeurs/",
  "/assistants/chatgpt/",
  "/release.json",
  "/api/health",
  "/api/capabilities",
  "/api/documents",
  "/api/dispatches",
  "/api/overview",
  "/mcp",
];
export function snapshot() {
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    collectionStartedAt: new Date().toISOString(),
    sampleIntervalSeconds: 900,
    staleAfterSeconds: 1800,
    checkedAt: new Date().toISOString() as string | null,
    freshness: "fresh",
    status: "public_checks_passed",
    qualification: "partial",
    sourceCommit: "a".repeat(40),
    checks: paths.map((path, index) => ({
      origin: "https://guteneo.com",
      path,
      kind:
        index < 7
          ? "public_page"
          : index === 7
            ? "release"
            : index === 8
              ? "liveness"
              : index === 9
                ? "configuration"
                : "access_control",
      status: "pass",
      httpStatus: index >= 10 ? 401 : 200,
      durationMs: 20,
    })),
    coverage: [
      "Connexion Auth0",
      "PDF : import, antivirus, rendu",
      "Studio : modèles, données, génération",
      "Cron, files, callbacks, sauvegardes",
      "Assistants MCP",
      "Fax",
      "Courrier postal",
      "E-mail",
      "Horizon / validation PDF",
      "Paiements Stripe",
      "Propositions IA",
    ].map((feature, index) => ({
      feature,
      state: index < 7 ? "not_checked" : "disabled",
      evidence: "Synthetic test fixture; no production evidence.",
    })),
    categories: [],
  };
}
export function history(days: number, measured = false) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    schema: 1,
    days,
    generatedAt: new Date().toISOString(),
    collectionStartedAt: measured ? today.toISOString() : null,
    intervalSeconds: 900,
    buckets: Array.from({ length: days }, (_, i) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - days + i + 1);
      const has = measured && i === days - 1;
      return {
        date: date.toISOString().slice(0, 10),
        expectedSamples: has ? 4 : 0,
        observedSamples: has ? 2 : 0,
        passedSamples: has ? 1 : 0,
        unknownSamples: has ? 2 : 0,
        availabilityPercent: has ? 50 : null,
        latencyMs: has ? 120 : null,
        categories: [],
      };
    }),
  };
}
export function qualification() {
  return {
    schema: 1,
    environment: "local",
    executedAt: new Date().toISOString(),
    status: "passed",
    networkPolicy: "external_blocked",
    providerMode: "simulated",
    sourceCommit: null,
    sourceSnapshotSha256: "a".repeat(64),
    sourceUnchangedDuringRun: true,
    counts: {
      testsPassed: 4,
      testsFailed: 0,
      testsSkipped: 0,
      suitesPassed: 1,
      suitesFailed: 0,
    },
    scope: ["Scénario de test synthétique pour l’interface."],
    limitations: ["Cette fixture ne constitue aucune qualification réelle."],
  };
}
export type Fixtures = {
  status?: unknown | (() => unknown);
  http?: number;
  history?: (days: number) => unknown;
  qualification?: unknown;
};
export async function fixtures(page: Page, fixture: Fixtures = {}) {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|Refused to|SyntaxError|ReferenceError|TypeError/.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.origin);
      await route.abort();
      return;
    }
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/api/status")
      return respond(
        typeof fixture.status === "function"
          ? fixture.status()
          : (fixture.status ?? snapshot()),
        fixture.http ?? 200,
      );
    if (url.pathname === "/api/history")
      return respond(
        fixture.history
          ? fixture.history(Number(url.searchParams.get("days")))
          : history(Number(url.searchParams.get("days"))),
      );
    if (url.pathname === "/qualification.json")
      return respond(fixture.qualification ?? qualification());
    return route.continue();
  });
  return { errors, external };
}
