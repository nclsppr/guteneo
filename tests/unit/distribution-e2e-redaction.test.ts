import { describe, expect, it } from "vitest";
import { redactInvitationNavigation } from "../../scripts/distribution-e2e-engine";

describe("invitation privacy at the framework event boundary", () => {
  it.each(["?invitation=", "&invitation=", "%3Finvitation%3D", "%26invitation%3d"])(
    "preserves the navigation with its %s secret masked before reporting", (prefix) => {
      const token = "a1".repeat(32);
      const line = `navigated to http://localhost:8787/#/app/my-documents${prefix}${token}&kind=shared`;
      expect(redactInvitationNavigation(line)).toBe(`navigated to http://localhost:8787/#/app/my-documents${prefix}[REDACTED_INVITATION]&kind=shared`);
    },
  );
  it("keeps unrelated SHA-256 provenance intact", () => {
    const line = `verified sha256=${"b2".repeat(32)}`;
    expect(redactInvitationNavigation(line)).toBe(line);
  });
});
