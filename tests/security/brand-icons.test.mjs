import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertBrandIcons,
  brandIconFiles,
  copyBrandIcons,
  publicFaviconUrl,
} from "../../scripts/brand-icons.mjs";
import { BRANDING } from "../../scripts/setup-auth0-branding.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("status copies and engineering retain the exact product icon family", async (context) => {
  const output = await mkdtemp(join(tmpdir(), "guteneo-brand-icons-"));
  context.after(() => rm(output, { recursive: true, force: true }));
  await copyBrandIcons(root, output);
  await assertBrandIcons(root, output);
  await assertBrandIcons(root, join(root, "apps/engineering/public"));
  await writeFile(join(output, "favicon.svg"), "Unapproved replacement");
  await assert.rejects(
    assertBrandIcons(root, output),
    /Brand icon differs from guteneo.com: favicon.svg/,
  );
});

test("the product, status and Auth0 select the same approved favicon", async () => {
  const favicon = new URL(publicFaviconUrl);
  assert.equal(favicon.origin, "https://guteneo.com");
  assert.equal(BRANDING.favicon_url, publicFaviconUrl);
  for (const [surface, path] of [
    ["web", "apps/web/index.html"],
    ["status", "apps/status/public/index.html"],
  ]) {
    const html = await readFile(join(root, path), "utf8");
    assert.ok(html.includes(`href="${favicon.pathname}${favicon.search}"`));
    for (const name of brandIconFiles)
      assert.ok(html.includes(`/${name}`), `${surface} is missing ${name}`);
  }
});
