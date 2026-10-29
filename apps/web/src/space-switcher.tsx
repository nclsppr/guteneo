import {
  CaretDown,
  Check,
  EnvelopeSimple,
  Files,
  PenNib,
  Plus,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { spaceHome, type ApplicationSpace } from "./app-routes";
import { ErrorNotice, useAction, useRoute } from "./components";
import { msg, msgIn } from "./messages";
import "./space-switcher.css";

/** A membership; the current workspace always comes from the active session. */
export type SwitcherWorkspace = { id: string; name: string };

function initial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
}

/** Open state shared by both switchers: any navigation, Escape or outside press closes. */
function usePanel() {
  const route = useRoute();
  // Opening records the committed route, so navigating away closes the panel.
  const [openOn, setOpenOn] = useState<string>();
  // Forget it on navigation, so returning to the same address keeps it closed.
  if (openOn !== undefined && openOn !== route) setOpenOn(undefined);
  const open = openOn === route;
  const area = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => setOpenOn(undefined);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!area.current?.contains(event.target as Node)) setOpenOn(undefined);
    };
    // Safari does not focus a clicked button, so Escape may reach the document.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenOn(undefined);
      trigger.current?.focus();
    };
    // Two quick address changes may render once; the event still closes it.
    const navigate = () => setOpenOn(undefined);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("hashchange", navigate);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("hashchange", navigate);
    };
  }, [open]);
  return {
    open,
    area,
    trigger,
    id,
    close,
    toggle: () => (open ? close() : setOpenOn(route)),
    // Safari blurs without a target when a pointer selects an item.
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      if (
        event.relatedTarget &&
        !event.currentTarget.contains(event.relatedTarget)
      )
        close();
    },
  };
}

const applications: {
  id: ApplicationSpace | "belvedere";
  Icon: Icon;
  name: () => string;
  needsWorkspace: boolean;
}[] = [
  {
    id: "studio",
    Icon: PenNib,
    name: () => msgIn("application", "Studio"),
    needsWorkspace: true,
  },
  {
    id: "workshop",
    Icon: EnvelopeSimple,
    name: () => msgIn("application", "Correspondence"),
    needsWorkspace: true,
  },
  {
    id: "personal",
    Icon: Files,
    name: () => msg("My documents"),
    needsWorkspace: false,
  },
  {
    id: "belvedere",
    Icon: ShieldCheck,
    name: () => "Belvédère",
    needsWorkspace: false,
  },
];

/**
 * Which application the person uses. Studio and Correspondence work in the
 * current workspace; without one they lead to choosing or creating it first.
 */
export function ApplicationSwitcher({
  application,
  hasWorkspace,
  canAccessBelvedere = false,
  preview = false,
}: {
  application: ApplicationSpace | "belvedere";
  hasWorkspace: boolean;
  /** Server-projected hint only; the protected route checks authority again. */
  canAccessBelvedere?: boolean;
  /** The fictional public preview offers no other application. */
  preview?: boolean;
}) {
  const panel = usePanel();
  const current = applications.find((item) => item.id === application)!;
  const label = (
    <>
      <span className="space-switcher-mark" aria-hidden="true">
        <current.Icon size={18} />
      </span>
      <span className="space-switcher-label">
        <strong>{current.name()}</strong>
      </span>
    </>
  );
  if (preview)
    return (
      <div className="space-switcher application-switcher">
        <div className="space-switcher-trigger space-switcher-static">
          {label}
        </div>
      </div>
    );
  return (
    <div
      ref={panel.area}
      className="space-switcher application-switcher"
      onBlur={panel.onBlur}
    >
      <button
        ref={panel.trigger}
        type="button"
        className="space-switcher-trigger"
        aria-expanded={panel.open}
        aria-controls={panel.id}
        aria-label={msg("Application: {0}", current.name())}
        onClick={panel.toggle}
      >
        {label}
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {/* Not a nav element: sidebar navigation styles must not apply here. */}
      <div
        id={panel.id}
        role="navigation"
        className="space-switcher-panel"
        aria-label={msg("Applications")}
        hidden={!panel.open}
      >
        <ul>
          {applications
            .filter((item) => item.id !== "belvedere" || canAccessBelvedere)
            .map((item) => (
              <li key={item.id}>
                <a
                  href={
                    item.id === "belvedere"
                      ? "/belvedere"
                      : `${application === "belvedere" ? "/" : ""}#${item.needsWorkspace && !hasWorkspace ? "/app/services" : spaceHome[item.id]}`
                  }
                  aria-current={item.id === application ? "true" : undefined}
                  onClick={panel.close}
                >
                  <item.Icon size={18} aria-hidden="true" />
                  {item.name()}
                  {item.id === application && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </a>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The workspace Studio and Correspondence work in, and the person's other
 * memberships. Personal documents never depend on it.
 */
export function WorkspaceSwitcher({
  application,
  workspace,
  identity,
  preview = false,
  loadWorkspaces,
  enterWorkspace,
}: {
  application: "workshop" | "studio";
  workspace: SwitcherWorkspace;
  /**
   * Changes with the account, the workspace or its authority. A list read for
   * an earlier identity is never shown, and its late answer is discarded.
   */
  identity: string;
  /** The fictional public preview offers no other workspace. */
  preview?: boolean;
  /** Read when the panel opens for an identity; never on page load. */
  loadWorkspaces: (signal: AbortSignal) => Promise<SwitcherWorkspace[]>;
  enterWorkspace: (id: string, space: "workshop" | "studio") => Promise<void>;
}) {
  const panel = usePanel();
  const [listing, setListing] = useState<{
    identity: string;
    items: SwitcherWorkspace[];
  }>();
  const workspaces = listing?.identity === identity ? listing.items : undefined;
  const reading = useRef<AbortController | null>(null);
  const load = useAction();
  const enter = useAction();
  const groupId = useId();
  // A new identity abandons the read started for the previous one.
  useEffect(
    () => () => {
      reading.current?.abort();
      reading.current = null;
    },
    [identity],
  );
  const read = () => {
    const controller = new AbortController();
    reading.current = controller;
    void load.run(async () => {
      try {
        const items = await loadWorkspaces(controller.signal);
        if (!controller.signal.aborted) setListing({ identity, items });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        if (reading.current === controller) reading.current = null;
      }
    });
  };
  const label = (
    <>
      <span className="space-switcher-mark" aria-hidden="true">
        {initial(workspace.name)}
      </span>
      <span className="space-switcher-label">
        <strong>{workspace.name}</strong>
      </span>
    </>
  );
  if (preview)
    return (
      <div className="space-switcher workspace-switcher">
        <div className="space-switcher-trigger space-switcher-static">
          {label}
        </div>
      </div>
    );
  const others = (workspaces ?? []).filter((item) => item.id !== workspace.id);
  return (
    <div
      ref={panel.area}
      className="space-switcher workspace-switcher"
      onBlur={panel.onBlur}
    >
      <button
        ref={panel.trigger}
        type="button"
        className="space-switcher-trigger"
        aria-expanded={panel.open}
        aria-controls={panel.id}
        aria-label={msg("Workspace: {0}", workspace.name)}
        title={workspace.name}
        onClick={() => {
          if (!panel.open && !workspaces && !reading.current) read();
          panel.toggle();
        }}
      >
        {label}
        <CaretDown size={16} aria-hidden="true" />
      </button>
      <div
        id={panel.id}
        role="navigation"
        className="space-switcher-panel"
        aria-label={msg("Workspaces")}
        hidden={!panel.open}
      >
        <ul>
          <li className="space-switcher-current" aria-current="true">
            <span className="space-switcher-mark" aria-hidden="true">
              {initial(workspace.name)}
            </span>
            {workspace.name}
            <Check size={16} aria-hidden="true" />
          </li>
        </ul>
        {others.length > 0 && (
          <section aria-labelledby={groupId}>
            <p id={groupId} className="space-switcher-group">
              {msg("Other workspaces")}
            </p>
            <ul>
              {others.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={enter.pending}
                    onClick={() =>
                      void enter.run(async () => {
                        try {
                          await enterWorkspace(item.id, application);
                        } catch (error) {
                          // A refused membership is read again before it is offered.
                          setListing(undefined);
                          throw error;
                        }
                      })
                    }
                  >
                    <span className="space-switcher-mark" aria-hidden="true">
                      {initial(item.name)}
                    </span>
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul>
          <li>
            <a href="#/app/services" onClick={panel.close}>
              <Plus size={16} aria-hidden="true" />
              {msg("Create or join a workspace")}
            </a>
          </li>
        </ul>
        <ErrorNotice error={load.error ?? enter.error} focusOnError={false} />
      </div>
    </div>
  );
}
