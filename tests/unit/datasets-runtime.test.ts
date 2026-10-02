import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { describe, expect, it } from "vitest";
import { customerSheets, makeWorkbook } from "./datasets-fixtures";

describe("data parsing in actual local workerd (no hosted qualification)", () => {
  it("profiles XLSX and XML sources in the Cloudflare-compatible isolate without a DOM or Node imports", async () => {
    const bundle = await build({
      stdin: {
        contents: `import { profileDataset } from './packages/data/profile'; export default { async fetch(request) { const format = new URL(request.url).pathname.endsWith('/xml') ? 'xml' : 'xlsx'; const profile = await profileDataset(new Uint8Array(await request.arrayBuffer()), format); return Response.json({ runtime: { document: typeof document, process: typeof process }, profile }); } };`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      target: "es2022",
    });
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-09-16",
      }),
    );
    try {
      const response = await runtime.dispatchFetch(
        "https://data.test/profile",
        { method: "POST", body: makeWorkbook(customerSheets) },
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        runtime: { document: string; process: string };
        profile: { sheets: Array<{ name: string }> };
      };
      expect(result.runtime.document).toBe("undefined");
      expect(result.profile.sheets.map((sheet) => sheet.name)).toEqual([
        "Clients",
        "Articles",
      ]);
      const xmlResponse = await runtime.dispatchFetch(
        "https://data.test/profile/xml",
        {
          method: "POST",
          body: '<clients><client id="0001"><postal>00120</postal><amount>9007199254740993.001</amount></client></clients>',
        },
      );
      expect(xmlResponse.status).toBe(200);
      const xml = (await xmlResponse.json()) as {
        runtime: { document: string };
        profile: {
          format: string;
          sheets: Array<{ rows: Array<{ cells: Array<{ raw: string }> }> }>;
        };
      };
      expect(xml.runtime.document).toBe("undefined");
      expect(xml.profile.format).toBe("xml");
      expect(
        xml.profile.sheets[0].rows[1].cells.map((cell) => cell.raw),
      ).toEqual(["00120", "9007199254740993.001", "0001"]);
    } finally {
      await runtime.dispose();
    }
  });
});
