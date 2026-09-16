import puppeteer from "@cloudflare/puppeteer";
import { printableHtml, LIMITS } from "../../../packages/contracts/src/content";
import { validatePdf } from "../../../packages/contracts/src/pdf";
interface DocumentEnv {
  BROWSER: Fetcher;
}
/** Service-binding-only worker; no public route or account secrets exposed. */
export default {
  async fetch(request: Request, env: DocumentEnv): Promise<Response> {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/validate"
    ) {
      if (Number(request.headers.get("Content-Length") ?? 0) > LIMITS.pdfBytes)
        return new Response("Too large", { status: 413 });
      const bytes = new Uint8Array(await request.arrayBuffer());
      try {
        return Response.json(await validatePdf(bytes));
      } catch {
        return new Response("Rejected PDF", { status: 422 });
      }
    }
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/render"
    )
      return new Response("Not found", { status: 404 });
    const raw = await request.text();
    if (raw.length > LIMITS.htmlBytes * 2)
      return new Response("Too large", { status: 413 });
    const { html } = JSON.parse(raw) as { html: string };
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        void req.abort("blockedbyclient");
      });
      page.setDefaultTimeout(15000);
      await page.setContent(printableHtml(html), {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      return new Response(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf" },
      });
    } finally {
      await browser.close();
    }
  },
};
