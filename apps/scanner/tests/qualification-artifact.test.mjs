import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  downloadQualification,
  resultFromZip,
} from "../scripts/qualification-artifact.mjs";

const zip = (files) =>
  execFileSync(
    "python3",
    [
      "-c",
      `
import io, json, sys, zipfile
out = io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, value in json.load(sys.stdin): archive.writestr(name, value)
sys.stdout.buffer.write(out.getvalue())
`,
    ],
    {
      input: JSON.stringify(files),
      maxBuffer: 2_000_000,
      stdio: ["pipe", "pipe", "ignore"],
    },
  );
const result = { status: "qualified", version: "synthetic-version" };
const archive = zip([["result.json", JSON.stringify(result)]]);
const artifact = {
  id: 456,
  size_in_bytes: archive.length,
  digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
};

test("reads only the bounded root result without extracting paths or accepting duplicate entries", () => {
  assert.deepEqual(resultFromZip(archive), result);
  for (const malformed of [
    Buffer.from("not a zip"),
    Buffer.alloc(2_000_001),
    zip([["../result.json", JSON.stringify(result)]]),
    zip([
      ["result.json", "{}"],
      ["result.json", "{}"],
    ]),
    zip([["result.json", "x".repeat(65_537)]]),
    zip([["result.json", "invalid JSON"]]),
  ])
    assert.throws(
      () => resultFromZip(malformed),
      /SCANNER_QUALIFICATION_ARTIFACT_INVALID/,
    );
});

test("downloads the exact artifact with bounded data, digest verification and no forwarded bearer", async () => {
  const calls = [];
  const proof = await downloadQualification(
    artifact,
    "synthetic-token",
    async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? new Response(null, {
            status: 302,
            headers: {
              location:
                "https://productionresultssa1.blob.core.windows.net/artifact?sig=synthetic",
            },
          })
        : new Response(archive);
    },
  );
  assert.deepEqual(proof, result);
  assert.equal(
    calls[0].url,
    "https://api.github.com/repos/nclsppr/guteneo/actions/artifacts/456/zip",
  );
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer synthetic-token",
  );
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[1].options.headers, undefined);
  assert.equal(calls[1].options.redirect, "error");
});

test("rejects unrelated redirect targets, oversized downloads and archive checksum mismatch", async () => {
  for (const location of [
    "http://production.blob.core.windows.net/a",
    "https://attacker.example/a",
    "https://blob.core.windows.net.attacker.example/a",
    "https://user:secret@production.blob.core.windows.net/a",
  ]) {
    let calls = 0;
    await assert.rejects(
      downloadQualification(artifact, "synthetic-token", async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location } });
      }),
      /SCANNER_QUALIFICATION_ARTIFACT_INVALID/,
    );
    assert.equal(calls, 1);
  }
  for (const body of [Buffer.alloc(2_000_001), Buffer.from("changed")]) {
    let calls = 0;
    await assert.rejects(
      downloadQualification(artifact, "synthetic-token", async () =>
        ++calls === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location: "https://production.blob.core.windows.net/a",
              },
            })
          : new Response(body),
      ),
      /SCANNER_QUALIFICATION_ARTIFACT_INVALID/,
    );
  }
});
