// Anonymous, fixed-origin GETs only. Never accepts a token, URL, path or query argument.
import { pathToFileURL } from "node:url";

export const dashboardLinks = Object.freeze({
  app: "https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-app/production",
  documents:
    "https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-documents/production",
  scanner:
    "https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-scanner/production",
});

export async function productionStatus(fetcher = fetch) {
  const results = await Promise.all(
    ["/api/health", "/api/capabilities", "/release.json"].map(async (path) => {
      try {
        const response = await fetcher(`https://guteneo.com${path}`, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return { status: response.status, data: null };
        // Keep the operator tool bounded even if the upstream response is incorrect.
        const reader = response.body?.getReader();
        if (!reader) return { status: response.status, data: null };
        const chunks = [];
        let size = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65536) return { status: response.status, data: null };
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          status: response.status,
          data: JSON.parse(new TextDecoder().decode(bytes)),
        };
      } catch {
        return { status: null, data: null };
      }
    }),
  );
  const [health, capabilities, release] = results;
  const boolean = (value) => (typeof value === "boolean" ? value : null);
  const source = release.data?.sourceCommit;
  const validRelease =
    release.status === 200 &&
    typeof source === "string" &&
    /^[a-f0-9]{40}$/.test(source ?? "") &&
    release.data?.publicPreview === false &&
    release.data?.mode === "production";
  const liveSending = boolean(health.data?.liveSending);
  const registration = boolean(capabilities.data?.registration?.enabled);
  const healthy =
    health.status === 200 &&
    health.data?.status === "ok" &&
    health.data?.mode === "production" &&
    liveSending !== null;
  const capabilityResponseValid =
    capabilities.status === 200 &&
    capabilities.data?.mode === "production" &&
    boolean(capabilities.data?.liveSending) === liveSending &&
    registration !== null;
  return {
    checkedAt: new Date().toISOString(),
    status:
      healthy &&
      capabilityResponseValid &&
      validRelease &&
      release.data?.sourceDirty === false
        ? "ok"
        : "attention",
    healthStatus: health.status,
    capabilitiesStatus: capabilities.status,
    releaseStatus: release.status,
    sourceCommit: validRelease ? source : null,
    cleanRelease: validRelease
      ? boolean(release.data?.sourceDirty) === false
      : null,
    liveSending,
    identityConfigured: registration,
    scannerConnected: capabilities.data?.scanner === "connected",
    // A green HTTP probe does not qualify a provider, browser login, queue, or cron.
    deliveryQualification: "not_checked",
    operationalHistory:
      "Consulter Observability : erreurs, dernier cron, files et inconnus.",
    dashboards: dashboardLinks,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    console.error("Usage : node scripts/production-status.mjs (sans argument)");
    process.exitCode = 1;
  } else {
    const status = await productionStatus();
    console.log(JSON.stringify(status, null, 2));
    if (status.status !== "ok") process.exitCode = 1;
  }
}
