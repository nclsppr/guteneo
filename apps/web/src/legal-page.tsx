import { ArrowLeft, ArrowUpRight } from "@phosphor-icons/react";
import { Brand } from "./brand";
import "./legal-page.css";

export function LegalPage() {
  return (
    <div className="legal-page">
      <a className="skip-link" href="#legal-content">
        Aller au contenu
      </a>
      <header className="site-header">
        <Brand />
        <a className="legal-back" href="/">
          <ArrowLeft size={18} /> Retour à l’accueil
        </a>
      </header>
      <main id="legal-content" className="legal-document" tabIndex={-1}>
        <div className="legal-intro">
          <h1>
            Mentions <em>légales.</em>
          </h1>
          <p>
            Les informations sur l’éditeur de Guteneo, son hébergement et
            l’utilisation de ce site.
          </p>
          <p className="legal-date">Mise à jour le 20 septembre 2026</p>
        </div>
        <div className="legal-layout">
          <nav aria-label="Sur cette page" className="legal-index">
            <a href="#legal-editor" onClick={(e) => jump(e, "legal-editor")}>
              L’éditeur
            </a>
            <a href="#legal-host" onClick={(e) => jump(e, "legal-host")}>
              L’hébergement
            </a>
            <a href="#legal-service" onClick={(e) => jump(e, "legal-service")}>
              Le service
            </a>
            <a href="#legal-rights" onClick={(e) => jump(e, "legal-rights")}>
              Les contenus
            </a>
            <a href="#legal-data" onClick={(e) => jump(e, "legal-data")}>
              Vos données
            </a>
          </nav>
          <div className="legal-copy">
            <section id="legal-editor" tabIndex={-1}>
              <h2>L’éditeur</h2>
              <p>
                Le site Guteneo est édité par Nicolas Pieper, également
                responsable de la publication.
              </p>
              <p>
                Guteneo est actuellement un projet en préparation. L’activité
                n’est pas encore immatriculée et aucune vente n’est ouverte sur
                le site.
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
              <h2>L’hébergement</h2>
              <p>Le site est hébergé sur la plateforme Cloudflare.</p>
              <address>
                <span>Cloudflare, Inc.</span>
                <span>101 Townsend Street</span>
                <span>San Francisco, CA 94107, États-Unis</span>
              </address>
              <p>
                Téléphone : <a href="tel:+18889935273">+1 888 993 5273</a>
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
              <h2>Le service aujourd’hui</h2>
              <p>
                Guteneo propose un atelier connecté pour préparer et suivre des
                envois de documents. Le courrier postal est accessible après la
                déclaration de l’expéditeur par un administrateur ; chaque envoi
                reste soumis à la vérification du document, au devis, au crédit
                disponible et à son approbation. Les autres canaux dépendent de
                leur activation dans le compte.
              </p>
              <p>
                Les tarifs publics sont indicatifs. Le document, le
                destinataire, le prix applicable et les conditions sont
                présentés avant la validation de l’envoi. Le rechargement payant
                reste désactivé. L’aperçu de démonstration est distinct : ses
                comptes, documents et résultats sont fictifs et il ne réalise
                aucun envoi.
              </p>
            </section>
            <section id="legal-rights" tabIndex={-1}>
              <h2>Les contenus et les marques</h2>
              <p>
                Les contenus et créations de Guteneo sont protégés dans les
                conditions prévues par les textes applicables. Les usages
                autorisés par la loi restent permis. Pour une demande de
                réutilisation, écrivez à{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>.
              </p>
              <p>
                ChatGPT et OpenAI, Claude et Anthropic, Grok et xAI, Cursor
                ainsi que les autres marques citées appartiennent à leurs
                titulaires respectifs. Leur présentation identifie les services
                concernés ; elle ne signifie pas que leurs éditeurs approuvent
                ou parrainent Guteneo.
              </p>
            </section>
            <section id="legal-data" tabIndex={-1}>
              <h2>Vos données et vos demandes</h2>
              <p>
                Les interactions avec la démonstration restent dans la mémoire
                de votre onglet et sont réinitialisées au rechargement. Les
                connexions au site passent par Cloudflare, qui traite les
                données techniques nécessaires à l’acheminement et à la sécurité
                des requêtes. L’application n’intègre pas de traceur
                publicitaire.
              </p>
              <p>
                Pour toute question relative au site ou à vos données, contactez
                Nicolas Pieper à{" "}
                <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>. Vous
                pouvez également consulter la{" "}
                <a
                  href="https://www.cloudflare.com/privacypolicy/"
                  target="_blank"
                  rel="noreferrer"
                >
                  politique de confidentialité de Cloudflare
                </a>{" "}
                et exercer un recours auprès de la{" "}
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
        <a href="mailto:guteneo@pieper.fr">Une question ? Écrivez-nous.</a>
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
