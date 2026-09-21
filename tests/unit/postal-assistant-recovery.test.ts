import { describe, expect, it } from "vitest";
import {
  assistantRecovery,
  assistantRecoverySchema,
} from "../../packages/contracts/src/assistant-recovery";

describe("postal conversation recovery", () => {
  it.each([
    "POSTAL_SENDER_ADMIN_REQUIRED",
    "POSTAL_SENDER_EXISTS",
    "POSTAL_SETUP_REVIEW_REQUIRED",
    "POSTAL_SETUP_UNAVAILABLE",
    "POSTAL_PROFILE_UNQUALIFIED",
    "SENDER_NOT_CONFIGURED",
    "FORBIDDEN",
    "INTERNAL_ERROR",
  ])(
    "keeps %s on sender setup without browser configuration or dispatch creation",
    (code) => {
      const recovery = assistantRecoverySchema.parse(
        assistantRecovery(code, "postal_setup"),
      );
      expect(recovery).toMatchObject({
        action: "check_postal_setup",
        tool: "get_postal_setup",
        retry: "read_only",
      });
      expect(recovery.message).toContain("conversation");
      expect(recovery.message).toContain("suspension");
      expect(recovery.message).not.toMatch(/ouvrir|navigateur|dispatch/);
    },
  );

  it.each([
    "POSTAL_PREFLIGHT_EXPIRED",
    "POSTAL_PREFLIGHT_VERSION_CHANGED",
    "POSTAL_PREFLIGHT_STALE",
    "POSTAL_PROFILE_CHANGED",
    "POSTAL_PREFLIGHT_REQUIRED",
    "POSTAL_PREPARED_DRAFT_REQUIRED",
    "LIVE_QUOTE_INVALID",
    "INTERNAL_ERROR",
  ])("never retries a transfer after %s", (code) => {
    const recovery = assistantRecoverySchema.parse(
      assistantRecovery(code, "postal_preflight"),
    );
    expect(recovery).toMatchObject({
      action: "check_postal_preflight",
      tool: "get_postal_preflight",
      retry: "never_resend",
    });
    expect(recovery.message).toContain("unknown");
    expect(recovery.message).not.toContain("prepare_fax");
  });

  it("keeps Pingen analysis on the same draft and quote key", () => {
    const recovery = assistantRecovery("POSTAL_DRAFT_NOT_READY");
    expect(recovery).toMatchObject({
      tool: "get_postal_preflight",
      retry: "read_only",
    });
    expect(recovery.message).toContain("clé de devis");
    expect(recovery.message).toContain("Ne retransférez pas");
    expect(recovery.message).not.toContain("get_dispatch_status");
  });

  it.each(["DOCUMENT_NOT_READY", "VERIFIED_SCAN_REQUIRED"])(
    "keeps %s on the original scan, without new import",
    (code) => {
      expect(assistantRecovery(code, "postal_preflight")).toMatchObject({
        tool: "get_document",
        retry: "read_only",
      });
    },
  );

  it.each(["postal_setup", "postal_preflight"] as const)(
    "preserves authentication, expert and integrity refusal before %s fallback",
    (context) => {
      expect(assistantRecovery("TOKEN_EXPIRED", context)).toMatchObject({
        action: "reconnect",
        tool: null,
      });
      expect(
        assistantRecovery("EXPERT_OPT_IN_REQUIRED", context),
      ).toMatchObject({
        tool: "get_expert_status",
      });
      expect(
        assistantRecovery("DOCUMENT_INTEGRITY_MISMATCH", context),
      ).toMatchObject({ action: "contact_support", tool: null });
    },
  );

  it("does not reroute an unrelated channel's sender refusal or fax renewal", () => {
    expect(assistantRecovery("SENDER_NOT_CONFIGURED").tool).toBe(
      "get_dispatch_status",
    );
    expect(assistantRecovery("LIVE_QUOTE_INVALID").message).toContain(
      "prepare_fax",
    );
    expect(assistantRecovery("POSTAL_PREFLIGHT_NOT_FOUND").tool).toBeNull();
  });
});
