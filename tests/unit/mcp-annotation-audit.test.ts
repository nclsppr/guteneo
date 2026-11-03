import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  annotationKeys,
  auditMcpAnnotations,
  discoverLocalMcpTools,
  type AnnotationMatrix,
} from "../../scripts/audit-mcp-annotations";

const annotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: false,
};
function fixture() {
  const tools = [{ name: "example", annotations: { ...annotations } }];
  const matrix: AnnotationMatrix = {
    schemaVersion: 1,
    reviewedOn: "2026-10-20",
    sourceScope: "local_candidate",
    policySources: [
      { url: "https://developers.openai.com/plugins/plugin-guidelines" },
    ],
    tools: [
      {
        name: "example",
        annotations: { ...annotations },
        justification: {
          readOnlyHint: "Updates the stored record.",
          destructiveHint: "Replaces the previous value.",
          openWorldHint: "Confined to the authenticated private workspace.",
          idempotentHint: "Records a fresh successful connection timestamp.",
        },
        evidence: [{ path: "apps/example.ts", symbol: "updateRecord" }],
      },
    ],
  };
  const readEvidence = vi.fn(() => "export function updateRecord() {}");
  return { tools, matrix, readEvidence };
}

describe("MCP annotation audit", () => {
  it("checks each hint and source reference without executing business operations", () => {
    const { tools, matrix, readEvidence } = fixture();
    const result = auditMcpAnnotations(tools, matrix, readEvidence);
    expect(result).toMatchObject({
      passed: true,
      toolCount: 1,
      documentedToolCount: 1,
      explicitBooleanCount: 4,
      checkedEvidenceCount: 1,
      issues: [],
    });
    expect(readEvidence).toHaveBeenCalledWith("apps/example.ts");
    expect(result.qualification).toContain(
      "Does not execute business handlers",
    );
  });

  it("fails on a newly exposed tool without justifications and on removed tools", () => {
    const { tools, matrix, readEvidence } = fixture();
    tools.push({ name: "new_operation", annotations: { ...annotations } });
    matrix.tools.push({ ...matrix.tools[0], name: "removed_operation" });
    const result = auditMcpAnnotations(tools, matrix, readEvidence);
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "undocumented_tool",
          location: "new_operation",
        }),
        expect.objectContaining({
          code: "stale_matrix_tool",
          location: "removed_operation",
        }),
      ]),
    );
  });

  it.each(annotationKeys)(
    "rejects null, missing and string %s values in both descriptor and matrix",
    (key) => {
      for (const invalid of [null, undefined, "false"]) {
        const { tools, matrix, readEvidence } = fixture();
        const descriptor = {
          ...tools[0],
          annotations: { ...annotations, [key]: invalid },
        };
        const rows = {
          ...matrix,
          tools: [
            {
              ...matrix.tools[0],
              annotations: { ...annotations, [key]: invalid },
            },
          ],
        };
        const result = auditMcpAnnotations([descriptor], rows, readEvidence);
        expect(result.passed).toBe(false);
        expect(result.issues.map((issue) => issue.code)).toEqual([
          "non_boolean_annotation",
          "non_boolean_matrix_annotation",
        ]);
      }
    },
  );

  it("detects a boolean disagreement even when both representations are well formed", () => {
    const { tools, matrix, readEvidence } = fixture();
    matrix.tools[0].annotations.destructiveHint = false;
    expect(auditMcpAnnotations(tools, matrix, readEvidence).issues).toEqual([
      expect.objectContaining({
        code: "annotation_drift",
        location: "example.annotations.destructiveHint",
      }),
    ]);
  });

  it("rejects duplicate names instead of letting one row silently overwrite another", () => {
    const { tools, matrix, readEvidence } = fixture();
    tools.push(structuredClone(tools[0]));
    matrix.tools.push(structuredClone(matrix.tools[0]));
    expect(
      auditMcpAnnotations(tools, matrix, readEvidence).issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["duplicate_tool", "duplicate_matrix_tool"]);
  });

  it.each(annotationKeys)("requires a justification for %s", (key) => {
    const { tools, matrix, readEvidence } = fixture();
    matrix.tools[0].justification[key] = " \n ";
    expect(auditMcpAnnotations(tools, matrix, readEvidence).issues).toEqual([
      expect.objectContaining({
        code: "missing_justification",
        location: `example.justification.${key}`,
      }),
    ]);
  });

  it("rejects missing evidence, unavailable files and stale source symbols", () => {
    const { tools, matrix } = fixture();
    const withoutEvidence = structuredClone(matrix);
    withoutEvidence.tools[0].evidence = [];
    expect(
      auditMcpAnnotations(tools, withoutEvidence).issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["missing_evidence"]);
    expect(
      auditMcpAnnotations(tools, matrix, () => {
        throw new Error("Unavailable file");
      }).issues.map((issue) => issue.code),
    ).toEqual(["unreadable_evidence"]);
    expect(
      auditMcpAnnotations(tools, matrix, () => "unrelated code").issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["missing_evidence_symbol"]);
  });

  it("refuses an evidence path outside the repository", () => {
    const { tools, matrix } = fixture();
    matrix.tools[0].evidence[0].path = "../outside.ts";
    expect(auditMcpAnnotations(tools, matrix).issues).toEqual([
      expect.objectContaining({ code: "unreadable_evidence" }),
    ]);
  });

  it("cannot pass an empty catalogue or invalid matrix", () => {
    expect(
      auditMcpAnnotations([], null).issues.map((issue) => issue.code),
    ).toEqual(["empty_catalogue", "invalid_matrix"]);
  });

  it("preserves ordinary discovery while reviewing every synthetic opt-in surface without handlers", async () => {
    const ordinary = await discoverLocalMcpTools();
    const tools = await discoverLocalMcpTools("reviewed");
    const diagnosticNames = ["check_mcp_ui_probe_bridge", "open_mcp_ui_probe"];
    const appNames = [
      "open_mcp_document_upload",
      "begin_mcp_document_upload",
      "append_mcp_document_upload",
      "get_mcp_document_upload",
      "finish_mcp_document_upload",
      "cancel_mcp_document_upload",
    ];
    const optInNames = [...diagnosticNames, ...appNames];
    expect(ordinary).toHaveLength(75);
    expect(tools).toHaveLength(ordinary.length + optInNames.length);
    for (const name of optInNames)
      expect(ordinary.map((tool) => tool.name)).not.toContain(name);
    for (const name of diagnosticNames)
      expect(tools.find((tool) => tool.name === name)?.annotations).toEqual({
        title: tools.find((tool) => tool.name === name)?.title,
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      });
    for (const tool of tools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.title!.trim().length, tool.name).toBeGreaterThan(0);
      expect(tool.annotations?.title, tool.name).toBe(tool.title);
      expect(tool.description, tool.name).toContain(
        "Supported ChatGPT and Codex content excludes",
      );
      expect(tool.description, tool.name).not.toContain(
        "before requesting content, explain",
      );
      expect(tool.description, tool.name).not.toMatch(/https?:\/\//);
      for (const other of tools)
        expect(tool.description, `${tool.name}: ${other.name}`).not.toMatch(
          new RegExp(`\\b${other.name}\\b`),
        );
    }
    expect(tools.filter((tool) => !optInNames.includes(tool.name))).toEqual(
      ordinary,
    );
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        ...optInNames,
        "get_postal_setup",
        "configure_postal_sender",
        "create_postal_address_page",
        "transfer_postal_draft",
        "rescan_document",
        "validate_pdf",
        "get_pdf_validation",
        "delete_template",
        "get_template_authoring_guide",
        "create_distribution_postal_preflight",
        "dry_run_dispatch",
        "prepare_secure_distribution",
        "list_secure_distributions",
        "get_secure_distribution",
        "confirm_secure_distribution",
        "revoke_secure_distribution",
      ]),
    );
    const matrix: unknown = JSON.parse(
      await readFile(
        new URL(
          "../../integrations/chatgpt/tool-annotations.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const result = auditMcpAnnotations(tools, matrix);
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.documentedToolCount).toBe(tools.length);
    expect(result.explicitBooleanCount).toBe(tools.length * 4);
    expect(auditMcpAnnotations(ordinary, matrix).issues).toEqual(
      [...optInNames].sort().map((name) => ({
        code: "stale_matrix_tool",
        location: name,
        message: "Matrix entry is absent from MCP tools/list.",
      })),
    );
  });
});
