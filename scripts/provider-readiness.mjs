// An authenticated Cloudflare remote binding, with no HTTP listener or API key
// on this machine. Do not deploy the local helper configuration.
import { getPlatformProxy } from "wrangler";
import { fileURLToPath } from "node:url";

let proxy;
const provider = process.argv[2] || "telnyx";
if (!["telnyx", "ses", "pingen"].includes(provider)) {
  console.error(
    "Usage : node scripts/provider-readiness.mjs [telnyx|ses|pingen]",
  );
  process.exit(1);
}
try {
  proxy = await getPlatformProxy({
    configPath: fileURLToPath(
      new URL("./provider-readiness.jsonc", import.meta.url),
    ),
    persist: false,
  });
  const result =
    provider === "pingen"
      ? await proxy.env.PROVIDERS.inspectPingen()
      : provider === "ses"
        ? await proxy.env.PROVIDERS.inspectSes()
        : await proxy.env.PROVIDERS.inspectTelnyx();
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error(
    "Inspection du fournisseur indisponible. Vérifiez la liaison Cloudflare privée et le déploiement.",
  );
  process.exitCode = 1;
} finally {
  await proxy?.dispose();
}
