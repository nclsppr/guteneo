import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { buildMcpUiProbeResource } from "../../scripts/build-mcp-ui-probe.mjs";

test("SDK fixture renders four locales and bridges once without files or external requests", async (t) => {
  await mkdir(new URL("../../reports/mcp-ui-probe/", import.meta.url), {
    recursive: true,
  });
  const { text: html } = await buildMcpUiProbeResource({ check: true });
  const host = await build({
    stdin: {
      contents: `import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.querySelector('iframe');
const settings = new URLSearchParams(location.search);
window.calls = [];
const bridge = new AppBridge(null, {name:'synthetic-host',version:'1'}, {serverTools:{}}, {hostContext:{locale:settings.get('locale'),theme:settings.get('theme')}});
bridge.oncalltool = async (params) => { window.calls.push(params); return {content:[],structuredContent:{ok:true,data:{probe:'guteneo-mcp-ui-v1',bridge:'available',contentAccess:false}}}; };
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = '/probe';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    minify: true,
    format: "esm",
    target: "es2022",
  });
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Content-Type", "text/html");
    res.end(
      req.url === "/probe"
        ? html
        : `<!doctype html><iframe sandbox="allow-scripts allow-same-origin" title="Synthetic host diagnostic" width="380" height="650"></iframe><script type="module">${host.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const measurements = [];
  for (const [locale, title] of [
    ["en", "Host diagnostic"],
    ["fr", "Diagnostic de l’hôte"],
    ["de", "Host-Diagnose"],
    ["lb", "Host-Diagnos"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 430, height: 800 },
      locale,
    });
    const external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(
      `${origin}/?locale=${locale}&theme=${locale === "fr" ? "dark" : "light"}`,
    );
    const frame = page.frameLocator("iframe");
    await frame.locator("#check").waitFor({ state: "visible" });
    await frame.locator("#check").evaluate(async (button) => {
      for (let i = 0; button.disabled && i < 100; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(await frame.locator("h1").textContent(), title);
    assert.equal(await frame.locator("#check").isEnabled(), true);
    assert.equal(await frame.locator("#picker").isDisabled(), true);
    const measurement = await frame.locator("body").evaluate(
      (body, locale) => ({
        locale,
        firstUsefulContentObservedMs: performance.now(),
        domContentLoadedMs:
          performance.getEntriesByType("navigation")[0]
            .domContentLoadedEventEnd,
        horizontalOverflow: body.scrollWidth > innerWidth,
      }),
      locale,
    );
    await frame.locator("#check").click();
    await frame.locator("#picker").evaluate(async (button) => {
      for (let i = 0; button.disabled && i < 100; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(await frame.locator("#picker").isEnabled(), true);
    const calls = await page.evaluate(() => window.calls);
    assert.deepEqual(
      calls.map(({ name, arguments: args }) => ({ name, arguments: args })),
      [{ name: "check_mcp_ui_probe_bridge", arguments: {} }],
    );
    assert.deepEqual(Object.keys(calls[0]._meta ?? {}), ["progressToken"]);
    assert.equal(typeof calls[0]._meta.progressToken, "number");
    assert.equal(await frame.locator("#check").isDisabled(), true);
    await frame.locator("#file").evaluate((input) => {
      Object.defineProperty(input, "files", {
        get() {
          throw new Error("File inspection forbidden");
        },
      });
      input.dispatchEvent(new Event("change"));
    });
    assert.equal(await frame.locator("#file").inputValue(), "");
    assert.equal(await frame.locator("html").getAttribute("lang"), locale);
    measurements.push(measurement);
    assert.equal(measurements.at(-1).horizontalOverflow, false);
    assert.deepEqual(external, []);
    if (locale === "en" || locale === "fr") {
      await page.screenshot({
        path: new URL(
          `../../reports/mcp-ui-probe/${locale}.png`,
          import.meta.url,
        ).pathname,
      });
    }
    await context.close();
  }
  const record = {
    environment:
      "Local Chromium, official SDK AppBridge fixture, loopback, four fresh contexts; no actual Claude or physical device",
    htmlBytes: Buffer.byteLength(html),
    gzipBytes: gzipSync(html).length,
    brotliBytes: brotliCompressSync(html).length,
    widgetResourceRequests: requests.filter((x) => x === "/probe").length,
    externalRequests: 0,
    measurements,
    note: "First useful content was observed after local SDK handshake, before the bridge click; it includes test-driver observation overhead and is not a production performance gain. API presence and synthetic selection event are not actual file-picker/attachment proof.",
  };
  await mkdir(new URL("../../reports/mcp-ui-probe/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(
      "../../reports/mcp-ui-probe/browser-measurements.private.json",
      import.meta.url,
    ),
    JSON.stringify(record, null, 2) + "\n",
  );
});
