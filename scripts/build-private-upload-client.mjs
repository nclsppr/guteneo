import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL(
  "../integrations/guteneo/scripts/upload-private-pdf.py",
  import.meta.url,
);
const output = new URL(
  "../packages/contracts/src/private-upload-client.json",
  import.meta.url,
);
const code = await readFile(source, "utf8");
const expected =
  JSON.stringify(
    {
      language: "python3",
    runtime: "POSIX Python 3.9+ (Linux/macOS); native Windows is unsupported",
      sha256: createHash("sha256").update(code).digest("hex"),
      code,
    },
    null,
    2,
  ) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== expected)
    throw new Error(
      "Private upload client is stale. Run node scripts/build-private-upload-client.mjs.",
    );
} else await writeFile(output, expected);
console.log(
  `Private upload client ${process.argv.includes("--check") ? "checked" : "generated"}: ${fileURLToPath(output)}`,
);
