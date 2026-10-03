import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HorizonOffer,
  horizonBillingAllowed,
  type HorizonPlan,
} from "../../apps/web/src/horizon-plan";
import {
  HorizonFaq,
  HorizonPublicOffer,
} from "../../apps/web/src/horizon-public";
import {
  PDF_VALIDATION_PROFILES,
  PdfReport,
  pdfManualCheckLabel,
  type PdfValidationReport,
} from "../../apps/web/src/pdf-validation";
import { setLocale } from "../../apps/web/src/locale";
import { msg, messages } from "../../apps/web/src/messages";
import horizonMessages from "../../apps/web/src/locales/messages-horizon.json";
import { createPreviewApi } from "../../apps/web/src/preview";
import type { Session } from "../../apps/web/src/api";

const session: Session = {
  organization: { id: "org", name: "Atelier" },
  user: { id: "admin", name: "Admin", role: "admin" },
  csrfToken: "fixture",
  simulation: false,
};
const plan: HorizonPlan = {
  plan: {
    id: "horizon",
    name: "guteneo Horizon",
    priceMinor: 3000,
    currency: "EUR",
    interval: "month",
  },
  termsVersion: "horizon-2026-10-02-v1",
  enabled: true,
  status: "active",
  entitled: true,
  currentPeriodStart: "2026-10-02T10:00:00Z",
  currentPeriodEnd: "2026-11-02T10:00:00Z",
  cancelAtPeriodEnd: false,
  billingManagementAllowed: true,
  paymentSource: "account_credits",
  evidence: "production",
  creditAvailableMinor: 5000,
};
const report: PdfValidationReport = {
  id: "report",
  documentId: "doc",
  sha256: "a".repeat(64),
  profile: "ua1",
  createdAt: "2026-10-02T10:00:00Z",
  evidence: "production",
  engine: { name: "veraPDF", version: "1.30.2" },
  compliant: true,
  passedRules: 106,
  failedRules: 0,
  failedChecks: 0,
  truncated: false,
  findings: [],
  manualReviewRequired: true,
  manualChecks: [{ id: "reading_order", title: "Ordre de lecture" }],
  status: "passed",
  certification: false,
};
afterEach(() => {
  setLocale("fr", false);
  vi.unstubAllGlobals();
});

describe("Horizon browser authority and honest product copy", () => {
  it("opens billing only for an admin with enabled monthly entitlement and explicit server permission", () => {
    expect(horizonBillingAllowed(session, plan)).toBe(true);
    for (const candidate of [
      undefined,
      { ...plan, enabled: false },
      { ...plan, entitled: false },
      { ...plan, billingManagementAllowed: false },
    ])
      expect(horizonBillingAllowed(session, candidate)).toBe(false);
    for (const role of ["observer", "operator", "supervisor", "member"])
      expect(
        horizonBillingAllowed({ user: { ...session.user, role } }, plan),
      ).toBe(false);
  });
  it("keeps a disabled offer visible with no subscription or cancellation control", () => {
    const html = renderToStaticMarkup(
      createElement(HorizonOffer, {
        session,
        plan: { ...plan, enabled: false, entitled: false, status: "inactive" },
        refresh: () => {},
      }),
    );
    expect(html).toContain("Bientôt disponible");
    expect(html).toContain("100 tentatives de contrôle par mois civil");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Souscrire Horizon");
    expect(html).not.toContain("Gérer la facturation");
  });
  it("lets an admin stop active or past-due renewal while the service is unavailable", () => {
    for (const status of ["active", "past_due"] as const) {
      const unavailable = { ...plan, status, enabled: false, entitled: false };
      const html = renderToStaticMarkup(
        createElement(HorizonOffer, {
          session,
          plan: unavailable,
          refresh: () => {},
        }),
      );
      expect(html).toContain("Résilier le forfait");
      expect(html).toContain("Je confirme l’arrêt du renouvellement mensuel.");
      expect(html).toContain("Le service Horizon est indisponible");
      expect(html).not.toContain("Souscrire Horizon");
      expect(html).not.toContain("Gérer la facturation");
      for (const candidate of [
        { session, plan: { ...unavailable, cancelAtPeriodEnd: true } },
        {
          session: { ...session, user: { ...session.user, role: "observer" } },
          plan: unavailable,
        },
      ])
        expect(
          renderToStaticMarkup(
            createElement(HorizonOffer, { ...candidate, refresh: () => {} }),
          ),
        ).not.toContain("Confirmer la résiliation");
    }
  });
  it("offers explicit renewal restoration during an enabled paid period without requiring another debit", () => {
    const restoring = {
      ...plan,
      status: "cancelled" as const,
      cancelAtPeriodEnd: true,
      creditAvailableMinor: 0,
    };
    const html = renderToStaticMarkup(
      createElement(HorizonOffer, {
        session,
        plan: restoring,
        refresh: () => {},
      }),
    );
    expect(html).toContain("Rétablir le renouvellement");
    expect(html).toContain("sans nouveau débit");
    expect(html).not.toContain("Il faut au moins 30 €");
    expect(
      renderToStaticMarkup(
        createElement(HorizonOffer, {
          session,
          plan: { ...restoring, enabled: false, entitled: false },
          refresh: () => {},
        }),
      ),
    ).not.toContain("Rétablir le renouvellement");
  });
  it("discloses credit funding and suspended renewal without suggesting an unavailable top-up", () => {
    const html = renderToStaticMarkup(
      createElement(HorizonOffer, {
        session,
        plan: {
          ...plan,
          status: "inactive",
          entitled: false,
          billingManagementAllowed: false,
          creditAvailableMinor: 2000,
        },
        refresh: () => {},
      }),
    );
    expect(html).toContain("crédits promotionnels");
    expect(html).toContain("Ce montant est déduit de votre solde");
    expect(html).toContain("sans dette ni solde négatif");
    expect(html).toContain(
      "La recharge de crédits n’est pas encore disponible",
    );
    expect(html).not.toContain("Demandez une recharge");
    expect(html).toContain('class="button primary" disabled=""');
    expect(html).toContain("J’accepte le forfait Horizon");
  });
  it("shows members the offer without billing actions or private credit", () => {
    const html = renderToStaticMarkup(
      createElement(HorizonOffer, {
        session: { ...session, user: { ...session.user, role: "observer" } },
        plan: {
          ...plan,
          creditAvailableMinor: null,
          billingManagementAllowed: false,
        },
        refresh: () => {},
      }),
    );
    expect(html).toContain("Forfait actif");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Crédit disponible");
    expect(html).not.toContain("Gérer la facturation");
  });
  it("explains the narrow European legal scope and separates archival, automatic checks and certification", () => {
    const html = renderToStaticMarkup(createElement(HorizonFaq));
    expect(html).toContain("28 juin 2025");
    expect(html).toContain("microentreprises");
    expect(html).toContain("2016/2102");
    expect(html).toContain(
      "Il n’impose pas une obligation universelle à tous les PDF",
    );
    expect(html).toContain("revue humaine");
    expect(html).toContain("https://docs.verapdf.org/validation/");
  });
});

describe("immutable PDF validation reports", () => {
  it("rejects a report belonging to different bytes or a different document", () => {
    for (const document of [
      { id: "another", sha256: report.sha256 },
      { id: report.documentId, sha256: "b".repeat(64) },
    ]) {
      const html = renderToStaticMarkup(
        createElement(PdfReport, { report, document }),
      );
      expect(html).toContain("ne correspond pas à l’empreinte");
      expect(html).not.toContain("Contrôles automatiques réussis");
      expect(html).not.toContain("Exporter le rapport");
    }
  });
  it("never presents a technical pass as certification or a completed human review", () => {
    const html = renderToStaticMarkup(
      createElement(PdfReport, {
        report: { ...report, evidence: "simulation" },
        document: { id: report.documentId, sha256: report.sha256 },
      }),
    );
    expect(html).toContain("Rapport de simulation");
    expect(html).toContain("Revue humaine à compléter");
    expect(html).toContain("ni une certification d’accessibilité");
    expect(html).not.toContain('type="checkbox"');
  });
  it("offers the six supported profiles without suggesting PDF/A implies accessibility", () => {
    expect(PDF_VALIDATION_PROFILES).toEqual([
      "ua1",
      "ua2",
      "1b",
      "2b",
      "3b",
      "4",
    ]);
  });
});

describe("four complete Horizon languages and inert preview", () => {
  it("translates every message and preserves interpolation placeholders", () => {
    for (const [source, translations] of Object.entries(horizonMessages)) {
      expect(messages[source]).toEqual(translations);
      expect(translations).toHaveLength(3);
      for (const translated of translations) {
        expect(translated.trim()).not.toBe("");
        expect((translated.match(/\{\d+\}/g) ?? []).sort()).toEqual(
          (source.match(/\{\d+\}/g) ?? []).sort(),
        );
      }
    }
    for (const [locale, name] of [
      ["fr", "Forfait Horizon"],
      ["en", "Horizon plan"],
      ["de", "Horizon-Tarif"],
      ["lb", "Horizon-Abonnement"],
    ] as const) {
      setLocale(locale, false);
      expect(msg("Forfait Horizon")).toBe(name);
      if (locale !== "fr") {
        expect(
          renderToStaticMarkup(createElement(HorizonPublicOffer)),
        ).not.toContain("Un forfait mensuel pour contrôler");
        expect(pdfManualCheckLabel("reading_order")).not.toContain(
          "Vérifier l’ordre de lecture",
        );
      }
    }
  });
  it("has a disabled fictional plan and cannot subscribe or call a business backend", async () => {
    const fetch = vi.fn(() => {
      throw new Error("No backend allowed");
    });
    vi.stubGlobal("fetch", fetch);
    const preview = createPreviewApi();
    expect(await preview.request("/plan")).toMatchObject({
      enabled: false,
      entitled: false,
      billingManagementAllowed: false,
      evidence: "simulation",
      creditAvailableMinor: null,
    });
    await expect(
      preview.request("/plan/subscribe", {
        method: "POST",
        body: { consent: true, termsVersion: plan.termsVersion },
      }),
    ).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
