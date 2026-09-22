import videoManifest from "./public-video-manifest.json" with { type: "json" };

const publicVideoPaths = new Set([
  "/videos/guteneo-horizontal-v5.mp4",
  "/videos/guteneo-vertical-v5.mp4",
]);
type VideoManifest = Record<string, { bytes: number; sha256: string }>;
type ByteRange = { start: number; end: number };

function parseRange(
  value: string,
  size: number,
): ByteRange | "unsatisfied" | null {
  // Unknown units, invalid syntax and multipart ranges are ignored, as HTTP permits.
  // Bounding the header also keeps huge decimal integers cheap to reject.
  if (value.length > 128 || value.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return "unsatisfied";
    return {
      start: Number(suffix >= total ? 0n : total - suffix),
      end: size - 1,
    };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : total - 1n;
  if (start >= total || end < start) return "unsatisfied";
  return { start: Number(start), end: Number(end >= total ? total - 1n : end) };
}

function matchesIfRange(value: string | null, headers: Headers): boolean {
  if (value === null) return true;
  // If-Range only accepts a strong ETag comparison, never a weak match.
  if (value.startsWith('"')) return value === headers.get("ETag");
  if (value.startsWith("W/")) return false;
  const modified = headers.get("Last-Modified");
  return (
    modified !== null &&
    value === modified &&
    Number.isFinite(Date.parse(value))
  );
}

function sliceStream(source: ReadableStream<Uint8Array>, range: ByteRange) {
  const reader = source.getReader();
  let position = 0;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (closed) return;
            if (done)
              throw new Error("Public video ended before its declared range.");
            const offset = position;
            position += value.byteLength;
            if (position <= range.start) continue;
            const first = Math.max(0, range.start - offset);
            const last = Math.min(value.byteLength, range.end + 1 - offset);
            if (last > first) controller.enqueue(value.subarray(first, last));
            if (position > range.end) {
              closed = true;
              controller.close();
              await reader.cancel().catch(() => {});
            }
            return;
          }
        } catch (error) {
          if (!closed) {
            closed = true;
            controller.error(error);
            await reader.cancel().catch(() => {});
          }
        }
      },
      async cancel(reason) {
        closed = true;
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  // Workers derives Content-Length from a fixed stream, ignoring manual lengths
  // for ordinary streams. The standards-only path supports Node unit tests.
  return typeof FixedLengthStream === "undefined"
    ? stream
    : stream.pipeThrough(new FixedLengthStream(range.end - range.start + 1));
}

/** Byte ranges for two immutable public films only; never accesses private documents. */
export async function withPublicVideoRange(
  request: Request,
  response: Response,
  manifest: VideoManifest = videoManifest,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (
    !publicVideoPaths.has(pathname) ||
    !["GET", "HEAD"].includes(request.method) ||
    response.status !== 200 ||
    response.headers.get("Content-Type")?.split(";", 1)[0] !== "video/mp4" ||
    (response.headers.has("Content-Encoding") &&
      response.headers.get("Content-Encoding") !== "identity")
  )
    return response;

  const size = manifest[pathname]?.bytes;
  if (!Number.isSafeInteger(size) || size <= 0 || size > 25 * 1024 * 1024) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Public video manifest is missing a valid asset size.");
  }
  const headers = new Headers(response.headers);
  const upstreamSize = headers.get("Content-Length");
  if (upstreamSize !== null && Number(upstreamSize) !== size) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Public video size does not match its release manifest.");
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(size));

  const rangeHeader = request.headers.get("Range");
  const range =
    request.method === "GET" &&
    rangeHeader &&
    matchesIfRange(request.headers.get("If-Range"), headers)
      ? parseRange(rangeHeader, size)
      : null;
  if (range === "unsatisfied") {
    await response.body?.cancel().catch(() => {});
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  if (range && response.body) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(sliceStream(response.body, range), {
      status: 206,
      headers,
    });
  }
  if (request.method === "HEAD") await response.body?.cancel().catch(() => {});
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
