import sanitizeHtml from "sanitize-html";
import {
  PINGEN_POSTAL_COUNTRY_CODES,
  isPingenPostalCountry,
  postalCountryAliases,
  type PostalCountry,
} from "../contracts/src/postal-destinations";
import { ProviderError, type Fetcher } from "./types";

export const PINGEN_DESTINATION_RESTRICTIONS_URL =
  "https://help.pingen.com/en/templates-and-postal-requirements/countries-with-delayed-or-restricted-mail-delivery";
export const PINGEN_DESTINATION_CACHE_MS = 300_000;
const maximumBytes = 256 * 1024;
const timeoutMs = 8_000;
const unavailableCode = "postal_destination_availability_unavailable";
const normalize = (value: string) =>
  value.normalize("NFC").replace(/\s+/gu, " ").trim().toUpperCase();

const aliases = new Map<string, Set<PostalCountry>>();
for (const country of PINGEN_POSTAL_COUNTRY_CODES)
  for (const alias of postalCountryAliases(country)) {
    const key = normalize(alias);
    const matches = aliases.get(key) ?? new Set<PostalCountry>();
    matches.add(country);
    aliases.set(key, matches);
  }

// These are spellings used in the restrictions article, not a permanent list
// of closed destinations. A country is restricted only when its row is read.
const restrictionLabelAliases: Readonly<Record<string, PostalCountry>> = {
  BURMA: "MM",
  "NORTH KOREA (DRPK)": "KP",
  "CHAD / REPUBLIC OF CHAD": "TD",
};
const continents = ["EUROPE", "AMERICA", "ASIA", "OCEANIA", "AFRICA"];
function fail(): never {
  throw new ProviderError(unavailableCode, true);
}
function plain(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);|&#([0-9]+);/gi, (_all, hex, decimal) => {
      const point = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      if (point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff))
        fail();
      return String.fromCodePoint(point);
    })
    .replace(
      /&(nbsp|amp|quot|apos|lt|gt);/gi,
      (_all, name: string) =>
        ({ nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[
          name.toLowerCase() as "nbsp"
        ],
    );
}
function countryFor(value: string): PostalCountry {
  const text = normalize(plain(value));
  if (!text || /&(?:#|[A-Z])[^;\s]*;/i.test(text)) fail();
  if (isPingenPostalCountry(text)) return text;
  const label = restrictionLabelAliases[text];
  if (label) return label;
  const matches = aliases.get(text);
  if (!matches || matches.size !== 1) fail();
  return matches.values().next().value!;
}
function readTable(table: string): PostalCountry[] {
  const structure =
    /^<table>\s*<thead>([\s\S]*?)<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>\s*<\/table>$/.exec(
      table,
    );
  if (!structure) fail();
  const header = /^\s*<tr>((?:\s*<th>[\s\S]*?<\/th>){5})\s*<\/tr>\s*$/.exec(
    structure[1],
  );
  if (!header) fail();
  const headings = Array.from(header[1].matchAll(/<th>([\s\S]*?)<\/th>/g)).map(
    (match) => normalize(plain(match[1])),
  );
  if (
    headings.length !== continents.length ||
    new Set(headings).size !== continents.length ||
    headings.some((heading) => !continents.includes(heading))
  )
    fail();
  const rows = Array.from(structure[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g));
  if (
    rows.length < 1 ||
    rows.length > PINGEN_POSTAL_COUNTRY_CODES.length ||
    structure[2].replace(/<tr>[\s\S]*?<\/tr>/g, "").trim()
  )
    fail();
  let explicitEntries = 0;
  const result = new Set<PostalCountry>();
  for (const row of rows) {
    const cells = Array.from(row[1].matchAll(/<td>([\s\S]*?)<\/td>/g));
    if (
      cells.length !== continents.length ||
      row[1].replace(/<td>[\s\S]*?<\/td>/g, "").trim()
    )
      fail();
    for (const cell of cells) {
      const text = normalize(plain(cell[1]));
      if (!text) continue;
      explicitEntries++;
      if (text !== "NONE") result.add(countryFor(cell[1]));
    }
  }
  if (!explicitEntries) fail();
  return Array.from(result).sort();
}

/** Parse both complete current sections. A missing/changed article never means
 * that every country is available. Whole-body hashes are observation provenance. */
export function parsePingenDestinationRestrictions(html: string): {
  unavailable: PostalCountry[];
  delayed: PostalCountry[];
} {
  if (!html || new TextEncoder().encode(html).byteLength > maximumBytes) fail();
  const sanitized = sanitizeHtml(html, {
    allowedTags: [
      "div",
      "h2",
      "p",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: { div: ["class"] },
  });
  const fragments = Array.from(
    sanitized.matchAll(
      /<div class="(?=[^"]*\brich-text\b)(?=[^"]*\bw-richtext\b)[^"]*">([\s\S]*?)<\/div>/g,
    ),
  );
  if (fragments.length !== 1) fail();
  const section =
    /^\s*<h2>Countries with restricted mail delivery<\/h2>\s*<p>It is currently not possible to send letters to the following countries via Pingen:<\/p>\s*(<table>[\s\S]*?<\/table>)\s*<h2>Countries with delayed mail delivery<\/h2>\s*<p>Delivery delays are currently known to the following countries:<\/p>\s*(<table>[\s\S]*?<\/table>)\s*$/.exec(
      fragments[0][1],
    );
  if (!section) fail();
  const unavailable = readTable(section[1]);
  const delayed = readTable(section[2]);
  if (delayed.some((country) => unavailable.includes(country))) fail();
  return { unavailable, delayed };
}

export type PingenDestinationAvailability = Readonly<{
  source: typeof PINGEN_DESTINATION_RESTRICTIONS_URL;
  sourceSha256: string;
  observedAt: string;
  expiresAt: string;
  unavailable: readonly PostalCountry[];
  delayed: readonly PostalCountry[];
}>;
type Clock = () => number;
export class PingenDestinationAvailabilityReader {
  private snapshot?: PingenDestinationAvailability;
  private inFlight?: Promise<PingenDestinationAvailability>;
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly now: Clock = Date.now,
  ) {}

  async read(): Promise<PingenDestinationAvailability> {
    if (this.snapshot && this.isCurrent(this.snapshot)) return this.snapshot;
    this.snapshot = undefined;
    if (!this.inFlight)
      this.inFlight = this.load().finally(() => {
        this.inFlight = undefined;
      });
    const result = await this.inFlight;
    if (!this.isCurrent(result)) fail();
    this.snapshot = result;
    return result;
  }

  isCurrent(snapshot: PingenDestinationAvailability): boolean {
    const now = this.now();
    return (
      Number.isFinite(now) &&
      Date.parse(snapshot.observedAt) <= now &&
      Date.parse(snapshot.expiresAt) > now
    );
  }

  async assertAvailable(
    country: string,
  ): Promise<PingenDestinationAvailability> {
    if (!isPingenPostalCountry(country))
      throw new ProviderError("postal_country_not_supported");
    const snapshot = await this.read();
    if (!this.isCurrent(snapshot)) fail();
    if (snapshot.unavailable.includes(country))
      throw new ProviderError("postal_destination_unavailable");
    return snapshot;
  }

  private async load(): Promise<PingenDestinationAvailability> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        void reader?.cancel().catch(() => undefined);
        reject(new ProviderError(unavailableCode, true));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(
            PINGEN_DESTINATION_RESTRICTIONS_URL,
            {
              method: "GET",
              headers: { Accept: "text/html" },
              redirect: "manual",
              signal: controller.signal,
            },
          );
          if (
            response.status !== 200 ||
            (response.url &&
              response.url !== PINGEN_DESTINATION_RESTRICTIONS_URL) ||
            !/^text\/html(?:;|$)/i.test(
              response.headers.get("content-type") ?? "",
            ) ||
            Number(response.headers.get("content-length") ?? 0) > maximumBytes
          ) {
            void response.body?.cancel().catch(() => undefined);
            fail();
          }
          reader = response.body?.getReader();
          if (!reader) fail();
          const parts: Uint8Array[] = [];
          let length = 0;
          for (;;) {
            if (controller.signal.aborted) fail();
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > maximumBytes) fail();
            parts.push(next.value);
          }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
          }
          const restrictions = parsePingenDestinationRestrictions(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          if (controller.signal.aborted) fail();
          // Source observation belongs after the actual read and validation.
          const observed = this.now();
          if (!Number.isFinite(observed)) fail();
          return Object.freeze({
            source: PINGEN_DESTINATION_RESTRICTIONS_URL,
            sourceSha256: Array.from(new Uint8Array(digest), (value) =>
              value.toString(16).padStart(2, "0"),
            ).join(""),
            observedAt: new Date(observed).toISOString(),
            expiresAt: new Date(
              observed + PINGEN_DESTINATION_CACHE_MS,
            ).toISOString(),
            unavailable: Object.freeze(restrictions.unavailable),
            delayed: Object.freeze(restrictions.delayed),
          });
        })(),
        timeout,
      ]);
    } catch {
      return fail();
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    }
  }
}

// Public metadata only: one snapshot/single-flight per trusted fetcher and clock.
const readers = new WeakMap<
  Fetcher,
  WeakMap<Clock, PingenDestinationAvailabilityReader>
>();
export function pingenDestinationAvailability(
  fetcher: Fetcher = fetch,
  now: Clock = Date.now,
): PingenDestinationAvailabilityReader {
  let clocks = readers.get(fetcher);
  if (!clocks) {
    clocks = new WeakMap();
    readers.set(fetcher, clocks);
  }
  let reader = clocks.get(now);
  if (!reader) {
    reader = new PingenDestinationAvailabilityReader(fetcher, now);
    clocks.set(now, reader);
  }
  return reader;
}
