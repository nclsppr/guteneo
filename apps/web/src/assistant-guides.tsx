import { useId, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  DownloadSimple,
} from "@phosphor-icons/react";
import {
  assistantCatalog,
  assistantEndpoint,
  assistantReadOnlyPrompt,
  getAssistant,
  type AssistantDefinition,
  type AssistantGuideLink,
} from "./assistant-catalog";
import "./assistant-guides.css";

export type AssistantPickerProps = {
  basePath?: string;
  selectedId?: string;
  label?: string;
  className?: string;
};

export type AssistantGuideProps = {
  assistantId: string;
  inDashboard?: boolean;
  className?: string;
};

function AssistantMark({ assistant }: { assistant: AssistantDefinition }) {
  return assistant.logo ? (
    <img
      className="assistant-brand-mark"
      src={assistant.logo}
      alt=""
      width="44"
      height="44"
      loading="lazy"
    />
  ) : (
    <span className="assistant-brand-wordmark" aria-hidden="true">
      Microsoft<span>365</span>
    </span>
  );
}

export function AssistantPicker({
  basePath = "/assistants/",
  selectedId,
  label = "Choisir votre assistant",
  className = "",
}: AssistantPickerProps) {
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const suffix = basePath.includes("#") ? "" : "/";
  return (
    <nav className={`assistant-picker ${className}`} aria-label={label}>
      <ul className="assistant-picker-list">
        {assistantCatalog.map((assistant) => (
          <li key={assistant.id}>
            <a
              className="assistant-picker-link"
              href={`${prefix}${assistant.id}${suffix}`}
              aria-current={selectedId === assistant.id ? "page" : undefined}
            >
              <AssistantMark assistant={assistant} />
              <span>{assistant.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function GuideLink({ link }: { link: AssistantGuideLink }) {
  const external = link.href.startsWith("https://");
  const Icon = link.download ? DownloadSimple : ArrowUpRight;
  return (
    <a
      className="assistant-guide-link"
      href={link.href}
      download={link.download || undefined}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {link.label}
      <Icon size={17} aria-hidden="true" />
    </a>
  );
}

function CopyText({
  value,
  label,
  prose = false,
}: {
  value: string;
  label: string;
  prose?: boolean;
}) {
  const [result, setResult] = useState<"copied" | "unavailable" | null>(null);
  const valueId = useId();
  const feedbackId = useId();
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("unavailable");
    }
  }
  return (
    <div className={`assistant-copy ${prose ? "assistant-copy-prose" : ""}`}>
      {prose ? (
        <p className="assistant-copy-value" id={valueId}>
          {value}
        </p>
      ) : (
        <code className="assistant-copy-value" id={valueId}>
          {value}
        </code>
      )}
      <div className="assistant-copy-actions">
        <button
          type="button"
          className="assistant-copy-button"
          onClick={() => void copy()}
          aria-describedby={feedbackId}
          aria-controls={valueId}
        >
          {result === "copied" ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Copy size={17} aria-hidden="true" />
          )}
          {label}
        </button>
        <span className="assistant-copy-feedback" id={feedbackId} role="status">
          {result === "copied" && "Copié."}
          {result === "unavailable" &&
            "La copie automatique est indisponible. Sélectionnez et copiez le texte ci-dessus."}
        </span>
      </div>
    </div>
  );
}

function GuideArticle({
  assistant,
  inDashboard,
  className,
}: {
  assistant: AssistantDefinition;
  inDashboard: boolean;
  className: string;
}) {
  const [variantId, setVariantId] = useState(assistant.variants[0].id);
  const variant =
    assistant.variants.find((item) => item.id === variantId) ??
    assistant.variants[0];
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const stepsId = `${instanceId}-steps`;
  const Title = "h1";
  const SectionHeading = "h2";
  const StepHeading = "h3";
  return (
    <article
      className={`assistant-guide ${inDashboard ? "assistant-guide-dashboard" : "assistant-guide-public"} ${className}`}
      data-assistant={assistant.id}
      aria-labelledby={titleId}
    >
      <header className="assistant-guide-heading">
        <AssistantMark assistant={assistant} />
        <div>
          <Title id={titleId}>Ajouter Guteneo à {assistant.name}</Title>
          <p>{assistant.description}</p>
        </div>
      </header>

      {assistant.variants.length > 1 && (
        <div className="assistant-guide-versions">
          <p>Quelle version utilisez-vous ?</p>
          <div
            className="assistant-guide-version-controls"
            role="group"
            aria-label={`Choisir la version de ${assistant.name}`}
          >
            {assistant.variants.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={variant.id === item.id}
                aria-controls={stepsId}
                onClick={() => setVariantId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {variant.intro && (
        <p className="assistant-guide-context">{variant.intro}</p>
      )}

      <div className="assistant-guide-layout">
        <aside className="assistant-guide-before" aria-label="Prérequis">
          <SectionHeading>Avant de commencer</SectionHeading>
          <ul>
            <li>
              Un compte Guteneo pour vous identifier lors de la connexion.
            </li>
            {variant.prerequisites.map((prerequisite) => (
              <li key={prerequisite}>{prerequisite}</li>
            ))}
          </ul>
          {!inDashboard ? (
            <div className="assistant-guide-account">
              <p>
                Ce guide se consulte sans compte. Retrouvez-le dans votre espace
                pour poursuivre.
              </p>
              <a
                className="assistant-guide-account-link"
                href={`/#/app/connection/${assistant.id}`}
              >
                Créer ou ouvrir mon espace
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          ) : (
            <p className="assistant-guide-account-note">
              Gardez ce guide ouvert pendant l’ajout dans votre application.
            </p>
          )}
        </aside>

        <section
          className="assistant-guide-instructions"
          id={stepsId}
          aria-label={`Installation dans ${variant.label}`}
        >
          <SectionHeading>Installer par MCP</SectionHeading>
          <ol className="assistant-guide-steps">
            {variant.steps.map((step, index) => (
              <li key={`${variant.id}-${step.title}`}>
                <span
                  className="assistant-guide-step-number"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div>
                  <StepHeading>{step.title}</StepHeading>
                  <p>{step.text}</p>
                  {step.code && (
                    <pre className="assistant-guide-command">
                      <code>{step.code}</code>
                    </pre>
                  )}
                  {step.endpoint && (
                    <CopyText
                      value={assistantEndpoint}
                      label="Copier l’adresse"
                    />
                  )}
                  {step.link && <GuideLink link={step.link} />}
                </div>
              </li>
            ))}
          </ol>

          <section
            className="assistant-guide-verification"
            aria-labelledby={`${instanceId}-verification`}
          >
            <SectionHeading id={`${instanceId}-verification`}>
              Vérifier la connexion
            </SectionHeading>
            <p>
              Collez cette demande dans votre assistant pour connaître les
              possibilités de votre compte, sans préparer d’envoi.
            </p>
            <CopyText
              value={assistantReadOnlyPrompt}
              label="Copier la demande de vérification"
              prose
            />
            <p className="assistant-guide-verification-note">
              Après une réponse utilisant les outils Guteneo, retrouvez le
              dernier échange réussi dans « Mes connexions » de votre espace.
            </p>
          </section>

          <section
            className="assistant-guide-plugins"
            aria-labelledby={`${instanceId}-plugins`}
          >
            <SectionHeading id={`${instanceId}-plugins`}>
              Plugin du catalogue
            </SectionHeading>
            <p>
              Aucun plugin Guteneo n’est publié dans le catalogue de{" "}
              {assistant.name} pour le moment. Utilisez l’installation par MCP
              décrite ci-dessus.
            </p>
          </section>

          <section
            className="assistant-guide-help"
            aria-labelledby={`${instanceId}-help`}
          >
            <SectionHeading id={`${instanceId}-help`}>
              Besoin d’aide ?
            </SectionHeading>
            {variant.troubleshooting.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
            <details>
              <summary>
                La connexion échoue ou revient à l’écran de connexion
              </summary>
              <p>
                Vérifiez l’adresse du serveur et le compte Guteneo utilisé. Si
                l’application indique une permission refusée, un client inconnu
                ou une adresse de retour invalide, conservez le libellé de
                l’erreur et faites vérifier la configuration. Ne transmettez ni
                mot de passe ni jeton.
              </p>
            </details>
            <details>
              <summary>Mon assistant ne retrouve pas mon document</summary>
              <p>
                Le transfert des pièces jointes dépend de votre application. Si
                le fichier n’est pas accessible, déposez-le dans la rubrique
                Documents de votre espace Guteneo, puis demandez à votre
                assistant de retrouver ce document.
              </p>
            </details>
          </section>

          <footer className="assistant-guide-sources">
            <SectionHeading>Les instructions de l’éditeur</SectionHeading>
            <ul>
              {variant.documentation.map((link) => (
                <li key={link.href}>
                  <GuideLink link={link} />
                </li>
              ))}
            </ul>
            <p>
              Documentation vérifiée le 20 septembre 2026. Les menus et les
              possibilités d’accès peuvent varier selon votre compte.
            </p>
          </footer>
        </section>
      </div>
    </article>
  );
}

export function AssistantGuide({
  assistantId,
  inDashboard = false,
  className = "",
}: AssistantGuideProps) {
  const assistant = getAssistant(assistantId);
  if (!assistant) {
    return (
      <section className={`assistant-guide ${className}`}>
        <h2>Ce guide n’existe pas.</h2>
        <p>Choisissez votre application pour retrouver ses instructions.</p>
        <AssistantPicker
          basePath={inDashboard ? "/#/app/connection/" : "/assistants/"}
        />
      </section>
    );
  }
  return (
    <GuideArticle
      key={assistant.id}
      assistant={assistant}
      inDashboard={inDashboard}
      className={className}
    />
  );
}
