import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecureDistributionPage } from "../../apps/web/src/secure-distribution-pages";
import {
  secureDistributionCatalog,
  secureDistributionQuote,
  type SecureDistributionView,
} from "../../packages/contracts/src/secure-distribution";
import {
  ApiError,
  type DocumentRecord,
  type Session,
} from "../../apps/web/src/api";
import { ErrorNotice } from "../../apps/web/src/components";
import { setLocale, t } from "../../apps/web/src/locale";
import { msg } from "../../apps/web/src/messages";
import { PersonalSecurityNotice } from "../../apps/web/src/personal-space";
import { SecureAuditHistory } from "../../apps/web/src/secure-audit-history";

const resources = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../apps/web/src/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../apps/web/src/components")>();
  return {
    ...actual,
    useResource: (path: string) => ({
      data: resources.get(path),
      loading: false,
      error: undefined,
      refresh: vi.fn(),
      setData: vi.fn(),
    }),
  };
});
const session: Session = {
  organization: { id: "org_fixture", name: "Fictional workspace" },
  user: { id: "user_fixture", name: "Fictional account", role: "admin" },
  csrfToken: "synthetic-only",
  simulation: true,
};
const document: DocumentRecord = {
  id: "doc_fixture",
  name: "Document.pdf",
  sha256: "a".repeat(64),
  size: 1000,
  pages: 2,
  status: "ready",
  source: "upload",
  created_at: "2026-10-24T12:00:00.000Z",
};
function publication(allowVaultDeposit = true): SecureDistributionView {
  const policy = {
    retentionDays: 30 as const,
    allowOriginalDownload: false,
    allowVaultDeposit,
    personalRetentionDays: 365 as const,
  };
  return {
    id: "sd_fixture",
    dispatchId: "dispatch_fixture",
    status: "active",
    title: document.name,
    source: {
      id: document.id,
      name: document.name,
      pages: 2,
      sha256: document.sha256,
    },
    recipient: { address: "recipient@example.invalid" },
    invitation: { subject: "Fictional document", message: "Fictional message" },
    policy,
    quote: secureDistributionQuote(policy, 1),
    expiresAt: "2026-11-24T12:00:00.000Z",
    approvalUrl: null,
    recipientUserId: null,
    recipientBinding: "pending",
    approved: true,
    approval: null,
    pendingClaim: null,
    audit: [],
  };
}
const explanation =
  "The personal copy can be exported, even when downloading the original PDF is disabled.";
function render(route: string, actor = session) {
  return renderToStaticMarkup(
    createElement(SecureDistributionPage, { route, session: actor }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  resources.clear();
  setLocale("fr", false);
});

describe("secure distribution browser choices", () => {
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`labels quote recovery and its audit event in ${locale} without technical codes`, () => {
      setLocale(locale, false);
      const event = {
        id: "event_fixture",
        type: "quote_renewal_started",
        createdAt: "2026-10-27T12:00:00.000Z",
        provenance: "browser" as const,
      };
      const html = renderToStaticMarkup(
        createElement(SecureAuditHistory, {
          events: [event],
          getOlder: async () => ({ items: [], nextCursor: null }),
        }),
      );
      expect(html).toContain(msg("Quote refresh requested"));
      expect(html).not.toContain(event.type);
      if (locale !== "en")
        expect(msg("Quote refresh requested")).not.toBe(
          "Quote refresh requested",
        );
      for (const [code, copy] of [
        [
          "QUOTE_STILL_VALID",
          "This quote is still valid. Review the document and price before approving.",
        ],
        [
          "SECURE_QUOTE_RENEWAL_UNSAFE",
          "This share has changed or submission has started. Refresh its status before continuing.",
        ],
      ]) {
        const notice = renderToStaticMarkup(
          createElement(ErrorNotice, {
            error: new ApiError(code, "Technical response", 409),
          }),
        );
        expect(notice).toContain(msg(copy));
        expect(notice).not.toContain(code);
        expect(notice).not.toContain("Technical response");
        if (locale !== "en") expect(msg(copy)).not.toBe(copy);
      }
    });
  }

  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`returns to the exact share through ordinary document authentication in ${locale}`, () => {
      setLocale(locale, false);
      vi.stubGlobal("window", {
        dispatchEvent: vi.fn(),
        location: {
          hash: "#/app/secure-distribution/sd_fixture?view=approval&invitation=private-invitation#private-fragment",
          hostname: "localhost",
        },
      });
      const html = renderToStaticMarkup(
        createElement(ErrorNotice, {
          error: new ApiError(
            "DOCUMENT_AUTHENTICATION_REQUIRED",
            "Session expired",
            403,
          ),
        }),
      );
      const href = html.match(/href="([^"]+)"/u)![1].replaceAll("&amp;", "&");
      const destination = new URL(href, "https://guteneo.example.test");
      expect(destination.pathname).toBe("/auth/login");
      expect(destination.searchParams.get("locale")).toBe(locale);
      expect(destination.searchParams.get("returnTo")).toBe(
        "/#/app/secure-distribution/sd_fixture",
      );
      expect([...destination.searchParams.keys()]).toEqual([
        "locale",
        "returnTo",
      ]);
      expect(href).not.toMatch(/private|approval|fresh/u);
      expect(html).toContain(t.sessionExpired.action);
      expect(html).toContain(msg("Verify your sign-in"));
      expect(html).not.toContain("DOCUMENT_AUTHENTICATION_REQUIRED");
      expect(html).not.toContain(msg("Stronger sign-in required"));
    });
  }
  for (const code of [
    "STRONG_AUTHENTICATION_REQUIRED",
    "STRONG_BROWSER_APPROVAL_REQUIRED",
    "FRESH_AUTHENTICATION_REQUIRED",
    "AUTHENTICATION_FRESHNESS_REQUIRED",
  ]) {
    for (const locale of ["fr", "en", "de", "lb"] as const) {
      it(`provides localized ${code} recovery in ${locale} without exposing technical details`, () => {
        setLocale(locale, false);
        vi.stubGlobal("window", {
          dispatchEvent: vi.fn(),
          location: { hash: "#/app/secure-distribution/sd_fixture" },
        });
        const html = renderToStaticMarkup(
          createElement(ErrorNotice, {
            error: new ApiError(code, "Technical provider response", 403),
          }),
        );
        const copy =
          code === "STRONG_AUTHENTICATION_REQUIRED"
            ? "Sign in again using the required security method to access your documents."
            : "Sign in again to verify your access. You will return to this page.";
        expect(html).toContain(msg(copy));
        expect(html).toContain(t.sessionExpired.action);
        expect(html).toContain(`locale=${locale}`);
        expect(html).toContain("fresh=1");
        expect(html).not.toContain(code);
        expect(html).not.toContain("Technical provider response");
        if (locale !== "en") expect(msg(copy)).not.toBe(copy);
      });
    }
  }
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`uses the verified-account recovery wording in ${locale} without requiring stronger sign-in`, () => {
      const invitation = "a".repeat(64);
      vi.stubGlobal("window", {
        dispatchEvent: vi.fn(),
        location: {
          hash: `#/app/my-documents?kind=personal&invitation=${invitation}&q=private-fixture-search`,
        },
      });
      setLocale(locale, false);
      const html = renderToStaticMarkup(
        createElement(PersonalSecurityNotice, { mode: "verified_account" }),
      );
      expect(html).toContain(msg("Verify your sign-in"));
      expect(html).toContain(
        msg("Sign in again to your verified account to access your documents."),
      );
      expect(html).not.toContain(msg("Stronger sign-in required"));
      const href = html.match(/href="([^"]+)"/u)![1].replaceAll("&amp;", "&");
      const destination = new URL(href, "https://guteneo.example.test");
      expect(destination.pathname).toBe("/auth/login");
      expect(destination.searchParams.get("context")).toBe("personal");
      expect(destination.searchParams.get("locale")).toBe(locale);
      expect(destination.searchParams.get("returnTo")).toBe(
        "/#/app/my-documents?kind=personal",
      );
      expect(destination.searchParams.has("fresh")).toBe(false);
      expect(href).not.toContain(invitation);
      expect(href).not.toContain("private-fixture-search");
      if (locale !== "en")
        expect(msg("Verify your sign-in")).not.toBe("Verify your sign-in");
    });
  }
  it.each(["strong", undefined, "unknown"])(
    "retains fresh authentication for personal recovery with mode=%s",
    (mode) => {
      vi.stubGlobal("window", { location: { hash: "#/app/my-documents" } });
      const html = renderToStaticMarkup(
        createElement(PersonalSecurityNotice, { mode: mode as never }),
      );
      const href = html.match(/href="([^"]+)"/u)![1].replaceAll("&amp;", "&");
      const destination = new URL(href, "https://guteneo.example.test");
      expect(destination.pathname).toBe("/auth/login");
      expect(destination.searchParams.get("context")).toBe("personal");
      expect(destination.searchParams.get("fresh")).toBe("1");
      expect(html).toContain(msg("Stronger sign-in required"));
    },
  );
  it("offers explicit pagination when the first document page has no verified PDF", () => {
    resources.set("/secure-distributions/catalog", secureDistributionCatalog());
    resources.set("/documents", {
      items: [{ ...document, status: "quarantined" }],
      nextCursor: "next_fixture",
    });
    const html = render("/app/secure-distributions/new");
    expect(html).toContain('class="button subtle small pagination"');
    expect(html).toContain(t.dispatch.loadMore);
    expect(html).not.toContain('<option value="doc_fixture">');
  });
  it("adds a verified PDF fetched on another page without dropping the catalog price", () => {
    resources.set("/secure-distributions/catalog", secureDistributionCatalog());
    resources.set("/documents", {
      items: [
        { ...document, id: "unverified", status: "quarantined" },
        document,
      ],
      nextCursor: null,
    });
    const html = render("/app/secure-distributions/new");
    expect(html).toContain('<option value="doc_fixture">Document.pdf</option>');
    expect(html).not.toContain('<option value="unverified">');
    expect(html).not.toContain('class="button subtle small pagination"');
    expect(html).toContain("0,99");
  });
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it.each([false, true])(
      `uses one priced send control in ${locale} with approved=%s`,
      (approved) => {
        setLocale(locale, false);
        const view = {
          ...publication(),
          status: "prepared" as const,
          approved,
        };
        resources.set(`/secure-distributions/${view.id}`, view);
        const html = render(`/app/secure-distribution/${view.id}`, {
          ...session,
          simulation: false,
        });
        expect(html).toContain(msg("Send for"));
        expect(html).toContain(msg(" excl. tax"));
        expect(html).toContain(msg("Shared document preview"));
        expect(html).not.toContain(msg("Approve this share"));
        expect(html).not.toContain(msg("Confirm activation"));
        expect(html).not.toContain(
          msg(
            "Review the PDF, recipient, permissions and price. Approval and activation are separate steps.",
          ),
        );
        expect((html.match(/type="checkbox"/g) ?? []).length).toBe(
          approved ? 0 : 2,
        );
        if (locale !== "en") expect(msg("Send for")).not.toBe("Send for");
      },
    );
    it(`explains in ${locale} that a personal copy is exportable despite the original download restriction`, () => {
      setLocale(locale, false);
      const view = publication();
      resources.set(`/secure-distributions/${view.id}`, view);
      const html = render(`/app/secure-distribution/${view.id}`);
      expect(html).toContain(msg(explanation));
      expect(html).toContain(msg("Download disabled"));
      expect(html).toContain(msg("{0} days", view.policy.retentionDays));
      if (locale !== "en") expect(msg(explanation)).not.toBe(explanation);
    });
  }
  it("does not promise an exportable personal copy when the workshop disallows it", () => {
    const view = publication(false);
    resources.set(`/secure-distributions/${view.id}`, view);
    expect(render(`/app/secure-distribution/${view.id}`)).not.toContain(
      msg(explanation),
    );
  });
  it("keeps approval and activation controls unavailable to an observer", () => {
    const view = { ...publication(), status: "prepared", approved: false };
    resources.set(`/secure-distributions/${view.id}`, view);
    const html = render(`/app/secure-distribution/${view.id}`, {
      ...session,
      user: { ...session.user, role: "observer" },
    });
    expect(html).not.toContain(msg("Approve this share"));
    expect(html).not.toContain(msg("Confirm activation"));
    expect(html).not.toContain(msg("Simulate sending for"));
    expect(html).not.toContain('type="checkbox"');
  });
});
