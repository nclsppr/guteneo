import { useEffect } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FilePdf,
  EnvelopeSimple,
  Printer,
  Mailbox,
} from "@phosphor-icons/react";
import { canonicalPublicFragment } from "../../../packages/contracts/src/public-routes";
import { workspaceEntryHref } from "./auth-navigation";
import { isPublicPreview } from "./api";
import { PublicFooter, PublicHeader, PublicHomeClosing } from "./public-chrome";
import { msg } from "./messages";
import { t } from "./locale";
import { getArticles, articlePath } from "./editorial/articles";
import { ArticlePicture } from "./editorial/article-picture";
import "./public-homepage.css";
import { isPublicNavigationManaged } from "./public-navigation";

function usePublicFragment() {
  useEffect(() => {
    if (isPublicNavigationManaged()) return;
    const fragment = canonicalPublicFragment(window.location.hash);
    if (fragment !== window.location.hash)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + fragment,
      );
    if (!fragment || fragment.startsWith("#/")) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(fragment.slice(1));
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}

export function PublicHomepage() {
  usePublicFragment();
  return (
    <div className="landing public-site public-home">
      <a className="skip-link" href="#landing-main">
        {t.skip}
      </a>
      <PublicHeader home />
      <main id="landing-main" tabIndex={-1}>
        <section className="public-home-hero" aria-labelledby="home-title">
          <h1 id="home-title">
            {msg("Prepare your documents.")}
            <br />
            <em>{msg("Choose how they travel.")}</em>
          </h1>
          <p>
            {msg(
              "Email, fax and post. Prepare in Guteneo or with your assistant, review the details, then approve your dispatch.",
            )}
          </p>
          <div className="public-home-actions">
            <a className="button primary" href="/getting-started/">
              {msg("Get started")}
              <ArrowRight size={19} aria-hidden="true" />
            </a>
            <a className="text-link" href="/how-it-works/">
              {msg("See how it works")}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          className="public-home-route"
          aria-label={msg("Document dispatch workflow")}
        >
          <div className="public-home-document">
            <FilePdf size={38} weight="light" aria-hidden="true" />
            <strong>{msg("Correspondence.pdf")}</strong>
            <span>{msg("Your original PDF, unchanged")}</span>
          </div>
          <ArrowRight
            className="public-home-route-arrow"
            size={26}
            aria-hidden="true"
          />
          <div className="public-home-review">
            <span className="public-home-review-check">
              <Check size={24} aria-hidden="true" />
            </span>
            <strong>{msg("Review before sending")}</strong>
            <span>{msg("Document, recipient, options and price")}</span>
          </div>
          <ArrowRight
            className="public-home-route-arrow"
            size={26}
            aria-hidden="true"
          />
          <ul className="public-home-channels">
            <li>
              <EnvelopeSimple size={23} aria-hidden="true" />
              {msg("Email")}
            </li>
            <li>
              <Printer size={23} aria-hidden="true" />
              {msg("Fax")}
            </li>
            <li>
              <Mailbox size={23} aria-hidden="true" />
              {t.channels.postal}
            </li>
          </ul>
        </section>

        <section
          className="public-home-workflow public-home-section"
          id="how"
          tabIndex={-1}
          aria-labelledby="home-workflow-title"
        >
          <div className="public-home-section-heading">
            <h2 id="home-workflow-title">
              {msg("From your document to its destination.")}
            </h2>
            <a className="text-link" href="/how-it-works/">
              {msg("Follow an example")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <ol>
            <li>
              <h3>{msg("Prepare")}</h3>
              <p>
                {msg(
                  "Import a PDF, create a document or ask your connected assistant to prepare your dispatch.",
                )}
              </p>
            </li>
            <li>
              <h3>{msg("Review")}</h3>
              <p>
                {msg(
                  "Check the exact document, recipient, channel and cost. By default, you approve in Guteneo.",
                )}
              </p>
            </li>
            <li>
              <h3>{msg("Track")}</h3>
              <p>
                {msg(
                  "Follow the events returned for your dispatch. Technical delivery does not prove that a document was read.",
                )}
              </p>
            </li>
          </ol>
        </section>

        <section
          className="public-home-start public-home-section"
          id="installation"
          tabIndex={-1}
          aria-labelledby="home-start-title"
        >
          <div>
            <h2 id="home-start-title">
              {msg("Start with your document. Or your assistant.")}
            </h2>
            <p>
              {msg(
                "Use the same preparation, review and tracking workflow whichever way you start.",
              )}
            </p>
            <a className="text-link" href="/getting-started/">
              {msg("Getting started")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="public-home-entry-links">
            <a href={workspaceEntryHref("/app/prepare?entry=direct")}>
              <span>{msg("Send from Guteneo")}</span>
              <ArrowUpRight size={22} aria-hidden="true" />
            </a>
            <a href="/assistants/">
              <span>{msg("Use my assistant")}</span>
              <ArrowRight size={22} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          className="public-home-pricing public-home-section"
          id="pricing"
          tabIndex={-1}
          aria-labelledby="home-pricing-title"
        >
          <div>
            <h2 id="home-pricing-title">
              {msg("A price before you approve.")}
            </h2>
            <p>{t.homepage.pricing.intro}</p>
            <a className="text-link" href="/pricing/">
              {msg("View prices and terms")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="public-home-price-links">
            <a href="/pricing/">
              <strong>{msg("Email, fax and post")}</strong>
              <span>{msg("Rates, examples and welcome credit")}</span>
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
            <a href="/pdf-checks/" id="pdf-checks">
              <strong>{msg("PDF accessibility checks")}</strong>
              <span>{msg("PDF/UA and PDF/A, per document and profile")}</span>
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          className="public-home-control public-home-section"
          id="faq"
          tabIndex={-1}
          aria-labelledby="home-control-title"
        >
          <div>
            <h2 id="home-control-title">{msg("Your approval stays yours.")}</h2>
            <p>
              {msg(
                "An agreement in a conversation does not replace approval in Guteneo. Optional expert delegation is off by default; only a browser administrator can grant a limited, revocable mandate with an expiry date.",
              )}
            </p>
            <div className="public-home-control-links">
              <a className="text-link" href="/roles/">
                {msg("Roles and permissions")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="text-link" href="/support/#faq">
                {msg("Questions and answers")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="public-home-beta">
            <h3>{msg("The service and its beta")}</h3>
            <p>
              {msg(
                "Guteneo is currently offered in beta. The business is not yet registered and no sales are open on the website.",
              )}
            </p>
            <a className="text-link" href="/about/">
              {msg("About Guteneo")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a id="postal-cutoff-faq" href="/support/#postal-cutoff-faq">
              {msg("Postal processing times")}
            </a>
          </div>
        </section>

        <section
          className="public-home-journal public-home-section"
          aria-labelledby="home-journal-title"
        >
          <div className="public-home-section-heading">
            <h2 id="home-journal-title">{msg("The journal")}</h2>
            <a className="text-link" href="/journal/">
              {msg("Read the journal")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="public-home-stories">
            {getArticles()
              .slice(0, 2)
              .map((article) => (
                <article key={article.slug}>
                  <a
                    href={articlePath(article.slug)}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <ArticlePicture
                      article={article}
                      decorative
                      sizes="150px"
                    />
                  </a>
                  <h3>
                    <a href={articlePath(article.slug)}>
                      {article.title}
                      <ArrowUpRight size={20} aria-hidden="true" />
                    </a>
                  </h3>
                </article>
              ))}
          </div>
        </section>
        {isPublicPreview && (
          <p className="public-home-preview">
            {msg("Interactive preview · No sign-up · No real sends")}
          </p>
        )}
        <PublicHomeClosing />
      </main>
      <PublicFooter />
    </div>
  );
}
