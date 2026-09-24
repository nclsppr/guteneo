import { DistributionRoadmap } from "./email-composer";
import { useId, type MouseEvent } from "react";
import { ArrowRight, ArrowUpRight, Plus } from "@phosphor-icons/react";
import { fr as t } from "./i18n";
import { customerPricing } from "./customer-pricing";
import { AssistantPicker } from "./assistant-guides";
import { PostalCutoffFaq } from "./postal-cutoff-faq";
import "./assistant-workspace.css";

const copy = t.homepage;
export function scrollToSection(
  event: MouseEvent<HTMLAnchorElement>,
  id: string,
) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

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
          Votre premier envoi.
          <br />
          <em>À votre façon.</em>
        </h2>
        <p>
          Depuis une conversation ou directement avec votre document, vous
          gardez la main sur chaque envoi.
        </p>
      </div>
      <div className="start-choice">
        <div>
          <h3>Depuis votre assistant</h3>
          <p>
            Ajoutez Guteneo à votre outil habituel. Un guide vous accompagne de
            la configuration au premier échange.
          </p>
          <a className="button primary" href="/assistants/">
            Utiliser mon assistant <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div>
          <h3>Directement dans Guteneo</h3>
          <p>
            Ajoutez votre document, choisissez le destinataire et vérifiez le
            prix avant de confirmer.
          </p>
          <a className="button" href="/#/app/prepare?entry=direct">
            Envoyer depuis Guteneo <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="start-assistant-guides">
        <p>Vous connaissez déjà votre assistant ? Ouvrez son guide.</p>
        <AssistantPicker />
      </div>
    </section>
  );
}

export function WelcomePricing() {
  return (
    <section
      className="pricing-section"
      id="tarifs"
      tabIndex={-1}
      aria-labelledby="pricing-title"
    >
      <div className="pricing-heading">
        <h2 id="pricing-title">
          {copy.pricing.title}
          <br />
          <em>{copy.pricing.italic}</em>
        </h2>
        <p>{copy.pricing.intro}</p>
      </div>
      <div className="pricing-content">
        <div className="welcome-credit">
          <p className="welcome-amount">
            50<span>€</span>
          </p>
          <div className="welcome-copy">
            <h3>{copy.pricing.welcomeTitle}</h3>
            <p>{copy.pricing.welcomeBody}</p>
            <p className="welcome-terms">{copy.pricing.welcomeTerms}</p>
          </div>
        </div>
        <div
          className="pricing-table"
          role="region"
          aria-label={copy.pricing.rateLabel}
        >
          <table>
            <thead>
              <tr>
                <th>{copy.pricing.channel}</th>
                <th>{copy.pricing.price}</th>
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
      </div>
    </section>
  );
}

export function FrequentlyAsked() {
  return (
    <section
      className="faq-section"
      id="faq"
      tabIndex={-1}
      aria-labelledby="faq-title"
    >
      <div className="faq-heading">
        <h2 id="faq-title">
          {copy.faq.title}
          <br />
          <em>{copy.faq.italic}</em>
        </h2>
        <p>{copy.faq.intro}</p>
      </div>
      <div className="faq-questions">
        {copy.faq.items.map((item) => (
          <details key={item.question}>
            <summary>
              {item.question}
              <Plus size={19} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
        <PostalCutoffFaq />
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
        {copy.footer.stampDescription}{" "}
        <time dateTime="2026-09-16">{copy.footer.foundingDate}</time>.
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
            {copy.footer.title}
            <br />
            <em>{copy.footer.italic}</em>
          </p>
          <a
            className="button primary"
            href="/#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {copy.footer.cta}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <FoundingPostage />
      </div>
      <div className="luxembourg-art">
        <img
          className="luxembourg-panorama"
          src="/luxembourg-blue-panorama.webp"
          alt={copy.footer.imageAlt}
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
          {copy.footer.made}
          <span aria-hidden="true"> — </span>
          <span>
            {copy.footer.created}{" "}
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
        <nav aria-label={copy.footer.nav}>
          <a
            href="/#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {copy.footer.installation}
          </a>
          <a href="/#faq" onClick={(event) => scrollToSection(event, "faq")}>
            FAQ
          </a>
          <a href="/#/app">
            {copy.footer.atelier}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href="/journal/">Le journal</a>
          <a href="/developpeurs/">Développeurs</a>
          <a href="/mentions-legales/">{copy.footer.legal}</a>
          <a href="/confidentialite/">Confidentialité</a>
          <a href="/conditions/">Conditions</a>
          <a href="/support/">Assistance</a>
        </nav>
      </div>
    </footer>
  );
}
