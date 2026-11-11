import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  DownloadSimple,
  FileCsv,
  FilePdf,
  MicrosoftExcelLogo,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  AdministrationAuditEntry,
  AdministrationConnections,
  AdministrationConsumption,
  AdministrationDispatch,
  AdministrationExportDataset,
  AdministrationExportFormat,
  AdministrationMember,
  AdministrationOverview,
  AdministrationPage,
} from "../../../packages/contracts/src/administration";
import { ADMINISTRATION_PDF_MAX_ROWS } from "../../../packages/contracts/src/administration";
import { administrationRoutes } from "./app-routes";
import { ActivityChart, BreakdownBars, StatTile } from "./activity-chart";
import { DataTable, tableTimestamp, type DataTableColumn } from "./data-table";
import { auditActionLabel } from "./administration-presentation";
import { date, type Channel } from "./api";
import {
  DateTimezone,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  PageHeading,
  RefreshButton,
  Status,
  useAction,
} from "./components";
import { t } from "./locale";
import { msg, msgIn } from "./messages";
import { roleLabel } from "./role-guide";
import {
  amount,
  useAdministrationResource,
  count,
  day,
  downloadExport,
  month,
  PERIOD_PRESETS,
  presetOf,
  presetPeriod,
  readPeriod,
  validPeriod,
  routeWith,
  type Period,
} from "./administration-data";
import { UsageLedger } from "./administration-operations";

const channelName = (channel: string) =>
  t.channels[channel as Channel] ?? msg("Channel not retained");
const accessName = (kind: string) =>
  ({
    browser: msg("Browser"),
    native: msg("Mobile app"),
    mcp: msg("Assistant connection"),
  })[kind] ?? kind;
const serviceName = (service: string) =>
  ({
    dispatch: msg("Dispatches"),
    pdf_check: msg("PDF checks"),
    secure_distribution: msg("Secure distribution"),
    legacy_plan: msg("Former subscription"),
  })[service] ?? service;

function query(route: string) {
  return new URLSearchParams(route.split("?")[1]);
}
function pageOf(route: string) {
  const page = Number(query(route).get("page"));
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

/** Period presets and an explicit custom range, kept in the address. */
function PeriodControls({
  route,
  path,
  keep = {},
}: {
  route: string;
  path: string;
  keep?: Record<string, string | undefined>;
}) {
  const period = readPeriod(route);
  return (
    <PeriodControlsEditor
      key={`${period.from}:${period.to}`}
      period={period}
      path={path}
      keep={keep}
    />
  );
}

function PeriodControlsEditor({
  period,
  path,
  keep,
}: {
  period: Period;
  path: string;
  keep: Record<string, string | undefined>;
}) {
  const preset = presetOf(period);
  const [custom, setCustom] = useState(period);
  const [invalid, setInvalid] = useState(false);
  const apply = (next: Period) => go(routeWith(path, { ...keep, ...next }));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!validPeriod(custom)) {
      setInvalid(true);
      return;
    }
    apply(custom);
  }
  return (
    <div className="administration-period">
      <div
        className="administration-presets"
        role="group"
        aria-label={msgIn("report-period", "Period")}
      >
        {PERIOD_PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={preset === days}
            onClick={() => apply(presetPeriod(days))}
          >
            {msg("{0} days", days)}
          </button>
        ))}
      </div>
      {/* Presets cover most reads; custom dates open on demand or when in use. */}
      <details
        className="disclosure administration-custom"
        open={preset == null || invalid || undefined}
      >
        <summary>{msg("Custom dates")}</summary>
        <form className="administration-custom-period" onSubmit={submit}>
          <Field label={msg("Start date")}>
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              required
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setInvalid(false);
                setCustom((current) => ({
                  ...current,
                  from: event.target.value,
                }));
              }}
            />
          </Field>
          <Field label={msg("End date")}>
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              required
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setInvalid(false);
                setCustom((current) => ({
                  ...current,
                  to: event.target.value,
                }));
              }}
            />
          </Field>
          <button className="button" type="submit">
            {msg("Apply")}
          </button>
        </form>
        {invalid && (
          <ErrorNotice
            error={new Error(msg("Choose a period of at most 366 days."))}
          />
        )}
        <p className="administration-period-note">
          {msg("A period covers at most 366 days.")}
        </p>
      </details>
    </div>
  );
}

function ReportHeading({
  title,
  intro,
  route,
  path,
  keep,
  refresh,
}: {
  title: string;
  intro?: string;
  route: string;
  path: string;
  keep?: Record<string, string | undefined>;
  refresh?: () => void;
}) {
  return (
    <PageHeading
      title={title}
      intro={intro}
      action={
        <div className="administration-heading-controls">
          <PeriodControls route={route} path={path} keep={keep} />
          {refresh && <RefreshButton onClick={refresh} />}
        </div>
      }
    />
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label: string;
}) {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize < 1)
    return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="administration-pager" aria-label={label}>
      <button
        className="button"
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        {msg("Previous page")}
      </button>
      <span>{msg("Page {0} of {1}", count(page), count(pages))}</span>
      <button
        className="button"
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {msg("Next page")}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}

export function AdministrationOverviewPage({ route }: { route: string }) {
  const period = readPeriod(route);
  const resource = useAdministrationResource<AdministrationOverview>(
    routeWith("/administration/overview", period),
  );
  const data = resource.data;
  return (
    <>
      <ReportHeading
        title={msg("Workspace overview")}
        route={route}
        path={administrationRoutes.home}
        refresh={resource.refresh}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            {/* Dispatches needing attention are the amber figure below; the
                banner keeps only what no figure shows. */}
            {data.incidents.some(
              (incident) => incident.kind === "outbox_delayed",
            ) && (
              <div className="notice warning" role="status">
                <WarningCircle size={24} aria-hidden="true" />
                <p>
                  {data.incidents
                    .filter((incident) => incident.kind === "outbox_delayed")
                    .map((incident) =>
                      msg(
                        "{0} accepted dispatches are waiting to be transmitted.",
                        count(incident.count),
                      ),
                    )
                    .join(" ")}
                </p>
              </div>
            )}
            <div className="administration-stats administration-stats-primary">
              <StatTile
                label={msg("Dispatches")}
                value={count(data.totals.dispatches)}
              >
                {msg("{0} delivered", count(data.totals.delivered))}
              </StatTile>
              <StatTile
                label={msg("Consumption")}
                value={amount(data.totals.consumptionMinor)}
              >
                {msg("{0} reserved", amount(data.totals.reservedMinor))}
              </StatTile>
              <StatTile
                label={msg("Needing attention")}
                value={count(data.totals.attention)}
                tone={data.totals.attention ? "warning" : "neutral"}
                href={
                  data.totals.attention
                    ? `#${routeWith(administrationRoutes.activity, { ...period, group: "attention" })}`
                    : undefined
                }
              >
                {msg("Failed, rejected or uncertain")}
              </StatTile>
              {data.credit && (
                <StatTile
                  label={msg("Promotional credit")}
                  value={amount(data.credit.availableMinor)}
                >
                  {msg("of {0} granted", amount(data.credit.grantedMinor))}
                </StatTile>
              )}
            </div>
            <div className="administration-stats administration-stats-secondary">
              <StatTile
                label={msg("Members")}
                value={count(data.totals.members)}
              >
                {msg("{0} active access", count(data.totals.activeConnections))}
              </StatTile>
              <StatTile
                label={msg("Documents imported")}
                value={count(data.totals.documents)}
              >
                {msg("{0} pages sent", count(data.totals.pages))}
              </StatTile>
              <StatTile
                label={msg("Secure shares")}
                value={count(data.totals.secureShares)}
              >
                {msg("Activated in this period")}
              </StatTile>
            </div>
            {data.trend.length >= 3 && (
              <section className="administration-panel">
                <h2>{msg("Daily activity")}</h2>
                <ActivityChart
                  label={msg("Daily activity")}
                  data={data.trend}
                  formatDate={day}
                  metrics={[
                    {
                      key: "dispatches",
                      label: msg("Dispatches"),
                      format: count,
                    },
                    {
                      key: "consumptionMinor",
                      label: msg("Consumption"),
                      format: amount,
                    },
                    {
                      key: "connections",
                      label: msg("Sign-ins"),
                      format: count,
                    },
                  ]}
                  empty={
                    <p className="empty-inline">
                      {msg("No activity in this period.")}
                    </p>
                  }
                />
              </section>
            )}
            <div className="administration-columns">
              <section className="administration-panel">
                <h2>{msg("Channels")}</h2>
                {data.channels.length ? (
                  <BreakdownBars
                    label={msg("Dispatches by channel")}
                    format={count}
                    items={data.channels.map((row) => ({
                      key: row.channel,
                      label: channelName(row.channel),
                      value: row.dispatches,
                      detail: amount(row.consumptionMinor),
                    }))}
                  />
                ) : (
                  <p className="empty-inline">
                    {msg("No dispatch in this period.")}
                  </p>
                )}
              </section>
              <section className="administration-panel">
                <h2>{msg("States")}</h2>
                {data.statuses.length ? (
                  <ul className="administration-statuses">
                    {data.statuses.map((row) => (
                      <li key={row.status}>
                        <a
                          href={`#${routeWith(administrationRoutes.activity, { ...period, status: row.status })}`}
                        >
                          <Status status={row.status} />
                        </a>
                        <strong>{count(row.dispatches)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-inline">
                    {msg("No dispatch in this period.")}
                  </p>
                )}
              </section>
            </div>
            <p>
              <a
                className="button"
                href={`#${routeWith(administrationRoutes.reports, period)}`}
              >
                <DownloadSimple size={18} aria-hidden="true" />
                {msg("Download this period's report")}
              </a>
            </p>
          </>
        )
      )}
    </>
  );
}

const DISPATCH_STATES = [
  "prepared",
  "queued",
  "submitting",
  "submission_unknown",
  "accepted",
  "delivered",
  "failed",
  "cancelled",
  "bounced",
  "complained",
  "printed",
  "handed_to_post",
];

export function AdministrationActivityPage({ route }: { route: string }) {
  const period = readPeriod(route);
  const params = query(route);
  const channel = params.get("channel") ?? "";
  const status = params.get("status") ?? "";
  const attention = params.get("group") === "attention";
  const reference = params.get("q") ?? "";
  const page = pageOf(route);
  const [search, setSearch] = useState(reference);
  const [hiddenColumns, setHiddenColumns] = useState([
    "pages",
    "destination",
    "reserved",
    "approved",
  ]);
  useEffect(() => setSearch(reference), [reference]);
  const state = {
    ...period,
    channel: channel || undefined,
    status: status || undefined,
    group: attention ? "attention" : undefined,
    q: reference || undefined,
  };
  const resource = useAdministrationResource<
    AdministrationPage<AdministrationDispatch>
  >(routeWith("/administration/activity", { ...state, page, pageSize: 50 }));
  const navigate = (change: Record<string, string | number | undefined>) =>
    go(routeWith(administrationRoutes.activity, { ...state, ...change }));
  return (
    <>
      <ReportHeading
        title={msg("Workspace activity")}
        route={route}
        path={administrationRoutes.activity}
        refresh={resource.refresh}
        keep={{
          channel: channel || undefined,
          status: status || undefined,
          group: attention ? "attention" : undefined,
          q: reference || undefined,
        }}
      />
      <div className="administration-filters">
        <Field label={msg("Channel")}>
          <select
            value={channel}
            onChange={(event) =>
              navigate({ channel: event.target.value || undefined, page: 1 })
            }
          >
            <option value="">{msg("All channels")}</option>
            {(["email", "fax", "postal"] as const).map((value) => (
              <option key={value} value={value}>
                {channelName(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={msg("State")}>
          <select
            value={attention ? "attention" : status}
            onChange={(event) =>
              navigate(
                event.target.value === "attention"
                  ? { status: undefined, group: "attention", page: 1 }
                  : {
                      status: event.target.value || undefined,
                      group: undefined,
                      page: 1,
                    },
              )
            }
          >
            <option value="">{msg("All states")}</option>
            <option value="attention">{msg("Needing attention")}</option>
            {DISPATCH_STATES.map((value) => (
              <option key={value} value={value}>
                {t.statuses[value] ?? value}
              </option>
            ))}
          </select>
        </Field>
        <form
          className="administration-reference"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ q: search.trim() || undefined, page: 1 });
          }}
        >
          <Field label={msg("Dispatch reference")}>
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <button className="button" type="submit">
            {msg("Search")}
          </button>
        </form>
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <>
          <p className="administration-range" role="status">
            {msg("{0} dispatches", count(resource.data.total))}
          </p>
          <DateTimezone />
          <Disclosure
            label={msg("Columns")}
            className="administration-column-picker"
          >
            <div className="administration-column-options">
              {[
                ["pages", msg("Pages")],
                ["destination", msg("Destination")],
                ["reserved", msg("Reserved")],
                ["approved", msg("Approved by")],
              ].map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.includes(id)}
                    onChange={() =>
                      setHiddenColumns((current) =>
                        current.includes(id)
                          ? current.filter((value) => value !== id)
                          : [...current, id],
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Disclosure>
          <DataTable
            viewId="workspace-activity"
            className="administration-table"
            label={msg("Workspace activity")}
            items={resource.data.items}
            getRowKey={(item) => item.id}
            scope="page"
            searchable={false}
            pagination={false}
            columns={(
              [
                {
                  id: "reference",
                  label: msg("Reference"),
                  value: (item) => item.id,
                  rowHeader: true,
                  sortable: false,
                  render: (item) => (
                    <a
                      className="administration-dispatch-link"
                      href={`#/app/dispatch/${encodeURIComponent(item.id)}`}
                    >
                      <code>{item.id}</code>
                    </a>
                  ),
                },
                {
                  id: "created",
                  label: msg("Created"),
                  value: (item) => tableTimestamp(item.createdAt),
                  render: (item) => date(item.createdAt),
                  className: "date-cell",
                },
                {
                  id: "channel",
                  label: msg("Channel"),
                  value: (item) => channelName(item.channel),
                },
                {
                  id: "status",
                  label: msg("State"),
                  value: (item) => t.statuses[item.status] ?? item.status,
                  render: (item) => (
                    <Status
                      status={item.status}
                      channel={item.channel as Channel}
                    />
                  ),
                },
                {
                  id: "pages",
                  label: msg("Pages"),
                  value: (item) => item.pages ?? 0,
                  render: (item) =>
                    item.pages === null ? "—" : count(item.pages),
                },
                {
                  id: "destination",
                  label: msg("Destination"),
                  value: (item) => item.destinationCountry ?? "",
                  render: (item) => item.destinationCountry ?? "—",
                },
                {
                  id: "consumption",
                  label: msg("Consumption"),
                  value: (item) => item.consumptionMinor ?? -1,
                  render: (item) => amount(item.consumptionMinor),
                },
                {
                  id: "reserved",
                  label: msg("Reserved"),
                  value: (item) => item.reservedMinor,
                  render: (item) => amount(item.reservedMinor),
                },
                {
                  id: "approved",
                  label: msg("Approved by"),
                  value: (item) => item.approvedBy ?? "",
                  render: (item) => item.approvedBy ?? "—",
                },
              ] satisfies DataTableColumn<AdministrationDispatch>[]
            ).filter((column) => !hiddenColumns.includes(column.id))}
          />
          <Pager
            label={msg("Activity pages")}
            page={resource.data.page}
            pageSize={resource.data.pageSize}
            total={resource.data.total}
            onPage={(next) => navigate({ page: next })}
          />
        </>
      ) : (
        resource.data && (
          <EmptyState
            title={msg("No dispatch in this period")}
            text={msg("Change the period or the filters.")}
          />
        )
      )}
    </>
  );
}

export function AdministrationConsumptionPage({ route }: { route: string }) {
  const period = readPeriod(route);
  const resource = useAdministrationResource<AdministrationConsumption>(
    routeWith("/administration/consumption", period),
  );
  const data = resource.data;
  const [usageVersion, setUsageVersion] = useState(0);
  return (
    <>
      <ReportHeading
        title={msg("Consumption")}
        route={route}
        path={administrationRoutes.consumption}
        refresh={() => {
          resource.refresh();
          setUsageVersion((version) => version + 1);
        }}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="administration-stats">
              <StatTile
                label={msg("Consumption")}
                value={amount(data.totalMinor)}
              >
                {data.basis === "posted_ledger"
                  ? msg("By posting date of each charge")
                  : msg("Confirmed simulation reservations")}
              </StatTile>
              <StatTile
                label={msg("Reserved now")}
                value={amount(data.reservedMinor)}
              >
                {msg("Held for pending operations")}
              </StatTile>
              {data.credit && (
                <StatTile
                  label={msg("Promotional credit")}
                  value={amount(data.credit.availableMinor)}
                >
                  {msg("of {0} granted", amount(data.credit.grantedMinor))}
                </StatTile>
              )}
            </div>
            <div className="administration-columns">
              <section className="administration-panel">
                <h2>{msg("By service")}</h2>
                {data.services.length >= 2 ? (
                  <BreakdownBars
                    label={msg("Consumption by service")}
                    format={amount}
                    items={data.services.map((row) => ({
                      key: row.service,
                      label: serviceName(row.service),
                      value: row.amountMinor,
                      detail: msg("{0} charges", count(row.charges)),
                    }))}
                  />
                ) : data.services.length === 1 ? (
                  <dl className="administration-single-value">
                    <dt>{serviceName(data.services[0].service)}</dt>
                    <dd>{amount(data.services[0].amountMinor)}</dd>
                  </dl>
                ) : (
                  <p className="empty-inline">
                    {msg("No charge in this period.")}
                  </p>
                )}
              </section>
              <section className="administration-panel">
                <h2>{msg("By channel")}</h2>
                {data.channels.length ? (
                  <BreakdownBars
                    label={msg("Consumption by channel")}
                    format={amount}
                    items={data.channels.map((row) => ({
                      key: row.channel,
                      label: channelName(row.channel),
                      value: row.consumptionMinor,
                      detail: msg("{0} dispatches", count(row.dispatches)),
                    }))}
                  />
                ) : (
                  <p className="empty-inline">
                    {msg("No charge in this period.")}
                  </p>
                )}
              </section>
            </div>
            {data.monthly.length > 0 && (
              <section className="administration-panel">
                <h2>{msg("By month")}</h2>
                <DataTable
                  viewId="monthly-consumption"
                  className="administration-table"
                  label={msg("Consumption by month")}
                  items={data.monthly}
                  getRowKey={(row) => row.month}
                  searchable={false}
                  pagination={false}
                  columns={[
                    {
                      id: "month",
                      label: msg("Month"),
                      value: (row) => row.month,
                      render: (row) => month(row.month),
                      rowHeader: true,
                    },
                    {
                      id: "charges",
                      label: msg("Charges"),
                      value: (row) => row.charges,
                      render: (row) => count(row.charges),
                    },
                    {
                      id: "amount",
                      label: msg("Amount"),
                      value: (row) => row.amountMinor,
                      render: (row) => amount(row.amountMinor),
                    },
                  ]}
                />
              </section>
            )}
          </>
        )
      )}
      <UsageLedger refreshVersion={usageVersion} />
    </>
  );
}

export function AdministrationMemberActivity({ route }: { route: string }) {
  const period = readPeriod(route);
  const page = pageOf(route);
  const resource = useAdministrationResource<
    AdministrationPage<AdministrationMember>
  >(routeWith("/administration/members", { ...period, page, pageSize: 50 }));
  return (
    <section className="administration-panel">
      <div className="section-toolbar">
        <h2>{msg("Member activity")}</h2>
        <RefreshButton onClick={resource.refresh} />
      </div>
      <PeriodControls route={route} path={administrationRoutes.members} />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data && (
          <>
            <DateTimezone />
            <DataTable
              viewId="member-activity"
              className="administration-table"
              label={msg("Member activity")}
              items={resource.data.items}
              getRowKey={(item) => item.userId}
              scope="page"
              pagination={false}
              columns={[
                {
                  id: "member",
                  label: msg("Member"),
                  value: (item) => item.name || item.email,
                  rowHeader: true,
                  render: (item) => (
                    <>
                      <strong>{item.name || item.email}</strong>
                      {item.name && <small>{item.email}</small>}
                    </>
                  ),
                },
                {
                  id: "role",
                  label: msg("Role"),
                  value: (item) => roleLabel(item.role),
                },
                {
                  id: "access",
                  label: msg("Active access"),
                  value: (item) => item.activeConnections,
                  render: (item) => count(item.activeConnections),
                },
                {
                  id: "seen",
                  label: msg("Last sign-in"),
                  value: (item) => tableTimestamp(item.lastSeenAt ?? ""),
                  render: (item) =>
                    item.lastSeenAt ? date(item.lastSeenAt) : "—",
                  className: "date-cell",
                },
                {
                  id: "approvals",
                  label: msg("Approvals"),
                  value: (item) => item.approvals,
                  render: (item) => count(item.approvals),
                },
                {
                  id: "activity",
                  label: msg("Last recorded action"),
                  value: (item) => tableTimestamp(item.lastActivityAt ?? ""),
                  render: (item) =>
                    item.lastActivityAt ? date(item.lastActivityAt) : "—",
                  className: "date-cell",
                },
              ]}
            />
            <Pager
              label={msg("Member pages")}
              page={resource.data.page}
              pageSize={resource.data.pageSize}
              total={resource.data.total}
              onPage={(next) =>
                go(
                  routeWith(administrationRoutes.members, {
                    ...period,
                    page: next,
                  }),
                )
              }
            />
          </>
        )
      )}
    </section>
  );
}

export function AdministrationConnectionsPage({ route }: { route: string }) {
  const period = readPeriod(route);
  const page = pageOf(route);
  const resource = useAdministrationResource<AdministrationConnections>(
    routeWith("/administration/connections", { ...period, page, pageSize: 50 }),
  );
  const data = resource.data;
  const pager = (current: AdministrationPage<unknown>, label: string) => (
    <Pager
      label={label}
      page={current.page}
      pageSize={current.pageSize}
      total={current.total}
      onPage={(next) =>
        go(
          routeWith(administrationRoutes.connections, {
            ...period,
            page: next,
          }),
        )
      }
    />
  );
  return (
    <>
      <ReportHeading
        title={msg("Access and sign-ins")}
        intro={msg("An authorization is not proof of presence.")}
        route={route}
        path={administrationRoutes.connections}
        refresh={resource.refresh}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <section className="administration-panel">
              <h2>{msg("Current access")}</h2>
              <p className="field-hint">
                {msg("To disconnect a member's access, use Members.")}
              </p>
              {data.current.items.length ? (
                <>
                  <DateTimezone />
                  <DataTable
                    viewId="current-access"
                    className="administration-table"
                    label={msg("Current access")}
                    items={data.current.items}
                    getRowKey={(item) => `${item.kind}:${item.id}`}
                    scope="page"
                    pagination={false}
                    columns={[
                      {
                        id: "member",
                        label: msg("Member"),
                        value: (item) => item.userName,
                        rowHeader: true,
                      },
                      {
                        id: "kind",
                        label: msg("Access type"),
                        value: (item) => accessName(item.kind),
                      },
                      {
                        id: "created",
                        label: msg("Started"),
                        value: (item) => tableTimestamp(item.createdAt),
                        render: (item) => date(item.createdAt),
                        className: "date-cell",
                      },
                      {
                        id: "expires",
                        label: msg("Expiry"),
                        value: (item) => tableTimestamp(item.expiresAt ?? ""),
                        render: (item) =>
                          item.expiresAt
                            ? date(item.expiresAt)
                            : msg("Until revoked"),
                        className: "date-cell",
                      },
                      {
                        id: "seen",
                        label: msg("Last sign-in"),
                        value: (item) => tableTimestamp(item.lastSeenAt ?? ""),
                        render: (item) =>
                          item.lastSeenAt ? date(item.lastSeenAt) : "—",
                        className: "date-cell",
                      },
                    ]}
                  />
                  {pager(data.current, msg("Current access pages"))}
                </>
              ) : (
                <p className="empty-inline">{msg("No open access.")}</p>
              )}
            </section>
            <section className="administration-panel">
              <h2>{msg("Sign-ins")}</h2>
              <p className="field-hint">
                {msg(
                  "Sign-in records are kept for {0} days.",
                  data.retentionDays,
                )}
              </p>
              {data.events.items.length ? (
                <>
                  <DataTable
                    viewId="sign-ins"
                    className="administration-table"
                    label={msg("Sign-ins")}
                    items={data.events.items}
                    getRowKey={(item) => item.id}
                    scope="page"
                    pagination={false}
                    columns={[
                      {
                        id: "time",
                        label: msg("Date"),
                        value: (item) => tableTimestamp(item.occurredAt),
                        render: (item) => date(item.occurredAt),
                        className: "date-cell",
                      },
                      {
                        id: "member",
                        label: msg("Member"),
                        value: (item) => item.userName,
                        rowHeader: true,
                      },
                      {
                        id: "kind",
                        label: msg("Access type"),
                        value: (item) => accessName(item.kind),
                      },
                    ]}
                  />
                  {pager(data.events, msg("Sign-in pages"))}
                </>
              ) : (
                <p className="empty-inline">
                  {msg("No sign-in recorded in this period.")}
                </p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}

export function AdministrationAuditPage({ route }: { route: string }) {
  const period = readPeriod(route);
  const page = pageOf(route);
  const resource = useAdministrationResource<
    AdministrationPage<AdministrationAuditEntry>
  >(routeWith("/administration/audit", { ...period, page, pageSize: 50 }));
  return (
    <>
      <ReportHeading
        title={msg("Audit log")}
        intro={msg(
          "Recorded actions of this workspace: approvals, member changes, settings and exports. Details that may contain content are not shown.",
        )}
        route={route}
        path={administrationRoutes.audit}
        refresh={resource.refresh}
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <>
          <DateTimezone />
          <DataTable
            viewId="audit-log"
            className="administration-table"
            label={msg("Audit log")}
            items={resource.data.items}
            getRowKey={(item) => item.id}
            scope="page"
            pagination={false}
            columns={[
              {
                id: "time",
                label: msg("Date"),
                value: (item) => tableTimestamp(item.createdAt),
                render: (item) => date(item.createdAt),
                className: "date-cell",
              },
              {
                id: "action",
                label: msg("Action"),
                value: (item) => auditActionLabel(item.action),
                render: (item) => (
                  <>
                    <span>{auditActionLabel(item.action)}</span>
                    <Disclosure label={msg("Details")}>
                      <code>{item.action}</code>
                    </Disclosure>
                  </>
                ),
                rowHeader: true,
              },
              {
                id: "actor",
                label: msg("By"),
                value: (item) => item.actor ?? "",
                render: (item) => item.actor ?? msg("Guteneo service"),
              },
              {
                id: "resource",
                label: msg("Resource"),
                value: (item) => item.resourceId,
                render: (item) => <code>{item.resourceId}</code>,
              },
            ]}
          />
          <Pager
            label={msg("Audit pages")}
            page={resource.data.page}
            pageSize={resource.data.pageSize}
            total={resource.data.total}
            onPage={(next) =>
              go(
                routeWith(administrationRoutes.audit, {
                  ...period,
                  page: next,
                }),
              )
            }
          />
        </>
      ) : (
        resource.data && (
          <EmptyState
            title={msg("No recorded action in this period")}
            text={msg("Change the period to see older actions.")}
          />
        )
      )}
    </>
  );
}

const formats: {
  format: AdministrationExportFormat;
  label: string;
  Icon: typeof FileCsv;
}[] = [
  { format: "xlsx", label: "Excel", Icon: MicrosoftExcelLogo },
  { format: "pdf", label: "PDF", Icon: FilePdf },
  { format: "csv", label: "CSV", Icon: FileCsv },
];

function ExportCard({
  dataset,
  title,
  text,
  period,
  allowed = ["xlsx", "pdf", "csv"],
  available = true,
}: {
  dataset: AdministrationExportDataset;
  title: string;
  text: ReactNode;
  period: Period;
  allowed?: AdministrationExportFormat[];
  available?: boolean;
}) {
  const action = useAction();
  const [format, setFormat] = useState<AdministrationExportFormat>(
    allowed[0] ?? "xlsx",
  );
  const { label, Icon } = formats.find((item) => item.format === format)!;
  const [downloaded, setDownloaded] = useState<string>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    // Cancel at the address change, before React's deferred route commit.
    const cancel = () => request.current?.abort();
    window.addEventListener("hashchange", cancel);
    return () => {
      window.removeEventListener("hashchange", cancel);
      cancel();
    };
  }, []);
  return (
    <article className="administration-export">
      <div className="administration-export-description">
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <div className="administration-export-actions">
        <select
          aria-label={msg("Format for {0}", title)}
          value={format}
          disabled={action.pending || !available}
          onChange={(event) =>
            setFormat(event.target.value as AdministrationExportFormat)
          }
        >
          {formats
            .filter((item) => allowed.includes(item.format))
            .map((item) => (
              <option key={item.format} value={item.format}>
                {item.label}
              </option>
            ))}
        </select>
        <button
          key={format}
          type="button"
          className="button"
          disabled={action.pending || !available}
          aria-label={msg("Download {0} as {1}", title, label)}
          onClick={() =>
            void action.run(async (view) => {
              request.current?.abort();
              const controller = new AbortController();
              request.current = controller;
              setDownloaded(undefined);
              try {
                const name = await view.wait(
                  downloadExport(dataset, format, period, controller.signal),
                );
                if (!controller.signal.aborted) setDownloaded(name);
              } catch (error) {
                view.checkpoint();
                if (!controller.signal.aborted) throw error;
              } finally {
                if (request.current === controller) request.current = null;
              }
            })
          }
        >
          <Icon size={18} aria-hidden="true" />
          {msg("Download")}
        </button>
      </div>
      {action.pending && <p role="status">{msg("Preparing the file…")}</p>}
      {downloaded && (
        <p role="status">{msg("Download started: {0}", downloaded)}</p>
      )}
      <ErrorNotice error={action.error} />
    </article>
  );
}

export function AdministrationReportsPage({
  route,
  canManageMembers,
  downloadsAvailable = true,
}: {
  route: string;
  canManageMembers: boolean;
  /** The browser-only preview cannot generate a file. */
  downloadsAvailable?: boolean;
}) {
  const period = readPeriod(route);
  return (
    <>
      <ReportHeading
        title={msg("Reports and exports")}
        intro={msg("Each export is recorded in the audit log.")}
        route={route}
        path={administrationRoutes.reports}
      />
      <div className="notice info" role="note">
        <p>
          {msg(
            "Exports contain metadata only: references, dates, states, amounts and member names. Recipients, document titles and message content are never exported. A file over 10,000 rows is refused: choose a shorter period.",
          )}{" "}
          {msg(
            "PDF shows at most {0} rows and identifies omitted rows. Choose Excel or CSV for every row.",
            count(ADMINISTRATION_PDF_MAX_ROWS),
          )}
        </p>
      </div>
      {!downloadsAvailable && (
        <div className="notice info" role="note">
          <p>
            {msg(
              "This preview has no server: files are generated only in a signed-in workspace.",
            )}
          </p>
        </div>
      )}
      <div
        className="administration-exports"
        key={`${period.from}:${period.to}:${canManageMembers}`}
      >
        <ExportCard
          dataset="report"
          period={period}
          available={downloadsAvailable}
          title={msg("Complete workspace report")}
          text={msg(
            "Summary, channels, states, activity, charges{0}. Excel has one sheet per table; the PDF is ready to file or share.",
            canManageMembers ? msg(", members, access and audit log") : "",
          )}
          allowed={["xlsx", "pdf"]}
        />
        <ExportCard
          dataset="activity"
          period={period}
          available={downloadsAvailable}
          title={msg("Activity")}
          text={msg(
            "Every dispatch created in the period with its state and amounts.",
          )}
        />
        <ExportCard
          dataset="consumption"
          period={period}
          available={downloadsAvailable}
          title={msg("Consumption")}
          text={msg(
            "Each posted charge for accounting, with totals by service, channel and day.",
          )}
        />
        {canManageMembers && (
          <>
            <ExportCard
              dataset="members"
              period={period}
              available={downloadsAvailable}
              title={msg("Members")}
              text={msg(
                "Members, roles, permissions, access and approvals in the period.",
              )}
            />
            <ExportCard
              dataset="connections"
              period={period}
              available={downloadsAvailable}
              title={msg("Access and sign-ins")}
              text={msg("Open access and recorded sign-ins of members.")}
            />
            <ExportCard
              dataset="audit"
              period={period}
              available={downloadsAvailable}
              title={msg("Audit log")}
              text={msg(
                "Recorded actions of the workspace, including exports.",
              )}
            />
          </>
        )}
      </div>
    </>
  );
}
