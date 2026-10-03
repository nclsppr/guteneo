import { describe, expect, it } from "vitest";
import {
  invitationRecipients,
  parseInvitationCsv,
} from "../../apps/web/src/invitation-csv";

describe("invitation recipient review", () => {
  it("normalizes and deduplicates before review", () => {
    expect(
      invitationRecipients([
        " Alex@Example.com ",
        "alex@example.com",
        "sam@example.com",
      ]),
    ).toEqual({
      emails: ["alex@example.com", "sam@example.com"],
      duplicateCount: 1,
    });
  });
  it("reads BOM, CRLF, quoted fields, reordered columns and semicolon exports", () => {
    expect(
      parseInvitationCsv(
        '\uFEFFname;email\r\n"Sam; Exemple";"SAM@example.com"\r\nAlex;alex@example.com\r\n',
      ),
    ).toEqual({
      emails: ["sam@example.com", "alex@example.com"],
      duplicateCount: 0,
    });
    expect(
      parseInvitationCsv('email,name\n"sam@example.com","Exemple, Sam"\n'),
    ).toEqual({ emails: ["sam@example.com"], duplicateCount: 0 });
  });
  it("rejects missing headers, malformed columns, broken quotes and invalid addresses", () => {
    for (const source of [
      "address\nsam@example.com",
      "email,email\nsam@example.com,sam@example.com",
      "email,name\nsam@example.com",
      'email\n"sam@example.com',
      "email\nsam@example.com;bad@example.com",
      "email\nnot-an-address",
    ])
      expect(() => parseInvitationCsv(source)).toThrow();
  });
  it("rejects empty batches and more than 100 unique recipients", () => {
    expect(() => parseInvitationCsv("email\n")).toThrow("empty");
    expect(() =>
      invitationRecipients(
        Array.from({ length: 101 }, (_, i) => `member${i}@example.com`),
      ),
    ).toThrow("limit");
    expect(
      invitationRecipients(Array(120).fill("sam@example.com")).emails,
    ).toHaveLength(1);
  });
});
