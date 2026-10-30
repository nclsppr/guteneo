import { describe, expect, it } from "vitest";
import {
  createPreviewData,
  PREVIEW_DATA_COLLECTIONS,
  PREVIEW_DATA_MAX_RECORDS,
  PREVIEW_DATA_PAGE_SIZE,
  PreviewDataError,
  type PreviewDataCounts,
  type PreviewDataOptions,
  type PreviewDataPage,
} from "../../apps/web/src/preview-data";
import {
  DISPATCH_GROUPS,
  type DispatchGroup,
} from "../../packages/contracts/src/dispatch-groups";
import {
  WORKSPACE_ROLES,
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";
import { validateTemplateEnvelope } from "../../packages/contracts/src/templates";

const counts: PreviewDataCounts = {
  documents: 123,
  dispatches: 217,
  templates: 79,
  datasets: 97,
  generations: 153,
};
const options = (
  overrides: Partial<PreviewDataOptions> = {},
): PreviewDataOptions => ({
  seed: "reproducible-fixture-42",
  workspace: "fictional-workshop",
  counts,
  ...overrides,
});
const make = (overrides: Partial<PreviewDataOptions> = {}) =>
  createPreviewData(options(overrides));

function expectCursorError(read: () => unknown) {
  expect(read).toThrow(PreviewDataError);
  try {
    read();
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
  }
}

describe("seeded fictional preview metadata", () => {
  it("reproduces the same pages and details independently of request order", () => {
    const first = make();
    const second = make();
    second.page("datasets");
    second.page("dispatches", { group: "attention" });
    for (const collection of PREVIEW_DATA_COLLECTIONS) {
      const page = first.page(collection);
      expect(second.page(collection)).toEqual(page);
      for (const item of page.items)
        expect(first.get(collection, item.id)).toEqual(item);
      expect(second.page(collection, { cursor: page.nextCursor })).toEqual(
        first.page(collection, { cursor: page.nextCursor }),
      );
    }
  });

  it("changes the fictional dataset on a new seed or workspace", () => {
    const original = make().page("documents");
    expect(make({ seed: "rerolled-fixture" }).page("documents")).not.toEqual(
      original,
    );
    expect(
      make({ workspace: "another-fictional-workshop" }).page("documents"),
    ).not.toEqual(original);
  });

  it("copies and freezes scalar totals instead of retaining mutable caller counts", () => {
    const supplied = { ...counts };
    const data = make({ counts: supplied });
    supplied.documents = 0;
    const suppliedOptions = options();
    const stable = createPreviewData(suppliedOptions);
    const before = stable.page("templates");
    suppliedOptions.workspace = "changed-after-creation";
    suppliedOptions.seed = "changed-after-creation";
    expect(stable.page("templates")).toEqual(before);
    expect(data.counts.documents).toBe(counts.documents);
    expect(Object.isFrozen(data.counts)).toBe(true);
    expect(
      Object.values(data.counts).every((count) => typeof count === "number"),
    ).toBe(true);
  });

  it("keeps billion-record collections logical and each response bounded to fifty metadata records", () => {
    const hugeCounts = Object.fromEntries(
      PREVIEW_DATA_COLLECTIONS.map((collection) => [
        collection,
        PREVIEW_DATA_MAX_RECORDS,
      ]),
    ) as PreviewDataCounts;
    const data = make({ counts: hugeCounts });
    for (const collection of PREVIEW_DATA_COLLECTIONS) {
      const page = data.page(collection, { limit: 1_000_000 });
      expect(page.total).toBe(PREVIEW_DATA_MAX_RECORDS);
      expect(page.items).toHaveLength(PREVIEW_DATA_PAGE_SIZE);
      expect(page.nextCursor).not.toBeNull();
      expect(JSON.stringify(page).length).toBeLessThan(150_000);
      expect(data.get(collection, page.items[0].id)).toEqual(page.items[0]);
    }
    expect(data.overview().documents).toBe(PREVIEW_DATA_MAX_RECORDS);
    expect(data.overview().dispatches.total).toBe(PREVIEW_DATA_MAX_RECORDS);
  });

  it.each(PREVIEW_DATA_COLLECTIONS)(
    "paginates %s without duplicates, omissions or changing metadata",
    (collection) => {
      const data = make();
      let cursor: string | null = null;
      const ids: string[] = [];
      do {
        const page: PreviewDataPage<{ id: string }> = data.page(collection, {
          cursor,
          limit: 17,
        });
        expect(page.items.length).toBeLessThanOrEqual(17);
        expect(page.total).toBe(counts[collection]);
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toHaveLength(counts[collection]);
      expect(new Set(ids).size).toBe(counts[collection]);
      expect(ids.slice(0, 50)).toEqual(
        data.page(collection).items.map((item) => item.id),
      );
    },
  );

  it("reads an indexed record directly, including the end of a billion-record collection", () => {
    const huge = make({
      counts: { ...counts, documents: PREVIEW_DATA_MAX_RECORDS },
    });
    const last = huge.at("documents", PREVIEW_DATA_MAX_RECORDS - 1)!;
    expect(last.id).toBeTruthy();
    expect(huge.get("documents", last.id)).toEqual(last);
    expect(huge.at("documents", 0)).toEqual(huge.page("documents").items[0]);
    for (const invalid of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      PREVIEW_DATA_MAX_RECORDS,
    ])
      expect(huge.at("documents", invalid)).toBeUndefined();
  });

  it("returns genuinely empty collections without an unusable next cursor", () => {
    const empty = Object.fromEntries(
      PREVIEW_DATA_COLLECTIONS.map((collection) => [collection, 0]),
    ) as PreviewDataCounts;
    const data = make({ counts: empty });
    for (const collection of PREVIEW_DATA_COLLECTIONS)
      expect(data.page(collection)).toEqual({
        items: [],
        nextCursor: null,
        total: 0,
      });
    expect(data.overview()).toEqual({
      documents: 0,
      dispatches: {
        total: 0,
        approval: 0,
        in_progress: 0,
        attention: 0,
        done: 0,
      },
    });
  });

  it("treats every document and recipient as explicitly fictional simulation metadata", () => {
    const data = make();
    for (const document of data.page("documents").items) {
      expect(document.name).toMatch(/^Fictional /);
      expect(document.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(document.size).toBeGreaterThan(0);
      expect(document.pages).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(document.created_at))).toBe(true);
    }
    for (const dispatch of data.page("dispatches").items) {
      expect(dispatch.mode).toBe("simulation");
      expect(Number.isInteger(dispatch.estimated_minor)).toBe(true);
      expect(dispatch.sender_address).toContain("Fictional");
      const recipient = dispatch.recipient_json as Record<string, string>;
      if (dispatch.channel === "email")
        expect(recipient.email).toMatch(/@example\.invalid$/);
      if (dispatch.channel === "postal")
        expect(recipient.name).toMatch(/^Fictional /);
      const detail = data.dispatchDetail(dispatch.id);
      expect(detail?.dispatch).toEqual(dispatch);
      expect(detail?.approval).toBeNull();
      expect(detail?.attempts).toEqual([]);
      expect(detail?.events[0].detail).toContain(
        "No provider has been contacted",
      );
    }
  });
});

describe("fictional cursor and identity boundaries", () => {
  it("rejects cursors from another seed, workspace, volume, collection or filter", () => {
    const data = make();
    const cursor = data.page("dispatches").nextCursor!;
    expectCursorError(() =>
      make({ seed: "different" }).page("dispatches", { cursor }),
    );
    expectCursorError(() =>
      make({ workspace: "different" }).page("dispatches", { cursor }),
    );
    expectCursorError(() =>
      make({ counts: { ...counts, documents: counts.documents + 1 } }).page(
        "dispatches",
        { cursor },
      ),
    );
    expectCursorError(() => data.page("documents", { cursor }));
    expectCursorError(() =>
      data.page("dispatches", { cursor, group: "attention" }),
    );
    const filteredCursor = data.page("dispatches", {
      group: "attention",
    }).nextCursor!;
    expectCursorError(() =>
      data.page("dispatches", { cursor: filteredCursor, group: "approval" }),
    );
  });

  it("rejects malformed, noncanonical and out-of-range cursors", () => {
    const data = make();
    const cursor = data.page("documents").nextCursor!;
    const prefix = cursor.slice(0, cursor.lastIndexOf(".") + 1);
    for (const invalid of [
      "",
      "malformed",
      `${prefix}-1`,
      `${prefix}01`,
      `${prefix}NaN`,
      `${prefix}1.2`,
      `${prefix}${counts.documents.toString(36)}`,
      `${prefix}zzzzzzzzzzzzzzzz`,
    ])
      expectCursorError(() => data.page("documents", { cursor: invalid }));
  });

  it("never resolves another collection or workspace record through direct detail lookup", () => {
    const data = make();
    const id = data.page("documents").items[0].id;
    expect(data.get("datasets", id)).toBeNull();
    expect(make({ workspace: "different" }).get("documents", id)).toBeNull();
    expect(make({ seed: "different" }).get("documents", id)).toBeNull();
    expect(data.get("documents", `${id}0`)).toBeNull();
    expect(data.get("documents", "__proto__")).toBeNull();
    expect(data.dispatchDetail(id)).toBeNull();
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    PREVIEW_DATA_MAX_RECORDS + 1,
  ])("rejects invalid logical count %s", (documents) => {
    expect(() => make({ counts: { ...counts, documents } })).toThrow(
      PreviewDataError,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page limit %s",
    (limit) => {
      expect(() => make().page("documents", { limit })).toThrow(
        PreviewDataError,
      );
    },
  );

  it("never introduces platform observation as a fifth membership role", () => {
    expect(WORKSPACE_ROLES).toHaveLength(4);
    expect(() => make({ role: "belvedere" as WorkspaceRole })).toThrow(
      PreviewDataError,
    );
    expect(() => make({ seed: "" })).toThrow(PreviewDataError);
    expect(() => make({ workspace: "" })).toThrow(PreviewDataError);
    expect(() => make({ seed: Number.NaN })).toThrow(PreviewDataError);
  });
});

describe("fictional status totals and Studio associations", () => {
  it.each([0, 1, 15, 16, 17, 239, PREVIEW_DATA_MAX_RECORDS])(
    "counts status groups at volume %s without materializing the collection",
    (dispatchCount) => {
      const data = make({ counts: { ...counts, dispatches: dispatchCount } });
      const summary = data.overview().dispatches;
      expect(
        summary.approval +
          summary.in_progress +
          summary.attention +
          summary.done,
      ).toBe(dispatchCount);
      for (const [group, states] of Object.entries(DISPATCH_GROUPS)) {
        const page = data.page("dispatches", { group: group as DispatchGroup });
        expect(page.total).toBe(summary[group as DispatchGroup]);
        expect(
          page.items.every((item) =>
            (states as readonly string[]).includes(item.status),
          ),
        ).toBe(true);
        if (dispatchCount < 300) {
          let cursor: string | null = null;
          const ids: string[] = [];
          do {
            const current: PreviewDataPage<{ id: string }> = data.page(
              "dispatches",
              {
                group: group as DispatchGroup,
                cursor,
                limit: 7,
              },
            );
            ids.push(...current.items.map((item) => item.id));
            cursor = current.nextCursor;
          } while (cursor);
          expect(new Set(ids).size).toBe(summary[group as DispatchGroup]);
          expect(ids).toHaveLength(summary[group as DispatchGroup]);
        }
      }
    },
  );

  it("keeps real serializable template contracts and respects the four role projections", () => {
    for (const role of WORKSPACE_ROLES) {
      const data = make({ role });
      for (const model of data.page("templates").items) {
        expect(validateTemplateEnvelope(model.envelope)).toEqual(
          model.envelope,
        );
        const canPrepare = workspacePermissions(role).prepareDispatches;
        expect(model.permissions).toEqual({
          use: canPrepare,
          edit: canPrepare,
          publish: canPrepare,
          share: canPrepare,
        });
        expect(model.canDelete).toBe(canPrepare);
        expect(model.envelope.sampleDataSynthetic).toBe(true);
        expect(model.envelope.resources).toEqual([]);
      }
    }
  });

  it("keeps generation counters bounded and resolves generated cross references on demand", () => {
    const data = make();
    for (const job of data.page("generations").items) {
      expect(job.mode).toBe("generate_only");
      expect(job.total).toBeGreaterThanOrEqual(1);
      expect(job.total).toBeLessThanOrEqual(500);
      expect(job.generated + job.failed + job.pending + job.cancelled).toBe(
        job.total,
      );
      expect(data.get("templates", job.templateId)).not.toBeNull();
      expect(data.get("datasets", job.datasetId!)).not.toBeNull();
      expect(job.mappingId).toBeNull();
    }
    for (const dispatch of data.page("dispatches").items)
      expect(data.get("documents", dispatch.document_id!)).not.toBeNull();
  });
});
