import { Channels, JobStatuses } from "./belvedere-summary-components";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type { BelvedereOverview } from "../../../packages/contracts/src/belvedere";
import {
  dateTime,
  money,
  number,
  queryString,
  shortDate,
  statusName,
  useBelvedereResource,
} from "./belvedere-data";
import { bmsg, bmsgIn } from "./belvedere-i18n";

import { DataTable } from "./data-table";
import {
  type View,
  type ViewProps,
  Failure,
  Loading,
  Empty,
  SectionHeading,
  Stat,
} from "./belvedere-view-components";

const BelvedereGlobe = lazy(() =>
  import("./belvedere-globe").then((module) => ({
    default: module.BelvedereGlobe,
  })),
);

export function Overview(
  props: ViewProps & {
    navigate: (view: View) => void;
    openJobs: (filters?: Record<string, string>) => void;
    openWorkshop: (item: { id: string; name: string }) => void;
  },
) {
  const { basePath, filters, revision, refresh, navigate, openJobs } = props;
  const { data, error } = useBelvedereResource<BelvedereOverview>(
    `${basePath}/api/overview?${queryString(filters)}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  const { totals } = data;
  return (
    <>
      <div className="bv-stats">
        <Stat
          label={bmsg("Dispatches in this period")}
          value={number(totals.dispatches)}
          accent
        >
          {number(totals.delivered)}
          {bmsg(" delivered · ")}
          {number(totals.pages)}
          {bmsg(" pages")}
        </Stat>
        <Stat
          label={bmsg("Customer consumption")}
          value={money(totals.customerConsumptionMinor)}
        >
          {money(totals.reservedMinor)}
          {bmsg(" reserved")}
        </Stat>
        <Stat label={bmsg("Workshops")} value={number(totals.workshops)}>
          {number(totals.members)}
          {bmsg(" distinct members")}
        </Stat>
        <Stat
          label={bmsg("Active connections")}
          value={number(totals.activeConnections)}
        >
          {bmsg("Unexpired sessions and active authorisations")}
        </Stat>
      </div>
      <Suspense fallback={<Loading />}>
        <BelvedereGlobe
          connections={data.countries}
          distribution={data.distributionCountries}
          onDistributionCountry={(country) =>
            openJobs({ country: country || "unknown" })
          }
        />
      </Suspense>
      <div className="bv-overview-grid">
        <section className="bv-panel bv-activity">
          <SectionHeading title={bmsg("The pace of activity")}>
            {bmsg("From ")}
            {shortDate(filters.from)}
            {bmsg(" to ")}
            {shortDate(filters.to)}
            {bmsg(" · Daily aggregation in UTC")}
          </SectionHeading>
          <ActivityChart data={data.trend} />
        </section>
        <section className="bv-panel bv-attention">
          <SectionHeading
            title={bmsg("Needs attention")}
            aside={
              <span
                className={`bv-count${totals.attention ? " bv-count-warning" : ""}`}
              >
                {number(totals.attention)}
              </span>
            }
          />
          {data.incidents.length ? (
            <div className="bv-incident-list">
              {data.incidents.map((incident) => (
                <button
                  key={incident.kind}
                  onClick={() =>
                    openJobs({
                      statusGroup:
                        incident.kind === "outbox_delayed"
                          ? "delayed"
                          : "attention",
                    })
                  }
                >
                  <WarningCircle
                    size={19}
                    weight={
                      incident.severity === "critical" ? "fill" : "regular"
                    }
                  />
                  <span>
                    {incidentName(incident.kind)}
                    <small>
                      {incident.severity === "critical"
                        ? bmsg("Verification required")
                        : bmsg("Examine affected dispatches")}
                    </small>
                  </span>
                  <strong>{number(incident.count)}</strong>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="bv-clear">
              <CheckCircle size={32} weight="light" />
              <h3>{bmsg("No dispatches need attention.")}</h3>
              <p>
                {bmsg("The available data shows no incidents in this period.")}
              </p>
            </div>
          )}
          <div className="bv-attention-foot">
            <ShieldCheck size={17} />
            <span>
              {bmsg(
                "Belvédère observes. Business actions stay in the workshops.",
              )}
            </span>
          </div>
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("How are dispatches progressing?")}
            aside={
              <button className="bv-text-button" onClick={() => openJobs()}>
                {bmsg("All dispatches")}
                <ArrowUpRight size={16} />
              </button>
            }
          >
            {bmsg("Current state of dispatches created in this period")}
          </SectionHeading>
          <JobStatuses
            statuses={data.statuses}
            onSelect={(status) => openJobs({ status })}
          />
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("What is being sent")}
            aside={
              <span className="bv-subtle">
                {number(totals.documents)}
                {bmsg(" documents")}
              </span>
            }
          >
            {bmsg("Dispatch and customer consumption breakdown")}
          </SectionHeading>
          <Channels channels={data.channels} />
          <button
            className="bv-text-button bv-panel-link"
            onClick={() => navigate("finance")}
          >
            {bmsg("View financial details")}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <p className="bv-source-note">
        {bmsg("Connection countries estimated by Cloudflare.")}{" "}
        {data.telemetry.since
          ? bmsg("Collecting since {0}.", shortDate(data.telemetry.since))
          : bmsg("Collecting from new connections.")}{" "}
        {bmsg(
          "Consumption reflects the current state of dispatches created in this period.",
        )}
      </p>
      <p className="bv-freshness">
        <span aria-hidden="true" />
        {bmsg("Calculated on ")}
        {dateTime(data.generatedAt)}
        {bmsg(
          " · Workshop, member and session totals reflect the current state.",
        )}
      </p>
    </>
  );
}

function incidentName(kind: string) {
  return (
    {
      failed: bmsg("Failed dispatches"),
      unknown: bmsg("Unknown provider outcomes"),
      pending: bmsg("Pending dispatches"),
      stale_outbox: bmsg("Dispatches stuck in the queue"),
      outbox_failed: bmsg("Processing failures"),
      rejected: bmsg("Rejected dispatches"),
      provider_unknown: bmsg("Unknown provider outcomes"),
      dispatch_attention: bmsg("Dispatches to check"),
      outbox_delayed: bmsg("Delayed processing"),
      dispatch_failed: bmsg("Failed dispatches"),
      uncertain: bmsg("Outcomes to confirm"),
    }[kind] || statusName(kind)
  );
}

function ActivityChart({ data }: { data: BelvedereOverview["trend"] }) {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [metric, setMetric] = useState<
    "dispatches" | "consumptionMinor" | "connections"
  >("dispatches");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(1, ...data.map((item) => item[metric]));
  const top = Math.max(1, Math.ceil(maximum / 4) * 4);
  const plot = {
    x: compact ? 54 : 64,
    y: 16,
    width: compact ? 484 : 870,
    height: 185,
  };
  const barWidth = plot.width / Math.max(data.length, 1);
  const active = activeIndex === null ? null : data[activeIndex];
  const formatted = (value: number) =>
    metric === "consumptionMinor" ? money(value) : number(value);
  const total = data.reduce((sum, item) => sum + item[metric], 0);
  return (
    <>
      <div className="bv-chart-toolbar">
        <div className="bv-segmented" aria-label={bmsg("Chart metric")}>
          {(
            [
              ["dispatches", bmsg("Dispatches")],
              ["consumptionMinor", bmsg("Consumption")],
              ["connections", bmsg("Connections")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={metric === key}
              onClick={() => {
                setMetric(key);
                setActiveIndex(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="bv-chart-total">
          {formatted(total)}
          <small>{bmsg(" in this period")}</small>
        </span>
      </div>
      {data.length === 0 ? (
        <Empty title={bmsg("Activity will appear here.")}>
          {bmsg("No measurements available for this period.")}
        </Empty>
      ) : (
        <>
          <div className="bv-chart" onMouseLeave={() => setActiveIndex(null)}>
            <svg
              viewBox={compact ? "0 0 560 250" : "0 0 960 250"}
              role="group"
              aria-label={bmsg(
                "Daily trend: {0}",
                metric === "consumptionMinor"
                  ? bmsg("customer consumption in euros")
                  : metric === "dispatches"
                    ? bmsg("deliveries")
                    : bmsg("connections"),
              )}
            >
              {[0, 1, 2, 3, 4].map((tick) => (
                <g key={tick}>
                  <line
                    x1={plot.x}
                    y1={plot.y + plot.height - (tick * plot.height) / 4}
                    x2={plot.x + plot.width}
                    y2={plot.y + plot.height - (tick * plot.height) / 4}
                    className="bv-gridline"
                  />
                  <text
                    x={plot.x - 11}
                    y={plot.y + plot.height - (tick * plot.height) / 4 + 4}
                    textAnchor="end"
                    className="bv-chart-label"
                  >
                    {metric === "consumptionMinor"
                      ? money((tick * top) / 4)
                      : number((tick * top) / 4)}
                  </text>
                </g>
              ))}
              {data.map((item, index) => {
                const height = (item[metric] / top) * plot.height;
                const selected = activeIndex === index;
                return (
                  <g
                    key={item.date}
                    className={`bv-chart-day${selected ? " is-active" : ""}`}
                    tabIndex={0}
                    role="img"
                    aria-label={`${shortDate(item.date)} : ${formatted(item[metric])}`}
                    onFocus={() => setActiveIndex(index)}
                    onBlur={() => setActiveIndex(null)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <rect
                      x={plot.x + index * barWidth}
                      y={plot.y}
                      width={barWidth}
                      height={plot.height}
                      className="bv-chart-hit"
                    />
                    <rect
                      x={plot.x + index * barWidth + barWidth * 0.17}
                      y={
                        plot.y +
                        plot.height -
                        Math.max(height, item[metric] > 0 ? 2 : 0)
                      }
                      width={Math.max(1, barWidth * 0.66)}
                      height={Math.max(height, item[metric] > 0 ? 2 : 0)}
                      rx={1}
                      className="bv-chart-bar"
                    />
                    {(index === 0 ||
                      index === data.length - 1 ||
                      (index %
                        Math.max(
                          1,
                          Math.floor(data.length / (compact ? 2 : 5)),
                        ) ===
                        0 &&
                        index < data.length - 3)) && (
                      <text
                        x={plot.x + index * barWidth + barWidth / 2}
                        y={229}
                        textAnchor={
                          index === 0
                            ? "start"
                            : index === data.length - 1
                              ? "end"
                              : "middle"
                        }
                        className="bv-chart-label"
                      >
                        {shortDate(item.date)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="bv-chart-caption" aria-live="polite">
            <span>
              <span className="bv-legend-dot" />
              {metric === "consumptionMinor"
                ? bmsg("Current customer cost by creation date")
                : metric === "dispatches"
                  ? bmsg("Dispatches created")
                  : bmsg("Established connections")}
            </span>
            <span>
              {active
                ? `${shortDate(active.date)} · ${formatted(active[metric])}`
                : bmsg("Hover over or select a day for details")}
            </span>
          </div>
          <details className="bv-chart-table">
            <summary>{bmsg("Show chart values")}</summary>
            <DataTable
              viewId="platform-daily-values"
              label={bmsg("Daily values")}
              className="bv-data-table"
              items={data}
              getRowKey={(item) => item.date}
              columns={[
                {
                  id: "date",
                  label: bmsg("Date"),
                  value: (item) => item.date,
                  searchValue: (item) => shortDate(item.date),
                  render: (item) => <>{shortDate(item.date)}</>,
                },
                {
                  id: "dispatches",
                  label: bmsg("Dispatches"),
                  value: (item) => item.dispatches,
                  searchValue: (item) => number(item.dispatches),
                  className: "bv-numeric",
                  render: (item) => <>{number(item.dispatches)}</>,
                },
                {
                  id: "delivered",
                  label: bmsgIn("belvedere-plural", "Delivered"),
                  value: (item) => item.delivered,
                  searchValue: (item) => number(item.delivered),
                  className: "bv-numeric",
                  render: (item) => <>{number(item.delivered)}</>,
                },
                {
                  id: "connections",
                  label: bmsg("Connections"),
                  value: (item) => item.connections,
                  searchValue: (item) => number(item.connections),
                  className: "bv-numeric",
                  render: (item) => <>{number(item.connections)}</>,
                },
                {
                  id: "consumption",
                  label: bmsg("Consumption"),
                  value: (item) => item.consumptionMinor,
                  searchValue: (item) => money(item.consumptionMinor),
                  className: "bv-numeric",
                  render: (item) => <>{money(item.consumptionMinor)}</>,
                },
              ]}
            />
          </details>
        </>
      )}
    </>
  );
}
