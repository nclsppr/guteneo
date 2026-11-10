import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSessionAuthorityKey,
  setSession,
  type Session,
} from "../../apps/web/src/api";
import {
  clearActionOutcomes,
  getActionOutcomes,
  recordActionOutcome,
  subscribeActionOutcomes,
} from "../../apps/web/src/action-outcomes";

const session = (id: string): Session => ({
  organization: { id, name: "Synthetic workspace" },
  user: { id: "synthetic-user", name: "Synthetic", role: "admin" },
  csrfToken: "synthetic-only",
  simulation: true,
});
afterEach(() => {
  clearActionOutcomes();
  setSession(null, false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded workspace outcome receipts", () => {
  it("clears on authority change and rejects a late receipt after A to B to A", () => {
    setSession(session("a"), false);
    const original = getSessionAuthorityKey();
    recordActionOutcome(
      { kind: "saved", resourceId: "synthetic", route: "/app/documents" },
      original,
    );
    expect(getActionOutcomes()).toHaveLength(1);
    setSession(session("b"), false);
    expect(getActionOutcomes()).toHaveLength(0);
    setSession(session("a"), false);
    recordActionOutcome(
      { kind: "saved", resourceId: "synthetic", route: "/app/documents" },
      original,
    );
    expect(getActionOutcomes()).toHaveLength(0);
  });
  it("keeps only safe receipt fields and rejects remote, signed, traversal and malformed references", () => {
    setSession(session("a"), false);
    const key = getSessionAuthorityKey();
    recordActionOutcome(
      {
        kind: "saved",
        resourceId: "synthetic",
        route: "/app/documents",
        recipient: "never-store@example.invalid",
        signingSecret: "synthetic-secret",
      } as Parameters<typeof recordActionOutcome>[0],
      key,
    );
    expect(Object.keys(getActionOutcomes()[0]).sort()).toEqual([
      "id",
      "kind",
      "observedAt",
      "resourceId",
      "route",
    ]);
    expect(Object.isFrozen(getActionOutcomes()[0])).toBe(true);
    for (const route of [
      "https://example.invalid",
      "/app/document?token=synthetic",
      "/app/../personal",
      "/app/%2fsecret",
    ])
      recordActionOutcome(
        { kind: "updated", resourceId: "unsafe", route },
        key,
      );
    recordActionOutcome(
      { kind: "updated", resourceId: "content with spaces", route: "/app" },
      key,
    );
    expect(getActionOutcomes()).toHaveLength(1);
    expect(JSON.stringify(getActionOutcomes())).not.toContain(
      "synthetic-secret",
    );
    recordActionOutcome(
      {
        kind: "saved",
        resourceId: "synthetic",
        route: "/app/studio/template/synthetic",
      },
      key,
    );
    expect(getActionOutcomes()).toHaveLength(2);
  });
  it("deduplicates, caps at twenty and expires without persisting or polling", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    setSession(session("a"), false);
    const key = getSessionAuthorityKey(),
      notify = vi.fn(),
      unsubscribe = subscribeActionOutcomes(notify);
    for (let index = 0; index < 25; index++)
      recordActionOutcome(
        {
          kind: "saved",
          resourceId: `synthetic_${index}`,
          route: "/app/documents",
        },
        key,
      );
    expect(getActionOutcomes()).toHaveLength(20);
    recordActionOutcome(
      { kind: "saved", resourceId: "synthetic_24", route: "/app/documents" },
      key,
    );
    expect(getActionOutcomes()).toHaveLength(20);
    vi.advanceTimersByTime(15 * 60_000 + 1);
    expect(getActionOutcomes()).toHaveLength(0);
    expect(notify).toHaveBeenCalled();
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
});
