import { describe, expect, it } from "vitest";
import {
  writeRecoveryTransition,
  type WriteRecovery,
  type WriteRecoveryEvent,
} from "../../apps/web/src/client-write-recovery";
import {
  POSTAL_QUOTE_MAX_ATTEMPTS,
  postalQuoteOutcome,
} from "../../apps/web/src/postal-quote-state";
import {
  offerSecureSourceCopy,
  settleSecureSourceCopy,
} from "../../apps/web/src/secure-source-copy-state";

const follow = (events: WriteRecoveryEvent[]) =>
  events.reduce<WriteRecovery>(writeRecoveryTransition, "ready");

describe("client write recovery authority", () => {
  it("cannot reopen an unknown write through another write or an old completion", () => {
    expect(follow(["write", "uncertain", "write", "written"])).toBe(
      "read_required",
    );
    expect(follow(["write", "uncertain", "reconciled"])).toBe("read_required");
  });

  it("keeps failed status reads closed and requires a fresh successful read", () => {
    const uncertain: WriteRecoveryEvent[] = ["write", "uncertain"];
    expect(follow([...uncertain, "read", "read_failed", "write"])).toBe(
      "read_required",
    );
    expect(
      follow([...uncertain, "read", "read_failed", "read", "reconciled"]),
    ).toBe("ready");
  });

  it("does not borrow a status read to approve an invalid replacement quote", () => {
    expect(
      follow(["write", "invalidate_quote", "read", "reconciled", "write"]),
    ).toBe("quote_invalid");
  });

  it("does not let a concurrent refresh close an in-flight write", () => {
    expect(follow(["write", "write", "read", "reconciled"])).toBe("writing");
    expect(follow(["write", "written"])).toBe("ready");
  });
});

describe("postal quote retry policy", () => {
  it("retries only known analysis delays within the exact bounded budget", () => {
    for (let attempt = 1; attempt < POSTAL_QUOTE_MAX_ATTEMPTS; attempt++)
      expect(postalQuoteOutcome(attempt, "not_ready")).toEqual({
        phase: "pending",
        attempts: attempt,
      });
    expect(postalQuoteOutcome(POSTAL_QUOTE_MAX_ATTEMPTS, "not_ready")).toEqual({
      phase: "paused",
    });
    const network = new Error("Unknown result");
    expect(postalQuoteOutcome(1, network)).toEqual({
      phase: "failed",
      error: network,
    });
  });
});

describe("secure source-copy recovery receipts", () => {
  it("retains the exact key after an uncertain copy and ignores an old receipt", () => {
    const offered = offerSecureSourceCopy(
      { phase: "idle" },
      "original",
      () => "key",
    );
    expect(offerSecureSourceCopy(offered, "original", () => "other")).toBe(
      offered,
    );
    if (offered.phase !== "offered")
      throw new Error("Expected offered recovery");
    const copying = { ...offered, phase: "copying" as const };
    expect(settleSecureSourceCopy(copying, offered)).toEqual(offered);
    const other = offerSecureSourceCopy(
      copying,
      "another-original",
      () => "other",
    );
    expect(settleSecureSourceCopy(other, offered, "stale-copy")).toBe(other);
    expect(settleSecureSourceCopy(copying, offered, "new-copy")).toEqual({
      phase: "copied",
      documentId: "new-copy",
    });
  });
});
