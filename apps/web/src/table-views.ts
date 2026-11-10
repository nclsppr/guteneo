import type { TableSort } from "./data-table-model";

export type TableViewSchema = {
  columns: readonly string[];
  filterValues: Readonly<Record<string, readonly string[]>>;
  pageSizes: readonly number[];
};
export type TablePresentation = {
  sort: TableSort | null;
  filters: Record<string, string>;
  pageSize: number;
};
export type SavedTableView = TablePresentation & { id: string; name: string };
export type TableViewIdentity = {
  userId: string;
  workspaceId: string;
  area?: "workspace" | "personal" | "platform";
};
export const maximumTableViews = 8;

export function tableViewStorageKey(
  identity: TableViewIdentity,
  table: string,
): string | null {
  if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(table)) return null;
  if (
    ![identity.userId, identity.workspaceId].every(
      (value) =>
        typeof value === "string" && value.length > 0 && value.length <= 200,
    )
  )
    return null;
  return `guteneo.table-views.v1:${encodeURIComponent(JSON.stringify([identity.area ?? "workspace", identity.userId, identity.workspaceId, table]))}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function cleanTablePresentation(
  value: unknown,
  schema: TableViewSchema,
): TablePresentation {
  const input = record(value) ? value : {};
  const sort =
    record(input.sort) &&
    typeof input.sort.column === "string" &&
    schema.columns.includes(input.sort.column) &&
    (input.sort.direction === "asc" || input.sort.direction === "desc")
      ? {
          column: input.sort.column,
          direction: input.sort.direction as "asc" | "desc",
        }
      : null;
  const filters: Record<string, string> = Object.create(null);
  if (record(input.filters))
    for (const [key, value] of Object.entries(input.filters).slice(0, 12)) {
      if (
        typeof value === "string" &&
        Object.hasOwn(schema.filterValues, key) &&
        schema.filterValues[key].includes(value)
      )
        filters[key] = value;
    }
  return {
    sort,
    filters,
    pageSize:
      typeof input.pageSize === "number" &&
      schema.pageSizes.includes(input.pageSize)
        ? input.pageSize
        : (schema.pageSizes[0] ?? 10),
  };
}
/** The schema deliberately has no row, cell, query, recipient or cursor field. */
export function readTableViews(
  raw: string | null,
  schema: TableViewSchema,
): SavedTableView[] {
  if (!raw || raw.length > 24_576) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !record(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.views) ||
      parsed.views.length > maximumTableViews
    )
      return [];
    const ids = new Set<string>();
    return parsed.views.flatMap((item): SavedTableView[] => {
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 48
      )
        return [];
      ids.add(item.id);
      return [
        {
          id: item.id,
          name: item.name.trim(),
          ...cleanTablePresentation(item, schema),
        },
      ];
    });
  } catch {
    return [];
  }
}
export function writeTableViews(
  views: readonly SavedTableView[],
  schema: TableViewSchema,
): string {
  const cleaned = views.slice(0, maximumTableViews).map((view) => ({
    id: view.id,
    name: view.name.trim().slice(0, 48),
    ...cleanTablePresentation(view, schema),
  }));
  return JSON.stringify({ version: 1, views: cleaned });
}
