import { describe, expect, it } from "vitest";
import {
  canonicalApplicationRoute,
  distributionPreparationRoute,
  generationSelectionRoute,
  readGenerationSelection,
  navigationEntryFor,
  spaceHome,
  spaceOf,
  studioRoutes,
} from "../../apps/web/src/app-routes";

describe("application routes", () => {
  it("moves earlier Studio links to their Studio address and keeps the query", () => {
    expect(canonicalApplicationRoute("/app/templates")).toBe(
      "/app/studio/templates",
    );
    expect(canonicalApplicationRoute("/app/templates?new=blank")).toBe(
      "/app/studio/templates?new=blank",
    );
    expect(canonicalApplicationRoute("/app/template/tpl_1")).toBe(
      "/app/studio/template/tpl_1",
    );
    expect(canonicalApplicationRoute("/app/datasets")).toBe(
      "/app/studio/datasets",
    );
    expect(canonicalApplicationRoute("/app/dataset/ds_1")).toBe(
      "/app/studio/dataset/ds_1",
    );
    expect(canonicalApplicationRoute("/app/generations")).toBe(
      "/app/studio/generations",
    );
    expect(canonicalApplicationRoute("/app/generation/job_1?record=r1")).toBe(
      "/app/studio/generation/job_1?record=r1",
    );
    expect(canonicalApplicationRoute("/app/studio")).toBe(
      "/app/studio/templates",
    );
    expect(canonicalApplicationRoute("/app/studio/")).toBe(
      "/app/studio/templates",
    );
  });

  it("leaves current, workshop and look-alike routes unchanged", () => {
    for (const route of [
      "/app",
      "/app/studio/templates",
      "/app/studio/template/tpl_1",
      "/app/distribution/plan_1",
      "/app/documents?document=doc_1",
      "/app/templates-archive",
      "/app/my-documents",
      "/",
    ])
      expect(canonicalApplicationRoute(route)).toBe(route);
  });

  it("carries only bounded record IDs through preparation and return URLs", () => {
    const ids = ["record-1", "business & 2", "__proto__"];
    const route = distributionPreparationRoute("job-1", ids);
    expect(route).toBe(
      "/app/distribution/new?generation=job-1&selected=record-1&selected=business+%26+2&selected=__proto__",
    );
    expect(readGenerationSelection(route)).toEqual({
      recordIds: ids,
      valid: true,
    });
    expect(
      readGenerationSelection(generationSelectionRoute("job-1", ids)),
    ).toEqual({ recordIds: ids, valid: true });
    expect(spaceOf(route)).toBe("workshop");
    expect(navigationEntryFor(route)).toBe("dispatches");
    expect(generationSelectionRoute("job-1", [])).toBe(
      "/app/studio/generation/job-1",
    );
    expect(
      readGenerationSelection(route + "&selected=record-1").recordIds,
    ).toEqual(ids);
    for (const query of [
      "selected=",
      `selected=${"x".repeat(201)}`,
      Array(501).fill("selected=r").join("&"),
    ])
      expect(readGenerationSelection("/app/distribution/new?" + query)).toEqual(
        { recordIds: [], valid: false },
      );
  });

  it("assigns every page to one space", () => {
    expect(spaceOf("/app")).toBe("workshop");
    expect(spaceOf("/app/distribution/plan_1")).toBe("workshop");
    expect(spaceOf("/app/studio/datasets?view=all")).toBe("studio");
    expect(spaceOf("/app/my-documents/doc_1")).toBe("personal");
    expect(spaceOf("/app/services?next=%2Fapp")).toBe("personal");
    expect(spaceHome.studio).toBe(studioRoutes.templates);
  });

  it("highlights the entry that owns a detail page", () => {
    expect(navigationEntryFor("/app")).toBe("overview");
    expect(navigationEntryFor("/app/prepare?document=doc_1")).toBe(
      "dispatches",
    );
    expect(navigationEntryFor("/app/postal/review_1")).toBe("dispatches");
    // Prepared batches are sending work, even when they started in the Studio.
    expect(navigationEntryFor("/app/distribution/plan_1")).toBe("dispatches");
    expect(navigationEntryFor("/app/campaign/c_1")).toBe("campaigns");
    expect(navigationEntryFor("/app/secure-distribution/sd_1")).toBe(
      "secure-distributions",
    );
    expect(navigationEntryFor("/app/plan")).toBe("pdfChecks");
    expect(navigationEntryFor("/app/connection/claude")).toBe("connection");
    expect(navigationEntryFor(studioRoutes.template("tpl_1"))).toBe(
      "templates",
    );
    expect(navigationEntryFor(studioRoutes.dataset("ds_1"))).toBe("datasets");
    expect(navigationEntryFor(studioRoutes.generation("job_1"))).toBe(
      "generations",
    );
    expect(navigationEntryFor("/app/account")).toBeUndefined();
    expect(navigationEntryFor("/app/my-documents")).toBeUndefined();
  });
});
