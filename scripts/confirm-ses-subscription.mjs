import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const SES_TOPIC_ARN =
  "arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events";
const MAX_AGE_MS = 48 * 60 * 60_000;
const MAX_LIFETIME_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 65_536;
const query = `SELECT provider,event_id,status,payload_json,received_at
FROM provider_receipts
WHERE provider='ses' AND status='unrecognized'
AND json_extract(payload_json,'$.metadata.type')='SubscriptionConfirmation'
AND json_extract(payload_json,'$.metadata.topicArn')='${SES_TOPIC_ARN}'
AND json_type(payload_json,'$.metadata.confirmationToken')='text'
ORDER BY received_at DESC,event_id DESC LIMIT 1`;

const invalid = () => new Error("No valid recent SNS confirmation receipt");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");

/** The application verifies SNS v2 signatures before writing these minimal receipts.
 * The original signed envelope is deliberately not retained: this helper checks
 * receipt provenance fields and freshness, rather than claiming to reverify it.
 */
export function validateConfirmationReceipt(row, now = Date.now()) {
  try {
    if (
      !object(row) ||
      row.provider !== "ses" ||
      row.status !== "unrecognized" ||
      typeof row.event_id !== "string" ||
      !/^[A-Za-z0-9_.:-]{1,250}$/.test(row.event_id) ||
      typeof row.payload_json !== "string" ||
      row.payload_json.length > 16_384
    )
      throw invalid();
    const payload = JSON.parse(row.payload_json);
    const metadata = payload?.metadata;
    if (
      !object(payload) ||
      !object(metadata) ||
      Object.keys(payload).some((key) => key !== "metadata") ||
      Object.keys(metadata).some(
        (key) =>
          ![
            "type",
            "topicArn",
            "occurredAt",
            "confirmationToken",
            "reason",
          ].includes(key),
      ) ||
      metadata.type !== "SubscriptionConfirmation" ||
      metadata.topicArn !== SES_TOPIC_ARN ||
      typeof metadata.confirmationToken !== "string" ||
      !/^[A-Za-z0-9+/=_-]{16,4096}$/.test(metadata.confirmationToken)
    )
      throw invalid();
    if (
      typeof metadata.occurredAt !== "string" ||
      typeof row.received_at !== "string"
    )
      throw invalid();
    const occurred = Date.parse(metadata.occurredAt);
    const received = Date.parse(row.received_at);
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(occurred) ||
      !Number.isFinite(received) ||
      now - occurred >= MAX_AGE_MS ||
      now - received >= MAX_AGE_MS ||
      occurred > now + 5 * 60_000 ||
      received > now + 5 * 60_000 ||
      received < occurred - 5 * 60_000
    )
      throw invalid();
    return {
      eventId: row.event_id,
      topicArn: SES_TOPIC_ARN,
      occurredAt: new Date(occurred).toISOString(),
      receivedAt: new Date(received).toISOString(),
      expiresAt: Math.min(occurred, received) + MAX_AGE_MS,
      ageSeconds: Math.max(0, Math.floor((now - occurred) / 1000)),
      token: metadata.confirmationToken,
    };
  } catch {
    // Never include a database payload or JSON parser snippet in diagnostics.
    throw invalid();
  }
}

function captureWrangler(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
        ),
        ...args,
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        stdio: ["ignore", "pipe", "ignore"],
        env: {
          ...process.env,
          CI: "true",
          WRANGLER_SEND_METRICS: "false",
          // D1 --json suppresses progress itself, then emits its final JSON at
          // "log" level. Keep that level only in this private stdout pipe.
          WRANGLER_LOG: "log",
          WRANGLER_WRITE_LOGS: "false",
        },
      },
    );
    const chunks = [];
    let size = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (failed || size > MAX_OUTPUT_BYTES) {
        chunk.fill(0);
        failed = true;
        child.kill();
      } else chunks.push(chunk);
    });
    const clear = () => {
      clearTimeout(timer);
      for (const chunk of chunks) chunk.fill(0);
    };
    child.once("error", () => {
      clear();
      reject(new Error("SNS receipt retrieval unavailable"));
    });
    child.once("close", (code) => {
      if (failed || code !== 0) {
        clear();
        return reject(new Error("SNS receipt retrieval unavailable"));
      }
      const buffer = Buffer.concat(chunks);
      const output = buffer.toString("utf8");
      buffer.fill(0);
      clear();
      resolvePromise(output);
    });
  });
}

export async function readConfirmationReceipt({
  run = captureWrangler,
  now = Date.now(),
} = {}) {
  try {
    const output = await run([
      "d1",
      "execute",
      "guteneo-production",
      "--remote",
      "--config",
      "wrangler.live.jsonc",
      "--command",
      query,
      "--json",
    ]);
    if (
      typeof output !== "string" ||
      Buffer.byteLength(output) > MAX_OUTPUT_BYTES
    )
      throw invalid();
    const result = JSON.parse(output);
    if (
      !Array.isArray(result) ||
      result.length !== 1 ||
      result[0]?.success !== true ||
      !Array.isArray(result[0].results) ||
      result[0].results.length !== 1
    )
      throw invalid();
    return validateConfirmationReceipt(result[0].results[0], now);
  } catch {
    throw new Error(
      "SNS receipt retrieval unavailable or no valid recent confirmation",
    );
  }
}

export async function startSnsConfirmation({
  reader = readConfirmationReceipt,
  timeoutMs = MAX_LIFETIME_MS,
  now = Date.now,
} = {}) {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_LIFETIME_MS
  )
    throw new Error("Invalid local confirmation lifetime");
  const receipt = await reader();
  const lifetime = Math.min(timeoutMs, receipt.expiresAt - now());
  if (!Number.isFinite(lifetime) || lifetime <= 0) throw invalid();
  const expiresAt = now() + lifetime;
  const path = `/sns/${randomBytes(32).toString("hex")}`;
  const nonce = randomBytes(32).toString("base64");
  let origin = "";
  let revealed = false;
  const server = createServer((req, res) => {
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
        "Permissions-Policy": "clipboard-read=(), clipboard-write=(self)",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(body);
    };
    if (req.headers.host !== new URL(origin).host || req.url !== path)
      return send(404, "Not found");
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(403, "Forbidden");
    if (req.method !== "GET") return send(405, "Method not allowed");
    if (revealed || now() >= expiresAt)
      return send(410, "Cette consultation est terminée.");
    revealed = true;
    const body = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Guteneo — confirmation SNS privée</title><style>body{font:17px/1.55 system-ui,sans-serif;background:#f5f2e9;color:#222520;margin:0}main{max-width:700px;padding:40px 24px;margin:auto}h1{font:40px/1.1 Georgia,serif}label{display:block;margin:24px 0 8px;font-weight:600}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #72786d;font:inherit}button{margin-top:18px;padding:12px 20px;border:0;background:#284c3e;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.55}code{overflow-wrap:anywhere}small{display:block;margin-top:24px}</style><main><p>GUTENEO · CONFIRMATION PRIVÉE</p><h1>Confirmer les notifications SES</h1><p>Reçu : <code>${escape(receipt.eventId)}</code></p><p>Sujet : <code>${escape(receipt.topicArn)}</code></p><p>Âge du reçu : ${receipt.ageSeconds} secondes.</p><label for="token">Jeton SNS privé</label><input id="token" type="password" readonly autocomplete="off" spellcheck="false" value="${escape(receipt.token)}"><button id="copy" type="button">Copier le jeton</button><p id="status" role="status"></p><small>Transférez ce jeton dans la saisie masquée de CloudShell. Ne l’affichez pas dans la conversation. Cette page est consultable une seule fois ; le serveur expire après dix minutes au maximum. Fermez la page et videz le presse-papiers après confirmation. Aucun appel AWS ni aucune modification de la base ne sont effectués ici.</small></main><script nonce="${nonce}">const token = document.getElementById("token"), button = document.getElementById("copy"), status = document.getElementById("status"); button.addEventListener("click", async () => { button.disabled = true; try { await navigator.clipboard.writeText(token.value); token.value = ""; token.removeAttribute("value"); status.textContent = "Jeton copié. Collez-le dans la saisie masquée de CloudShell, puis videz le presse-papiers."; } catch { button.disabled = false; status.textContent = "Copie indisponible. Vérifiez l’autorisation du presse-papiers dans le navigateur."; } }); setTimeout(() => { token.value = ""; token.removeAttribute("value"); button.disabled = true; status.textContent = "Cette consultation est terminée."; }, ${Math.max(0, expiresAt - now())});</script></html>`;
    receipt.token = "";
    send(200, body, "text/html; charset=utf-8");
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise),
  );
  origin = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(() => {
    receipt.token = "";
    server.close();
  }, lifetime).unref();
  server.on("close", () => {
    clearTimeout(timer);
    receipt.token = "";
  });
  return {
    url: `${origin}${path}`,
    eventId: receipt.eventId,
    topicArn: receipt.topicArn,
    ageSeconds: receipt.ageSeconds,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const setup = await startSnsConfirmation();
    console.log(
      `Confirmation privée disponible pendant dix minutes au maximum : ${setup.url}`,
    );
    console.log(
      `Reçu ${setup.eventId} ; âge ${setup.ageSeconds} secondes ; ${setup.topicArn}`,
    );
  } catch {
    console.error(
      "Confirmation SNS indisponible : vérifiez le reçu signé récent et l’accès Cloudflare.",
    );
    process.exitCode = 1;
  }
}
