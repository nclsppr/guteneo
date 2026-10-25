import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("workerd preserves safe email buttons and localized document templates without remote resources", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "guteneo-email-runtime-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const entry = join(temp, "entry.mjs");
  await writeFile(
    entry,
    `
    import { cleanEmailHtml } from ${JSON.stringify(join(root, "packages/contracts/src/content.ts"))};
    import { documentEmailDefaults, renderTransactionalEmail } from ${JSON.stringify(join(root, "packages/contracts/src/email-template.ts"))};
    export default { fetch() {
      const document = { url: "https://guteneo.example/share/synthetic?lang=fr", expiresAt: "2026-04-01T00:30:00.000Z" };
      const custom = cleanEmailHtml('<p>Message</p><a href="{{document_url}}" style="background-color:#2450db;color:#ffffff;padding:12px;position:fixed;background-image:url(https://tracker.invalid/pixel)">Open</a><img src="https://tracker.invalid/pixel"><script>alert(1)</script>', { documentUrl: document.url }).html;
      const templates = Object.fromEntries(["fr", "en", "de", "lb"].map(locale => {
        const defaults = documentEmailDefaults("Fixture & Workspace", "protected_link", locale);
        return [locale, cleanEmailHtml(renderTransactionalEmail({ text: defaults.text, workspaceName: "Fixture & Workspace", locale, protectedDocument: document })).html];
      }));
      return Response.json({ custom, templates });
    }};
  `,
  );
  await build({
    configFile: false,
    logLevel: "silent",
    ssr: { target: "webworker", noExternal: true },
    build: {
      ssr: entry,
      outDir: join(temp, "compiled"),
      target: "es2022",
      rolldownOptions: {
        external: [/^node:/],
        output: { entryFileNames: "worker.js" },
      },
    },
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(temp, "compiled/worker.js"), "utf8"),
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat"],
    }),
  );
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch("https://runtime.example.invalid/");
  assert.equal(response.status, 200);
  const { custom, templates } = await response.json();
  assert.match(
    custom,
    /href="https:\/\/guteneo\.example\/share\/synthetic\?lang=fr"/,
  );
  assert.match(custom, /background-color:#2450db;color:#ffffff;padding:12px/);
  assert.doesNotMatch(
    custom,
    /tracker|position:|<img|<script|\{\{document_url\}\}/,
  );
  for (const [locale, expiry] of Object.entries({
    fr: "1 avril 2026",
    en: "April 1, 2026",
    de: "1. April 2026",
    lb: "1. Abrëll 2026",
  })) {
    assert.ok(templates[locale].includes(expiry), locale);
    assert.match(templates[locale], /Fixture &amp; Workspace/);
    assert.match(templates[locale], />guteneo<\/p>/);
    assert.match(templates[locale], /background-color:#181b22/);
    assert.equal((templates[locale].match(/<a /g) ?? []).length, 1);
    assert.doesNotMatch(templates[locale], /<img|<script|<style|<iframe/);
  }
});
