import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, ArrowUpRight, List, X } from "@phosphor-icons/react";
import { isPublicPreview } from "./api";
import { workspaceEntryHref } from "./auth-navigation";
import { Brand } from "./brand";
import { LanguageMenu } from "./language-select";
import { LegalLinks } from "./legal-links";
import { t } from "./locale";
import { msg } from "./messages";
import "./public-chrome.css";

type PublicPage = "assistants" | "developers" | "journal";

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
  home = false,
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
  const entryLabel = isPublicPreview
    ? msg("Explore the demo")
    : t.login.managed;
  const links = [
    { href: "/#how", label: t.landing.navHow, section: "how" },
    { href: "/assistants/", label: msg("Assistants"), page: "assistants" },
    { href: "/#pricing", label: t.homepage.navPricing, section: "pricing" },
    { href: "/journal/", label: msg("The journal"), page: "journal" },
    { href: "/developers/", label: msg("Developers"), page: "developers" },
  ];

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

  function navigate(event: MouseEvent<HTMLAnchorElement>, section?: string) {
    setMenuOpen(false);
    if (home && section) scrollToPublicSection(event, section);
  }

  return (
    <header
      className="site-header public-header"
      ref={header}
    >
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
            onClick={(event) => navigate(event, link.section)}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="public-header-actions">
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
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={
              link.page && link.page === activePage ? "page" : undefined
            }
            onClick={(event) => navigate(event, link.section)}
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

export function PublicFooter() {
  return (
    <footer className="legal-colophon public-colophon">
      <Brand variant="simple" compact />
      <LegalLinks />
    </footer>
  );
}
