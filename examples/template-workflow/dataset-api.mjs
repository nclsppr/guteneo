import { readFile } from "node:fs/promises";

// Synthetic input only. This example prepares drafts, never approves or sends.
const origin = new URL(process.env.GUTENEO_ORIGIN ?? "http://localhost:8787");
if (
  origin.protocol !== "https:" &&
  !(
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
)
  throw new Error("HTTPS requis hors simulation locale.");
if (origin.username || origin.password)
  throw new Error("L’origine ne doit pas contenir d’identifiants.");
const token = process.env.GUTENEO_BEARER_TOKEN;
if (!token)
  throw new Error(
    "GUTENEO_BEARER_TOKEN requis : OAuth délégué autorisé, jamais un cookie navigateur.",
  );
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
const ensure = (condition, code) => {
  if (!condition) throw new Error(code);
};
async function request(path, body, key) {
  const multipart = body instanceof FormData;
  const response = await fetch(new URL("/api" + path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      ...(!multipart && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${path}: UNEXPECTED_RESPONSE_${response.status}`);
  }
  if (!response.ok)
    throw new Error(
      `${path}: ${result.error?.code ?? "HTTP_" + response.status}`,
    );
  return result;
}
const usageSnapshot = (usage) =>
  JSON.stringify({
    credit: [
      usage.welcomeCredit.reservedMinor,
      usage.welcomeCredit.spentMinor,
      usage.welcomeCredit.availableMinor,
    ],
    counters: usage.items
      .map((item) => [
        item.channel,
        item.period,
        item.reserved_count,
        item.confirmed_count,
        item.reserved_minor,
        item.confirmed_minor,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
const usageBefore = usageSnapshot(await request("/usage"));
const workbook = await readFile(
  new URL("clients-articles-fax.xlsx", import.meta.url),
);
async function importWorkbook() {
  const form = new FormData();
  form.set(
    "file",
    new Blob([workbook], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "clients-articles-fax.xlsx",
  );
  const dataset = await request("/datasets", form);
  ensure(dataset.status === "ready", "SYNTHETIC_DATASET_NOT_READY");
  return dataset;
}
const first = await importWorkbook();
const profile = await request(
  `/datasets/${first.id}/profile?sheet=Clients&cursor=0&limit=5`,
);
ensure(
  profile.profile.sheets.some((sheet) => sheet.name === "Articles"),
  "SECOND_SHEET_MISSING",
);
const mapping = await request("/mappings", {
  datasetId: first.id,
  plan: await json("dataset-mapping.json"),
});
const validation = await request(`/mappings/${mapping.id}/validate`, {
  datasetId: first.id,
  version: mapping.version,
});
ensure(
  validation.status === "ready" && validation.documentCount === 2,
  "INITIAL_MAPPING_VALIDATION_FAILED",
);
ensure(
  validation.examples.every((record) => record.data.items.length > 0),
  "CROSS_SHEET_JOIN_MISSING",
);

// Same immutable mapping, compatible new source, no AI endpoint and no remapping.
const second = await importWorkbook();
ensure(
  first.id !== second.id && first.sha256 === second.sha256,
  "SOURCE_REIMPORT_NOT_IDENTICAL",
);
const reused = await request(`/mappings/${mapping.id}/validate`, {
  datasetId: second.id,
  version: mapping.version,
});
ensure(
  reused.status === "ready" &&
    reused.documentCount === 2 &&
    reused.mapping.id === mapping.id &&
    reused.mapping.version === mapping.version,
  "MAPPING_REUSE_FAILED",
);
const expected = new Map(
  reused.examples.map((record) => [record.recordId, record.data]),
);
ensure(expected.size === 2, "EXPECTED_RECORDS_MISSING");

// Extend the supplied invoice business schema to declare every normalized field.
const source = await json("create-template.json");
source.envelope.name = "Facture synthétique — import Excel";
Object.assign(source.envelope.inputSchema.properties.customer.properties, {
  postalCode: { type: "string", title: "Code postal" },
  email: { type: "string", title: "Email" },
  fax: { type: "string", title: "Fax de démonstration" },
});
Object.assign(source.envelope.sampleData.customer, {
  postalCode: "00120",
  email: "demo@example.test",
  fax: "+33102030405",
});
const model = await request("/templates", source);
const published = await request(`/templates/${model.id}/publish`, {
  expectedRevision: model.revision,
});
const generationKey = crypto.randomUUID();
const job = await request(
  "/generation-jobs",
  {
    mode: "generate_only",
    templateId: model.id,
    templateVersion: published.currentVersion,
    datasetId: second.id,
    mappingId: mapping.id,
    mappingVersion: mapping.version,
  },
  generationKey,
);
console.log(
  JSON.stringify({
    datasetIds: [first.id, second.id],
    mappingId: mapping.id,
    mappingVersion: mapping.version,
    templateId: model.id,
    jobId: job.id,
    idempotencyKey: generationKey,
  }),
);
let complete = false;
for (let attempt = 0; attempt < 120; attempt++) {
  const current = await request(`/generation-jobs/${job.id}`);
  if (!["queued", "running"].includes(current.state)) {
    ensure(
      current.state === "completed",
      `GENERATION_${current.state.toUpperCase()}`,
    );
    complete = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
ensure(complete, "JOB_STILL_RUNNING_RETAIN_ID_DO_NOT_RECREATE");
const results = await request(`/generation-jobs/${job.id}/results`);
ensure(
  results.items.length === 2 && results.nextCursor === null,
  "GENERATED_RECORD_COUNT",
);
ensure(
  results.items.every(
    (record) =>
      record.state === "generated" &&
      record.documentStatus === "ready" &&
      expected.has(record.recordId),
  ),
  "GENERATED_DOCUMENT_NOT_READY",
);
ensure(
  new Set(results.items.map((record) => record.documentHash)).size === 2,
  "PDFS_NOT_DISTINCT",
);
const documents = new Map(
  results.items.map((record) => [record.recordId, record]),
);
for (const record of results.items) {
  const trace = await request(
    `/generation-jobs/${job.id}/provenance?recordId=${encodeURIComponent(record.recordId)}`,
  );
  ensure(
    trace.sourceHash === second.sha256 &&
      trace.mappingId === mapping.id &&
      trace.mappingVersion === mapping.version,
    "GENERATION_PROVENANCE_MISMATCH",
  );
}

async function prepare(kind) {
  // Reverse source order deliberately: associations use recordId, never an index.
  const entries = [...results.items].reverse().map((record) => ({
    entryId: `${kind}-${record.recordId}`,
    recordId: record.recordId,
    channel: "fax",
    ...(kind === "common"
      ? { recipient: { phone: "+33102030407" } }
      : { recipientFields: { phone: "customer.fax" } }),
  }));
  const key = crypto.randomUUID();
  let plan = await request(
    "/distribution-plans",
    { jobId: job.id, entries },
    key,
  );
  console.log(JSON.stringify({ kind, planId: plan.id, idempotencyKey: key }));
  // Preparation is bounded; resume only pending preparation, with the stored plan.
  for (
    let attempt = 0;
    plan.pendingCount > 0 && plan.errorCount === 0 && attempt < 5;
    attempt++
  )
    plan = await request(`/distribution-plans/${plan.id}/resume`, {});
  ensure(
    plan.pendingCount === 0 &&
      plan.errorCount === 0 &&
      plan.entries.length === 2,
    "DISTRIBUTION_PREPARATION_INCOMPLETE",
  );
  for (const entry of plan.entries) {
    const document = documents.get(entry.recordId);
    ensure(
      document &&
        entry.documentId === document.documentId &&
        entry.documentHash === document.documentHash,
      "RECORD_DOCUMENT_ASSOCIATION_FAILED",
    );
    ensure(
      entry.templateId === model.id &&
        entry.templateVersion === published.currentVersion,
      "TEMPLATE_VERSION_ASSOCIATION_FAILED",
    );
    const phone =
      kind === "common"
        ? "+33102030407"
        : expected.get(entry.recordId).customer.fax;
    ensure(entry.recipient.phone === phone, "RECIPIENT_ASSOCIATION_FAILED");
    ensure(entry.dispatchId && !entry.errorCode, "DISPATCH_NOT_PREPARED");
    const detail = await request(`/dispatches/${entry.dispatchId}`);
    ensure(
      detail.dispatch.status === "prepared" &&
        !detail.approval &&
        detail.attempts.length === 0,
      "UNEXPECTED_DISPATCH_EXECUTION",
    );
    ensure(
      detail.dispatch.document_id === entry.documentId,
      "DISPATCH_DOCUMENT_ASSOCIATION_FAILED",
    );
    const actualRecipient =
      typeof detail.dispatch.recipient_json === "string"
        ? JSON.parse(detail.dispatch.recipient_json)
        : detail.dispatch.recipient_json;
    ensure(
      actualRecipient.phone === phone,
      "DISPATCH_RECIPIENT_ASSOCIATION_FAILED",
    );
  }
  return {
    kind,
    planId: plan.id,
    manifestHash: plan.manifestHash,
    entries: plan.entries.map(
      ({ entryId, recordId, documentId, documentHash, dispatchId }) => ({
        entryId,
        recordId,
        documentId,
        documentHash,
        dispatchId,
      }),
    ),
  };
}
const common = await prepare("common");
const perRecord = await prepare("recipient_fields");
const usageAfter = usageSnapshot(await request("/usage"));
ensure(
  usageAfter === usageBefore,
  "USAGE_CHANGED_DURING_EXAMPLE_CHECK_CONCURRENT_ACTIVITY",
);
console.log(
  JSON.stringify(
    {
      state: "completed",
      mappingReusedWithoutAI: true,
      pdfs: results.items.map(
        ({ recordId, documentId, documentHash, documentStatus }) => ({
          recordId,
          documentId,
          documentHash,
          documentStatus,
        }),
      ),
      plans: [common, perRecord],
      associationsVerified: true,
      approvals: 0,
      providerAttempts: 0,
      sendingCreditAndQuotaUnchanged: true,
    },
    null,
    2,
  ),
);
