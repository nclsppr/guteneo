import { createHash } from "node:crypto";

const MAXIMUM_BYTES = 40 * 1024 * 1024;
const MAXIMUM_ROW_BYTES = 65_536;
const DAY = 86_400_000;
const FX_SOURCE =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const PREFIXES = [
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
const EXCLUSION_PREFIXES = ["+33182883934", "+4932", "+49700", "+49800"];
const COLUMNS = [
  "ISO",
  "Country",
  "Origination Prefixes",
  "Destination Prefixes",
  "Description",
  "Interval 1",
  "Interval N",
  "Rate",
  "Price Per Call",
  "Exact Match",
];
const CLOSED_CODES = new Set([
  "SOURCE_INVALID",
  "SOURCE_TOO_LARGE",
  "SOURCE_TIMEOUT",
  "SOURCE_HTTP",
]);

export class FaxReferenceSourceError extends Error {
  constructor(code) {
    super(CLOSED_CODES.has(code) ? code : "SOURCE_INVALID");
    this.name = "FaxReferenceSourceError";
    this.code = this.message;
  }
}
const fail = (code = "SOURCE_INVALID") => {
  throw new FaxReferenceSourceError(code);
};
const nanoRate = (value) => {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,9})?$/.test(value))
    fail();
  const [whole, fraction = ""] = value.split(".");
  const result =
    BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (result > 1_000_000_000n) fail();
  return Number(result);
};
function sourceText(bytes, maximum) {
  if (!(bytes instanceof Uint8Array)) fail();
  if (bytes.byteLength > maximum) fail("SOURCE_TOO_LARGE");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail();
  }
}
export function validateEeaFaxReferenceScope(bindings, exclusions) {
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 14 ||
    !Array.isArray(exclusions) ||
    exclusions.length !== 4
  )
    fail();
  const fields = [
    "organization_id",
    "sender_id",
    "account_id",
    "connection_id",
    "outbound_profile_id",
  ];
  const first = bindings[0];
  if (
    !first ||
    !fields.every(
      (key) => typeof first[key] === "string" && first[key].length > 0,
    )
  )
    fail();
  const seen = new Set();
  for (const row of bindings) {
    if (
      !row ||
      seen.has(row.destination_prefix) ||
      !PREFIXES.includes(row.destination_prefix) ||
      fields.some((key) => row[key] !== first[key]) ||
      row.sender_country_code !== "LU" ||
      row.sender_prefix !== "+352" ||
      row.origin_class !== "eea" ||
      row.execution_scope !== "live" ||
      row.route_qualification !== "provider_verified" ||
      row.options_json !== "{}" ||
      row.route_allowed !== 1 ||
      row.destination_category !== "fixed" ||
      row.destination_country_code !==
        (row.destination_prefix.startsWith("+33") ? "FR" : "DE")
    )
      fail();
    seen.add(row.destination_prefix);
  }
  const denied = new Set();
  for (const row of exclusions) {
    if (
      !row ||
      typeof row.destination_prefix !== "string" ||
      !/^\+[1-9]\d{2,14}$/.test(row.destination_prefix) ||
      !EXCLUSION_PREFIXES.includes(row.destination_prefix) ||
      denied.has(row.destination_prefix) ||
      fields.some((key) => row[key] !== first[key]) ||
      row.sender_country_code !== "LU" ||
      row.sender_prefix !== "+352" ||
      row.origin_class !== "eea" ||
      row.execution_scope !== "live" ||
      row.route_qualification !== "provider_verified" ||
      row.options_json !== "{}" ||
      row.route_allowed !== 0 ||
      !bindings.some(
        (binding) =>
          row.destination_prefix.startsWith(binding.destination_prefix) &&
          row.destination_prefix.length > binding.destination_prefix.length &&
          row.destination_country_code === binding.destination_country_code,
      )
    )
      fail();
    denied.add(row.destination_prefix);
  }
  return [...bindings].sort((a, b) =>
    a.destination_prefix.localeCompare(b.destination_prefix),
  );
}

/** Retains one bounded CSV row and fourteen selected parents, never the whole deck. */
export async function parseEeaFaxRateDeck(chunks, bindings, exclusions) {
  const targets = validateEeaFaxReferenceScope(bindings, exclusions);
  const selected = new Map();
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    relevantRows = 0,
    rowBytes = 0,
    field = "",
    row = [],
    header = false,
    skipLf = false;
  let mode = "start";
  const finishField = () => {
    row.push(field);
    if (row.length > COLUMNS.length) fail();
    field = "";
    mode = "start";
  };
  const finishRow = () => {
    finishField();
    const values = row;
    row = [];
    rowBytes = 0;
    if (values.length === 1 && values[0] === "") return;
    if (!header) {
      values[0] = values[0].replace(/^\uFEFF/, "");
      if (JSON.stringify(values) !== JSON.stringify(COLUMNS)) fail();
      header = true;
      return;
    }
    if (values.length !== COLUMNS.length) fail();
    if (!["FR", "DE"].includes(values[0])) return;
    const origin = values[2].trim();
    const fromEea = / - From EEA$/.test(values[4]);
    // Numeric membership determines applicability before a provider label can
    // exclude a newly introduced route from the longest-prefix proof.
    if (!/^\d+(?:\s*,\s*\d+)*$/.test(origin)) {
      if (fromEea) fail();
      return;
    }
    const origins = origin.split(",").map((value) => value.trim());
    if (!origins.includes("352")) return;
    if (new Set(origins).size !== origins.length) fail();
    relevantRows++;
    const prefix = "+" + values[3].trim();
    if (
      !/^\+[1-9]\d{1,14}$/.test(prefix) ||
      !prefix.startsWith(values[0] === "FR" ? "+33" : "+49")
    )
      fail();
    for (const target of targets) {
      if (target.destination_country_code !== values[0]) continue;
      if (
        prefix.startsWith(target.destination_prefix) &&
        prefix.length > target.destination_prefix.length
      ) {
        if (
          !exclusions.some((excluded) =>
            prefix.startsWith(excluded.destination_prefix),
          )
        )
          fail();
      }
      if (!target.destination_prefix.startsWith(prefix)) continue;
      const country = values[0] === "FR" ? "France" : "Germany";
      if (
        values[1] !== country ||
        values[4] !== `Trunking Outbound Minute - ${country} - From EEA` ||
        values[5].trim() !== "60" ||
        values[6].trim() !== "60" ||
        values[8].trim() !== "" ||
        values[9].trim() !== ""
      )
        fail();
      const candidate = {
        destinationPrefix: target.destination_prefix,
        matchedPrefix: prefix,
        minuteNanoUsd: nanoRate(values[7].trim()),
        initialSeconds: 60,
        incrementSeconds: 60,
        // A missing reference component is not proof of zero supplier fees.
        callNanoUsd: 0,
      };
      const previous = selected.get(target.destination_prefix);
      if (previous?.matchedPrefix.length === prefix.length) fail();
      if (!previous || prefix.length > previous.matchedPrefix.length)
        selected.set(target.destination_prefix, candidate);
    }
  };
  const consume = (text) => {
    for (const character of text) {
      if (skipLf) {
        skipLf = false;
        if (character === "\n") continue;
      }
      const point = character.codePointAt(0);
      rowBytes +=
        point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (rowBytes > MAXIMUM_ROW_BYTES) fail("SOURCE_TOO_LARGE");
      if (mode === "quoted") {
        if (character === '"') mode = "closed";
        else field += character;
        continue;
      }
      if (mode === "closed" && character === '"') {
        field += '"';
        mode = "quoted";
        continue;
      }
      if (character === ",") {
        finishField();
        continue;
      }
      if (character === "\r" || character === "\n") {
        finishRow();
        skipLf = character === "\r";
        continue;
      }
      if (mode === "closed") fail();
      if (character === '"') {
        if (mode !== "start") fail();
        mode = "quoted";
        continue;
      }
      field += character;
      mode = "plain";
    }
  };
  try {
    for await (const chunk of chunks) {
      if (!(chunk instanceof Uint8Array)) fail();
      bytes += chunk.byteLength;
      if (bytes > MAXIMUM_BYTES) fail("SOURCE_TOO_LARGE");
      hash.update(chunk);
      consume(decoder.decode(chunk, { stream: true }));
    }
    consume(decoder.decode());
    if (mode === "quoted") fail();
    if (field || row.length || mode === "closed") finishRow();
  } catch (error) {
    if (error instanceof FaxReferenceSourceError) throw error;
    throw new FaxReferenceSourceError(
      CLOSED_CODES.has(error?.code) ? error.code : "SOURCE_INVALID",
    );
  }
  if (!header || selected.size !== targets.length) fail();
  return {
    routes: targets.map((target) => selected.get(target.destination_prefix)),
    sha256: hash.digest("hex"),
    bytes,
    relevantRows,
  };
}

export function parseReferencePagePrice(bytes) {
  const text = sourceText(bytes, 512 * 1024)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const prices = [
    ...text.matchAll(
      /Send a fax via API\s*\$([\d.]+)\s*per page\s*\+\s*SIP Trunking\s*usage for transmission/gi,
    ),
  ];
  if (prices.length !== 1) fail();
  const price = nanoRate(prices[0][1]);
  if (!price) fail();
  return price;
}

export function parseReferenceFx(bytes, observedAt) {
  const xml = sourceText(bytes, 128 * 1024);
  if (
    typeof observedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(observedAt) ||
    !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString() !== observedAt ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    fail();
  const dates = [
    ...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g),
  ];
  const rates = [
    ...xml.matchAll(
      /<Cube\s+currency=['"]USD['"]\s+rate=['"](\d+\.\d+)['"]\s*\/>/g,
    ),
  ];
  if (dates.length !== 1 || rates.length !== 1) fail();
  const date = dates[0][1],
    parsed = new Date(date),
    today = observedAt.slice(0, 10);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > today ||
    Date.parse(today) - parsed.getTime() > 7 * DAY
  )
    fail();
  const [whole, fraction] = rates[0][1].split(".");
  if (whole.length > 8 || fraction.length > 6) fail();
  let numerator = 10n ** BigInt(fraction.length),
    denominator = BigInt(whole + fraction);
  if (!denominator) fail();
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const common = gcd(numerator, denominator);
  numerator /= common;
  denominator /= common;
  if (numerator > 1_000_000n || denominator > 1_000_000n) fail();
  return {
    date,
    numerator: Number(numerator),
    denominator: Number(denominator),
    source: FX_SOURCE,
  };
}
