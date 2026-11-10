import { describe, expect, it } from "vitest";
import {
  cleanTablePresentation,
  readTableViews,
  tableViewStorageKey,
  writeTableViews,
} from "../../apps/web/src/table-views";
const schema = {
  columns: ["date", "status"],
  filterValues: { status: ["prepared", "delivered"] },
  pageSizes: [10, 25, 50],
};
describe("saved table presentations", () => {
  it("isolates stable device preferences by account, workspace, table and area", () => {
    const base = { userId: "reader", workspaceId: "alpha" };
    const key = tableViewStorageKey(base, "dispatches");
    expect(key).not.toBe(
      tableViewStorageKey({ ...base, userId: "other" }, "dispatches"),
    );
    expect(key).not.toBe(
      tableViewStorageKey({ ...base, workspaceId: "beta" }, "dispatches"),
    );
    expect(key).not.toBe(tableViewStorageKey(base, "documents"));
    expect(key).not.toBe(
      tableViewStorageKey({ ...base, area: "personal" }, "dispatches"),
    );
    expect(key).toBe(tableViewStorageKey(base, "dispatches"));
    expect(tableViewStorageKey(base, "../secret")).toBeNull();
  });
  it("persists only structural fields and drops queries, rows and arbitrary categories", () => {
    const view = {
      id: "view",
      name: "Open items",
      sort: { column: "date", direction: "desc" as const },
      pageSize: 25,
      filters: { status: "prepared", recipient: "person@example.invalid" },
      query: "private search",
      rows: [{ secret: "document body" }],
    };
    const raw = writeTableViews([view], schema);
    expect(raw).not.toContain("person@example.invalid");
    expect(raw).not.toContain("private search");
    expect(raw).not.toContain("document body");
    expect(readTableViews(raw, schema)).toEqual([
      {
        id: "view",
        name: "Open items",
        sort: { column: "date", direction: "desc" },
        pageSize: 25,
        filters: { status: "prepared" },
      },
    ]);
  });
  it("recovers from malformed/oversized/foreign storage and obsolete schema fields", () => {
    for (const raw of [
      "{",
      "null",
      JSON.stringify({ version: 2, views: [] }),
      " ".repeat(25_000),
    ])
      expect(readTableViews(raw, schema)).toEqual([]);
    expect(
      cleanTablePresentation(
        {
          sort: { column: "removed", direction: "asc" },
          pageSize: 999,
          filters: { status: "removed" },
        },
        schema,
      ),
    ).toEqual({ sort: null, pageSize: 10, filters: {} });
  });
  it("ignores duplicate identities and caps the local archive", () => {
    const view = {
      id: "same",
      name: "Same",
      sort: null,
      filters: {},
      pageSize: 10,
    };
    expect(
      readTableViews(
        JSON.stringify({ version: 1, views: [view, view] }),
        schema,
      ),
    ).toHaveLength(1);
    expect(
      readTableViews(
        JSON.stringify({
          version: 1,
          views: Array.from({ length: 9 }, (_, id) => ({
            ...view,
            id: String(id),
          })),
        }),
        schema,
      ),
    ).toEqual([]);
  });
});
