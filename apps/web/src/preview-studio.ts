import type { DatasetProfile } from "../../../packages/contracts/src/datasets";
import type {
  GenerationJobView,
  GenerationResultView,
} from "../../../packages/contracts/src/template-workflow";
import type { createPreviewData } from "./preview-data";

type Data = ReturnType<typeof createPreviewData>;
type Fail = (code: string, message: string, status?: number) => never;

/** Read-only Studio views over bounded, fictional browser metadata. */
export function readPreviewStudio(path: string, data: Data | null, fail: Fail) {
  const [route, queryString] = path.split("?");
  const query = new URLSearchParams(queryString);
  const pageOptions = {
    cursor: query.get("cursor"),
    ...(query.has("limit") ? { limit: Number(query.get("limit")) } : {}),
  };
  for (const [endpoint, collection] of [
    ["/templates", "templates"],
    ["/datasets", "datasets"],
    ["/generation-jobs", "generations"],
  ] as const) {
    if (route === endpoint)
      return (
        data?.page(collection, pageOptions) ?? {
          items: [],
          nextCursor: null,
          total: 0,
        }
      );
  }
  if (route === "/mappings") return { items: [], nextCursor: null };
  if (route === "/dataset-ai-policy")
    return {
      enabled: false,
      transferApproved: false,
      dailyLimit: 0,
      usedToday: 0,
      configured: false,
      provider: "Fictional browser fixture",
      model: null,
      retention: "Memory in this tab only",
      realProviderQualified: false,
    };
  const template = route.match(/^\/templates\/([^/]+)(\/sharing)?$/);
  if (template) {
    const item = data?.get("templates", decodeURIComponent(template[1]));
    if (!item)
      return fail(
        "NOT_FOUND",
        "Template not found in this fictional workspace.",
        404,
      );
    return template[2] ? { members: [], grants: [] } : item;
  }
  const dataset = route.match(/^\/datasets\/([^/]+)(\/profile)?$/);
  if (dataset) {
    const item = data?.get("datasets", decodeURIComponent(dataset[1]));
    if (!item)
      return fail(
        "NOT_FOUND",
        "Dataset not found in this fictional workspace.",
        404,
      );
    if (!dataset[2]) return item;
    if (item.status !== "ready")
      return fail(
        "DATASET_NOT_READY",
        "This fictional dataset is not ready for a source preview.",
        409,
      );
    const sheet = query.get("sheet") ?? "Data";
    if (sheet !== "Data")
      return fail("NOT_FOUND", "Fictional sheet not found.", 404);
    const cursor = Number(query.get("cursor") ?? 0);
    const requestedLimit = Number(query.get("limit") ?? 30);
    const limit = Math.min(50, requestedLimit);
    const totalRows = 500;
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      cursor >= totalRows ||
      !Number.isSafeInteger(requestedLimit) ||
      limit < 1
    )
      return fail("INVALID_INPUT", "Invalid fictional source-page bounds.");
    const profile: DatasetProfile = {
      version: 1,
      format: item.format,
      sourceBytes: item.size,
      issues: [],
      sheets: [
        {
          name: sheet,
          nameOrigin: "generated",
          hidden: false,
          headerCandidates: [1],
          merges: [],
          rows: Array.from(
            { length: Math.min(limit, totalRows - cursor) },
            (_, index) => {
              const rowNumber = cursor + index + 1;
              const values =
                rowNumber === 1
                  ? ["Subject", "Reference", "Amount"]
                  : [
                      `Fictional record ${rowNumber - 1}`,
                      `DEMO-${rowNumber - 1}`,
                      ((rowNumber - 1) * 1.25).toFixed(2),
                    ];
              return {
                rowNumber,
                hidden: false,
                cells: values.map((raw, column) => ({
                  column: column + 1,
                  address: `${String.fromCharCode(65 + column)}${rowNumber}`,
                  raw,
                  kind:
                    rowNumber > 1 && column === 2
                      ? ("number" as const)
                      : ("text" as const),
                })),
              };
            },
          ),
        },
      ],
    };
    return {
      dataset: item,
      profile,
      pagination: {
        sheet,
        cursor,
        limit,
        totalRows,
        nextCursor: cursor + limit < totalRows ? cursor + limit : null,
        sampleValuesTruncatedAt: 256,
        otherSheetsAreHeaderSamples: false,
      },
    };
  }
  const generation = route.match(
    /^\/generation-jobs\/([^/]+)(?:\/(results|record-context|provenance))?$/,
  );
  if (!generation) return undefined;
  const job = data?.get("generations", decodeURIComponent(generation[1]));
  if (!job || !data)
    return fail(
      "NOT_FOUND",
      "Generation not found in this fictional workspace.",
      404,
    );
  if (!generation[2]) return job;
  const recordId = (index: number) => `${job.id}_record_${index.toString(36)}`;
  const recordIndex = (value: string) => {
    const prefix = `${job.id}_record_`;
    const suffix = value.startsWith(prefix) ? value.slice(prefix.length) : "";
    const index = Number.parseInt(suffix, 36);
    if (
      !/^[0-9a-z]+$/.test(suffix) ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= job.total ||
      recordId(index) !== value
    )
      return fail(
        "INVALID_PREVIEW_CURSOR",
        "Record is outside this fictional generation.",
      );
    return index;
  };
  const document = (index: number) =>
    data.counts.documents
      ? data.at("documents", index % data.counts.documents)
      : undefined;
  const recordContext = (index: number) => ({
    recordId: recordId(index),
    name: `Fictional record ${index + 1}`,
    subject: "Fictional browser fixture",
    reference: `DEMO-${index + 1}`,
  });
  const selectedRecord = query.get("recordId");
  if (generation[2] === "record-context" && selectedRecord) {
    const index = recordIndex(selectedRecord);
    return {
      ...recordContext(index),
      data: { subject: `Fictional record ${index + 1}` },
      documentId: document(index)?.id ?? null,
    };
  }
  if (generation[2] === "provenance") {
    const index = recordIndex(selectedRecord ?? "");
    return {
      recordId: recordId(index),
      templateVersion: job.templateVersion,
      mappingVersion: null,
      sourceHash: null,
      inputHash: "fictional-metadata-only",
      provenance: {},
      renderMetadata: {
        evidence: "Fictional browser fixture; no rendering performed",
      },
    };
  }
  const cursor = query.get("cursor");
  const offset = cursor ? recordIndex(cursor) + 1 : 0;
  const requestedLimit = Number(query.get("limit") ?? 50);
  const limit = Math.min(50, requestedLimit);
  if (!Number.isSafeInteger(requestedLimit) || limit < 1)
    return fail("INVALID_INPUT", "Invalid fictional result page size.");
  const indices = Array.from(
    { length: Math.min(limit, job.total - offset) },
    (_, index) => offset + index,
  );
  const nextCursor =
    offset + indices.length < job.total
      ? recordId(offset + indices.length - 1)
      : null;
  if (generation[2] === "record-context")
    return {
      items: indices.map(recordContext),
      nextCursor,
      templateName: data.get("templates", job.templateId)?.name ?? null,
    };
  return {
    items: indices.map((index): GenerationResultView => {
      const source = document(index);
      const state = resultState(job, index);
      return {
        recordId: recordId(index),
        state,
        attempts: state === "queued" ? 0 : 1,
        inputHash: "fictional-metadata-only",
        documentId: state === "generated" ? (source?.id ?? null) : null,
        documentHash: state === "generated" ? (source?.sha256 ?? null) : null,
        documentStatus: state === "generated" ? (source?.status ?? null) : null,
        documentAnalysis: null,
        documentUrl: null,
        errorCode: state === "failed" ? "FICTIONAL_RENDER_FAILURE" : null,
      };
    }),
    nextCursor,
  };
}

function resultState(
  job: GenerationJobView,
  index: number,
): GenerationResultView["state"] {
  if (index < job.generated) return "generated";
  if (index < job.generated + job.failed) return "failed";
  if (index < job.generated + job.failed + job.cancelled) return "cancelled";
  return job.state === "running" ? "running" : "queued";
}
