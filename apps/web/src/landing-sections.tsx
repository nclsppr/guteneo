import { useState, type MouseEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  DownloadSimple,
  Pause,
  Play,
  Plus,
} from "@phosphor-icons/react";
import { fr as t } from "./i18n";

const copy = t.homepage;
const endpoint = "https://guteneo.com/mcp";
type Host = "chatgpt" | "claude" | "cursor";

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
          {(["chatgpt", "claude", "cursor"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={host === item}
              aria-controls="host-instructions"
              onClick={() => setHost(item)}
            >
              {copy.install.hosts[item].name}
            </button>
          ))}
        </div>
        <div
          id="host-instructions"
          className="host-instructions"
          aria-live="polite"
        >
          <ol>
            {instructions.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
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
              {copy.pricing.rates.map((rate) => (
                <tr key={rate.channel}>
                  <th scope="row">
                    {rate.channel}
                    <span>{rate.unit}</span>
                  </th>
                  <td>
                    <strong>2 ×</strong> {rate.cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="price-qualification">{copy.pricing.qualification}</p>
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

export function LuxembourgFooter() {
  const [paused, setPaused] = useState(false);
  return (
    <footer className="luxembourg-footer">
      <div className="footer-invitation">
        <p>
          {copy.footer.title}
          <br />
          <em>{copy.footer.italic}</em>
        </p>
        <a className="button primary" href="#/app">
          {copy.footer.cta}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <div className={`luxembourg-art${paused ? " birds-paused" : ""}`}>
        <img
          className="luxembourg-panorama"
          src="/luxembourg-panorama.webp"
          alt={copy.footer.imageAlt}
          width="2172"
          height="724"
          loading="lazy"
          decoding="async"
        />
        <div className="luxembourg-birds" aria-hidden="true">
          <span className="footer-bird bird-one">
            <img
              src="/luxembourg-swallow.webp"
              alt=""
              width="300"
              height="200"
              loading="lazy"
            />
          </span>
          <span className="footer-bird bird-two">
            <img
              src="/luxembourg-swallow.webp"
              alt=""
              width="300"
              height="200"
              loading="lazy"
            />
          </span>
          <span className="footer-bird bird-three">
            <img
              src="/luxembourg-swallow.webp"
              alt=""
              width="300"
              height="200"
              loading="lazy"
            />
          </span>
        </div>
        <button
          type="button"
          className="bird-motion-toggle"
          aria-label={paused ? copy.footer.resume : copy.footer.pause}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play size={14} aria-hidden="true" />
          ) : (
            <Pause size={14} aria-hidden="true" />
          )}
          <span>{paused ? copy.footer.resume : copy.footer.pause}</span>
        </button>
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
            href="#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {copy.footer.installation}
          </a>
          <a href="#faq" onClick={(event) => scrollToSection(event, "faq")}>
            FAQ
          </a>
          <a href="#/app">
            {copy.footer.atelier}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
