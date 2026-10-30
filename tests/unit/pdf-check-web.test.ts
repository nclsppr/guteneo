import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfCheckOffer } from "../../apps/web/src/pdf-check-offer";
import {
  PdfCheckFaq,
  PdfCheckPublicOffer,
  pdfCheckPublicAvailability,
} from "../../apps/web/src/pdf-check-public";
import {
  PDF_VALIDATION_PROFILES,
  PdfReport,
  pdfManualCheckLabel,
  type PdfValidationReport,
} from "../../apps/web/src/pdf-validation";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  type PdfValidationPricing,
} from "../../packages/contracts/src/pdf-validation";
import { setLocale } from "../../apps/web/src/locale";
import { msg, messages } from "../../apps/web/src/messages";
import checkMessages from "../../apps/web/src/locales/messages-pdf-checks.json";
import { createPreviewApi } from "../../apps/web/src/preview";
const pricing: PdfValidationPricing = {
  enabled: true,
  priceMinor: PDF_VALIDATION_PRICE_MINOR,
  currency: "EUR",
  taxBasis: "excluding_tax",
  termsVersion: PDF_VALIDATION_TERMS_VERSION,
  paymentSource: "account_credits",
  purchaseAllowed: true,
  creditAvailableMinor: 5000,
  evidence: "production",
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
describe("PDF checks without a monthly plan", () => {
  it("shows a ten-cent unit price, manual review limits and no recurring purchase controls", () => {
    const html = renderToStaticMarkup(
      createElement(PdfCheckOffer, { pricing, refresh: () => {} }),
    );
    expect(html).toContain("0,10");
    expect(html).toContain("HT, par PDF et par profil");
    expect(html).toContain("Sans abonnement ni renouvellement automatique");
    expect(html).toContain("sans rapport exploitable n’est pas facturé");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Souscrire");
    expect(html).not.toContain("30,00");
  });
  it("keeps a disabled offer informational and simulation visibly separate", () => {
    const html = renderToStaticMarkup(
      createElement(PdfCheckOffer, {
        pricing: { ...pricing, enabled: false, evidence: "simulation" },
        refresh: () => {},
      }),
    );
    expect(html).toContain("actuellement indisponibles");
    expect(html).toContain("montants et les contrôles affichés sont fictifs");
    expect(html).not.toContain('type="checkbox"');
  });
  it("public availability requires an explicit current production signal", () => {
    expect(
      pdfCheckPublicAvailability(
        { mode: "production", pdfValidation: { available: true } },
        false,
      ).state,
    ).toBe("available");
    for (const capabilities of [
      undefined,
      { pdfValidation: { available: true } },
      { mode: "simulation", pdfValidation: { available: true } },
    ])
      expect(pdfCheckPublicAvailability(capabilities, false).state).toBe(
        "unknown",
      );
    expect(
      pdfCheckPublicAvailability(
        { mode: "production", pdfValidation: { available: false } },
        false,
      ).state,
    ).toBe("closed");
    expect(
      pdfCheckPublicAvailability(
        { mode: "production", pdfValidation: { available: true } },
        true,
      ).state,
    ).toBe("unknown");
  });
  it("retains the narrow legal scope and distinguishes automatic checks from certification", () => {
    const html = renderToStaticMarkup(createElement(PdfCheckFaq));
    expect(html).toContain("28 juin 2025");
    expect(html).toContain("microentreprises");
    expect(html).toContain("2016/2102");
    expect(html).toContain("pas une obligation universelle à tous les PDF");
    expect(html).toContain("revue humaine");
    expect(html).toContain("https://docs.verapdf.org/validation/");
  });
});
describe("immutable PDF reports", () => {
  it("rejects reports belonging to another PDF or fingerprint", () => {
    for (const document of [
      { id: "another", sha256: report.sha256 },
      { id: report.documentId, sha256: "b".repeat(64) },
    ]) {
      const html = renderToStaticMarkup(
        createElement(PdfReport, { report, document }),
      );
      expect(html).toContain("ne correspond pas à l’empreinte");
      expect(html).not.toContain("Exporter le rapport");
    }
  });
  it("preserves human review requirements even on passing simulation reports", () => {
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
describe("four complete PDF-check languages and inert preview", () => {
  it("translates every message and preserves interpolation placeholders", () => {
    for (const [source, translations] of Object.entries(checkMessages)) {
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
      ["fr", "Contrôles PDF"],
      ["en", "PDF checks"],
      ["de", "PDF-Prüfungen"],
      ["lb", "PDF-Kontrollen"],
    ] as const) {
      setLocale(locale, false);
      expect(msg("PDF checks")).toBe(name);
      if (locale !== "fr") {
        expect(
          renderToStaticMarkup(createElement(PdfCheckPublicOffer)),
        ).not.toContain("HT, par PDF et par profil");
        expect(pdfManualCheckLabel("reading_order")).not.toContain(
          "Vérifier l’ordre de lecture",
        );
      }
    }
  });
  it("preview has disabled fictional pricing and never calls a business backend", async () => {
    const fetch = vi.fn(() => {
      throw new Error("No backend allowed");
    });
    vi.stubGlobal("fetch", fetch);
    const preview = createPreviewApi();
    expect(await preview.request("/pdf-validation/pricing")).toMatchObject({
      enabled: false,
      purchaseAllowed: false,
      evidence: "simulation",
      creditAvailableMinor: expect.any(Number),
      priceMinor: 10,
    });
    await expect(
      preview.request("/documents/doc/validation", {
        method: "POST",
        body: {
          profile: "ua1",
          purchase: {
            confirmed: true,
            documentSha256: report.sha256,
            priceMinor: 10,
            currency: "EUR",
            termsVersion: PDF_VALIDATION_TERMS_VERSION,
          },
        },
      }),
    ).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
