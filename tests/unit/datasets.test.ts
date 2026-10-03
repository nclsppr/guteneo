import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
import {
  MappingPlanSchema,
  XmlRecordPathSchema,
  type MappingPlan,
} from "../../packages/contracts/src/datasets";
import {
  datasetStructureSignature,
  normalizeCell,
  profileDataset,
  unzipBounded,
  validateMapping,
} from "../../packages/data";
import { customerSheets, encode, makeWorkbook } from "./datasets-fixtures";

const csvMapping: MappingPlan = {
  version: 1,
  name: "Clients",
  sourceSheet: "Données",
  headerRow: 1,
  recordKey: ["id"],
  fields: [
    { source: "name", target: "customer.name", type: "text", required: true },
    {
      source: "postal",
      target: "customer.postalCode",
      type: "text",
      required: true,
    },
  ],
  joins: [],
  excludeRows: [],
  includeHidden: false,
  formulaPolicy: "reject",
  expectedHeaders: ["id", "name", "postal"],
};
const joinMapping: MappingPlan = {
  version: 1,
  name: "Clients et articles",
  sourceSheet: "Clients",
  headerRow: 2,
  recordKey: ["ID"],
  fields: [
    { source: "Nom", target: "customer.name", type: "text", required: true },
    {
      source: "Code postal",
      target: "customer.postalCode",
      type: "text",
      required: true,
    },
    {
      source: "Date",
      target: "date",
      type: "date",
      required: true,
      dateOrder: "DMY",
    },
  ],
  joins: [
    {
      sheet: "Articles",
      headerRow: 2,
      parentKey: "ID",
      childKey: "Client",
      target: "items",
      cardinality: "one-to-many",
      fields: [
        { source: "Description", target: "description", type: "text" },
        {
          source: "Quantité",
          target: "quantity",
          type: "integer",
          required: true,
        },
        {
          source: "Prix",
          target: "unitPriceMinor",
          type: "minor",
          decimalSeparator: ",",
          scale: 2,
          required: true,
        },
      ],
      expectedHeaders: ["Client", "Description", "Quantité", "Prix"],
    },
  ],
  excludeRows: [],
  includeHidden: false,
  formulaPolicy: "reject",
  expectedHeaders: ["ID", "Nom", "Code postal", "Date", "Email"],
};

describe("bounded data import and normalization", () => {
  it("reuses a mapping with reordered columns, retaining zeros and source coordinates", async () => {
    const first = await profileDataset(
      encode("id;name;postal\n001;Élodie;00120"),
      "csv",
    );
    const second = await profileDataset(
      encode("postal,name,id\n00120,Élodie,001"),
      "csv",
    );
    const a = validateMapping(first, csvMapping),
      b = validateMapping(second, csvMapping);
    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    expect(a.records[0].data).toEqual(b.records[0].data);
    expect(b.records[0].data).toEqual({
      customer: { name: "Élodie", postalCode: "00120" },
    });
    expect(b.records[0].provenance["customer.postalCode"][0].address).toBe(
      "A2",
    );
    expect(datasetStructureSignature(first, csvMapping)).toBe(
      datasetStructureSignature(second, csvMapping),
    );
  });
  it("flags structure drift rather than guessing renamed columns", async () => {
    const profile = await profileDataset(
      encode("id,name,postcode\n001,Demo,00120"),
      "csv",
    );
    const result = validateMapping(profile, csvMapping);
    expect(result.status).toBe("needs_review");
    expect(result.issues.map((x) => x.code)).toContain("STRUCTURE_CHANGED");
  });
  it("retains UTF-8 and allows explicit Windows-1252, but does not silently guess it", async () => {
    const bytes = new Uint8Array([
      110, 111, 109, 10, 201, 108, 111, 100, 105, 101,
    ]);
    await expect(profileDataset(bytes, "csv")).rejects.toMatchObject({
      code: "DATASET_ENCODING",
    });
    const profile = await profileDataset(bytes, "csv", {
      encoding: "windows-1252",
    });
    expect(profile.sheets[0].rows[1].cells[0].raw).toBe("Élodie");
  });
  it("qualifies real XLSX parsing with title rows, multiple sheets, grouping and measured anomalies", async () => {
    const profile = await profileDataset(makeWorkbook(customerSheets), "xlsx");
    expect(profile.sheets.map((sheet) => sheet.name)).toEqual([
      "Clients",
      "Articles",
    ]);
    expect(profile.issues.map((x) => x.code)).toEqual(
      expect.arrayContaining(["AMBIGUOUS_DATE", "MERGED_CELLS"]),
    );
    const result = validateMapping(profile, joinMapping);
    expect(result.status).toBe("ready");
    expect(result.documentCount).toBe(2);
    expect(result.records[0].data).toEqual({
      customer: { name: "Élodie Müller", postalCode: "00120" },
      date: "2026-04-03",
      items: [
        { description: "Conseil", quantity: 2, unitPriceMinor: 1250 },
        { description: "Livraison", quantity: 1, unitPriceMinor: 400 },
      ],
    });
    expect(result.records[1].data.items).toEqual([
      { description: "Service", quantity: 3, unitPriceMinor: 1000 },
    ]);
    expect(result.records[0].provenance["items[1].description"]).toEqual([
      { sheet: "Articles", row: 4, column: 2, address: "B4" },
    ]);
  });
  it("does not invent ambiguous dates, decimal conventions or required values", async () => {
    const profile = await profileDataset(makeWorkbook(customerSheets), "xlsx");
    const mapping = structuredClone(joinMapping);
    delete mapping.fields[2].dateOrder;
    delete mapping.joins[0].fields[2].decimalSeparator;
    const result = validateMapping(profile, mapping);
    expect(result.status).toBe("needs_review");
    expect(result.issues.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "DATE_ORDER_REQUIRED",
        "DECIMAL_CONVENTION_REQUIRED",
      ]),
    );
    expect(() =>
      normalizeCell(
        undefined,
        { source: "x", target: "x", type: "text", required: true },
        "reject",
      ),
    ).toThrow("Valeur obligatoire");
  });
  it("groups 200 child rows into one document and detects conflicting parent values", async () => {
    const csv =
      "id,name,postal,item,quantity\n" +
      Array.from(
        { length: 200 },
        (_, i) => `001,Démo,00120,Article ${i + 1},1`,
      ).join("\n");
    const profile = await profileDataset(encode(csv), "csv");
    const mapping = {
      ...csvMapping,
      expectedHeaders: [...csvMapping.expectedHeaders, "item", "quantity"],
      group: {
        itemPath: "items",
        fields: [
          { source: "item", target: "description", type: "text" as const },
          { source: "quantity", target: "quantity", type: "integer" as const },
        ],
      },
    };
    const result = validateMapping(profile, mapping);
    expect(result.status).toBe("ready");
    expect(result.documentCount).toBe(1);
    expect(result.records[0].data.items).toHaveLength(200);
    profile.sheets[0].rows[2].cells[1].raw = "Autre client";
    expect(
      validateMapping(profile, mapping).issues.map((x) => x.code),
    ).toContain("GROUP_VALUE_CONFLICT");
  });
  it("rejects orphan joins, non-unique parent keys and one-to-one cardinality violations", async () => {
    const profile = await profileDataset(makeWorkbook(customerSheets), "xlsx");
    const one = structuredClone(joinMapping);
    one.joins[0].cardinality = "one-to-one";
    expect(validateMapping(profile, one).issues.map((x) => x.code)).toContain(
      "JOIN_CHILD_CARDINALITY",
    );
    profile.sheets[1].rows[2].cells[0].raw = "999";
    expect(
      validateMapping(profile, joinMapping).issues.map((x) => x.code),
    ).toContain("JOIN_ORPHAN");
    const duplicate = structuredClone(joinMapping);
    duplicate.recordKey = [];
    profile.sheets[0].rows[3].cells[0].raw = "001";
    expect(
      validateMapping(profile, duplicate).issues.map((x) => x.code),
    ).toContain("JOIN_PARENT_CARDINALITY");
  });
  it("retains hidden row provenance and requires explicit hidden inclusion", async () => {
    const profile = await profileDataset(
      makeWorkbook([
        {
          name: "Données",
          rows: [
            ["id", "name", "postal"],
            ["001", "Visible", "00120"],
            ["002", "Masqué", "00120"],
          ],
          hiddenRows: [3],
        },
      ]),
      "xlsx",
    );
    const result = validateMapping(profile, csvMapping);
    expect(result.documentCount).toBe(1);
    expect(result.excludedRows[0].row).toBe(3);
    expect(
      validateMapping(profile, { ...csvMapping, includeHidden: true })
        .documentCount,
    ).toBe(2);
    profile.sheets[0].hidden = true;
    expect(validateMapping(profile, csvMapping).issues[0].code).toBe(
      "HIDDEN_SHEET_REVIEW",
    );
  });
  it("never evaluates formulas; cached values require an explicit policy and absent caches survive profiling", async () => {
    const profile = await profileDataset(
      makeWorkbook([
        {
          name: "Données",
          rows: [
            ["id", "name", "postal"],
            ["001", "Demo", { formula: "1+1", value: "2" }],
            ["002", "Demo", { formula: 'WEBSERVICE("https://attacker.test")' }],
          ],
        },
      ]),
      "xlsx",
    );
    expect(profile.issues.map((x) => x.code)).toEqual(
      expect.arrayContaining(["FORMULA_CACHED", "FORMULA_NO_CACHE"]),
    );
    expect(validateMapping(profile, csvMapping).status).toBe("needs_review");
    expect(
      validateMapping(profile, {
        ...csvMapping,
        formulaPolicy: "cached",
        excludeRows: [3],
      }).status,
    ).toBe("ready");
    expect(
      validateMapping(profile, {
        ...csvMapping,
        formulaPolicy: "cached",
      }).issues.map((x) => x.code),
    ).toContain("FORMULA_NO_CACHE");
  });
  it("preserves exact decimals and rejects implicit rounding, unsafe integers and impossible dates", () => {
    const cell = (raw: string) => ({
      column: 1,
      address: "A1",
      raw,
      kind: "text" as const,
    });
    expect(
      normalizeCell(
        cell("-0,500000001"),
        { source: "x", target: "x", type: "decimal", decimalSeparator: "," },
        "reject",
      ),
    ).toBe("-0.500000001");
    expect(
      normalizeCell(
        cell("0.000000001"),
        { source: "x", target: "x", type: "minor", scale: 9 },
        "reject",
      ),
    ).toBe(1);
    expect(() =>
      normalizeCell(
        cell("12.005"),
        { source: "x", target: "x", type: "minor", scale: 2 },
        "reject",
      ),
    ).toThrow("précision");
    expect(() =>
      normalizeCell(
        cell("9007199254740993"),
        { source: "x", target: "x", type: "integer" },
        "reject",
      ),
    ).toThrow("précision");
    expect(() =>
      normalizeCell(
        cell("2026-02-29"),
        { source: "x", target: "x", type: "date" },
        "reject",
      ),
    ).toThrow("calendrier");
  });
  it("supports JSON sheets and nested objects while preserving precise lexical numbers", async () => {
    const profile = await profileDataset(
      encode(
        '[{"id":"001","customer":{"name":"Demo"},"amount":"1.0000000000000001"}]',
      ),
      "json",
    );
    expect(profile.sheets[0].rows[0].cells.map((cell) => cell.raw)).toEqual([
      "id",
      "customer.name",
      "amount",
    ]);
    await expect(
      profileDataset(encode('[{"amount":1.0000000000000001}]'), "json"),
    ).rejects.toMatchObject({ code: "JSON_NUMERIC_PRECISION" });
    await expect(
      profileDataset(encode('[{"amount":9007199254740993}]'), "json"),
    ).rejects.toMatchObject({ code: "JSON_NUMERIC_PRECISION" });
  });
  it("profiles XML recipients, addresses and invoice lines with exact source values and explicit joins", async () => {
    const profile = await profileDataset(
      new Uint8Array(
        readFileSync(
          new URL(
            "../fixtures/datasets/clients-addresses.xml",
            import.meta.url,
          ),
        ),
      ),
      "xml",
    );
    expect(profile.format).toBe("xml");
    expect(profile.sheets.map((sheet) => sheet.name)).toEqual([
      "Données",
      "Données.items.item",
    ]);
    expect(profile.issues.map((issue) => issue.code)).toContain(
      "XML_REPEATED_TABLES",
    );
    const headers = profile.sheets[0].rows[0].cells.map((cell) => cell.raw!);
    const childHeaders = profile.sheets[1].rows[0].cells.map(
      (cell) => cell.raw!,
    );
    const result = validateMapping(profile, {
      ...csvMapping,
      recordKey: ["@id"],
      expectedHeaders: headers,
      fields: [
        { source: "@id", target: "id", type: "text" },
        { source: "name", target: "recipient.name", type: "text" },
        { source: "address.line1", target: "recipient.line1", type: "text" },
        {
          source: "address.postal",
          target: "recipient.postalCode",
          type: "text",
        },
        {
          source: "address.country",
          target: "recipient.countryCode",
          type: "text",
        },
        { source: "delivery.email", target: "email", type: "text" },
        { source: "delivery.fax", target: "fax", type: "text" },
        { source: "delivery.channel", target: "channel", type: "text" },
        {
          source: "amount.#text",
          target: "amount",
          type: "decimal",
          decimalSeparator: ".",
        },
        { source: "amount.@currency", target: "currency", type: "text" },
      ],
      joins: [
        {
          sheet: "Données.items.item",
          headerRow: 1,
          parentKey: "__xml_record_id",
          childKey: "__xml_parent_id",
          target: "items",
          cardinality: "one-to-many",
          expectedHeaders: childHeaders,
          fields: [
            { source: "description", target: "description", type: "text" },
            { source: "quantity", target: "quantity", type: "integer" },
          ],
        },
      ],
    });
    expect(result.status).toBe("ready");
    expect(result.records[0].data).toEqual({
      id: "0001",
      recipient: {
        name: "Élodie Müller",
        line1: "12 rue Exemple",
        postalCode: "00120",
        countryCode: "FR",
      },
      email: "elodie@example.test",
      fax: "+33123456789",
      channel: "postal",
      amount: "12.0050",
      currency: "EUR",
      items: [
        { description: "Conseil", quantity: 2 },
        { description: "Livraison", quantity: 1 },
      ],
    });
    expect(result.records[1].data).toMatchObject({
      id: "0002",
      recipient: { name: "Atelier Exemple & fils" },
      amount: "9007199254740993.01",
      items: [{ description: "Service", quantity: 3 }],
    });
    expect(
      result.records[0].provenance["recipient.postalCode"][0],
    ).toMatchObject({ sheet: "Données", row: 2 });
    expect(
      result.records[0].provenance["items[1].description"][0],
    ).toMatchObject({ sheet: "Données.items.item", row: 3 });
  });
  it("requires an explicit literal XML path for ambiguous roots and preserves namespaces", async () => {
    const xml = encode(
      '<e:export xmlns:e="urn:example"><meta>batch-01</meta><e:clients><e:client id="001"><e:name>A</e:name></e:client></e:clients></e:export>',
    );
    await expect(profileDataset(xml, "xml")).rejects.toMatchObject({
      code: "XML_RECORD_PATH_REQUIRED",
    });
    const profile = await profileDataset(xml, "xml", {
      xmlRecordPath: "/e:export/e:clients/e:client",
    });
    expect(profile.sheets[0].rows[0].cells.map((cell) => cell.raw)).toEqual([
      "e:name",
      "@id",
    ]);
    expect(profile.sheets[0].rows[1].cells.map((cell) => cell.raw)).toEqual([
      "A",
      "001",
    ]);
    await expect(
      profileDataset(xml, "xml", { xmlRecordPath: "/e:export/client" }),
    ).rejects.toMatchObject({ code: "XML_RECORD_PATH_NOT_FOUND" });
    for (const path of [
      "//client",
      "/export/*",
      "/export/client[1]",
      "/../client",
      "/export/__proto__",
    ]) {
      expect(XmlRecordPathSchema.safeParse(path).success).toBe(false);
      await expect(
        profileDataset(xml, "xml", { xmlRecordPath: path }),
      ).rejects.toMatchObject({ code: "INVALID_XML_RECORD_PATH" });
    }
  });
  it("preserves XML whitespace, empty fields, standard entities and literal CDATA", async () => {
    const profile = await profileDataset(
      encode(
        '<rows><!-- <fake> --><row><id> 0001 </id><empty/><name>&lt;A&gt; &amp; &#x1F680;</name><note>before<![CDATA[&custom; <tag>]]>after</note><amount unit="a > b">001.00</amount></row></rows>',
      ),
      "xml",
    );
    const cells = Object.fromEntries(
      profile.sheets[0].rows[0].cells.map((cell, index) => [
        cell.raw,
        profile.sheets[0].rows[1].cells[index].raw,
      ]),
    );
    expect(cells).toEqual({
      id: " 0001 ",
      empty: null,
      name: "<A> & 🚀",
      note: "before&custom; <tag>after",
      "amount.@unit": "a > b",
      "amount.#text": "001.00",
    });
  });
  it.each([
    [
      '<!DOCTYPE rows [<!ENTITY x SYSTEM "file:///etc/passwd">]><rows><row><x>&x;</x></row></rows>',
      "UNSAFE_XML",
    ],
    ["<rows><row><x>&external;</x></row></rows>", "UNSAFE_XML"],
    ["<rows><row><x>&#x0;</x></row></rows>", "INVALID_XML"],
    ["<rows><row><x>&#xD800;</x></row></rows>", "INVALID_XML"],
    ["<rows><row><x>unclosed</row></rows>", "INVALID_XML"],
    [
      "<rows><row><x>before<b>bold</b>after</x></row></rows>",
      "XML_MIXED_CONTENT",
    ],
    ["<rows><row><x.y>ambiguous</x.y></row></rows>", "INVALID_XML_KEY"],
    ["<rows><row><__proto__>unsafe</__proto__></row></rows>", "INVALID_XML"],
    [
      '<?xml version="1.0" encoding="ISO-8859-1"?><rows><row><x>A</x></row></rows>',
      "INVALID_XML_ENCODING",
    ],
    ["<rows><row><x>\u0000</x></row></rows>", "INVALID_XML"],
    [
      "<rows><row><group><item>A</item><item>B</item></group><group><item>C</item></group></row></rows>",
      "XML_NESTED_LIST",
    ],
  ])("rejects unsafe, malformed or lossy XML (%s)", async (xml, code) => {
    await expect(profileDataset(encode(xml), "xml")).rejects.toMatchObject({
      code,
    });
  });
  it("bounds XML depth, element count, rows, columns and field length before normalization", async () => {
    await expect(
      profileDataset(encode("<r>".repeat(33) + "</r>".repeat(33)), "xml"),
    ).rejects.toMatchObject({ code: "XML_DEPTH_LIMIT" });
    await expect(
      profileDataset(
        encode("<rows>" + "<row><x>A</x></row>".repeat(5000) + "</rows>"),
        "xml",
      ),
    ).rejects.toMatchObject({ code: "DATASET_DIMENSION_LIMIT" });
    await expect(
      profileDataset(
        encode("<rows>" + "<x/>".repeat(100000) + "</rows>"),
        "xml",
      ),
    ).rejects.toMatchObject({ code: "XML_ELEMENT_LIMIT" });
    await expect(
      profileDataset(
        encode(
          "<rows><row>" +
            Array.from({ length: 129 }, (_, n) => `<x${n}>A</x${n}>`).join("") +
            "</row></rows>",
        ),
        "xml",
      ),
    ).rejects.toMatchObject({ code: "DATASET_DIMENSION_LIMIT" });
    await expect(
      profileDataset(
        encode("<rows><row><x>" + "A".repeat(12001) + "</x></row></rows>"),
        "xml",
      ),
    ).rejects.toMatchObject({ code: "CELL_TOO_LARGE" });
    await expect(
      profileDataset(encode("<rows><row><x>A</x></row></rows>"), "xml", {
        encoding: "windows-1252",
      }),
    ).rejects.toMatchObject({ code: "INVALID_XML_ENCODING" });
  });
  it("blocks prototype writes, arbitrary transforms and overlapping output paths", async () => {
    expect(
      MappingPlanSchema.safeParse({
        ...csvMapping,
        fields: [
          { source: "name", target: "__proto__.polluted", type: "text" },
        ],
      }).success,
    ).toBe(false);
    expect(
      MappingPlanSchema.safeParse({
        ...csvMapping,
        script: "fetch('https://attacker.test')",
      }).success,
    ).toBe(false);
    const profile = await profileDataset(
      encode("id,name,postal\n001,Demo,00120"),
      "csv",
    );
    const result = validateMapping(profile, {
      ...csvMapping,
      fields: [
        ...csvMapping.fields,
        { source: "name", target: "customer", type: "text" },
      ],
    });
    expect(result.issues.map((x) => x.code)).toContain("CONFLICTING_TARGETS");
    expect(result.records).toEqual([]);
  });
  it("enforces CSV/XLSX resource limits before sparse workbook allocation", async () => {
    await expect(
      profileDataset(encode("id,name\n" + "1,Demo\n".repeat(5001)), "csv"),
    ).rejects.toMatchObject({ code: "DATASET_DIMENSION_LIMIT" });
    const bytes = makeWorkbook([{ name: "Rows", rows: [["id", "name"]] }], {
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="999999"><c r="A999999"><v>1</v></c></row></sheetData></worksheet>',
    });
    await expect(profileDataset(bytes, "xlsx")).rejects.toMatchObject({
      code: "ROW_LIMIT",
    });
  });
  it("rejects macro workbooks, external relationships, XML entities and dishonest ZIPs", async () => {
    const sheet = [{ name: "Demo", rows: [["id", "name"]] }];
    await expect(
      profileDataset(
        makeWorkbook(sheet, { "xl/vbaProject.bin": "macro" }),
        "xlsx",
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_WORKBOOK" });
    await expect(
      profileDataset(
        makeWorkbook(sheet, {
          "xl/_rels/sheet1.xml.rels":
            '<Relationships><Relationship TargetMode="External" Target="https://attacker.test"/></Relationships>',
        }),
        "xlsx",
      ),
    ).rejects.toMatchObject({ code: "EXTERNAL_WORKBOOK_LINK" });
    await expect(
      profileDataset(
        makeWorkbook(sheet, {
          "xl/workbook.xml":
            '<!DOCTYPE foo [<!ENTITY boom "test">]><workbook/>',
        }),
        "xlsx",
      ),
    ).rejects.toMatchObject({ code: "UNSAFE_XML" });
    expect(() =>
      unzipBounded(zipSync({ "../outside.xml": strToU8("bad") })),
    ).toThrow("Chemin");
    expect(() =>
      unzipBounded(zipSync({ "bomb.xml": strToU8("x".repeat(100000)) })),
    ).toThrow("décompression");
    const zip = zipSync({ "test.xml": strToU8("<safe>content</safe>") });
    const directory = new DataView(zip.buffer).getUint32(zip.length - 6, true);
    new DataView(zip.buffer).setUint32(directory + 24, 2, true);
    new DataView(zip.buffer).setUint32(22, 2, true);
    expect(() => unzipBounded(zip)).toThrow("Taille réelle");
  });
});
