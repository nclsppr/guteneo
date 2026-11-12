import { describe, expect, it, vi } from "vitest";
import {
  createNavigationController,
  isInternalPath,
  type NavigationPort,
} from "../../apps/experience/src/navigation-state";

function browser(start = "/", initialState: unknown = null) {
  const entries: { path: string; state: unknown }[] = [
    { path: start, state: initialState },
  ];
  let selected = 0;
  const pending: number[] = [];
  const port: NavigationPort = {
    location: () => entries[selected].path,
    state: () => entries[selected].state,
    replace: (state, path) => {
      entries[selected] = { state, path };
    },
    push: (state, path) => {
      entries.splice(selected + 1);
      entries.push({ state, path });
      selected += 1;
    },
    go: vi.fn((delta: number) => {
      pending.push(delta);
    }),
    confirm: vi.fn(() => true),
    notify: vi.fn(),
    scroll: vi.fn(),
  };
  const router = createNavigationController(port, "test-session");
  const traverse = (delta: number) => {
    selected += delta;
    if (!entries[selected]) throw new Error("Invalid test traversal");
    router.pop();
  };
  return {
    port,
    router,
    entries,
    pending,
    traverse,
    flush: () => {
      const delta = pending.shift();
      if (delta !== undefined) traverse(delta);
    },
  };
}

describe("experience navigation preserves unsaved work", () => {
  it("rejects an internal transition without changing URL, history or rendered route", () => {
    const b = browser("/counter");
    b.router.guard(() => "Discard the message?");
    vi.mocked(b.port.confirm).mockReturnValue(false);
    expect(b.router.navigate("/departures")).toBe(false);
    expect(b.port.location()).toBe("/counter");
    expect(b.router.snapshot()).toBe("/counter");
    expect(b.entries).toHaveLength(1);
    expect(b.port.notify).not.toHaveBeenCalled();
    expect(b.port.confirm).toHaveBeenCalledWith("Discard the message?");
  });

  it("restores cancelled Back without ever publishing the abandoned target or prompting twice", () => {
    const b = browser();
    b.router.navigate("/counter");
    vi.mocked(b.port.notify).mockClear();
    b.router.guard(() => "Discard?");
    vi.mocked(b.port.confirm).mockReturnValue(false);
    b.traverse(-1);
    expect(b.port.location()).toBe("/");
    expect(b.router.snapshot()).toBe("/counter");
    expect(b.pending).toEqual([1]);
    expect(b.router.navigate("/documents")).toBe(false);
    b.flush();
    expect(b.port.location()).toBe("/counter");
    expect(b.router.snapshot()).toBe("/counter");
    expect(b.port.notify).not.toHaveBeenCalled();
    expect(b.port.confirm).toHaveBeenCalledTimes(1);
    expect(b.pending).toEqual([]);
    vi.mocked(b.port.confirm).mockReturnValue(true);
    b.traverse(-1);
    expect(b.router.snapshot()).toBe("/");
    expect(b.port.notify).toHaveBeenCalledTimes(1);
  });

  it("restores cancelled Forward and multi-entry Back with the exact inverse delta", () => {
    const b = browser();
    b.router.navigate("/documents");
    b.router.navigate("/counter");
    b.traverse(-1);
    b.router.guard(() => "Leave?");
    vi.mocked(b.port.confirm).mockReturnValue(false);
    b.traverse(1);
    expect(b.pending).toEqual([-1]);
    expect(b.router.snapshot()).toBe("/documents");
    b.flush();
    expect(b.port.location()).toBe("/documents");
    vi.mocked(b.port.confirm).mockReturnValue(true);
    b.traverse(1);
    vi.mocked(b.port.confirm).mockReturnValue(false);
    b.traverse(-2);
    expect(b.pending).toEqual([2]);
    expect(b.router.snapshot()).toBe("/counter");
    b.flush();
    expect(b.port.location()).toBe("/counter");
    expect(b.pending).toEqual([]);
  });

  it("does not block after a form releases or unregisters its guard", () => {
    const b = browser("/counter");
    let dirty = true;
    const release = b.router.guard(() => (dirty ? "Leave?" : null));
    expect(b.router.dirty()).toBe(true);
    dirty = false;
    expect(b.router.dirty()).toBe(false);
    expect(b.router.navigate("/departures/dsp_saved")).toBe(true);
    expect(b.port.confirm).not.toHaveBeenCalled();
    dirty = true;
    release();
    expect(b.router.dirty()).toBe(false);
    b.traverse(-1);
    expect(b.router.snapshot()).toBe("/counter");
  });

  it("keeps replace navigation on the same entry and preserves unrelated history state", () => {
    const b = browser("/", { scrollAnchor: "top" });
    b.router.navigate("/destinations", { replace: true });
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0].state).toMatchObject({ scrollAnchor: "top" });
    b.router.navigate("/counter");
    b.router.navigate("/counter?channel=fax", { replace: true });
    expect(b.entries).toHaveLength(2);
    b.traverse(-1);
    expect(b.router.snapshot()).toBe("/destinations");
    expect(b.port.scroll).toHaveBeenCalledTimes(1);
  });

  it("handles unrelated history writers without reloads or recovery loops", () => {
    const b = browser("/counter");
    b.router.guard(() => "Leave?");
    vi.mocked(b.port.confirm).mockReturnValue(false);
    b.entries[0] = { path: "/foreign", state: { unrelated: true } };
    b.router.pop();
    expect(b.port.location()).toBe("/counter");
    expect(b.router.snapshot()).toBe("/counter");
    expect(b.port.go).not.toHaveBeenCalled();
    expect(b.port.notify).not.toHaveBeenCalled();
    b.router.pop();
    expect(b.port.confirm).toHaveBeenCalledTimes(1);
  });

  it("prompts once for multiple forms, using the current localized message", () => {
    const b = browser("/account");
    b.router.guard(() => "Discard profile?");
    let text = "Abandonner les modifications ?";
    b.router.guard(() => text);
    text = "Änderungen verwerfen?";
    b.router.navigate("/documents");
    expect(b.port.confirm).toHaveBeenCalledTimes(1);
    expect(b.port.confirm).toHaveBeenCalledWith(text);
  });

  it("never treats protocol-relative or backslash destinations as in-app paths", () => {
    expect(isInternalPath("/counter?channel=email")).toBe(true);
    for (const path of [
      "//example.com",
      "/\\example.com",
      "https://example.com",
      "/\nexample.com",
      undefined,
    ])
      expect(isInternalPath(path)).toBe(false);
    const b = browser("/counter");
    expect(b.router.navigate("//example.com")).toBe(false);
    expect(b.entries).toHaveLength(1);
  });
});
