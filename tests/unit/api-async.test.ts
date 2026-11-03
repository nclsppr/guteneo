import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAccountRoute } from "../../apps/api/src/account";
import * as auth from "../../apps/api/src/auth";
import { BillingService, type BillingEnv } from "../../apps/api/src/billing";
import {
  handleAuthRoute,
  type AuthContext,
  type AuthEnv,
} from "../../apps/api/src/auth";
import { DocumentService } from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import type { DomainService } from "../../packages/domain/src/index";
import {
  prepareProtectedDocument,
  type ProtectedDocumentsEnv,
} from "../../apps/api/src/protected-documents";

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const actor: AuthContext = {
  organizationId: "org_async",
  userId: "user_async",
  role: "admin",
  actor: "browser",
};

describe("independent API reads", () => {
  it("keeps appearance and locale when account reads overlap after browser authentication", async () => {
    const authorization = deferred<auth.AuthenticatedSession>();
    vi.spyOn(auth, "authenticateBrowser").mockReturnValue(
      authorization.promise,
    );
    const user = deferred<unknown>();
    const organization = deferred<unknown>();
    const reads: string[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              if (sql.includes("FROM users"))
                expect(values).toEqual([actor.userId]);
              if (sql.includes("FROM organizations"))
                expect(values).toEqual([actor.organizationId]);
              return this;
            },
            first() {
              if (sql.includes("INSERT INTO http_limits")) return { count: 1 };
              if (sql.includes("FROM users")) {
                expect(sql).toContain("preferred_dashboard_appearance");
                reads.push("user");
                return user.promise;
              }
              if (sql.includes("FROM organizations")) {
                reads.push("organization");
                return organization.promise;
              }
              throw new Error(`Unexpected query: ${sql}`);
            },
          };
        },
      },
    } as unknown as AuthEnv;
    const pending = handleAccountRoute(
      new Request("https://guteneo.example/api/account"),
      env,
    );
    expect(reads).toEqual([]);
    authorization.resolve({
      context: actor,
      user: { email: "member@example.invalid" },
      simulation: true,
      mfa: false,
      verifiedAccount: true,
    } as auth.AuthenticatedSession);
    await vi.waitFor(() => expect(reads).toEqual(["user", "organization"]));
    organization.resolve({ name: "Fixture workspace" });
    user.resolve({
      name: "Fixture member",
      preferred_locale: "de",
      preferred_dashboard_appearance: "v2",
    });
    const response = await pending;
    expect(await response!.json()).toMatchObject({
      user: {
        name: "Fixture member",
        preferredLocale: "de",
        preferredDashboardAppearance: "v2",
      },
      organization: { id: actor.organizationId, name: "Fixture workspace" },
    });
  });

  it("authorizes billing before starting its independent overview reads", async () => {
    const authorization = deferred<unknown>();
    const reads = new Map<string, ReturnType<typeof deferred<unknown>>>();
    const values = new Map<string, unknown[]>([]);
    const DB = {
      prepare(sql: string) {
        const name = sql.includes("FROM memberships")
          ? "authorization"
          : sql.includes("welcome_credit_balances")
            ? "credit"
            : sql.includes("FROM organizations")
              ? "organization"
              : sql.includes("billing_accounts")
                ? "customer"
                : sql.includes("billing_subscriptions")
                  ? "subscriptions"
                  : "usage";
        return {
          bind(...args: unknown[]) {
            values.set(name, args);
            return this;
          },
          first() {
            if (name === "authorization") return authorization.promise;
            const pending = deferred<unknown>();
            reads.set(name, pending);
            return pending.promise;
          },
          all() {
            return this.first();
          },
        };
      },
    } as unknown as D1Database;
    const pending = new BillingService({
      DB,
      STRIPE_MODE: "test",
    } as BillingEnv).overview(actor);
    expect(reads.size).toBe(0);
    authorization.resolve({ role: "admin" });
    await vi.waitFor(() =>
      expect([...reads.keys()].sort()).toEqual([
        "credit",
        "customer",
        "organization",
        "subscriptions",
        "usage",
      ]),
    );
    for (const args of values.values())
      expect(args[0]).toBe(actor.organizationId);
    reads.get("usage")!.resolve({ results: [{ channel: "email" }] });
    reads.get("credit")!.resolve({ mode: "simulation" });
    reads.get("customer")!.resolve({ customer_id: "cus_fixture" });
    reads.get("organization")!.resolve({ mode: "simulation" });
    reads.get("subscriptions")!.resolve({ results: [{ id: "sub_fixture" }] });
    await expect(pending).resolves.toMatchObject({
      customerLinked: true,
      subscriptions: [{ id: "sub_fixture" }],
      welcomeCredit: { kind: "simulation" },
      usageLedger: { kind: "simulation", channels: [{ channel: "email" }] },
    });
  });

  it("does not start billing reads when current administrator membership is absent", async () => {
    const prepare = vi.fn(() => ({
      bind() {
        return this;
      },
      first: async () => ({ role: "observer" }),
    }));
    const service = new BillingService({
      DB: { prepare },
    } as unknown as BillingEnv);
    await expect(service.overview(actor)).rejects.toMatchObject({
      code: "BILLING_ADMIN_REQUIRED",
    });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("overlaps the two bounded analysis reads after an authorized document page resolves", async () => {
    const page = deferred<unknown>();
    const items = Array.from({ length: 100 }, (_, id) => ({
      id: `doc_${id}`,
      status: "ready",
    }));
    const chunks: {
      args: unknown[];
      pending: ReturnType<typeof deferred<unknown>>;
    }[] = [];
    const DB = {
      prepare() {
        let args: unknown[];
        return {
          bind(...values: unknown[]) {
            args = values;
            return this;
          },
          all() {
            const pending = deferred<unknown>();
            chunks.push({ args, pending });
            return pending.promise;
          },
        };
      },
    } as unknown as D1Database;
    const domain = {
      listDocuments: () => page.promise,
    } as unknown as DomainService;
    const pending = new DocumentService({ DB } as Env, domain).list(
      actor,
      undefined,
      100,
    );
    expect(chunks).toHaveLength(0);
    page.resolve({ items, nextCursor: "next_page" });
    await vi.waitFor(() => expect(chunks).toHaveLength(2));
    expect(chunks.map(({ args }) => args.length)).toEqual([91, 11]);
    for (const { args } of chunks) expect(args[0]).toBe(actor.organizationId);
    chunks[1].pending.resolve({ results: [] });
    chunks[0].pending.resolve({ results: [] });
    const result = await pending;
    expect(result.items.map(({ id }) => id)).toEqual(items.map(({ id }) => id));
    expect(result.nextCursor).toBe("next_page");
  });

  it("starts login challenge and secret digests together before saving the transaction", async () => {
    const digests: ReturnType<typeof deferred<ArrayBuffer>>[] = [];
    vi.spyOn(crypto.subtle, "digest").mockImplementation(() => {
      const pending = deferred<ArrayBuffer>();
      digests.push(pending);
      return pending.promise;
    });
    const run = vi.fn(async () => ({ meta: { changes: 1 } }));
    const bind = vi.fn(() => ({ run }));
    const env = {
      ENVIRONMENT: "local",
      MODE: "simulation",
      APP_ORIGIN: "http://localhost:8787",
      AUTH0_DOMAIN: "async-fixture.auth0.example",
      AUTH0_CLIENT_ID: "fixture-client",
      AUTH0_CLIENT_SECRET: "fixture-secret",
      AUTH0_AUDIENCE: "fixture-audience",
      DB: { prepare: () => ({ bind }) },
    } as unknown as AuthEnv;
    const pending = handleAuthRoute(
      new Request(`${env.APP_ORIGIN}/auth/login`),
      env,
    );
    await vi.waitFor(() => expect(digests).toHaveLength(3));
    expect(run).not.toHaveBeenCalled();
    for (const digest of digests) digest.resolve(new ArrayBuffer(32));
    const response = await pending;
    expect(response?.status).toBe(302);
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      new URL(response!.headers.get("Location")!).searchParams.get(
        "code_challenge_method",
      ),
    ).toBe("S256");
  });

  it("overlaps protected-document encryption, password derivation and token hashing before persistence", async () => {
    const encryption = deferred<ArrayBuffer>();
    const derivation = deferred<ArrayBuffer>();
    const digest = deferred<ArrayBuffer>();
    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockResolvedValue({} as CryptoKey);
    const encrypt = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockReturnValue(encryption.promise);
    const deriveBits = vi
      .spyOn(crypto.subtle, "deriveBits")
      .mockReturnValue(derivation.promise);
    const hash = vi
      .spyOn(crypto.subtle, "digest")
      .mockReturnValue(digest.promise);
    const batch = vi.fn();
    const env = {
      MODE: "production",
      PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
      DB: {
        prepare(sql: string) {
          return {
            bind() {
              return this;
            },
            first: async () =>
              sql.includes("FROM documents")
                ? { id: "doc_async", sha256: "a".repeat(64) }
                : {},
          };
        },
        batch,
      },
    } as unknown as ProtectedDocumentsEnv;
    const pending = prepareProtectedDocument(env, actor, {
      documentId: "doc_async",
    });
    await vi.waitFor(() => {
      expect(encrypt).toHaveBeenCalledTimes(1);
      expect(deriveBits).toHaveBeenCalledTimes(1);
      expect(hash).toHaveBeenCalledTimes(1);
    });
    expect(
      importKey.mock.calls.filter((call) => call[2] === "AES-GCM"),
    ).toHaveLength(1);
    expect(batch).not.toHaveBeenCalled();
    const failure = new Error("fixture encryption failure");
    encryption.reject(failure);
    await expect(pending).rejects.toBe(failure);
    expect(batch).not.toHaveBeenCalled();
    derivation.resolve(new ArrayBuffer(32));
    digest.resolve(new ArrayBuffer(32));
  });
});
