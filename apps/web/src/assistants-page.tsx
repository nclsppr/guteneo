import { LanguageSelect } from "./language-select";
import { msg } from "./messages";
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
        {msg("Aller au contenu")}
      </a>
      <header className="site-header assistants-header">
        <Brand />
        <LanguageSelect />
        <nav aria-label={msg("Navigation principale")}>
          <a
            href="/assistants/"
            aria-current={!assistantId ? "page" : undefined}
          >
            {msg("Assistants")}
          </a>
          <a href="/#tarifs">{msg("Tarifs")}</a>
          <a className="button small" href="/#/app">
            {msg("Mon espace ")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="assistants-main" tabIndex={-1}>
        {assistant ? (
          <>
            <a className="back-link" href="/assistants/">
              <ArrowLeft size={18} aria-hidden="true" />
              {msg("Tous les assistants")}
            </a>
            <AssistantGuide assistantId={assistant.id} />
          </>
        ) : assistantId ? (
          <section className="assistants-intro">
            <h1>{msg("Ce guide n’existe pas.")}</h1>
            <p>
              {msg(
                "Retrouvez les instructions pour votre assistant dans le catalogue.",
              )}
            </p>
            <a className="button primary" href="/assistants/">
              {msg("Choisir mon assistant ")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </section>
        ) : (
          <>
            <section className="assistants-intro">
              <h1>
                {msg("Votre assistant.")}
                <br />
                <em>{msg("Votre correspondance.")}</em>
              </h1>
              <p>
                {msg(
                  "Connectez votre assistant à Guteneo par MCP. Choisissez votre outil et suivez les étapes pour ajouter le serveur et connecter votre compte.",
                )}
              </p>
              <p className="assistants-intro-note">
                {msg(
                  "L’installation par MCP ne nécessite pas de plugin publié. Les guides sont accessibles sans compte.",
                )}
              </p>
            </section>
            <AssistantPicker />
            <section
              className="assistant-direct-route"
              aria-labelledby="direct-route-title"
            >
              <div>
                <h2 id="direct-route-title">
                  {msg("Vous avez déjà votre document ?")}
                </h2>
                <p>
                  {msg(
                    "Ajoutez-le directement dans Guteneo, choisissez son destinataire et vérifiez le récapitulatif avant de confirmer. Aucun assistant n’est nécessaire.",
                  )}
                </p>
              </div>
              <a className="button" href="/#/app/prepare?entry=direct">
                {msg("Envoyer depuis Guteneo")}{" "}
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
