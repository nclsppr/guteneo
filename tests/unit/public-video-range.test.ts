import { describe, expect, it, vi } from "vitest";
import { withPublicVideoRange } from "../../apps/api/src/public-video-range";

const path = "/videos/guteneo-horizontal-v5.mp4";
const manifest = { [path]: { bytes: 10, sha256: "fixture" } };
function fixture(overrides: HeadersInit = {}, status = 200) {
  let pulls = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulls === 5) return controller.close();
        controller.enqueue(
          new TextEncoder().encode(String(pulls * 2) + String(pulls * 2 + 1)),
        );
        pulls++;
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=60",
    ETag: '"fixture"',
    "Last-Modified": "Mon, 21 Sep 2026 12:00:00 GMT",
    "X-Robots-Tag": "noindex, nofollow",
  });
  new Headers(overrides).forEach((value, name) => headers.set(name, value));
  return {
    response: new Response(body, { status, headers }),
    cancel,
    pulls: () => pulls,
  };
}
function request(
  range?: string,
  extra: HeadersInit = {},
  method = "GET",
  pathname = path,
) {
  const headers = new Headers(extra);
  if (range !== undefined) headers.set("Range", range);
  return new Request("https://guteneo.com" + pathname, { method, headers });
}

describe("bounded public film byte ranges", () => {
  it.each([
    ["bytes=0-1", "01", "bytes 0-1/10"],
    ["bytes=3-6", "3456", "bytes 3-6/10"],
    ["bytes=8-", "89", "bytes 8-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=-99", "0123456789", "bytes 0-9/10"],
    ["bytes=8-999999999999999999999999", "89", "bytes 8-9/10"],
    ["BYTES=0-0", "0", "bytes 0-0/10"],
  ])(
    "serves exact %s across chunk boundaries",
    async (range, bytes, contentRange) => {
      const source = fixture();
      const response = await withPublicVideoRange(
        request(range),
        source.response,
        manifest,
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("Content-Range")).toBe(contentRange);
      expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
      expect(response.headers.get("Accept-Ranges")).toBe("bytes");
      expect(response.headers.get("ETag")).toBe('"fixture"');
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(await response.text()).toBe(bytes);
      expect(source.cancel).toHaveBeenCalledOnce();
    },
  );

  it("streams on demand and cancels the source immediately after the requested byte", async () => {
    const source = fixture();
    const response = await withPublicVideoRange(
      request("bytes=1-2"),
      source.response,
      manifest,
    );
    expect(source.pulls()).toBe(0);
    expect(await response.text()).toBe("12");
    expect(source.pulls()).toBe(2);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("propagates client cancellation without draining the remaining video", async () => {
    const source = fixture();
    const response = await withPublicVideoRange(
      request("bytes=0-8"),
      source.response,
      manifest,
    );
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new TextEncoder().encode("01"));
    await reader.cancel("viewer closed the player");
    expect(source.pulls()).toBe(1);
    expect(source.cancel).toHaveBeenCalledWith("viewer closed the player");
  });

  it.each([
    "bytes=10-",
    "bytes=999999999999999999999999-",
    "bytes=7-2",
    "bytes=-0",
  ])("rejects unsatisfiable %s without reading the source", async (range) => {
    const source = fixture();
    const response = await withPublicVideoRange(
      request(range),
      source.response,
      manifest,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(response.headers.get("Content-Length")).toBe("0");
    expect(await response.text()).toBe("");
    expect(source.pulls()).toBe(0);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    "bytes=0-1,4-5",
    "items=0-1",
    "bytes=-",
    "bytes=no",
    "bytes=" + "9".repeat(130) + "-",
  ])("ignores unsupported or malformed range %s", async (range) => {
    const response = await withPublicVideoRange(
      request(range),
      fixture().response,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(await response.text()).toBe("0123456789");
  });

  it.each([
    ['"fixture"', 206],
    ['"old"', 200],
    ['W/"fixture"', 200],
    ["Mon, 21 Sep 2026 12:00:00 GMT", 206],
    ["Mon, 21 Sep 2026 11:00:00 GMT", 200],
    ["Mon, 21 Sep 2026 13:00:00 GMT", 200],
    ["not a date", 200],
  ])(
    "evaluates If-Range %s before serving partial content",
    async (validator, status) => {
      const response = await withPublicVideoRange(
        request("bytes=0-1", { "If-Range": validator }),
        fixture().response,
        manifest,
      );
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(status === 206 ? "01" : "0123456789");
    },
  );

  it("does not infer a matching date when ASSETS has no Last-Modified validator", async () => {
    const source = fixture();
    source.response.headers.delete("Last-Modified");
    const response = await withPublicVideoRange(
      request("bytes=0-1", { "If-Range": "Mon, 21 Sep 2026 12:00:00 GMT" }),
      source.response,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123456789");
  });

  it("HEAD ignores Range, sends the total length and does not read the body", async () => {
    const source = fixture();
    const response = await withPublicVideoRange(
      request("bytes=0-1", {}, "HEAD"),
      source.response,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(await response.text()).toBe("");
    expect(source.pulls()).toBe(0);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it.each([
    "/api/documents/private",
    "/videos/other.mp4",
    "/videos/guteneo-horizontal-v5.mp4/",
    "/videos/%67uteneo-horizontal-v5.mp4",
  ])("leaves every non-allowlisted path untouched: %s", async (pathname) => {
    const source = fixture();
    expect(
      await withPublicVideoRange(
        request("bytes=0-1", {}, "GET", pathname),
        source.response,
        manifest,
      ),
    ).toBe(source.response);
    await source.response.body?.cancel();
  });

  it("preserves upstream errors, redirects and conditional304 responses", async () => {
    for (const status of [304, 307, 404, 500]) {
      const response = new Response(null, {
        status,
        headers: { "Content-Type": "video/mp4" },
      });
      expect(
        await withPublicVideoRange(request("bytes=0-1"), response, manifest),
      ).toBe(response);
    }
  });

  it("does not reinterpret nonvideo, encoded content or unsupported methods", async () => {
    for (const [headers, method] of [
      [{ "Content-Type": "text/html" }, "GET"],
      [{ "Content-Encoding": "gzip" }, "GET"],
      [{}, "POST"],
    ] as const) {
      const source = fixture(headers);
      expect(
        await withPublicVideoRange(
          request("bytes=0-1", {}, method),
          source.response,
          manifest,
        ),
      ).toBe(source.response);
      await source.response.body?.cancel();
    }
  });

  it("refuses inconsistent source sizes instead of emitting an invalid Content-Range", async () => {
    const source = fixture({ "Content-Length": "9" });
    await expect(
      withPublicVideoRange(request("bytes=0-1"), source.response, manifest),
    ).rejects.toThrow("release manifest");
    expect(source.pulls()).toBe(0);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("errors a truncated upstream stream rather than silently completing a partial range", async () => {
    const source = fixture();
    const response = await withPublicVideoRange(
      request("bytes=9-12"),
      source.response,
      { [path]: { bytes: 20, sha256: "fixture" } },
    );
    await expect(response.text()).rejects.toThrow("declared range");
  });
});
