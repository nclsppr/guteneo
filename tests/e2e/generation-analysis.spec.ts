import { expect, test, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  GenerationJobView,
  GenerationResultView,
} from "../../packages/contracts/src/template-workflow";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

async function generationFixture(page: Page) {
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  await expect(page.locator(".workspace")).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
  await page.clock.install();
  const id = "gen_analysis_browser_fixture";
  const job: GenerationJobView = {
    id,
    templateId: "tpl_analysis_browser_fixture",
    templateVersion: 1,
    datasetId: null,
    mappingId: null,
    mappingVersion: null,
    mode: "generate_only",
    state: "completed",
    total: 1,
    generated: 1,
    failed: 0,
    pending: 0,
    cancelled: 0,
    createdAt: "2026-10-25T10:00:00Z",
    updatedAt: "2026-10-25T10:00:00Z",
  };
  let result: GenerationResultView = {
    recordId: "record-2",
    state: "generated",
    attempts: 1,
    inputHash: "a".repeat(64),
    documentId: "doc_analysis_browser_fixture",
    documentHash: "b".repeat(64),
    documentStatus: "quarantined",
    documentAnalysis: documentAnalysis(
      "quarantined",
      "processing",
      "scanner_starting",
    ),
    documentUrl: null,
    errorCode: null,
  };
  let reads = 0;
  let fail = false;
  let nextReadGate: Promise<void> | undefined;
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.route(`**/api/generation-jobs/${id}{,/results}`, async (route) => {
    expect(route.request().method()).toBe("GET");
    if (!new URL(route.request().url()).pathname.endsWith("/results"))
      return route.fulfill({ json: job });
    reads += 1;
    if (fail) return route.abort("failed");
    const gate = nextReadGate;
    nextReadGate = undefined;
    await gate;
    return route.fulfill({ json: { items: [result], nextCursor: null } });
  });
  return {
    get reads() {
      return reads;
    },
    writes,
    setResult(update: Partial<GenerationResultView>) {
      result = { ...result, ...update };
    },
    failRead(value: boolean) {
      fail = value;
    },
    holdNextResultRead() {
      let release!: () => void;
      nextReadGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    async open() {
      await page.goto(`/#/app/studio/generation/${id}`);
      await expect(selection(page)).toBeDisabled();
    },
  };
}

const selection = (page: Page) =>
  page.getByRole("checkbox", { name: "Sélectionner record-2", exact: true });
const refresh = (page: Page) =>
  page.getByRole("button", { name: "Actualiser le suivi", exact: true });

for (const outcome of ["ready", "retryable", "blocked"] as const) {
  test(`completed generation follows a proven verification until ${outcome}, without sending or moving focus`, async ({
    page,
  }) => {
    const fixture = await generationFixture(page);
    await fixture.open();
    await expect(page.getByRole("status").last()).toContainText(
      "Vérification du PDF en cours",
    );
    await expect(page.getByRole("button", { name: "Voir le PDF" })).toHaveCount(
      0,
    );
    await refresh(page).focus();
    await page.clock.fastForward(14_000);
    expect(fixture.reads).toBe(1);
    fixture.setResult({
      documentStatus: outcome === "ready" ? "ready" : "quarantined",
      documentAnalysis:
        outcome === "ready"
          ? documentAnalysis("ready")
          : documentAnalysis(
              "quarantined",
              outcome,
              outcome === "blocked" ? "security_rejected" : "retry_exhausted",
            ),
    });
    await page.clock.fastForward(1_001);
    await expect.poll(() => fixture.reads).toBe(2);
    if (outcome === "ready") {
      await expect(selection(page)).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Voir le PDF" }),
      ).toBeVisible();
    } else {
      await expect(selection(page)).toBeDisabled();
      await expect(page.locator(".studio-table")).toContainText(
        outcome === "blocked"
          ? "PDF bloqué par le contrôle de sécurité"
          : "La vérification prend plus de temps que prévu",
      );
    }
    await expect(refresh(page)).toBeFocused();
    await page.clock.fastForward(60_000);
    expect(fixture.reads).toBe(2);
    expect(fixture.writes).toEqual([]);
  });
}

test("a quarantined result without processing evidence never starts automatic reads", async ({
  page,
}) => {
  const fixture = await generationFixture(page);
  fixture.setResult({ documentAnalysis: null });
  await fixture.open();
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(1);
  await expect(selection(page)).toBeDisabled();
  expect(fixture.writes).toEqual([]);
});

test("a verification read error stops automatic followup and manual refresh recovers", async ({
  page,
}) => {
  const fixture = await generationFixture(page);
  await fixture.open();
  fixture.failRead(true);
  await page.clock.fastForward(15_001);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status").last()).toContainText(
    "Le suivi automatique est en pause",
  );
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(2);
  fixture.failRead(false);
  fixture.setResult({
    documentStatus: "ready",
    documentAnalysis: documentAnalysis("ready"),
  });
  await refresh(page).press("Enter");
  await expect(selection(page)).toBeEnabled();
  expect(fixture.reads).toBe(3);
  expect(fixture.writes).toEqual([]);
});

test("verification followup stops after two minutes and an explicit refresh grants a new window", async ({
  page,
}) => {
  const fixture = await generationFixture(page);
  await fixture.open();
  await page.clock.fastForward(120_001);
  await expect(page.getByRole("status").last()).toContainText(
    "Le suivi automatique est en pause",
  );
  const pausedReads = fixture.reads;
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(pausedReads);
  const releaseManualRead = fixture.holdNextResultRead();
  await refresh(page).press("Enter");
  await expect.poll(() => fixture.reads).toBe(pausedReads + 1);
  // Hold the response until loading is rendered, so the next assertion cannot
  // match the table's previous idle state before the refresh has committed.
  await expect(page.locator(".studio-table")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  releaseManualRead();
  await expect(page.locator(".studio-table")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  // Let this committed render paint and flush its followup effect before
  // advancing the mocked clock past the newly armed interval.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  fixture.setResult({
    documentStatus: "ready",
    documentAnalysis: documentAnalysis("ready"),
  });
  await page.clock.fastForward(15_001);
  await expect(selection(page)).toBeEnabled();
  expect(fixture.reads).toBe(pausedReads + 2);
  expect(fixture.writes).toEqual([]);
});

test("hidden pages pause verification reads and navigation cancels the followup", async ({
  page,
}) => {
  const fixture = await generationFixture(page);
  await fixture.open();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(15_001);
  await expect.poll(() => fixture.reads).toBe(2);
  await page.goto("/#/app/documents");
  await expect(selection(page)).toHaveCount(0);
  await page.clock.fastForward(60_000);
  expect(fixture.reads).toBe(2);
  expect(fixture.writes).toEqual([]);
});
