import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { request } from "../../packages/providers/transport";

it("uses a redirect mode accepted by workerd and never forwards credentials to a redirect target", async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-09-16",
      script: `const request = ${request.toString()};
      export default { async fetch() {
        const response = await request(fetch, 'https://supplier.example/account', {
          headers: { Authorization: 'Bearer fixture-only' }
        });
        return Response.json({ status: response.status });
      }};`,
      outboundService: async (incoming) => {
        calls.push({
          url: incoming.url,
          authorization: incoming.headers.get("Authorization"),
        });
        return new Response(null, {
          status: 307,
          headers: { Location: "https://untrusted.example/credentials" },
        });
      },
    }),
  );
  try {
    const response = await runtime.dispatchFetch("https://worker.example");
    expect(await response.json()).toEqual({ status: 307 });
    expect(calls).toEqual([
      {
        url: "https://supplier.example/account",
        authorization: "Bearer fixture-only",
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});
