import { Countries } from "./belvedere-summary-components";
import { useState } from "react";
import { GlobeHemisphereWest, Monitor } from "@phosphor-icons/react";
import type { BelvedereConnections } from "../../../packages/contracts/src/belvedere";
import {
  countryName,
  dateTime,
  number,
  queryString,
  shortDate,
  statusName,
  useBelvedereResource,
  useDebounced,
} from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import { DataTable } from "./data-table";
import {
  type ViewProps,
  Failure,
  Loading,
  Empty,
  SectionHeading,
  Status,
  Pagination,
  Search,
} from "./belvedere-view-components";

export function Connections({
  basePath,
  filters,
  revision,
  refresh,
}: ViewProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"current" | "events">("current");
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<BelvedereConnections>(
    `${basePath}/api/connections?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  return (
    <>
      <div className="bv-connections-top">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Connection origins")}>
            {bmsg("Events observed in the selected period")}
          </SectionHeading>
          {data ? <Countries countries={data.countries} /> : <Loading table />}
        </section>
        <section className="bv-panel bv-telemetry">
          <GlobeHemisphereWest size={36} weight="light" />
          <h2>{bmsg("Observed geography, never guessed.")}</h2>
          <p>
            {bmsg(
              "Cloudflare provides the country when the connection is established. Older sessions without a measurement keep an unspecified country.",
            )}
          </p>
          <dl>
            <div>
              <dt>{bmsg("Collection started")}</dt>
              <dd>
                {data?.since
                  ? dateTime(data.since)
                  : bmsg("No events collected")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Retained history")}</dt>
              <dd>
                {data
                  ? bmsg("{0} days", number(data.retentionDays))
                  : bmsg("Loading…")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Scope")}</dt>
              <dd>{bmsg("Successfully established connections")}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "A connection represents a session or authorisation, not each request or real-time presence.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading
          title={bmsg("Access log")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Person or workshop…")}
              label={bmsg("Search connections")}
            />
          }
        />
        <div
          className="bv-tabs"
          role="group"
          aria-label={bmsg("Connection type")}
        >
          <button
            aria-pressed={tab === "current"}
            onClick={() => {
              setTab("current");
              setPage(1);
            }}
          >
            {bmsg("Current sessions and authorisations")}
            {data && <span>{number(data.current.total)}</span>}
          </button>
          <button
            aria-pressed={tab === "events"}
            onClick={() => {
              setTab("events");
              setPage(1);
            }}
          >
            {bmsg("Connection history")}
            {data && <span>{number(data.events.total)}</span>}
          </button>
        </div>
        {!data ? (
          <Loading table />
        ) : tab === "current" ? (
          <>
            {data.current.items.length ? (
              <DataTable
                viewId="platform-current-connections"
                label={bmsg("Current sessions and authorisations")}
                className="bv-data-table"
                items={data.current.items}
                getRowKey={(connection) => connection.id}
                searchable={false}
                pagination={false}
                scope="page"
                columns={[
                  {
                    id: "person",
                    label: bmsg("Person / workshop"),
                    value: (connection) =>
                      `${connection.userName} ${connection.workshopName}`,
                    render: (connection) => (
                      <>
                        <strong>{connection.userName}</strong>
                        <small>{connection.workshopName}</small>
                      </>
                    ),
                  },
                  {
                    id: "access",
                    label: bmsg("Access"),
                    value: (connection) => accessName(connection.kind),
                    render: (connection) => (
                      <>
                        <span className="bv-access-kind">
                          <Monitor size={16} />
                          {accessName(connection.kind)}
                        </span>
                        <small>
                          {bmsg("Created on ")}
                          {shortDate(connection.createdAt)}
                        </small>
                      </>
                    ),
                  },
                  {
                    id: "country",
                    label: bmsg("Country"),
                    value: (connection) => countryName(connection.country),
                    render: (connection) => (
                      <>{countryName(connection.country)}</>
                    ),
                  },
                  {
                    id: "status",
                    label: bmsg("Status"),
                    value: (connection) => statusName(connection.status),
                    render: (connection) => (
                      <>
                        <Status value={connection.status} />
                      </>
                    ),
                  },
                  {
                    id: "lastSeen",
                    label: bmsg("Last observed connection"),
                    value: (connection) => connection.lastSeenAt,
                    className: "bv-date-cell",
                    render: (connection) => (
                      <>{dateTime(connection.lastSeenAt)}</>
                    ),
                  },
                  {
                    id: "expires",
                    label: bmsg("Expires"),
                    value: (connection) => connection.expiresAt,
                    className: "bv-date-cell",
                    render: (connection) => (
                      <>
                        {connection.expiresAt
                          ? dateTime(connection.expiresAt)
                          : bmsg("No expiry recorded")}
                      </>
                    ),
                  },
                ]}
              />
            ) : (
              <Empty title={bmsg("No sessions in this view.")}>
                {bmsg("Change the filters or view the connection history.")}
              </Empty>
            )}
            <Pagination
              data={data.current}
              onChange={setPage}
              label={bmsg("sessions and authorisations")}
            />
          </>
        ) : (
          <>
            {data.events.items.length ? (
              <DataTable
                viewId="platform-connection-history"
                label={bmsg("Connection history")}
                className="bv-data-table"
                items={data.events.items}
                getRowKey={(connection) => connection.id}
                searchable={false}
                pagination={false}
                scope="page"
                columns={[
                  {
                    id: "date",
                    label: bmsg("Connection date"),
                    value: (connection) => connection.occurredAt,
                    className: "bv-date-cell",
                    render: (connection) => (
                      <>{dateTime(connection.occurredAt)}</>
                    ),
                  },
                  {
                    id: "person",
                    label: bmsg("Person"),
                    value: (connection) => connection.userName,
                    render: (connection) => (
                      <>
                        <strong>{connection.userName}</strong>
                      </>
                    ),
                  },
                  {
                    id: "workshop",
                    label: bmsg("Workshop"),
                    value: (connection) => connection.workshopName,
                    render: (connection) => <>{connection.workshopName}</>,
                  },
                  {
                    id: "access",
                    label: bmsg("Access"),
                    value: (connection) => accessName(connection.kind),
                    render: (connection) => <>{accessName(connection.kind)}</>,
                  },
                  {
                    id: "country",
                    label: bmsg("Observed country"),
                    value: (connection) => countryName(connection.country),
                    render: (connection) => (
                      <>{countryName(connection.country)}</>
                    ),
                  },
                ]}
              />
            ) : (
              <Empty title={bmsg("No new connections observed.")}>
                {bmsg(
                  "Connections established after collection was enabled will appear here.",
                )}
              </Empty>
            )}
            <Pagination
              data={data.events}
              onChange={setPage}
              label={bmsg("connections")}
            />
          </>
        )}
      </section>
    </>
  );
}

function accessName(kind: string) {
  return (
    {
      browser: bmsg("Browser"),
      native: bmsg("Native app"),
      mcp: bmsg("MCP assistant"),
      browser_login: bmsg("Browser"),
      native_login: bmsg("Native app"),
      mcp_authorization: bmsg("MCP assistant"),
    }[kind] || kind
  );
}
