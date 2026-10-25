import { msg } from "./messages";
import { DistributionRoadmap } from "./email-composer";
import { useId } from "react";
import { LegalLinks } from "./legal-links";
import { scrollToPublicSection } from "./public-chrome";
import { ArrowRight, ArrowUpRight, Plus } from "@phosphor-icons/react";
import { t } from "./locale";
import { workspaceEntryHref } from "./auth-navigation";
import { getCustomerPricing } from "./customer-pricing";
import { AssistantPicker } from "./assistant-guides";
import { PostalCutoffFaq } from "./postal-cutoff-faq";
import {
  PdfCheckFaq,
  PdfCheckPublicOffer,
  type PdfCheckPublicAvailability,
} from "./pdf-check-public";
import "./assistant-workspace.css";

export const scrollToSection = scrollToPublicSection;

export function Installation() {
  return (
    <section
      className="installation-section"
      id="installation"
      tabIndex={-1}
      aria-labelledby="installation-title"
    >
      <div className="installation-heading">
        <h2 id="installation-title">
          {msg("Your first delivery.")}
          <br /> <em>{msg("Your way.")}</em>
        </h2>
        <p>
          {msg(
            "Prepare your first dispatch from a conversation or directly with your document. In both cases, check the details before confirming.",
          )}
        </p>
      </div>
      <div className="start-choice">
        <div>
          <h3>{msg("From your assistant")}</h3>
          <p>
            {msg(
              "Add Guteneo to your usual tool. A guide takes you from setup to your first conversation.",
            )}
          </p>
          <a className="button primary" href="/assistants/">
            {msg("Use my assistant ")}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div>
          <h3>{msg("Directly in Guteneo")}</h3>
          <p>
            {msg(
              "Add your document, choose the recipient and check the price before confirming.",
            )}
          </p>
          <a
            className="button"
            href={workspaceEntryHref("/app/prepare?entry=direct")}
          >
            {msg("Send from Guteneo ")}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="start-assistant-guides">
        <p>{msg("Already know your assistant? Open its guide.")}</p>
        <AssistantPicker />
      </div>
    </section>
  );
}

export function WelcomePricing({
  pdfChecks,
}: {
  pdfChecks?: PdfCheckPublicAvailability;
}) {
  const customerPricing = getCustomerPricing();
  return (
    <section
      className="pricing-section"
      id="pricing"
      tabIndex={-1}
      aria-labelledby="pricing-title"
    >
      <div className="pricing-heading">
        <h2 id="pricing-title">
          {t.homepage.pricing.title}
          <br /> <em>{t.homepage.pricing.italic}</em>
        </h2>
        <p>{t.homepage.pricing.intro}</p>
      </div>
      <div className="pricing-content">
        <div className="welcome-credit">
          <p className="welcome-amount">
            50<span>€</span>
          </p>
          <div className="welcome-copy">
            <h3>{t.homepage.pricing.welcomeTitle}</h3>
            <p>{t.homepage.pricing.welcomeBody}</p>
            <p className="welcome-terms">{t.homepage.pricing.welcomeTerms}</p>
          </div>
        </div>
        <div
          className="pricing-table"
          role="region"
          aria-label={t.homepage.pricing.rateLabel}
        >
          <table>
            <thead>
              <tr>
                <th>{t.homepage.pricing.channel}</th>
                <th>{t.homepage.pricing.price}</th>
              </tr>
            </thead>
            <tbody>
              {customerPricing.rates.map((rate) => (
                <tr key={rate.id}>
                  <th scope="row">
                    {rate.channel}
                    <span>{rate.scope}</span>
                  </th>
                  <td>
                    {rate.prices.map((price) => (
                      <p className="customer-price" key={price.unit}>
                        <strong>{price.amount}</strong>
                        <span>{price.unit}</span>
                      </p>
                    ))}
                    <p className="customer-supplement">{rate.supplement}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="price-qualification">{customerPricing.note}</p>
        <DistributionRoadmap />
        <PdfCheckPublicOffer availability={pdfChecks} />
      </div>
    </section>
  );
}

export function FrequentlyAsked({
  pdfChecks,
}: {
  pdfChecks?: PdfCheckPublicAvailability;
}) {
  return (
    <section
      className="faq-section"
      id="faq"
      tabIndex={-1}
      aria-labelledby="faq-title"
    >
      <div className="faq-heading">
        <h2 id="faq-title">
          {t.homepage.faq.title}
          <br /> <em>{t.homepage.faq.italic}</em>
        </h2>
        <p>{t.homepage.faq.intro}</p>
      </div>
      <div className="faq-questions">
        {t.homepage.faq.items.map((item) => (
          <details key={item.question}>
            <summary>
              <h3>{item.question}</h3>
              <Plus size={19} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
        <PostalCutoffFaq />
        <PdfCheckFaq availability={pdfChecks} />
      </div>
    </section>
  );
}

function FoundingPostage() {
  const id = useId();
  return (
    <figure className="footer-postage">
      <img
        className="founding-stamp"
        src="/brand/gutenberg-guteneo-stamp.webp"
        alt=""
        width="640"
        height="640"
        loading="lazy"
        decoding="async"
      />
      <svg
        className="founding-postmark"
        viewBox="0 0 300 230"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <path id={`${id}-top`} d="M 25,139 A 62,62 0 0 1 149,139" />
          <path id={`${id}-bottom`} d="M 21,137 A 66,66 0 0 0 153,137" />
          <pattern
            id={`${id}-grain`}
            width="9"
            height="11"
            patternUnits="userSpaceOnUse"
          >
            <rect width="9" height="11" fill="white" />
            <circle cx="2" cy="3" r="0.65" fill="black" />
            <path d="M6 8h1.2v0.7H6z" fill="black" />
          </pattern>
          <mask id={`${id}-ink`}>
            <rect width="300" height="230" fill={`url(#${id}-grain)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-ink)`}>
          <g fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="87" cy="137" r="73" />
            <circle cx="87" cy="137" r="69" strokeWidth="0.7" />
            <circle cx="87" cy="137" r="49" strokeWidth="1" />
            <path d="M159 107c20-14 37 14 57 0s37 14 67 0M161 122c20-14 37 14 57 0s37 14 67 0M161 152c20-14 37 14 57 0s37 14 67 0M159 167c20-14 37 14 57 0s37 14 67 0" />
          </g>
          <text className="postmark-place">
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
              LUXEMBOURG
            </textPath>
          </text>
          <text className="postmark-edition">
            <textPath
              href={`#${id}-bottom`}
              startOffset="50%"
              textAnchor="middle"
            >
              PREMIER JOUR
            </textPath>
          </text>
          <text className="postmark-post" x="87" y="116" textAnchor="middle">
            POSTES
          </text>
          <text className="postmark-date" x="87" y="140" textAnchor="middle">
            16.09.2026
          </text>
          <text
            className="postmark-signature"
            x="87"
            y="160"
            textAnchor="middle"
          >
            guteneo
          </text>
        </g>
      </svg>
      <figcaption className="sr-only">
        {t.homepage.footer.stampDescription}{" "}
        <time dateTime="2026-09-16">{t.homepage.footer.foundingDate}</time>.
      </figcaption>
    </figure>
  );
}

export function LuxembourgFooter() {
  return (
    <footer className="luxembourg-footer">
      <div className="footer-invitation">
        <div className="footer-invitation-copy">
          <p>
            {t.homepage.footer.title}
            <br />
            <em>{t.homepage.footer.italic}</em>
          </p>
          <a
            className="button primary"
            href="/#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {t.homepage.footer.cta}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <FoundingPostage />
      </div>
      <div className="luxembourg-art">
        <img
          className="luxembourg-panorama"
          src="/luxembourg-blue-panorama.webp"
          alt={t.homepage.footer.imageAlt}
          width="2172"
          height="724"
          loading="lazy"
          decoding="async"
        />
        <div className="luxembourg-birds" aria-hidden="true">
          <span className="footer-bird bird-one">
            <span className="swallow-wingbeat" />
          </span>
          <span className="footer-bird bird-two">
            <span className="swallow-wingbeat" />
          </span>
          <span className="footer-bird bird-three">
            <span className="swallow-wingbeat" />
          </span>
        </div>
      </div>
      <div className="footer-colophon">
        <p>
          {t.homepage.footer.made}
          <span aria-hidden="true"> — </span>
          <span>
            {t.homepage.footer.created}{" "}
            <a
              href="https://nicolaspieper.com"
              target="_blank"
              rel="noreferrer"
            >
              Nicolas Pieper
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </span>
        </p>
        <div className="footer-navigation">
          <nav aria-label={t.homepage.footer.nav}>
            <a
              href="/#installation"
              onClick={(event) => scrollToSection(event, "installation")}
            >
              {t.homepage.footer.installation}
            </a>
            <a href="/#faq" onClick={(event) => scrollToSection(event, "faq")}>
              FAQ
            </a>
            <a href={workspaceEntryHref()}>
              {t.homepage.footer.atelier}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a href="/about/">{msg("About Guteneo")}</a>
            <a href="/journal/">{msg("The journal")}</a>
            <a href="/developers/">{msg("Developers")}</a>
          </nav>
          <LegalLinks />
          <a className="footer-contact" href="mailto:guteneo@pieper.fr">
            guteneo@pieper.fr
          </a>
        </div>
      </div>
    </footer>
  );
}
