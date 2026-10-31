import type { Dispatch, DispatchDetail, DocumentRecord } from "./api";
import {
  DISPATCH_GROUPS,
  isDispatchGroup,
  type DispatchGroup,
  type DispatchOverview,
} from "../../../packages/contracts/src/dispatch-groups";
import {
  WORKSPACE_ROLES,
  workspacePermissions,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { PDFME_VERSION } from "../../../packages/contracts/src/templates";
import type {
  DatasetView,
  GenerationJobView,
  TemplateView,
} from "../../../packages/contracts/src/template-workflow";

export const PREVIEW_DATA_PAGE_SIZE = 50;
export const PREVIEW_DATA_MAX_RECORDS = 1_000_000_000;
export const PREVIEW_DATA_REFERENCE_TIME = "2026-10-30T12:00:00.000Z";
export const PREVIEW_DATA_COLLECTIONS = [
  "documents",
  "dispatches",
  "templates",
  "datasets",
  "generations",
] as const;
export type PreviewDataCollection = (typeof PREVIEW_DATA_COLLECTIONS)[number];
export type PreviewDataCounts = Record<PreviewDataCollection, number>;
export type PreviewDataRecords = {
  documents: DocumentRecord;
  dispatches: Dispatch;
  templates: TemplateView;
  datasets: DatasetView;
  generations: GenerationJobView;
};
export type PreviewDataOptions = {
  seed: string | number;
  workspace: string;
  counts: PreviewDataCounts;
  role?: WorkspaceRole;
  supervisorCanApprove?: boolean;
  supervisorCanReport?: boolean;
};
export type PreviewDataPageOptions = {
  cursor?: string | null;
  limit?: number;
  group?: DispatchGroup;
};
export type PreviewDataPage<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};
export class PreviewDataError extends Error {
  constructor(
    public code: "INVALID_PREVIEW_DATA" | "INVALID_PREVIEW_CURSOR",
    message: string,
  ) {
    super(message);
    this.name = "PreviewDataError";
  }
}

function hash(value: string, initial = 0x811c9dc5): number {
  let state = initial;
  for (let index = 0; index < value.length; index++) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  return state >>> 0;
}
function fingerprint(value: string): string {
  return [hash(value), hash(value, 0x9e3779b9)]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}
const statuses = Object.values(DISPATCH_GROUPS).flat();
const referenceTime = Date.parse(PREVIEW_DATA_REFERENCE_TIME);
const documentNames = [
  "Letter",
  "Invoice",
  "Statement",
  "Invitation",
  "Report",
];
const templateNames = [
  "Correspondence",
  "Invoice",
  "Certificate",
  "Invitation",
];

/** Browser fixtures only: logical collections allocate records solely for a requested page. */
export function createPreviewData(options: PreviewDataOptions) {
  const seed = String(options.seed);
  const workspace = options.workspace;
  if (
    (typeof options.seed !== "string" && typeof options.seed !== "number") ||
    typeof workspace !== "string" ||
    !seed.length ||
    seed.length > 128 ||
    (typeof options.seed === "number" && !Number.isSafeInteger(options.seed)) ||
    !workspace ||
    workspace.length > 128 ||
    (options.role !== undefined &&
      !(WORKSPACE_ROLES as readonly string[]).includes(options.role))
  )
    throw new PreviewDataError(
      "INVALID_PREVIEW_DATA",
      "Invalid fictional data profile.",
    );
  const counts = Object.freeze(
    Object.fromEntries(
      PREVIEW_DATA_COLLECTIONS.map((collection) => {
        const count = options.counts[collection];
        if (
          !Number.isSafeInteger(count) ||
          count < 0 ||
          count > PREVIEW_DATA_MAX_RECORDS
        )
          throw new PreviewDataError(
            "INVALID_PREVIEW_DATA",
            "Fictional collection counts must be bounded nonnegative integers.",
          );
        return [collection, count];
      }),
    ) as PreviewDataCounts,
  );
  const identity = fingerprint(`${seed}\u0000${workspace}`);
  const cursorIdentity = fingerprint(
    `${identity}\u0000${PREVIEW_DATA_COLLECTIONS.map((collection) => counts[collection]).join(":")}`,
  );
  const permissions = workspacePermissions(options.role ?? "admin", {
    canApprove: options.supervisorCanApprove,
    canReport: options.supervisorCanReport,
  });
  const statusRotation = hash(identity) % statuses.length;
  const random = (collection: PreviewDataCollection, index: number) =>
    hash(`${identity}:${collection}:${index}`);
  const id = (collection: PreviewDataCollection, index: number) =>
    `preview_${identity}_${collection}_${index.toString(36)}`;
  const created = (index: number) =>
    new Date(referenceTime - (index % 525_600) * 60_000).toISOString();
  const number = (index: number) => String(index + 1).padStart(7, "0");
  // These digest-shaped labels identify synthetic metadata, never verified PDF bytes.
  const metadataHash = (collection: PreviewDataCollection, index: number) =>
    Array.from({ length: 4 }, (_, part) =>
      fingerprint(`${identity}:${collection}:${index}:${part}`),
    ).join("");
  const documentReference = (index: number) =>
    counts.documents > 0
      ? id("documents", index % counts.documents)
      : undefined;

  function document(index: number): DocumentRecord {
    const value = random("documents", index);
    return {
      id: id("documents", index),
      name: `Fictional ${documentNames[value % documentNames.length]} ${number(index)}.pdf`,
      sha256: metadataHash("documents", index),
      size: 1_024 + (value % 2_000_000),
      pages: 1 + (value % 24),
      status: ["ready", "ready", "ready", "quarantined", "rejected"][value % 5],
      source: value % 2 ? "render" : "upload",
      created_at: created(index),
    };
  }
  function dispatch(index: number): Dispatch {
    const value = random("dispatches", index);
    const channel = (["email", "fax", "postal"] as const)[value % 3];
    const status = statuses[(index + statusRotation) % statuses.length];
    return {
      id: id("dispatches", index),
      channel,
      recipient_json:
        channel === "email"
          ? { email: `fictional-${number(index)}@example.invalid` }
          : channel === "fax"
            ? { phone: `+331${String(index % 100_000_000).padStart(8, "0")}` }
            : {
                name: `Fictional organization ${number(index)}`,
                line1: "0 Fictional Street",
                postalCode: "75002",
                city: "Paris",
                country: "FR",
              },
      document_id: documentReference(index),
      subject:
        channel === "email"
          ? `Fictional correspondence ${number(index)}`
          : undefined,
      sender_address: "Fictional sender · browser fixture only",
      status,
      mode: "simulation",
      estimated_minor: channel === "email" ? 1 : channel === "fax" ? 12 : 145,
      ceiling_minor: 500,
      currency: "EUR",
      fingerprint: `fictional-metadata-${metadataHash("dispatches", index)}`,
      created_at: created(index),
      updated_at: created(index),
    };
  }
  function template(index: number): TemplateView {
    const value = random("templates", index);
    const name = `Fictional ${templateNames[value % templateNames.length]} ${number(index)}`;
    const state = (["draft", "published", "published", "archived"] as const)[
      value % 4
    ];
    return {
      id: id("templates", index),
      name,
      ownerId: `preview_user_${fingerprint(workspace)}`,
      state,
      visibility: value % 3 ? "private" : "organization",
      revision: 1 + (value % 9),
      currentVersion: state === "draft" ? null : 1 + (value % 5),
      permissions: {
        use: permissions.prepareDispatches,
        edit: permissions.prepareDispatches,
        publish: permissions.prepareDispatches,
        share: permissions.prepareDispatches,
      },
      canDelete: permissions.prepareDispatches,
      envelope: {
        schemaVersion: 1,
        engine: "pdfme",
        engineVersion: PDFME_VERSION,
        name,
        description:
          "Fictional browser fixture. No PDF has been generated or sent.",
        locale: "en-GB",
        definition: {
          basePdf: { width: 210, height: 297, padding: [20, 20, 20, 20] },
          schemas: [
            [
              {
                name: "subject",
                type: "text",
                position: { x: 20, y: 30 },
                width: 170,
                height: 20,
                content: "FICTIONAL PREVIEW",
                fontName: "GuteneoSans",
                fontSize: 16,
                readOnly: false,
              },
            ],
          ],
          pdfmeVersion: PDFME_VERSION,
        },
        inputSchema: {
          type: "object",
          properties: { subject: { type: "string", title: "Subject" } },
        },
        bindings: [
          {
            block: "subject",
            kind: "value",
            path: "subject",
            format: "text",
            required: false,
            default: "Fictional example",
          },
        ],
        sampleData: { subject: "Fictional browser fixture" },
        sampleDataSynthetic: true,
        resources: [],
      },
      createdAt: created(index),
      updatedAt: created(index),
    };
  }
  function dataset(index: number): DatasetView {
    const value = random("datasets", index);
    const format = (["csv", "xlsx", "json", "xml"] as const)[value % 4];
    const status = (
      ["ready", "ready", "ready", "quarantined", "rejected", "purged"] as const
    )[value % 6];
    return {
      id: id("datasets", index),
      name: `Fictional records ${number(index)}.${format}`,
      format,
      sha256: metadataHash("datasets", index),
      size: 128 + (value % 5_000_000),
      status,
      errorCode: status === "rejected" ? "FICTIONAL_FORMAT_ERROR" : null,
      structureHash:
        status === "ready" ? metadataHash("datasets", index) : null,
      createdAt: created(index),
      expiresAt: new Date(
        Date.parse(created(index)) + 30 * 86_400_000,
      ).toISOString(),
      analysis: {
        attempts: status === "quarantined" ? 0 : 1,
        maxAttempts: 3,
        running: false,
        canRetry: false,
        retryAfterSeconds: 0,
      },
    };
  }
  function generation(index: number): GenerationJobView {
    const value = random("generations", index);
    const state = (
      [
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ] as const
    )[value % 6];
    const total = 1 + (value % 500);
    const generated =
      state === "completed"
        ? total
        : state === "partial" || state === "running"
          ? Math.floor(total / 2)
          : 0;
    const failed =
      state === "failed" ? total : state === "partial" ? total - generated : 0;
    const cancelled = state === "cancelled" ? total : 0;
    return {
      id: id("generations", index),
      templateId:
        counts.templates > 0
          ? id("templates", index % counts.templates)
          : "preview_fictional_template_unavailable",
      templateVersion: 1,
      datasetId:
        counts.datasets > 0 ? id("datasets", index % counts.datasets) : null,
      mappingId: null,
      mappingVersion: null,
      mode: "generate_only",
      state,
      total,
      generated,
      failed,
      pending: total - generated - failed - cancelled,
      cancelled,
      createdAt: created(index),
      updatedAt: created(index),
    };
  }
  const factories: {
    [K in PreviewDataCollection]: (index: number) => PreviewDataRecords[K];
  } = {
    documents: document,
    dispatches: dispatch,
    templates: template,
    datasets: dataset,
    generations: generation,
  };

  function matchingIndices(group?: DispatchGroup): number[] {
    return Array.from({ length: statuses.length }, (_, index) => index).filter(
      (index) =>
        !group ||
        (DISPATCH_GROUPS[group] as readonly string[]).includes(
          statuses[(index + statusRotation) % statuses.length],
        ),
    );
  }
  function groupedCount(group?: DispatchGroup): number {
    const matching = matchingIndices(group);
    return (
      Math.floor(counts.dispatches / statuses.length) * matching.length +
      matching.filter((index) => index < counts.dispatches % statuses.length)
        .length
    );
  }
  function overview(): DispatchOverview {
    return {
      documents: counts.documents,
      dispatches: {
        total: counts.dispatches,
        approval: groupedCount("approval"),
        in_progress: groupedCount("in_progress"),
        attention: groupedCount("attention"),
        done: groupedCount("done"),
      },
    };
  }
  function at<K extends PreviewDataCollection>(
    collection: K,
    index: number,
  ): PreviewDataRecords[K] | undefined {
    if (
      !(PREVIEW_DATA_COLLECTIONS as readonly string[]).includes(collection) ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= counts[collection]
    )
      return undefined;
    return factories[collection](index);
  }
  function get<K extends PreviewDataCollection>(
    collection: K,
    recordId: string,
  ): PreviewDataRecords[K] | null {
    if (!(PREVIEW_DATA_COLLECTIONS as readonly string[]).includes(collection))
      return null;
    const prefix = `preview_${identity}_${collection}_`;
    if (!recordId.startsWith(prefix)) return null;
    const suffix = recordId.slice(prefix.length);
    if (!/^[0-9a-z]+$/.test(suffix)) return null;
    const index = Number.parseInt(suffix, 36);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= counts[collection] ||
      index.toString(36) !== suffix
    )
      return null;
    return factories[collection](index);
  }
  function page<K extends PreviewDataCollection>(
    collection: K,
    settings: PreviewDataPageOptions = {},
  ): PreviewDataPage<PreviewDataRecords[K]> {
    if (
      !(PREVIEW_DATA_COLLECTIONS as readonly string[]).includes(collection) ||
      (settings.group !== undefined &&
        (collection !== "dispatches" || !isDispatchGroup(settings.group))) ||
      (settings.limit !== undefined &&
        (!Number.isSafeInteger(settings.limit) || settings.limit < 1))
    )
      throw new PreviewDataError(
        "INVALID_PREVIEW_DATA",
        "Invalid fictional page options.",
      );
    const limit = Math.min(
      PREVIEW_DATA_PAGE_SIZE,
      settings.limit ?? PREVIEW_DATA_PAGE_SIZE,
    );
    const total =
      collection === "dispatches"
        ? groupedCount(settings.group)
        : counts[collection];
    const prefix = `p1.${cursorIdentity}.${collection}.${settings.group ?? "all"}.`;
    let offset = 0;
    if (settings.cursor != null) {
      if (
        typeof settings.cursor !== "string" ||
        !settings.cursor.startsWith(prefix)
      )
        throw new PreviewDataError(
          "INVALID_PREVIEW_CURSOR",
          "The fictional page cursor belongs to another data profile or collection.",
        );
      const suffix = settings.cursor.slice(prefix.length);
      offset = Number.parseInt(suffix, 36);
      if (
        !/^[0-9a-z]+$/.test(suffix) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset.toString(36) !== suffix ||
        offset >= total
      )
        throw new PreviewDataError(
          "INVALID_PREVIEW_CURSOR",
          "The fictional page cursor is invalid or out of range.",
        );
    }
    const matching =
      collection === "dispatches" ? matchingIndices(settings.group) : null;
    const size = Math.min(limit, Math.max(0, total - offset));
    const items = Array.from({ length: size }, (_, localIndex) => {
      const ordinal = offset + localIndex;
      const index = matching
        ? Math.floor(ordinal / matching.length) * statuses.length +
          matching[ordinal % matching.length]
        : ordinal;
      return factories[collection](index);
    });
    const next = offset + size;
    return {
      items,
      nextCursor: next < total ? `${prefix}${next.toString(36)}` : null,
      total,
    };
  }
  function dispatchDetail(recordId: string): DispatchDetail | null {
    const current = get("dispatches", recordId);
    if (!current) return null;
    return {
      dispatch: current,
      approval: null,
      events: [
        {
          id: `${current.id}_fixture`,
          type: current.status,
          created_at: current.created_at,
          detail:
            "Fictional browser metadata only. No provider has been contacted.",
        },
      ],
      attempts: [],
    };
  }
  return { counts, page, at, get, dispatchDetail, overview };
}
export type PreviewData = ReturnType<typeof createPreviewData>;
