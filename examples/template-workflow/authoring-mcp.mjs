import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
    "GUTENEO_BEARER_TOKEN requis : une connexion OAuth autorisée avec les nouveaux scopes.",
  );
const client = new Client({
  name: "guteneo-template-authoring-example",
  version: "1.0.0",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL("/mcp", origin), {
    requestInit: {
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
    },
  }),
);
async function call(name, args) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    const code = typeof error.code === "number" ? error.code : "TRANSPORT_FAILED";
    throw new Error(`${name}: MCP_${code}`);
  }
  let envelope = result.structuredContent;
  if (!envelope) {
    const text = result.content?.find(
      (content) => content.type === "text",
    )?.text;
    try {
      envelope = JSON.parse(text ?? "null");
    } catch {
      throw new Error(`${name}: MCP_INVALID_RESPONSE`);
    }
  }
  if (!envelope?.ok || result.isError)
    throw new Error(
      `${name}: ${envelope?.error?.code ?? "MCP_OPERATION_FAILED"}`,
    );
  return envelope.data;
}
try {
  await call("get_capabilities", {});
  const advertised = new Set(
    (await client.listTools()).tools.map((tool) => tool.name),
  );
  for (const tool of [
    "get_template_authoring_guide",
    "list_template_examples",
    "get_template_example",
    "create_template",
    "preview_template",
    "delete_template",
    "get_document",
  ])
    if (!advertised.has(tool))
      throw new Error("AUTHORING_TOOL_UNAVAILABLE_" + tool);
  const guide = await call("get_template_authoring_guide", {});
  if (
    !guide.envelopeSchema ||
    !guide.semanticRules?.length ||
    !guide.minimalEnvelope
  )
    throw new Error("AUTHORING_GUIDE_INCOMPLETE");
  const catalog = await call("list_template_examples", {});
  if (!catalog.some((entry) => entry.id === "quote"))
    throw new Error("QUOTE_EXAMPLE_MISSING");
  const example = await call("get_template_example", { exampleId: "quote" });
  example.envelope.name = "Devis synthétique — exemple MCP";
  const model = await call("create_template", { envelope: example.envelope });
  console.log(
    JSON.stringify({
      templateId: model.id,
      revision: model.revision,
      guideVersion: guide.guideVersion,
      examplesDiscovered: catalog.length,
    }),
  );
  if (!model.canDelete || model.visibility !== "private")
    throw new Error("PRIVATE_OWNED_COPY_REQUIRED");
  const preview = await call("preview_template", {
    id: model.id,
    expectedRevision: model.revision,
    data: model.envelope.sampleData,
  });
  if (preview.status !== "ready") throw new Error("PREVIEW_NOT_READY");
  console.log(JSON.stringify({ step: "preview_ready", documentId: preview.id }));
  const removed = await call("delete_template", {
    id: model.id,
    expectedRevision: model.revision,
  });
  if (!removed.deleted || removed.id !== model.id)
    throw new Error("DELETE_NOT_CONFIRMED");
  let removedReadCode;
  try {
    await call("get_template", { id: model.id });
  } catch (error) {
    removedReadCode = error.message;
  }
  if (removedReadCode !== "get_template: TEMPLATE_NOT_FOUND")
    throw new Error("REMOVED_TEMPLATE_STILL_READABLE");
  const retained = await call("get_document", { documentId: preview.id });
  if (retained.id !== preview.id || retained.status !== "ready")
    throw new Error("PREVIEW_HISTORY_NOT_RETAINED");
  console.log(
    JSON.stringify({
      templateId: model.id,
      deleted: true,
      previewDocumentId: retained.id,
      previewDocumentStatus: retained.status,
      previewRetained: true,
      generationOrSendingRequested: false,
    }),
  );
} finally {
  await client.close();
}
// This deletes only the synthetic draft created by this invocation.
// Its rendered preview is intentionally retained as evidence, with the usual private access.
// It never publishes/shares a template or prepares/approves/sends a communication.
