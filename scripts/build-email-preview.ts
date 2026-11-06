import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { cleanEmailHtml } from "../packages/contracts/src/content";
import {
  documentEmailDefaults,
  accountEmailInstructions,
  protectedEmailInstructions,
  renderMessageEmail,
  renderTransactionalEmail,
  transactionalEmailText,
} from "../packages/contracts/src/email-template";
import { deliveryText } from "../packages/contracts/src/delivery-messages";
import { supportedLocales } from "../packages/contracts/src/locale";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "reports/email-preview");
const workspaceName = "Demo workspace";
const documentTitle = "Example document.pdf";
const destination = "https://example.invalid/synthetic-document";
const encode = (value: string) =>
  Buffer.from(value)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");

/** Offline fixtures only: no identity, provider, remote resource or send call. */
export async function buildEmailPreview() {
  await mkdir(output, { recursive: true });
  const previews: { name: string; htmlBytes: number }[] = [];
  for (const locale of supportedLocales) {
    for (const mode of [
      "my_documents",
      "protected_link",
      "attachment",
      "message",
    ] as const) {
      const defaults = documentEmailDefaults(
        workspaceName,
        mode === "message" ? "attachment" : mode,
        locale,
      );
      if (mode === "message") {
        defaults.subject = "Offline message preview";
        defaults.text =
          "Hello,\n\nThis is a synthetic local preview of a message prepared with Guteneo.\n\nDemo workspace";
      }
      const input = {
        text: defaults.text,
        workspaceName,
        locale,
        documentTitle,
        preferencesUrl: "https://example.invalid/synthetic-preferences",
        ...(mode === "my_documents"
          ? { accountDocument: { url: destination, retentionDays: 30 } }
          : mode === "protected_link"
            ? {
                protectedDocument: {
                  url: destination,
                  expiresAt: "2026-12-06T12:00:00.000Z",
                },
              }
            : {}),
      };
      const body = cleanEmailHtml(
        mode === "message"
          ? renderMessageEmail({ ...input, subject: defaults.subject })
          : renderTransactionalEmail(input),
      ).html;
      const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(defaults.subject)}</title><body style="margin:0;background:#f6f5ef">${body}</body></html>`;
      let text =
        mode === "message" ? defaults.text : transactionalEmailText(input);
      if (mode === "my_documents")
        text += `\n\n${deliveryText("Open in My documents", locale)}: ${destination}\n${accountEmailInstructions(30, locale)}`;
      if (mode === "protected_link")
        text += `\n\n${deliveryText("View the protected document", locale)}: ${destination}\n${protectedEmailInstructions("2026-12-06T12:00:00.000Z", locale)}`;
      if (mode !== "message")
        text += `\n\n${deliveryText("Discover guteneo", locale)}: https://guteneo.com/?lang=${locale}\n${deliveryText("Unsubscribe or report this email", locale)}: ${input.preferencesUrl}`;
      const name = `${mode}-${locale}`;
      const boundary = `guteneo-offline-${name}`;
      const eml = [
        "From: guteneo <no-reply@example.test>",
        "To: Email preview <preview@example.test>",
        `Subject: =?UTF-8?B?${Buffer.from(defaults.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "X-Guteneo-Preview: synthetic-offline-never-send",
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encode(text),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encode(html),
        `--${boundary}--`,
        "",
      ].join("\r\n");
      await Promise.all([
        writeFile(join(output, `${name}.html`), html),
        writeFile(join(output, `${name}.eml`), eml),
      ]);
      previews.push({ name, htmlBytes: Buffer.byteLength(html) });
    }
  }
  const index = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guteneo email previews</title><style>body{margin:40px auto;padding:0 24px;max-width:900px;background:#f6f5ef;color:#181b22;font:16px/1.6 Arial,sans-serif}h1{font:40px Georgia,serif}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #deddd7}a{color:#2450db}</style><h1>Guteneo email previews</h1><p>Synthetic local fixtures. No email sent; no provider configuration changed.</p><table><thead><tr><th>Variant</th><th>Browser</th><th>Mail file</th><th>HTML bytes</th></tr></thead><tbody>${previews.map(({ name, htmlBytes }) => `<tr><td>${name}</td><td><a href="${name}.html">Open HTML</a></td><td><a href="${name}.eml">Open EML</a></td><td>${htmlBytes}</td></tr>`).join("")}</tbody></table></html>`;
  const manifest = { localOnly: true, sendsPerformed: 0, previews };
  await Promise.all([
    writeFile(join(output, "index.html"), index),
    writeFile(
      join(output, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    ),
  ]);
  return { output, ...manifest };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2) throw new Error("No arguments are accepted.");
  console.log(JSON.stringify(await buildEmailPreview(), null, 2));
}
