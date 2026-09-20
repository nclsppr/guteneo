import { readFile } from "node:fs/promises";

// Exact resources provided by the lockfile-pinned PDF.js package. No discovery
// from document input, URL construction at runtime, CDN or extra dependency.
const fontNames = [
  "FoxitDingbats.pfb",
  "FoxitFixed.pfb",
  "FoxitFixedBold.pfb",
  "FoxitFixedBoldItalic.pfb",
  "FoxitFixedItalic.pfb",
  "FoxitSerif.pfb",
  "FoxitSerifBold.pfb",
  "FoxitSerifBoldItalic.pfb",
  "FoxitSerifItalic.pfb",
  "FoxitSymbol.pfb",
  "LiberationSans-Bold.ttf",
  "LiberationSans-BoldItalic.ttf",
  "LiberationSans-Italic.ttf",
  "LiberationSans-Regular.ttf",
];

export async function loadPdfScripts() {
  const packageRoot = new URL(
    "../../node_modules/pdfjs-dist/",
    import.meta.url,
  );
  const fonts = {};
  let bytes = 0;
  for (const name of fontNames) {
    const content = await readFile(
      new URL(`standard_fonts/${name}`, packageRoot),
    );
    bytes += content.length;
    if (!content.length || content.length > 256 * 1024 || bytes > 1024 * 1024)
      throw new Error("PDF_STANDARD_FONT_ASSET_BUDGET");
    fonts[name] = content.toString("base64");
  }
  const licenses = await Promise.all(
    ["LICENSE_FOXIT", "LICENSE_LIBERATION"].map(async (name) => {
      const notice = await readFile(
        new URL(`standard_fonts/${name}`, packageRoot),
        "utf8",
      );
      return `// ${name}\n${notice
        .split("\n")
        .map((line) => `// ${line}`)
        .join("\n")}`;
    }),
  );
  return {
    // The address page embeds the same pinned, redistributable font locally.
    // Its license is retained in standard-fonts below; no system font or CDN.
    addressFont: fonts["LiberationSans-Regular.ttf"],
    pdf: await readFile(
      new URL("legacy/build/pdf.min.mjs", packageRoot),
      "utf8",
    ),
    worker: await readFile(
      new URL("legacy/build/pdf.worker.min.mjs", packageRoot),
      "utf8",
    ),
    // This code is injected as Text, never transformed into a Worker closure.
    // PDF.js owns its per-document cache; decode only the requested font.
    fonts: `${licenses.join("\n")}
globalThis.guteneoStandardFonts = Object.freeze(${JSON.stringify(fonts)});
globalThis.guteneoBinaryDataFactory = class {
  async fetch({ kind, filename }) {
    const fonts = globalThis.guteneoStandardFonts;
    if (kind !== "standardFontDataUrl" || !Object.hasOwn(fonts, filename))
      throw new Error("PDF_RESOURCE_UNAVAILABLE");
    const binary = atob(fonts[filename]);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      data[index] = binary.charCodeAt(index);
    return data;
  }
};
`,
  };
}
