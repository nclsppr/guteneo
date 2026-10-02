import { zipSync, strToU8 } from "fflate";
export const encode = (text: string) => new TextEncoder().encode(text);
const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
export type FixtureCell =
  string | number | null | { value?: string; formula: string };
export function makeWorkbook(
  sheets: Array<{
    name: string;
    rows: FixtureCell[][];
    hidden?: boolean;
    hiddenRows?: number[];
    merges?: string[];
  }>,
  extra: Record<string, string> = {},
) {
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, text: string) => {
    files[name] = strToU8(text);
  };
  put(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`,
  );
  put(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  put(
    "xl/workbook.xml",
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"${sheet.hidden ? ' state="hidden"' : ""}/>`).join("")}</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  for (const [index, sheet] of sheets.entries()) {
    put(
      `xl/worksheets/sheet${index + 1}.xml`,
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet.rows
        .map(
          (row, rowIndex) =>
            `<row r="${rowIndex + 1}"${sheet.hiddenRows?.includes(rowIndex + 1) ? ' hidden="1"' : ""}>${row
              .map((value, column) => {
                const address = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
                if (value === null) return `<c r="${address}"/>`;
                if (typeof value === "string")
                  return `<c r="${address}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
                if (typeof value === "number")
                  return `<c r="${address}" t="n"><v>${value}</v></c>`;
                return `<c r="${address}"><f>${escapeXml(value.formula)}</f>${value.value !== undefined ? `<v>${escapeXml(value.value)}</v>` : ""}</c>`;
              })
              .join("")}</row>`,
        )
        .join(
          "",
        )}</sheetData>${sheet.merges?.length ? `<mergeCells>${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}</worksheet>`,
    );
  }
  for (const [name, value] of Object.entries(extra)) put(name, value);
  return zipSync(files);
}
export const customerSheets: Parameters<typeof makeWorkbook>[0] = [
  {
    name: "Clients",
    rows: [
      ["Clients synthétiques — septembre 2026"],
      ["ID", "Nom", "Code postal", "Date", "Email"],
      ["001", "Élodie Müller", "00120", "03/04/2026", "elodie@example.test"],
      ["002", "Société Démo", "75001", "21/09/2026", "contact@example.test"],
    ],
    merges: ["A1:E1"],
  },
  {
    name: "Articles",
    rows: [
      ["Lignes de démonstration"],
      ["Client", "Description", "Quantité", "Prix"],
      ["001", "Conseil", "2", "12,50"],
      ["001", "Livraison", "1", "4,00"],
      ["002", "Service", "3", "10,00"],
    ],
  },
];
