import { useAdministrationResource } from "./administration-data";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { DataTable, tableTimestamp } from "./data-table";
import { msg } from "./messages";
import {
  api,
  date,
  money,
  isPublicPreview,
  type Channel,
  type Dispatch,
  type Page,
} from "./api";
import { formatLocale, t } from "./locale";
import { CreditBalance, type WelcomeCredit } from "./credit-balance";
import { UsageActivityCalendar } from "./usage-activity";
import {
  ConfirmAction,
  DateTimezone,
  Definition,
  Diagnostics,
  DispatchTable,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  LoadMore,
  RefreshButton,
  useAction,
} from "./components";

// Moved from Correspondence: monthly usage limits and operator diagnostics
// belong to workspace administration.
type UsageItem = {
  channel: Channel;
  period: string;
  mode?: string;
  limit_count: number;
  reserved_count: number;
  confirmed_count: number;
  limit_minor: number;
  reserved_minor: number;
  confirmed_minor: number;
  currency: string;
};
/**
 * Monthly limits and the activity calendar (formerly the Usage page). A page
 * that already has a refresh control drives it through `refreshVersion`.
 */
export function UsageLedger({
  refreshVersion: controlledVersion,
}: {
  refreshVersion?: number;
}) {
  const [ownVersion, setRefreshVersion] = useState(0);
  const refreshVersion = controlledVersion ?? ownVersion;
  const [period, setPeriod] = useState("latest");
  const [knownPeriods, setKnownPeriods] = useState<string[]>([]);
  const [resolvedPeriod, setResolvedPeriod] = useState<string>();
  const resource = useAdministrationResource<{
    items: UsageItem[];
    welcomeCredit?: WelcomeCredit;
    period?: string;
    currentPeriod?: string;
    availablePeriods?: string[];
  }>(`/usage?period=${period}`);
  const refreshUsage = resource.refresh;
  useEffect(() => {
    if (controlledVersion) refreshUsage();
  }, [controlledVersion, refreshUsage]);
  useEffect(() => {
    if (resource.data?.availablePeriods)
      setKnownPeriods(resource.data.availablePeriods);
    if (resource.data?.period) setResolvedPeriod(resource.data.period);
  }, [resource.data?.availablePeriods, resource.data?.period]);
  const selectedPeriod =
    resource.data?.period ??
    (period === "latest" ? (resolvedPeriod ?? period) : period);
  const periods =
    resource.data?.availablePeriods ??
    (knownPeriods.length ? knownPeriods : [selectedPeriod]);
  const periodLabel = (value: string) =>
    value === "latest"
      ? t.usage.latest
      : new Intl.DateTimeFormat(formatLocale(), {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${value}-01T00:00:00Z`));
  return (
    <section className="administration-usage">
      <div className="section-toolbar">
        <h2>{t.usage.title}</h2>
        {controlledVersion === undefined && (
          <RefreshButton
            onClick={() => {
              resource.refresh();
              setRefreshVersion((version) => version + 1);
            }}
          />
        )}
      </div>
      <p className="field-hint">{t.usage.intro}</p>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.data?.welcomeCredit && (
        <CreditBalance credit={resource.data.welcomeCredit} />
      )}
      <UsageActivityCalendar refreshVersion={refreshVersion} />
      <h3>{t.usage.monthlyTitle}</h3>
      <Field label={t.usage.period} hint={t.usage.periodHint}>
        <select
          value={selectedPeriod}
          disabled={resource.loading}
          onChange={(event) => setPeriod(event.target.value)}
        >
          {periods.map((value) => (
            <option key={value} value={value}>
              {periodLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.error && !resource.data ? null : !resource.data?.items
          .length ? (
        <EmptyState title={t.usage.monthEmpty} />
      ) : (
        <div className="usage-ledger">
          {resource.data.items.map((item) => (
            <section key={`${item.channel}-${item.period}-${item.mode ?? ""}`}>
              <div className="section-toolbar">
                <h2>{t.channels[item.channel]}</h2>
                <span className="mono">{item.period}</span>
              </div>
              <dl>
                <Definition label={t.usage.reserved}>
                  <strong>{item.reserved_count}</strong>
                  <span>{money(item.reserved_minor, item.currency)}</span>
                </Definition>
                <Definition label={t.usage.consumed}>
                  <strong>{item.confirmed_count}</strong>
                  <span>{money(item.confirmed_minor, item.currency)}</span>
                </Definition>
                <Definition label={t.usage.limit}>
                  <strong>{item.limit_count}</strong>
                  <span>{money(item.limit_minor, item.currency)}</span>
                </Definition>
              </dl>
            </section>
          ))}
        </div>
      )}
      <aside className="notice info">
        <ShieldCheck size={24} />
        <p>{t.usage.note}</p>
      </aside>
    </section>
  );
}

/** Channel controls, scanner warm-up, incidents and operator diagnostics. */
export function WorkspaceOperations() {
  const scannerAction = useAction();
  const [scannerMessage, setScannerMessage] = useState("");
  async function warmScanner() {
    setScannerMessage("");
    await scannerAction.run(async () => {
      const response = await api<{ status: string }>("/admin/scanner/warm", {
        method: "POST",
        body: {},
      });
      setScannerMessage(
        response.status === "ready"
          ? msg("PDF analysis is ready.")
          : msg(
              "The service is preparing PDF analysis. Wait a few minutes, then restart the analysis from your document.",
            ),
      );
    });
  }
  const diagnostics = useAdministrationResource<
    Record<string, unknown> & {
      controls?: { channel: Channel; enabled: number }[];
      deadLetters?: {
        id: string;
        dispatch_id: string;
        queue: string;
        received_at: string;
        resolved_at: string | null;
      }[];
    }
  >("/admin");
  const controlAction = useAction();
  const resolutionAction = useAction();
  const resolvingIncident = useRef(false);
  async function resolveIncident(id: string) {
    if (resolvingIncident.current) return;
    resolvingIncident.current = true;
    try {
      await resolutionAction.run(async () => {
        await api(`/admin/dead-letters/${encodeURIComponent(id)}/resolution`, {
          method: "POST",
          body: { confirmed: true },
        });
        diagnostics.refresh();
      });
    } finally {
      resolvingIncident.current = false;
    }
  }
  async function setChannel(channel: Channel, enabled: boolean) {
    await controlAction.run(async () => {
      await api(`/admin/channels/${channel}`, {
        method: "POST",
        body: { enabled },
      });
      diagnostics.refresh();
    });
  }
  // Filtered by the server across the whole organization, not one page.
  const incidentsPath = "/dispatches?group=attention";
  const dispatches = useAdministrationResource<Page<Dispatch>>(incidentsPath);
  const incidents = dispatches.data?.items ?? [];
  return (
    <>
      <div className="section-toolbar">
        <h2>{msg("Operations")}</h2>
        <RefreshButton
          onClick={() => {
            diagnostics.refresh();
            dispatches.refresh();
          }}
        />
      </div>
      <p className="field-hint">{t.admin.intro}</p>
      <ErrorNotice
        error={
          diagnostics.error ??
          dispatches.error ??
          controlAction.error ??
          resolutionAction.error
        }
        retry={diagnostics.refresh}
      />
      {diagnostics.data?.controls && (
        <section className="channel-controls">
          <h2>{t.admin.channelControls}</h2>
          <p>{t.admin.controlsHelp}</p>
          {diagnostics.data.controls.map((control) => (
            <div key={control.channel} className="channel-control">
              <strong>{t.channels[control.channel]}</strong>
              <span
                className={`status ${control.enabled ? "status-active" : "status-pending"}`}
              >
                {control.enabled ? t.admin.enabled : t.admin.paused}
              </span>
              {control.enabled ? (
                <ConfirmAction
                  disabled={controlAction.pending}
                  label={t.admin.pause}
                  ariaLabel={`${t.admin.pause} · ${t.channels[control.channel]}`}
                  question={t.admin.pauseQuestion}
                  confirmLabel={t.admin.pauseConfirm}
                  onConfirm={() => void setChannel(control.channel, false)}
                />
              ) : (
                <button
                  className="button small"
                  disabled={controlAction.pending}
                  onClick={() => void setChannel(control.channel, true)}
                >
                  {t.admin.resume}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {!isPublicPreview && (
        <section className="form-panel">
          <h2>{msg("Document analysis")}</h2>
          <p>
            {msg(
              "Prepare the service before importing your PDFs. Pending documents remain private until verification is complete.",
            )}
          </p>
          <button
            className="button"
            onClick={() => void warmScanner()}
            disabled={scannerAction.pending}
          >
            {scannerAction.pending
              ? msg("Preparing…")
              : msg("Prepare PDF analysis")}
          </button>
          <ErrorNotice error={scannerAction.error} />
          {scannerMessage && <p role="status">{scannerMessage}</p>}
        </section>
      )}
      <h2 className="section-title">{t.admin.uncertain}</h2>
      {dispatches.loading && !dispatches.data ? (
        <Loading />
      ) : incidents.length ? (
        <DispatchTable items={incidents} />
      ) : (
        dispatches.data && <p className="empty-inline">{t.admin.noIncidents}</p>
      )}
      <LoadMore
        path={incidentsPath}
        data={dispatches.data}
        onLoaded={dispatches.setData}
      />
      <div className="notice warning">
        <WarningCircle size={24} />
        <p>{t.admin.note}</p>
      </div>
      <section className="dead-letters">
        <h2 className="section-title">{t.admin.deadLetters}</h2>
        {!!diagnostics.data?.deadLetters?.length && <DateTimezone />}
        {diagnostics.data?.deadLetters?.length ? (
          <DataTable
            label={t.admin.deadLetters}
            items={diagnostics.data.deadLetters}
            getRowKey={(receipt) => receipt.id}
            columns={[
              {
                id: "id",
                label: t.identifier,
                value: (receipt) => receipt.id,
                render: (receipt) => <code>{receipt.id}</code>,
              },
              {
                id: "queue",
                label: t.admin.queue,
                value: (receipt) => receipt.queue,
                render: (receipt) => <code>{receipt.queue}</code>,
              },
              {
                id: "created",
                label: t.created,
                value: (receipt) => tableTimestamp(receipt.received_at),
                searchValue: (receipt) => date(receipt.received_at),
                render: (receipt) => date(receipt.received_at),
                className: "date-cell",
              },
              {
                id: "resolution",
                label: t.status,
                value: (receipt) =>
                  receipt.resolved_at ? msg("Resolved") : msg("Unresolved"),
                render: (receipt) =>
                  receipt.resolved_at ? (
                    <time dateTime={receipt.resolved_at}>
                      {msg("Resolved")} · {date(receipt.resolved_at)}
                    </time>
                  ) : (
                    msg("Unresolved")
                  ),
              },
              {
                id: "actions",
                label: t.actions,
                value: () => "",
                sortable: false,
                render: (receipt) => (
                  <div className="row-actions">
                    <a
                      className="text-link"
                      href={`#/app/dispatch/${receipt.dispatch_id}`}
                    >
                      {t.admin.inspectJob}
                      <ArrowRight size={17} />
                    </a>
                    {!receipt.resolved_at && (
                      <ConfirmAction
                        disabled={resolutionAction.pending || isPublicPreview}
                        label={msg("Resolve incident")}
                        ariaLabel={`${msg("Resolve incident")} · ${receipt.id}`}
                        question={msg(
                          "Resolve this queue incident after reviewing the original dispatch? No communication will be sent.",
                        )}
                        confirmLabel={msg("Resolve incident")}
                        onConfirm={() => void resolveIncident(receipt.id)}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          diagnostics.data && (
            <p className="empty-inline">{t.admin.noDeadLetters}</p>
          )
        )}
      </section>
      <section className="operations-diagnostics">
        <h2>{t.admin.state}</h2>
        {diagnostics.loading && !diagnostics.data ? (
          <Loading />
        ) : (
          <Diagnostics value={diagnostics.data} />
        )}
      </section>
    </>
  );
}
