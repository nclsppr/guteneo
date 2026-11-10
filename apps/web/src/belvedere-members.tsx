import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import type {
  BelvedereMember,
  BelvederePage,
} from "../../../packages/contracts/src/belvedere";
import {
  dateTime,
  number,
  queryString,
  roleName,
  shortDate,
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
  Pagination,
  Search,
  initials,
} from "./belvedere-view-components";

export function Members({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<BelvederePage<BelvedereMember>>(
    `${basePath}/api/members?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("Member directory")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Name or email address…")}
            label={bmsg("Search members")}
          />
        }
      >
        {data ? bmsg("{0} people", number(data.total)) : bmsg("All members")}
        {bmsg(" · Memberships and connections reflect the current state")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty title={bmsg("No matching members.")}>
          {bmsg("Try another name, email address or mode.")}
        </Empty>
      ) : (
        <DataTable
          viewId="platform-members"
          label={bmsg("Members and access")}
          className="bv-data-table"
          items={data.items}
          getRowKey={(member) => member.id}
          searchable={false}
          pagination={false}
          scope="page"
          columns={[
            {
              id: "member",
              label: bmsg("Member"),
              value: (member) => `${member.name} ${member.email}`,
              render: (member) => (
                <>
                  <div className="bv-person">
                    <span className="bv-avatar">{initials(member.name)}</span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </div>
                  </div>
                </>
              ),
            },
            {
              id: "workshops",
              label: bmsg("Workshops and roles"),
              value: (member) =>
                member.workshops
                  .map(
                    (workshop) => `${workshop.name} ${roleName(workshop.role)}`,
                  )
                  .join(" "),
              render: (member) => (
                <>
                  <div className="bv-memberships">
                    {member.workshops.map((workshop) => (
                      <div key={workshop.id}>
                        <button
                          className="bv-table-link"
                          onClick={() => openWorkshop(workshop)}
                        >
                          {workshop.name}
                          <ArrowUpRight size={13} />
                        </button>
                        <small>
                          {roleName(workshop.role)}
                          {workshop.role === "supervisor" &&
                          (workshop.canApprove || workshop.canReport)
                            ? ` · ${[workshop.canApprove ? bmsg("approval") : "", workshop.canReport ? bmsg("reports") : ""].filter(Boolean).join(", ")}`
                            : ""}
                        </small>
                      </div>
                    ))}
                    {member.workshopsTotal > member.workshops.length && (
                      <small>
                        {number(member.workshops.length)}
                        {bmsg(" workshops shown out of")}{" "}
                        {number(member.workshopsTotal)}
                        {bmsg(". View other memberships from the workshops.")}
                      </small>
                    )}
                  </div>
                </>
              ),
            },
            {
              id: "connections",
              label: bmsg("Active connections"),
              value: (member) => member.activeConnections,
              className: "bv-numeric",
              render: (member) => <>{number(member.activeConnections)}</>,
            },
            {
              id: "lastSeen",
              label: bmsg("Last observed connection"),
              value: (member) => member.lastSeenAt,
              className: "bv-date-cell",
              render: (member) => <>{dateTime(member.lastSeenAt)}</>,
            },
            {
              id: "registered",
              label: bmsg("Registration"),
              value: (member) => member.createdAt,
              className: "bv-date-cell",
              render: (member) => <>{shortDate(member.createdAt)}</>,
            },
          ]}
        />
      )}
      {data && (
        <Pagination data={data} onChange={setPage} label={bmsg("members")} />
      )}
    </section>
  );
}
