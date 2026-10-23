import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  getDocumentContent,
  SESSION_EXPIRED_EVENT,
} from "../../apps/web/src/api";

afterEach(() => vi.unstubAllGlobals());

describe("obsolete browser requests", () => {
  for (const status of [200, 401, 500]) {
    it(`ignores a ${status} response aborted while its JSON body is being read`, async () => {
      const controller = new AbortController();
      const dispatchEvent = vi.fn();
      let complete!: (value: unknown) => void;
      let reading!: () => void;
      const started = new Promise<void>((resolve) => {
        reading = resolve;
      });
      vi.stubGlobal("window", { dispatchEvent });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: status === 200,
          status,
          json: () => {
            reading();
            return new Promise((resolve) => {
              complete = resolve;
            });
          },
        })),
      );
      const request = api("/templates/previous", { signal: controller.signal });
      const rejected = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      await started;
      controller.abort();
      complete({ error: { code: "UNAUTHENTICATED", message: "Old session" } });
      await rejected;
      expect(dispatchEvent).not.toHaveBeenCalled();
    });
  }

  it("does not announce an old document's unauthorized response after cancellation", async () => {
    const controller = new AbortController();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        return new Response(null, { status: 401 });
      }),
    );
    await expect(
      getDocumentContent("previous", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("does not return document bytes after their reader was cancelled", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => {
          controller.abort();
          return new ArrayBuffer(4);
        },
      })),
    );
    await expect(
      getDocumentContent("previous", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("still announces a current session's unauthorized response", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), {
            status: 401,
          }),
      ),
    );
    await expect(api("/documents")).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
  });
});
