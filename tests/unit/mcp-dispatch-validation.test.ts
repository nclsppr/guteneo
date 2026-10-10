import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import type { AuthEnv, McpIdentity } from "../../apps/api/src/auth";
import type { DomainService } from "../../packages/domain/src/index";

const identity: McpIdentity = {
  context: {
    organizationId: "org_fixture",
    userId: "user_fixture",
    role: "viewer",
    actor: "mcp",
  },
  scopes: ["dispatches:read"],
  clientId: "fixture-only",
  token: "fixture-only",
  expiresAt: 0,
};
const result = {
  schema: 1,
  execution: "validation_only",
  dispatchId: "dsp_fixture",
  fingerprint: "a".repeat(64),
  dispatchMode: "production",
  checkedAt: "2026-10-10T00:00:00.000Z",
  status: "partial",
  checks: [
    { id: "prepared_state", status: "passed" },
    { id: "submission_not_started", status: "passed" },
    { id: "quote", status: "passed" },
    { id: "protected_document", status: "passed" },
    { id: "recipient_suppression", status: "passed" },
    { id: "acceptance", status: "not_checked", code: "NOT_EXECUTED" },
    { id: "provider_delivery", status: "not_checked", code: "NOT_EXECUTED" },
  ],
};
async function connect(scopes = identity.scopes) {
  const validateDispatch = vi.fn().mockResolvedValue(result);
  const forbidden = vi.fn().mockRejectedValue(new Error("Mutation forbidden"));
  const server = createGuteneoMcpServer(
    { ...identity, scopes },
    { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
    {
      domain: {
        validateDispatch,
        prepareDispatch: forbidden,
        approveDispatch: forbidden,
        confirmDispatch: forbidden,
      } as unknown as DomainService,
      documents: { importFile: forbidden, render: forbidden },
      afterConfirmation: forbidden,
      capabilities: () => ({ mode: "production" }),
    },
  );
  const client = new Client({ name: "dry-run-contract", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, validateDispatch, forbidden };
}
describe("non-consuming MCP dispatch validation", () => {
  it("uses read authority and never enters preparation, approval or confirmation", async () => {
    const { client, validateDispatch, forbidden } = await connect();
    try {
      const tool = (await client.listTools()).tools.find(
        (t) => t.name === "dry_run_dispatch",
      )!;
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (let i = 0; i < 2; i++) {
        const response = await client.callTool({
          name: "dry_run_dispatch",
          arguments: { dispatchId: "dsp_fixture" },
        });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toEqual({ ok: true, data: result });
      }
      expect(validateDispatch).toHaveBeenCalledTimes(2);
      expect(validateDispatch).toHaveBeenLastCalledWith(
        identity.context,
        "dsp_fixture",
      );
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });
  it("requires read scope and rejects fake consent or execution flags", async () => {
    for (const scopes of [[], ["dispatches:send"]]) {
      const { client, validateDispatch, forbidden } = await connect(scopes);
      try {
        const response = await client.callTool({
          name: "dry_run_dispatch",
          arguments: { dispatchId: "dsp_fixture" },
        });
        expect(response.isError).toBe(true);
        expect(validateDispatch).not.toHaveBeenCalled();
        expect(forbidden).not.toHaveBeenCalled();
      } finally {
        await client.close();
      }
    }
    const { client, validateDispatch } = await connect();
    try {
      for (const extra of [
        { approved: true },
        { execute: true },
        { idempotencyKey: "must-not-consume" },
      ]) {
        const response = await client.callTool({
          name: "dry_run_dispatch",
          arguments: { dispatchId: "dsp_fixture", ...extra },
        });
        expect(response.isError).toBe(true);
      }
      expect(validateDispatch).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });
});
