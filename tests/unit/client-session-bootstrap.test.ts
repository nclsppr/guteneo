import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startInitialWorkspaceSession,
  readInitialWorkspaceSession,
  startInitialPersonalSession,
  readInitialPersonalSession,
} from "../../apps/web/src/client-session-bootstrap";
import { setSession } from "../../apps/web/src/api";

const fixture = {
  organization: { id: "workspace", name: "Synthetic workspace" },
  user: {
    id: "user",
    name: "Synthetic",
    role: "admin",
    email: "synthetic@example.invalid",
  },
  csrfToken: "synthetic-only",
  simulation: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  const browser = new EventTarget() as EventTarget & { location: URL };
  browser.location = new URL("https://guteneo.invalid/#/app/documents");
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(fixture)),
  );
});
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  setSession(null, false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("entry-only session handoff", () => {
  it("shares one preflight across StrictMode consumers without one consumer cancelling the other", async () => {
    await startInitialWorkspaceSession();
    const a = new AbortController(),
      b = new AbortController();
    const first = readInitialWorkspaceSession(a.signal);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = readInitialWorkspaceSession(b.signal);
    a.abort();
    await rejected;
    await expect(second).resolves.toMatchObject({ user: { id: "user" } });
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a bootstrap after visibility invalidation or its bounded lifetime", async () => {
    await startInitialWorkspaceSession();
    document.dispatchEvent(new Event("visibilitychange"));
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
    await startInitialWorkspaceSession();
    await vi.advanceTimersByTimeAsync(10_001);
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps personal and workspace authority reads separate and preserves personal transport privacy", async () => {
    await startInitialPersonalSession();
    await readInitialPersonalSession(new AbortController().signal);
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/personal/session",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
