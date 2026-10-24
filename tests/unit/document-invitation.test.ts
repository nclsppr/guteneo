import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as invitation from "../../apps/web/src/document-invitation";

const token = "a".repeat(64); // Fixed, fictional invitation material only.
let values: Map<string, string>;
let location: { hash: string; pathname: string; search: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));
  values = new Map();
  location = { hash: "#/app/my-documents", pathname: "/", search: "" };
  vi.stubGlobal("window", {
    location,
    history: {
      state: null,
      replaceState: vi.fn((_state: unknown, _unused: string, href: string) => {
        const next = new URL(href, "https://guteneo.invalid");
        location.hash = next.hash;
        location.search = next.search;
      }),
    },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  });
});
afterEach(() => {
  invitation.clearPendingDocumentInvitation();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("document invitation authentication handoff", () => {
  it("scrubs the fragment before login and excludes private parameters from returnTo", () => {
    location.hash = `#/app/my-documents?invitation=${token}&q=Confidential.pdf&kind=personal`;
    expect(invitation.captureDocumentInvitation()).toEqual({
      storageBlocked: false,
    });
    expect(location.hash).not.toContain(token);
    expect(location.hash).not.toContain("invitation=");
    expect(invitation.personalAuthenticationReturnTo()).toBe(
      "/#/app/my-documents?kind=personal",
    );
    expect(invitation.pendingDocumentInvitation()).toBe(token);
  });

  it("retains the handoff through a fresh page module in the same tab", async () => {
    location.hash = `#/app/my-documents?invitation=${token}`;
    invitation.captureDocumentInvitation();
    vi.resetModules();
    const callbackPage = await import("../../apps/web/src/document-invitation");
    expect(callbackPage.pendingDocumentInvitation()).toBe(token);
    callbackPage.clearPendingDocumentInvitation();
    expect(values.size).toBe(0);
  });

  it("expires the tab handoff within ten minutes", () => {
    location.hash = `#/app/my-documents?invitation=${token}`;
    invitation.captureDocumentInvitation();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(invitation.pendingDocumentInvitation()).toBeNull();
    expect(values.size).toBe(0);
  });

  it("does not reuse an earlier invitation after receiving a malformed link", () => {
    location.hash = `#/app/my-documents?invitation=${token}`;
    invitation.captureDocumentInvitation();
    location.hash = "#/app/my-documents?invitation=invalid";
    invitation.captureDocumentInvitation();
    expect(location.hash).toBe("#/app/my-documents");
    expect(invitation.pendingDocumentInvitation()).toBeNull();
  });

  it("keeps only a volatile handoff when storage is blocked and always strips the login URL", () => {
    window.sessionStorage.setItem = () => {
      throw new Error("Storage blocked");
    };
    location.hash = `#/app/my-documents?invitation=${token}`;
    expect(invitation.captureDocumentInvitation()).toEqual({
      storageBlocked: true,
    });
    expect(invitation.personalAuthenticationReturnTo()).toBe(
      "/#/app/my-documents",
    );
    expect(invitation.pendingDocumentInvitation()).toBe(token);
    invitation.clearPendingDocumentInvitation();
    expect(invitation.pendingDocumentInvitation()).toBeNull();
  });

  it("defensively strips an uncaptured invitation and rejects arbitrary return paths", () => {
    expect(
      invitation.personalAuthenticationReturnTo(
        `#/app/my-documents?invitation=${token}&next=https://example.invalid`,
      ),
    ).toBe("/#/app/my-documents");
    expect(
      invitation.personalAuthenticationReturnTo("#https://example.invalid/"),
    ).toBe("/#/app/my-documents");
  });
});
