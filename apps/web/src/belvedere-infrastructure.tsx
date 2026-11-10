import { useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  ChartBar,
  Cloud,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  dateTime,
  money,
  number,
  useBelvedereResource,
} from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import { formatLocale } from "./locale";
import { DataTable } from "./data-table";
import {
  type ViewProps,
  Notice,
  Failure,
  Loading,
  Empty,
  SectionHeading,
  Stat,
} from "./belvedere-view-components";

export function Infrastructure({ basePath, revision, refresh }: ViewProps) {
  const [window, setWindow] = useState<"24h" | "7d">("24h");
  const { data, error } = useBelvedereResource<
    import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareMetrics
  >(`${basePath}/api/infrastructure?window=${window}`, revision);
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  const copy = {
    not_configured: {
      title: bmsg("Cloudflare metrics are not connected yet."),
      description: bmsg(
        "The telemetry source is not configured yet. Once connected on the server, it will show Worker requests and errors.",
      ),
      label: bmsg("Not configured"),
    },
    forbidden: {
      title: bmsg("Access to measurements needs checking."),
      description: bmsg(
        "Cloudflare does not allow reading statistics with the current configuration. Check the connection permissions on the server.",
      ),
      label: bmsg("Access denied"),
    },
    unavailable: {
      title: bmsg("Measurements are temporarily unavailable."),
      description: bmsg(
        "Cloudflare did not return a usable response. Refresh this view to try again.",
      ),
      label: bmsg("Unavailable"),
    },
    no_data: {
      title: bmsg("No measurements in this window."),
      description: bmsg(
        "The connection is configured, but Cloudflare returned no measurements for the selected period.",
      ),
      label: bmsg("No data"),
    },
    ok: {
      title: bmsg("Cloudflare measurements are available."),
      description: bmsg(
        "Measurements aggregated by Cloudflare for the guteneo Worker.",
      ),
      label: bmsg("Connected"),
    },
  }[data.status];
  return (
    <>
      <section className="bv-panel bv-infra-header">
        <div className="bv-infra-service">
          <span className="bv-cloud-icon">
            <Cloud size={30} />
          </span>
          <div>
            <h2>Cloudflare Workers</h2>
            <p>{bmsg("Application execution and reliability")}</p>
          </div>
          <span
            className={`bv-status bv-status-${data.status === "ok" ? "success" : "neutral"}`}
          >
            {copy.label}
          </span>
        </div>
        <label className="bv-infra-window">
          {bmsg("Cloudflare window")}
          <select
            value={window}
            onChange={(event) => setWindow(event.target.value as "24h" | "7d")}
          >
            <option value="24h">{bmsg("Last 24 hours")}</option>
            <option value="7d">{bmsg("Last 7 days")}</option>
          </select>
        </label>
      </section>
      {data.status !== "ok" || !data.metrics ? (
        <section className="bv-infra-empty">
          <Cloud size={60} weight="light" />
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          <div className="bv-infra-capabilities">
            <span>
              <ChartBar size={19} />
              {bmsg("Request volume")}
            </span>
            <span>
              <WarningCircle size={19} />
              {bmsg("Execution errors")}
            </span>
            <span>
              <ArrowRight size={19} />
              {bmsg("Latency p50 / p99")}
            </span>
          </div>
          {data.status === "unavailable" && (
            <button className="bv-button" onClick={refresh}>
              <ArrowClockwise size={17} />
              {bmsg("Try again")}
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="bv-stats">
            <Stat
              label={bmsg("Worker invocations")}
              value={number(data.metrics.requests)}
              accent
            >
              {number(data.metrics.subrequests)}
              {bmsg(" subrequests")}
            </Stat>
            <Stat
              label={bmsg("Execution errors")}
              value={number(data.metrics.errors)}
            >
              {new Intl.NumberFormat(formatLocale(), {
                style: "percent",
                maximumFractionDigits: 2,
              }).format(data.metrics.errorRate)}{" "}
              {bmsg("of invocations")}
            </Stat>
            <Stat
              label={bmsg("Median latency · p50")}
              value={
                data.metrics.wallTimeP50Milliseconds === null
                  ? bmsg("Unavailable")
                  : `${number(data.metrics.wallTimeP50Milliseconds)} ms`
              }
            >
              {bmsg("Wall-clock execution time")}
            </Stat>
            <Stat
              label={bmsg("High latency · p99")}
              value={
                data.metrics.wallTimeP99Milliseconds === null
                  ? bmsg("Unavailable")
                  : `${number(data.metrics.wallTimeP99Milliseconds)} ms`
              }
            >
              {bmsg("99% of executions below this threshold")}
            </Stat>
          </div>
          <section className="bv-panel">
            <SectionHeading title={bmsg("Hourly requests")}>
              {bmsg("From ")}
              {dateTime(data.startAt)}
              {bmsg(" to ")}
              {dateTime(data.endAt)}
              {bmsg(" · Hours actually returned by Cloudflare")}
            </SectionHeading>
            <InfrastructureChart series={data.series} />
          </section>
        </>
      )}
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Measurements with a defined scope.")} />
          <p className="bv-prose">
            {bmsg(
              "These measurements use Cloudflare’s sampled analytics. Errors are Worker execution errors; they do not represent all HTTP error responses.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "This window is independent of the workshop period and mode. A missing hour does not mean zero requests.",
            )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Service scope")} />
          <p className="bv-prose">
            {bmsg(
              "These statistics cover all access to the configured Worker. They are independent of the workshop mode.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "The usage amounts below are a financial source separate from request statistics.",
            )}
          </p>
        </section>
      </div>
      <CloudflareBilling
        basePath={basePath}
        revision={revision}
        refresh={refresh}
      />
      <p className="bv-freshness">
        {bmsg("Last checked: ")}
        {dateTime(data.observedAt)}
        {bmsg(" · Source: Cloudflare GraphQL API")}
      </p>
    </>
  );
}

function InfrastructureChart({
  series,
}: {
  series: import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareMetrics["series"];
}) {
  if (!series.length)
    return (
      <Empty title={bmsg("No hourly measurements.")}>
        {bmsg("Points will appear when Cloudflare returns measurements.")}
      </Empty>
    );
  const max = Math.max(...series.map((item) => item.requests), 1);
  return (
    <>
      <div
        className="bv-infra-chart"
        role="img"
        aria-label={bmsg("Hourly request volume, detailed values below")}
      >
        {series.map((item) => (
          <div
            key={item.hour}
            title={bmsg(
              "{0}: {1} requests, {2} errors",
              dateTime(item.hour),
              number(item.requests),
              number(item.errors),
            )}
          >
            <span style={{ height: `${(item.requests / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="bv-chart-caption">
        <span>{dateTime(series[0].hour)}</span>
        <span>{dateTime(series[series.length - 1].hour)}</span>
      </div>
      <details className="bv-chart-table">
        <summary>{bmsg("Show hourly measurements")}</summary>
        <DataTable
          viewId="platform-hourly-infrastructure"
          label={bmsg("Hourly Cloudflare measurements")}
          className="bv-data-table"
          items={series}
          getRowKey={(item) => item.hour}
          columns={[
            {
              id: "hour",
              label: bmsg("Hour"),
              value: (item) => item.hour,
              searchValue: (item) => dateTime(item.hour),
              render: (item) => <>{dateTime(item.hour)}</>,
            },
            {
              id: "requests",
              label: bmsg("Requests"),
              value: (item) => item.requests,
              searchValue: (item) => number(item.requests),
              className: "bv-numeric",
              render: (item) => <>{number(item.requests)}</>,
            },
            {
              id: "errors",
              label: bmsg("Errors"),
              value: (item) => item.errors,
              searchValue: (item) => number(item.errors),
              className: "bv-numeric",
              render: (item) => <>{number(item.errors)}</>,
            },
            {
              id: "subrequests",
              label: bmsg("Subrequests"),
              value: (item) => item.subrequests,
              searchValue: (item) => number(item.subrequests),
              className: "bv-numeric",
              render: (item) => <>{number(item.subrequests)}</>,
            },
          ]}
        />
      </details>
    </>
  );
}

function CloudflareBilling({
  basePath,
  revision,
  refresh,
}: Pick<ViewProps, "basePath" | "revision" | "refresh">) {
  const { data, error } = useBelvedereResource<
    import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareBilling
  >(`${basePath}/api/infrastructure/billing`, revision);
  const labels = {
    ok: bmsg("Reported usage"),
    not_configured: bmsg("Not configured"),
    forbidden: bmsg("Access denied"),
    unavailable: bmsg("Unavailable"),
    no_data: bmsg("No data"),
  };
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("Billable usage for the Cloudflare account")}
        aside={
          data && (
            <span className="bv-status bv-status-neutral">
              {labels[data.status]}
            </span>
          )
        }
      >
        {bmsg(
          "Current billing cycle, separate from the workshop activity period",
        )}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : data.status === "ok" ? (
        <>
          <div className="bv-supplier-totals">
            {data.totals.map((total) => (
              <div key={total.currency}>
                <span>
                  {bmsg("Total ")}
                  {total.currency}
                </span>
                <strong>{money(total.amountMinor, total.currency)}</strong>
                <small className="bv-subtle">
                  {bmsg("Reported: ")}
                  {total.reportedAmountDecimal} {total.currency}
                </small>
              </div>
            ))}
          </div>
          <DataTable
            viewId="platform-service-billing"
            label={bmsg("Cloudflare billable usage by service")}
            className="bv-data-table"
            items={data.services}
            getRowKey={(service) => `${service.service}:${service.currency}`}
            columns={[
              {
                id: "service",
                label: bmsg("Service"),
                value: (service) => service.service,
                render: (service) => <>{service.service}</>,
              },
              {
                id: "periods",
                label: bmsg("Billable periods"),
                value: (service) => service.chargePeriods,
                searchValue: (service) => number(service.chargePeriods),
                className: "bv-numeric",
                render: (service) => <>{number(service.chargePeriods)}</>,
              },
              {
                id: "usage",
                label: bmsg("Reported usage"),
                value: (service) => service.amountMinor,
                searchValue: (service) =>
                  money(service.amountMinor, service.currency),
                className: "bv-numeric bv-emphasis",
                render: (service) => (
                  <>{money(service.amountMinor, service.currency)}</>
                ),
              },
              {
                id: "source",
                label: bmsg("Exact source value"),
                value: (service) => service.reportedAmountDecimal,
                sortType: "decimal",
                searchValue: (service) =>
                  `${service.reportedAmountDecimal} ${service.currency}`,
                className: "bv-numeric",
                render: (service) => (
                  <>
                    <code>
                      {service.reportedAmountDecimal} {service.currency}
                    </code>
                  </>
                ),
              },
            ]}
          />
          <p className="bv-source-note">
            {bmsg(
              "Amounts rounded to the nearest minor unit after aggregating each subtotal; no currency conversion.",
            )}{" "}
            {data.firstChargeAt && data.lastChargeAt
              ? bmsg(
                  "Reported periods from {0} to {1}.",
                  dateTime(data.firstChargeAt),
                  dateTime(data.lastChargeAt),
                )
              : bmsg("Charge dates not recorded.")}
          </p>
        </>
      ) : (
        <Empty
          title={
            data.status === "not_configured"
              ? bmsg("Cloudflare costs are not connected yet.")
              : data.status === "forbidden"
                ? bmsg("Billing permissions need to be checked.")
                : data.status === "no_data"
                  ? bmsg("No billable usage reported.")
                  : bmsg("Costs are temporarily unavailable.")
          }
        >
          {data.status === "not_configured"
            ? bmsg(
                "The server connection to the billable usage API is not configured.",
              )
            : data.status === "no_data"
              ? bmsg(
                  "Cloudflare returned no entries for the current cycle; this does not prove there is no charge.",
                )
              : bmsg("Refresh after checking the Cloudflare connection.")}
        </Empty>
      )}
      <div className="bv-billing-note">
        <Notice>
          {bmsg(
            "Measured usage only: excludes subscriptions, taxes and invoice reconciliation. These costs may include other projects hosted on this Cloudflare account; they are not attributed exclusively to guteneo and cannot establish its net profit.",
          )}
        </Notice>
      </div>
    </section>
  );
}
