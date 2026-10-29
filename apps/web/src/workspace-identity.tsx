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

function switchAccountHref(returnPath?: string, personal = false) {
  const returnTo = encodeURIComponent(
    returnPath ?? "/" + (window.location.hash || "#/app"),
  );
  return `/auth/login?intent=switch-account&locale=${getLocale()}&returnTo=${returnTo}${personal ? "&context=personal" : ""}`;
}

/** One identity row; its disclosure holds the account utilities. */
export function WorkspaceIdentity({
  session,
  onLogout,
  profileHref = "#/app/account",
  profileLabel,
  authenticationContext,
  returnTo,
  logoutPending = false,
}: {
  session: { user: Pick<Session["user"], "id" | "name" | "email"> };
  onLogout: () => Promise<void>;
  profileHref?: string;
  profileLabel?: string;
  authenticationContext?: "personal";
  returnTo?: string;
  logoutPending?: boolean;
}) {
  const route = useRoute();
  const context = `${session.user.id}:${route}`;
  // Opening records the committed route, so navigating away closes the menu.
  const [openOn, setOpenOn] = useState<string>();
  // Forget it on navigation, so returning to the same address keeps it closed.
  if (openOn !== undefined && openOn !== context) setOpenOn(undefined);
  const open = openOn === context;
  const area = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => setOpenOn(undefined);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!area.current?.contains(event.target as Node)) setOpenOn(undefined);
    };
    // Two quick address changes may render once; the event still closes it.
    const navigate = () => setOpenOn(undefined);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenOn(undefined);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("hashchange", navigate);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("hashchange", navigate);
    };
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
        onClick={() => (open ? close() : setOpenOn(context))}
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
              href={profileHref}
              aria-current={
                route.split("?")[0] === profileHref.split("#")[1]?.split("?")[0]
                  ? "page"
                  : undefined
              }
              onClick={close}
            >
              <UserCircle size={20} aria-hidden="true" />
              {profileLabel ?? msg("My profile and permissions")}
            </a>
          </li>
          <li>
            <ThemeToggle labelled />
          </li>
          {!isPublicPreview && (
            <li>
              <a
                className="workspace-switch-account"
                href={switchAccountHref(
                  returnTo,
                  authenticationContext === "personal",
                )}
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
              disabled={logoutPending}
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
