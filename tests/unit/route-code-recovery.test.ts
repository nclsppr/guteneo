import { afterEach, describe, expect, it, vi } from "vitest";
import {
  failedRouteAssets,
  recoverRouteAssets,
} from "../../apps/web/src/route-code-recovery";

const origin = "https://guteneo.com";
const failed = (name: string, responseStatus?: number) => ({
  name,
  responseStatus,
  decodedBodySize: 0,
  encodedBodySize: 0,
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit public route-code recovery", () => {
  it("recognizes HTTP refusals and the tested WebKit zero-size preload record", () => {
    expect(
      failedRouteAssets(
        [
          failed(`${origin}/assets/personal-area-hash.js`, 503),
          failed(`${origin}/assets/personal-area-hash.css`),
          {
            ...failed(`${origin}/assets/ready.js`, 200),
            decodedBodySize: 12,
            encodedBodySize: 12,
          },
          failed(`${origin}/assets/empty-success.js`, 200),
        ],
        origin,
      ),
    ).toEqual([
      `${origin}/assets/personal-area-hash.js`,
      `${origin}/assets/personal-area-hash.css`,
    ]);
  });

  it.each([
    "https://external.example/assets/code.js",
    `${origin}/api/personal/documents/document-a/original`,
    `${origin}/api/dispatches/dispatch-a/confirm`,
    `${origin}/assets/code.js?token=private`,
    `${origin}/assets/code.js#private`,
    "https://user:private@guteneo.com/assets/code.js",
    `${origin}/private/code.js`,
    `${origin}/assets/nested/code.js`,
    `${origin}/assets/original.pdf`,
    "not a URL",
  ])(
    "never fetches a private, credentialed or non-code resource: %s",
    (url) => {
      expect(failedRouteAssets([failed(url, 503)], origin)).toEqual([]);
    },
  );

  it("deduplicates and bounds recovery to eight public code resources", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      failed(`${origin}/assets/chunk-${i}.js`, 404),
    );
    entries.push(entries[19]);
    expect(failedRouteAssets(entries, origin)).toEqual(
      entries.slice(12, 20).map((entry) => entry.name),
    );
  });

  it("omits credentials/referrers and consumes recovered bytes before returning", async () => {
    const read = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              read();
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("performance", {
      getEntriesByType: () => [
        failed(`${origin}/assets/page.js`, 503),
        failed(`${origin}/api/session`, 503),
      ],
    });
    vi.stubGlobal("window", { location: { origin }, setTimeout, clearTimeout });
    await recoverRouteAssets();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      `${origin}/assets/page.js`,
      expect.objectContaining({
        cache: "reload",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(read).toHaveBeenCalledOnce();
  });

  it("cancels a public response that exceeds the recovery byte limit", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
              },
              cancel,
            }),
          ),
      ),
    );
    vi.stubGlobal("performance", {
      getEntriesByType: () => [failed(`${origin}/assets/page.js`, 503)],
    });
    vi.stubGlobal("window", { location: { origin }, setTimeout, clearTimeout });
    await recoverRouteAssets();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
