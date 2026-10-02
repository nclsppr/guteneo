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
    title: "Configurer les retours Resend",
    description:
      "Le secret de signature du webhook Guteneo sera enregistré dans Cloudflare. La clé d’envoi existante reste inchangée.",
    fields: [
      ["RESEND_WEBHOOK_SECRET", "Secret de signature du webhook Resend", true],
    ],
  },
  "resend-key": {
    title: "Enregistrer la clé Resend de Guteneo",
    description:
      "Seule la clé API sera enregistrée dans le secret RESEND_API_KEY sur Cloudflare. Utilisez une clé Sending access limitée au domaine guteneo.com. Cette saisie ne sélectionne pas le fournisseur et n’active aucun envoi.",
    note: "L’identité du compte, le domaine et le webhook restent à qualifier séparément. Aucun identifiant de compte n’est déduit de la clé. Les verrous d’envoi sont inchangés.",
    fields: [
      ["RESEND_API_KEY", "Clé API Resend pour les envois Guteneo", true],
    ],
  },
  resend: {
    title: "Connecter les emails Resend",
    description:
      "Les accès seront enregistrés dans les secrets Guteneo sur Cloudflare. Utilisez une clé Resend dédiée aux envois Guteneo, avec la permission Sending access limitée au domaine guteneo.com. Cette saisie ne sélectionne pas le fournisseur et n’active aucun envoi.",
    note: "La vérification du domaine et les droits de la clé doivent être contrôlés dans Resend. L’identifiant de compte est celui de l’équipe Resend qualifiée pour la tarification. La clé Auth0 est distincte et se configure séparément. Le secret de webhook peut être ajouté après la création de la notification.",
    fields: [
      ["RESEND_API_KEY", "Clé API Resend pour les envois Guteneo", true],
      [
        "RESEND_ACCOUNT_ID",
        "Identifiant du compte ou de l’équipe Resend",
        true,
      ],
      ["RESEND_DOMAIN_ID", "Identifiant du domaine Resend", true],
      [
        "RESEND_VERIFIED_DOMAIN",
        "Domaine vérifié dans Resend : guteneo.com",
        true,
      ],
      ["RESEND_WEBHOOK_SECRET", "Secret de signature du webhook Resend", false],
    ],
  },
  "auth0-resend": {
    title: "Préparer Resend dans Auth0",
    description:
      "La clé sera transmise au fournisseur email natif d’Auth0, laissé désactivé. Utilisez une clé distincte de celle de Guteneo, avec Sending access limité à guteneo.com. Le fournisseur concerne tout le tenant Auth0, y compris ses autres applications ; la saisie ne peut remplacer aucun fournisseur actif.",
    note: "Cette préparation n’active pas le fournisseur et n’envoie aucun email. L’activation et la qualification réelle nécessitent une opération distincte. La clé n’est pas transmise à Cloudflare.",
    destination: "Auth0",
    button: "Préparer dans Auth0, sans activation",
    success:
      "Fournisseur préparé dans Auth0 et relu désactivé. Aucun email envoyé.",
    fields: [
      ["RESEND_AUTH0_API_KEY", "Clé API Resend dédiée à Auth0", true],
      [
        "RESEND_AUTH0_FROM",
        "Adresse d’expédition Auth0, par exemple no-reply@guteneo.com",
        true,
      ],
    ],
  },
  pingen: {
    title: "Connecter le courrier Pingen",
    description:
      "Les accès de votre application Pingen seront enregistrés dans les secrets Guteneo sur Cloudflare. Cette connexion ne crée aucun courrier et n’active aucun envoi. Utilisez une application dédiée à Guteneo avec le type Client Credentials.",
    note: "L’identifiant d’organisation désigne votre organisation Pingen. Le secret de webhook sera configuré séparément lors de l’activation des notifications ; il n’est pas nécessaire pour vérifier la connexion.",
    fields: [
      ["PINGEN_CLIENT_ID", "Identifiant client Pingen", true],
      ["PINGEN_CLIENT_SECRET", "Secret client Pingen", true],
      ["PINGEN_ORGANIZATION_ID", "Identifiant de l’organisation Pingen", true],
    ],
  },
  telnyx: {
    title: "Connecter le fax Telnyx",
    description:
      "La clé sera enregistrée dans les secrets du service Guteneo sur Cloudflare. Cette opération n’envoie aucun fax et n’active aucun paiement.",
    fields: [
      ["TELNYX_API_KEY", "Clé API Telnyx", true],
      ["TELNYX_CONNECTION_ID", "Identifiant de l’application fax", false],
      ["TELNYX_FROM", "Numéro d’expédition, au format +33…", false],
      [
        "TELNYX_PUBLIC_KEY",
        "Clé publique de vérification des notifications",
        false,
      ],
    ],
  },
  stripe: {
    title: "Connecter la facturation Stripe",
    description:
      "Utilisez une clé restreinte de production autorisant uniquement les clients, factures, paiements, abonnements et le portail client. Cette connexion ne déclenche aucun débit.",
    fields: [
      ["STRIPE_API_KEY", "Clé API restreinte Stripe", true],
      ["STRIPE_WEBHOOK_SECRET", "Secret de signature du webhook", false],
    ],
  },
  ses: {
    title: "Connecter les emails Amazon SES",
    description:
      "Les identifiants seront enregistrés dans les secrets Guteneo sur Cloudflare, avec le statut sandbox. Cette connexion n’envoie aucun email et n’active pas les envois de production. Utilisez une clé IAM dédiée à Guteneo, jamais une clé du compte racine ni un mot de passe SMTP.",
    note: "Les champs facultatifs vides conservent la configuration existante, sauf le jeton temporaire AWS : une clé permanente efface l’ancien jeton. La sortie de sandbox doit être vérifiée séparément dans AWS.",
    fields: [
      ["AWS_ACCESS_KEY_ID", "Identifiant de la clé d’accès AWS", true],
      ["AWS_SECRET_ACCESS_KEY", "Clé d’accès secrète AWS", true],
      [
        "AWS_REGION",
        "Région SES dans l’Union européenne, par exemple eu-west-3",
        true,
      ],
      ["SES_CONFIGURATION_SET", "Nom du jeu de configuration SES", true],
      [
        "SES_SNS_TOPIC_ARN",
        "ARN du sujet SNS pour les notifications SES",
        false,
      ],
      [
        "AWS_SESSION_TOKEN",
        "Jeton temporaire AWS, obligatoire pour une clé ASIA",
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
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Guteneo — connexion privée</title><style>body{font:17px/1.55 system-ui,sans-serif;background:#f5f2e9;color:#222520;margin:0}main{max-width:590px;padding:48px 24px;margin:auto}h1{font:44px/1.08 Georgia,serif;letter-spacing:-1px}label{display:block;margin:24px 0 8px;font-weight:600}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #72786d;border-radius:4px;background:#fff;font:inherit}button{background:#284c3e;color:white;border:0;padding:15px 24px;margin-top:28px;font:inherit;cursor:pointer}small{display:block;margin-top:24px;color:#535a50}a{color:#284c3e}.message{padding:18px;background:#e0e8dc}</style><main><p>GUTENEO · CONNEXION PRIVÉE</p><h1>${settings.title}</h1><p>${settings.description}</p>${message ? `<p class="message" role="status">${message}</p>` : ""}${success ? "<p>Vous pouvez fermer cette fenêtre. Les valeurs ne seront pas affichées à l’assistant.</p>" : `<form method="post" action="${path}" autocomplete="off"><input type="hidden" name="csrf" value="${csrf}">${settings.fields.map(([key, label, required]) => `<label for="${key}">${escape(label)}${required ? "" : " (facultatif)"}</label><input id="${key}" name="${key}" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="none" maxlength="4096" ${required ? "required" : ""}>`).join("")}<button type="submit">${settings.button ?? "Enregistrer dans Cloudflare"}</button></form><small>Ce formulaire fonctionne uniquement sur votre ordinateur. Les valeurs restent en mémoire le temps de la transmission chiffrée à ${destination}. Aucun fichier de clés n’est créé. La page expire après 30 minutes. ${settings.note ?? "Les champs facultatifs vides conservent la configuration existante."}</small>`}</main></html>`;
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
    if (completed) return send(410, "Cette saisie est terminée.");
    if (req.method === "GET")
      return send(200, html(), "text/html; charset=utf-8");
    if (req.method !== "POST") return send(405, "Method not allowed");
    if (
      req.headers.origin !== origin ||
      req.headers["content-type"]?.split(";")[0] !==
        "application/x-www-form-urlencoded"
    )
      return send(403, "Forbidden");
    if (busy) return send(409, "Une transmission est déjà en cours.");
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) {
          send(413, "Formulaire trop volumineux.");
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
        return send(400, "Champs invalides.");
      const values = {};
      for (const [name, , required] of settings.fields) {
        const value = (fields.get(name) ?? "").trim();
        if (
          (required && !value) ||
          value.length > 4096 ||
          /[\u0000-\u001f\u007f]/.test(value)
        )
          return send(400, "Valeur invalide.");
        if (value) values[name] = value;
        fields.delete(name);
      }
      if (
        profile === "resend-webhook" &&
        !/^whsec_[A-Za-z0-9+/=]{20,200}$/.test(
          values.RESEND_WEBHOOK_SECRET ?? "",
        )
      )
        return send(400, "Secret de signature invalide.");
      if (["resend", "resend-key", "auth0-resend"].includes(profile)) {
        const key = values.RESEND_API_KEY ?? values.RESEND_AUTH0_API_KEY;
        if (!/^re_[A-Za-z0-9_-]{20,200}$/.test(key))
          return send(400, "Clé API Resend invalide.");
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
              "Configuration Resend invalide. Utilisez le domaine guteneo.com et ses identifiants vérifiés.",
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
        return send(400, "Le numéro doit être au format international.");
      if (
        profile === "pingen" &&
        !/^[a-zA-Z0-9_-]{1,128}$/.test(values.PINGEN_ORGANIZATION_ID)
      )
        return send(400, "Identifiant d’organisation Pingen invalide.");
      if (values.STRIPE_API_KEY) {
        if (!/^rk_live_[a-zA-Z0-9]+$/.test(values.STRIPE_API_KEY))
          return send(
            400,
            "Utilisez une clé restreinte de production (rk_live_) pour ce service.",
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
            "Identifiants AWS invalides. Utilisez une clé d’accès API IAM.",
          );
        if (!sesRegions.has(values.AWS_REGION))
          return send(
            400,
            "Région SES non prise en charge. Utilisez une région SES vérifiée dans l’Union européenne.",
          );
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(values.SES_CONFIGURATION_SET))
          return send(400, "Nom du jeu de configuration SES invalide.");
        if (values.SES_SNS_TOPIC_ARN) {
          const topic =
            /^arn:aws:sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9_-]{1,256}$/.exec(
              values.SES_SNS_TOPIC_ARN,
            );
          if (!topic || topic[1] !== values.AWS_REGION)
            return send(
              400,
              "Le sujet SNS doit être un sujet standard dans la même région SES.",
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
            "Une clé temporaire ASIA exige son jeton AWS ; une clé permanente AKIA doit être utilisée sans jeton.",
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
          settings.success ?? "Configuration enregistrée dans Cloudflare.",
          true,
        ),
        "text/html; charset=utf-8",
      );
      setTimeout(() => server.close(), 1000).unref();
    } catch {
      send(
        503,
        html(
          `La transmission n’a pas abouti. Vérifiez la connexion ${destination} et l’état distant avant une nouvelle saisie ; les valeurs n’ont pas été conservées.`,
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
  console.log(`Saisie privée disponible pendant 30 minutes : ${setup.url}`);
}
