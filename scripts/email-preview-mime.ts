type PreviewPart = { headers: string[]; body: string };
type PreviewAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
  contentId?: string;
};
const base64 = (value: Uint8Array | string) =>
  Buffer.from(value)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
function encodedSubject(value: string) {
  const chunks: string[] = [];
  let current = "";
  for (const character of value) {
    if (Buffer.byteLength(current + character) > 42) {
      chunks.push(current);
      current = "";
    }
    current += character;
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`)
    .join("\r\n ");
}
const serialize = ({ headers, body }: PreviewPart) =>
  [...headers, "", body].join("\r\n");
function multipart(
  type: string,
  boundary: string,
  parts: PreviewPart[],
): PreviewPart {
  return {
    headers: [`Content-Type: multipart/${type}; boundary="${boundary}"`],
    body:
      parts.map((part) => `--${boundary}\r\n${serialize(part)}\r\n`).join("") +
      `--${boundary}--\r\n`,
  };
}
const textPart = (type: string, value: string): PreviewPart => ({
  headers: [
    `Content-Type: text/${type}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
  ],
  body: base64(value),
});
function attachmentPart(attachment: PreviewAttachment): PreviewPart {
  return {
    headers: [
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: ${attachment.contentId ? "inline" : "attachment"}; filename="${attachment.filename}"`,
      ...(attachment.contentId
        ? [`Content-ID: <${attachment.contentId}>`]
        : []),
    ],
    body: base64(attachment.content),
  };
}

/** A local .eml artifact, never a provider request or a send operation. */
export function renderPreviewEml(input: {
  name: string;
  subject: string;
  text: string;
  html: string;
  image?: PreviewAttachment;
  attachment?: PreviewAttachment;
}): string {
  let content = multipart("alternative", `${input.name}-alternatives`, [
    textPart("plain", input.text),
    textPart("html", input.html),
  ]);
  if (input.image)
    content = multipart("related", `${input.name}-related`, [
      content,
      attachmentPart(input.image),
    ]);
  if (input.attachment)
    content = multipart("mixed", `${input.name}-attachments`, [
      content,
      attachmentPart(input.attachment),
    ]);
  return [
    "From: guteneo <preview@example.test>",
    "To: Email preview <recipient@example.test>",
    `Subject: ${encodedSubject(input.subject)}`,
    "MIME-Version: 1.0",
    "X-Guteneo-Preview: synthetic-offline-never-send",
    ...content.headers,
    "",
    content.body,
  ].join("\r\n");
}
