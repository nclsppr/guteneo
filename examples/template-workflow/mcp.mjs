import { readFile } from "node:fs/promises";
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
  name: "guteneo-template-example",
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
  const result = await client.callTool({ name, arguments: args });
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
  const model = await call(
    "create_template",
    JSON.parse(
      await readFile(new URL("create-template.json", import.meta.url), "utf8"),
    ),
  );
  const published = await call("publish_template", {
    id: model.id,
    expectedRevision: model.revision,
  });
  const input = JSON.parse(
    await readFile(new URL("generate-records.json", import.meta.url), "utf8"),
  );
  input.templateId = model.id;
  input.templateVersion = published.currentVersion;
  const key = crypto.randomUUID();
  const job = await call("generate_documents", { input, idempotencyKey: key });
  console.log(
    JSON.stringify({
      templateId: model.id,
      templateVersion: published.currentVersion,
      jobId: job.id,
      idempotencyKey: key,
      mode: "generate_only",
    }),
  );
  for (let i = 0; i < 120; i++) {
    const current = await call("get_generation_job", { id: job.id });
    if (!["queued", "running"].includes(current.state)) {
      const results = await call("get_generation_results", {
        id: job.id,
        limit: 10,
      });
      console.log(
        JSON.stringify(
          {
            state: current.state,
            results: results.items.map(
              ({
                recordId,
                documentId,
                documentHash,
                documentStatus,
                errorCode,
              }) => ({
                recordId,
                documentId,
                documentHash,
                documentStatus,
                errorCode,
              }),
            ),
            nextCursor: results.nextCursor,
          },
          null,
          2,
        ),
      );
      process.exitCode = current.state === "completed" ? 0 : 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (i === 119)
      throw new Error(
        "Job durable toujours en cours : consulter son ID, ne pas recréer la demande.",
      );
  }
} finally {
  await client.close();
}
// The job remains durable after disconnect. Poll its status; never recreate it.
// No dispatch, approval, confirmation or provider call is made by this example.
