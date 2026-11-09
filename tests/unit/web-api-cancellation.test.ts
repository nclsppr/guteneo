import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  getDocumentContent,
  SESSION_EXPIRED_EVENT,
  setSession,
  type Session,
} from "../../apps/web/src/api";

afterEach(() => {
  setSession(null, false);
  vi.unstubAllGlobals();
});

const session = (id: string): Session => ({
  organization: { id: `workspace-${id}`, name: "Synthetic workspace" },
  user: { id, name: "Synthetic user", role: "admin" },
  csrfToken: `synthetic-${id}`,
  simulation: true,
});

describe("obsolete browser requests", () => {
  it("does not expire the current session from an old unabortable write after A to B to A", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    setSession(session("a"), false);
    let complete!: (value: unknown) => void;
    let reading!: () => void;
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: () => {
          reading();
          return new Promise((resolve) => {
            complete = resolve;
          });
        },
      })),
    );
    const request = api("/billing/customer", { method: "POST", body: {} });
    const rejected = expect(request).rejects.toMatchObject({ status: 401 });
    await started;
    setSession(session("b"), false);
    setSession(session("a"), false);
    complete({ error: { code: "UNAUTHENTICATED" } });
    await rejected;
    expect(dispatchEvent).not.toHaveBeenCalled();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
      ),
    );
    await expect(api("/documents")).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("does not announce an old document's unauthorized response after session replacement", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    setSession(session("a"), false);
    let respond!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ),
    );
    const request = getDocumentContent("previous");
    const rejected = expect(request).rejects.toMatchObject({ status: 401 });
    setSession(session("b"), false);
    respond(new Response(null, { status: 401 }));
    await rejected;
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

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
    setSession(session("a"), false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // The application reapplies the unchanged session on navigation.
        setSession(session("a"), false);
        return new Response(
          JSON.stringify({ error: { code: "UNAUTHENTICATED" } }),
          {
            status: 401,
          },
        );
      }),
    );
    await expect(api("/documents")).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
  });
});
