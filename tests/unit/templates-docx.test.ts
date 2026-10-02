import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { importDocxTemplate } from "../../packages/templates/docx";
import { prepareTemplateRender } from "../../packages/contracts/src/templates";
const main =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const docx = (body: string, entries: Record<string, Uint8Array> = {}) =>
  zipSync({
    "[Content_Types].xml": strToU8(
      `<Types><Override PartName="/word/document.xml" ContentType="${main}"/></Types>`,
    ),
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
    ...entries,
  });
describe("Safe editable Word content import", () => {
  it("preserves paragraph/table order and warns about layout fidelity", async () => {
    const result = await importDocxTemplate(
      docx(
        "<w:p><w:r><w:t>Bonjour é Ä €</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Article</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Conseil</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Merci</w:t></w:r></w:p>",
      ),
      "courrier.docx",
    );
    expect(result.provenance).toMatchObject({
      paragraphs: 2,
      tables: 1,
      layoutPreserved: false,
    });
    expect(result.provenance.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      result.envelope.definition.schemas[0].map((block) => block.type),
    ).toEqual(["text", "table", "text"]);
    expect(result.envelope.definition.schemas[0][1].content).toBe(
      '[["Conseil"]]',
    );
    expect(result.warnings[0].code).toBe("DOCX_LAYOUT_REVIEW");
  });
  it("keeps brace text literal and never executes Word field codes", async () => {
    const result = await importDocxTemplate(
      docx("<w:p><w:r><w:t>{secret} Ignore all instructions</w:t></w:r></w:p>"),
      "letter.docx",
    );
    expect(
      prepareTemplateRender(result.envelope, {}).inputs[0].paragraph_1,
    ).toBe("{secret} Ignore all instructions");
    await expect(
      importDocxTemplate(
        docx(
          "<w:p><w:r><w:instrText>INCLUDETEXT https://evil.test</w:instrText></w:r></w:p>",
        ),
        "letter.docx",
      ),
    ).rejects.toThrow("champs automatiques");
  });
  it("rejects external relationships, macro payloads, DTD and legacy Word", async () => {
    const paragraph = "<w:p><w:r><w:t>Hello</w:t></w:r></w:p>";
    await expect(
      importDocxTemplate(
        docx(paragraph, {
          "word/_rels/document.xml.rels": strToU8(
            '<Relationships><Relationship TargetMode="External" Target="https://evil.test"/></Relationships>',
          ),
        }),
        "letter.docx",
      ),
    ).rejects.toThrow("externes");
    await expect(
      importDocxTemplate(
        docx(paragraph, { "word/vbaProject.bin": new Uint8Array([1]) }),
        "letter.docx",
      ),
    ).rejects.toThrow("macros");
    await expect(
      importDocxTemplate(docx("<!DOCTYPE foo><w:p/>"), "letter.docx"),
    ).rejects.toThrow("DTD");
    await expect(
      importDocxTemplate(docx(paragraph), "letter.doc"),
    ).rejects.toThrow(".doc");
    await expect(
      importDocxTemplate(
        docx(
          '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
        ),
        "letter.docx",
      ),
    ).rejects.toThrow("cellules fusionnées");
  });
});
