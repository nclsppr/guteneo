import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildMcpDocumentUploadResource } from "../../scripts/build-mcp-document-upload.mjs";
import { buildMcpUiProbeResource } from "../../scripts/build-mcp-ui-probe.mjs";

test("the upload resource is reproducible, self-contained and immutable by digest", async () => {
  const { text, manifest } = await buildMcpDocumentUploadResource({
    check: true,
  });
  const second = await buildMcpDocumentUploadResource({ check: true });
  assert.equal(text, second.text);
  assert.equal(manifest.bytes, Buffer.byteLength(text));
  const digest = createHash("sha256").update(text).digest("hex");
  assert.equal(manifest.sha256, digest);
  assert.equal(manifest.path, "/mcp-document-upload/v1.txt");
  assert.equal(
    manifest.resourceUri,
    `ui://guteneo/mcp-document-upload/v1/${digest}.html`,
  );
  assert.ok(manifest.bytes <= 700_000);
  assert.doesNotMatch(text, /<(?:script|link|img|iframe)[^>]+(?:src|href)=/i);
  for (const policy of [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "font-src 'none'",
  ])
    assert.ok(text.includes(policy));
  for (const tag of ["script", "style"]) {
    const contents = text.match(
      new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`),
    )?.[1];
    assert.ok(contents);
    const hash = createHash("sha256").update(contents).digest("base64");
    assert.ok(text.includes(`${tag}-src 'sha256-${hash}'`));
  }
  // Adding this App must not invalidate or silently rewrite the qualified probe.
  const probe = await buildMcpUiProbeResource({ check: true });
  assert.equal(probe.manifest.bytes, 481608);
  assert.equal(
    probe.manifest.sha256,
    "fcff8c22af2379bed109ec54b667237b68d193ef4e9380dfb96459873803ecc0",
  );
});

test("the new distribution retains every complete notice from the existing authoritative provenance", async () => {
  const root = new URL("../../apps/mcp-ui-probe/licenses/", import.meta.url);
  const provenance = JSON.parse(
    await readFile(new URL("provenance.json", root), "utf8"),
  );
  const { text } = await buildMcpDocumentUploadResource({ check: true });
  const block = text.match(
    /<script type="text\/plain" id="guteneo-third-party-notices">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(block);
  assert.equal(provenance.notices.length, 7);
  for (const notice of provenance.notices) {
    const bytes = await readFile(new URL(notice.file, root));
    assert.equal(bytes.length, notice.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      notice.sha256,
    );
    assert.ok(
      block.includes(bytes.toString("utf8")),
      `Complete unchanged runtime notice: ${notice.file}`,
    );
  }
  assert.ok(block.includes("Colin McDonnell"));
});

test("the client has only the standard App bridge and volatile original state", async () => {
  const source = await readFile(
    new URL("../../apps/mcp-document-upload/client.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /caches\./,
    /console\./,
    /sendLog\(/,
    /sendMessage\(/,
    /innerHTML\s*=/,
    /createObjectURL/,
  ])
    assert.doesNotMatch(source, forbidden);
  assert.match(source, /app\.callServerTool/);
  assert.match(source, /timeout: 15_000/);
  assert.match(source, /original\?\.fill\(0\)/);
  assert.match(
    source,
    /structuredContent:\s*\{\s*documentId:\s*next\.document\.id,\s*status:\s*next\.document\.status,\s*size:\s*originalSize,\s*sha256:\s*originalSha,?\s*\}/,
  );
  assert.doesNotMatch(source, /content:\s*\[|role:\s*["'](?:user|assistant)/);
});
