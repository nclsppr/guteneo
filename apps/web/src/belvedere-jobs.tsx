import { jobStatuses } from "./belvedere-summary-components";
import { useState } from "react";
import { ArrowUpRight, X } from "@phosphor-icons/react";
import type {
  BelvedereJob,
  BelvedereOverview,
  BelvederePage,
} from "../../../packages/contracts/src/belvedere";
import {
  channelName,
  countryName,
  dateTime,
  money,
  number,
  queryString,
  statusName,
  useBelvedereResource,
  useDebounced,
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
  Status,
  Mode,
  Pagination,
  Search,
} from "./belvedere-view-components";

export function Jobs({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const initial = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const [query, setQuery] = useState(initial.get("q") || "");
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState(initial.get("channel") || "");
  const [status, setStatus] = useState(initial.get("status") || "");
  const [country, setCountry] = useState(initial.get("country") || "");
  const [statusGroup, setStatusGroup] = useState(
    initial.get("statusGroup") || "",
  );
  const search = useDebounced(query);
  const extra: Record<string, string | number> = {
    q: search,
    page,
    pageSize: 20,
  };
  if (channel) extra.channel = channel;
  if (status) extra.status = status;
  if (country) extra.country = country;
  if (statusGroup) extra.statusGroup = statusGroup;
  const { data, error } = useBelvedereResource<BelvederePage<BelvedereJob>>(
    `${basePath}/api/jobs?${queryString(filters, extra)}`,
    revision,
  );
  const overview = useBelvedereResource<BelvedereOverview>(
    `${basePath}/api/overview?${queryString(filters)}`,
    revision,
  );
  const observedCountries = [
    ...new Set(
      (overview.data?.distributionCountries || []).map(
        (item) => item.country || "unknown",
      ),
    ),
  ];
  if (country && !observedCountries.includes(country))
    observedCountries.push(country);
  const countryOptions = observedCountries.sort((a, b) =>
    countryName(a === "unknown" ? null : a).localeCompare(
      countryName(b === "unknown" ? null : b),
      formatLocale(),
    ),
  );
  function clear() {
    setQuery("");
    setChannel("");
    setStatus("");
    setCountry("");
    setStatusGroup("");
    setPage(1);
  }
  return (
    <>
      <section className="bv-panel bv-table-panel">
        <SectionHeading
          title={bmsg("All dispatches")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Workshop or dispatch ID…")}
              label={bmsg("Search dispatches")}
            />
          }
        >
          {data
            ? bmsg("{0} dispatches in this view", number(data.total))
            : bmsg("All dispatches log")}{" "}
          {bmsg("· Created in the selected period")}
        </SectionHeading>
        <div className="bv-job-filters">
          <label>
            {bmsg("Channel")}
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("All channels")}</option>
              <option value="email">{bmsg("Email")}</option>
              <option value="fax">{bmsg("Fax")}</option>
              <option value="postal">{bmsg("Postal mail")}</option>
            </select>
          </label>
          <label>
            {bmsg("Status")}
            <select
              value={statusGroup ? `group:${statusGroup}` : status}
              onChange={(event) => {
                const value = event.target.value;
                setStatus(value.startsWith("group:") ? "" : value);
                setStatusGroup(
                  value.startsWith("group:") ? value.slice(6) : "",
                );
                setPage(1);
              }}
            >
              <option value="">{bmsg("All statuses")}</option>
              <option value="group:attention">{bmsg("Needs checking")}</option>
              <option value="group:delayed">
                {bmsg("Delayed processing")}
              </option>
              {jobStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusName(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {bmsg("Destination country")}
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("All observed countries")}</option>
              {countryOptions.map((value) => (
                <option key={value} value={value}>
                  {countryName(value === "unknown" ? null : value)}
                </option>
              ))}
            </select>
          </label>
          {(query || channel || status || country || statusGroup) && (
            <button className="bv-text-button" onClick={clear}>
              <X size={14} />
              {bmsg("Reset")}
            </button>
          )}
        </div>
        {statusGroup === "delayed" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Dispatches waiting in the processing queue for over a minute. This view does not trigger any new dispatch or retry.",
              )}
            </Notice>
          </div>
        )}
        {statusGroup === "attention" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Failed or undelivered dispatches, complaints, or unknown provider outcomes. Open the workshop to examine the situation.",
              )}
            </Notice>
          </div>
        )}
        {error ? (
          <Failure error={error} retry={refresh} basePath={basePath} />
        ) : !data ? (
          <Loading table />
        ) : !data.items.length ? (
          <Empty title={bmsg("No matching dispatches.")}>
            {bmsg(
              "Widen the period or remove a filter to find the operations you need.",
            )}
          </Empty>
        ) : (
          <DataTable
            viewId="platform-dispatches"
            label={bmsg("All dispatches and their costs")}
            className="bv-data-table"
            items={data.items}
            getRowKey={(job) => job.id}
            searchable={false}
            pagination={false}
            scope="page"
            columns={[
              {
                id: "dispatch",
                label: bmsg("Dispatch / workshop"),
                value: (job) => `${job.workshopName} ${job.id}`,
                render: (job) => (
                  <>
                    <button
                      className="bv-table-link"
                      onClick={() =>
                        openWorkshop({
                          id: job.workshopId,
                          name: job.workshopName,
                        })
                      }
                    >
                      {job.workshopName}
                      <ArrowUpRight size={13} />
                    </button>
                    <code>{job.id}</code>
                    <small>{dateTime(job.createdAt)}</small>
                  </>
                ),
              },
              {
                id: "channel",
                label: bmsg("Channel"),
                value: (job) => channelName(job.channel),
                render: (job) => (
                  <>
                    <strong>{channelName(job.channel)}</strong>
                    <Mode mode={job.mode} />
                    <small>
                      {job.pages === null
                        ? bmsg("Page count unspecified")
                        : bmsg("{0} pages", number(job.pages))}
                      {job.deliveryMode === "protected_link"
                        ? bmsg(" · Protected link")
                        : job.deliveryMode === "attachment"
                          ? bmsg(" · Attachment")
                          : ""}
                    </small>
                  </>
                ),
              },
              {
                id: "destination",
                label: bmsg("Destination"),
                value: (job) => countryName(job.destinationCountry),
                render: (job) => <>{countryName(job.destinationCountry)}</>,
              },
              {
                id: "status",
                label: bmsg("Status"),
                value: (job) => statusName(job.status),
                render: (job) => (
                  <>
                    <Status value={job.status} />
                  </>
                ),
              },
              {
                id: "consumption",
                label: bmsg("Customer consumption"),
                value: (job) => job.customerActualMinor,
                className: "bv-numeric bv-emphasis",
                render: (job) => (
                  <>
                    {job.customerActualMinor === null ? (
                      <span className="bv-subtle">{bmsg("Not finalised")}</span>
                    ) : (
                      money(job.customerActualMinor)
                    )}
                    <small>
                      {bmsg("Delivery: ")}
                      {money(job.transportActualMinor ?? null)}
                      <br />
                      {bmsg("Hosting: ")}
                      {money(job.hostingFeeMinor ?? 0)}
                    </small>
                  </>
                ),
              },
              {
                id: "reserved",
                label: bmsg("Reserved"),
                value: (job) => job.reservedMinor,
                className: "bv-numeric",
                render: (job) => (
                  <>
                    {money(job.reservedMinor)}
                    <small>
                      {bmsg("Limit: ")}
                      {money(job.ceilingMinor)}
                    </small>
                  </>
                ),
              },
              {
                id: "provider",
                label: bmsg("Provider cost"),
                value: (job) => job.supplierVerifiedMinor,
                className: "bv-numeric",
                render: (job) => (
                  <>
                    {job.supplierVerifiedMinor === null ? (
                      <span className="bv-subtle">{bmsg("Unverified")}</span>
                    ) : (
                      money(
                        job.supplierVerifiedMinor,
                        job.supplierCurrency || "EUR",
                      )
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        {data && (
          <Pagination
            data={data}
            onChange={setPage}
            label={bmsg("deliveries")}
          />
        )}
      </section>
      <p className="bv-source-note">
        {bmsg(
          "Destination countries come from validated dispatch metadata. Email addresses and older dispatches without a verified country remain “unspecified”. No contents or recipients are displayed.",
        )}
      </p>
    </>
  );
}
