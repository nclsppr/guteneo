import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";

vi.mock("../../apps/api/src/mcp", () => ({ handleMcp: vi.fn() }));
vi.mock("../../apps/api/src/maintenance", () => ({
  maintainDocuments: vi.fn(async () => ({ purged: 0, orphans: 0 })),
}));
vi.mock("../../apps/api/src/postal", () => ({
  PostalService: vi.fn(),
  cleanupPostalEvidence: vi.fn(async () => undefined),
}));
vi.mock("../../apps/api/src/provider-freshness", () => ({
  collectProviderFreshness: vi.fn(),
}));
vi.mock("../../apps/api/src/freshness-alerts", () => ({
  reconcileFreshnessAlerts: vi.fn(),
}));
vi.mock("../../apps/api/src/freshness-prevention", () => ({
  reconcileFreshnessPrevention: vi.fn(),
}));
vi.mock("../../apps/api/src/provider-prevention-notifications", () => ({
  processPreventionNotifications: vi.fn(),
}));

import worker from "../../apps/api/src/index";
import { collectProviderFreshness } from "../../apps/api/src/provider-freshness";
import { reconcileFreshnessAlerts } from "../../apps/api/src/freshness-alerts";
import { reconcileFreshnessPrevention } from "../../apps/api/src/freshness-prevention";
import { processPreventionNotifications } from "../../apps/api/src/provider-prevention-notifications";

const privateMarker = "PRIVATE_RECIPIENT_CONTENT_TOKEN";
const collect = vi.mocked(collectProviderFreshness);
const reconcile = vi.mocked(reconcileFreshnessAlerts);
const prevent = vi.mocked(reconcileFreshnessPrevention);
const notify = vi.mocked(processPreventionNotifications);
let records: Record<string, unknown>[];
const evaluations = [
  {
    organizationId: privateMarker,
    family: "fax_authority" as const,
    bindingSha256: "a".repeat(64),
    active: true,
    candidates: [
      {
        revisionSha256: "b".repeat(64),
        deadline: "2027-02-28T22:59:59.999Z",
        mode: "operator" as const,
      },
    ],
  },
];

function environment(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    AUTH0_DOMAIN: "fixture.invalid",
    AUTH0_CLIENT_ID: "fixture",
    AUTH0_CLIENT_SECRET: "fixture",
    AUTH0_AUDIENCE: "https://guteneo.com/mcp",
    DB: {
      batch: async () => [],
      prepare: () => ({
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    },
    ...overrides,
  } as unknown as Env;
}

beforeEach(() => {
  vi.clearAllMocks();
  records = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((value) => records.push(value));
  vi.spyOn(DomainService.prototype, "publishOutbox").mockResolvedValue({
    published: 3,
  });
  vi.spyOn(DomainService.prototype, "reconcileExpiredLeases").mockResolvedValue({
    uncertain: 0,
  });
  collect.mockResolvedValue({ evaluations, freshnessChecksFailed: 0 });
  reconcile.mockResolvedValue({
    freshnessAtRisk: 0,
    freshnessExpired: 0,
    freshnessOpened: 0,
    freshnessResolved: 0,
    freshnessChecksFailed: 0,
  });
  prevent.mockResolvedValue({
    preventionActive: 1,
    preventionOpened: 1,
    preventionResolved: 0,
    preventionNotificationsQueued: 1,
    preventionChecksFailed: 0,
  });
  notify.mockResolvedValue({
    providerPreventionNotificationsSent: 0,
    providerPreventionNotificationsFailed: 0,
    providerPreventionNotificationsUnknown: 0,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("scheduled provider prevention", () => {
  it("uses one inspected clock and reconciles durable prevention before processing notifications", async () => {
    const env = environment();
    await worker.scheduled({} as ScheduledController, env);
    const evaluatedAt = reconcile.mock.calls[0][2];
    expect(evaluatedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(collect.mock.calls[0][1]?.now?.()).toBe(Date.parse(evaluatedAt!));
    expect(reconcile).toHaveBeenCalledWith(env.DB, evaluations, evaluatedAt);
    expect(prevent).toHaveBeenCalledWith(env.DB, evaluations, evaluatedAt);
    expect(reconcile.mock.invocationCallOrder[0]).toBeLessThan(
      prevent.mock.invocationCallOrder[0],
    );
    expect(prevent.mock.invocationCallOrder[0]).toBeLessThan(
      notify.mock.invocationCallOrder[0],
    );
    expect(notify).toHaveBeenCalledExactlyOnceWith(env);
    expect(records.find((record) => record.event === "freshness")).toMatchObject({
      code: "OK",
      freshnessChecksFailed: 0,
      preventionActive: 1,
      preventionNotificationsQueued: 1,
      alertClass: 2,
    });
    expect(records.find((record) => record.event === "cron")).toMatchObject({
      code: "OK",
      stage: "complete",
      published: 3,
    });
    expect(JSON.stringify(records)).not.toContain(privateMarker);
  });

  it("keeps a missing prevention migration visible without stopping unrelated outbox work", async () => {
    prevent.mockRejectedValue(new Error(privateMarker));
    await worker.scheduled({} as ScheduledController, environment());
    expect(notify).not.toHaveBeenCalled();
    expect(records.find((record) => record.event === "freshness")).toMatchObject({
      code: "FRESHNESS_CHECK_FAILED",
      freshnessChecksFailed: 1,
      preventionChecksFailed: 1,
      alertClass: 3,
      alertFailure: 1,
    });
    expect(records.find((record) => record.event === "cron")).toMatchObject({
      code: "OK",
      stage: "complete",
      published: 3,
    });
    expect(JSON.stringify(records)).not.toContain(privateMarker);
  });

  it.each(["collection", "incident_fence", "prevention_fence"] as const)(
    "defers pending notifications after a partial or stale %s result",
    async (failure) => {
      if (failure === "collection")
        collect.mockResolvedValue({ evaluations, freshnessChecksFailed: 1 });
      else if (failure === "incident_fence")
        reconcile.mockResolvedValue({
          freshnessAtRisk: 0,
          freshnessExpired: 0,
          freshnessOpened: 0,
          freshnessResolved: 0,
          freshnessChecksFailed: 1,
        });
      else
        prevent.mockResolvedValue({
          preventionActive: 1,
          preventionOpened: 0,
          preventionResolved: 0,
          preventionNotificationsQueued: 0,
          preventionChecksFailed: 1,
        });
      await worker.scheduled({} as ScheduledController, environment());
      expect(notify).not.toHaveBeenCalled();
      expect(records.find((record) => record.event === "freshness")).toMatchObject({
        code: "FRESHNESS_CHECK_FAILED",
        freshnessChecksFailed: 1,
        alertClass: 3,
      });
      expect(records.find((record) => record.event === "cron")).toMatchObject({
        code: "OK",
        stage: "complete",
        published: 3,
      });
    },
  );

  it("does not send an old pending notice after J-1 deselection commits but prevention storage fails", async () => {
    const inactive = [{ ...evaluations[0], active: false, candidates: [] }];
    let deselectionCommitted = false;
    collect.mockResolvedValue({ evaluations: inactive, freshnessChecksFailed: 0 });
    reconcile.mockImplementation(async () => {
      deselectionCommitted = true;
      return {
        freshnessAtRisk: 0,
        freshnessExpired: 0,
        freshnessOpened: 0,
        freshnessResolved: 1,
        freshnessChecksFailed: 0,
      };
    });
    prevent.mockImplementation(async () => {
      expect(deselectionCommitted).toBe(true);
      throw new Error(privateMarker);
    });
    await worker.scheduled({} as ScheduledController, environment());
    expect(reconcile).toHaveBeenCalledOnce();
    expect(prevent).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
    expect(records.find((record) => record.event === "freshness")).toMatchObject({
      code: "FRESHNESS_CHECK_FAILED",
      freshnessResolved: 1,
      preventionChecksFailed: 1,
    });
    expect(records.find((record) => record.event === "cron")).toMatchObject({
      code: "OK",
      stage: "complete",
      published: 3,
    });
    expect(JSON.stringify(records)).not.toContain(privateMarker);
  });

  it("retains a genuine expired incident even when prevention and notifications succeed", async () => {
    reconcile.mockResolvedValue({
      freshnessAtRisk: 0,
      freshnessExpired: 1,
      freshnessOpened: 0,
      freshnessResolved: 0,
      freshnessChecksFailed: 0,
    });
    await worker.scheduled({} as ScheduledController, environment());
    expect(records.find((record) => record.event === "freshness")).toMatchObject({
      code: "FRESHNESS_AT_RISK",
      freshnessExpired: 1,
      freshnessChecksFailed: 0,
      alertClass: 3,
      alertFailure: 1,
    });
  });

  it.each(["failed", "unknown", "throw"] as const)(
    "makes %s operational notification outcomes technical failures without retrying the process or stopping cron",
    async (outcome) => {
      if (outcome === "throw") notify.mockRejectedValue(new Error(privateMarker));
      else
        notify.mockResolvedValue({
          providerPreventionNotificationsSent: 0,
          providerPreventionNotificationsFailed: Number(outcome === "failed"),
          providerPreventionNotificationsUnknown: Number(outcome === "unknown"),
        });
      await worker.scheduled({} as ScheduledController, environment());
      expect(notify).toHaveBeenCalledOnce();
      expect(records.find((record) => record.event === "freshness")).toMatchObject({
        code: "FRESHNESS_CHECK_FAILED",
        freshnessChecksFailed: 1,
        alertClass: 3,
      });
      expect(records.find((record) => record.event === "cron")).toMatchObject({
        code: "OK",
        stage: "complete",
        published: 3,
      });
      expect(JSON.stringify(records)).not.toContain(privateMarker);
    },
  );

  it("runs preventive maintenance before missing interactive identity closes the rest of cron", async () => {
    await worker.scheduled(
      {} as ScheduledController,
      environment({ AUTH0_CLIENT_SECRET: undefined }),
    );
    expect(prevent).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    expect(records.find((record) => record.event === "cron")).toMatchObject({
      code: "IDENTITY_NOT_CONFIGURED",
      stage: "identity",
    });
  });

  it("does not invoke production prevention or notification processing in local simulation", async () => {
    await worker.scheduled(
      {} as ScheduledController,
      environment({
        ENVIRONMENT: "local",
        MODE: "simulation",
        APP_ORIGIN: "http://localhost:8787",
      }),
    );
    expect(prevent).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(records.some((record) => record.event === "freshness")).toBe(false);
  });
});
