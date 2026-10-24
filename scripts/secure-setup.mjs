import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// EU SES API endpoints listed by AWS; do not infer support from a region name.
// https://docs.aws.amazon.com/general/latest/gr/ses.html
const sesRegions = new Set([
  "eu-west-1",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
]);
const profiles = {
  "resend-webhook": {
    title: "Configure Resend callbacks",
    description:
      "The Guteneo webhook signing secret will be stored in Cloudflare. The existing sending key is unchanged.",
    fields: [
      ["RESEND_WEBHOOK_SECRET", "Secret de signature du webhook Resend", true],
    ],
  },
  "resend-key": {
    title: "Save the Guteneo Resend key",
    description:
      "Only the API key will be stored in the RESEND_API_KEY secret on Cloudflare. Use a Sending access key restricted to guteneo.com. This form neither selects the provider nor enables sending.",
    note: "Account identity, domain and webhook require separate qualification. No account ID is inferred from the key. Sending gates remain unchanged.",
    fields: [
      ["RESEND_API_KEY", "Resend API key for Guteneo sending", true],
    ],
  },
  resend: {
    title: "Connect Resend email",
    description:
      "Credentials will be stored in Guteneo secrets on Cloudflare. Use a dedicated Guteneo Resend key with Sending access restricted to guteneo.com. This form neither selects the provider nor enables sending.",
    note: "Domain verification and key permissions must be checked in Resend. The account ID is the Resend team qualified for pricing. The Auth0 key is separate and configured independently. The webhook secret can be added after notification setup.",
    fields: [
      ["RESEND_API_KEY", "Resend API key for Guteneo sending", true],
      [
        "RESEND_ACCOUNT_ID",
        "Resend account or team ID",
        true,
      ],
      ["RESEND_DOMAIN_ID", "Identifiant du domaine Resend", true],
      [
        "RESEND_VERIFIED_DOMAIN",
        "Verified Resend domain: guteneo.com",
        true,
      ],
      ["RESEND_WEBHOOK_SECRET", "Secret de signature du webhook Resend", false],
    ],
  },
  "auth0-resend": {
    title: "Prepare Resend in Auth0",
    description:
      "The key will be sent to Auth0’s native email provider, left disabled. Use a key distinct from Guteneo’s, with Sending access restricted to guteneo.com. The provider affects the whole Auth0 tenant, including other applications; this form cannot replace an active provider.",
    note: "Preparation neither enables the provider nor sends email. Activation and real qualification require a separate operation. The key is not sent to Cloudflare.",
    destination: "Auth0",
    button: "Prepare in Auth0 without activation",
    success:
      "Provider prepared in Auth0 and reread as disabled. No email sent.",
    fields: [
      ["RESEND_AUTH0_API_KEY", "Dedicated Auth0 Resend API key", true],
      [
        "RESEND_AUTH0_FROM",
        "Auth0 sender address, for example no-reply@guteneo.com",
        true,
      ],
    ],
  },
  pingen: {
    title: "Connect Pingen postal mail",
    description:
      "Your Pingen application credentials will be stored in Guteneo secrets on Cloudflare. This connection creates no letter and enables no sending. Use a dedicated Guteneo application with Client Credentials.",
    note: "The organisation ID identifies your Pingen organisation. The webhook secret is configured separately when enabling notifications; it is not needed to check the connection.",
    fields: [
      ["PINGEN_CLIENT_ID", "Identifiant client Pingen", true],
      ["PINGEN_CLIENT_SECRET", "Secret client Pingen", true],
      ["PINGEN_ORGANIZATION_ID", "Identifiant de l’organisation Pingen", true],
    ],
  },
  telnyx: {
    title: "Connect Telnyx fax",
    description:
      "The key will be stored in Guteneo service secrets on Cloudflare. This operation sends no fax and enables no payment.",
    fields: [
      ["TELNYX_API_KEY", "Telnyx API key", true],
      ["TELNYX_CONNECTION_ID", "Identifiant de l’application fax", false],
      ["TELNYX_FROM", "Sender number in international format, for example +33…", false],
      [
        "TELNYX_PUBLIC_KEY",
        "Notification verification public key",
        false,
      ],
    ],
  },
  stripe: {
    title: "Connect Stripe billing",
    description:
      "Use a restricted live key permitting only customers, invoices, payments, subscriptions and the customer portal. This connection triggers no charge.",
    fields: [
      ["STRIPE_API_KEY", "Restricted Stripe API key", true],
      ["STRIPE_WEBHOOK_SECRET", "Secret de signature du webhook", false],
    ],
  },
  ses: {
    title: "Connect Amazon SES email",
    description:
      "Credentials will be stored in Guteneo secrets on Cloudflare with sandbox status. This connection sends no email and enables no production sending. Use a dedicated Guteneo IAM key, never a root-account key or SMTP password.",
    note: "Blank optional fields preserve existing configuration, except the temporary AWS token: a permanent key clears the previous token. Sandbox removal must be checked separately in AWS.",
    fields: [
      ["AWS_ACCESS_KEY_ID", "AWS access key ID", true],
      ["AWS_SECRET_ACCESS_KEY", "AWS secret access key", true],
      [
        "AWS_REGION",
        "EU SES region, for example eu-west-3",
        true,
      ],
      ["SES_CONFIGURATION_SET", "Nom du jeu de configuration SES", true],
      [
        "SES_SNS_TOPIC_ARN",
        "SNS topic ARN for SES notifications",
        false,
      ],
      [
        "AWS_SESSION_TOKEN",
        "Temporary AWS token, required for an ASIA key",
        false,
      ],
    ],
  },
};
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const equal = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Values travel only through a pipe to Wrangler. Never pass them in arguments,
// environment variables, output, temporary files, or error messages.
export function writeCloudflareSecrets(values, config = "wrangler.live.jsonc") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
        ),
        "secret",
        "bulk",
        "--config",
        config,
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        stdio: ["pipe", "ignore", "ignore"],
        env: {
          ...process.env,
          CI: "true",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_LOG: "error",
          WRANGLER_WRITE_LOGS: "false",
        },
      },
    );
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Secret upload timed out"));
    }, 60_000);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Secret upload unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else reject(new Error("Secret upload failed"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(values));
  });
}

export async function startSecureSetup({
  profile = "telnyx",
  writer = writeCloudflareSecrets,
  timeoutMs = 30 * 60_000,
} = {}) {
  if (profile === "aws") profile = "ses";
  const settings = Object.hasOwn(profiles, profile)
    ? profiles[profile]
    : undefined;
  if (!settings) throw new Error("Unknown setup profile");
  if (profile === "auth0-resend" && writer === writeCloudflareSecrets)
    throw new Error("Use the dedicated Auth0 Resend preparation utility");
  const destination = settings.destination ?? "Cloudflare";
  const path = `/setup/${randomBytes(32).toString("hex")}`;
  const csrf = randomBytes(32).toString("hex");
  let origin = "";
  let busy = false;
  let completed = false;
  const html = (message = "", success = false) =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Guteneo — private setup</title><style>body{font:17px/1.55 system-ui,sans-serif;background:#f7f5ef;color:#182338;margin:0}main{max-width:590px;padding:48px 24px;margin:auto}h1{font:44px/1.08 Georgia,serif;letter-spacing:-1px}label{display:block;margin:24px 0 8px;font-weight:600}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #72786d;border-radius:4px;background:#fff;font:inherit}button{background:#234ce0;color:white;border:0;padding:15px 24px;margin-top:28px;font:inherit;cursor:pointer}small{display:block;margin-top:24px;color:#536079}a{color:#234ce0}.message{padding:18px;background:#e9eefb}</style><main><p>GUTENEO · PRIVATE SETUP</p><h1>${settings.title}</h1><p>${settings.description}</p>${message ? `<p class="message" role="status">${message}</p>` : ""}${success ? "<p>You can close this window. Values will not be shown to the assistant.</p>" : `<form method="post" action="${path}" autocomplete="off"><input type="hidden" name="csrf" value="${csrf}">${settings.fields.map(([key, label, required]) => `<label for="${key}">${escape(label)}${required ? "" : " (optional)"}</label><input id="${key}" name="${key}" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="none" maxlength="4096" ${required ? "required" : ""}>`).join("")}<button type="submit">${settings.button ?? "Save in Cloudflare"}</button></form><small>This form runs only on your computer. Values stay in memory during encrypted transfer to ${destination}. No key file is created. The page expires after 30 minutes. ${settings.note ?? "Blank optional fields preserve existing configuration."}</small>`}</main></html>`;
  const server = createServer(async (req, res) => {
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Referrer-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(body);
    };
    if (req.headers.host !== new URL(origin).host || req.url !== path)
      return send(404, "Not found");
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(403, "Forbidden");
    if (completed) return send(410, "This form has ended.");
    if (req.method === "GET")
      return send(200, html(), "text/html; charset=utf-8");
    if (req.method !== "POST") return send(405, "Method not allowed");
    if (
      req.headers.origin !== origin ||
      req.headers["content-type"]?.split(";")[0] !==
        "application/x-www-form-urlencoded"
    )
      return send(403, "Forbidden");
    if (busy) return send(409, "A submission is already in progress.");
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) {
          send(413, "Form is too large.");
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const fields = new URLSearchParams(body.toString("utf8"));
      body.fill(0);
      for (const chunk of chunks) chunk.fill(0);
      if (
        !equal(fields.get("csrf"), csrf) ||
        fields.getAll("csrf").length !== 1
      )
        return send(403, "Forbidden");
      const allowed = new Set([
        "csrf",
        ...settings.fields.map(([name]) => name),
      ]);
      if (
        [...fields.keys()].some(
          (key) => !allowed.has(key) || fields.getAll(key).length !== 1,
        )
      )
        return send(400, "Invalid fields.");
      const values = {};
      for (const [name, , required] of settings.fields) {
        const value = (fields.get(name) ?? "").trim();
        if (
          (required && !value) ||
          value.length > 4096 ||
          /[\u0000-\u001f\u007f]/.test(value)
        )
          return send(400, "Invalid value.");
        if (value) values[name] = value;
        fields.delete(name);
      }
      if (
        profile === "resend-webhook" &&
        !/^whsec_[A-Za-z0-9+/=]{20,200}$/.test(
          values.RESEND_WEBHOOK_SECRET ?? "",
        )
      )
        return send(400, "Invalid signing secret.");
      if (["resend", "resend-key", "auth0-resend"].includes(profile)) {
        const key = values.RESEND_API_KEY ?? values.RESEND_AUTH0_API_KEY;
        if (!/^re_[A-Za-z0-9_-]{20,200}$/.test(key))
          return send(400, "Invalid Resend API key.");
        if (profile === "resend") {
          if (
            !/^[A-Za-z0-9_-]{1,128}$/.test(values.RESEND_ACCOUNT_ID) ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              values.RESEND_DOMAIN_ID,
            ) ||
            values.RESEND_VERIFIED_DOMAIN !== "guteneo.com" ||
            (values.RESEND_WEBHOOK_SECRET &&
              !/^whsec_[A-Za-z0-9+/=_-]{20,200}$/.test(
                values.RESEND_WEBHOOK_SECRET,
              ))
          )
            return send(
              400,
              "Invalid Resend configuration. Use guteneo.com and its verified identifiers.",
            );
        } else if (
          profile === "auth0-resend" &&
          !/^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,62}[A-Za-z0-9])?@guteneo\.com$/.test(
            values.RESEND_AUTH0_FROM,
          )
        ) {
          return send(
            400,
            "Utilisez une adresse simple du domaine guteneo.com.",
          );
        }
      }
      if (values.TELNYX_FROM && !/^\+[1-9]\d{6,14}$/.test(values.TELNYX_FROM))
        return send(400, "The number must use international format.");
      if (
        profile === "pingen" &&
        !/^[a-zA-Z0-9_-]{1,128}$/.test(values.PINGEN_ORGANIZATION_ID)
      )
        return send(400, "Invalid Pingen organisation ID.");
      if (values.STRIPE_API_KEY) {
        if (!/^rk_live_[a-zA-Z0-9]+$/.test(values.STRIPE_API_KEY))
          return send(
            400,
            "Use a restricted live key (rk_live_) for this service.",
          );
        values.STRIPE_MODE = "live";
      }
      if (profile === "ses") {
        if (
          !/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(values.AWS_ACCESS_KEY_ID) ||
          !/^[A-Za-z0-9/+=]{40}$/.test(values.AWS_SECRET_ACCESS_KEY)
        )
          return send(
            400,
            "Invalid AWS credentials. Use an IAM API access key.",
          );
        if (!sesRegions.has(values.AWS_REGION))
          return send(
            400,
            "Unsupported SES region. Use a verified SES region in the European Union.",
          );
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(values.SES_CONFIGURATION_SET))
          return send(400, "Invalid SES configuration set name.");
        if (values.SES_SNS_TOPIC_ARN) {
          const topic =
            /^arn:aws:sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9_-]{1,256}$/.exec(
              values.SES_SNS_TOPIC_ARN,
            );
          if (!topic || topic[1] !== values.AWS_REGION)
            return send(
              400,
              "The SNS topic must be a standard topic in the same SES region.",
            );
        }
        const temporary = values.AWS_ACCESS_KEY_ID.startsWith("ASIA");
        if (
          (temporary &&
            (!values.AWS_SESSION_TOKEN ||
              /\s/.test(values.AWS_SESSION_TOKEN))) ||
          (!temporary && values.AWS_SESSION_TOKEN)
        )
          return send(
            400,
            "A temporary ASIA key requires its AWS token; a permanent AKIA key must be used without a token.",
          );
        // Prevent an old temporary credential from surviving an IAM-key replacement.
        if (!temporary) values.AWS_SESSION_TOKEN = "";
        // Installing credentials cannot attest to AWS production-access approval.
        values.SES_SANDBOX = "true";
      }
      try {
        await writer(values);
      } finally {
        for (const key of Object.keys(values)) values[key] = "";
      }
      completed = true;
      send(
        200,
        html(
          settings.success ?? "Configuration saved in Cloudflare.",
          true,
        ),
        "text/html; charset=utf-8",
      );
      setTimeout(() => server.close(), 1000).unref();
    } catch {
      send(
        503,
        html(
          `Transfer did not complete. Check the ${destination} connection and remote state before entering values again; values were not retained.`,
        ),
        "text/html; charset=utf-8",
      );
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 70_000;
  server.headersTimeout = 10_000;
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise),
  );
  origin = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(() => server.close(), timeoutMs).unref();
  server.on("close", () => clearTimeout(timer));
  return {
    url: `${origin}${path}`,
    server,
    close: () => new Promise((r) => server.close(r)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const setup = await startSecureSetup({
    profile: process.argv[2] || "telnyx",
  });
  console.log(`Private form available for 30 minutes: ${setup.url}`);
}
