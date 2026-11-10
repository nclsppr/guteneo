import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BEFORE_WORKSPACE_NAVIGATION,
  clientNavigationRevision,
  confirmWorkspaceSwitch,
  createRouteNavigationEvent,
  createWorkspaceSwitchPreflightEvent,
  deferWorkspaceSwitch,
  routeNavigationIntent,
  subscribeClientNavigation,
} from "../../apps/web/src/client-navigation";
import {
  createNavigationConfirmationController,
  type NavigationConfirmationSnapshot,
} from "../../apps/web/src/navigation-confirmation-state";

afterEach(() => vi.unstubAllGlobals());
const fromHref = "https://guteneo.invalid/#/app/studio/template/synthetic";
const toHref = "https://guteneo.invalid/#/app/studio/templates";
function fixture() {
  const state: NavigationConfirmationSnapshot = {
    authority: "synthetic-authority-a",
    revision: 7,
    href: toHref,
    scope: "synthetic-template:1",
  };
  const navigate = vi.fn((href: string) => {
    state.href = href;
  });
  const changed = vi.fn();
  const controller = createNavigationConfirmationController({
    snapshot: () => ({ ...state }),
    navigate,
    changed,
  });
  return { controller, state, navigate, changed };
}

describe("exact dirty-view departure confirmation", () => {
  it("captures immutable navigation addresses rather than a caller's mutable object", () => {
    const { controller, state, navigate } = fixture();
    const intent = { fromHref, toHref };
    controller.route(intent);
    intent.toHref = "https://guteneo.invalid/#/app/unreviewed";
    state.href = fromHref;
    expect(controller.confirm()).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(toHref);
  });
  it("vetoes without navigating, preserves the first intent and resumes it once", () => {
    const { controller, state, navigate } = fixture();
    const intent = { fromHref, toHref };
    expect(controller.route(intent)).toBe(false);
    state.href = fromHref; // The router restores the accepted address synchronously.
    expect(navigate).not.toHaveBeenCalled();
    expect(
      controller.route({
        fromHref,
        toHref: "https://guteneo.invalid/#/app/other",
      }),
    ).toBe(false);
    expect(controller.confirm()).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(toHref);
    expect(controller.confirm()).toBe(false);
    expect(controller.route(intent)).toBe(true);
    expect(controller.route(intent)).toBe(false); // The bypass was consumed.
  });

  it("dismisses without abandoning the original action or issuing a new request", () => {
    const { controller, state, navigate } = fixture();
    controller.route({ fromHref, toHref });
    state.href = fromHref;
    controller.cancel();
    expect(controller.pending).toBeUndefined();
    expect(controller.confirm()).toBe(false);
    expect(state.revision).toBe(7);
    expect(navigate).not.toHaveBeenCalled();
  });

  for (const field of ["authority", "revision", "href", "scope"] as const)
    it(`refuses a route resume after ${field} changes`, () => {
      const { controller, state, navigate } = fixture();
      controller.route({ fromHref, toHref });
      state.href = fromHref;
      if (field === "revision") state.revision += 1;
      else state[field] += "-replacement";
      expect(controller.confirm()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

  it("cannot borrow a one-use resume for another target or a newer visit", () => {
    const { controller, state } = fixture();
    controller.route({ fromHref, toHref });
    state.href = fromHref;
    controller.confirm();
    state.revision += 1;
    expect(controller.route({ fromHref, toHref })).toBe(false);
  });

  it("does not share one workspace decision between concurrent switches", async () => {
    const { controller, state, navigate } = fixture();
    state.href = fromHref;
    const first = controller.workspace();
    await expect(controller.workspace()).resolves.toBe(false);
    expect(controller.confirm()).toBe(true);
    await expect(first).resolves.toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("resolves an abandoned workspace decision negatively and retains no bypass", async () => {
    const { controller, state } = fixture();
    state.href = fromHref;
    const pending = controller.workspace();
    controller.cancel(false);
    await expect(pending).resolves.toBe(false);
    expect(controller.confirm()).toBe(false);
    expect(controller.route({ fromHref, toHref })).toBe(false);
  });

  it("refuses a workspace confirmation after authority replacement", async () => {
    const { controller, state } = fixture();
    state.href = fromHref;
    const pending = controller.workspace();
    state.authority = "replacement";
    expect(controller.confirm()).toBe(false);
    await expect(pending).resolves.toBe(false);
  });
});

describe("awaitable workspace preflight", () => {
  function browser() {
    const target = new EventTarget() as EventTarget & {
      location: { href: string };
    };
    target.location = { href: fromHref };
    vi.stubGlobal("window", target);
    return target;
  }

  it("consumes a preflight once and never replays its previous confirmation", async () => {
    const target = browser();
    const decide = vi.fn(async () => true);
    target.addEventListener(BEFORE_WORKSPACE_NAVIGATION, (event) =>
      deferWorkspaceSwitch(event, decide),
    );
    const event = createWorkspaceSwitchPreflightEvent();
    await expect(confirmWorkspaceSwitch(event)).resolves.toBe(true);
    await expect(confirmWorkspaceSwitch(event)).resolves.toBe(false);
    expect(decide).toHaveBeenCalledOnce();
  });

  it("waits for explicit decisions without advancing the navigation clock", async () => {
    const target = browser();
    const unsubscribe = subscribeClientNavigation(() => undefined);
    const revision = clientNavigationRevision();
    let answer!: (decision: boolean) => void;
    target.addEventListener(BEFORE_WORKSPACE_NAVIGATION, (event) => {
      expect(
        deferWorkspaceSwitch(
          event,
          () =>
            new Promise((resolve) => {
              answer = resolve;
            }),
        ),
      ).toBe(true);
    });
    const decision = confirmWorkspaceSwitch(
      createWorkspaceSwitchPreflightEvent(),
    );
    await Promise.resolve();
    expect(clientNavigationRevision()).toBe(revision);
    answer(true);
    await expect(decision).resolves.toBe(true);
    expect(clientNavigationRevision()).toBe(revision);
    unsubscribe();
  });

  it("retains an independent synchronous veto without opening a deferred dialog", async () => {
    const target = browser();
    const decide = vi.fn(async () => true);
    target.addEventListener(BEFORE_WORKSPACE_NAVIGATION, (event) => {
      deferWorkspaceSwitch(event, decide);
      event.preventDefault();
    });
    await expect(
      confirmWorkspaceSwitch(createWorkspaceSwitchPreflightEvent()),
    ).resolves.toBe(false);
    expect(decide).not.toHaveBeenCalled();
  });

  it("fails closed on dismissal, rejected decisions and non-preflight events", async () => {
    const target = browser();
    target.addEventListener(BEFORE_WORKSPACE_NAVIGATION, (event) => {
      deferWorkspaceSwitch(event, async () => {
        throw new Error("Synthetic dialog gone");
      });
    });
    await expect(
      confirmWorkspaceSwitch(createWorkspaceSwitchPreflightEvent()),
    ).resolves.toBe(false);
    const event = createRouteNavigationEvent({ fromHref, toHref });
    expect(routeNavigationIntent(event)).toEqual({ fromHref, toHref });
    expect(deferWorkspaceSwitch(event, async () => true)).toBe(false);
    await expect(confirmWorkspaceSwitch(event)).resolves.toBe(false);
  });
});
