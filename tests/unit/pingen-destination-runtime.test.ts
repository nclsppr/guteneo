import { createHash } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, describe, expect, it } from "vitest";
import { PINGEN_DESTINATION_RESTRICTIONS_URL } from "../../packages/providers/pingen-destination-availability";
import { destinationRestrictionsHtml } from "../helpers/pingen-destinations";

let script: string;
const html = destinationRestrictionsHtml(["Russia"], ["Canada"]);

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { PingenDestinationAvailabilityReader, pingenDestinationAvailability } from './packages/providers/pingen-destination-availability';
        const readers = {
          default: new PingenDestinationAvailabilityReader(),
          factory: pingenDestinationAvailability(),
          wrapped: new PingenDestinationAvailabilityReader((input, init) => fetch(input, init)),
        };
        export default {
          async fetch(request) {
            const reader = readers[new URL(request.url).pathname.slice(1)];
            try {
              const snapshot = await reader.assertAvailable('LU');
              let restrictedCountryCode;
              try { await reader.assertAvailable('RU'); }
              catch (error) { restrictedCountryCode = error.code; }
              return Response.json({
                source: snapshot.source,
                sourceSha256: snapshot.sourceSha256,
                unavailable: snapshot.unavailable,
                delayed: snapshot.delayed,
                current: reader.isCurrent(snapshot),
                cacheReused: snapshot === await reader.read(),
                restrictedCountryCode,
              });
            } catch (error) {
              return Response.json({ code: error.code }, { status: 503 });
            }
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

describe("postal destination availability in actual local workerd", () => {
  it("uses native global fetch for default readers and the cached factory without binding it to the reader", async () => {
    const outboundRequests: string[] = [];
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        name: "pingen-destinations-native-fetch",
        modules: true,
        script,
        compatibilityDate: "2026-09-16",
        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
        outboundService: async (request) => {
          outboundRequests.push(request.url);
          expect(request.method).toBe("GET");
          expect(request.headers.has("Authorization")).toBe(false);
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      }),
    );
    try {
      const results = [];
      for (const mode of ["default", "factory", "wrapped"]) {
        const response = await runtime.dispatchFetch(
          `https://runtime.test/${mode}`,
        );
        results.push({
          mode,
          status: response.status,
          result: await response.json(),
        });
      }
      const expected = {
        source: PINGEN_DESTINATION_RESTRICTIONS_URL,
        sourceSha256: createHash("sha256").update(html).digest("hex"),
        unavailable: ["RU"],
        delayed: ["CA"],
        current: true,
        cacheReused: true,
        restrictedCountryCode: "postal_destination_unavailable",
      };
      expect(results).toEqual(
        ["default", "factory", "wrapped"].map((mode) => ({
          mode,
          status: 200,
          result: expected,
        })),
      );
      expect(outboundRequests).toEqual(
        Array(3).fill(PINGEN_DESTINATION_RESTRICTIONS_URL),
      );
    } finally {
      await runtime.dispose();
    }
  });

  it.each([
    { label: "unavailable HTTP response", status: 503, body: "unavailable" },
    {
      label: "unrecognized reference",
      status: 200,
      body: "<h2>Changed reference</h2>",
    },
  ])(
    "fails native-fetch availability closed for $label",
    async ({ status, body }) => {
      let outboundRequests = 0;
      const runtime = new Miniflare(
        convertV4MiniflareOptions({
          name: "pingen-destinations-native-fetch-failure",
          modules: true,
          script,
          compatibilityDate: "2026-09-16",
          compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
          outboundService: async () => {
            outboundRequests++;
            return new Response(body, {
              status,
              headers: { "Content-Type": "text/html" },
            });
          },
        }),
      );
      try {
        const response = await runtime.dispatchFetch(
          "https://runtime.test/default",
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          code: "postal_destination_availability_unavailable",
        });
        expect(outboundRequests).toBe(1);
      } finally {
        await runtime.dispose();
      }
    },
  );
});
