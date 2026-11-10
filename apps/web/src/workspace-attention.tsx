import type {
  AttentionItem,
  AttentionQueue,
} from "../../../packages/contracts/src/attention";
import { date } from "./api";
import {
  ErrorNotice,
  Loading,
  LoadMore,
  useRefreshOnFocus,
  useResource,
} from "./components";
import { msg } from "./messages";
import { useLocale } from "./locale";
import "./lifecycle-pages.css";

function attentionLabel(kind: AttentionItem["kind"]) {
  return {
    approval: msg("Waiting for approval"),
    quote_expiring: msg("Quote expiring soon"),
    submission_unknown: msg("Outcome needs reconciliation"),
    protected_expiring: msg("Protected link expiring soon"),
    schedule_blocked: msg("Schedule blocked"),
  }[kind];
}

export function useWorkspaceAttention(enabled = true) {
  const queue = useResource<AttentionQueue>(enabled ? "/attention" : null);
  useRefreshOnFocus(queue.refresh, enabled);
  return queue;
}

/** The server selects and orders all visible work, independently of list pages. */
export function WorkspaceAttention({
  queue,
}: {
  queue: ReturnType<typeof useWorkspaceAttention>;
}) {
  useLocale();
  return (
    <section
      className="panel lifecycle-attention"
      aria-labelledby="workspace-attention-title"
      aria-busy={queue.loading || undefined}
    >
      <div className="lifecycle-section-heading">
        <h2 id="workspace-attention-title">{msg("Needs attention")}</h2>
        <button
          type="button"
          className="button subtle small"
          onClick={queue.refresh}
          disabled={queue.loading}
        >
          {msg("Refresh")}
        </button>
      </div>
      <ErrorNotice
        error={queue.error}
        retry={queue.refresh}
        focusOnError={false}
      />
      {!queue.data && queue.loading && <Loading />}
      {queue.data?.items.length === 0 && (
        <p className="muted">{msg("Nothing needs attention.")}</p>
      )}
      {queue.data && queue.data.items.length > 0 && (
        <ul className="lifecycle-attention-list">
          {queue.data.items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${/^\/app(?:\/[A-Za-z0-9_-]+)*$/.test(item.route) ? item.route : "/app/dispatches"}`}
              >
                <span>
                  {attentionLabel(item.kind)}
                  <small className="muted">{item.resourceId}</small>
                </span>
                {item.expiresAt && (
                  <time dateTime={item.expiresAt}>{date(item.expiresAt)}</time>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        path="/attention"
        data={queue.data}
        onLoaded={(page) =>
          queue.setData((current) => ({
            ...page,
            observedAt: current?.observedAt ?? new Date().toISOString(),
          }))
        }
      />
    </section>
  );
}
