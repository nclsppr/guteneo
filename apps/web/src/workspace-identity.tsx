import {
  ArrowUpRight,
  CaretUpDown,
  Pulse,
  SignOut,
  UserCircle,
  UserSwitch,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { isPublicPreview, type Session } from "./api";
import { useRoute } from "./components";
import { getLocale, t } from "./locale";
import { msg } from "./messages";
import { ThemeToggle } from "./theme-toggle";
import "./workspace-identity.css";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toLocaleUpperCase();
}

function switchAccountHref() {
  const returnTo = encodeURIComponent("/" + (window.location.hash || "#/app"));
  return `/auth/login?intent=switch-account&locale=${getLocale()}&returnTo=${returnTo}`;
}

/** One identity row; its disclosure holds the account utilities. */
export function WorkspaceIdentity({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => Promise<void>;
}) {
  const route = useRoute();
  // Opening records the committed route, so navigating away closes the menu.
  const [openOn, setOpenOn] = useState<string>();
  const open = openOn === route;
  const area = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => setOpenOn(undefined);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!area.current?.contains(event.target as Node)) setOpenOn(undefined);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <section
      ref={area}
      className="workspace-identity"
      aria-label={msg("Your account")}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        close();
        trigger.current?.focus();
      }}
      onBlur={(event) => {
        // Safari blurs without a target when a pointer selects an item.
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          close();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-identity-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close() : setOpenOn(route))}
      >
        <span className="workspace-identity-avatar" aria-hidden="true">
          {initials(session.user.name)}
        </span>
        <span className="workspace-identity-name">{session.user.name}</span>
        <CaretUpDown size={16} aria-hidden="true" />
      </button>
      <div id={menuId} className="workspace-identity-menu" hidden={!open}>
        <p className="workspace-identity-summary">
          <strong>{session.user.name}</strong>
          <span className="workspace-identity-email">
            {session.user.email || msg("Sign-in email unavailable")}
          </span>
        </p>
        <ul>
          <li>
            <a
              className="workspace-identity-profile"
              href="#/app/account"
              aria-current={
                route.split("?")[0] === "/app/account" ? "page" : undefined
              }
              onClick={close}
            >
              <UserCircle size={20} aria-hidden="true" />
              {msg("My profile and permissions")}
            </a>
          </li>
          <li>
            <ThemeToggle labelled />
          </li>
          {!isPublicPreview && (
            <li>
              <a
                className="workspace-switch-account"
                href={switchAccountHref()}
              >
                <UserSwitch size={20} aria-hidden="true" />
                {msg("Switch account")}
              </a>
            </li>
          )}
          <li>
            <a
              className="workspace-service-status"
              href="https://status.guteneo.com/"
            >
              <Pulse size={20} aria-hidden="true" />
              {msg("Service status")}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
          <li>
            <button
              type="button"
              className="workspace-sign-out"
              onClick={() => void onLogout()}
            >
              <SignOut size={20} aria-hidden="true" />
              {t.login.logout}
            </button>
          </li>
        </ul>
      </div>
    </section>
  );
}
