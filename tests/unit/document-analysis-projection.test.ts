import { describe, expect, it } from "vitest";
import {
  projectDocumentAnalysis,
  type DocumentAnalysisRecovery,
} from "../../apps/api/src/document-analysis";

const now = 1_000_000;
const active: DocumentAnalysisRecovery = {
  state: "processing",
  code: "scanner_busy",
  attempts: 1,
  deadline_at: now + 60_000,
  next_attempt_at: now + 30_000,
};

describe("read-only document analysis projection", () => {
  it("keeps waiting work active until its first automatic claim", () => {
    expect(
      projectDocumentAnalysis(
        "quarantined",
        { ...active, attempts: 0, deadline_at: now - 1 },
        now,
      ),
    ).toMatchObject({
      state: "processing",
      nextAction: "wait",
      retryAfterSeconds: 15,
    });
  });

  it.each([
    { ...active, deadline_at: now },
    { ...active, attempts: 5, next_attempt_at: now },
  ])("stops waiting when claimed recovery is exhausted: %j", (row) => {
    const before = { ...row };
    expect(projectDocumentAnalysis("quarantined", row, now)).toMatchObject({
      state: "retryable",
      code: "retry_exhausted",
      nextAction: "rescan",
      retryAfterSeconds: null,
    });
    expect(row).toEqual(before);
  });

  it("does not expire the final attempt before its current lease interval", () => {
    expect(
      projectDocumentAnalysis("quarantined", { ...active, attempts: 5 }, now),
    ).toMatchObject({ state: "processing", nextAction: "wait" });
  });

  it.each([
    ["ready", null, "ready", "verified", "continue"],
    ["quarantined", null, "retryable", "not_started", "rescan"],
    ["purged", active, "blocked", "purged", "replace_document"],
    [
      "quarantined",
      { ...active, state: "blocked", code: "security_rejected" },
      "blocked",
      "security_rejected",
      "replace_document",
    ],
    [
      "quarantined",
      { ...active, state: "retryable", code: "retry_exhausted" },
      "retryable",
      "retry_exhausted",
      "rescan",
    ],
  ] as const)(
    "projects %s with its canonical next action",
    (status, row, state, code, nextAction) => {
      expect(projectDocumentAnalysis(status, row, now)).toMatchObject({
        state,
        code,
        nextAction,
        retryAfterSeconds: null,
      });
    },
  );
});
