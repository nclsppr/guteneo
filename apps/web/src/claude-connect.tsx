import { useId, useState } from "react";
import { ArrowUpRight, Check, Copy } from "@phosphor-icons/react";
import { isPublicPreview } from "./api";
import { fr as t } from "./i18n";

// Public OAuth client for Claude.ai. This identifier is not a credential.
export const claudeClientId = "IhJieRsvZBAnl1uJO125X2SPoIHxT8ed";
export const claudeInstallUrl =
  "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp";

export function ClaudeConnect({
  showAccountLink = false,
}: {
  showAccountLink?: boolean;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const copy = t.claudeConnect;
  const disabled =
    isPublicPreview ||
    (typeof window !== "undefined" &&
      window.location.hostname !== "guteneo.com");

  async function copyClientId() {
    try {
      await navigator.clipboard.writeText(claudeClientId);
      setCopied(true);
      setMessage(copy.copied);
    } catch {
      setCopied(false);
      setMessage(copy.copyFallback);
    }
  }

  return (
    <div className="claude-connect">
      <p className="claude-prerequisite">
        {copy.prerequisite}{" "}
        {showAccountLink && (
          <a className="text-link" href="/#/app/connection">
            {copy.account}
          </a>
        )}
      </p>
      <div className="field claude-client-field">
        <label htmlFor={`${id}-client`}>{copy.clientId}</label>
        <input
          id={`${id}-client`}
          className="mono"
          readOnly
          value={claudeClientId}
          onFocus={(event) => event.target.select()}
          aria-describedby={`${id}-public`}
          spellCheck={false}
        />
        <p className="field-hint" id={`${id}-public`}>
          {copy.publicId}
        </p>
        <div className="landing-copy-control">
          <button
            className="button subtle small"
            type="button"
            onClick={() => void copyClientId()}
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copy.copy}
          </button>
          <span className="copy-feedback" role="status">
            {message}
          </span>
        </div>
      </div>
      <div className="claude-open">
        {disabled ? (
          <button
            className="button"
            type="button"
            disabled
            aria-describedby={`${id}-unavailable`}
          >
            {copy.connect}
            <ArrowUpRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <a
            className="button"
            href={claudeInstallUrl}
            target="_blank"
            rel="noreferrer"
            aria-describedby={`${id}-link-help`}
          >
            {copy.connect}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        )}
        <p className="field-hint" id={`${id}-link-help`}>
          {copy.linkHelp}
        </p>
        {disabled && (
          <p className="field-hint" id={`${id}-unavailable`}>
            {copy.unavailable}
          </p>
        )}
      </div>
      <ol className="claude-install-steps">
        {copy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="field-hint">{copy.reconnect}</p>
    </div>
  );
}
