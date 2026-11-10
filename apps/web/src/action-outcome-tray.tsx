import { useEffect, useRef, useSyncExternalStore } from "react";
import { Bell, ArrowRight, X } from "@phosphor-icons/react";
import { msg } from "./messages";
import { useLocale } from "./locale";
import {
  clearActionOutcomes,
  dismissActionOutcome,
  getActionOutcomes,
  getServerActionOutcomes,
  subscribeActionOutcomes,
  type ActionOutcomeReceipt,
} from "./action-outcomes";
import "./workspace-tools.css";

function outcomeLabel(item: ActionOutcomeReceipt) {
  switch (item.kind) {
    case "access_revoked":
      return msg("Link access revoked");
    case "dispatch_prepared":
      return msg("Dispatch prepared");
    case "dispatch_cancelled":
      return msg("Dispatch cancelled");
    case "schedule_created":
      return msg("Scheduled dispatch created");
    case "recipient_saved":
      return msg("Recipient saved");
    case "webhook_saved":
      return msg("Webhook saved");
    case "profile_saved":
      return msg("Profile saved");
    case "updated":
      return msg("Update saved");
    case "saved":
      return item.route.includes("/template/")
        ? msg("Template saved")
        : item.route.includes("/generation/")
          ? msg("Generation created")
          : item.route.includes("/documents/")
            ? msg("Document saved")
            : msg("Changes saved");
  }
}

/** Workspace receipt references live in memory and never restore an old view. */
export function ActionOutcomeTray() {
  useLocale();
  const items = useSyncExternalStore(
    subscribeActionOutcomes,
    getActionOutcomes,
    getServerActionOutcomes,
  );
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node))
        panel.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.current?.open) {
        panel.current.open = false;
        panel.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="action-outcomes" ref={panel}>
      <summary className="button subtle small">
        <Bell size={20} aria-hidden="true" />
        <span>{msg("Action outcomes")}</span>{" "}
        <span className="action-outcomes__count">{items.length}</span>
      </summary>
      <section
        className="action-outcomes__panel"
        aria-label={msg("Action outcomes")}
      >
        <div className="section-toolbar">
          <h2>{msg("Action outcomes")}</h2>
          {!!items.length && (
            <button
              type="button"
              className="button subtle small"
              onClick={clearActionOutcomes}
            >
              {msg("Dismiss all")}
            </button>
          )}
        </div>
        {!items.length ? (
          <p>{msg("No recent outcomes.")}</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.route}`}
                  onClick={() => {
                    if (panel.current) panel.current.open = false;
                  }}
                >
                  <span>{outcomeLabel(item)}</span>
                  <span className="mono reference">{item.resourceId}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className="button subtle small"
                  aria-label={`${msg("Dismiss outcome")}: ${outcomeLabel(item)} ${item.resourceId}`}
                  onClick={() => dismissActionOutcome(item.id)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <span className="sr-only" role="status" aria-live="polite">
        {items[0] ? outcomeLabel(items[0]) : ""}
      </span>
    </details>
  );
}
