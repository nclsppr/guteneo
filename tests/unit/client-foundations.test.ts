import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClientActionController,
  ObsoleteClientAction,
} from "../../apps/web/src/client-action";
import {
  BEFORE_WORKSPACE_NAVIGATION,
  clientNavigationRevision,
  createWorkspaceSwitchPreflightEvent,
  subscribeClientNavigation,
} from "../../apps/web/src/client-navigation";
import {
  cacheableListPath,
  invalidateClientLists,
  readClientList,
  dataAfterReadFailure,
} from "../../apps/web/src/client-resources";
import { startAdaptiveReadPolling } from "../../apps/web/src/client-polling";
import {
  getSessionAuthorityKey,
  sessionAuthorityKey,
  setSession,
  type Session,
} from "../../apps/web/src/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const session = (id: string): Session => ({
  organization: { id, name: "Synthetic workspace" },
  user: { id: "synthetic", name: "Synthetic user", role: "admin" },
  csrfToken: `synthetic-csrf-${id}`,
  simulation: true,
});
afterEach(() => {
  invalidateClientLists(true);
  setSession(null, false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("default action continuation ownership", () => {
  it("locks synchronously and fences the dependent write and UI effect after departure", async () => {
    const controller = createClientActionController();
    const response = deferred<{ id: string }>();
    let current = true;
    const effects = vi.fn();
    const duplicate = vi.fn(async () => undefined);
    const publish = vi.fn();
    const action = controller.run(
      async (view) => {
        await view.wait(response.promise, (receipt) => ({
          kind: "dispatch_prepared",
          resourceId: receipt.id,
          route: `/app/dispatch/${receipt.id}`,
        }));
        effects(); // Represents the following write or navigation in the real callback.
      },
      () => current,
      publish,
    );
    const rejected =
      expect(action).rejects.toBeInstanceOf(ObsoleteClientAction);
    await controller.run(duplicate, () => true);
    expect(duplicate).not.toHaveBeenCalled();
    current = false;
    response.resolve({ id: "dispatch_synthetic" });
    await rejected;
    expect(effects).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith({
      kind: "dispatch_prepared",
      resourceId: "dispatch_synthetic",
      route: "/app/dispatch/dispatch_synthetic",
    });
    expect(controller.pending).toBe(false);
    await controller.run(duplicate, () => true);
    expect(duplicate).toHaveBeenCalledOnce();
  });

  it("does not turn an unknown failed write into a success receipt or retry", async () => {
    const controller = createClientActionController();
    const write = vi.fn(async () => {
      throw new Error("Unknown outcome");
    });
    const publish = vi.fn();
    await expect(
      controller.run(
        async (view) => {
          await view.wait(write(), () => ({
            kind: "updated",
            resourceId: "synthetic",
            route: "/app/account",
          }));
        },
        () => true,
        publish,
      ),
    ).rejects.toThrow("Unknown outcome");
    expect(write).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(controller.pending).toBe(false);
  });
});

describe("shared navigation and authority clocks", () => {
  it("keeps an accepted workspace preflight current and still observes the actual route departure", async () => {
    const browser = new EventTarget() as EventTarget & {
      location: { href: string };
    };
    browser.location = { href: "https://guteneo.invalid/#/app/a" };
    vi.stubGlobal("window", browser);
    const changed = vi.fn();
    const unsubscribe = subscribeClientNavigation(changed);
    const start = clientNavigationRevision();
    expect(browser.dispatchEvent(createWorkspaceSwitchPreflightEvent())).toBe(
      true,
    );
    await Promise.resolve();
    expect(clientNavigationRevision()).toBe(start);
    expect(changed).not.toHaveBeenCalled();
    const oldURL = browser.location.href;
    browser.location.href = "https://guteneo.invalid/#/app/b";
    const departure = new Event("hashchange");
    Object.assign(departure, { oldURL, newURL: browser.location.href });
    browser.dispatchEvent(departure);
    await Promise.resolve();
    expect(clientNavigationRevision()).toBe(start + 1);
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("lets existing dirty-form listeners veto a workspace preflight without advancing the visit", async () => {
    const browser = new EventTarget() as EventTarget & {
      location: { href: string };
    };
    browser.location = { href: "https://guteneo.invalid/#/app/a" };
    vi.stubGlobal("window", browser);
    const changed = vi.fn();
    const unsubscribe = subscribeClientNavigation(changed);
    const start = clientNavigationRevision();
    const veto = vi.fn((event: Event) => event.preventDefault());
    browser.addEventListener(BEFORE_WORKSPACE_NAVIGATION, veto);
    const preflight = createWorkspaceSwitchPreflightEvent();
    expect(browser.dispatchEvent(preflight)).toBe(false);
    await Promise.resolve();
    expect(veto).toHaveBeenCalledOnce();
    expect(preflight.defaultPrevented).toBe(true);
    expect(clientNavigationRevision()).toBe(start);
    expect(changed).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("observes batched A to B to A and retains the revision for a vetoed navigation", async () => {
    const browser = new EventTarget() as EventTarget & {
      location: { href: string };
    };
    browser.location = { href: "https://guteneo.invalid/#/app/a" };
    vi.stubGlobal("window", browser);
    const one = subscribeClientNavigation(() => undefined);
    const two = subscribeClientNavigation(() => undefined);
    const start = clientNavigationRevision();
    const hash = (oldURL: string, newURL: string) => {
      const event = new Event("hashchange");
      Object.assign(event, { oldURL, newURL });
      browser.dispatchEvent(event);
    };
    hash(browser.location.href, "https://guteneo.invalid/#/app/b");
    hash("https://guteneo.invalid/#/app/b", browser.location.href);
    await Promise.resolve();
    expect(clientNavigationRevision()).toBe(start + 2);
    const current = clientNavigationRevision();
    browser.location.href = "https://guteneo.invalid/#/app/b";
    const veto = (event: Event) => {
      event.preventDefault();
      browser.location.href = "https://guteneo.invalid/#/app/a";
    };
    browser.addEventListener(BEFORE_WORKSPACE_NAVIGATION, veto);
    const event = new Event(BEFORE_WORKSPACE_NAVIGATION, { cancelable: true });
    browser.dispatchEvent(event);
    hash(browser.location.href, "https://guteneo.invalid/#/app/b");
    await Promise.resolve();
    expect(clientNavigationRevision()).toBe(current);
    one();
    two();
  });

  it("uses opaque scopes, preserves an unchanged authority and invalidates A to B to A", () => {
    const a = session("a");
    setSession(a, false);
    const initial = getSessionAuthorityKey();
    expect(sessionAuthorityKey(a)).not.toContain(a.csrfToken);
    setSession({ ...a, user: { ...a.user, name: "Renamed" } }, false);
    expect(getSessionAuthorityKey()).toBe(initial);
    setSession(session("b"), false);
    setSession(a, false);
    expect(getSessionAuthorityKey()).not.toBe(initial);
  });
});

describe("bounded authority-scoped list reads", () => {
  it("removes a known refused/gone model while allowing a transient refresh to retain its snapshot", () => {
    const model = { id: "synthetic-private-model" };
    for (const status of [401, 403, 404, 410])
      expect(dataAfterReadFailure(model, { status })).toBeUndefined();
    for (const status of [0, 429, 500, 503])
      expect(dataAfterReadFailure(model, { status })).toBe(model);
  });
  it("deduplicates only collections, lets one subscriber abort, and bypasses cached values on explicit refresh", async () => {
    for (const path of [
      "/templates/template_one",
      "/dispatches/dispatch_one",
      "/secure-distributions/sd_one",
      "/documents/doc_one/content",
      "/account",
      "/session",
    ])
      expect(cacheableListPath(path)).toBe(false);
    expect(cacheableListPath("/documents?limit=50")).toBe(true);
    const response = deferred<{ items: string[] }>();
    const read = vi.fn(() => response.promise);
    const a = new AbortController(),
      b = new AbortController();
    const first = readClientList("authority-a:documents:en", read, a.signal);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = readClientList("authority-a:documents:en", read, b.signal);
    await Promise.resolve();
    a.abort();
    await rejected;
    response.resolve({ items: ["synthetic"] });
    await expect(second).resolves.toEqual({ items: ["synthetic"] });
    await readClientList(
      "authority-a:documents:en",
      read,
      new AbortController().signal,
    );
    expect(read).toHaveBeenCalledOnce();
    await readClientList(
      "authority-a:documents:en",
      read,
      new AbortController().signal,
      true,
    );
    expect(read).toHaveBeenCalledTimes(2);
    await readClientList(
      "authority-b:documents:en",
      read,
      new AbortController().signal,
    );
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("expires cache and prevents an old in-flight read from repopulating after a mutation", async () => {
    vi.useFakeTimers();
    const old = deferred<string>();
    const read = vi.fn(() => old.promise);
    const first = readClientList(
      "authority:documents:en",
      read,
      new AbortController().signal,
    );
    await Promise.resolve();
    invalidateClientLists();
    old.resolve("before-mutation");
    await first;
    const after = vi.fn(async () => "after-mutation");
    await expect(
      readClientList(
        "authority:documents:en",
        after,
        new AbortController().signal,
      ),
    ).resolves.toBe("after-mutation");
    await vi.advanceTimersByTimeAsync(5_001);
    await readClientList(
      "authority:documents:en",
      after,
      new AbortController().signal,
    );
    expect(after).toHaveBeenCalledTimes(2);
  });
});

describe("visible adaptive read polling", () => {
  it("backs off unchanged facts, pauses hidden, reads once on return and never overlaps a read", async () => {
    vi.useFakeTimers();
    const page = new EventTarget() as EventTarget & { visibilityState: string };
    page.visibilityState = "visible";
    vi.stubGlobal("document", page);
    const poll = vi.fn();
    let loading = false;
    const stop = startAdaptiveReadPolling(
      poll,
      () => ({ loading, progress: "queued" }),
      3_000,
      30_000,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(poll).toHaveBeenCalledTimes(2);
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(poll).toHaveBeenCalledTimes(2);
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(poll).toHaveBeenCalledTimes(3);
    loading = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(poll).toHaveBeenCalledTimes(3);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
