import { readFile } from "node:fs/promises";
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
const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/json",
};
async function request(path, body, key) {
  const response = await fetch(new URL("/api" + path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: { ...headers, ...(key ? { "Idempotency-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
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
const source = JSON.parse(
  await readFile(new URL("create-template.json", import.meta.url), "utf8"),
);
const model = await request("/templates", source);
const published = await request("/templates/" + model.id + "/publish", {
  expectedRevision: model.revision,
});
const input = JSON.parse(
  await readFile(new URL("generate-records.json", import.meta.url), "utf8"),
);
input.templateId = model.id;
input.templateVersion = published.currentVersion;
const key = crypto.randomUUID();
const job = await request("/generation-jobs", input, key);
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
  const current = await request("/generation-jobs/" + job.id);
  if (!["queued", "running"].includes(current.state)) {
    const results = await request("/generation-jobs/" + job.id + "/results");
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
// No dispatch, approval, confirmation or provider call is made by this example.
