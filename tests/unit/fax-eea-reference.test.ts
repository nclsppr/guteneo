import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseEeaFaxRateDeck,
  parseReferencePagePrice,
  parseReferenceFx,
} from "../../packages/providers/fax-eea-reference.mjs";

const prefixes = [
  "+331",
  "+332",
  "+333",
  "+334",
  "+335",
  "+339",
  "+492",
  "+493",
  "+494",
  "+495",
  "+496",
  "+497",
  "+498",
  "+499",
];
const binding = (prefix: string, allowed = 1) => ({
  id: `synthetic_${prefix.slice(1)}`,
  organization_id: "synthetic_workspace",
  sender_id: "synthetic_sender",
  account_id: "synthetic_account",
  connection_id: "synthetic_application",
  outbound_profile_id: "synthetic_profile",
  sender_country_code: "LU",
  sender_prefix: "+352",
  destination_prefix: prefix,
  destination_country_code: prefix.startsWith("+33") ? "FR" : "DE",
  origin_class: "eea",
  execution_scope: "live",
  route_qualification: "provider_verified",
  destination_category: allowed ? "fixed" : "special",
  route_allowed: allowed,
  options_json: "{}",
});
const bindings = () => prefixes.map((prefix) => binding(prefix));
const exclusions = () =>
  ["+33182883934", "+4932", "+49700", "+49800"].map((prefix) =>
    binding(prefix, 0),
  );
const header =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
function csvRow(
  prefix: string,
  rate = "0.0056",
  origins = "30, 31, 352, 49",
  call = "",
  exact = "",
) {
  const country = prefix.startsWith("33") ? "France" : "Germany";
  return `${country === "France" ? "FR" : "DE"},${country},"${origins}",${prefix},Trunking Outbound Minute - ${country} - From EEA,60,60,${rate},${call},${exact}`;
}
const deck = (extra: string[] = [], origins = "30, 31, 352, 49") =>
  [
    header,
    csvRow("33", "0.0056", origins),
    csvRow("49", "0.0081", origins),
    ...exclusions().map((row) =>
      csvRow(row.destination_prefix.slice(1), "0.09", origins),
    ),
    ...extra,
  ].join("\r\n");
const encode = (text: string) => new TextEncoder().encode(text);
async function* chunks(bytes: Uint8Array, size = 23) {
  for (let start = 0; start < bytes.byteLength; start += size)
    yield bytes.subarray(start, start + size);
}
const parse = (text = deck(), size = 23) =>
  parseEeaFaxRateDeck(chunks(encode(text), size), bindings(), exclusions());
const now = "2026-11-01T10:00:00.000Z";
const fx = (date = "2026-10-30", rate = "1.1537") =>
  encode(`<Cube time="${date}"><Cube currency="USD" rate="${rate}"/></Cube>`);

describe("streamed registered FR/DE public fax references", () => {
  it("reads the numeric EEA list and qualifies all fourteen exact scopes without changing exclusions", async () => {
    const admitted = bindings(),
      denied = exclusions();
    const before = structuredClone({ admitted, denied });
    const bytes = encode("\uFEFF" + deck());
    const result = await parseEeaFaxRateDeck(
      chunks(bytes, 1),
      admitted,
      denied,
    );
    expect({ admitted, denied }).toEqual(before);
    expect(result.routes.map((row) => row.destinationPrefix)).toEqual(prefixes);
    expect(
      result.routes.every(
        (row) =>
          row.initialSeconds === 60 &&
          row.incrementSeconds === 60 &&
          row.callNanoUsd === 0,
      ),
    ).toBe(true);
    expect(
      result.routes.filter((row) => row.matchedPrefix === "+33"),
    ).toHaveLength(6);
    expect(
      result.routes.filter((row) => row.matchedPrefix === "+49"),
    ).toHaveLength(8);
    expect(
      result.routes.find((row) => row.destinationPrefix === "+331")
        ?.minuteNanoUsd,
    ).toBe(5_600_000);
    expect(result.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(result.bytes).toBe(bytes.byteLength);
    expect(result.relevantRows).toBe(6);
  });

  it("keeps UTF-8, quoted commas, escaped quotes and row boundaries stable across chunk sizes", async () => {
    const text = deck([
      'ZZ,"Café ""quoted"", island",,123,Unrelated,60,60,0.1,,',
    ]);
    const expected = await parse(text, 4096);
    for (const size of [1, 2, 3, 17, 511])
      expect(await parse(text, size)).toEqual(expected);
  });

  it("uses a unique more-specific parent instead of its broader country rate", async () => {
    const result = await parse(deck([csvRow("331", "0.012345678")]));
    expect(
      result.routes.find((row) => row.destinationPrefix === "+331"),
    ).toMatchObject({ matchedPrefix: "+331", minuteNanoUsd: 12_345_678 });
    expect(
      result.routes.find((row) => row.destinationPrefix === "+332")
        ?.matchedPrefix,
    ).toBe("+33");
  });

  it.each(["1352, 49", "EEA", "352, 352", "352,invalid"])(
    "refuses an unproved or malformed LU origin list %s",
    async (origins) => {
      await expect(parse(deck([], origins))).rejects.toMatchObject({
        code: "SOURCE_INVALID",
      });
    },
  );

  it("refuses any new uncovered sub-prefix even when its published rate is unchanged", async () => {
    await expect(parse(deck([csvRow("3328", "0.0056")]))).rejects.toMatchObject(
      { code: "SOURCE_INVALID" },
    );
  });

  it("does not hide an applicable new sub-prefix behind an unknown provider description", async () => {
    const unknown = csvRow("3328").replace(
      "France - From EEA",
      "France - New category",
    );
    await expect(parse(deck([unknown]))).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it("does not reject repeated calling codes in unrelated non-LU origin lists", async () => {
    const unrelated = csvRow("3328", "0.0056", "1, 1").replace(
      "France - From EEA",
      "France - Other origins",
    );
    expect((await parse(deck([unrelated]))).routes).toHaveLength(14);
  });

  it("rejects ambiguous equal-length parents rather than selecting a cheaper duplicate", async () => {
    await expect(parse(deck([csvRow("33", "0.0001")]))).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it.each([
    (text: string) => text.replace("FR,France,", "FR,Germany,"),
    (text: string) => text.replace("60,60,0.0056,,", "30,60,0.0056,,"),
    (text: string) => text.replace("60,60,0.0056,,", "60,30,0.0056,,"),
    (text: string) => text.replace("0.0056,,", "0.0056,0,"),
    (text: string) => text.replace("0.0056,,", "0.0056,,true"),
    (text: string) => text.replace("0.0056", "0.1234567891"),
    (text: string) => text.replace("0.0056", "1.000000001"),
    (text: string) => text.replace("0.0056", "-0.0056"),
  ])(
    "refuses changed intervals, fee semantics or unqualified decimal rates",
    async (alter) => {
      await expect(parse(alter(deck()))).rejects.toMatchObject({
        code: "SOURCE_INVALID",
      });
    },
  );

  it("requires all fourteen distinct admitted bindings and four correctly scoped denials", async () => {
    const input = encode(deck());
    for (const admitted of [
      bindings().slice(1),
      [...bindings().slice(1), binding("+33")],
      [...bindings().slice(1), bindings()[1]],
    ])
      await expect(
        parseEeaFaxRateDeck(chunks(input), admitted, exclusions()),
      ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
    for (const denied of [
      exclusions().slice(1),
      exclusions().map((row, i) => (i ? row : { ...row, route_allowed: 1 })),
      exclusions().map((row, i) =>
        i ? row : { ...row, account_id: "foreign" },
      ),
      exclusions().map((row, i) =>
        i ? row : { ...row, destination_prefix: "+33199" },
      ),
    ])
      await expect(
        parseEeaFaxRateDeck(chunks(input), bindings(), denied),
      ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it.each([
    "",
    header,
    deck().replace("ISO,Country", "Country,ISO"),
    deck().replace("FR,France", 'FR,"France'),
    deck().replace("FR,France", 'FR,"France" extra'),
    deck().replace("FR,France", "FR,France,unexpected"),
    deck().replace(csvRow("33"), ""),
  ])(
    "refuses incomplete, malformed or unsupported source structure",
    async (text) => {
      await expect(parse(text)).rejects.toMatchObject({
        code: "SOURCE_INVALID",
      });
    },
  );

  it("bounds total bytes and row bytes and sanitizes stream failures", async () => {
    async function* oversized() {
      yield new Uint8Array(40 * 1024 * 1024 + 1);
    }
    await expect(
      parseEeaFaxRateDeck(oversized(), bindings(), exclusions()),
    ).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
    await expect(parse(deck(["Z".repeat(65_537)]))).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
    });
    async function* broken() {
      yield encode(header);
      throw Object.assign(new Error("PRIVATE_BODY"), {
        code: "SOURCE_TIMEOUT",
      });
    }
    await expect(
      parseEeaFaxRateDeck(broken(), bindings(), exclusions()),
    ).rejects.toMatchObject({
      code: "SOURCE_TIMEOUT",
      message: "SOURCE_TIMEOUT",
    });
    async function* invalidUtf8() {
      yield new Uint8Array([0xff]);
    }
    await expect(
      parseEeaFaxRateDeck(invalidUtf8(), bindings(), exclusions()),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });
});

describe("pure public fax fee and dated ECB references", () => {
  const page =
    "<main>Send a fax via API $0.007 per page + SIP Trunking usage for transmission</main>";
  it("reads one visible page fee and ignores obsolete script and comment prices", () => {
    expect(
      parseReferencePagePrice(
        encode(`<!--${page}--><script>${page}</script>${page}`),
      ),
    ).toBe(7_000_000);
    expect(() => parseReferencePagePrice(encode(page + page))).toThrow(
      "SOURCE_INVALID",
    );
    expect(() =>
      parseReferencePagePrice(encode(page.replace("0.007", "0"))),
    ).toThrow("SOURCE_INVALID");
  });
  it("reduces a genuine dated USD/EUR reference without floating-point money", () => {
    expect(parseReferenceFx(fx(), now)).toEqual({
      date: "2026-10-30",
      numerator: 10000,
      denominator: 11537,
      source: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    });
    expect(parseReferenceFx(fx("2026-10-25", "1.2500"), now)).toMatchObject({
      numerator: 4,
      denominator: 5,
    });
  });
  it.each([
    () => parseReferenceFx(fx("2026-11-02"), now),
    () => parseReferenceFx(fx("2026-10-24"), now),
    () => parseReferenceFx(fx("2026-02-30"), now),
    () => parseReferenceFx(fx("2026-10-30", "0.0000001"), now),
    () => parseReferenceFx(fx("2026-10-30", "0.000000"), now),
    () => parseReferenceFx(fx(), "invalid"),
    () =>
      parseReferenceFx(
        encode(
          '<!DOCTYPE x><Cube time="2026-10-30"><Cube currency="USD" rate="1.1"/></Cube>',
        ),
        now,
      ),
  ])(
    "refuses stale, future, malformed, excessive or entity-bearing FX evidence",
    (action) => {
      expect(action).toThrow("SOURCE_INVALID");
    },
  );
});
