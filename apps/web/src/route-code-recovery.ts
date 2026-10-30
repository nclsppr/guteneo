type Resource = {
  name: string;
  decodedBodySize: number;
  encodedBodySize: number;
  responseStatus?: number;
};

/** Only failed public code can be refreshed; private URLs never enter recovery. */
export function failedRouteAssets(
  entries: readonly Resource[],
  origin: string,
) {
  const urls = new Set<string>();
  for (const entry of entries) {
    if (
      !(entry.responseStatus !== undefined && entry.responseStatus >= 400) &&
      !(
        (entry.responseStatus === undefined || entry.responseStatus === 0) &&
        entry.decodedBodySize === 0 &&
        entry.encodedBodySize === 0
      )
    )
      continue;
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (
      url.origin !== origin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(url.pathname)
    )
      continue;
    urls.add(url.href);
  }
  return [...urls].slice(-8);
}

/** A user-requested reload may need to refresh a failed module-preload resource. */
export async function recoverRouteAssets(signal?: AbortSignal) {
  if (signal?.aborted) return;
  const urls = failedRouteAssets(
    performance.getEntriesByType("resource") as PerformanceResourceTiming[],
    window.location.origin,
  );
  if (!urls.length) return;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    await Promise.allSettled(
      urls.map(async (url) => {
        const response = await fetch(url, {
          cache: "reload",
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return;
        }
        if (!response.body) return;
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 8 * 1024 * 1024) {
              await reader.cancel();
              break;
            }
          }
        } finally {
          reader.releaseLock();
        }
      }),
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
