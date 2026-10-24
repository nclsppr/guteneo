import { useState } from "react";
import type { SecureAuditEvent } from "../../../packages/contracts/src/secure-distribution";
import { date } from "./api";
import { ErrorNotice, useAction } from "./components";
import { msg } from "./messages";
import { secureAuditLabel } from "./secure-audit";

type AuditPage = { items: SecureAuditEvent[]; nextCursor: string | null };

/** Older pages are retained while a visible workshop receives fresh events.
 * Its owner remounts this history after an explicit refresh or a hidden tab
 * resumes, so a long pause cannot leave a gap between two snapshots. */
export function SecureAuditHistory({
  events,
  nextCursor,
  getOlder,
}: {
  events: SecureAuditEvent[];
  nextCursor?: string | null;
  getOlder: (cursor: string) => Promise<AuditPage>;
}) {
  const [older, setOlder] = useState<AuditPage>();
  const action = useAction();
  const unique = new Map(
    [...events, ...(older?.items ?? [])].map((event) => [event.id, event]),
  );
  const items = [...unique.values()].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
  const cursor = older ? older.nextCursor : nextCursor;
  async function load() {
    if (!cursor) return;
    await action.run(async () => {
      const result = await getOlder(cursor);
      setOlder({
        items: [...items, ...result.items],
        nextCursor: result.nextCursor,
      });
    });
  }
  return (
    <>
      <p className="field-hint">
        {msg(
          "Detailed access events are retained for 90 days. Approval, billing and delivery receipts have their own retention periods.",
        )}
      </p>
      <p className="field-hint">
        {msg(
          "Names identify Guteneo accounts and do not certify the physical identity of the person.",
        )}
      </p>
      {items.length ? (
        <ol className="secure-document-audit">
          {items.map((event) => (
            <li key={event.id}>
              <strong>{secureAuditLabel(event.type)}</strong>
              <time dateTime={event.createdAt}>{date(event.createdAt)}</time>
              {(event.actorName || event.actorUserId) && (
                <small>
                  {msg(
                    "Signed-in account: {0}",
                    event.actorName || event.actorUserId || "",
                  )}
                </small>
              )}
              {event.page && <small>{msg("Page {0}", event.page)}</small>}
              {event.provenance === "browser" && (
                <small>{msg("Source: browser report")}</small>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>{msg("No events available.")}</p>
      )}
      {cursor && (
        <button
          className="button"
          type="button"
          disabled={action.pending}
          onClick={() => void load()}
        >
          {action.pending ? msg("Loading…") : msg("Show earlier events")}
        </button>
      )}
      <ErrorNotice error={action.error} />
    </>
  );
}
