import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DomainService,
  type ActorContext,
  type Dispatch,
} from "../../packages/domain/src/index";
import {
  resolveFaxUsageTariff,
  settleFaxUsage,
  type OperatorFaxUsageProof,
} from "../../packages/domain/src/live-fax-usage";

// Deferred deterministic fixtures prove overlap and the authorization/submission
// barriers without clocks, provider traffic, or database performance assumptions.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
type Statement = {
  query: string;
  values: unknown[];
  bind(...values: unknown[]): Statement;
  first(): unknown;
  all(): unknown;
};
function database(
  read: (query: string, values: unknown[], method: "first" | "all") => unknown,
  batch: (statements: Statement[]) => unknown = () => [],
) {
  return {
    prepare(query: string): Statement {
      return {
        query,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        first() {
          return read(query, this.values, "first");
        },
        all() {
          return read(query, this.values, "all");
        },
      };
    },
    batch,
  } as unknown as D1Database;
}
const actor: ActorContext = {
  organizationId: "org_async",
  userId: "user_async",
  role: "admin",
  actor: "browser",
};
const membership = { mode: "simulation", membership_role: "admin" };
const queued = {
  id: "dsp_async",
  organization_id: actor.organizationId,
  channel: "email",
  mode: "simulation",
  document_id: "doc_async",
  sender_id: "sender_async",
  sender_address: "fixture@example.invalid",
  recipient_json: JSON.stringify({ email: "recipient@example.invalid" }),
  options_json: "{}",
  status: "submitting",
  active_attempt_id: null,
  provider_id: null,
} as unknown as Dispatch;
const proof: OperatorFaxUsageProof = {
  source: "operator_reconciled_usage",
  organizationId: actor.organizationId,
  dispatchId: queued.id,
  attemptId: "attempt_async",
  providerId: "provider_async",
  accountId: "account_async",
  connectionId: "connection_async",
  quoteFingerprint: "a".repeat(64),
  supplierNanoUsd: 1,
  reviewerId: actor.userId,
  evidenceReference: "deterministic async fixture",
  evidenceSha256: "b".repeat(64),
  observedAt: "2026-09-17T12:00:00.000Z",
};

afterEach(() => vi.restoreAllMocks());

describe("domain async dependencies", () => {
  it("starts both usage reads after membership succeeds and waits for both", async () => {
    const authorization = deferred<unknown>();
    const credit = deferred<unknown>();
    const usage = deferred<unknown>();
    const reads: string[] = [];
    const db = database((query, values) => {
      expect(values[0]).toBe(actor.organizationId);
      if (query.includes("JOIN memberships")) return authorization.promise;
      if (query.includes("welcome_credit_balances")) {
        reads.push("credit");
        return credit.promise;
      }
      if (query.includes("SELECT DISTINCT period")) return { results: [] };
      if (query.includes("FROM usage")) {
        reads.push("usage");
        return usage.promise;
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    const result = new DomainService(db, { mode: "simulation" }).usage(actor);
    expect(reads).toEqual([]);
    authorization.resolve(membership);
    await vi.waitFor(() => expect(reads).toEqual(["credit", "usage"]));
    const completed = vi.fn();
    void result.then(completed);
    credit.resolve({ mode: "simulation", available_minor: 5000 });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    usage.resolve({ results: [{ channel: "email" }] });
    await expect(result).resolves.toMatchObject({
      welcomeCredit: { availableMinor: 5000, status: "simulation" },
      items: [{ channel: "email" }],
    });
  });

  it("does not read usage or balances after membership rejection", async () => {
    const read = vi.fn(() => null);
    const result = new DomainService(database(read), {
      mode: "simulation",
    }).usage(actor);
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("starts the idempotency lookup while the request digest is pending", async () => {
    const digest = deferred<ArrayBuffer>();
    const hashed = vi
      .spyOn(crypto.subtle, "digest")
      .mockReturnValue(digest.promise);
    const lookup = deferred<unknown>();
    const existing = {
      ...queued,
      request_hash: "0".repeat(64),
      quote_fx_json: null,
    };
    const read = vi.fn((query: string) => {
      if (query.includes("JOIN memberships")) return membership;
      if (query.includes("prepare_key=?")) return lookup.promise;
      if (query.includes("SELECT d.*")) return existing;
      if (query.includes("SELECT * FROM documents"))
        return { id: queued.document_id, status: "ready" };
      throw new Error(`Unexpected query: ${query}`);
    });
    const result = new DomainService(database(read), {
      mode: "simulation",
    }).prepareDispatch(
      actor,
      { channel: "email", recipient: { email: "recipient@example.invalid" } },
      "prepare-async",
    );
    await vi.waitFor(() => {
      expect(hashed).toHaveBeenCalledOnce();
      expect(
        read.mock.calls.some(([query]) => query.includes("prepare_key=?")),
      ).toBe(true);
    });
    lookup.resolve(existing);
    digest.resolve(new ArrayBuffer(32));
    await expect(result).resolves.toMatchObject({ id: existing.id });
  });

  it.each(["2026-08", "latest"])(
    "retains the requested %s usage period while independent balances and rows overlap",
    async (requestedPeriod) => {
      const credit = deferred<unknown>();
      const usage = deferred<unknown>();
      const reads: string[] = [];
      const db = database((query, values) => {
        expect(values[0]).toBe(actor.organizationId);
        if (query.includes("JOIN memberships")) return membership;
        if (query.includes("SELECT DISTINCT period"))
          return { results: [{ period: "2026-12" }, { period: "2026-08" }] };
        if (query.includes("welcome_credit_balances")) {
          reads.push("credit");
          return credit.promise;
        }
        if (query.includes("FROM usage")) {
          expect(values[1]).toBe("2026-08");
          reads.push("usage");
          return usage.promise;
        }
        throw new Error(`Unexpected query: ${query}`);
      });
      const result = new DomainService(db, {
        mode: "simulation",
        now: () => Date.parse("2026-11-03T12:00:00.000Z"),
      }).usage(actor, requestedPeriod);
      await vi.waitFor(() => expect(reads).toEqual(["credit", "usage"]));
      credit.resolve({ mode: "simulation", available_minor: 5000 });
      usage.resolve({ results: [{ period: "2026-08", channel: "email" }] });
      await expect(result).resolves.toMatchObject({
        period: "2026-08",
        currentPeriod: "2026-11",
        availablePeriods: ["2026-12", "2026-11", "2026-08"],
        items: [{ period: "2026-08", channel: "email" }],
      });
    },
  );

  it("starts every dispatch preflight read and waits for all before submitting", async () => {
    const gates = [
      deferred<unknown>(),
      deferred<unknown>(),
      deferred<unknown>(),
      deferred<unknown>(),
    ];
    const started: number[] = [];
    const row = { ...queued };
    let claimed = false;
    const db = database(
      (query, values) => {
        if (query.includes("review_only_fax_dispatches")) return null;
        if (query.includes("SELECT id,organization_id")) return row;
        if (query === "SELECT * FROM dispatches WHERE id=?") {
          expect(claimed).toBe(true);
          return row;
        }
        const index = [
          "FROM channel_controls",
          "FROM suppressions",
          "FROM senders",
          "FROM documents",
        ].findIndex((part) => query.includes(part));
        if (index !== -1) {
          expect(values[0]).toBe(actor.organizationId);
          started.push(index);
          return gates[index].promise;
        }
        if (query.includes("SELECT provider_id")) return { provider_id: null };
        if (query.includes("SELECT status FROM dispatches"))
          return { status: "failed" };
        throw new Error(`Unexpected query: ${query}`);
      },
      (statements) => {
        if (!claimed) {
          claimed = true;
          row.active_attempt_id = statements[0].values[1] as string;
        }
        return [];
      },
    );
    const submit = vi.fn(async () => ({ status: "rejected" as const }));
    const result = new DomainService(db, {
      mode: "simulation",
    }).processDispatch(row.id, {
      name: "simulation",
      submit,
    });
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
    gates[0].resolve({ enabled: 1 });
    gates[1].resolve(null);
    gates[2].resolve({ ready: 1 });
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
    gates[3].resolve({ ready: 1 });
    await expect(result).resolves.toEqual({
      processed: true,
      status: "failed",
    });
    expect(submit).toHaveBeenCalledOnce();
  });

  it.each([
    [0, { enabled: 0 }, "CHANNEL_DISABLED"],
    [1, { suppressed: 1 }, "RECIPIENT_SUPPRESSED"],
    [2, null, "SENDER_NOT_CONFIGURED"],
    [3, null, "DOCUMENT_QUARANTINED"],
  ])(
    "fails closed when parallel preflight %i fails",
    async (failedIndex, failedValue, code) => {
      const row = { ...queued };
      const checks: unknown[] = [
        { enabled: 1 },
        null,
        { ready: 1 },
        { ready: 1 },
      ];
      checks[failedIndex] = failedValue;
      const batches: Statement[][] = [];
      const db = database(
        (query) => {
          if (query.includes("review_only_fax_dispatches")) return null;
          if (
            query.includes("SELECT id,organization_id") ||
            query === "SELECT * FROM dispatches WHERE id=?"
          )
            return row;
          const index = [
            "FROM channel_controls",
            "FROM suppressions",
            "FROM senders",
            "FROM documents",
          ].findIndex((part) => query.includes(part));
          if (index !== -1) return checks[index];
          throw new Error(`Unexpected query: ${query}`);
        },
        (statements) => {
          batches.push(statements);
          if (batches.length === 1)
            row.active_attempt_id = statements[0].values[1] as string;
          return [];
        },
      );
      const submit = vi.fn();
      await expect(
        new DomainService(db, { mode: "simulation" }).processDispatch(row.id, {
          name: "simulation",
          submit,
        }),
      ).resolves.toEqual({ processed: true, status: "failed" });
      expect(submit).not.toHaveBeenCalled();
      expect(batches[1][1].values[0]).toBe(code);
    },
  );

  it("reads the scoped tariff and sender together after the v3 ownership gate", async () => {
    const tariff = deferred<unknown>();
    const sender = deferred<unknown>();
    const started: string[] = [];
    const db = database((query, values) => {
      expect(values[0]).toBe(actor.organizationId);
      if (query.includes("SELECT 1 FROM trusted_fax_usage_tariffs"))
        return { owns: 1 };
      if (query.includes("SELECT * FROM trusted_fax_usage_tariffs")) {
        started.push("tariff");
        return tariff.promise;
      }
      if (query.includes("FROM senders")) {
        started.push("sender");
        return sender.promise;
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    const result = resolveFaxUsageTariff(
      db,
      actor.organizationId,
      "sender_async",
      "+352400000000",
      "{}",
      1,
      {
        accountId: "account_async",
        connectionId: "connection_async",
        outboundProfileId: "profile_async",
      },
      "2026-09-17T12:00:00.000Z",
    );
    // Observe rejection immediately while the controlled reads are still pending.
    const rejected = expect(result).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    await vi.waitFor(() => expect(started).toEqual(["tariff", "sender"]));
    tariff.resolve(null);
    sender.resolve(null);
    await rejected;
  });

  it("overlaps settlement proof hashing with the replay read and returns before further reads on replay", async () => {
    const digest = deferred<ArrayBuffer>();
    vi.spyOn(crypto.subtle, "digest").mockReturnValue(digest.promise);
    const prior = deferred<unknown>();
    const read = vi.fn(() => prior.promise);
    const db = database(read);
    const result = settleFaxUsage(db, proof, proof.observedAt);
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]).toEqual([
      expect.stringContaining("FROM fax_usage_settlements"),
      [actor.organizationId, queued.id],
      "first",
    ]);
    const settled = { proof_fingerprint: "0".repeat(64) };
    prior.resolve(settled);
    digest.resolve(new ArrayBuffer(32));
    await expect(result).resolves.toBe(settled);
    expect(read).toHaveBeenCalledOnce();
  });

  it("starts settlement quote and dispatch reads together only after ruling out a replay", async () => {
    const prior = deferred<unknown>();
    const quote = deferred<unknown>();
    const dispatch = deferred<unknown>();
    const started: string[] = [];
    const db = database((query, values) => {
      expect(values).toEqual([actor.organizationId, queued.id]);
      if (query.includes("FROM fax_usage_settlements")) return prior.promise;
      if (query.includes("FROM live_fax_quotes_v3")) {
        started.push("quote");
        return quote.promise;
      }
      if (query.includes("FROM dispatches")) {
        started.push("dispatch");
        return dispatch.promise;
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    const result = settleFaxUsage(db, proof, proof.observedAt);
    const rejected = expect(result).rejects.toMatchObject({
      code: "FAX_USAGE_PROOF_INVALID",
    });
    expect(started).toEqual([]);
    prior.resolve(null);
    await vi.waitFor(() => expect(started).toEqual(["quote", "dispatch"]));
    quote.resolve(null);
    dispatch.resolve(null);
    await rejected;
  });
});
