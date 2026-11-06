import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildEmailPreview } from "../../scripts/build-email-preview";
import { EMAIL_PREVIEW_FIXTURES } from "../../scripts/email-preview-fixtures";
import {
  EMAIL_BRAND_CID,
  EMAIL_BRAND_CID_URL,
  EMAIL_BRAND_FILENAME,
  EMAIL_BRAND_IMAGE_SHA256,
  hasEmailBrandImage,
} from "../../packages/contracts/src/email-branding";
import { supportedLocales } from "../../packages/contracts/src/locale";

let output: string;
let result: Awaited<ReturnType<typeof buildEmailPreview>>;
const fetcher = vi.fn(() => {
  throw new Error("Offline mail previews must not fetch remote resources.");
});
beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), "guteneo-mail-preview-"));
  vi.stubGlobal("fetch", fetcher);
  try {
    result = await buildEmailPreview({ outputDirectory: output });
  } finally {
    vi.unstubAllGlobals();
  }
});
afterAll(async () => {
  if (output) await rm(output, { recursive: true, force: true });
});

function mimeText(eml: string, kind: "plain" | "html") {
  const match = eml.match(
    new RegExp(
      `Content-Type: text/${kind}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`,
    ),
  );
  if (!match) throw new Error(`Missing ${kind} MIME alternative`);
  return Buffer.from(match[1], "base64").toString("utf8");
}

describe("Offline branded mail gallery", () => {
  it("creates complete localized fictional examples without identity, provider or network activity", async () => {
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      localOnly: true,
      sendsPerformed: 0,
      providerConfigurationChanged: false,
    });
    expect(result.previews).toHaveLength(32);
    for (const locale of supportedLocales) {
      const entries = result.previews.filter(
        (entry) => entry.locale === locale,
      );
      expect(
        entries.filter((entry) => entry.family === "correspondence"),
      ).toHaveLength(4);
      expect(
        entries.filter((entry) => entry.family === "account"),
      ).toHaveLength(4);
      const html = await readFile(
        join(output, `message-${locale}.html`),
        "utf8",
      );
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(EMAIL_PREVIEW_FIXTURES[locale].messageSubject);
      expect(html).not.toMatch(/src=["']https?:|src=["']cid:|<script|<iframe/);
    }
  });

  it("keeps exact artwork bytes local in browsers and embeds the immutable CID in native Mail artifacts", async () => {
    const image = await readFile(join(output, EMAIL_BRAND_FILENAME));
    expect(createHash("sha256").update(image).digest("hex")).toBe(
      EMAIL_BRAND_IMAGE_SHA256,
    );
    for (const entry of result.previews) {
      const html = await readFile(join(output, `${entry.name}.html`), "utf8");
      const eml = await readFile(join(output, `${entry.name}.eml`), "utf8");
      const mimeHtml = mimeText(eml, "html");
      expect(html).toContain(`src="./${EMAIL_BRAND_FILENAME}"`);
      expect(eml).toContain("Content-Type: multipart/related;");
      expect(eml).toContain(`Content-ID: <${EMAIL_BRAND_CID}>`);
      expect(hasEmailBrandImage(mimeHtml)).toBe(true);
      expect(mimeHtml).toContain(EMAIL_BRAND_CID_URL);
      expect(mimeHtml).not.toMatch(/src=["']https?:|<script|<iframe/);
      expect(eml).toContain("X-Guteneo-Preview: synthetic-offline-never-send");
      expect(eml).toContain("To: Email preview <recipient@example.test>");
    }
  });

  it("supplies the promised synthetic PDF and matching readable alternatives", async () => {
    for (const locale of supportedLocales) {
      const pdf = await PDFDocument.load(
        await readFile(join(output, `example-document-${locale}.pdf`)),
      );
      expect(pdf.getTitle()).toBe(EMAIL_PREVIEW_FIXTURES[locale].documentTitle);
      expect(pdf.getSubject()).toContain("Fictional email preview");
      const attachment = await readFile(
        join(output, `attachment-${locale}.eml`),
        "utf8",
      );
      expect(attachment).toContain("Content-Type: multipart/mixed;");
      expect(attachment).toContain(
        `Content-Disposition: attachment; filename="example-document-${locale}.pdf"`,
      );
      const message = await readFile(
        join(output, `message-${locale}.eml`),
        "utf8",
      );
      expect(mimeText(message, "plain")).toBe(
        EMAIL_PREVIEW_FIXTURES[locale].message,
      );
      const welcome = await readFile(
        join(output, `account-welcome_email-${locale}.eml`),
        "utf8",
      );
      expect(mimeText(welcome, "plain")).toContain(
        "https://guteneo.com/auth/login",
      );
      expect(mimeText(welcome, "html")).toContain(
        'href="https://guteneo.com/auth/login"',
      );
    }
  });
});
