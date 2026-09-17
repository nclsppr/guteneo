import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadPdfScripts } from "../apps/documents/pdfjs-assets.mjs";
import { Readable } from "node:stream";
import bundledChromium from "@sparticuz/chromium";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { tsImport } from "tsx/esm/api";
const { handleExpertReviewPages } = await tsImport(
  "../apps/documents/src/expert-review.ts",
  import.meta.url,
);
const reviewScripts = await loadPdfScripts();
const fallback =
  process.platform === "linux" && !existsSync(chromium.executablePath());
const port = Number(process.env.GUTENEO_LOCAL_RENDERER_PORT ?? 8788);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local renderer port");
const browser = await chromium.launch(
  fallback
    ? {
        headless: true,
        args: bundledChromium.args.filter(
          (a) =>
            !a.includes("single-process") &&
            !a.includes("allow-running-insecure-content") &&
            !a.includes("disable-web-security") &&
            !a.includes("disable-site-isolation-trials") &&
            !a.startsWith("--disable-features="),
        ),
        executablePath: await bundledChromium.executablePath(),
      }
    : { headless: true },
);
let active = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (
    req.method !== "POST" ||
    !["/render", "/review-pages"].includes(url.pathname)
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (active >= 2) {
    res.writeHead(429);
    res.end("Renderer busy");
    return;
  }
  active++;
  let context;
  try {
    if (url.pathname === "/review-pages") {
      const controller = new AbortController();
      req.once("aborted", () => controller.abort());
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value))
          for (const item of value) headers.append(key, item);
        else if (value !== undefined) headers.set(key, value);
      }
      const result = await handleExpertReviewPages(
        new Request(url, {
          method: "POST",
          headers,
          body: Readable.toWeb(req),
          duplex: "half",
          signal: controller.signal,
        }),
        {
          launch: async () =>
            puppeteer.launch({
              executablePath: fallback
                ? await bundledChromium.executablePath()
                : chromium.executablePath(),
              headless: true,
              ...(fallback
                ? {
                    args: bundledChromium.args.filter(
                      (arg) =>
                        !arg.includes("single-process") &&
                        !arg.includes("allow-running-insecure-content") &&
                        !arg.includes("disable-web-security") &&
                        !arg.includes("disable-site-isolation-trials") &&
                        !arg.startsWith("--disable-features="),
                    ),
                  }
                : {}),
            }),
          scripts: reviewScripts,
        },
      );
      res.writeHead(result.status, {
        ...Object.fromEntries(result.headers),
        "X-Guteneo-Renderer": "local-chromium-simulation",
      });
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 262144) throw new Error("Size limit");
    }
    const { html } = JSON.parse(text);
    if (typeof html !== "string") throw new Error("Invalid HTML");
    context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 15000,
    });
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "X-Guteneo-Renderer": "local-chromium-simulation",
    });
    res.end(pdf);
  } catch {
    res.writeHead(422);
    res.end("PDF rendering failed");
  } finally {
    if (context) await context.close();
    active--;
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Guteneo local PDF renderer at 127.0.0.1:${port} (Simulation; not Browser Run)`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    server.close();
    await browser.close();
    process.exit(0);
  });
