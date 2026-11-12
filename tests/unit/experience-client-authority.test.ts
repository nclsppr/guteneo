import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceAuthority,
  api,
  apiBlob,
  currentAuthority,
  setCsrfToken,
  subscribeAuthority,
  synchronizeAuthority,
  SESSION_EXPIRED_EVENT,
} from "../../apps/experience/src/api/client";
import { sessionAuthorityKey } from "../../apps/experience/src/session";
import type {
  PersonalSession,
  WorkspaceSession,
} from "../../apps/experience/src/api/types";

vi.mock("../../apps/experience/src/config", () => ({
  API_ORIGIN: "https://guteneo.invalid",
  API_IS_LOOPBACK: false,
}));
vi.mock("../../apps/experience/src/i18n", () => ({ useI18n: vi.fn() }));

const workspace = (id = "a") =>
  ({
    organization: { id: `workspace-${id}`, name: "Synthetic workspace" },
    user: { id: "person-a", name: "Synthetic person", role: "admin" },
    csrfToken: "synthetic-session-a",
    permissions: { approve: true },
    simulation: true,
  }) as unknown as WorkspaceSession;
const personal = () =>
  ({
    user: { id: "person-a", name: "Synthetic person", email: null },
    csrfToken: "synthetic-session-a",
    simulation: true,
    mfa: false,
    verifiedAccount: true,
    strongAuthentication: false,
    authenticatedAt: null,
    documentAccessAllowed: true,
    workspaces: [],
  }) satisfies PersonalSession;

beforeEach(() => {
  advanceAuthority();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("experience browser authority", () => {
  it("invalidates private consumers on an external workspace switch but preserves an unchanged snapshot", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuthority(listener);
    const first = synchronizeAuthority(
      sessionAuthorityKey(workspace(), personal()),
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(
      synchronizeAuthority(sessionAuthorityKey(workspace(), personal())),
    ).toBe(first);
    expect(listener).toHaveBeenCalledOnce();
    expect(
      synchronizeAuthority(sessionAuthorityKey(workspace("b"), personal())),
    ).toBeGreaterThan(first);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    advanceAuthority();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("also invalidates on role, document authority, session rotation and sign-out", () => {
    let previous = synchronizeAuthority(
      sessionAuthorityKey(workspace(), personal()),
    );
    for (const [work, person] of [
      [
        { ...workspace(), user: { ...workspace().user, role: "observer" } },
        personal(),
      ],
      [workspace(), { ...personal(), documentAccessAllowed: false }],
      [
        { ...workspace(), csrfToken: "rotated" },
        { ...personal(), csrfToken: "rotated" },
      ],
      [null, null],
    ] as const) {
      const next = synchronizeAuthority(sessionAuthorityKey(work, person));
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
  });

  it("refuses mixed snapshots while accepting a personal account without a workspace", () => {
    expect(() => sessionAuthorityKey(workspace(), null)).toThrow(
      "session changed",
    );
    expect(() =>
      sessionAuthorityKey(workspace(), { ...personal(), csrfToken: "rotated" }),
    ).toThrow("session changed");
    expect(() =>
      sessionAuthorityKey(workspace(), {
        ...personal(),
        user: { ...personal().user, id: "other" },
      }),
    ).toThrow("session changed");
    expect(() => sessionAuthorityKey(null, personal())).not.toThrow();
  });

  it("never carries the old CSRF token into the replacement authority", async () => {
    setCsrfToken("old-synthetic-csrf");
    advanceAuthority();
    await api("/recipients", { method: "POST", body: {} });
    expect(fetch).toHaveBeenCalledWith(
      "https://guteneo.invalid/api/recipients",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: expect.objectContaining({ "X-CSRF-Token": "" }),
      }),
    );
  });

  for (const result of ["success", "expired", "network"] as const) {
    it(`discards an old ${result} response after account replacement`, async () => {
      let resolve!: (response: Response) => void;
      let reject!: (error: Error) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      const expiry = vi.fn();
      window.addEventListener(SESSION_EXPIRED_EVENT, expiry);
      const request = api("/documents");
      const rejected = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      advanceAuthority();
      if (result === "network") reject(new Error("Old network failure"));
      else
        resolve(
          Response.json(
            { private: "old account" },
            { status: result === "expired" ? 401 : 200 },
          ),
        );
      await rejected;
      expect(expiry).not.toHaveBeenCalled();
    });
  }

  it("discards a private PDF whose body finishes after the session changes", async () => {
    let finish!: () => void;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            finish = () => {
              controller.enqueue(new TextEncoder().encode("synthetic PDF"));
              controller.close();
            };
          },
        }),
      ),
    );
    const pending = apiBlob("/documents/example/content");
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    advanceAuthority();
    finish();
    await rejected;
  });

  it("announces a current expired session, without treating an anonymous probe as expiry", async () => {
    const expiry = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expiry);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(api("/session")).rejects.toMatchObject({ status: 401 });
    expect(expiry).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(api("/documents")).rejects.toMatchObject({ status: 401 });
    expect(expiry).toHaveBeenCalledOnce();
    expect(currentAuthority()).toBeGreaterThan(0);
  });
});
