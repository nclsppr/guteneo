import { Plus } from "@phosphor-icons/react";
import { t } from "./locale";
import { msg } from "./messages";
import { PostalCutoffFaq } from "./postal-cutoff-faq";
import {
  PdfCheckFaq,
  type PdfCheckPublicAvailability,
} from "./pdf-check-public";
import "./public-site-pages.css";

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
        <h2 id="faq-title">{msg("Questions and answers")}</h2>
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

export function PublicSupportFaq() {
  return (
    <div className="public-detail-faq">
      <FrequentlyAsked />
    </div>
  );
}
