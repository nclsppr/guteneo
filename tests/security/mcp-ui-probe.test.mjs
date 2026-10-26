import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  cp,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildMcpUiProbeResource } from "../../scripts/build-mcp-ui-probe.mjs";
import {
  sourceSnapshot,
  releaseProfiles,
} from "../../scripts/release-source.mjs";

test("diagnostic resource is reproducible, inert to files/network and constrained by CSP", async () => {
  execFileSync(
    process.execPath,
    ["scripts/build-mcp-ui-probe.mjs", "--check"],
    { cwd: new URL("../../", import.meta.url), stdio: "pipe" },
  );
  const client = await readFile(
    new URL("../../apps/mcp-ui-probe/client.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    /\.files\b/,
    /FileReader/,
    /arrayBuffer\s*\(/,
    /readAs/,
    /DataTransfer/,
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /localStorage/,
    /sessionStorage/,
    /console\./,
    /sendLog\(/,
    /updateModelContext\(/,
    /file_name|fileName|base64|capabilityHeader|uploadId/,
  ])
    assert.doesNotMatch(client, forbidden);
  assert.match(
    client,
    /callServerTool\(\{\s*name: "check_mcp_ui_probe_bridge",\s*arguments: \{\},?\s*\}\)/,
  );
  assert.match(client, /input\.value = ""/);
  const { text: html, manifest } = await buildMcpUiProbeResource({
    check: true,
  });
  const digest = createHash("sha256").update(html).digest("hex");
  assert.equal(
    manifest.resourceUri,
    `ui://guteneo/mcp-ui-probe/v1/${digest}.html`,
  );
  assert.equal(manifest.sha256, digest);
  for (const policy of [
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "font-src 'none'",
  ])
    assert.ok(html.includes(policy));
  assert.doesNotMatch(html, /<(?:script|link|img|iframe)[^>]+(?:src|href)=/i);
  for (const [tag, attribute] of [
    ["script", "script-src"],
    ["style", "style-src"],
  ]) {
    const contents = html.match(
      new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`),
    )[1];
    const digest = createHash("sha256").update(contents).digest("base64");
    assert.ok(html.includes(`${attribute} 'sha256-${digest}'`));
  }
  assert.ok(Buffer.byteLength(html) < 700_000);
});

test("the self-contained resource retains complete vendored and copied-code notices", async () => {
  const root = new URL("../../apps/mcp-ui-probe/licenses/", import.meta.url);
  const provenance = JSON.parse(
    await readFile(new URL("provenance.json", root), "utf8"),
  );
  assert.deepEqual(
    provenance.notices.map((notice) => notice.file),
    [
      "modelcontextprotocol.LICENSE.txt",
      "zod-4.3.5.LICENSE.txt",
      "content-type-1.0.5.LICENSE.txt",
      "cfworker-4.1.1.LICENSE.txt",
      "ajv-v6.12.6.LICENSE.txt",
      "schemasafe-cf781264.LICENSE.txt",
      "diego-perini.LICENSE-notice.txt",
    ],
  );
  const { text } = await buildMcpUiProbeResource({ check: true });
  const block = text.match(
    /<script type="text\/plain" id="guteneo-third-party-notices">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(block, "Notices must remain non-executable resource text");
  for (const notice of provenance.notices) {
    const bytes = await readFile(new URL(notice.file, root));
    assert.equal(bytes.length, notice.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      notice.sha256,
    );
    assert.ok(
      block.includes(bytes.toString("utf8")),
      `Incomplete notice: ${notice.file}`,
    );
  }
  for (const author of [
    "Colin McDonnell",
    "Douglas Christopher Wilson",
    "Jeremy Danyow",
    "Evgeny Poberezkin",
    "Diego Perini",
    "Mathias Buus",
    "Exodus Movement",
  ])
    assert.ok(block.includes(author), `Missing attribution: ${author}`);
});

test("unreviewed prebundle and notice changes stop generation", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "guteneo-probe-notices-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, "scripts"));
  await cp(
    new URL("../../scripts/build-mcp-ui-probe.mjs", import.meta.url),
    join(fixture, "scripts/build-mcp-ui-probe.mjs"),
  );
  await cp(
    new URL("../../apps/mcp-ui-probe/licenses/", import.meta.url),
    join(fixture, "apps/mcp-ui-probe/licenses"),
    { recursive: true },
  );
  await symlink(
    new URL("../../node_modules/", import.meta.url).pathname,
    join(fixture, "node_modules"),
    "dir",
  );
  const manifestPath = join(
    fixture,
    "apps/mcp-ui-probe/licenses/provenance.json",
  );
  const original = await readFile(manifestPath, "utf8");
  const provenance = JSON.parse(original);
  provenance.sdk.sha256 = "0".repeat(64);
  await writeFile(manifestPath, JSON.stringify(provenance));
  const run = () =>
    execFileSync(
      process.execPath,
      [join(fixture, "scripts/build-mcp-ui-probe.mjs"), "--check"],
      { stdio: "pipe" },
    );
  assert.throws(run, /SDK provenance changed/);
  await writeFile(manifestPath, original);
  await writeFile(
    join(fixture, "apps/mcp-ui-probe/licenses/zod-4.3.5.LICENSE.txt"),
    "Truncated notice",
  );
  assert.throws(run, /notice integrity changed/);
});

test("live and preview release snapshots cover every diagnostic build input", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "guteneo-probe-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const paths = [
    "apps/mcp-ui-probe/client.ts",
    "apps/mcp-ui-probe/locales/index.ts",
    "scripts/build-mcp-ui-probe.mjs",
    "scripts/build-mcp-ui-probe.d.mts",
    "apps/web/vite.config.ts",
    "packages/contracts/src/mcp-ui-probe-resource.json",
    "package.json",
    "package-lock.json",
  ];
  for (const path of paths) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), "initial");
  }
  for (const profile of Object.values(releaseProfiles)) {
    let previous = await sourceSnapshot(root, profile.scope);
    for (const path of paths) {
      await writeFile(join(root, path), "changed " + previous);
      const current = await sourceSnapshot(root, profile.scope);
      assert.notEqual(current, previous, path);
      previous = current;
    }
  }
});
