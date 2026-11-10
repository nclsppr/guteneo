import { msg } from "./messages";
import { useCallback, useState, type ReactNode } from "react";
import {
  dispatchGroupNames,
  isDispatchGroup,
} from "../../../packages/contracts/src/dispatch-groups";
import { Plus } from "@phosphor-icons/react";
import { type Dispatch, type Page } from "./api";
import { t } from "./locale";
import {
  DispatchTable,
  ErrorNotice,
  Loading,
  LoadMore,
  PageHeading,
  RefreshButton,
  useRefreshOnFocus,
  useResource,
  useRoute,
} from "./components";

export function DispatchList({ canPrepare = true }: { canPrepare?: boolean }) {
  const route = useRoute();
  const requested = new URLSearchParams(route.split("?")[1]).get("group");
  const group = isDispatchGroup(requested) ? requested : undefined;
  const path = group ? `/dispatches?group=${group}` : "/dispatches";
  return (
    <>
      <PageHeading
        title={t.dispatch.listTitle}
        action={
          canPrepare && (
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
      {/* A new key per filter: never show the previous selection's rows. */}
      <DispatchListResults
        key={path}
        path={path}
        filtered={!!group}
        canPrepare={canPrepare}
      >
        <nav className="dispatch-filter" aria-label={t.dispatch.filterLabel}>
          {([undefined, ...dispatchGroupNames] as const).map((item) => (
            <a
              key={item ?? "all"}
              href={
                item ? `#/app/dispatches?group=${item}` : "#/app/dispatches"
              }
              aria-current={item === group ? "page" : undefined}
            >
              {t.dispatch.groups[item ?? "all"]}
            </a>
          ))}
        </nav>
      </DispatchListResults>
    </>
  );
}

function DispatchListResults({
  path,
  filtered,
  canPrepare,
  children,
}: {
  path: string;
  filtered: boolean;
  canPrepare: boolean;
  children: ReactNode;
}) {
  const resource = useResource<Page<Dispatch>>(path);
  // Pages added with "load more" stay until an explicit refresh: re-reading
  // the first page on focus would drop them and move the reading position.
  const [extended, setExtended] = useState(false);
  const refresh = resource.refresh;
  const reload = useCallback(() => {
    setExtended(false);
    refresh();
  }, [refresh]);
  useRefreshOnFocus(refresh, !extended);
  return (
    <>
      <div className="section-toolbar">
        {children}
        <RefreshButton onClick={reload} disabled={resource.loading} />
      </div>
      <ErrorNotice error={resource.error} retry={reload} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data &&
        (filtered && !resource.data.items.length ? (
          <p className="empty-inline">{t.dispatch.groupEmpty}</p>
        ) : (
          <DispatchTable
            items={resource.data.items}
            emptyAction={
              canPrepare && (
                <div className="button-group">
                  <a className="button" href="#/app/prepare">
                    {t.dispatch.new}
                  </a>
                  <a className="button" href="#/app/studio/generations">
                    {msg("From a generation")}
                  </a>
                </div>
              )
            }
          />
        ))
      )}
      <LoadMore
        path={path}
        data={resource.data}
        onLoaded={(page) => {
          setExtended(true);
          resource.setData(page);
        }}
      />
    </>
  );
}
