import {
  Children,
  isValidElement,
  useId,
  useMemo,
  useState,
  type Key,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { formatLocale, useLocale } from "./locale";
import { msg } from "./messages";
import {
  compareTableValues,
  normalizeTableSearch,
  tablePage,
  type TableSort,
  type TableValue,
} from "./data-table-model";
import { scrollTable } from "./table-keyboard";
import "./data-table.css";
export { tableTimestamp } from "./data-table-model";

export type DataTableColumn<T> = {
  id: string;
  label: ReactNode;
  value: (item: T) => TableValue;
  render?: (item: T) => ReactNode;
  searchValue?: (item: T) => string;
  className?: string;
  sortable?: boolean;
  sortType?: "decimal";
  rowHeader?: boolean;
  cardSpan?: "full";
};
export type DataTableFilter<T> = {
  id: string;
  label: string;
  value: (item: T) => string;
  options: readonly { value: string; label: string }[];
};

function labelText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child): string => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? labelText(child.props.children)
        : "";
    })
    .join("");
}

const NO_FILTERS: readonly never[] = [];

/** Controls only the authorized rows supplied by the caller; never fetches data. */
export function DataTable<T>({
  label,
  items,
  columns,
  getRowKey,
  filters = NO_FILTERS,
  pageSize = 10,
  searchable = true,
  pagination = true,
  caption,
  ariaBusy,
  layout = "cards",
  className = "",
  toolbar,
  getRowClassName,
  empty,
  scope = "loaded",
}: {
  label: string;
  scope?: "loaded" | "page";
  items: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowKey: (item: T) => Key;
  filters?: readonly DataTableFilter<T>[];
  pageSize?: number;
  searchable?: boolean;
  pagination?: boolean;
  caption?: ReactNode;
  ariaBusy?: boolean;
  layout?: "cards" | "scroll";
  className?: string;
  toolbar?: (visibleItems: readonly T[]) => ReactNode;
  getRowClassName?: (item: T) => string;
  empty?: ReactNode;
}) {
  const id = useId();
  useLocale();
  const locale = formatLocale();
  const [query, setQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<
    Record<string, string>
  >({});
  const [sort, setSort] = useState<TableSort | null>(null);
  const [requestedPage, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const sortable = columns.filter((column) => column.sortable !== false);
  const rows = useMemo(() => {
    const words = normalizeTableSearch(query.trim())
      .split(/\s+/)
      .filter(Boolean);
    const result = items.filter((item) => {
      if (
        filters.some(
          (filter) =>
            selectedFilters[filter.id] &&
            filter.value(item) !== selectedFilters[filter.id],
        )
      )
        return false;
      if (!words.length) return true;
      const text = normalizeTableSearch(
        columns
          .map(
            (column) =>
              column.searchValue?.(item) ?? String(column.value(item) ?? ""),
          )
          .join(" "),
      );
      return words.every((word) => text.includes(word));
    });
    const column =
      sort &&
      columns.find(
        (candidate) =>
          candidate.id === sort.column && candidate.sortable !== false,
      );
    if (column && sort) {
      const collator = new Intl.Collator(locale, {
        numeric: true,
        sensitivity: "base",
      });
      result.sort((a, b) =>
        compareTableValues(
          column.value(a),
          column.value(b),
          collator,
          sort.direction,
          column.sortType,
        ),
      );
    }
    return result;
  }, [items, columns, filters, selectedFilters, sort, query, locale]);
  const paging = tablePage(
    rows.length,
    pagination ? size : Math.max(1, rows.length),
    requestedPage,
  );
  const visible = rows.slice(paging.start, paging.end);
  const active = !!query || Object.values(selectedFilters).some(Boolean);

  function changeSort(column: string) {
    setSort((current) => ({
      column,
      direction:
        current?.column === column && current.direction === "asc"
          ? "desc"
          : "asc",
    }));
    setPage(0);
  }
  function reset() {
    setQuery("");
    setSelectedFilters({});
    setPage(0);
  }

  return (
    <div
      className={`data-table ${className}`}
      data-layout={layout}
      aria-busy={ariaBusy}
    >
      <div className="data-table__toolbar" role="group" aria-label={label}>
        {searchable && (
          <div className="data-table__search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label={msg("Search in {0}", label)}
              placeholder={msg("Search loaded rows")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
        )}
        {filters.map((filter) => (
          <label className="data-table__filter" key={filter.id}>
            <span className="sr-only">{filter.label}</span>
            <select
              value={selectedFilters[filter.id] ?? ""}
              onChange={(event) => {
                setSelectedFilters((current) => ({
                  ...current,
                  [filter.id]: event.target.value,
                }));
                setPage(0);
              }}
            >
              <option value="">{msg("{0}: all", filter.label)}</option>
              {filter.options.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {active && (
          <button
            className="button subtle small data-table__reset"
            type="button"
            onClick={reset}
          >
            <X size={16} aria-hidden="true" />
            {msg("Clear filters")}
          </button>
        )}
        {!!sortable.length && (
          <div className="data-table__mobile-sort">
            <label>
              <span className="sr-only">{msg("Sort by column")}</span>
              <select
                value={sort?.column ?? ""}
                onChange={(event) => {
                  setSort(
                    event.target.value
                      ? { column: event.target.value, direction: "asc" }
                      : null,
                  );
                  setPage(0);
                }}
              >
                <option value="">{msg("Sort by column")}</option>
                {sortable.map((column) => (
                  <option key={column.id} value={column.id}>
                    {labelText(column.label)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button subtle small"
              disabled={!sort}
              aria-label={
                sort?.direction === "asc"
                  ? msg("Sort descending")
                  : msg("Sort ascending")
              }
              onClick={() => {
                if (sort) {
                  setSort({
                    ...sort,
                    direction: sort.direction === "asc" ? "desc" : "asc",
                  });
                  setPage(0);
                }
              }}
            >
              {sort?.direction === "desc" ? (
                <ArrowDown size={18} aria-hidden="true" />
              ) : (
                <ArrowUp size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
      {toolbar && (
        <div className="data-table__selection">{toolbar(visible)}</div>
      )}
      <div
        className="data-table__scroll"
        role="region"
        aria-label={msg("Table: {0}", label)}
        tabIndex={0}
        onKeyDown={scrollTable}
      >
        <table
          className="data-table__grid"
          role="table"
          aria-label={caption ? undefined : label}
        >
          {caption && <caption>{caption}</caption>}
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((column) => (
                <th
                  role="columnheader"
                  scope="col"
                  key={column.id}
                  className={column.className}
                  aria-sort={
                    sort?.column === column.id
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : column.sortable === false
                        ? undefined
                        : "none"
                  }
                >
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <>
                      <span className="data-table__heading-label">
                        {column.label}
                      </span>
                      <button
                        type="button"
                        className="data-table__sort"
                        onClick={() => changeSort(column.id)}
                      >
                        {column.label}
                        {sort?.column === column.id ? (
                          sort.direction === "asc" ? (
                            <ArrowUp size={14} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={14} aria-hidden="true" />
                          )
                        ) : (
                          <ArrowsDownUp size={14} aria-hidden="true" />
                        )}
                      </button>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.map((item) => (
              <tr
                role="row"
                key={getRowKey(item)}
                className={getRowClassName?.(item)}
              >
                {columns.map((column, index) => {
                  const rowHeader = column.rowHeader ?? index === 0;
                  const Cell = rowHeader ? "th" : "td";
                  return (
                    <Cell
                      role={rowHeader ? "rowheader" : "cell"}
                      scope={rowHeader ? "row" : undefined}
                      key={column.id}
                      className={column.className}
                      data-column={column.id}
                      data-card-span={column.cardSpan}
                    >
                      <span
                        className="data-table__cell-label"
                        aria-hidden="true"
                      >
                        {column.label}
                      </span>
                      <div className="data-table__cell-value">
                        {column.render
                          ? column.render(item)
                          : column.value(item)}
                      </div>
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="data-table__empty" role="status">
            {active ? (
              <>
                <p>{msg("No matching rows")}</p>
                <button
                  type="button"
                  className="button subtle small"
                  onClick={reset}
                >
                  {msg("Clear filters")}
                </button>
              </>
            ) : (
              (empty ?? <p>{msg("No rows to display")}</p>)
            )}
          </div>
        )}
      </div>
      <div className="data-table__footer">
        <span
          className="data-table__count"
          aria-live="polite"
          aria-atomic="true"
        >
          {scope === "page"
            ? msg("{0} rows on this page", rows.length)
            : msg(
                "{0}–{1} of {2} loaded rows",
                rows.length ? paging.start + 1 : 0,
                paging.end,
                rows.length,
              )}
          {active && (
            <span> · {msg("{0} before filtering", items.length)}</span>
          )}
        </span>
        {pagination && (
          <div className="data-table__pagination">
            <label htmlFor={`${id}-size`}>{msg("Rows per page")}</label>
            <select
              id={`${id}-size`}
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {[...new Set([pageSize, 10, 25, 50])]
                .sort((a, b) => a - b)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
            <nav aria-label={msg("Pagination for {0}", label)}>
              <button
                className="button subtle small"
                type="button"
                aria-label={msg("Previous page")}
                disabled={paging.page === 0}
                onClick={() => setPage(paging.page - 1)}
              >
                <CaretLeft size={18} aria-hidden="true" />
              </button>
              <span>
                {msg("Page {0} of {1}", paging.page + 1, paging.pages)}
              </span>
              <button
                className="button subtle small"
                type="button"
                aria-label={msg("Next page")}
                disabled={paging.page + 1 === paging.pages}
                onClick={() => setPage(paging.page + 1)}
              >
                <CaretRight size={18} aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
