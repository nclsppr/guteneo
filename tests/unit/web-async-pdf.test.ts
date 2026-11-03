import { afterEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  state: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  refs: [] as unknown[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useState: () => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [hooks.state.shift(), setter];
  },
  useRef: () => ({ current: hooks.refs.shift() }),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));
vi.mock("../../apps/web/src/api", () => ({ getDocumentContent: vi.fn() }));

import PdfViewer from "../../apps/web/src/pdf-viewer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function startPage() {
  const rendered = deferred<void>();
  const extracted = deferred<{ items: { str: string }[] }>();
  const cancel = vi.fn();
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: vi.fn(() => ({ promise: rendered.promise, cancel })),
    getTextContent: vi.fn(() => extracted.promise),
  };
  hooks.effects = [];
  hooks.setters = [];
  hooks.state = [
    { getPage: vi.fn(async () => page) },
    1,
    "",
    undefined,
    true,
    560,
  ];
  hooks.refs = [null, { style: {}, getContext: () => ({}) }];
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  PdfViewer({ id: "fixture-document" });
  const cleanup = hooks.effects[2]();
  await Promise.resolve();
  return { page, rendered, extracted, cleanup, cancel };
}

describe("PDF page async work", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts text extraction before rendering finishes and waits for both before revealing the page", async () => {
    const { page, rendered, extracted } = await startPage();
    expect(page.render).toHaveBeenCalledOnce();
    expect(page.getTextContent).toHaveBeenCalledOnce();
    extracted.resolve({ items: [{ str: "Exact page text" }] });
    await Promise.resolve();
    expect(hooks.setters[4]).not.toHaveBeenCalledWith(false);
    rendered.resolve();
    await vi.waitFor(() => {
      expect(hooks.setters[2]).toHaveBeenCalledWith("Exact page text");
      expect(hooks.setters[4]).toHaveBeenCalledWith(false);
    });
  });

  it("cancels obsolete rendering and never publishes its pending text", async () => {
    const { rendered, extracted, cleanup, cancel } = await startPage();
    if (typeof cleanup !== "function")
      throw new Error("Missing effect cleanup");
    cleanup();
    expect(cancel).toHaveBeenCalledOnce();
    extracted.resolve({ items: [{ str: "Obsolete page text" }] });
    rendered.resolve();
    await Promise.all([rendered.promise, extracted.promise]);
    await Promise.resolve();
    expect(hooks.setters[2]).not.toHaveBeenCalledWith("Obsolete page text");
    expect(hooks.setters[4]).not.toHaveBeenCalledWith(false);
  });

  it("waits for rendering before handling text failure and retains render-error priority", async () => {
    const { rendered, extracted } = await startPage();
    extracted.reject(new Error("text failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(hooks.setters[4]).not.toHaveBeenCalledWith(false);
    const renderFailure = new Error("render failure");
    rendered.reject(renderFailure);
    await vi.waitFor(() => {
      expect(hooks.setters[3]).toHaveBeenCalledWith(renderFailure);
      expect(hooks.setters[4]).toHaveBeenCalledWith(false);
    });
  });
});
