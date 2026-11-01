import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, describe, expect, it } from "vitest";

let script: string;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { SesEmailProvider } from './packages/providers/ses';
        const config = {
          accessKeyId: 'TESTACCESSKEY',
          secretAccessKey: 'test-secret-not-a-credential',
          region: 'eu-west-1',
          configurationSet: 'guteneo-runtime-fixture',
          authorizedSenders: ['sender@example.invalid'],
          sandbox: true,
        };
        const providers = {
          default: new SesEmailProvider(config),
          wrapped: new SesEmailProvider(config, (input, init) => fetch(input, init)),
        };
        export default {
          async fetch(request) {
            const provider = providers[new URL(request.url).pathname.slice(1)];
            return Response.json(await provider.submit({
              dispatchId: 'runtime-fixture-1',
              from: 'sender@example.invalid',
              to: 'recipient@example.invalid',
              subject: 'Runtime fixture',
              html: '<p>Approved fixture</p>',
              text: 'Approved fixture',
              purpose: 'transactional',
            }));
          },
        };
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    external: ["node:*"],
  });
  script = bundle.outputFiles[0].text;
});

async function submitWithNativeFetch(reply: () => Response, mode = "default") {
  const outbound: {
    url: string;
    method: string;
    authorization: string | null;
    contentType: string | null;
    body: unknown;
  }[] = [];
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "ses-native-fetch-fixture",
      modules: true,
      script,
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      outboundService: async (request) => {
        outbound.push({
          url: request.url,
          method: request.method,
          authorization: request.headers.get("Authorization"),
          contentType: request.headers.get("Content-Type"),
          body: await request.json(),
        });
        return reply();
      },
    }),
  );
  try {
    const response = await runtime.dispatchFetch(
      `https://runtime.test/${mode}`,
    );
    expect(response.status).toBe(200);
    return { result: await response.json(), outbound };
  } finally {
    await runtime.dispose();
  }
}

describe("SES submission in actual local workerd", () => {
  it.each(["default", "wrapped"])(
    "submits the signed approved envelope once using %s native fetch",
    async (mode) => {
      const { result, outbound } = await submitWithNativeFetch(
        () => Response.json({ MessageId: "ses-runtime-1" }),
        mode,
      );
      expect(result).toEqual({
        status: "accepted",
        providerId: "ses-runtime-1",
        providerStatus: "accepted_by_ses",
      });
      expect(outbound).toHaveLength(1);
      expect(outbound[0]).toMatchObject({
        url: "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails",
        method: "POST",
        contentType: "application/json",
        body: {
          FromEmailAddress: "sender@example.invalid",
          Destination: { ToAddresses: ["recipient@example.invalid"] },
          ConfigurationSetName: "guteneo-runtime-fixture",
          EmailTags: [
            { Name: "guteneo-dispatch", Value: "runtime-fixture-1" },
            { Name: "guteneo-purpose", Value: "transactional" },
          ],
          Content: {
            Simple: {
              Subject: { Charset: "UTF-8", Data: "Runtime fixture" },
              Body: {
                Html: { Charset: "UTF-8", Data: "<p>Approved fixture</p>" },
                Text: { Charset: "UTF-8", Data: "Approved fixture" },
              },
            },
          },
        },
      });
      expect(outbound[0].authorization).toContain("AWS4-HMAC-SHA256");
      expect(outbound[0].authorization).toContain("TESTACCESSKEY/");
      expect(outbound[0].authorization).toContain(
        "/eu-west-1/ses/aws4_request",
      );
    },
  );

  it("preserves a definitive rejection without exposing the response or retrying", async () => {
    const { result, outbound } = await submitWithNativeFetch(() =>
      Response.json(
        { message: "private-fixture-value" },
        {
          status: 400,
          headers: { "x-amzn-errortype": "SendingPausedException" },
        },
      ),
    );
    expect(result).toEqual({
      status: "rejected",
      errorCode: "SES_SENDING_PAUSED",
      retryable: false,
    });
    expect(outbound).toHaveLength(1);
  });

  it.each([
    {
      label: "server failure",
      reply: () =>
        Response.json({ message: "private-fixture-value" }, { status: 503 }),
    },
    {
      label: "malformed acknowledgement",
      reply: () =>
        Response.json({ MessageId: "invalid/private-fixture-value" }),
    },
    {
      label: "lost response",
      reply: () => {
        throw new Error("fixture connection lost");
      },
    },
  ])("holds $label as unknown without retry", async ({ reply }) => {
    const { result, outbound } = await submitWithNativeFetch(reply);
    expect(result).toEqual({
      status: "submission_unknown",
      errorCode: "SES_RESPONSE_UNKNOWN",
      retryable: false,
    });
    expect(outbound).toHaveLength(1);
  });
});
