// An authenticated Cloudflare remote binding, with no HTTP listener or API key
// on this machine. Do not deploy the local helper configuration.
import { getPlatformProxy } from "wrangler";
import { fileURLToPath } from "node:url";

let proxy;
const provider = process.argv[2] || "telnyx";
if (
  ![
    "telnyx",
    "telnyx-fax-tariffs",
    "ses",
    "resend",
    "resend-policy-sources",
    "pingen",
    "pingen-upload-origin",
  ].includes(provider)
) {
  console.error(
    "Usage: node scripts/provider-readiness.mjs [telnyx|telnyx-fax-tariffs|ses|resend|resend-policy-sources|pingen|pingen-upload-origin]",
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
    provider === "telnyx-fax-tariffs"
      ? await proxy.env.PROVIDERS.inspectTelnyxFaxTariffCatalog()
      : provider === "resend-policy-sources"
        ? await proxy.env.PROVIDERS.inspectResendPolicySources()
      : provider === "pingen-upload-origin"
        ? await proxy.env.PROVIDERS.inspectPingenUploadOrigin()
        : provider === "pingen"
          ? await proxy.env.PROVIDERS.inspectPingen()
          : provider === "resend"
            ? await proxy.env.PROVIDERS.inspectResend()
            : provider === "ses"
              ? await proxy.env.PROVIDERS.inspectSes()
              : await proxy.env.PROVIDERS.inspectTelnyx();
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error(
    "Provider inspection unavailable. Check the private Cloudflare binding and deployment.",
  );
  process.exitCode = 1;
} finally {
  await proxy?.dispose();
}
