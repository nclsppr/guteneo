import { ArrowRight, ArrowUpRight, UserCircle } from "@phosphor-icons/react";
import { isPublicPreview, permissionsFor, type Session } from "./api";
import { getLocale } from "./locale";
import { msg } from "./messages";
import { useDashboardAppearance } from "./dashboard-appearance";
import { roleLabel } from "./role-guide";
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
        <span className="workspace-role">{roleLabel(session.user.role)}</span>
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

export function DashboardIdentity({ session }: { session: Session }) {
  const { appearance } = useDashboardAppearance();
  const permissions = permissionsFor(session);
  return (
    <section
      className="dashboard-identity"
      aria-label={msg("Your role in this workshop")}
    >
      <div>
        {appearance !== "v2" && (
          <>
            <span className="workspace-identity-label">
              {session.organization.name}
            </span>
            <h2>{session.user.name}</h2>
          </>
        )}
        <p>
          <span className="workspace-role">{roleLabel(session.user.role)}</span>
          {permissions.manageMembers
            ? msg("You manage access and can approve dispatches.")
            : permissions.approveDispatches
              ? msg("You can prepare and approve dispatches.")
              : permissions.prepareDispatches
                ? msg(
                    "You prepare dispatches; an authorized person approves them.",
                  )
                : msg(
                    "You can view this workshop’s activity in read-only mode.",
                  )}
        </p>
      </div>
      <a className="text-link" href="#/app/account">
        {msg("My profile and permissions")}
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </section>
  );
}
