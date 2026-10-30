import { describe, expect, it } from "vitest";
import {
  assertNoDocumentUrlPlaceholder,
  cleanEmailHtml,
  cleanHtml,
} from "../../packages/contracts/src/content";
import {
  documentEmailDefaults,
  renderProtectedEmailFooter,
  renderTransactionalEmail,
  transactionalEmailText,
} from "../../packages/contracts/src/email-template";

const document = {
  url: "https://guteneo.example/share/synthetic?lang=fr",
  expiresAt: "2026-11-01T22:12:00.000Z",
};

describe("email-specific content boundary", () => {
  it("retains safe inline button/table styles while document HTML still strips every style", () => {
    const source =
      '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px"><a href="https://example.invalid" style="display:inline-block;background-color:#181b22;color:#ffffff;padding:12px 20px;border-radius:4px;font-family:Arial,Helvetica,sans-serif;text-decoration:none">Open</a></td></tr></table>';
    const result = cleanEmailHtml(source).html;
    expect(result).toContain("background-color:#181b22");
    expect(result).toContain("padding:12px 20px");
    expect(result).toContain('role="presentation"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(cleanHtml(source)).not.toContain("style=");
  });

  it("removes active markup, tracking, CSS URLs and unsupported layout tricks", () => {
    const result = cleanEmailHtml(
      '<style>@import "https://tracker.invalid";</style><script>alert(1)</script><img src="https://tracker.invalid/pixel"><svg onload="x()"></svg><a href="javascript:alert(1)" onclick="x()" style="color:#181b22;background:url(https://tracker.invalid);background-color:expression(alert(1));position:fixed;display:none;opacity:0;margin:-10px;behavior:url(x);width:calc(100%);font-family:Arial">Visible</a>',
    ).html;
    expect(result).toBe(
      '<a style="color:#181b22;font-family:Arial">Visible</a>',
    );
    expect(result).not.toMatch(
      /tracker|expression|position|opacity|javascript|onclick|url\(/,
    );
  });

  it("substitutes only an exact anchor href, retaining custom inline presentation", () => {
    const source =
      '<p>Custom message</p><a href="{{document_url}}" style="background-color:#2450db;color:#ffffff;padding:12px">Custom button</a>';
    const draft = cleanEmailHtml(source, { allowDocumentUrlPlaceholder: true });
    expect(draft.hasDocumentUrlPlaceholder).toBe(true);
    expect(draft.html).toContain('href="{{document_url}}"');
    const final = cleanEmailHtml(source, { documentUrl: document.url });
    expect(final.html).toContain(`href="${document.url}"`);
    expect(final.html).toContain("background-color:#2450db");
    expect(final.html).not.toContain("{{document_url}}");
    expect(cleanEmailHtml(final.html).html).toBe(final.html);
  });

  it.each([
    '<a href="https://external.invalid/?url={{document_url}}">Open</a>',
    '<a href="{{document_url}}/extra">Open</a>',
    '<a href="{{ document_url }}">Open</a>',
    '<a href="{{document_link}}">Open</a>',
    '<a href="{document_url}">Open</a>',
    '<a href="{{document_url}">Open</a>',
    '<a href="document_url}}">Open</a>',
    '<a style="background:url({{document_url}})">Open</a>',
    '<img src="{{document_url}}">',
    '<div href="{{document_url}}">Open</div>',
    "<p>{{document_url}}</p>",
    "<!-- {{document_url}} --><p>Content</p>",
    '<script>"{{document_url}}"</script><p>Content</p>',
    '<a href="&#123;&#123;document_url&#125;&#125;">Open</a>',
    '<a href="https://external.invalid/?url=&#123;&#123;document_url&#125;&#125;">Open</a>',
    '<a href="https://external.invalid" href="{{document_url}}">Open</a>',
    '<p>Content</p><a href="{{document_url}}"></a>',
    '<p>Content</p><a href="{{document_url}}"><script>x</script></a>',
    '<p>Content</p><a href="{{document_url}}"><img src="https://example.invalid/button.png" alt="Open"></a>',
  ])(
    "rejects misplaced or malformed document markers before replacing a URL: %s",
    (source) => {
      expect(() =>
        cleanEmailHtml(source, { documentUrl: document.url }),
      ).toThrow(
        expect.objectContaining({ code: "INVALID_DOCUMENT_URL_PLACEHOLDER" }),
      );
    },
  );

  it("requires protected-link delivery for a marker and leaves unrelated literal braces alone", () => {
    expect(() => cleanEmailHtml('<a href="{{document_url}}">Open</a>')).toThrow(
      expect.objectContaining({ code: "DOCUMENT_URL_NOT_AVAILABLE" }),
    );
    const literal = "Example {{amount}} and }} remain exact user content.";
    expect(() => assertNoDocumentUrlPlaceholder(literal)).not.toThrow();
    expect(cleanEmailHtml(`<p>${literal}</p>`).html).toBe(`<p>${literal}</p>`);
  });
});

describe("branded document email", () => {
  it.each([
    ["fr", "Document envoyé par Atelier", "Atelier vous a envoyé un document."],
    ["en", "Document from Atelier", "Atelier has sent you a document."],
    ["de", "Dokument von Atelier", "Atelier hat Ihnen ein Dokument gesendet."],
    ["lb", "Dokument vun Atelier", "Atelier huet Iech en Dokument geschéckt."],
  ] as const)(
    "uses workspace attribution in %s defaults",
    (locale, subject, text) => {
      expect(
        documentEmailDefaults("Atelier", "attachment", locale),
      ).toMatchObject({ subject, text: expect.stringContaining(text) });
      expect(
        documentEmailDefaults("Atelier", "protected_link", locale).text,
      ).not.toBe(documentEmailDefaults("Atelier", "attachment", locale).text);
    },
  );

  it("escapes supplied text and workspace labels with no external image or tracker", () => {
    const input = {
      text: "<script>literal</script>\nSecond line",
      workspaceName: '<img src="https://tracker.invalid">',
      locale: "fr" as const,
      protectedDocument: document,
    };
    const html = cleanEmailHtml(renderTransactionalEmail(input)).html;
    expect(html).toContain(
      "&lt;script&gt;literal&lt;/script&gt;<br />Second line",
    );
    expect(html).toContain("&lt;img src=");
    expect(html).not.toMatch(/<img|<script|<style|<iframe/);
    expect(html).toContain("color:#181b22;font-family:Georgia,serif");
    expect(html).toContain(">guteneo</p>");
    expect(html).toContain("Demandez le mot de passe");
    expect(html).toContain("1 novembre 2026");
    expect(html.match(/<a /g) ?? []).toHaveLength(1);
    expect(transactionalEmailText(input)).toContain(input.text);
  });

  it("does not add another link when custom HTML already supplies one", () => {
    const footer = renderProtectedEmailFooter(document, "fr", false);
    expect(footer).not.toContain("<a");
    expect(footer).not.toContain(document.url);
    expect(footer).toContain("Demandez le mot de passe");
  });

  it.each(["fr", "en", "de", "lb"] as const)(
    "keeps the quoted document title and exact message in both email alternatives for %s",
    (locale) => {
      const input = {
        text: "Exact supplied message\nSecond line",
        workspaceName: "Atelier",
        documentTitle: '<Original & "copy">.pdf',
        locale,
      };
      const quoted =
        locale === "fr"
          ? `« ${input.documentTitle} »`
          : `“${input.documentTitle}”`;
      const text = transactionalEmailText(input);
      expect(text).toBe(`guteneo · Atelier\n\n${quoted}\n\n${input.text}`);
      const html = cleanEmailHtml(renderTransactionalEmail(input)).html;
      expect(html).toContain("<blockquote");
      expect(html).toContain("&lt;Original &amp;");
      expect(html).not.toContain(input.documentTitle);
    },
  );

  it("keeps replacement metacharacters literal in authenticated workspace names", () => {
    const name = "Studio $& $` $'";
    expect(documentEmailDefaults(name, "attachment", "en")).toEqual({
      subject: `Document from ${name}`,
      text: `${name} has sent you a document. You will find it attached to this email.`,
    });
  });

  it("bounds generated subjects by UTF-16 length without splitting emoji or preserving header controls", () => {
    const result = documentEmailDefaults(
      `Workspace\r\n${"🕊️".repeat(200)}`,
      "attachment",
      "en",
    );
    expect(result.subject.length).toBeLessThanOrEqual(250);
    expect(result.subject).not.toMatch(/[\r\n]/);
    expect(result.subject).toMatch(/…$/);
    expect(() => encodeURIComponent(result.subject)).not.toThrow();
  });
});
