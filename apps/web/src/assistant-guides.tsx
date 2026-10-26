import { msg } from "./messages";
import { useId, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  DownloadSimple,
} from "@phosphor-icons/react";
import {
  getAssistantCatalog,
  assistantEndpoint,
  getAssistantReadOnlyPrompt,
  getAssistant,
  type AssistantDefinition,
  type AssistantGuideLink,
} from "./assistant-catalog";
import { ClaudeConnect } from "./claude-connect";
import { workspaceEntryHref } from "./auth-navigation";
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
      {msg("Microsoft")}
      <span>365</span>
    </span>
  );
}

export function AssistantPicker({
  basePath = "/assistants/",
  selectedId,
  label = msg("Choose your assistant"),
  className = "",
}: AssistantPickerProps) {
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const suffix = basePath.includes("#") ? "" : "/";
  return (
    <nav className={`assistant-picker ${className}`} aria-label={label}>
      <ul className="assistant-picker-list">
        {getAssistantCatalog().map((assistant) => (
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
          {result === "copied" && msg("Copied.")}
          {result === "unavailable" &&
            msg(
              "Automatic copying is unavailable. Select and copy the text above.",
            )}
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
          <Title id={titleId}>
            {msg("Add Guteneo to ")}
            {assistant.name}
          </Title>
          <p>{assistant.description}</p>
        </div>
      </header>

      {assistant.variants.length > 1 && (
        <div className="assistant-guide-versions">
          <p>{assistant.variantPrompt ?? msg("Which version do you use?")}</p>
          <div
            className="assistant-guide-version-controls"
            role="group"
            aria-label={
              assistant.variantPrompt ??
              msg("Choose the version of {0}", assistant.name)
            }
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
        <aside className="assistant-guide-before" aria-label={msg("Prerequisites")}>
          <SectionHeading>{msg("Before you start")}</SectionHeading>
          <ul>
            <li>
              {msg(
                "A Guteneo account to sign in when connecting.",
              )}
            </li>
            {variant.prerequisites.map((prerequisite) => (
              <li key={prerequisite}>{prerequisite}</li>
            ))}
          </ul>
          {!inDashboard ? (
            <div className="assistant-guide-account">
              <p>
                {msg(
                  "You can read this guide without an account. Find it in your workspace to continue.",
                )}
              </p>
              <a
                className="assistant-guide-account-link"
                href={workspaceEntryHref(`/#/app/connection/${assistant.id}`)}
              >
                {msg("Create or open my workspace")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          ) : (
            <p className="assistant-guide-account-note">
              {msg(
                "Keep this guide open while adding the connection in your app.",
              )}
            </p>
          )}
        </aside>

        <section
          className="assistant-guide-instructions"
          id={stepsId}
          aria-label={msg("Installation in {0}", variant.label)}
        >
          <SectionHeading>
            {variant.installationTitle ??
              msg("Installation in {0}", variant.label)}
          </SectionHeading>
          {assistant.id === "claude" && variant.id !== "code" && (
            <ClaudeConnect />
          )}
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
                      label={msg("Copy address")}
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
              {msg("Check the connection")}
            </SectionHeading>
            <p>
              {msg(
                "Paste this prompt into your assistant to find out what your account can do, without preparing a dispatch.",
              )}
            </p>
            <CopyText
              value={getAssistantReadOnlyPrompt()}
              label={msg("Copy verification prompt")}
              prose
            />
            <p className="assistant-guide-verification-note">
              {msg(
                "After a response that uses Guteneo tools, find the latest successful exchange under My connections in your workspace.",
              )}
            </p>
          </section>

          <section
            className="assistant-guide-plugins"
            aria-labelledby={`${instanceId}-plugins`}
          >
            <SectionHeading id={`${instanceId}-plugins`}>
              {msg("Catalogue plugin")}
            </SectionHeading>
            <p>
              {assistant.id === "chatgpt"
                ? msg(
                    "The methods in this guide let you add Guteneo directly to ChatGPT without going through its plugin directory.",
                  )
                : msg(
                    "No Guteneo plugin is published in the {0} directory yet. Follow the manual setup described in this guide.",
                    assistant.name,
                  )}
            </p>
            {["claude", "cursor", "grok"].includes(assistant.id) && (
              <GuideLink
                link={{
                  label: msg(
                    "Download the plugin package (manual installation)",
                  ),
                  href: "/integrations/guteneo-plugin.zip",
                  download: true,
                }}
              />
            )}
          </section>

          <section
            className="assistant-guide-help"
            aria-labelledby={`${instanceId}-help`}
          >
            <SectionHeading id={`${instanceId}-help`}>
              {msg("Need help?")}
            </SectionHeading>
            {variant.troubleshooting.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
            <details>
              <summary>
                {msg("The connection fails or returns to the sign-in screen")}
              </summary>
              <p>
                {msg(
                  "Check the server address and the Guteneo account in use. If the app reports a denied permission, unknown client or invalid redirect address, keep the error message and have the configuration checked. Do not share any password or token.",
                )}
              </p>
            </details>
            <details>
              <summary>
                {msg("My assistant cannot find my document")}
              </summary>
              <p>
                {msg(
                  "Attachment transfer depends on your app. If the file is not accessible, upload it in Documents in your Guteneo workspace, then ask your assistant to find that document.",
                )}
              </p>
            </details>
          </section>

          <footer className="assistant-guide-sources">
            <SectionHeading>
              {msg("The provider’s instructions")}
            </SectionHeading>
            <ul>
              {variant.documentation.map((link) => (
                <li key={link.href}>
                  <GuideLink link={link} />
                </li>
              ))}
            </ul>
            <p>
              {assistant.id === "chatgpt"
                ? msg(
                    "Menus and access options may vary depending on your account.",
                  )
                : msg(
                    "Documentation checked on 13 October 2026. Menus and access options may vary depending on your account.",
                  )}
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
        <h2>{msg("This guide does not exist.")}</h2>
        <p>
          {msg("Choose your app to find its instructions.")}
        </p>
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
