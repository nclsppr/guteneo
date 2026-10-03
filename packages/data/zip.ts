import { inflateSync } from "fflate";

export type ArchiveLimits = {
  sourceBytes: number;
  expandedBytes: number;
  entryBytes: number;
  entries: number;
  ratio: number;
};
export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  sourceBytes: 5 * 1024 * 1024,
  expandedBytes: 24 * 1024 * 1024,
  entryBytes: 8 * 1024 * 1024,
  entries: 256,
  ratio: 200,
};
export class DatasetError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Checks the full directory before inflating anything; never trusts an allocation size from an unchecked entry. */
export function unzipBounded(
  bytes: Uint8Array,
  overrides: Partial<ArchiveLimits> = {},
): Record<string, Uint8Array> {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...overrides };
  const fail = (message: string): never => {
    throw new DatasetError("UNSAFE_ARCHIVE", message);
  };
  if (bytes.length < 22 || bytes.length > limits.sourceBytes)
    fail("Archive absente ou trop volumineuse.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) fail("Répertoire ZIP invalide.");
  const count = view.getUint16(end + 10, true),
    directorySize = view.getUint32(end + 12, true),
    directory = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    count > limits.entries ||
    directory + directorySize !== end
  )
    fail("ZIP multipart, ZIP64 ou limites non acceptés.");
  const entries: Array<{
    name: string;
    offset: number;
    size: number;
    compressed: number;
    method: number;
    crc: number;
  }> = [];
  const names = new Set<string>();
  let cursor = directory,
    expanded = 0;
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      fail("Entrée ZIP invalide.");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      crc = view.getUint32(cursor + 16, true),
      compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true),
      local = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      local + 30 > directory ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true) ||
      ((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000
    )
      fail("Archive chiffrée ou entrée non prise en charge.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (
      !name ||
      /[\\\u0000]/.test(name) ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      names.has(name)
    )
      fail("Chemin ZIP ambigu ou dupliqué.");
    names.add(name);
    expanded += size;
    if (
      size > limits.entryBytes ||
      expanded > limits.expandedBytes ||
      size / Math.max(1, compressed) > limits.ratio
    )
      fail("Limite de décompression dépassée.");
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint16(local + 6, true) !== flags
    )
      fail("En-têtes ZIP incohérents.");
    const localNameLength = view.getUint16(local + 26, true),
      offset = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (
      offset + compressed > directory ||
      new TextDecoder().decode(
        bytes.subarray(local + 30, local + 30 + localNameLength),
      ) !== name
    )
      fail("Données ZIP incohérentes.");
    if (
      !(flags & 8) &&
      (view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== size)
    )
      fail("Tailles ZIP incohérentes.");
    if (
      ranges.some(
        ([start, finish]) => local < finish && offset + compressed > start,
      )
    )
      fail("Entrées ZIP superposées.");
    ranges.push([local, offset + compressed]);
    entries.push({ name, offset, size, compressed, method, crc });
    cursor = next;
  }
  if (cursor !== end) fail("Répertoire ZIP incomplet.");
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.offset,
      entry.offset + entry.compressed,
    );
    // One guard byte detects a dishonest expanded size, without allocating a bomb-sized output.
    let output: Uint8Array;
    try {
      output =
        entry.method === 0
          ? compressed.slice()
          : inflateSync(compressed, { out: new Uint8Array(entry.size + 1) });
    } catch {
      fail("Flux ZIP invalide.");
    }
    if (output!.length !== entry.size || crc32(output!) !== entry.crc)
      fail("Taille réelle ou intégrité ZIP invalide.");
    files[entry.name] = output!;
  }
  return files;
}

export function safeXml(bytes: Uint8Array): string {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DatasetError(
      "INVALID_XML_ENCODING",
      "Les fichiers XML doivent utiliser UTF-8.",
    );
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new DatasetError("UNSAFE_XML", "DTD et entités XML interdites.");
  return xml;
}
