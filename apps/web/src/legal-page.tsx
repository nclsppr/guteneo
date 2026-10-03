import { msg } from "./messages";
import { LanguageMenu } from "./language-select";
import { ArrowLeft, ArrowUpRight } from "@phosphor-icons/react";
import { Brand } from "./brand";
import { LegalLinks } from "./legal-links";
import "./legal-page.css";

export function LegalPage() {
  return (
    <div className="legal-page">
      <a className="skip-link" href="#legal-content">
        {msg("Aller au contenu")}
      </a>
      <header className="site-header">
        <Brand />
        <LanguageMenu />
        <a className="legal-back" href="/">
          <ArrowLeft size={18} aria-hidden="true" />{" "}
          {msg(" Retour à l’accueil")}
        </a>
      </header>
      <main id="legal-content" className="legal-document" tabIndex={-1}>
        <div className="legal-intro">
          <h1>
            {msg("Mentions ")}
            <em>{msg("légales.")}</em>
          </h1>
          <p>
            {msg(
              "Les informations sur l’éditeur de Guteneo, son hébergement et l’utilisation de ce site.",
            )}
          </p>
          <p className="legal-date">
            {msg("Mise à jour le 21 septembre 2026")}
          </p>
        </div>
        <div className="legal-layout">
          <nav aria-label={msg("Sur cette page")} className="legal-index">
            <a href="#legal-editor" onClick={(e) => jump(e, "legal-editor")}>
              {msg("L’éditeur")}
            </a>
            <a href="#legal-host" onClick={(e) => jump(e, "legal-host")}>
              {msg("L’hébergement")}
            </a>
            <a href="#legal-service" onClick={(e) => jump(e, "legal-service")}>
              {msg("Le service")}
            </a>
            <a href="#legal-rights" onClick={(e) => jump(e, "legal-rights")}>
              {msg("Les contenus")}
            </a>
            <a href="#legal-data" onClick={(e) => jump(e, "legal-data")}>
              {msg("Vos données")}
            </a>
          </nav>
          <div className="legal-copy">
            <section id="legal-editor" tabIndex={-1}>
              <h2>{msg("L’éditeur")}</h2>
              <p>
                {msg(
                  "Le site Guteneo est édité par Nicolas Pieper, également responsable de la publication.",
                )}
              </p>
              <p>
                {msg(
                  "Guteneo est actuellement proposé en bêta. L’activité n’est pas encore immatriculée et aucune vente n’est ouverte sur le site.",
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
              <h2>{msg("L’hébergement")}</h2>
              <p>{msg("Le site est hébergé sur la plateforme Cloudflare.")}</p>
              <address>
                <span>Cloudflare, Inc.</span>
                <span>101 Townsend Street</span>
                <span>{msg("San Francisco, CA 94107, États-Unis")}</span>
              </address>
              <p>
                {msg("Téléphone : ")}
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
              <h2>{msg("Le service aujourd’hui")}</h2>
              <p>
                {msg(
                  "Guteneo propose un atelier connecté pour préparer et suivre des envois de documents. Le courrier postal est accessible après la déclaration de l’expéditeur par un administrateur ; chaque envoi reste soumis à la vérification du document, au devis, au crédit disponible et à son approbation. Les autres canaux dépendent de leur activation dans le compte.",
                )}
              </p>
              <p>
                {msg(
                  "Les tarifs publics sont indicatifs. Le document, le destinataire, le prix applicable et les conditions sont présentés avant la validation de l’envoi. Le rechargement payant reste désactivé. L’aperçu de démonstration est distinct : ses comptes, documents et résultats sont fictifs et il ne réalise aucun envoi.",
                )}
              </p>
            </section>
            <section id="legal-rights" tabIndex={-1}>
              <h2>{msg("Les contenus et les marques")}</h2>
              <p>
                {msg(
                  "Les contenus et créations de Guteneo sont protégés dans les conditions prévues par les textes applicables. Les usages autorisés par la loi restent permis. Pour une demande de réutilisation, écrivez à",
                )}{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>.
              </p>
              <p>
                {msg(
                  "ChatGPT et OpenAI, Claude et Anthropic, Grok et xAI, Cursor ainsi que les autres marques citées appartiennent à leurs titulaires respectifs. Leur présentation identifie les services concernés ; elle ne signifie pas que leurs éditeurs approuvent ou parrainent Guteneo.",
                )}
              </p>
            </section>
            <section id="legal-data" tabIndex={-1}>
              <h2>{msg("Vos données et vos demandes")}</h2>
              <p>
                {msg(
                  "Le compte connecté traite les informations nécessaires aux accès, aux documents et aux envois demandés. La démonstration publique est distincte et utilise des données fictives. La",
                )}{" "}
                <a href="/confidentialite/">
                  {msg("politique de confidentialité")}
                </a>{" "}
                {msg(
                  "détaille les traitements, les destinataires, la conservation et vos droits. Les règles du service sont présentées dans les",
                )}{" "}
                <a href="/conditions/">{msg("conditions d’utilisation")}</a>.
              </p>
              <p>
                {msg(
                  "Pour toute question relative au site ou à vos données, contactez Nicolas Pieper à",
                )}{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>
                {msg(". Vous pouvez consulter la page ")}
                <a href="/support/">{msg("assistance")}</a>{" "}
                {msg(" et exercer un recours auprès de la")}{" "}
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
      <footer className="legal-colophon">
        <Brand variant="simple" compact />
        <LegalLinks />
      </footer>
    </div>
  );
}

function jump(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  const section = document.getElementById(id);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({ behavior: "auto", block: "start" });
}
