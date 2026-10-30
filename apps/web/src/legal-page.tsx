import { msg } from "./messages";
import { ArrowUpRight } from "@phosphor-icons/react";
import { PublicFooter, PublicHeader } from "./public-chrome";
import "./legal-page.css";

export function LegalPage() {
  return (
    <div className="legal-page public-site">
      <a className="skip-link" href="#legal-content">
        {msg("Skip to content")}
      </a>
      <PublicHeader />
      <main id="legal-content" className="legal-document" tabIndex={-1}>
        <div className="legal-intro">
          <h1>
            {msg("Legal ")}
            <em>{msg("notice.")}</em>
          </h1>
          <p>
            {msg(
              "Information about Guteneo’s publisher, hosting and use of this website.",
            )}
          </p>
          <p className="legal-date">{msg("Updated on 21 September 2026")}</p>
        </div>
        <div className="legal-layout">
          <nav aria-label={msg("On this page")} className="legal-index">
            <a href="#legal-editor" onClick={(e) => jump(e, "legal-editor")}>
              {msg("Publisher")}
            </a>
            <a href="#legal-host" onClick={(e) => jump(e, "legal-host")}>
              {msg("Hosting")}
            </a>
            <a href="#legal-service" onClick={(e) => jump(e, "legal-service")}>
              {msg("The service")}
            </a>
            <a href="#legal-rights" onClick={(e) => jump(e, "legal-rights")}>
              {msg("Content")}
            </a>
            <a href="#legal-data" onClick={(e) => jump(e, "legal-data")}>
              {msg("Your data")}
            </a>
          </nav>
          <div className="legal-copy">
            <section id="legal-editor" tabIndex={-1}>
              <h2>{msg("Publisher")}</h2>
              <p>
                {msg(
                  "The Guteneo website is published by Nicolas Pieper, who is also responsible for its publication.",
                )}
              </p>
              <p>
                {msg(
                  "Guteneo is currently offered in beta. The business is not yet registered and no sales are open on the website.",
                )}
              </p>
              <address>
                <span>Nicolas Pieper</span>
                <span>59 rue du général de Gaulle</span>
                <span>57330 Hettange-Grande, France</span>
              </address>
              <p>
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>
              </p>
            </section>
            <section id="legal-host" tabIndex={-1}>
              <h2>{msg("Hosting")}</h2>
              <p>{msg("The website is hosted on the Cloudflare platform.")}</p>
              <address>
                <span>Cloudflare, Inc.</span>
                <span>101 Townsend Street</span>
                <span>{msg("San Francisco, CA 94107, United States")}</span>
              </address>
              <p>
                {msg("Telephone: ")}
                <a href="tel:+18889935273">+1 888 993 5273</a>
                <br />
                <a
                  href="https://www.cloudflare.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  cloudflare.com <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </p>
            </section>
            <section id="legal-service" tabIndex={-1}>
              <h2>{msg("The service today")}</h2>
              <p>
                {msg(
                  "Guteneo provides a connected workspace to prepare and track document deliveries. Postal mail is available after an administrator declares the sender; each delivery still requires document verification, a quote, available credit and approval. Other channels depend on their activation in the account.",
                )}
              </p>
              <p>
                {msg(
                  "Public prices are indicative. The document, recipient, applicable price and terms are shown before you approve the delivery. Paid top-ups remain disabled. The demonstration preview is separate: its accounts, documents and results are fictional and it sends nothing.",
                )}
              </p>
            </section>
            <section id="legal-rights" tabIndex={-1}>
              <h2>{msg("Content and trademarks")}</h2>
              <p>
                {msg(
                  "Guteneo’s content and creations are protected under applicable law. Uses permitted by law remain allowed. To request reuse, write to",
                )}{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>.
              </p>
              <p>
                {msg(
                  "ChatGPT and OpenAI, Claude and Anthropic, Grok and xAI, Cursor and the other trademarks mentioned belong to their respective owners. Their presentation identifies the services concerned; it does not imply that their publishers endorse or sponsor Guteneo.",
                )}
              </p>
            </section>
            <section id="legal-data" tabIndex={-1}>
              <h2>{msg("Your data and requests")}</h2>
              <p>
                {msg(
                  "The signed-in account processes the information needed for access, documents and requested deliveries. The public demonstration is separate and uses fictional data. The",
                )}{" "}
                <a href="/privacy/">{msg("privacy policy")}</a>{" "}
                {msg(
                  "explains processing, recipients, retention and your rights. The service rules are set out in the",
                )}{" "}
                <a href="/terms/">{msg("terms of use")}</a>.
              </p>
              <p>
                {msg(
                  "For any questions about the website or your data, contact Nicolas Pieper at",
                )}{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>
                {msg(". You can visit the ")}
                <a href="/support/">{msg("support page")}</a>{" "}
                {msg(" and lodge a complaint with the")}{" "}
                <a
                  href="https://www.cnil.fr/fr/adresser-une-plainte"
                  target="_blank"
                  rel="noreferrer"
                >
                  CNIL
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function jump(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  const section = document.getElementById(id);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({ behavior: "auto", block: "start" });
}
