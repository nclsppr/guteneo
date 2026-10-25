import { msg } from "./messages";
import { DistributionRoadmap } from "./email-composer";
import { ArrowRight } from "@phosphor-icons/react";
import { t } from "./locale";
import { workspaceEntryHref } from "./auth-navigation";
import { getCustomerPricing } from "./customer-pricing";
import { AssistantPicker } from "./assistant-guides";
import {
  PdfCheckPublicOffer,
  type PdfCheckPublicAvailability,
} from "./pdf-check-public";
import "./assistant-workspace.css";

export function Installation() {
  return (
    <section
      className="installation-section"
      id="installation"
      tabIndex={-1}
      aria-labelledby="installation-title"
    >
      <div className="installation-heading">
        <h2 id="installation-title">{msg("Choose your starting point")}</h2>
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
        <h2 id="pricing-title">{msg("Email, fax and post")}</h2>
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
