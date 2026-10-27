import { describe, expect, it } from "vitest";
import { workspaceInvitationPath } from "../../apps/web/src/workspace-entry";

const origin = "https://guteneo.com";
const token = "a".repeat(64);

describe("workspace invitation entry", () => {
  it("keeps a valid invitation token only in the local fragment", () => {
    expect(
      workspaceInvitationPath(` ${origin}/invitation/#token=${token} `, origin),
    ).toBe(`/invitation/#token=${token}`);
  });

  it.each([
    `https://other.example/invitation/#token=${token}`,
    `https://guteneo.com.evil.example/invitation/#token=${token}`,
    `https://user@guteneo.com/invitation/#token=${token}`,
    `${origin}/invitation/?token=${token}`,
    `${origin}/invitation/?next=https://other.example/#token=${token}`,
    `${origin}/invitation/#token=${token}&token=${token}`,
    `${origin}/invitation/#token=${token}&other=value`,
    `${origin}/invitation/#token=invalid`,
    `${origin}/share/#token=${token}`,
    `/invitation/#token=${token}`,
    "javascript:alert(1)",
    "",
  ])("rejects foreign or malformed links without navigating: %s", (link) => {
    expect(workspaceInvitationPath(link, origin)).toBeNull();
  });
});
