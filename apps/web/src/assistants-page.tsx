import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { Brand } from "./brand";
import { AssistantGuide, AssistantPicker } from "./assistant-guides";
import { getAssistant } from "./assistant-catalog";
import { LuxembourgFooter } from "./landing-sections";
import "./assistant-workspace.css";

export function AssistantsPage({ assistantId }: { assistantId?: string }) {
  const assistant = getAssistant(assistantId);
  return (
    <div className="landing assistants-public">
      <a className="skip-link" href="#assistants-main">
        Aller au contenu
      </a>
      <header className="site-header assistants-header">
        <Brand />
        <nav aria-label="Navigation principale">
          <a
            href="/assistants/"
            aria-current={!assistantId ? "page" : undefined}
          >
            Assistants
          </a>
          <a href="/#tarifs">Tarifs</a>
          <a className="button small" href="/#/app">
            Mon espace <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="assistants-main" tabIndex={-1}>
        {assistant ? (
          <>
            <a className="back-link" href="/assistants/">
              <ArrowLeft size={18} aria-hidden="true" />
              Tous les assistants
            </a>
            <AssistantGuide assistantId={assistant.id} />
          </>
        ) : assistantId ? (
          <section className="assistants-intro">
            <h1>Ce guide n’existe pas.</h1>
            <p>
              Retrouvez les instructions pour votre assistant dans le catalogue.
            </p>
            <a className="button primary" href="/assistants/">
              Choisir mon assistant <ArrowRight size={18} aria-hidden="true" />
            </a>
          </section>
        ) : (
          <>
            <section className="assistants-intro">
              <h1>
                Votre assistant.
                <br />
                <em>Votre correspondance.</em>
              </h1>
              <p>
                Connectez votre assistant à Guteneo par MCP. Choisissez votre
                outil et suivez les étapes pour ajouter le serveur et connecter
                votre compte.
              </p>
              <p className="assistants-intro-note">
                L’installation par MCP ne nécessite pas de plugin publié.
                Les guides sont accessibles sans compte.
              </p>
            </section>
            <AssistantPicker />
            <section
              className="assistant-direct-route"
              aria-labelledby="direct-route-title"
            >
              <div>
                <h2 id="direct-route-title">Vous avez déjà votre document ?</h2>
                <p>
                  Ajoutez-le directement dans Guteneo, choisissez son
                  destinataire et vérifiez le récapitulatif avant de confirmer.
                  Aucun assistant n’est nécessaire.
                </p>
              </div>
              <a className="button" href="/#/app/prepare?entry=direct">
                Envoyer depuis Guteneo{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </section>
          </>
        )}
      </main>
      <LuxembourgFooter />
    </div>
  );
}
