import { msg } from "./messages";
import { StatTile } from "./activity-chart";
import { studioRoutes } from "./app-routes";
import { WorkspaceContacts } from "./workspace-contacts";
import {
  WorkspaceAttention,
  useWorkspaceAttention,
} from "./workspace-attention";
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { type DispatchOverview } from "../../../packages/contracts/src/dispatch-groups";
import { ArrowRight, Plus, WarningCircle } from "@phosphor-icons/react";
import {
  getSessionAuthorityKey,
  subscribeSessionAuthority,
  permissionsFor,
  isPublicPreview,
  type Dispatch,
  type Page,
  type Session,
} from "./api";
import { OverviewAssistantStart } from "./assistant-workspace";
import { useAssistantConnections, useDirectChoice } from "./assistant-state";
import { t } from "./locale";
import {
  DispatchTable,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
  useRefreshOnFocus,
  useResource,
} from "./components";

type OverviewLayout = "pending" | "empty" | "active" | "recovery";

export function Overview({ session }: { session: Session }) {
  const permissions = permissionsFor(session);
  const authority = useSyncExternalStore(
    subscribeSessionAuthority,
    getSessionAuthorityKey,
    getSessionAuthorityKey,
  );
  const [layout, setLayout] = useState<{
    authority: string;
    mode: OverviewLayout;
  }>({
    authority,
    mode: "pending",
  });
  const mode = layout.authority === authority ? layout.mode : "pending";
  const directChoice = useDirectChoice(session);
  const connections = useAssistantConnections(
    permissions.prepareDispatches &&
      (mode === "pending" || mode === "empty") &&
      !directChoice.direct,
  );
  const overview = useResource<DispatchOverview>(
    permissions.viewReports ? "/overview" : null,
  );
  const dispatches = useResource<Page<Dispatch>>("/dispatches?limit=6");
  const attentionQueue = useWorkspaceAttention(!isPublicPreview);
  const [attentionReadyOwner, setAttentionReadyOwner] = useState<string | null>(
    null,
  );
  const attentionReadSettled =
    !attentionQueue.loading ||
    Boolean(attentionQueue.data || attentionQueue.error);
  useEffect(() => {
    if (attentionReadSettled && authority === getSessionAuthorityKey())
      setAttentionReadyOwner(authority);
  }, [authority, attentionReadSettled]);
  const initialAttentionPending = attentionReadyOwner !== authority;
  const refreshOverview = overview.refresh;
  const refreshDispatches = dispatches.refresh;
  const refresh = useCallback(() => {
    refreshOverview();
    refreshDispatches();
  }, [refreshOverview, refreshDispatches]);
  useRefreshOnFocus(refresh);
  const counts = overview.data;
  const attention = counts?.dispatches.attention ?? 0;
  const hasDispatches =
    (counts?.dispatches.total ?? 0) > 0 ||
    (dispatches.data?.items.length ?? 0) > 0;
  const initialReadPending =
    (overview.loading && !overview.data && !overview.error) ||
    (dispatches.loading && !dispatches.data && !dispatches.error);
  const initialReadFailed = Boolean(overview.error || dispatches.error);
  const introductionPending =
    permissions.prepareDispatches &&
    !directChoice.direct &&
    connections.loading &&
    !connections.data &&
    !connections.error;
  const nextLayout: OverviewLayout = initialReadPending
    ? "pending"
    : initialReadFailed
      ? "recovery"
      : hasDispatches
        ? "active"
        : introductionPending
          ? "pending"
          : "empty";
  useEffect(() => {
    if (authority !== getSessionAuthorityKey()) return;
    setLayout((current) => {
      if (current.authority === authority && current.mode !== "pending")
        return current;
      if (current.authority === authority && current.mode === nextLayout)
        return current;
      return { authority, mode: nextLayout };
    });
  }, [authority, nextLayout]);
  // The first resolved order belongs to this authority and visit. Revalidation
  // keeps that order while counts, errors and permission checks stay live.
  const dailyOverview = mode === "active" || mode === "recovery";
  const stats = [
    {
      href: "#/app/documents",
      label: t.overview.documents,
      value: counts?.documents,
    },
    {
      href: "#/app/dispatches?group=approval",
      label: t.overview.waiting,
      value: counts?.dispatches.approval,
    },
    {
      href: "#/app/dispatches?group=attention",
      label: t.overview.attention,
      value: counts?.dispatches.attention,
      warning: attention > 0,
    },
    {
      href: "#/app/dispatches",
      label: t.overview.tracked,
      value: counts?.dispatches.total,
    },
  ];
  const contacts = (
    <WorkspaceContacts key="contacts" session={session} compact />
  );
  const legacyAttentionNotice = attention > 0 && !permissions.viewReports && (
    <div
      key="attention"
      className="notice warning overview-attention"
      role="status"
    >
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.overview.attentionTitle}</strong>
        <p>{t.overview.attentionBody}</p>
        <a className="text-link" href="#/app/dispatches?group=attention">
          {t.overview.attentionAction}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
  const attentionNotice = isPublicPreview ? (
    legacyAttentionNotice
  ) : (
    <WorkspaceAttention key="attention" queue={attentionQueue} />
  );
  const assistantStart =
    permissions.prepareDispatches &&
    (dailyOverview ? (
      <div className="dashboard-daily-shortcuts" key="assistant">
        <a className="text-link" href="#/app/connection">
          {msg("View my connections")}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    ) : (
      <OverviewAssistantStart
        key="assistant"
        connections={connections}
        direct={directChoice.direct}
        chooseDirect={directChoice.chooseDirect}
      />
    ));
  const studioLinks = !isPublicPreview && permissions.prepareDispatches && (
    <nav
      key="studio"
      className="studio-entry-links"
      aria-label={msg("Create personalised documents")}
    >
      <a className="button" href={`#${studioRoutes.templates}?new=blank`}>
        {msg("Create a document")} <ArrowRight size={17} />
      </a>
      <a className="button" href={`#${studioRoutes.templates}`}>
        {msg("Use a template")} <ArrowRight size={17} />
      </a>
      <a className="button" href={`#${studioRoutes.datasets}`}>
        {msg("Import my data")} <ArrowRight size={17} />
      </a>
    </nav>
  );
  const summary = (
    <Fragment key="summary">
      {permissions.viewReports && (
        <ul className="overview-stats" aria-label={t.overview.statsLabel}>
          {stats.map((stat) => (
            <li key={stat.href}>
              <a
                href={stat.href}
                className={stat.warning ? "stat-warning" : undefined}
              >
                <StatTile
                  label={stat.label}
                  value={stat.value ?? "·"}
                  variant="plain"
                  tone={stat.warning ? "warning" : "neutral"}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Fragment>
  );
  const activity = (
    <Fragment key="activity">
      <div className="section-toolbar">
        <h2>{t.overview.recent}</h2>
        <a href="#/app/dispatches" className="text-link">
          {t.overview.all}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
      {dispatches.loading && !dispatches.data ? (
        <Loading />
      ) : dispatches.data?.items.length ? (
        <DispatchTable
          items={dispatches.data.items.slice(0, 6)}
          className="overview-recent"
        />
      ) : dispatches.error ? null : (
        <EmptyState
          title={t.overview.emptyTitle}
          text={t.overview.emptyBody}
          action={
            permissions.prepareDispatches && (
              <a className="button" href="#/app/documents">
                {t.documents.import}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            )
          }
        />
      )}
    </Fragment>
  );
  const readError = (
    <ErrorNotice
      key="errors"
      error={overview.error ?? dispatches.error}
      retry={refresh}
    />
  );
  const details = (
    <div key="details" hidden={initialAttentionPending}>
      {activity}
      {dailyOverview && assistantStart}
      {studioLinks}
      {contacts}
    </div>
  );
  // Summary links precede asynchronously growing panels. Empty workspaces keep
  // their initial assistant choice first (docs/ASSISTANT_HUB.md). Children mount
  // while hidden so their independent reads still start in parallel. Recent
  // links wait for the attention panel's first height; refresh keeps them mounted.
  const regions = dailyOverview
    ? [summary, readError, attentionNotice, details]
    : [assistantStart, summary, readError, attentionNotice, details];
  return (
    <>
      <div className="dashboard-editorial-heading">
        <PageHeading
          title={t.nav.overview}
          action={
            permissions.prepareDispatches && (
              <a
                className="button primary heading-new-dispatch"
                href="#/app/prepare"
              >
                <Plus size={18} aria-hidden="true" />
                {t.dispatch.new}
              </a>
            )
          }
        />
      </div>
      {mode === "pending" && <Loading />}
      <div hidden={mode === "pending"} data-overview-layout={mode}>
        {regions}
      </div>
    </>
  );
}
