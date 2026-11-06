import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  EMAIL_BRAND_CID,
  EMAIL_BRAND_CID_URL,
  EMAIL_BRAND_FILENAME,
  EMAIL_BRAND_IMAGE_BYTES,
  EMAIL_BRAND_IMAGE_SHA256,
  EMAIL_BRAND_PORTRAIT_V1,
  emailBrandImageForHtml,
  emailBrandImageState,
  renderEmailBrandImage,
  resolveEmailBrandImage,
} from "../../packages/contracts/src/email-branding";
import { EMAIL_BRAND_IMAGE_BASE64 } from "../../packages/contracts/src/email-branding-image";
import { EMAIL_BRAND_IMAGE_BASE64 as PORTRAIT_V1_BASE64 } from "../../packages/contracts/src/email-branding-portrait-v1-image";
import { cleanEmailHtml } from "../../packages/contracts/src/content";
import { ResendEmailProvider } from "../../packages/providers/resend";
import {
  SesEmailProvider,
  type EmailSubmission,
} from "../../packages/providers/ses";
import type { Fetcher } from "../../packages/providers/types";
import {
  emailPreviewDocument,
  illustratedEmailPreview,
} from "../../apps/web/src/email-preview-document";

const config = {
  apiKey: "re_synthetic_inline_fixture",
  verifiedDomain: "example.invalid",
  authorizedSenders: ["sender@example.invalid"],
  sandbox: false,
};
const input: EmailSubmission = {
  dispatchId: "dsp_inline_fixture",
  from: config.authorizedSenders[0],
  to: "recipient@example.invalid",
  subject: "Exact approved fixture",
  text: "Exact approved fixture.",
  html: "<p>Exact approved fixture.</p>",
  purpose: "transactional",
};
const accepted = () =>
  Response.json({ id: "56761188-7520-42d8-8898-ff6fc54ce618" });
const branded = () =>
  cleanEmailHtml(renderEmailBrandImage() + input.html, {
    allowBrandImage: true,
  }).html;
// Historical frozen HTML is a literal fixture, independent of today's renderer.
const portraitV1 =
  '<img src="cid:guteneo-portrait.b8587959f2e236c39663508b01ef2eb29d9669a0c8f6ac298351358a8668c07b@guteneo.com" alt="" width="60" height="60" style="display:block;width:60px;border:0">';

describe("fixed immutable inline email artwork", () => {
  it("binds the CID and compiled transport bytes to the same exact approved public PNG", async () => {
    const bytes = Buffer.from(EMAIL_BRAND_IMAGE_BASE64, "base64");
    expect(bytes).toEqual(
      await readFile(
        new URL(
          `../../apps/web/public/brand/${EMAIL_BRAND_FILENAME}`,
          import.meta.url,
        ),
      ),
    );
    expect(bytes.length).toBe(EMAIL_BRAND_IMAGE_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      EMAIL_BRAND_IMAGE_SHA256,
    );
    expect(EMAIL_BRAND_CID).toBe(
      `guteneo-postmark.${EMAIL_BRAND_IMAGE_SHA256}@guteneo.com`,
    );
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      384, 210,
    ]);
    const proof = JSON.parse(
      await readFile(
        new URL(
          "../../assets/brand/source/guteneo-email-postmark-proof.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      createHash("sha256")
        .update(
          await readFile(new URL(`../../${proof.source}`, import.meta.url)),
        )
        .digest("hex"),
    ).toBe(proof.sourceSha256);
    expect(renderEmailBrandImage()).toContain('width="128" height="70"');
  });

  it("keeps historical artwork bytes and canonical markup immutable without accepting it as new input", async () => {
    const bytes = Buffer.from(PORTRAIT_V1_BASE64, "base64");
    expect(bytes).toEqual(
      await readFile(
        new URL(
          "../../apps/web/public/brand/guteneo-email-portrait-b8587959f2e236c3.png",
          import.meta.url,
        ),
      ),
    );
    expect(bytes.length).toBe(17264);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "b8587959f2e236c39663508b01ef2eb29d9669a0c8f6ac298351358a8668c07b",
    );
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      144, 144,
    ]);
    expect(renderEmailBrandImage(EMAIL_BRAND_PORTRAIT_V1)).toBe(portraitV1);
    expect(emailBrandImageForHtml(portraitV1)).toBe(EMAIL_BRAND_PORTRAIT_V1);
    expect(cleanEmailHtml(portraitV1).html).toBe("");
    expect(cleanEmailHtml(portraitV1, { allowBrandImage: true }).html).toBe("");
  });

  it("retains only the server-approved CID when trusted and never permits images in customer HTML", () => {
    expect(cleanEmailHtml(renderEmailBrandImage()).html).toBe("");
    const trusted = cleanEmailHtml(
      `<img src="${EMAIL_BRAND_CID_URL}" alt="private content" width="999" onerror="alert(1)" srcset="https://example.invalid/private" style="background-image:url(https://example.invalid/private)">`,
      { allowBrandImage: true },
    ).html;
    expect(trusted).toBe(
      cleanEmailHtml(renderEmailBrandImage(), { allowBrandImage: true }).html,
    );
    expect(trusted).not.toMatch(/private|onerror|srcset|https?:|data:/);
    expect(emailBrandImageState(trusted)).toBe("fixed");
    expect(cleanEmailHtml(trusted).html).toBe("");
  });

  it.each([
    "https://example.invalid/track?private=1",
    "data:image/png;base64,cHJpdmF0ZQ==",
    "cid:customer-supplied",
    EMAIL_BRAND_CID_URL.replace(EMAIL_BRAND_IMAGE_SHA256, "0".repeat(64)),
    `${EMAIL_BRAND_CID_URL}?private=1`,
  ])(
    "discards every unsupported image source even in trusted presentation: %s",
    (source) => {
      expect(
        cleanEmailHtml(`<img src="${source}">`, { allowBrandImage: true }).html,
      ).toBe("");
    },
  );

  it("adds one digest-bound inline part beside the exact approved PDF without changing frozen bodies", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(accepted());
    const pdf = new TextEncoder().encode("immutable approved PDF fixture");
    const html = branded();
    const request = {
      ...input,
      html,
      attachments: [
        {
          filename: "exact.pdf",
          contentType: "application/pdf" as const,
          bytes: pdf,
        },
      ],
    };
    expect(
      await new ResendEmailProvider(config, fetcher).submit(request),
    ).toMatchObject({ status: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.html).toBe(html);
    expect(body.text).toBe(input.text);
    expect(body.attachments).toHaveLength(2);
    expect(Buffer.from(body.attachments[0].content, "base64")).toEqual(
      Buffer.from(pdf),
    );
    expect(body.attachments[0]).not.toHaveProperty("content_id");
    expect(body.attachments[1]).toEqual({
      filename: EMAIL_BRAND_FILENAME,
      content_type: "image/png",
      content: EMAIL_BRAND_IMAGE_BASE64,
      content_id: EMAIL_BRAND_CID,
    });
    expect(request.html).toBe(html);
  });

  it("does not retrofit artwork into an older frozen message and does not change customer attachment caps", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(accepted());
    const provider = new ResendEmailProvider(config, fetcher);
    await provider.submit(input);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.html).toBe(input.html);
    expect(body).not.toHaveProperty("attachments");
    const attachments = Array.from({ length: 6 }, (_, index) => ({
      filename: `${index}.pdf`,
      contentType: "application/pdf" as const,
      bytes: new Uint8Array([index]),
    }));
    expect(
      provider.validate({ ...input, html: branded(), attachments }),
    ).toContain("email_attachment_limits");
    expect(
      provider.validate({
        ...input,
        html: branded(),
        attachments: attachments.slice(0, 5),
      }),
    ).toEqual([]);
  });

  it("transports a prior approved portrait with its original MIME bytes, CID and filename and unchanged frozen bodies", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(accepted());
    const html = `<p>Historical approved message</p>${portraitV1}`;
    const text = "Historical approved message";
    expect(
      await new ResendEmailProvider(config, fetcher).submit({
        ...input,
        html,
        text,
      }),
    ).toMatchObject({ status: "accepted" });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.html).toBe(html);
    expect(body.text).toBe(text);
    expect(body.attachments).toEqual([
      {
        filename: "guteneo-email-portrait-b8587959f2e236c3.png",
        content_type: "image/png",
        content: PORTRAIT_V1_BASE64,
        content_id:
          "guteneo-portrait.b8587959f2e236c39663508b01ef2eb29d9669a0c8f6ac298351358a8668c07b@guteneo.com",
      },
    ]);
  });

  it.each([
    `<img src="cid:arbitrary">`,
    `${renderEmailBrandImage()}${renderEmailBrandImage()}`,
    renderEmailBrandImage().replace("src=", "data-src="),
    renderEmailBrandImage().replace('alt=""', 'alt="private"'),
    renderEmailBrandImage().replace(
      EMAIL_BRAND_CID_URL,
      `${EMAIL_BRAND_CID_URL}?secret=value`,
    ),
    portraitV1.replace('width="60"', 'width="128"'),
    portraitV1.replace("b8587959", "00000000"),
    `${portraitV1}${renderEmailBrandImage()}`,
  ])(
    "rejects unsupported or modified CID markup without a provider or image request",
    async (html) => {
      const fetcher = vi.fn<Fetcher>();
      expect(
        await new ResendEmailProvider(config, fetcher).submit({
          ...input,
          html,
        }),
      ).toMatchObject({
        status: "rejected",
        errorCode: "email_brand_image_invalid",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("fails closed for unquoted SES MIME image bytes", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new SesEmailProvider(
      {
        accessKeyId: "TESTACCESSKEY",
        secretAccessKey: "synthetic-no-real-credential",
        region: "eu-west-1",
        configurationSet: "fixture",
        authorizedSenders: [input.from],
        sandbox: true,
      },
      fetcher,
    );
    expect(await provider.submit({ ...input, html: branded() })).toEqual({
      status: "rejected",
      errorCode: "email_inline_branding_not_qualified",
      retryable: false,
    });
    expect(await provider.submit({ ...input, html: portraitV1 })).toMatchObject(
      {
        status: "rejected",
        errorCode: "email_inline_branding_not_qualified",
      },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reconstructs only canonical fixed markup in trusted previews, never a supplied URL or alternate CID", async () => {
    const local = resolveEmailBrandImage(
      branded(),
      "data:image/png;base64,Zml4ZWQ=",
    );
    expect(local).toContain('src="data:image/png;base64,Zml4ZWQ="');
    const unknown = '<img src="https://example.invalid/private?token=1">';
    expect(resolveEmailBrandImage(unknown)).toBe(unknown);
    const document = await illustratedEmailPreview(branded());
    expect(document).toContain(
      `data:image/png;base64,${EMAIL_BRAND_IMAGE_BASE64}`,
    );
    expect(document).toContain("img-src data:");
    expect(document).not.toContain(EMAIL_BRAND_CID_URL);
    expect(emailPreviewDocument(unknown)).toContain("img-src 'none'");
  });

  it("previews historical and current artwork through separate cached fixed data payloads", async () => {
    // Current was loaded above; a historical preview must never reuse its bytes.
    const previous = await illustratedEmailPreview(portraitV1);
    expect(previous).toContain(`data:image/png;base64,${PORTRAIT_V1_BASE64}`);
    expect(previous).not.toContain(EMAIL_BRAND_IMAGE_BASE64);
    expect(previous).toContain('width="60" height="60"');
    expect(resolveEmailBrandImage(portraitV1)).toContain(
      'src="https://guteneo.com/brand/guteneo-email-portrait-b8587959f2e236c3.png"',
    );
    const current = await illustratedEmailPreview(branded());
    expect(current).toContain(
      `data:image/png;base64,${EMAIL_BRAND_IMAGE_BASE64}`,
    );
    expect(current).not.toContain(PORTRAIT_V1_BASE64);
    expect(current).toContain('width="128" height="70"');
  });
});
