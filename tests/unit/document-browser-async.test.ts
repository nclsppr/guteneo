import { afterEach, describe, expect, it, vi } from "vitest";
import { renderExpertReviewPage } from "../../apps/documents/src/expert-review-browser";
import { renderPostalPage } from "../../apps/documents/src/pingen-browser";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type Kind = "expert" | "postal";
const textContent = {
  items: [
    {
      str: "Alice",
      hasEOL: true,
      width: 30,
      transform: [12, 0, 0, 12, 100, 650],
      fontName: "fixture_font",
    },
  ],
  styles: { fixture_font: { ascent: 1, descent: -0.25 } },
};

async function browser(kind: Kind, pageNumber = 1, maxTextCharacters = 100) {
  const rendered = deferred<void>();
  const hash = deferred<ArrayBuffer>();
  const text = deferred<typeof textContent>();
  const encoded = Uint8Array.of(1, 2, 3, 4);
  const rgba = Uint8ClampedArray.of(255, 255, 255, 255, 0, 0, 0, 255);
  const hashBytes = await crypto.subtle.digest(
    "SHA-256",
    kind === "expert" ? encoded : rgba,
  );
  const expectedHash = Array.from(new Uint8Array(hashBytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockReturnValue(hash.promise);
  const reader = {
    read: vi
      .fn()
      .mockImplementationOnce(() =>
        text.promise.then((value) => ({ done: false, value })),
      )
      .mockResolvedValue({ done: true }),
    cancel: vi.fn(async () => undefined),
    releaseLock: vi.fn(),
  };
  const page = {
    getAnnotations: vi.fn(async () => []),
    getViewport: ({ scale }: { scale: number }) => ({
      width: 595.28 * scale,
      height: 841.89 * scale,
    }),
    render: vi.fn(() => ({ promise: rendered.promise })),
    getTextContent: vi.fn(() => text.promise),
    streamTextContent: vi.fn(() => ({ getReader: () => reader })),
    cleanup: vi.fn(),
  };
  const jpegBase64 = btoa(String.fromCharCode(...encoded));
  const context = {
    getImageData: () => ({ data: rgba }),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: (type: string) => `data:${type};base64,${jpegBase64}`,
  };
  const cropCanvas = { ...canvas };
  vi.stubGlobal("document", {
    createElement: vi
      .fn()
      .mockReturnValueOnce(canvas)
      .mockReturnValue(cropCanvas),
  });
  vi.stubGlobal("guteneoPdf", { getPage: async () => page });
  vi.stubGlobal("pdfjsLib", { AnnotationMode: { DISABLE: 0 } });
  vi.stubGlobal("guteneoRenderWarning", false);

  // Puppeteer serializes these functions into another global context. Calling
  // their source also proves the new async branches need no module closure.
  const expert = new Function(
    `return (${renderExpertReviewPage.toString()})`,
  )() as typeof renderExpertReviewPage;
  const postal = new Function(
    `return (${renderPostalPage.toString()})`,
  )() as typeof renderPostalPage;
  const pending =
    kind === "expert"
      ? expert({
          page: pageNumber,
          maxEdge: 1000,
          maxPixels: 1_000_000,
          maxImageCharacters: 1000,
          maxTextCharacters,
        })
      : postal({
          page: pageNumber,
          address: { x: 20, y: 40, width: 100, height: 80 },
          crop: { x: 20, y: 40, width: 80, height: 50 },
          dpi: 144,
          maxPixels: 2_100_000,
        });
  const outcome = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(page.render).toHaveBeenCalledOnce());
  expect(digest).not.toHaveBeenCalled();
  expect(page.getTextContent).not.toHaveBeenCalled();
  expect(page.streamTextContent).not.toHaveBeenCalled();
  rendered.resolve();
  await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce());
  return {
    hash,
    hashBytes,
    expectedHash,
    text,
    page,
    reader,
    canvas,
    cropCanvas,
    pending,
    outcome,
    digest,
    encoded,
    rgba,
    jpegBase64,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isolated document browser async dependencies", () => {
  it.each([
    [100, "Alice", false],
    [3, "Ali", true],
  ] as const)(
    "overlaps expert image hashing and bounded text extraction at text limit %i",
    async (limit, expectedText, truncated) => {
      const result = await browser("expert", 1, limit);
      expect(result.page.streamTextContent).toHaveBeenCalledWith({
        disableNormalization: true,
      });
      expect(result.digest).toHaveBeenCalledWith("SHA-256", result.encoded);
      result.text.resolve(textContent);
      await vi.waitFor(() =>
        expect(result.reader.releaseLock).toHaveBeenCalledOnce(),
      );
      expect(result.page.cleanup).not.toHaveBeenCalled();
      result.hash.resolve(result.hashBytes);
      await expect(result.pending).resolves.toMatchObject({
        imageBase64: result.jpegBase64,
        imageSha256: result.expectedHash,
        text: expectedText,
        textTruncated: truncated,
      });
      expect(result.reader.cancel).toHaveBeenCalledOnce();
      expect(result.page.cleanup).toHaveBeenCalledOnce();
      expect(result.canvas.width).toBe(0);
    },
  );

  it("overlaps postal hashing and first-page text while retaining raster and address evidence", async () => {
    const result = await browser("postal");
    expect(result.page.getTextContent).toHaveBeenCalledWith({
      disableNormalization: true,
    });
    expect(result.digest).toHaveBeenCalledWith("SHA-256", result.rgba);
    result.hash.resolve(result.hashBytes);
    await Promise.resolve();
    expect(result.page.cleanup).not.toHaveBeenCalled();
    result.text.resolve(textContent);
    await expect(result.pending).resolves.toMatchObject({
      width: 1191,
      height: 1684,
      rasterSha256: result.expectedHash,
      rgbaBase64: btoa(String.fromCharCode(...result.rgba)),
      address: { lines: ["Alice"], textVisibility: "not_verified" },
    });
    expect(result.page.cleanup).toHaveBeenCalledOnce();
    expect(result.cropCanvas.width).toBe(0);
  });

  it("does not extract postal address text from later pages", async () => {
    const result = await browser("postal", 2);
    expect(result.page.getTextContent).not.toHaveBeenCalled();
    result.hash.resolve(result.hashBytes);
    await expect(result.pending).resolves.toMatchObject({
      page: 2,
      address: null,
    });
    expect(result.page.cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    ["expert", "hash"],
    ["expert", "text"],
    ["postal", "hash"],
    ["postal", "text"],
  ] as const)(
    "waits for both %s branches on %s rejection, preserving hash-error priority",
    async (kind, failed) => {
      const result = await browser(kind);
      const hashFailure = new Error("HASH_FAILURE");
      const textFailure = new Error("TEXT_FAILURE");
      if (failed === "hash") result.hash.reject(hashFailure);
      else result.text.reject(textFailure);
      await Promise.resolve();
      await Promise.resolve();
      expect(result.page.cleanup).not.toHaveBeenCalled();
      expect(result.canvas.width).toBeGreaterThan(0);
      if (failed === "hash") result.text.reject(textFailure);
      else result.hash.resolve(result.hashBytes);
      expect(await result.outcome).toBe(
        failed === "hash" ? hashFailure : textFailure,
      );
      expect(result.page.cleanup).toHaveBeenCalledOnce();
      if (kind === "expert") {
        expect(result.reader.cancel).toHaveBeenCalledOnce();
        expect(result.reader.releaseLock).toHaveBeenCalledOnce();
      }
    },
  );
});
