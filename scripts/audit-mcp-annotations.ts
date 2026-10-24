import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer, type McpServices } from "../apps/api/src/mcp";
import type { AuthEnv, McpIdentity } from "../apps/api/src/auth";

export const annotationKeys = [
  "readOnlyHint",
  "destructiveHint",
  "openWorldHint",
  "idempotentHint",
] as const;

export type AnnotationKey = (typeof annotationKeys)[number];
export type AnnotationValues = Record<AnnotationKey, boolean>;
export type AnnotationMatrix = {
  schemaVersion: 1;
  reviewedOn: string;
  sourceScope: "local_candidate";
  policySources: Array<{ url: string }>;
  tools: Array<{
    name: string;
    annotations: AnnotationValues;
    justification: Record<AnnotationKey, string>;
    evidence: Array<{ path: string; symbol: string }>;
  }>;
};
export type AnnotationAuditIssue = {
  code: string;
  location: string;
  message: string;
};
export type AnnotationAuditReport = {
  schemaVersion: 1;
  scope: "local_mcp_catalogue";
  qualification: string;
  passed: boolean;
  toolCount: number;
  documentedToolCount: number;
  explicitBooleanCount: number;
  checkedEvidenceCount: number;
  catalogueSha256: string;
  matrixSha256: string;
  issues: AnnotationAuditIssue[];
};
type EvidenceReader = (relativePath: string) => string;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultMatrixPath = path.join(
  repositoryRoot,
  "integrations/chatgpt/tool-annotations.json",
);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
}

function readRepositoryEvidence(relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  )
    throw new Error("Evidence must be a repository-relative path.");
  const resolved = realpathSync(path.join(repositoryRoot, relativePath));
  if (!resolved.startsWith(`${realpathSync(repositoryRoot)}${path.sep}`))
    throw new Error("Evidence must remain within the repository.");
  return readFileSync(resolved, "utf8");
}

/**
 * Inspect the actual serialized MCP catalogue, without invoking a business tool.
 * Optional services are present so this includes every conditional registration.
 * Fail-fast stubs ensure discovery cannot accidentally perform business work.
 */
export async function discoverLocalMcpTools() {
  const forbidden = () => {
    throw new Error(
      "The annotation audit must not invoke business operations.",
    );
  };
  const service = new Proxy(Object.create(null) as Record<string, unknown>, {
    get: (_target, property) => (property === "then" ? undefined : forbidden),
  });
  const identity: McpIdentity = {
    context: {
      organizationId: "annotation-audit",
      userId: "annotation-audit",
      role: "admin",
      actor: "mcp",
    },
    scopes: [],
    clientId: "annotation-audit",
    token: "synthetic-not-a-credential",
    expiresAt: 0,
  };
  const env = {
    APP_ORIGIN: "http://localhost",
    ENVIRONMENT: "local",
    MODE: "simulation",
  } as AuthEnv;
  const services: McpServices = {
    domain: service as unknown as McpServices["domain"],
    documents: service as unknown as McpServices["documents"],
    postal: service as unknown as McpServices["postal"],
    workflow: service as unknown as McpServices["workflow"],
    pdfValidation: service as unknown as McpServices["pdfValidation"],
    secureDistribution: service as unknown as McpServices["secureDistribution"],
    capabilities: forbidden,
    afterGeneration: forbidden,
    afterConfirmation: forbidden,
    onToolFailure: forbidden,
  };
  const server = createGuteneoMcpServer(identity, env, services);
  const client = new Client({ name: "guteneo-annotation-audit", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools);
      cursor = result.nextCursor;
      if (cursor && seenCursors.has(cursor))
        throw new Error("Repeated MCP tools/list cursor.");
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return tools.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

/**
 * Structural and evidence-presence checks supplement, but do not replace,
 * the manual audit of each handler's effects or a deployed portal rescan.
 */
export function auditMcpAnnotations(
  catalogue: readonly unknown[],
  matrix: unknown,
  readEvidence: EvidenceReader = readRepositoryEvidence,
): AnnotationAuditReport {
  const issues: AnnotationAuditIssue[] = [];
  const issue = (code: string, location: string, message: string) =>
    issues.push({ code, location, message });
  let explicitBooleanCount = 0;
  let checkedEvidenceCount = 0;
  const catalogueByName = new Map<string, Record<string, unknown>>();
  const matrixByName = new Map<string, Record<string, unknown>>();
  if (!catalogue.length)
    issue("empty_catalogue", "catalogue", "The MCP catalogue is empty.");
  catalogue.forEach((tool, index) => {
    const location = `catalogue[${index}]`;
    if (!record(tool) || !nonempty(tool.name)) {
      issue("invalid_tool", location, "A tool must have a nonempty name.");
      return;
    }
    if (catalogueByName.has(tool.name))
      issue("duplicate_tool", tool.name, "Duplicate name in MCP tools/list.");
    catalogueByName.set(tool.name, tool);
    for (const key of annotationKeys) {
      if (
        !record(tool.annotations) ||
        typeof tool.annotations[key] !== "boolean"
      )
        issue(
          "non_boolean_annotation",
          `${tool.name}.annotations.${key}`,
          "The descriptor must explicitly contain true or false.",
        );
      else explicitBooleanCount++;
    }
  });

  if (!record(matrix)) {
    issue(
      "invalid_matrix",
      "matrix",
      "The annotation matrix must be an object.",
    );
  } else {
    if (matrix.schemaVersion !== 1)
      issue("invalid_schema_version", "matrix.schemaVersion", "Expected 1.");
    if (
      typeof matrix.reviewedOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(matrix.reviewedOn) ||
      Number.isNaN(Date.parse(matrix.reviewedOn)) ||
      new Date(matrix.reviewedOn).toISOString().slice(0, 10) !==
        matrix.reviewedOn
    )
      issue(
        "invalid_review_date",
        "matrix.reviewedOn",
        "Expected an ISO date.",
      );
    if (matrix.sourceScope !== "local_candidate")
      issue(
        "invalid_source_scope",
        "matrix.sourceScope",
        "This audit can qualify only the local candidate.",
      );
    if (!Array.isArray(matrix.policySources) || !matrix.policySources.length) {
      issue(
        "missing_policy_sources",
        "matrix.policySources",
        "At least one policy source is required.",
      );
    } else {
      matrix.policySources.forEach((source, index) => {
        try {
          if (!record(source) || !nonempty(source.url))
            throw new Error("Missing URL.");
          const url = new URL(source.url);
          if (url.protocol !== "https:" || url.username || url.password)
            throw new Error("Expected an HTTPS source without credentials.");
        } catch {
          issue(
            "invalid_policy_source",
            `matrix.policySources[${index}]`,
            "Expected a valid HTTPS source URL without credentials.",
          );
        }
      });
    }
    if (!Array.isArray(matrix.tools) || !matrix.tools.length) {
      issue(
        "missing_matrix_tools",
        "matrix.tools",
        "Tool entries are required.",
      );
    } else {
      matrix.tools.forEach((tool, index) => {
        const location = `matrix.tools[${index}]`;
        if (!record(tool) || !nonempty(tool.name)) {
          issue(
            "invalid_matrix_tool",
            location,
            "Expected a nonempty tool name.",
          );
          return;
        }
        if (matrixByName.has(tool.name))
          issue("duplicate_matrix_tool", tool.name, "Duplicate matrix entry.");
        matrixByName.set(tool.name, tool);
        for (const key of annotationKeys) {
          if (
            !record(tool.annotations) ||
            typeof tool.annotations[key] !== "boolean"
          )
            issue(
              "non_boolean_matrix_annotation",
              `${tool.name}.annotations.${key}`,
              "The matrix must explicitly contain true or false.",
            );
          if (!record(tool.justification) || !nonempty(tool.justification[key]))
            issue(
              "missing_justification",
              `${tool.name}.justification.${key}`,
              "Every hint needs its own behavior-based justification.",
            );
        }
        if (!Array.isArray(tool.evidence) || !tool.evidence.length) {
          issue(
            "missing_evidence",
            `${tool.name}.evidence`,
            "At least one source reference is required.",
          );
        } else {
          tool.evidence.forEach((evidence, evidenceIndex) => {
            const evidenceLocation = `${tool.name}.evidence[${evidenceIndex}]`;
            if (
              !record(evidence) ||
              !nonempty(evidence.path) ||
              !nonempty(evidence.symbol)
            ) {
              issue(
                "invalid_evidence",
                evidenceLocation,
                "Source evidence needs a path and a nonempty symbol.",
              );
              return;
            }
            try {
              if (!readEvidence(evidence.path).includes(evidence.symbol)) {
                issue(
                  "missing_evidence_symbol",
                  evidenceLocation,
                  "The cited symbol is absent from the source file.",
                );
              } else checkedEvidenceCount++;
            } catch {
              issue(
                "unreadable_evidence",
                evidenceLocation,
                "The cited repository source cannot be read.",
              );
            }
          });
        }
      });
    }
  }

  for (const [name, tool] of catalogueByName) {
    const documented = matrixByName.get(name);
    if (!documented) {
      issue("undocumented_tool", name, "MCP tool is absent from the matrix.");
      continue;
    }
    for (const key of annotationKeys) {
      if (
        record(tool.annotations) &&
        record(documented.annotations) &&
        typeof tool.annotations[key] === "boolean" &&
        typeof documented.annotations[key] === "boolean" &&
        tool.annotations[key] !== documented.annotations[key]
      )
        issue(
          "annotation_drift",
          `${name}.annotations.${key}`,
          "The serialized descriptor differs from its justified value.",
        );
    }
  }
  for (const name of matrixByName.keys())
    if (!catalogueByName.has(name))
      issue(
        "stale_matrix_tool",
        name,
        "Matrix entry is absent from MCP tools/list.",
      );

  return {
    schemaVersion: 1,
    scope: "local_mcp_catalogue",
    qualification:
      "Checks local tools/list, explicit booleans, justification coverage and source-reference presence. Does not execute business handlers or establish deployed/portal state or review approval.",
    passed: issues.length === 0,
    toolCount: catalogue.length,
    documentedToolCount: matrixByName.size,
    explicitBooleanCount,
    checkedEvidenceCount,
    catalogueSha256: digest(catalogue),
    matrixSha256: digest(matrix),
    issues,
  };
}

async function main(args: string[]) {
  let matrixPath = defaultMatrixPath;
  let outputDir: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (
      !["--matrix", "--output-dir"].includes(option) ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new Error(
        "Usage: node --import tsx scripts/audit-mcp-annotations.ts [--matrix PATH] [--output-dir PATH]",
      );
    const value = path.resolve(args[++index]);
    if (option === "--matrix") matrixPath = value;
    else outputDir = value;
  }
  const matrix: unknown = JSON.parse(await readFile(matrixPath, "utf8"));
  const tools = await discoverLocalMcpTools();
  const report = auditMcpAnnotations(tools, matrix);
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, "tools-list.local.json"),
      `${JSON.stringify({ tools }, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "annotation-audit.local.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "MCP annotation audit failed.",
    );
    process.exitCode = 1;
  });
