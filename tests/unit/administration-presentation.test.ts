import { afterEach, describe, expect, it } from "vitest";
import { auditActionLabel } from "../../apps/web/src/administration-presentation";
import { belvedereCount } from "../../apps/web/src/belvedere-presentation";
import { setLocale } from "../../apps/web/src/locale";
import { msg } from "../../apps/web/src/messages";
import { bmsg } from "../../apps/web/src/belvedere-i18n";

afterEach(() => setLocale("fr", false));

describe("report presentation boundaries", () => {
  it.each(["fr", "en", "de", "lb"] as const)(
    "keeps delegated and human review distinct without translating unknown audit data in %s",
    (locale) => {
      setLocale(locale, false);
      expect(auditActionLabel("dispatch.approved")).toBe(
        msg("Dispatch approved"),
      );
      expect(auditActionLabel("dispatch.expert_approved")).toBe(
        msg("Dispatch approved by delegation"),
      );
      expect(auditActionLabel("dispatch.expert_approved")).not.toBe(
        auditActionLabel("dispatch.approved"),
      );
      const unrecognized = "customer.payload@example.invalid";
      expect(auditActionLabel(unrecognized)).toBe(msg("Recorded action"));
      expect(auditActionLabel(unrecognized)).not.toContain(unrecognized);
    },
  );
  it.each(["fr", "en", "de", "lb"] as const)(
    "uses whole singular and plural messages for platform counts in %s",
    (locale) => {
      setLocale(locale, false);
      expect(belvedereCount("members", 1)).toBe(bmsg("1 member"));
      expect(belvedereCount("members", 0)).toBe(bmsg("{0} members", 0));
      expect(belvedereCount("members", 2)).toBe(bmsg("{0} members", 2));
      expect(belvedereCount("deliveries", 1)).toBe(bmsg("1 dispatch"));
      expect(belvedereCount("authorizations", 1)).toBe(
        bmsg("1 session or authorization"),
      );
      expect(belvedereCount("authorizations", 2)).toBe(
        bmsg("{0} sessions and authorizations", 2),
      );
    },
  );
});
