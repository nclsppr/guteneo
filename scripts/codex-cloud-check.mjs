import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DOCUMENTATION = Object.freeze({
  "cloudflare-docs": "https://developers.cloudflare.com/workers/",
  "telnyx-docs": "https://developers.telnyx.com/docs/overview",
  "openai-docs": "https://developers.openai.com/learn/docs-mcp",
});
const SERVICES = new Set([
  "cloudflare",
  "telnyx",
  ...Object.keys(DOCUMENTATION),
]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MARKER = "\n__GUTENEO_STATUS__";
const TOKEN_PATTERN = /^[\x21-\x7e]{1,4096}$/;
const ACCOUNT_PATTERN = /^[a-fA-F0-9]{32}$/;
const WORKER_PATTERN = /^[a-zA-Z0-9_-]{1,63}$/;

function usableToken(token) {
  // Provider dashboards can expose only a masked display value. Telnyx and
  // Cloudflare API keys do not contain '*'; never send that display as a key.
  return (
    typeof token === "string" &&
    TOKEN_PATTERN.test(token) &&
    !token.includes("*")
  );
}

function allowedUrl(url) {
  return (
    Object.values(DOCUMENTATION).includes(url) ||
    url === "https://api.telnyx.com/v2/balance" ||
    url === "https://api.cloudflare.com/client/v4/user/tokens/verify" ||
    /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-fA-F0-9]{32}\/(?:tokens\/verify|workers\/scripts\/[a-zA-Z0-9_-]{1,63}\/script-settings)$/.test(
      url,
    )
  );
}

function quote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

// curl uses the Cloud environment's HTTPS proxy. Authentication travels only
// through stdin, never command arguments, a temporary file, or diagnostics.
// --disable must be first: a user curlrc must not enable tracing or redirects.
export function createCurlTransport({
  spawnImpl = spawn,
  env = process.env,
} = {}) {
  return async ({ url, token }) => {
    if (!allowedUrl(url) || (token !== undefined && !usableToken(token)))
      return { failure: "invalid_configuration" };
    const config = [
      "silent",
      'request = "GET"',
      `url = ${quote(url)}`,
      'proto = "=https"',
      'proto-redir = "=https"',
      "connect-timeout = 5",
      "max-time = 12",
      "retry = 0",
      "max-redirs = 0",
      `max-filesize = ${MAX_BODY_BYTES}`,
      'output = "-"',
      'write-out = "\\n__GUTENEO_STATUS__%{http_code}"',
      ...(token ? [`header = ${quote(`Authorization: Bearer ${token}`)}`] : []),
    ].join("\n");
    const childEnv = Object.fromEntries(
      [
        "PATH",
        "HOME",
        "TMPDIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "CURL_CA_BUNDLE",
      ]
        .filter((key) => typeof env[key] === "string")
        .map((key) => [key, env[key]]),
    );
    return new Promise((done) => {
      let child;
      let completed = false;
      let size = 0;
      const chunks = [];
      let timer;
      const finish = (result) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        done(result);
      };
      try {
        child = spawnImpl("curl", ["--disable", "--config", "-"], {
          env: childEnv,
          stdio: ["pipe", "pipe", "ignore"],
          shell: false,
        });
        timer = setTimeout(() => {
          finish({ failure: "network_timeout" });
          child.kill("SIGKILL");
        }, 15000);
        child.once("error", () => finish({ failure: "transport_unavailable" }));
        child.stdin.on("error", () =>
          finish({ failure: "transport_unavailable" }),
        );
        child.stdout.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES + 100) {
            finish({ failure: "response_too_large" });
            child.kill("SIGKILL");
          } else chunks.push(chunk);
        });
        child.once("close", (code) => {
          if (completed) return;
          if (code !== 0) {
            const failure =
              code === 28
                ? "network_timeout"
                : code === 63
                  ? "response_too_large"
                  : [5, 6, 7, 35, 60, 97].includes(code)
                    ? "network_unavailable"
                    : "transport_failed";
            finish({ failure });
            return;
          }
          const output = Buffer.concat(chunks).toString("utf8");
          const position = output.lastIndexOf(MARKER);
          const statusText = output.slice(position + MARKER.length);
          if (position < 0 || !/^\d{3}$/.test(statusText)) {
            finish({ failure: "invalid_response" });
            return;
          }
          finish({
            status: Number(statusText),
            body: output.slice(0, position),
          });
        });
        child.stdin.end(`${config}\n`);
      } catch {
        finish({ failure: "transport_unavailable" });
        child?.kill("SIGKILL");
      }
    });
  };
}

const TRANSPORT_FAILURES = new Set([
  "invalid_configuration",
  "transport_unavailable",
  "network_timeout",
  "response_too_large",
  "network_unavailable",
  "transport_failed",
  "invalid_response",
]);

async function probe(transport, request, provider) {
  let response;
  try {
    response = await transport({
      ...request,
      method: "GET",
      redirect: "error",
    });
  } catch {
    return { status: "transport_failed" };
  }
  if (response?.failure)
    return {
      status: TRANSPORT_FAILURES.has(response.failure)
        ? response.failure
        : "transport_failed",
    };
  const status = response?.status;
  if (!Number.isInteger(status) || status < 100 || status > 599)
    return { status: "invalid_response" };
  if (status === 401)
    return { status: "authentication_rejected", httpStatus: status };
  if (status === 403 || status === 407)
    return { status: "access_denied", httpStatus: status };
  if (status >= 300 && status < 400)
    return { status: "redirect_blocked", httpStatus: status };
  if (status === 429) return { status: "rate_limited", httpStatus: status };
  if (status < 200 || status >= 300)
    return { status: "http_failed", httpStatus: status };
  if (!provider) return { status: "reachable", httpStatus: status };
  let data;
  try {
    data = JSON.parse(response.body);
  } catch {
    return { status: "invalid_response", httpStatus: status };
  }
  if (provider.startsWith("cloudflare")) {
    if (
      data?.success !== true ||
      !Array.isArray(data.errors) ||
      data.errors.length
    )
      return { status: "provider_rejected", httpStatus: status };
    if (provider === "cloudflare-token" && data.result?.status !== "active")
      return { status: "authentication_rejected", httpStatus: status };
    if (
      provider === "cloudflare-worker-settings" &&
      (!data.result ||
        typeof data.result !== "object" ||
        Array.isArray(data.result))
    )
      return { status: "invalid_response", httpStatus: status };
  } else if (
    data?.errors?.length ||
    !data?.data ||
    typeof data.data !== "object" ||
    Array.isArray(data.data) ||
    typeof data.data.balance !== "string"
  ) {
    return { status: "provider_rejected", httpStatus: status };
  }
  // Never return body fields, balances, token metadata or account/script names.
  return { status: "verified_get", httpStatus: status };
}

export async function checkCloudAccess({
  mode = "offline",
  env = process.env,
  required = [],
  transport = createCurlTransport({ env }),
} = {}) {
  if (
    !["offline", "network"].includes(mode) ||
    !Array.isArray(required) ||
    required.some((name) => !SERVICES.has(name))
  )
    throw new Error("Invalid cloud check options.");
  const checks = [];
  const add = (service, result) =>
    checks.push({ service, required: required.includes(service), ...result });
  for (const [service, url] of Object.entries(DOCUMENTATION))
    add(
      service,
      mode === "offline"
        ? { status: "not_checked" }
        : await probe(transport, { url }),
    );

  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const owner = env.CLOUDFLARE_TOKEN_OWNER || "user";
  const worker = env.CLOUDFLARE_WORKER_NAME || "guteneo-app";
  if (!cfToken || !account)
    add("cloudflare", {
      status: "not_configured",
      missing: [
        !cfToken && "CLOUDFLARE_API_TOKEN",
        !account && "CLOUDFLARE_ACCOUNT_ID",
      ].filter(Boolean),
    });
  else if (
    !usableToken(cfToken) ||
    !ACCOUNT_PATTERN.test(account) ||
    !WORKER_PATTERN.test(worker) ||
    !["user", "account"].includes(owner)
  )
    add("cloudflare", { status: "invalid_configuration" });
  else if (mode === "offline")
    add("cloudflare", { status: "configured_unverified" });
  else {
    const base = "https://api.cloudflare.com/client/v4";
    const tokenUrl =
      owner === "account"
        ? `${base}/accounts/${account}/tokens/verify`
        : `${base}/user/tokens/verify`;
    const tokenResult = await probe(
      transport,
      { url: tokenUrl, token: cfToken },
      "cloudflare-token",
    );
    if (tokenResult.status !== "verified_get")
      add("cloudflare", { ...tokenResult, stage: "token" });
    else
      add("cloudflare", {
        ...(await probe(
          transport,
          {
            url: `${base}/accounts/${account}/workers/scripts/${worker}/script-settings`,
            token: cfToken,
          },
          "cloudflare-worker-settings",
        )),
        stage: "worker_settings",
      });
  }

  const telnyxToken = env.TELNYX_API_KEY;
  if (!telnyxToken)
    add("telnyx", { status: "not_configured", missing: ["TELNYX_API_KEY"] });
  else if (!usableToken(telnyxToken))
    add("telnyx", { status: "invalid_configuration" });
  else if (mode === "offline")
    add("telnyx", { status: "configured_unverified" });
  else
    add(
      "telnyx",
      await probe(
        transport,
        { url: "https://api.telnyx.com/v2/balance", token: telnyxToken },
        "telnyx",
      ),
    );

  const accepted =
    mode === "offline"
      ? ["configured_unverified", "not_checked"]
      : ["reachable", "verified_get"];
  return {
    mode,
    ok: checks.every(
      (item) =>
        accepted.includes(item.status) ||
        (!item.required && item.status === "not_configured"),
    ),
    evidence:
      mode === "offline" ? "configuration_only" : "bounded_read_only_probes",
    checks,
  };
}

export async function main(args = process.argv.slice(2), options = {}) {
  let mode = "offline";
  let chosenMode;
  const required = [];
  for (const arg of args) {
    if (arg === "--offline" || arg === "--network") {
      if (chosenMode && chosenMode !== arg)
        throw new Error("Choose one cloud check mode.");
      chosenMode = arg;
      mode = arg.slice(2);
    } else if (arg.startsWith("--require="))
      required.push(...arg.slice(10).split(","));
    else throw new Error("Unsupported cloud check option.");
  }
  const report = await checkCloudAccess({ ...options, mode, required });
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = await main();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.error(
      "Cloud check failed: invalid options or unavailable local runtime.",
    );
    process.exitCode = 2;
  }
}
