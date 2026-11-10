import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startInitialWorkspaceSession,
  readInitialWorkspaceSession,
  startInitialPersonalSession,
  readInitialPersonalSession,
  initialSessionIsCurrent,
  isInitialSessionObsolete,
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
    const initial = startInitialWorkspaceSession();
    await initial;
    expect(initialSessionIsCurrent(initial)).toBe(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(initialSessionIsCurrent(initial)).toBe(false);
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
    await startInitialWorkspaceSession();
    await vi.advanceTimersByTimeAsync(10_001);
    await readInitialWorkspaceSession(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("releases a held workspace entry immediately when the person navigates to personal documents", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = startInitialWorkspaceSession();
    const rejected = expect(pending).rejects.toSatisfy(
      isInitialSessionObsolete,
    );
    const oldURL = window.location.href;
    window.location.href = "https://guteneo.invalid/#/app/my-documents";
    const departure = new Event("hashchange");
    Object.assign(departure, { oldURL, newURL: window.location.href });
    window.dispatchEvent(departure);
    await Promise.resolve();
    await rejected;
    expect(initialSessionIsCurrent(pending)).toBe(false);
    await expect(startInitialPersonalSession()).resolves.toMatchObject({
      user: { id: "user" },
    });
    complete(
      Response.json({ ...fixture, user: { ...fixture.user, id: "obsolete" } }),
    );
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("abandons a pending personal entry on visibility loss and lets the replacement account read proceed", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = startInitialPersonalSession();
    const rejected = expect(pending).rejects.toSatisfy(
      isInitialSessionObsolete,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    document.dispatchEvent(new Event("visibilitychange"));
    await rejected;
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        ...fixture,
        user: { ...fixture.user, id: "replacement" },
      }),
    );
    await expect(startInitialPersonalSession()).resolves.toMatchObject({
      user: { id: "replacement" },
    });
    complete(Response.json(fixture));
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels one pending handoff consumer immediately without cancelling the shared initial read", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = startInitialWorkspaceSession();
    const a = new AbortController(),
      b = new AbortController();
    const first = readInitialWorkspaceSession(a.signal);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = readInitialWorkspaceSession(b.signal);
    a.abort();
    await rejected;
    expect(initialSessionIsCurrent(pending)).toBe(true);
    complete(Response.json(fixture));
    await expect(second).resolves.toMatchObject({ user: { id: "user" } });
    await expect(pending).resolves.toMatchObject({ user: { id: "user" } });
    expect(fetch).toHaveBeenCalledOnce();
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
