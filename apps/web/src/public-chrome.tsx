import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  List,
  Moon,
  Sun,
  X,
} from "@phosphor-icons/react";
import { isPublicPreview } from "./api";
import { workspaceEntryHref } from "./auth-navigation";
import { Brand } from "./brand";
import { LanguageMenu } from "./language-select";
import { t, useLocale } from "./locale";
import { msg } from "./messages";
import { useResolvedTheme } from "./theme";
import publicFooter from "../../../packages/contracts/src/public-footer.json";
import { publicSiteLabel } from "./public-site-metadata";
import { useDarkImageMedia } from "./theme-media";
import "./public-chrome.css";

type PublicPage =
  | "assistants"
  | "developers"
  | "journal"
  | "pricing"
  | "how-it-works"
  | "getting-started"
  | "pdf-checks";

export function scrollToPublicSection(
  event: MouseEvent<HTMLAnchorElement>,
  id: string,
) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.focus({ preventScroll: true });
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export function PublicHeader({
  activePage,
  showWorkspaceLink = true,
}: {
  activePage?: PublicPage;
  home?: boolean;
  showWorkspaceLink?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const resources = useRef<HTMLDetailsElement>(null);
  const theme = useResolvedTheme();
  const lightAction = msg("Switch to light mode");
  const darkAction = msg("Switch to dark mode");
  const themeAction = theme === "dark" ? lightAction : darkAction;
  const entryLabel = isPublicPreview
    ? msg("Explore the demo")
    : t.login.managed;
  const links = [
    {
      href: "/how-it-works/",
      label: publicSiteLabel("/how-it-works/"),
      page: "how-it-works",
    },
    { href: "/pricing/", label: publicSiteLabel("/pricing/"), page: "pricing" },
    { href: "/assistants/", label: msg("Assistants"), page: "assistants" },
  ];
  const resourceLinks = [
    {
      href: "/getting-started/",
      label: publicSiteLabel("/getting-started/"),
      page: "getting-started",
    },
    {
      href: "/pdf-checks/",
      label: publicSiteLabel("/pdf-checks/"),
      page: "pdf-checks",
    },
    { href: "/journal/", label: msg("The journal"), page: "journal" },
    { href: "/developers/", label: msg("Developers"), page: "developers" },
    { href: "/support/", label: msg("Support"), page: "support" },
  ];

  useEffect(() => {
    header.current?.setAttribute("data-render-state", "interactive");
    function dismissResources(event: Event) {
      if (
        event.target instanceof Node &&
        !resources.current?.contains(event.target)
      )
        resources.current?.removeAttribute("open");
    }
    function escapeResources(event: KeyboardEvent) {
      if (event.key !== "Escape" || !resources.current?.open) return;
      event.preventDefault();
      resources.current.open = false;
      resources.current.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", dismissResources);
    document.addEventListener("focusin", dismissResources);
    document.addEventListener("keydown", escapeResources);
    return () => {
      document.removeEventListener("pointerdown", dismissResources);
      document.removeEventListener("focusin", dismissResources);
      document.removeEventListener("keydown", escapeResources);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOutside(event: Event) {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      )
        setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function navigate() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header public-header" ref={header}>
      <Brand />
      <nav
        className="public-desktop-navigation"
        aria-label={msg("Main navigation")}
      >
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={
              link.page && link.page === activePage ? "page" : undefined
            }
            onClick={navigate}
          >
            {link.label}
          </a>
        ))}
        <details className="public-resource-menu" ref={resources}>
          <summary>
            {msg("Resources")}
            <CaretDown size={13} aria-hidden="true" />
          </summary>
          <div className="public-resource-links">
            {resourceLinks.map((link) => (
              <a
                href={link.href}
                key={link.href}
                aria-current={link.page === activePage ? "page" : undefined}
              >
                {link.label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </details>
      </nav>
      <div className="public-header-actions">
        <button
          className="public-theme-toggle"
          type="button"
          data-theme-toggle="true"
          data-theme-label-light={lightAction}
          data-theme-label-dark={darkAction}
          aria-label={themeAction}
          title={themeAction}
        >
          <Sun size={21} data-theme-icon="light" aria-hidden="true" />
          <Moon size={21} data-theme-icon="dark" aria-hidden="true" />
        </button>
        <LanguageMenu onOpen={() => setMenuOpen(false)} />
        {showWorkspaceLink && (
          <a
            className="button small public-workspace-link"
            href={workspaceEntryHref()}
          >
            {entryLabel}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
        <button
          ref={menuButton}
          className="public-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? (
            <X size={19} aria-hidden="true" />
          ) : (
            <List size={19} aria-hidden="true" />
          )}
          {msg("Menu")}
        </button>
      </div>
      <nav
        id={menuId}
        className="public-mobile-navigation"
        aria-label={msg("Mobile navigation")}
        hidden={!menuOpen}
      >
        {[...links, ...resourceLinks].map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={
              link.page && link.page === activePage ? "page" : undefined
            }
            onClick={navigate}
          >
            {link.label}
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        ))}
        {showWorkspaceLink && (
          <a
            className="public-mobile-workspace"
            href={workspaceEntryHref()}
            onClick={() => setMenuOpen(false)}
          >
            {entryLabel}
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        )}
      </nav>
    </header>
  );
}

function PublicFooterStamp() {
  const id = useId();
  return (
    <figure className="footer-postage">
      <img
        className="founding-stamp"
        src="/brand/gutenberg-guteneo-stamp-transparent.webp"
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
        {t.homepage.footer.stampDescription}{" "}
        <time dateTime="2026-09-16">{t.homepage.footer.foundingDate}</time>.
      </figcaption>
    </figure>
  );
}

export function PublicHomeClosing() {
  const darkMedia = useDarkImageMedia();
  return (
    <section
      className="public-home-closing"
      aria-labelledby="home-closing-title"
    >
      <div className="footer-invitation">
        <div className="footer-invitation-copy">
          <h2 id="home-closing-title">
            {t.homepage.footer.title}
            <br />
            <em>{t.homepage.footer.italic}</em>
          </h2>
          <a
            className="button primary"
            href="/#installation"
            onClick={(event) => scrollToPublicSection(event, "installation")}
          >
            {t.homepage.footer.cta}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <PublicFooterStamp />
      </div>
      <div className="public-footer-panorama">
        <picture>
          <source
            data-theme-source="dark"
            srcSet="/luxembourg-dark-panorama.webp"
            media={darkMedia}
          />
          <img
            src="/luxembourg-blue-panorama.webp"
            alt={t.homepage.footer.imageAlt}
            width="2172"
            height="724"
            loading="lazy"
            decoding="async"
          />
        </picture>
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
    </section>
  );
}

export function PublicFooter() {
  const locale = useLocale();
  return (
    <footer className="public-site-footer">
      <div className="public-page-swallows" aria-hidden="true">
        <span className="public-margin-swallow">
          <span className="swallow-wingbeat" />
        </span>
        <span className="public-margin-swallow">
          <span className="swallow-wingbeat" />
        </span>
      </div>
      <nav
        className="public-site-footer-navigation"
        aria-label={publicFooter.navigationLabel[locale]}
      >
        {publicFooter.groups.map((group) => (
          <div key={group.id}>
            <h2>{group.labels[locale]}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={
                      link.href === "https://status.guteneo.com/"
                        ? `${link.href}?lang=${locale}`
                        : link.href
                    }
                  >
                    {link.labels[locale]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="public-site-footer-colophon">
        <PublicFooterStamp />
        <p>
          {t.homepage.footer.made}
          <span aria-hidden="true"> · </span>
          {t.homepage.footer.created}{" "}
          <a href="https://nicolaspieper.com" target="_blank" rel="noreferrer">
            Nicolas Pieper
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </p>
      </div>
    </footer>
  );
}
