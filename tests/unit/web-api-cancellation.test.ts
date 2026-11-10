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
  vi.unstubAllEnvs();
  vi.doUnmock("../../apps/web/src/preview");
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
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
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
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    setSession(session("b"), false);
    respond(new Response(null, { status: 401 }));
    await rejected;
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  for (const status of [200, 401, 500]) {
    it(`refuses an unabortable ${status} JSON result after authority A to B to A`, async () => {
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
      const request = api("/session");
      const rejected = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      await started;
      setSession(session("b"), false);
      setSession(session("a"), false);
      complete(
        status === 200 ? session("a") : { error: { code: "UNAUTHENTICATED" } },
      );
      await rejected;
      expect(dispatchEvent).not.toHaveBeenCalled();
    });
  }

  it("refuses a previous authority's late network failure", async () => {
    setSession(session("a"), false);
    let fail!: (reason: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      ),
    );
    const request = api("/logout", { method: "POST", body: {} });
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    setSession(session("b"), false);
    fail(new TypeError("Synthetic offline response"));
    await rejected;
  });

  it("retains a same-authority success after navigation and an unchanged session reapplication", async () => {
    const location = { href: "https://synthetic.invalid/#/app/prepare" };
    vi.stubGlobal("window", { location });
    setSession(session("a"), false);
    let respond!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ),
    );
    const request = api("/dispatches", { method: "POST", body: {} });
    location.href = "https://synthetic.invalid/#/app/documents";
    setSession(session("a"), false);
    respond(Response.json({ id: "prepared_reference" }));
    await expect(request).resolves.toEqual({ id: "prepared_reference" });
  });

  it("never starts a write when its signal was already aborted", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(
      api("/dispatches", {
        method: "POST",
        body: {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses private document bytes parsed after authority replacement", async () => {
    setSession(session("a"), false);
    let complete!: (value: ArrayBuffer) => void;
    let reading!: () => void;
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: () => {
          reading();
          return new Promise<ArrayBuffer>((resolve) => {
            complete = resolve;
          });
        },
      })),
    );
    const request = getDocumentContent("previous-private-document");
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await started;
    setSession(session("b"), false);
    complete(new ArrayBuffer(4));
    await rejected;
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

describe("deferred browser preview authority", () => {
  for (const obsolete of ["authority", "signal"] as const) {
    it(`does not enter preview transport after ${obsolete} changes during module loading`, async () => {
      vi.stubEnv("VITE_PUBLIC_PREVIEW", "true");
      vi.resetModules();
      let load!: () => void;
      let importing!: () => void;
      const started = new Promise<void>((resolve) => {
        importing = resolve;
      });
      const moduleReady = new Promise<void>((resolve) => {
        load = resolve;
      });
      const requestPreview = vi.fn();
      vi.doMock("../../apps/web/src/preview", async () => {
        importing();
        await moduleReady;
        return {
          publicPreview: { request: requestPreview },
          PreviewError: class extends Error {},
        };
      });
      const current = await import("../../apps/web/src/api");
      current.setSession(session("a"), false);
      const controller = new AbortController();
      const request = current.api("/dispatches", {
        method: "POST",
        body: {},
        signal: controller.signal,
      });
      const rejected = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      await started;
      if (obsolete === "authority") {
        current.setSession(session("b"), false);
        current.setSession(session("a"), false);
      } else controller.abort();
      load();
      await rejected;
      expect(requestPreview).not.toHaveBeenCalled();
      current.setSession(null, false);
    });
  }

  for (const result of ["success", "failure", "document"] as const) {
    it(`refuses a preview ${result} after authority replacement`, async () => {
      vi.stubEnv("VITE_PUBLIC_PREVIEW", "true");
      vi.resetModules();
      let complete!: (value: unknown) => void;
      let fail!: (error: Error) => void;
      let reading!: () => void;
      const started = new Promise<void>((resolve) => {
        reading = resolve;
      });
      const transport = vi.fn(() => {
        reading();
        return new Promise((resolve, reject) => {
          complete = resolve;
          fail = reject;
        });
      });
      class PreviewError extends Error {
        code = "UNAUTHENTICATED";
        status = 401;
      }
      vi.doMock("../../apps/web/src/preview", () => ({
        publicPreview: { request: transport, documentContent: transport },
        PreviewError,
      }));
      const current = await import("../../apps/web/src/api");
      current.setSession(session("a"), false);
      const request =
        result === "document"
          ? current.getDocumentContent("previous")
          : current.api("/session");
      const rejected = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      await started;
      current.setSession(session("b"), false);
      if (result === "failure") fail(new PreviewError());
      else complete(result === "document" ? new Uint8Array(4) : session("a"));
      await rejected;
      current.setSession(null, false);
    });
  }
});
