import { CaretDown, Check, Files, Plus } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { spaceHome, type ApplicationSpace } from "./app-routes";
import { ErrorNotice, useAction, useRoute } from "./components";
import { msg, msgIn } from "./messages";
import "./space-switcher.css";

export type SwitcherWorkspace = { id: string; name: string; current: boolean };

function initial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
}

/**
 * Where the person works: the current workspace's Workshop and Studio, personal
 * documents and other workspaces. Identity actions stay in the account menu.
 */
export function SpaceSwitcher({
  space,
  workspace,
  preview = false,
  loadWorkspaces,
  enterWorkspace,
}: {
  space: ApplicationSpace;
  /** The current workspace, whose Workshop and Studio the panel offers. */
  workspace: { id: string; name: string } | null;
  /** The fictional public preview offers no other space. */
  preview?: boolean;
  /** Read only when the panel first opens; never on page load. */
  loadWorkspaces: () => Promise<SwitcherWorkspace[]>;
  enterWorkspace: (id: string, space: "workshop" | "studio") => Promise<void>;
}) {
  const route = useRoute();
  // Opening records the committed route, so navigating away closes the panel.
  const [openOn, setOpenOn] = useState<string>();
  const open = openOn === route;
  const [workspaces, setWorkspaces] = useState<SwitcherWorkspace[]>();
  const load = useAction();
  const enter = useAction();
  const area = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const groupId = useId();
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
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const spaceName =
    space === "personal"
      ? msg("My documents")
      : space === "studio"
        ? msgIn("space", "Studio")
        : msgIn("space", "Workshop");
  const context =
    space === "personal" || !workspace ? msg("Personal space") : workspace.name;
  const mark =
    space === "personal" || !workspace ? (
      <Files size={18} aria-hidden="true" />
    ) : (
      initial(workspace.name)
    );
  if (preview)
    return (
      <div className="space-switcher">
        <div className="space-switcher-trigger space-switcher-static">
          <span className="space-switcher-mark" aria-hidden="true">
            {mark}
          </span>
          <span className="space-switcher-label">
            <strong>{spaceName}</strong>
            <small>{context}</small>
          </span>
        </div>
      </div>
    );
  const others = (workspaces ?? []).filter(
    (item) => !item.current && item.id !== workspace?.id,
  );
  const target = space === "studio" ? "studio" : "workshop";
  return (
    <div
      ref={area}
      className="space-switcher"
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
        className="space-switcher-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={msg("Switch space: {0}, {1}", spaceName, context)}
        onClick={() => {
          if (open) return close();
          setOpenOn(route);
          if (!workspaces && !load.pending)
            void load.run(async () => setWorkspaces(await loadWorkspaces()));
        }}
      >
        <span className="space-switcher-mark" aria-hidden="true">
          {mark}
        </span>
        <span className="space-switcher-label">
          <strong>{spaceName}</strong>
          <small>{context}</small>
        </span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {/* Not a nav element: sidebar navigation styles must not apply here. */}
      <div
        id={panelId}
        role="navigation"
        className="space-switcher-panel"
        aria-label={msg("Spaces")}
        hidden={!open}
      >
        {workspace && (
          <section aria-labelledby={groupId}>
            <p id={groupId} className="space-switcher-group">
              {workspace.name}
            </p>
            <ul>
              {(["workshop", "studio"] as const).map((item) => (
                <li key={item}>
                  <a
                    href={`#${spaceHome[item]}`}
                    aria-current={space === item ? "true" : undefined}
                    onClick={close}
                  >
                    {item === "studio"
                      ? msgIn("space", "Studio")
                      : msgIn("space", "Workshop")}
                    {space === item && <Check size={16} aria-hidden="true" />}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul>
          <li>
            <a
              href={`#${spaceHome.personal}`}
              aria-current={space === "personal" ? "true" : undefined}
              onClick={close}
            >
              {msg("My documents")}
              {space === "personal" && <Check size={16} aria-hidden="true" />}
            </a>
          </li>
        </ul>
        {others.length > 0 && (
          <section aria-labelledby={`${groupId}-others`}>
            <p id={`${groupId}-others`} className="space-switcher-group">
              {msg("Other workspaces")}
            </p>
            <ul>
              {others.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={enter.pending}
                    onClick={() =>
                      void enter.run(() => enterWorkspace(item.id, target))
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
            <a href="#/app/services" onClick={close}>
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
