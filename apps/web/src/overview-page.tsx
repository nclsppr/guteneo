import { msg } from "./messages";
import { studioRoutes } from "./app-routes";
import { WorkspaceContacts } from "./workspace-contacts";
import { WorkspaceAttention } from "./workspace-attention";
import { Fragment, useCallback } from "react";
import { type DispatchOverview } from "../../../packages/contracts/src/dispatch-groups";
import { ArrowRight, Plus, WarningCircle } from "@phosphor-icons/react";
import {
  permissionsFor,
  isPublicPreview,
  type Dispatch,
  type Page,
  type Session,
} from "./api";
import { OverviewAssistantStart } from "./assistant-workspace";
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

export function Overview({ session }: { session: Session }) {
  const permissions = permissionsFor(session);
  const overview = useResource<DispatchOverview>(
    permissions.viewReports ? "/overview" : null,
  );
  const dispatches = useResource<Page<Dispatch>>("/dispatches?limit=6");
  const refreshOverview = overview.refresh;
  const refreshDispatches = dispatches.refresh;
  const refresh = useCallback(() => {
    refreshOverview();
    refreshDispatches();
  }, [refreshOverview, refreshDispatches]);
  useRefreshOnFocus(refresh);
  const counts = overview.data;
  const attention = counts?.dispatches.attention ?? 0;
  const dailyOverview =
    (counts?.dispatches.total ?? 0) > 0 ||
    (dispatches.data?.items.length ?? 0) > 0;
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
  const legacyAttentionNotice = attention > 0 && (
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
    <WorkspaceAttention key="attention" />
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
      <OverviewAssistantStart key="assistant" session={session} />
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
  const activity = (
    <Fragment key="activity">
      {permissions.viewReports && (
        <ul className="overview-stats" aria-label={t.overview.statsLabel}>
          {stats.map((stat) => (
            <li key={stat.href}>
              <a
                href={stat.href}
                className={stat.warning ? "stat-warning" : undefined}
              >
                <span>{stat.label}</span>
                <strong>{stat.value ?? "·"}</strong>
              </a>
            </li>
          ))}
        </ul>
      )}
      <ErrorNotice error={overview.error ?? dispatches.error} retry={refresh} />
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
        <DispatchTable items={dispatches.data.items.slice(0, 6)} />
      ) : (
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
  // Keyed regions move without remounting the contact directory. Existing
  // workshops lead with their work; classic and empty workshops retain the
  // full introductory order (docs/ASSISTANT_HUB.md).
  const regions = dailyOverview
    ? [attentionNotice, activity, assistantStart, studioLinks, contacts]
    : [contacts, attentionNotice, assistantStart, studioLinks, activity];
  return (
    <>
      <div className="dashboard-editorial-heading">
        <PageHeading
          title={t.overview.title}
          intro={t.overview.intro}
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
      {regions}
    </>
  );
}
