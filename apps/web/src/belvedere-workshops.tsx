import { Disclosure } from "./components";
import { Channels } from "./belvedere-summary-components";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle } from "@phosphor-icons/react";
import type {
  BelvederePage,
  BelvedereWorkshop,
  BelvedereWorkshopDetail,
} from "../../../packages/contracts/src/belvedere";
import {
  channelName,
  dateTime,
  money,
  number,
  queryString,
  roleName,
  shortDate,
  statusName,
  useBelvedereResource,
  useDebounced,
} from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import { belvedereCount } from "./belvedere-presentation";
import { DataTable } from "./data-table";
import {
  type ViewProps,
  Failure,
  Loading,
  Empty,
  SectionHeading,
  Stat,
  Status,
  Mode,
  Pagination,
  Search,
  initials,
} from "./belvedere-view-components";

export function Workshops({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<
    BelvederePage<BelvedereWorkshop>
  >(
    `${basePath}/api/workshops?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("All workshops")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Workshop name…")}
            label={bmsg("Search workshops")}
          />
        }
      >
        {data
          ? belvedereCount("workshops", data.total)
          : bmsg("Browsing workshops")}{" "}
        {bmsg("· Activity filtered by period")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty
          title={
            search
              ? bmsg("No matching workshops.")
              : bmsg("No workshops in this mode.")
          }
        >
          {search
            ? bmsg("Try a shorter name or clear the search.")
            : bmsg("Change the data filter to view other workshops.")}
        </Empty>
      ) : (
        <DataTable
          viewId="platform-workshops"
          label={bmsg("Workshops and consumption")}
          className="bv-data-table"
          items={data.items}
          getRowKey={(item) => item.id}
          searchable={false}
          pagination={false}
          scope="page"
          columns={[
            {
              id: "workshop",
              label: bmsg("Workshop"),
              value: (item) => item.name,
              render: (item) => (
                <>
                  <button
                    className="bv-table-link"
                    onClick={() => openWorkshop(item)}
                  >
                    {item.name}
                  </button>
                </>
              ),
            },
            {
              id: "mode",
              label: bmsg("Data"),
              value: (item) => item.mode,
              render: (item) => <Mode mode={item.mode} />,
            },
            {
              id: "members",
              label: bmsg("Members"),
              value: (item) => item.members,
              className: "bv-numeric",
              render: (item) => <>{number(item.members)}</>,
            },
            {
              id: "dispatches",
              label: bmsg("Dispatches"),
              value: (item) => item.dispatches,
              className: "bv-numeric",
              render: (item) => <>{number(item.dispatches)}</>,
            },
            {
              id: "pages",
              label: bmsg("Pages"),
              value: (item) => item.pages,
              className: "bv-numeric",
              render: (item) => number(item.pages),
            },
            {
              id: "reserved",
              label: bmsg("Reserved"),
              value: (item) => item.reservedMinor,
              className: "bv-numeric",
              render: (item) => money(item.reservedMinor),
            },
            {
              id: "consumption",
              label: bmsg("Consumption"),
              value: (item) => item.consumptionMinor,
              className: "bv-numeric bv-emphasis",
              render: (item) => <>{money(item.consumptionMinor)}</>,
            },
            {
              id: "attention",
              label: bmsg("Needs attention"),
              value: (item) => item.attention,
              render: (item) => (
                <>
                  {item.attention > 0 ? (
                    <span className="bv-status bv-status-warning">
                      {belvedereCount("deliveries", item.attention)}
                    </span>
                  ) : (
                    <span className="bv-table-ok">
                      <CheckCircle size={16} />
                      {bmsg("Nothing to report")}
                    </span>
                  )}
                </>
              ),
            },
            {
              id: "activity",
              label: bmsg("Last activity"),
              value: (item) => item.lastActivityAt,
              className: "bv-date-cell",
              render: (item) => <>{dateTime(item.lastActivityAt)}</>,
            },
            {
              id: "actions",
              label: bmsg("Details"),
              value: (item) => item.id,
              sortable: false,
              render: (item) => (
                <>
                  <button
                    className="bv-icon-button"
                    onClick={() => openWorkshop(item)}
                    aria-label={bmsg("View {0}", item.name)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </>
              ),
            },
          ]}
        />
      )}
      {data && <Pagination data={data} onChange={setPage} kind="workshops" />}
    </section>
  );
}

export function WorkshopDetail({
  basePath,
  filters,
  revision,
  refresh,
  workshopId,
  back,
  onName,
}: ViewProps & {
  workshopId: string;
  back: () => void;
  onName: (id: string, name: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [membersPage, setMembersPage] = useState(1);
  const { data, error } = useBelvedereResource<BelvedereWorkshopDetail>(
    `${basePath}/api/workshops/${encodeURIComponent(workshopId)}?${queryString(filters, { page, pageSize: 20, membersPage })}`,
    revision,
  );
  useEffect(() => {
    if (data) onName(data.workshop.id, data.workshop.name);
  }, [data, onName]);
  return (
    <>
      <button className="bv-text-button bv-back" onClick={back}>
        <ArrowLeft size={17} />
        {bmsg("All workshops")}
      </button>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="bv-detail-meta">
            <Mode mode={data.workshop.mode} />
            <span>
              {bmsg("Created on ")}
              {shortDate(data.workshop.createdAt)}
            </span>
            <span>
              {bmsg("Last activity: ")}
              {dateTime(data.workshop.lastActivityAt)}
            </span>
          </div>
          <div className="bv-stats">
            <Stat
              label={bmsg("Consumption in this period")}
              value={money(data.workshop.consumptionMinor)}
              accent
            >
              {money(data.workshop.reservedMinor)}
              {bmsg(" reserved")}
            </Stat>
            <Stat
              label={bmsg("Dispatches")}
              value={number(data.workshop.dispatches)}
            >
              {belvedereCount("attention", data.workshop.attention)}
            </Stat>
            <Stat
              label={bmsg("Documents")}
              value={number(data.workshop.documents)}
            >
              {belvedereCount("pages", data.workshop.pages)}
            </Stat>
            <Stat
              label={bmsg("Available credit")}
              value={money(data.workshop.availableCreditMinor)}
            >
              {bmsg("Current workshop balance")}
            </Stat>
          </div>
          <div className="bv-detail-grid">
            <section className="bv-panel">
              <SectionHeading title={bmsg("Consumption by channel")}>
                {bmsg("Current amounts for dispatches created in this period")}
              </SectionHeading>
              <Channels channels={data.channels} />
            </section>
            <section className="bv-panel">
              <SectionHeading
                title={bmsg("Workspace members")}
                aside={
                  <span className="bv-count">
                    {number(data.workshop.members)}
                  </span>
                }
              />
              <div className="bv-workshop-members">
                {data.members.length ? (
                  data.members.map((member) => (
                    <div key={member.id}>
                      <span className="bv-avatar">{initials(member.name)}</span>
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.email}</span>
                      </div>
                      <span>
                        {roleName(
                          member.workshops.find(
                            (item) => item.id === workshopId,
                          )?.role || "",
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty title={bmsg("No members in this view.")}>
                    {bmsg("Members will appear after joining the workshop.")}
                  </Empty>
                )}
              </div>
              {data.membersTotal > data.membersPageSize && (
                <Pagination
                  data={{
                    total: data.membersTotal,
                    page: data.membersPage,
                    pageSize: data.membersPageSize,
                  }}
                  onChange={setMembersPage}
                  kind="members"
                />
              )}
            </section>
          </div>
          <section className="bv-panel bv-table-panel">
            <SectionHeading title={bmsg("Dispatch details")}>
              {bmsg(
                "Customer cost, reservation and verified provider cost. Document contents and recipients remain private.",
              )}
            </SectionHeading>
            {data.dispatches.items.length ? (
              <DataTable
                viewId="platform-workshop-dispatches"
                label={bmsg("Workshop dispatches")}
                className="bv-data-table"
                items={data.dispatches.items}
                getRowKey={(dispatch) => dispatch.id}
                searchable={false}
                pagination={false}
                scope="page"
                columns={[
                  {
                    id: "dispatch",
                    label: bmsg("Dispatch"),
                    value: (dispatch) => dispatch.id,
                    render: (dispatch) => (
                      <>
                        <code title={dispatch.id}>{dispatch.id}</code>
                      </>
                    ),
                  },
                  {
                    id: "created",
                    label: bmsg("Date"),
                    value: (dispatch) => dispatch.createdAt,
                    render: (dispatch) => dateTime(dispatch.createdAt),
                    className: "bv-date-cell",
                  },
                  {
                    id: "mode",
                    label: bmsg("Data"),
                    value: (dispatch) => dispatch.mode,
                    render: (dispatch) => <Mode mode={dispatch.mode} />,
                  },
                  {
                    id: "channel",
                    label: bmsg("Channel"),
                    value: (dispatch) => channelName(dispatch.channel),
                    render: (dispatch) => (
                      <>
                        <strong>{channelName(dispatch.channel)}</strong>
                      </>
                    ),
                  },
                  {
                    id: "status",
                    label: bmsg("Status"),
                    value: (dispatch) => statusName(dispatch.status),
                    render: (dispatch) => (
                      <>
                        <Status value={dispatch.status} />
                      </>
                    ),
                  },
                  {
                    id: "pages",
                    label: bmsg("Pages"),
                    value: (dispatch) => dispatch.pages,
                    className: "bv-numeric",
                    render: (dispatch) => (
                      <>
                        {dispatch.pages === null ? "—" : number(dispatch.pages)}
                      </>
                    ),
                  },
                  {
                    id: "consumed",
                    label: bmsg("Consumed"),
                    value: (dispatch) => dispatch.customerActualMinor,
                    className: "bv-numeric bv-emphasis",
                    render: (dispatch) => (
                      <>
                        {dispatch.customerActualMinor === null ? (
                          <span className="bv-subtle">
                            {bmsg("Not finalised")}
                          </span>
                        ) : (
                          money(dispatch.customerActualMinor)
                        )}
                      </>
                    ),
                  },
                  {
                    id: "reserved",
                    label: bmsg("Reserved"),
                    value: (dispatch) => dispatch.reservedMinor,
                    className: "bv-numeric",
                    render: (dispatch) => <>{money(dispatch.reservedMinor)}</>,
                  },
                  {
                    id: "provider",
                    label: bmsg("Provider cost"),
                    value: (dispatch) => dispatch.supplierVerifiedMinor,
                    className: "bv-numeric",
                    render: (dispatch) => (
                      <>
                        {dispatch.supplierVerifiedMinor === null ? (
                          <span className="bv-subtle">
                            {bmsg("Unverified")}
                          </span>
                        ) : (
                          money(
                            dispatch.supplierVerifiedMinor,
                            dispatch.supplierCurrency || "EUR",
                          )
                        )}
                      </>
                    ),
                  },
                  {
                    id: "details",
                    label: bmsg("Details"),
                    value: () => "",
                    sortable: false,
                    render: (dispatch) => (
                      <Disclosure label={bmsg("Details")}>
                        <dl className="bv-finance-lines">
                          <div>
                            <dt>{bmsg("Delivery cost")}</dt>
                            <dd>
                              {money(dispatch.transportActualMinor ?? null)}
                            </dd>
                          </div>
                          <div>
                            <dt>{bmsg("Hosting")}</dt>
                            <dd>{money(dispatch.hostingFeeMinor ?? 0)}</dd>
                          </div>
                          <div>
                            <dt>{bmsg("Quote")}</dt>
                            <dd>{money(dispatch.estimatedMinor)}</dd>
                          </div>
                          <div>
                            <dt>{bmsg("Limit")}</dt>
                            <dd>{money(dispatch.ceilingMinor)}</dd>
                          </div>
                        </dl>
                      </Disclosure>
                    ),
                  },
                ]}
              />
            ) : (
              <Empty title={bmsg("No dispatches in this period.")}>
                {bmsg("Choose another period to view this workshop’s history.")}
              </Empty>
            )}
            <Pagination
              data={data.dispatches}
              onChange={setPage}
              kind="deliveries"
            />
          </section>
        </>
      )}
    </>
  );
}
