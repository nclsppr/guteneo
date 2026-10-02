import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getDefaultFont } from "@pdfme/common";
export async function loadTemplateScript() {
  const coverage = JSON.parse(
    await readFile(
      new URL("../../packages/templates/font-coverage.json", import.meta.url),
      "utf8",
    ),
  );
  const data = Object.values(getDefaultFont())[0].data;
  const bytes =
    typeof data === "string"
      ? Buffer.from(data.replace(/^data:[^,]*,/, ""), "base64")
      : Buffer.from(data);
  if (createHash("sha256").update(bytes).digest("hex") !== coverage.fontSha256)
    throw new Error("TEMPLATE_FONT_HASH_MISMATCH");
  const result = await build({
    entryPoints: [
      new URL("./src/template-browser.ts", import.meta.url).pathname,
    ],
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
    minify: true,
    write: false,
    legalComments: "inline",
  });
  return result.outputFiles[0].text;
}
