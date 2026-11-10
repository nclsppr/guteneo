import { useEffect, useSyncExternalStore } from "react";
import { X } from "@phosphor-icons/react";
import { msg } from "./messages";

/**
 * Outcomes of actions that finished after the person left the page that
 * started them. The abandoned view is never touched (see
 * client-write-recovery.ts); the tray says what happened and links to the
 * object. Text is fixed product copy: no content, recipient or identifier
 * other than the address of the object the person already opened.
 */
type Outcome = { id: number; text: string; path?: string };

const MAX_OUTCOMES = 4;
let outcomes: readonly Outcome[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const publish = (next: readonly Outcome[]) => {
  outcomes = next;
  for (const listener of listeners) listener();
};

export function announceLateOutcome(text: string, path?: string) {
  publish([...outcomes, { id: nextId++, text, path }].slice(-MAX_OUTCOMES));
}

export function OutcomeTray() {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => outcomes,
  );
  // Mounted per signed-in identity: another account starts with an empty tray.
  useEffect(() => () => publish([]), []);
  return (
    <div className="outcome-tray" role="status" aria-live="polite">
      {items.map((item) => (
        <div className="outcome-tray-item" key={item.id}>
          <p>{item.text}</p>
          {item.path && (
            <a
              className="text-link"
              href={`#${item.path}`}
              onClick={() =>
                publish(outcomes.filter((other) => other.id !== item.id))
              }
            >
              {msg("Open")}
            </a>
          )}
          <button
            type="button"
            className="outcome-tray-dismiss"
            aria-label={msg("Close")}
            onClick={() =>
              publish(outcomes.filter((other) => other.id !== item.id))
            }
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
