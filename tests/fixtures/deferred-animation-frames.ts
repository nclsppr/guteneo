import type { Page } from "@playwright/test";

type FrameResult = { executed: number; probes: number; pending: number };
type BrowserFrames = {
  settle(): Promise<void>;
  resume(): FrameResult;
  restore(): void;
};
type FrameHost = Window & { guteneoDeferredAnimationFrames?: BrowserFrames };

/** Hold application callbacks independently of the router's scheduling strategy. */
export async function deferAnimationFrames(page: Page) {
  await page.evaluate(() => {
    const host = window as FrameHost;
    const nativeRequest = window.requestAnimationFrame;
    const nativeCancel = window.cancelAnimationFrame;
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = -1;
    let probes = 0;
    window.requestAnimationFrame = (callback) => {
      const id = nextId--;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (!pending.delete(id)) nativeCancel.call(window, id);
    };
    const restore = () => {
      pending.clear();
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      delete host.guteneoDeferredAnimationFrames;
    };
    host.guteneoDeferredAnimationFrames = {
      settle: () =>
        new Promise<void>((resolve) => {
          nativeRequest.call(window, () =>
            nativeRequest.call(window, () => resolve()),
          );
        }),
      resume: () => {
        let executed = 0;
        try {
          while (pending.size) {
            if (executed >= 1000)
              throw new Error("Deferred animation frames did not settle.");
            const [id, callback] = pending.entries().next().value!;
            pending.delete(id);
            executed += 1;
            callback(performance.now());
          }
          return { executed, probes, pending: pending.size };
        } finally {
          restore();
        }
      },
      restore,
    };
    // These nested probes qualify the helper without requiring a route RAF.
    window.requestAnimationFrame(() => {
      probes += 1;
      window.requestAnimationFrame(() => {
        probes += 1;
      });
    });
  });
  return {
    settle: () =>
      page.evaluate(() =>
        (window as FrameHost).guteneoDeferredAnimationFrames!.settle(),
      ),
    resume: () =>
      page.evaluate(async () => {
        const result = (
          window as FrameHost
        ).guteneoDeferredAnimationFrames!.resume();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return result;
      }),
    restore: () =>
      page.evaluate(() =>
        (window as FrameHost).guteneoDeferredAnimationFrames?.restore(),
      ),
  };
}
