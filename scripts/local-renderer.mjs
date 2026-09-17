import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import bundledChromium from "@sparticuz/chromium";
const fallback =
  process.platform === "linux" && !existsSync(chromium.executablePath());
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
  if (req.method !== "POST" || req.url !== "/render") {
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
server.listen(8788, "127.0.0.1", () =>
  console.log(
    "Guteneo local PDF renderer at 127.0.0.1:8788 (Simulation; not Browser Run)",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    server.close();
    await browser.close();
    process.exit(0);
  });
