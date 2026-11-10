import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKey,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import type {
  PersonalDocumentItem,
  SecureDocumentKind,
} from "../../../packages/contracts/src/secure-distribution";
import {
  personalDocumentSorts,
  personalDocumentStatusFilters,
  type PersonalDocumentCounts,
  type PersonalDocumentSort,
  type PersonalDocumentStatusFilter,
  type PersonalDocumentSummary,
} from "../../../packages/contracts/src/personal-documents";
import { sessionAuthorityKey, ApiError, date } from "./api";
import {
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
} from "./components";
import { formatLocale } from "./locale";
import { msg } from "./messages";
import { personalApi, type PersonalSession } from "./personal-api";
import { PersonalSecurityNotice } from "./personal-space";
import {
  needsAuthentication,
  personalDocumentStatus,
} from "./personal-document-status";
import "./personal-documents.css";

const PAGE_SIZES = [25, 50] as const;
const DEFAULT_PAGE_SIZE = 25;

/** The list state lives in the address so Back and reload keep the same view. */
export type PersonalDocumentQuery = {
  kind: SecureDocumentKind;
  search: string;
  status?: PersonalDocumentStatusFilter;
  sender?: string;
  sort: PersonalDocumentSort;
  size: number;
};

export function readPersonalDocumentQuery(
  params: URLSearchParams,
): PersonalDocumentQuery {
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "";
  const size = Number(params.get("size"));
  const sender = params.get("sender") ?? "";
  return {
    kind: params.get("kind") === "personal" ? "personal" : "shared",
    search: (params.get("q") ?? "").slice(0, 200),
    status: (personalDocumentStatusFilters as readonly string[]).includes(
      status,
    )
      ? (status as PersonalDocumentStatusFilter)
      : undefined,
    sender: sender && sender.length <= 200 ? sender : undefined,
    sort: (personalDocumentSorts as readonly string[]).includes(sort)
      ? (sort as PersonalDocumentSort)
      : "recent",
    size: (PAGE_SIZES as readonly number[]).includes(size)
      ? size
      : DEFAULT_PAGE_SIZE,
  };
}

export function personalDocumentRoute(
  query: PersonalDocumentQuery,
  change: Partial<PersonalDocumentQuery> = {},
) {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.kind === "personal") params.set("kind", "personal");
  if (next.search) params.set("q", next.search);
  if (next.status) params.set("status", next.status);
  if (next.sender) params.set("sender", next.sender);
  if (next.sort !== "recent") params.set("sort", next.sort);
  if (next.size !== DEFAULT_PAGE_SIZE) params.set("size", String(next.size));
  return `/app/my-documents${params.size ? `?${params}` : ""}`;
}

type ListPage = {
  items: PersonalDocumentItem[];
  nextCursor: string | null;
  /** Absent from earlier servers; the list then shows no overall count. */
  total?: number;
};

const count = (value: number) =>
  new Intl.NumberFormat(formatLocale()).format(value);

function statusFilters(kind: SecureDocumentKind) {
  return [
    { value: "available", label: msg("Available") },
    ...(kind === "shared"
      ? [{ value: "pending", label: msg("Awaiting verification") }]
      : []),
    { value: "expiring", label: msg("Ending soon") },
    { value: "ended", label: msg("Ended") },
  ] as { value: PersonalDocumentStatusFilter; label: string }[];
}
const statusCount = (
  counts: PersonalDocumentCounts,
  status: PersonalDocumentStatusFilter,
) =>
  ({
    available: counts.available,
    pending: counts.pending,
    expiring: counts.expiring,
    ended: counts.ended,
  })[status];

/** The date that matters for a row, phrased for its current state. */
function rowDate(item: PersonalDocumentItem) {
  if (item.status === "revoked") return null;
  if (item.status === "expired")
    return item.kind === "personal"
      ? msg("Retention ended {0}", date(item.expiresAt))
      : msg("Access ended {0}", date(item.expiresAt));
  return item.kind === "personal"
    ? msg("Retained until {0}", date(item.expiresAt))
    : msg("Available until {0}", date(item.expiresAt));
}

export function PersonalDocumentList({
  query,
  session,
  onSessionInvalid,
  active = true,
  revision = 0,
}: {
  query: PersonalDocumentQuery;
  session: PersonalSession;
  onSessionInvalid: () => void;
  /** False while a document is open: the list keeps its page underneath. */
  active?: boolean;
  /** Increments after a change made from a document, to reread this page. */
  revision?: number;
}) {
  const [pageResult, setResult] = useState<ListPage>();
  const [loadedPath, setLoadedPath] = useState<string>();
  // One cursor per visited page; the first page has none.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [summary, setSummary] = useState<PersonalDocumentSummary>();
  const [searchInput, setSearchInput] = useState(query.search);
  const navigation = useAction(
    `${sessionAuthorityKey(session)}:${JSON.stringify(query)}:${active}`,
  );
  const clearNavigationError = navigation.clear;
  const generation = useRef(0);
  const paginationRequest = useRef<AbortController | null>(null);
  const accessDenied = useRef(false);
  // Where the person left the list to open a document, restored on return.
  const opened = useRef<{ id: string; scrollY: number } | null>(null);
  const params = new URLSearchParams({
    kind: query.kind,
    limit: String(query.size),
  });
  if (query.search) params.set("q", query.search);
  if (query.status) params.set("status", query.status);
  if (query.sender) params.set("sender", query.sender);
  if (query.sort !== "recent") params.set("sort", query.sort);
  const listPath = `/personal/documents?${params.toString()}`;
  // A changed filter never lends its predecessor's page or cursor to the new URL.
  const result = loadedPath === listPath ? pageResult : undefined;
  useEffect(() => setSearchInput(query.search), [query.search]);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    accessDenied.current = false;
    setResult(undefined);
    setLoading(true);
    setError(undefined);
    setCursors([null]);
    clearNavigationError();
    personalApi<ListPage>(listPath, session, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted || accessDenied.current) return;
        setLoadedPath(listPath);
        setResult(response);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          accessDenied.current = true;
          setResult(undefined);
          setSummary(undefined);
        }
        setError(cause as Error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      paginationRequest.current?.abort();
      generation.current += 1;
    };
  }, [session, version, listPath, onSessionInvalid, clearNavigationError]);
  useEffect(() => {
    // Counts only; a failure leaves the list itself fully usable.
    const controller = new AbortController();
    personalApi<PersonalDocumentSummary>(
      "/personal/documents/summary",
      session,
      { signal: controller.signal },
    ).then(
      (value) => {
        if (controller.signal.aborted || accessDenied.current) return;
        // An earlier server without the summary answers another shape.
        setSummary(
          value?.shared && value.personal && Array.isArray(value.senders)
            ? value
            : undefined,
        );
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setSummary(undefined);
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          accessDenied.current = true;
          setResult(undefined);
          setCursors([null]);
          setError(cause);
        }
      },
    );
    return () => controller.abort();
  }, [session, version, revision]);
  async function openPage(stack: (string | null)[]) {
    if (loading || navigation.pending || !result || accessDenied.current)
      return;
    const controller = new AbortController();
    paginationRequest.current = controller;
    const current = generation.current;
    await navigation.run(async (view) => {
      try {
        let next: ListPage;
        let nextStack = stack;
        for (;;) {
          const target = nextStack.at(-1) ?? null;
          next = await view.wait(
            personalApi<ListPage>(
              target
                ? `${listPath}&cursor=${encodeURIComponent(target)}`
                : listPath,
              session,
              { signal: controller.signal },
            ),
          );
          if (
            controller.signal.aborted ||
            current !== generation.current ||
            accessDenied.current
          )
            return;
          // Deleting the final copy can remove this page. Walk back through
          // visited cursors until a remaining page or the empty first page.
          if (next.items.length || nextStack.length === 1) break;
          nextStack = nextStack.slice(0, -1);
        }
        setResult(next);
        setCursors(nextStack);
        document
          .getElementById("personal-document-results")
          ?.focus({ preventScroll: false });
      } catch (cause) {
        view.checkpoint();
        if (controller.signal.aborted || current !== generation.current) return;
        // A refused page removes everything already shown for this account.
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          accessDenied.current = true;
          setCursors([null]);
          setResult(undefined);
          setSummary(undefined);
        }
        throw cause;
      } finally {
        if (paginationRequest.current === controller)
          paginationRequest.current = null;
      }
    });
  }
  const reloadPage = useRef(openPage);
  reloadPage.current = openPage;
  const handledRevision = useRef(revision);
  useEffect(() => {
    // A copy saved or deleted from a document changes this page: reread it at
    // the same position instead of returning to the first page.
    if (revision === handledRevision.current) return;
    handledRevision.current = revision;
    void reloadPage.current(cursors);
    // Only a new revision rereads; the cursor stack is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  useEffect(() => {
    if (!active || !opened.current) return;
    const { id, scrollY } = opened.current;
    opened.current = null;
    // After the route's own scroll and focus reset, return to the row.
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      document
        .querySelector<HTMLElement>(`[data-document-link="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const listError = error ?? navigation.error;
  const visibleItems = result?.items.filter((item) => item.kind === query.kind);
  const pageNumber = cursors.length;
  const pageCount =
    result?.total !== undefined
      ? Math.max(1, Math.ceil(result.total / query.size))
      : undefined;
  const firstShown = (pageNumber - 1) * query.size + 1;
  const counts = summary?.[query.kind];
  const senders = summary?.senders ?? [];
  const filtered = Boolean(query.search || query.status || query.sender);
  return (
    <div className="secure-document-layout" hidden={!active}>
      <PageHeading
        title={msg("My documents")}
        action={<RefreshButton onClick={() => setVersion((n) => n + 1)} />}
      />
      <nav
        className="secure-document-tabs"
        aria-label={msg("Document categories")}
      >
        {(["shared", "personal"] as const).map((kind) => (
          <a
            key={kind}
            href={`#${personalDocumentRoute(query, { kind, status: undefined, sender: undefined })}`}
            aria-current={query.kind === kind ? "page" : undefined}
          >
            {kind === "shared" ? msg("Shared with me") : msg("Saved copies")}
            {summary && (
              // The visible total repeats the category summary announced below.
              <span className="personal-document-count" aria-hidden="true">
                {count(summary[kind].total)}
              </span>
            )}
          </a>
        ))}
      </nav>
      <p className="secure-document-intro">
        {query.kind === "shared"
          ? msg(
              "These documents remain under the sender’s control. Access may expire or be revoked.",
            )
          : msg(
              "These copies were delivered to you for the stated retention period. The workspace can no longer withdraw them.",
            )}
      </p>
      {counts && counts.total > 0 && (
        <nav
          className="personal-document-states"
          aria-label={msg("Filter by status")}
        >
          <a
            href={`#${personalDocumentRoute(query, { status: undefined })}`}
            aria-current={!query.status ? "true" : undefined}
          >
            {msg("All")} <strong>{count(counts.total)}</strong>
          </a>
          {statusFilters(query.kind).map((filter) => (
            <a
              key={filter.value}
              href={`#${personalDocumentRoute(query, { status: filter.value })}`}
              aria-current={query.status === filter.value ? "true" : undefined}
            >
              {filter.label}{" "}
              <strong>{count(statusCount(counts, filter.value))}</strong>
            </a>
          ))}
        </nav>
      )}
      <div className="personal-document-toolbar">
        <form
          className="secure-document-search"
          onSubmit={(event) => {
            event.preventDefault();
            go(personalDocumentRoute(query, { search: searchInput.trim() }));
          }}
          role="search"
        >
          <Field label={msg("Search my documents")}>
            <input
              type="search"
              value={searchInput}
              maxLength={200}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </Field>
          <button className="button" type="submit">
            {msg("Search")}
          </button>
        </form>
        <div className="personal-document-controls">
          <Field label={msg("Sender")}>
            <select
              value={query.sender ?? ""}
              onChange={(event) =>
                go(
                  personalDocumentRoute(query, {
                    sender: event.target.value || undefined,
                  }),
                )
              }
            >
              <option value="">{msg("All senders")}</option>
              {query.sender &&
                !senders.some((sender) => sender.name === query.sender) && (
                  <option value={query.sender}>{query.sender}</option>
                )}
              {senders.map((sender) => (
                <option key={sender.name} value={sender.name}>
                  {msg("{0} ({1})", sender.name, count(sender.documents))}
                </option>
              ))}
            </select>
          </Field>
          <Field label={msg("Sort by")}>
            <select
              value={query.sort}
              onChange={(event) =>
                go(
                  personalDocumentRoute(query, {
                    sort: event.target.value as PersonalDocumentSort,
                  }),
                )
              }
            >
              <option value="recent">{msg("Most recent first")}</option>
              <option value="oldest">{msg("Oldest first")}</option>
              <option value="expiry">{msg("Ending soonest")}</option>
              <option value="title">{msg("Title A–Z")}</option>
            </select>
          </Field>
          <Field label={msg("Documents per page")}>
            <select
              value={query.size}
              onChange={(event) =>
                go(
                  personalDocumentRoute(query, {
                    size: Number(event.target.value),
                  }),
                )
              }
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      {needsAuthentication(listError) ? (
        <PersonalSecurityNotice mode={session.documentAccessMode} />
      ) : (
        <ErrorNotice error={listError} retry={() => setVersion((n) => n + 1)} />
      )}
      {listError instanceof ApiError && listError.status === 401 && (
        <button className="button" type="button" onClick={onSessionInvalid}>
          {msg("Sign in to my account")}
        </button>
      )}
      {result?.total !== undefined && visibleItems?.length ? (
        <p
          id="personal-document-results"
          className="personal-document-range"
          role="status"
          tabIndex={-1}
        >
          {msg(
            "Documents {0}–{1} of {2}",
            count(firstShown),
            count(firstShown + visibleItems.length - 1),
            count(result.total),
          )}
        </p>
      ) : null}
      {loading && !result ? (
        <Loading />
      ) : visibleItems?.length ? (
        <ul
          className="secure-document-list personal-document-rows"
          aria-busy={navigation.pending || loading}
        >
          {visibleItems.map((item) => (
            <li key={item.id}>
              <div>
                <h2 id={`personal-document-${encodeURIComponent(item.id)}`}>
                  {item.status === "pending"
                    ? msg("Document awaiting verification")
                    : item.title}
                </h2>
                <p>{msg("Sender: {0}", item.sender)}</p>
                <div className="personal-document-meta">
                  <span
                    className={`secure-document-tag personal-document-state-${item.status}`}
                  >
                    <LockKey size={14} aria-hidden="true" />
                    {personalDocumentStatus(item.status)}
                  </span>
                  {rowDate(item) && <small>{rowDate(item)}</small>}
                  <small>{msg("Received {0}", date(item.createdAt))}</small>
                </div>
              </div>
              <a
                className="button"
                href={`#/app/my-documents/${encodeURIComponent(item.id)}`}
                data-document-link={item.id}
                aria-describedby={`personal-document-${encodeURIComponent(item.id)}`}
                onClick={() => {
                  opened.current = { id: item.id, scrollY: window.scrollY };
                }}
              >
                {msg("Open the document")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        !listError &&
        !loading &&
        !result?.nextCursor && (
          <EmptyState
            title={
              filtered
                ? msg("No matching documents")
                : query.kind === "personal"
                  ? msg("No saved copies")
                  : msg("No shared documents")
            }
            text={
              filtered
                ? msg("Change the search or filters to see other documents.")
                : query.kind === "personal"
                  ? msg(
                      "You can save a copy when the sending workspace allows it.",
                    )
                  : msg(
                      "Documents assigned to you will appear here once your access has been validated.",
                    )
            }
            action={
              filtered ? (
                <a
                  className="button"
                  href={`#${personalDocumentRoute(query, { search: "", status: undefined, sender: undefined })}`}
                >
                  {msg("Clear filters")}
                </a>
              ) : undefined
            }
          />
        )
      )}
      {result && (pageNumber > 1 || result.nextCursor) && (
        <nav
          className="personal-document-pager"
          aria-label={msg("Document pages")}
        >
          {pageNumber > 1 && (
            <button
              className="button"
              type="button"
              disabled={navigation.pending || loading}
              onClick={() => void openPage(cursors.slice(0, -1))}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              {msg("Previous documents")}
            </button>
          )}
          <span>
            {pageCount
              ? msg("Page {0} of {1}", count(pageNumber), count(pageCount))
              : msg("Page {0}", count(pageNumber))}
          </span>
          {result.nextCursor && (
            <button
              className="button"
              type="button"
              disabled={navigation.pending || loading}
              onClick={() =>
                void openPage([...cursors, result.nextCursor ?? null])
              }
            >
              {navigation.pending ? msg("Loading…") : msg("Next documents")}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </nav>
      )}
      {!session.workspaces.length && (
        <aside className="secure-document-panel personal-document-onboarding">
          <PaperPlaneTilt size={28} aria-hidden="true" />
          <div>
            <h2>{msg("Send your own documents too")}</h2>
            <p>
              {msg(
                "Your account can also send. Create your workspace in one step with this same sign-in: you become its administrator and nothing is sent without your review.",
              )}
            </p>
          </div>
          <a className="button" href="#/app/services?next=%2Fapp%2Fprepare">
            {msg("Create my workspace")}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </aside>
      )}
    </div>
  );
}
