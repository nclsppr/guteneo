import { useId, useState, type MouseEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  DownloadSimple,
  Plus,
} from "@phosphor-icons/react";
import { fr as t } from "./i18n";
import { customerPricing } from "./customer-pricing";
import { ClaudeConnect } from "./claude-connect";

const copy = t.homepage;
const endpoint = "https://guteneo.com/mcp";
type Host = "chatgpt" | "claude" | "cursor" | "copilot";
const assistants = [
  { id: "chatgpt", name: "ChatGPT", available: true },
  { id: "claude", name: "Claude", available: true },
  { id: "grok", name: "Grok", available: false },
  { id: "cursor", name: "Cursor", available: true },
  { id: "copilot", name: "GitHub Copilot", available: true },
];

export function scrollToSection(
  event: MouseEvent<HTMLAnchorElement>,
  id: string,
) {
  event.preventDefault();
  const section = document.getElementById(id);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  async function save() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(copy.copied);
    } catch {
      setMessage(copy.copyFallback);
    }
  }
  return (
    <span className="landing-copy-control">
      <button
        className="button subtle small"
        type="button"
        onClick={() => void save()}
      >
        {message === copy.copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        {label}
      </button>
      <span className="copy-feedback" role="status">
        {message}
      </span>
    </span>
  );
}

export function Installation() {
  const [host, setHost] = useState<Host>("chatgpt");
  const instructions = copy.install.hosts[host];
  return (
    <section
      className="installation-section"
      id="installation"
      tabIndex={-1}
      aria-labelledby="installation-title"
    >
      <div className="assistant-brandstrip">
        <p>{copy.install.brandIntro}</p>
        <ul>
          {assistants.map((assistant) => (
            <li key={assistant.id} data-assistant={assistant.id}>
              <span className="assistant-stamp">
                <span className="assistant-stamp-paper" aria-hidden="true" />
                <span className="assistant-official-mark">
                  <img
                    src={`/brands/${assistant.id}.svg`}
                    alt=""
                    width="44"
                    height="44"
                    loading="lazy"
                  />
                </span>
                <strong>{assistant.name}</strong>
                <span className="assistant-stamp-caption" aria-hidden="true">
                  Correspondance
                </span>
              </span>
              <span>
                {assistant.id === "claude"
                  ? copy.install.claudeAvailable
                  : assistant.available
                    ? copy.install.brandPreparing
                    : copy.install.brandUnavailable}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="installation-heading">
        <h2 id="installation-title">
          {copy.install.title}
          <br />
          <em>{copy.install.italic}</em>
        </h2>
        <p>{copy.install.intro}</p>
        <a className="text-link" href="/guides/installer-guteneo.md" download>
          {copy.install.download}
          <DownloadSimple size={17} aria-hidden="true" />
        </a>
      </div>
      <div className="installation-guide">
        <div
          className="host-selector"
          role="group"
          aria-label={copy.install.choose}
        >
          {(["chatgpt", "claude", "cursor", "copilot"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={host === item}
              aria-controls="host-instructions"
              onClick={() => setHost(item)}
            >
              <img src={`/brands/${item}.svg`} alt="" width="20" height="20" />
              <span className={item === "copilot" ? "sr-only" : undefined}>
                {copy.install.hosts[item].name}
              </span>
            </button>
          ))}
        </div>
        <div
          id="host-instructions"
          className="host-instructions"
          aria-live="polite"
        >
          {host === "claude" ? (
            <ClaudeConnect showAccountLink />
          ) : (
            <ol>
              {copy.install.hosts[host].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          <div className="endpoint-copy">
            <span>{copy.install.endpoint}</span>
            <code>{endpoint}</code>
            <CopyButton value={endpoint} label={copy.install.copyEndpoint} />
          </div>
          <div className="installation-links">
            <a
              className="text-link"
              href={instructions.url}
              target="_blank"
              rel="noreferrer"
            >
              {instructions.link}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            {host === "cursor" && (
              <a className="text-link" href="/guides/cursor-mcp.json" download>
                {copy.install.cursorDownload}
                <DownloadSimple size={16} aria-hidden="true" />
              </a>
            )}
            {host === "copilot" && (
              <>
                <a
                  className="text-link"
                  href="/guides/copilot-vscode-mcp.json"
                  download
                >
                  {copy.install.copilotVscodeDownload}
                  <DownloadSimple size={16} aria-hidden="true" />
                </a>
                <a
                  className="text-link"
                  href="/guides/copilot-cli-mcp.json"
                  download
                >
                  {copy.install.copilotCliDownload}
                  <DownloadSimple size={16} aria-hidden="true" />
                </a>
                <a
                  className="text-link"
                  href="https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.install.copilotCliLink}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              </>
            )}
          </div>
          <p className="installation-caveat">{instructions.note}</p>
        </div>
        <div className="first-prompt">
          <h3>{copy.install.promptTitle}</h3>
          <p>{copy.install.prompt}</p>
          <CopyButton
            value={copy.install.prompt}
            label={copy.install.copyPrompt}
          />
        </div>
        <p className="installation-availability">{copy.install.availability}</p>
      </div>
    </section>
  );
}

export function WelcomePricing() {
  return (
    <section
      className="pricing-section"
      id="tarifs"
      tabIndex={-1}
      aria-labelledby="pricing-title"
    >
      <div className="pricing-heading">
        <h2 id="pricing-title">
          {copy.pricing.title}
          <br />
          <em>{copy.pricing.italic}</em>
        </h2>
        <p>{copy.pricing.intro}</p>
      </div>
      <div className="pricing-content">
        <div className="welcome-credit">
          <p className="welcome-amount">
            50<span>€</span>
          </p>
          <div className="welcome-copy">
            <h3>{copy.pricing.welcomeTitle}</h3>
            <p>{copy.pricing.welcomeBody}</p>
            <p className="welcome-terms">{copy.pricing.welcomeTerms}</p>
          </div>
        </div>
        <div
          className="pricing-table"
          role="region"
          aria-label={copy.pricing.rateLabel}
        >
          <table>
            <thead>
              <tr>
                <th>{copy.pricing.channel}</th>
                <th>{copy.pricing.price}</th>
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
        <div className="topup-unavailable">
          <button
            type="button"
            className="button"
            disabled
            aria-describedby="topup-explanation"
          >
            <Plus size={18} aria-hidden="true" />
            {copy.pricing.topup}
          </button>
          <p id="topup-explanation">{copy.pricing.topupNote}</p>
        </div>
      </div>
    </section>
  );
}

export function FrequentlyAsked() {
  return (
    <section
      className="faq-section"
      id="faq"
      tabIndex={-1}
      aria-labelledby="faq-title"
    >
      <div className="faq-heading">
        <h2 id="faq-title">
          {copy.faq.title}
          <br />
          <em>{copy.faq.italic}</em>
        </h2>
        <p>{copy.faq.intro}</p>
      </div>
      <div className="faq-questions">
        {copy.faq.items.map((item) => (
          <details key={item.question}>
            <summary>
              {item.question}
              <Plus size={19} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FoundingPostage() {
  const id = useId();
  return (
    <figure className="footer-postage">
      <img
        className="founding-stamp"
        src="/brand/gutenberg-guteneo-stamp.webp"
        alt=""
        width="640"
        height="640"
        loading="lazy"
        decoding="async"
      />
      <svg
        className="founding-postmark"
        viewBox="0 0 300 230"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <path id={`${id}-top`} d="M 25,139 A 62,62 0 0 1 149,139" />
          <path id={`${id}-bottom`} d="M 21,137 A 66,66 0 0 0 153,137" />
          <pattern
            id={`${id}-grain`}
            width="9"
            height="11"
            patternUnits="userSpaceOnUse"
          >
            <rect width="9" height="11" fill="white" />
            <circle cx="2" cy="3" r="0.65" fill="black" />
            <path d="M6 8h1.2v0.7H6z" fill="black" />
          </pattern>
          <mask id={`${id}-ink`}>
            <rect width="300" height="230" fill={`url(#${id}-grain)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-ink)`}>
          <g fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="87" cy="137" r="73" />
            <circle cx="87" cy="137" r="69" strokeWidth="0.7" />
            <circle cx="87" cy="137" r="49" strokeWidth="1" />
            <path d="M159 107c20-14 37 14 57 0s37 14 67 0M161 122c20-14 37 14 57 0s37 14 67 0M161 152c20-14 37 14 57 0s37 14 67 0M159 167c20-14 37 14 57 0s37 14 67 0" />
          </g>
          <text className="postmark-place">
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
              LUXEMBOURG
            </textPath>
          </text>
          <text className="postmark-edition">
            <textPath
              href={`#${id}-bottom`}
              startOffset="50%"
              textAnchor="middle"
            >
              PREMIER JOUR
            </textPath>
          </text>
          <text className="postmark-post" x="87" y="116" textAnchor="middle">
            POSTES
          </text>
          <text className="postmark-date" x="87" y="140" textAnchor="middle">
            16.09.2026
          </text>
          <text
            className="postmark-signature"
            x="87"
            y="160"
            textAnchor="middle"
          >
            guteneo
          </text>
        </g>
      </svg>
      <figcaption className="sr-only">
        {copy.footer.stampDescription}{" "}
        <time dateTime="2026-09-16">{copy.footer.foundingDate}</time>.
      </figcaption>
    </figure>
  );
}

export function LuxembourgFooter() {
  return (
    <footer className="luxembourg-footer">
      <div className="footer-invitation">
        <div className="footer-invitation-copy">
          <p>
            {copy.footer.title}
            <br />
            <em>{copy.footer.italic}</em>
          </p>
          <a className="button primary" href="/#/app">
            {copy.footer.cta}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <FoundingPostage />
      </div>
      <div className="luxembourg-art">
        <img
          className="luxembourg-panorama"
          src="/luxembourg-blue-panorama.webp"
          alt={copy.footer.imageAlt}
          width="2172"
          height="724"
          loading="lazy"
          decoding="async"
        />
        <div className="luxembourg-birds" aria-hidden="true">
          <span className="footer-bird bird-one">
            <span className="swallow-wingbeat" />
          </span>
          <span className="footer-bird bird-two">
            <span className="swallow-wingbeat" />
          </span>
          <span className="footer-bird bird-three">
            <span className="swallow-wingbeat" />
          </span>
        </div>
      </div>
      <div className="footer-colophon">
        <p>
          {copy.footer.made}
          <span aria-hidden="true"> — </span>
          <span>
            {copy.footer.created}{" "}
            <a
              href="https://nicolaspieper.com"
              target="_blank"
              rel="noreferrer"
            >
              Nicolas Pieper
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </span>
        </p>
        <nav aria-label={copy.footer.nav}>
          <a
            href="/#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {copy.footer.installation}
          </a>
          <a href="/#faq" onClick={(event) => scrollToSection(event, "faq")}>
            FAQ
          </a>
          <a href="/#/app">
            {copy.footer.atelier}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href="/journal/">Le journal</a>
          <a href="/developpeurs/">Développeurs</a>
          <a href="/mentions-legales/">{copy.footer.legal}</a>
        </nav>
      </div>
    </footer>
  );
}
