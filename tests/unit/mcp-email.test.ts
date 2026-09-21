import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  dispatchSummary,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import type { DomainService, Dispatch } from "../../packages/domain/src/index";

const identity: McpIdentity = {
  context: {
    organizationId: "org_fixture",
    userId: "user_fixture",
    role: "admin",
    actor: "mcp",
  },
  scopes: [...MCP_SCOPES],
  clientId: "fixture-only",
  token: "fixture-only",
  expiresAt: 0,
};
const origin = "https://guteneo.invalid";
const privateValues = {
  hostingId: "hosting_private_fixture",
  token: "opaque_private_fixture",
  password: "password_private_fixture",
  encryptedPassword: "ciphertext_private_fixture",
};

function emailDispatch(
  mode: "none" | "attachment" | "protected_link",
): Dispatch {
  return {
    id: "dispatch_fixture",
    channel: "email",
    status: "prepared",
    mode: "production",
    recipient_json: '{"email":"recipient@example.invalid"}',
    document_id: mode === "none" ? null : "document_fixture",
    campaign_id: null,
    fingerprint: "a".repeat(64),
    estimated_minor: mode === "protected_link" ? 101 : 1,
    ceiling_minor: 200,
    known_minor: null,
    currency: "EUR",
    updated_at: "2026-09-21T10:00:00.000Z",
    options_json: JSON.stringify(
      mode === "protected_link"
        ? {
            emailDeliveryMode: mode,
            protectedDocument: {
              ...privateValues,
              expiresAt: "2099-09-28T10:00:00.000Z",
              durationDays: 7,
              hostingFeeMinor: 100,
            },
          }
        : {},
    ),
    html: `<p>Exact content with recipient-facing /share/${privateValues.token}</p>`,
  } as Dispatch;
}

async function connected<T>(
  dispatch: Dispatch,
  run: (
    client: Client,
    prepare: ReturnType<typeof vi.fn>,
    confirm: ReturnType<typeof vi.fn>,
  ) => Promise<T>,
) {
  const prepare = vi.fn(async () => dispatch);
  const confirm = vi.fn(async () => dispatch);
  const server = createGuteneoMcpServer(
    identity,
    { APP_ORIGIN: origin } as AuthEnv,
    {
      domain: {
        getDispatch: async () => ({ dispatch, attempts: [] }),
        listDispatches: async () => ({ items: [dispatch], nextCursor: null }),
        prepareDispatch: prepare,
        confirmDispatch: confirm,
      } as unknown as DomainService,
      documents: {
        importFile: async () => {
          throw new Error("No import in transport test");
        },
        render: async () => {
          throw new Error("No rendering in transport test");
        },
      },
      capabilities: () => ({ mode: "production", liveSendsEnabled: false }),
    },
  );
  const client = new Client({ name: "email-contract-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await run(client, prepare, confirm);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("email assistant contract", () => {
  it.each(["none", "attachment", "protected_link"] as const)(
    "prepares %s with one generic call and projects only public delivery metadata",
    async (mode) => {
      const dispatch = emailDispatch(mode);
      await connected(dispatch, async (client, prepare, confirm) => {
        const input = {
          channel: "email",
          recipient: { email: "recipient@example.invalid" },
          subject: "Requested message",
          text: "Exact requested message",
          ceilingMinor: 200,
          ...(mode === "none" ? {} : { documentId: "document_fixture" }),
          ...(mode === "protected_link"
            ? { options: { emailDeliveryMode: mode, protectedDays: 7 } }
            : {}),
        };
        for (const [name, args] of [
          ["prepare_dispatch", { ...input, idempotencyKey: "stable_fixture" }],
          ["get_dispatch_status", { dispatchId: dispatch.id }],
          ["list_dispatches", {}],
        ] as const) {
          const response = await client.callTool({ name, arguments: args });
          expect(response.isError).not.toBe(true);
          const body = response.structuredContent as {
            ok: boolean;
            data: {
              emailDelivery?: unknown;
              items?: { emailDelivery: unknown }[];
              nextActions?: string[];
            };
          };
          expect(body.ok).toBe(true);
          const delivery =
            name === "list_dispatches"
              ? body.data.items?.[0].emailDelivery
              : body.data.emailDelivery;
          expect(delivery).toEqual(
            mode === "protected_link"
              ? {
                  mode,
                  protectedDocument: {
                    expiresAt: "2099-09-28T10:00:00.000Z",
                    durationDays: 7,
                    hostingFeeMinor: 100,
                  },
                  passwordAccessUrl: `${origin}/#/app/dispatch/${dispatch.id}`,
                  passwordDelivery: "sender_browser_only",
                }
              : { mode },
          );
          for (const value of Object.values(privateValues))
            expect(JSON.stringify(response)).not.toContain(value);
          if (name !== "list_dispatches") {
            expect(body.data.nextActions?.join(" ")).toContain(
              "Sans mandat expert actif",
            );
            if (mode === "protected_link")
              expect(body.data.nextActions?.join(" ")).toContain(
                "Ne jamais lire, demander ou afficher le mot de passe",
              );
          }
        }
        expect(prepare).toHaveBeenCalledExactlyOnceWith(
          identity.context,
          input,
          "stable_fixture",
        );
        expect(confirm).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    { password: "forbidden_fixture" },
    { protectedDocument: { hostingId: "forged_fixture" } },
    { protectedDays: 31 },
    { emailDeliveryMode: "remote_file" },
  ])(
    "rejects unsupported or secret options before preparation: %j",
    async (options) => {
      await connected(
        emailDispatch("protected_link"),
        async (client, prepare, confirm) => {
          const response = await client.callTool({
            name: "prepare_dispatch",
            arguments: {
              idempotencyKey: "invalid_fixture",
              channel: "email",
              recipient: { email: "recipient@example.invalid" },
              subject: "Requested message",
              text: "Exact requested message",
              documentId: "document_fixture",
              options,
            },
          });
          expect(response.isError).toBe(true);
          expect(prepare).not.toHaveBeenCalled();
          expect(confirm).not.toHaveBeenCalled();
        },
      );
    },
  );

  it("provides browser-only password instructions without a password tool or sending permission", async () => {
    await connected(
      emailDispatch("protected_link"),
      async (client, prepare, confirm) => {
        const { tools } = await client.listTools();
        const tool = tools.find((item) => item.name === "prepare_dispatch")!;
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
          idempotentHint: true,
        });
        expect(
          tools.some((item) =>
            /password|secret|enable.*expert/.test(item.name),
          ),
        ).toBe(false);
        expect(tool.inputSchema.required).not.toContain("documentId");
        const prompt = JSON.stringify(
          await client.getPrompt({ name: "email" }),
        );
        expect(prompt).toContain("Sans mandat expert actif");
        expect(prompt).toContain("Ne pas visiter cet accès avec un outil");
        expect(prompt).toContain(
          "compte de revue limité à la préparation ne peut pas envoyer",
        );
        expect(prompt).toContain(
          "Excel, autres fichiers, listes multi-format et comptes destinataires sont prévus ultérieurement",
        );
        expect(prepare).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
      },
    );
  });

  it("does not recommend fax renewal or retry a submission with an unknown result", () => {
    const dispatch = emailDispatch("protected_link");
    const expired = dispatchSummary(
      { ...dispatch, quote_expires_at: "2000-01-01T00:00:00.000Z" },
      origin,
      0,
    );
    expect(expired.nextActions.join(" ")).toContain(
      "consulter get_dispatch_status",
    );
    expect(expired.nextActions.join(" ")).not.toContain(
      "renouveler avec prepare_fax",
    );
    const unknown = dispatchSummary(
      { ...dispatch, status: "submission_unknown" },
      origin,
      1,
    );
    expect(unknown.nextActions).toEqual([
      "Attendre le rapprochement opérateur. Ne pas réexpédier cette commande.",
    ]);
  });
});
