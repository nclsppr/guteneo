import { ArrowRight, ArrowUpRight, UserCircle } from "@phosphor-icons/react";
import { isPublicPreview, type Session } from "./api";
import { getLocale } from "./locale";
import { msg } from "./messages";
import { useDashboardAppearance } from "./dashboard-appearance";
import "./workspace-identity.css";

export function WorkspaceIdentity({ session }: { session: Session }) {
  const { appearance } = useDashboardAppearance();
  const returnTo = encodeURIComponent("/" + (window.location.hash || "#/app"));
  return (
    <section className="workspace-identity" aria-label={msg("Your account")}>
      <a
        className="workspace-identity-profile"
        href="#/app/account"
        aria-current={
          window.location.hash.split("?")[0] === "#/app/account"
            ? "page"
            : undefined
        }
      >
        <span className="workspace-identity-avatar" aria-hidden="true">
          {session.user.name
            .trim()
            .split(/\s+/)
            .filter((part) => /[\p{L}\p{N}]/u.test(part))
            .slice(0, 2)
            .map((part) => Array.from(part)[0])
            .join("")
            .toLocaleUpperCase()}
        </span>
        <span className="workspace-identity-label">{msg("Signed in as")}</span>
        <strong>{session.user.name}</strong>
        <span className="workspace-identity-email">
          {session.user.email || msg("Sign-in email unavailable")}
        </span>
        <span className="workspace-identity-action">
          <UserCircle size={17} aria-hidden="true" />
          {msg("My profile and permissions")}
          <ArrowRight size={15} aria-hidden="true" />
        </span>
      </a>
      <div className="workspace-account-utilities">
        {!isPublicPreview && (
          <a
            className="workspace-switch-account"
            href={`/auth/login?intent=switch-account&locale=${getLocale()}&returnTo=${returnTo}`}
          >
            {msg("Switch account")}
          </a>
        )}
        {appearance === "v2" && (
          <a
            className="workspace-service-status"
            href="https://status.guteneo.com/"
          >
            {msg("Service status")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}
