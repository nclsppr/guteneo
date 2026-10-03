export type InvitationRecipients = { emails: string[]; duplicateCount: number };
export class InvitationInputError extends Error {
  constructor(
    public reason:
      "email" | "header" | "columns" | "quotes" | "empty" | "limit",
    public line?: number,
  ) {
    super(reason);
  }
}
const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export function invitationRecipients(emails: string[]): InvitationRecipients {
  const unique = new Set<string>();
  let duplicateCount = 0;
  for (const [index, value] of emails.entries()) {
    const email = value.trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254)
      throw new InvitationInputError("email", index + 1);
    if (unique.has(email)) duplicateCount += 1;
    unique.add(email);
    if (unique.size > 100) throw new InvitationInputError("limit");
  }
  if (!unique.size) throw new InvitationInputError("empty");
  return { emails: [...unique], duplicateCount };
}
export function parseInvitationCsv(source: string): InvitationRecipients {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = firstLine.includes(";") ? ";" : ",";
  const rows: { values: string[]; line: number }[] = [];
  let values: string[] = [],
    value = "",
    quoted = false,
    closed = false,
    line = 1,
    rowLine = 1;
  function finishField() {
    values.push(value.trim());
    value = "";
    closed = false;
  }
  function finishRow() {
    finishField();
    if (values.some(Boolean)) rows.push({ values, line: rowLine });
    values = [];
    rowLine = line + 1;
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        value += char;
        if (char === "\n") line++;
      }
    } else if (char === '"') {
      if (value.trim() || closed)
        throw new InvitationInputError("quotes", line);
      value = "";
      quoted = true;
    } else if (char === separator) finishField();
    else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") index++;
      line++;
    } else {
      if (closed && char.trim()) throw new InvitationInputError("quotes", line);
      value += char;
    }
  }
  if (quoted) throw new InvitationInputError("quotes", rowLine);
  if (value || values.length) finishRow();
  const header = rows.shift();
  const columns = header?.values.map((item) => item.toLowerCase());
  if (!columns || columns.filter((item) => item === "email").length !== 1)
    throw new InvitationInputError("header");
  const emailColumn = columns.indexOf("email");
  const emails = rows.map((row) => {
    if (row.values.length !== columns.length)
      throw new InvitationInputError("columns", row.line);
    const email = row.values[emailColumn].toLowerCase();
    if (!emailPattern.test(email) || email.length > 254)
      throw new InvitationInputError("email", row.line);
    return email;
  });
  return invitationRecipients(emails);
}
