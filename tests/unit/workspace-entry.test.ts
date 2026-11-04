import { describe, expect, it } from "vitest";
import {
  workspaceBridgeRoute,
  workspaceDestination,
  workspaceInvitationPath,
} from "../../apps/web/src/workspace-entry";

const origin = "https://guteneo.com";
const token = Buffer.alloc(32, 0xfb).toString("base64url");

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
    `${origin}/invitation/#token=${"a".repeat(64)}`,
    `${origin}/invitation/#token=${token.slice(1)}`,
    `${origin}/invitation/#token=${token}a`,
    `${origin}/invitation/#token=${token}=`,
    `${origin}/invitation/#token=${"+".repeat(43)}`,
    `${origin}/invitation#token=${token}`,
    `${origin}/share/#token=${token}`,
    `/invitation/#token=${token}`,
    "javascript:alert(1)",
    "",
  ])("rejects foreign or malformed links without navigating: %s", (link) => {
    expect(workspaceInvitationPath(link, origin)).toBeNull();
  });
});

describe("workspace bridge destinations", () => {
  it.each([
    ["/app/prepare", "prepare"],
    ["/app/secure-distributions/new", "share"],
    ["/app/administration", "administration"],
    ["/app/administration/reports", "administration"],
    [
      "/app/administration/reports?from=2026-10-01&to=2026-10-31",
      "administration",
    ],
    ["/app/prepare?document=doc_1", "prepare"],
    ["/app", "workspace"],
    ["/app/studio/templates", "workspace"],
  ])("keeps the known destination %s", (path, kind) => {
    expect(workspaceDestination(path)).toEqual({ path, kind });
  });

  it.each([
    null,
    "",
    "/app/prepare#elsewhere",
    "/app/administration/unknown",
    "/app?next=/app/prepare",
    "/app/my-documents",
    "//evil.example/app",
    "https://evil.example/app/prepare",
    "/app/admin",
  ])("refuses other destinations: %s", (path) => {
    expect(workspaceDestination(path)).toBeNull();
  });

  it("carries an application home to the workspace bridge", () => {
    expect(workspaceBridgeRoute("/app/administration")).toBe(
      "/app/services?next=%2Fapp%2Fadministration",
    );
    expect(workspaceBridgeRoute("/app/my-documents")).toBe("/app/services");
  });
});
