// Local qualification only: never deploy this helper. Its configuration has no
// provider, database or object-storage binding. No user input becomes PDF data.
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPTIONS = Object.freeze({
  defaultCountry: "LU",
  country: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
});
const ADDRESS = ["ATELIER EXEMPLE", "Rue du Test 12", "L-1234 LUXEMBOURG"];
const HASH = /^[a-f0-9]{64}$/;
const SAFE_CODES = new Set([
  "POSTAL_CORNER_CONTENT",
  "POSTAL_RENDER_HASH_MISMATCH",
  "POSTAL_PDF_INVALID",
  "POSTAL_RENDER_TIMEOUT",
  "POSTAL_RENDER_FAILED",
  "POSTAL_PDF_SIZE",
  "POSTAL_ADDRESS_EMPTY",
  "POSTAL_ADDRESS_INVALID",
  "POSTAL_PDF_DECODE_WARNING",
  "POSTAL_PREFLIGHT_INPUT_INVALID",
  "POSTAL_OPTIONS_INVALID",
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
class QualificationError extends Error {
  constructor(code, details) {
    super(code);
    this.code = code;
    this.details = details;
  }
}
const fail = (code) => {
  throw new QualificationError(code);
};

export async function privateJson(
  binding,
  path,
  init = {},
  { timeoutMs = 30_000, maximumBytes = 2_000_000 } = {},
) {
  // The helper cannot be repurposed into an arbitrary remote proxy.
  if (
    !["/health", "/scan", "/preflight/pingen"].includes(path) ||
    (path === "/health"
      ? (init.method ?? "GET") !== "GET"
      : init.method !== "POST")
  )
    fail("QUALIFICATION_PATH_INVALID");
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new QualificationError("QUALIFICATION_TIMEOUT"));
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await binding.fetch(
      `https://qualification.internal${path}`,
      {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      },
    );
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      fail("QUALIFICATION_REDIRECT_FORBIDDEN");
    }
    if (!response.body) fail("QUALIFICATION_RESPONSE_INVALID");
    const reader = response.body.getReader();
    const abort = () => {
      void reader.cancel().catch(() => undefined);
    };
    controller.signal.addEventListener("abort", abort, { once: true });
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        if (controller.signal.aborted) fail("QUALIFICATION_TIMEOUT");
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > maximumBytes) fail("QUALIFICATION_RESPONSE_TOO_LARGE");
        chunks.push(chunk.value);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        fail("QUALIFICATION_RESPONSE_INVALID");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        fail("QUALIFICATION_RESPONSE_INVALID");
      return { status: response.status, body };
    } finally {
      controller.signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  })();
  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (error instanceof QualificationError) throw error;
    fail("QUALIFICATION_TRANSPORT_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeReport(name, response, expectedHash) {
  const report = response.body;
  const pages = report.rendering?.pages;
  const cleanPages =
    Array.isArray(pages) && pages.length <= 100
      ? pages.map((page) => ({
          page: Number.isSafeInteger(page?.page) ? page.page : null,
          width: Number.isSafeInteger(page?.width) ? page.width : null,
          height: Number.isSafeInteger(page?.height) ? page.height : null,
          rasterHashPresent:
            typeof page?.rasterSha256 === "string" &&
            HASH.test(page.rasterSha256),
        }))
      : [];
  const issues =
    Array.isArray(report.issues) && report.issues.length <= 200
      ? report.issues.map((issue) => ({
          code: SAFE_CODES.has(issue?.code) ? issue.code : "UNRECOGNIZED_ISSUE",
          ...(Number.isSafeInteger(issue?.page) &&
          issue.page > 0 &&
          issue.page <= 100
            ? { page: issue.page }
            : {}),
        }))
      : [{ code: "INVALID_ISSUES" }];
  return {
    case: name,
    httpStatus: response.status,
    diagnosticStage: [
      "read",
      "structure",
      "budget",
      "launch",
      "new_page",
      "isolation",
      "navigation",
      "worker_script",
      "pdf_script",
      "open",
      "open_library",
      "open_worker",
      "open_crypto",
      "open_promise_resolvers",
      "open_promise_try",
      "open_map_insert",
      "open_base64",
      "render",
      "raster",
      "address",
    ].includes(report.diagnostic?.stage)
      ? report.diagnostic.stage
      : null,
    status: ["blocked", "review_required"].includes(report.status)
      ? report.status
      : "invalid",
    canSend: report.canSend === false ? false : "invalid",
    hashMatches: report.sha256 === expectedHash,
    hashAbsent: report.sha256 === null,
    complete: report.rendering?.complete === true,
    dpi: report.rendering?.dpi === 144 ? 144 : null,
    pages: cleanPages,
    issues,
    // Never print the address, its geometry, crop, engine diagnostics or hashes.
    addressMatchesFixture:
      JSON.stringify(report.address?.lines) === JSON.stringify(ADDRESS),
    addressCropPresent:
      typeof report.address?.crop?.pngBase64 === "string" &&
      report.address.crop.pngBase64.startsWith("iVBOR") &&
      report.address.crop.pngBase64.length < 1_000_000,
    reviewStillRequired:
      Array.isArray(report.requiredReviews) &&
      report.requiredReviews.includes("printed_recipient_matches"),
  };
}

function completePages(summary) {
  return (
    summary.complete &&
    summary.dpi === 144 &&
    summary.pages.length === 2 &&
    summary.pages.every(
      (p, index) =>
        p.page === index + 1 &&
        p.width >= 1190 &&
        p.height >= 1683 &&
        p.width * p.height <= 2_100_000 &&
        p.rasterHashPresent,
    )
  );
}
function passes(summary) {
  if (
    summary.httpStatus !== 200 ||
    summary.canSend !== false ||
    (summary.case === "truncated_pdf"
      ? !summary.hashAbsent
      : !summary.hashMatches)
  )
    return false;
  if (summary.case === "clean_two_pages")
    return (
      summary.status === "review_required" &&
      completePages(summary) &&
      summary.issues.length === 0 &&
      summary.addressMatchesFixture &&
      summary.addressCropPresent &&
      summary.reviewStillRequired
    );
  if (summary.case === "reserved_corner_page_two")
    return (
      summary.status === "blocked" &&
      completePages(summary) &&
      summary.issues.some(
        (i) => i.code === "POSTAL_CORNER_CONTENT" && i.page === 2,
      )
    );
  const code =
    summary.case === "wrong_source_hash"
      ? "POSTAL_RENDER_HASH_MISMATCH"
      : "POSTAL_PDF_INVALID";
  return (
    summary.status === "blocked" &&
    !summary.complete &&
    summary.pages.length === 0 &&
    summary.issues.some((i) => i.code === code)
  );
}

export async function qualifyPostalPreflight(
  env,
  fixtures,
  { timeoutMs = 30_000, healthRetryDelayMs = 30_000 } = {},
) {
  // Only synthetic bytes created by this program are supplied by the CLI.
  let ready = false;
  let healthRequests = 0;
  const healthResults = [];
  for (; healthRequests < 3 && !ready; healthRequests++) {
    try {
      const health = await privateJson(
        env.SCANNER,
        "/health",
        {},
        { timeoutMs, maximumBytes: 4096 },
      );
      ready = health.status === 200 && health.body.status === "ready";
      healthResults.push({
        httpStatus: health.status,
        ready,
        unavailable: health.body.status === "unavailable",
        scannerUnavailable: health.body.code === "SCANNER_UNAVAILABLE",
      });
      // The HTTP bridge starts before ClamAV has loaded its signatures. Each
      // private health request renews the container's inactivity deadline.
      // Wait only for this known startup state, at most twice, never uploading
      // a PDF until the exact ready response arrives.
      if (
        !ready &&
        healthRequests < 2 &&
        health.status === 503 &&
        health.body.status === "unavailable"
      )
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(30_000, Math.max(0, healthRetryDelayMs))),
        );
    } catch (error) {
      if (!(error instanceof QualificationError)) throw error;
      healthResults.push({ code: error.code });
    }
  }
  if (!ready)
    throw new QualificationError("QUALIFICATION_SCANNER_NOT_READY", {
      healthResults,
    });
  const cases = [];
  const scan = async (bytes) => {
    const hash = sha256(bytes);
    const result = await privateJson(
      env.SCANNER,
      "/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: bytes,
      },
      { timeoutMs, maximumBytes: 4096 },
    );
    if (
      result.status !== 200 ||
      result.body.verdict !== "clean" ||
      result.body.sha256 !== hash
    )
      fail("QUALIFICATION_EXACT_SCAN_REQUIRED");
    return hash;
  };
  const render = async (name, bytes, hash, assertion = hash) => {
    const response = await privateJson(
      env.DOCUMENT_RENDERER,
      "/preflight/pingen",
      {
        method: "POST",
        body: bytes,
        headers: {
          "Content-Type": "application/pdf",
          "X-Guteneo-Source-Sha256": assertion,
          "X-Guteneo-Scan-Sha256": assertion,
          "X-Guteneo-Pingen-Options": JSON.stringify(OPTIONS),
        },
      },
      { timeoutMs },
    );
    const summary = summarizeReport(name, response, hash);
    cases.push({ ...summary, passed: passes(summary) });
  };
  const cleanHash = await scan(fixtures.clean);
  await render("clean_two_pages", fixtures.clean, cleanHash);
  const cornerHash = await scan(fixtures.corner);
  await render("reserved_corner_page_two", fixtures.corner, cornerHash);
  await render("wrong_source_hash", fixtures.clean, cleanHash, "0".repeat(64));
  const truncated = fixtures.clean.slice(0, 64);
  const truncatedHash = await scan(truncated);
  await render("truncated_pdf", truncated, truncatedHash);
  return {
    contract: "guteneo-postal-qualification-v1",
    remoteServiceBindings: true,
    syntheticOnly: true,
    scanRequests: 3,
    healthRequests,
    renderRequests: 4,
    pingenRequests: 0,
    storageWrites: 0,
    canSend: false,
    passed: cases.length === 4 && cases.every((item) => item.passed),
    cases,
  };
}

export async function syntheticFixtures() {
  const [{ chromium }, { default: puppeteer }] = await Promise.all([
    import("@playwright/test"),
    import("@cloudflare/puppeteer/internal/puppeteer-core.js"),
  ]);
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
  try {
    const fixture = async (corner) => {
      const page = await browser.newPage();
      try {
        await page.setOfflineMode(true);
        await page.setContent(
          `<style>@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial}.sheet{position:relative;width:210mm;height:297mm;break-after:page}.address{position:absolute;left:25mm;top:62mm;font-size:11pt;line-height:14pt}.body{position:absolute;left:25mm;top:110mm;font-size:11pt}</style><div class="sheet"><div class="address">ATELIER EXEMPLE<br>Rue du Test 12<br>L-1234 LUXEMBOURG</div><div class="body">Synthetic postal fixture</div></div><div class="sheet">${corner ? '<div style="position:absolute;left:9mm;top:285mm;width:1mm;height:1mm;background:#aaa"></div>' : ""}</div>`,
          { waitUntil: "load", timeout: 10_000 },
        );
        return new Uint8Array(
          await page.pdf({
            preferCSSPageSize: true,
            printBackground: true,
            timeout: 10_000,
          }),
        );
      } finally {
        await page.close();
      }
    };
    return { clean: await fixture(false), corner: await fixture(true) };
  } finally {
    await browser.close();
  }
}

async function bounded(operation, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new QualificationError("QUALIFICATION_TIMEOUT")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function main({
  createProxy,
  fixtures = syntheticFixtures,
  output = console.log,
  setupTimeoutMs = 45_000,
  cleanupTimeoutMs = 2_000,
} = {}) {
  let proxy;
  try {
    const makeProxy =
      createProxy ?? (await import("wrangler")).getPlatformProxy;
    const pdfs = await bounded(fixtures(), setupTimeoutMs);
    let setupExpired = false;
    const initializing = makeProxy({
      configPath: fileURLToPath(
        new URL("./qualify-postal-preflight.jsonc", import.meta.url),
      ),
      persist: false,
      envFiles: [],
    });
    initializing.then(
      (lateProxy) => {
        if (setupExpired)
          void bounded(lateProxy.dispose(), cleanupTimeoutMs).catch(
            () => undefined,
          );
      },
      () => undefined,
    );
    try {
      proxy = await bounded(initializing, setupTimeoutMs);
    } catch (error) {
      setupExpired = true;
      throw error;
    }
    const result = await qualifyPostalPreflight(proxy.env, pdfs);
    output(JSON.stringify(result, null, 2));
    return result.passed ? 0 : 1;
  } catch (error) {
    output(
      JSON.stringify({
        passed: false,
        code:
          error instanceof QualificationError
            ? error.code
            : "QUALIFICATION_UNAVAILABLE",
        ...(error instanceof QualificationError && error.details
          ? error.details
          : {}),
      }),
    );
    return 1;
  } finally {
    if (proxy)
      await bounded(proxy.dispose(), cleanupTimeoutMs).catch(() => undefined);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    console.error(
      "Usage: node scripts/qualify-postal-preflight.mjs (synthetic fixtures only)",
    );
    process.exitCode = 1;
  } else {
    const watchdog = setTimeout(() => {
      console.error('{"passed":false,"code":"QUALIFICATION_PROCESS_DEADLINE"}');
      process.exit(1);
    }, 600_000);
    // A stuck child can outlive main's bounded dispose. Keep this last-resort
    // deadline armed, while allowing a clean process to exit immediately.
    watchdog.unref();
    process.exitCode = await main();
  }
}
