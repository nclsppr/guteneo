import { useEffect } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { isPublicPreview } from "./api";
import { useResource } from "./components";
import { PublicHeader, PublicFooter } from "./public-chrome";
import { GuidedExample } from "./landing-example";
import { HomepageFilm } from "./homepage-film";
import { Installation, WelcomePricing } from "./landing-sections";
import {
  PdfCheckFaq,
  PdfCheckPublicOffer,
  pdfCheckPublicAvailability,
  type PublicCapabilities,
} from "./pdf-check-public";
import { msg } from "./messages";
import { t } from "./locale";
import "./public-site-pages.css";

import {
  getPublicSitePageMetadata,
  type PublicSitePath,
} from "./public-site-metadata";
export {
  isPublicSitePage,
  getPublicSitePageMetadata,
} from "./public-site-metadata";

export { PublicSupportFaq } from "./public-support-faq";

export function PublicSitePage({ path }: { path: PublicSitePath }) {
  const metadata = getPublicSitePageMetadata(path)!;
  const capabilities = useResource<PublicCapabilities>(
    isPublicPreview || !["/pricing/", "/pdf-checks/"].includes(path)
      ? null
      : "/capabilities",
  );
  const availability = pdfCheckPublicAvailability(
    capabilities.error ? undefined : capabilities.data,
    capabilities.loading,
  );
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || id.startsWith("/")) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return (
    <div
      className={`landing public-site public-detail public-detail-${path.split("/")[1]}`}
    >
      <a className="skip-link" href="#public-detail-main">
        {t.skip}
      </a>
      <PublicHeader
        activePage={
          path.slice(1, -1) as
            "pricing" | "how-it-works" | "getting-started" | "pdf-checks"
        }
      />
      <main id="public-detail-main" tabIndex={-1}>
        <header className="public-detail-heading">
          <h1>{metadata.label}</h1>
        </header>
        {path === "/pricing/" && <WelcomePricing pdfChecks={availability} />}
        {path === "/getting-started/" && <Installation />}
        {path === "/how-it-works/" && (
          <>
            <GuidedExample />
            <HomepageFilm />
          </>
        )}
        {path === "/pdf-checks/" && (
          <>
            <PdfCheckPublicOffer availability={availability} />
            <section
              className="public-detail-pdf-faq"
              aria-labelledby="pdf-questions"
            >
              <h2 id="pdf-questions">{msg("Understanding the report")}</h2>
              <PdfCheckFaq availability={availability} />
            </section>
          </>
        )}
        <div className="public-detail-next">
          <a
            className="text-link"
            href={
              path === "/getting-started/" ? "/support/" : "/getting-started/"
            }
          >
            {path === "/getting-started/" ? msg("Support") : msg("Get started")}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
