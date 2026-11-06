import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { cleanEmailHtml } from "../packages/contracts/src/content";
import {
  documentEmailDefaults,
  accountEmailInstructions,
  protectedEmailInstructions,
  renderMessageEmail,
  renderTransactionalEmail,
  transactionalEmailText,
} from "../packages/contracts/src/email-template";
import { escapeEmailText as escape } from "../packages/contracts/src/email-presentation";
import { deliveryText } from "../packages/contracts/src/delivery-messages";
import { supportedLocales } from "../packages/contracts/src/locale";
import {
  EMAIL_BRAND_ASSET_URL,
  EMAIL_BRAND_CID,
  EMAIL_BRAND_CID_URL,
  EMAIL_BRAND_FILENAME,
  EMAIL_BRAND_IMAGE_SHA256,
  hasEmailBrandImage,
  resolveEmailBrandImage,
} from "../packages/contracts/src/email-branding";
import { EMAIL_BRAND_IMAGE_BASE64 } from "../packages/contracts/src/email-branding-image";
// @ts-expect-error The JavaScript authoring module has dedicated Node contracts.
import * as accountEmail from "./auth0-email-templates.mjs";
import { EMAIL_PREVIEW_FIXTURES } from "./email-preview-fixtures";
import {
  renderEmailPreviewGallery,
  type EmailPreviewEntry,
} from "./email-preview-gallery";
import { renderPreviewEml } from "./email-preview-mime";

const root = fileURLToPath(new URL("../", import.meta.url));
const { EMAIL_COPY, TEMPLATE_NAMES, renderEmail } = accountEmail;
const defaultOutput = join(root, "reports/email-preview");
const destination = "https://example.invalid/synthetic-document";
const brandImage = Buffer.from(EMAIL_BRAND_IMAGE_BASE64, "base64");
const expiry = "2026-12-06T12:00:00.000Z";
const labels = {
  my_documents: "A document in My documents",
  protected_link: "A protected document",
  attachment: "An attached document",
  message: "A personal message",
  verify_email: "Confirm an email address",
  reset_email: "Reset a password",
  welcome_email: "Welcome to guteneo",
  blocked_account: "Review a blocked sign-in",
};

async function examplePdf(title: string, locale: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject("Fictional email preview attachment. Never send.");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  for (const [index, line] of [
    "FICTIONAL EXAMPLE - NEVER SEND",
    `Project summary | ${locale.toUpperCase()} | November 2026`,
    "This local attachment contains no customer or personal data.",
    "Reference: DEMO-2026-11",
  ].entries())
    page.drawText(line, { x: 48, y: 760 - index * 36, size: 12, font });
  return new Uint8Array(await pdf.save());
}

/** Offline fixtures only. No identity, provider or remote resource is accessed. */
export async function buildEmailPreview(
  options: { outputDirectory?: string } = {},
) {
  const output = options.outputDirectory ?? defaultOutput;
  await mkdir(output, { recursive: true });
  await writeFile(join(output, EMAIL_BRAND_FILENAME), brandImage);
  const previews: EmailPreviewEntry[] = [];
  async function save(
    entry: Omit<EmailPreviewEntry, "htmlBytes">,
    text: string,
    originalHtml: string,
    attachment?: { filename: string; contentType: string; content: Uint8Array },
  ) {
    const htmlForMail = originalHtml.replaceAll(
      `src="${EMAIL_BRAND_ASSET_URL}"`,
      `src="${EMAIL_BRAND_CID_URL}"`,
    );
    const body = resolveEmailBrandImage(
      htmlForMail,
      `./${EMAIL_BRAND_FILENAME}`,
    );
    const eml = renderPreviewEml({
      name: entry.name,
      subject: entry.subject,
      text,
      html: htmlForMail,
      ...(hasEmailBrandImage(htmlForMail)
        ? {
            image: {
              filename: EMAIL_BRAND_FILENAME,
              contentType: "image/png",
              content: brandImage,
              contentId: EMAIL_BRAND_CID,
            },
          }
        : {}),
      ...(attachment ? { attachment } : {}),
    });
    await Promise.all([
      writeFile(join(output, `${entry.name}.html`), body),
      writeFile(join(output, `${entry.name}.eml`), eml),
      ...(attachment
        ? [writeFile(join(output, attachment.filename), attachment.content)]
        : []),
    ]);
    previews.push({ ...entry, htmlBytes: Buffer.byteLength(body) });
  }
  for (const locale of supportedLocales) {
    const fixture = EMAIL_PREVIEW_FIXTURES[locale];
    for (const mode of [
      "my_documents",
      "protected_link",
      "attachment",
      "message",
    ] as const) {
      const defaults = documentEmailDefaults(
        fixture.workspace,
        mode === "message" ? "attachment" : mode,
        locale,
      );
      const subject =
        mode === "message" ? fixture.messageSubject : defaults.subject;
      const input = {
        text: mode === "message" ? fixture.message : fixture.documents[mode],
        workspaceName: fixture.workspace,
        locale,
        documentTitle: fixture.documentTitle,
        preferencesUrl: "https://example.invalid/synthetic-preferences",
        ...(mode === "my_documents"
          ? { accountDocument: { url: destination, retentionDays: 30 } }
          : mode === "protected_link"
            ? { protectedDocument: { url: destination, expiresAt: expiry } }
            : {}),
      };
      const body = cleanEmailHtml(
        mode === "message"
          ? renderMessageEmail({ ...input, subject })
          : renderTransactionalEmail(input),
        { allowBrandImage: true },
      ).html;
      const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background-color:#f6f5ef">${body}</body></html>`;
      let text =
        mode === "message" ? input.text : transactionalEmailText(input);
      if (mode === "my_documents")
        text += `\n\n${deliveryText("Open in My documents", locale)}: ${destination}\n${accountEmailInstructions(30, locale)}`;
      if (mode === "protected_link")
        text += `\n\n${deliveryText("View the protected document", locale)}: ${destination}\n${protectedEmailInstructions(expiry, locale)}`;
      if (mode !== "message")
        text += `\n\n${deliveryText("Discover guteneo", locale)}: https://guteneo.com/?lang=${locale}\n${deliveryText("Unsubscribe or report this email", locale)}: ${input.preferencesUrl}`;
      await save(
        {
          name: `${mode}-${locale}`,
          family: "correspondence",
          variant: mode,
          locale,
          label: labels[mode],
          subject,
          sender: fixture.workspace,
        },
        text,
        html,
        mode === "attachment"
          ? {
              filename: `example-document-${locale}.pdf`,
              contentType: "application/pdf",
              content: await examplePdf(fixture.documentTitle, locale),
            }
          : undefined,
      );
    }
    for (const variant of TEMPLATE_NAMES as Array<
      "verify_email" | "reset_email" | "welcome_email" | "blocked_account"
    >) {
      const copy = EMAIL_COPY[locale][variant];
      const url =
        variant === "welcome_email"
          ? "https://guteneo.com/auth/login"
          : "https://example.invalid/account-preview?ticket=synthetic";
      const html = renderEmail(variant, locale).replaceAll(
        "{{ url | escape }}",
        url,
      );
      const text = [
        copy.title,
        copy.intro,
        `${copy.action}: ${url}`,
        copy.note,
        `${EMAIL_COPY[locale].linkHint}\n${url}`,
        ...(variant === "welcome_email"
          ? []
          : [EMAIL_COPY[locale].privateLink]),
        EMAIL_COPY[locale].footer,
      ].join("\n\n");
      await save(
        {
          name: `account-${variant}-${locale}`,
          family: "account",
          variant,
          locale,
          label: labels[variant],
          subject: copy.subject,
          sender: "guteneo",
        },
        text,
        html,
      );
    }
  }
  const manifest = {
    localOnly: true,
    sendsPerformed: 0,
    providerConfigurationChanged: false,
    image: {
      contentId: EMAIL_BRAND_CID,
      filename: EMAIL_BRAND_FILENAME,
      sha256: EMAIL_BRAND_IMAGE_SHA256,
      bytes: brandImage.length,
    },
    previews,
  };
  await Promise.all([
    writeFile(join(output, "index.html"), renderEmailPreviewGallery(previews)),
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
