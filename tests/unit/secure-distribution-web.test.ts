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
  it("offers an explicit fresh workshop login after document authentication expires", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorNotice, {
        error: new ApiError(
          "DOCUMENT_AUTHENTICATION_REQUIRED",
          "Session expired",
          403,
        ),
      }),
    );
    expect(html).toContain(
      "/auth/login?fresh=1&amp;returnTo=%2F%23%2Fapp%2Fsecure-distributions",
    );
    expect(html).toContain(msg("Verify my access"));
    expect(html).not.toContain(msg("Stronger sign-in required"));
  });
  for (const locale of ["fr", "en", "de", "lb"] as const) {
    it(`uses the verified-account recovery wording in ${locale} without requiring stronger sign-in`, () => {
      vi.stubGlobal("window", { location: { hash: "#/app/my-documents" } });
      setLocale(locale, false);
      const html = renderToStaticMarkup(
        createElement(PersonalSecurityNotice, { mode: "verified_account" }),
      );
      expect(html).toContain(msg("Verify your sign-in"));
      expect(html).toContain(
        msg("Sign in again to your verified account to access your documents."),
      );
      expect(html).not.toContain(msg("Stronger sign-in required"));
      if (locale !== "en")
        expect(msg("Verify your sign-in")).not.toBe("Verify your sign-in");
    });
  }
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
    expect(html).not.toContain('type="checkbox"');
  });
});
