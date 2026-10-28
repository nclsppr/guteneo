import { afterEach, describe, expect, it, vi } from "vitest";
import site from "../../packages/contracts/src/public-site.json";
import {
  getPublicNavigationTarget,
  installPublicNavigation,
  isPublicNavigationClick,
  isPublicNavigationUrl,
} from "../../apps/web/src/public-navigation";

vi.mock("../../apps/web/src/locale", () => ({ initializeLocale: vi.fn() }));

class Anchor {
  target = "";
  dataset: { publicNavigation?: string } = {};
  attributes = new Map<string, string>();
  relList = {
    contains: (value: string) => this.attributes.get("rel") === value,
  };
  constructor(href: string) {
    this.attributes.set("href", href);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  closest() {
    return this;
  }
}
const anchor = (href: string, attributes: Record<string, string> = {}) => {
  const result = new Anchor(href);
  for (const [key, value] of Object.entries(attributes))
    result.attributes.set(key, value);
  result.target = attributes.target ?? "";
  if (attributes["data-public-navigation"])
    result.dataset.publicNavigation = attributes["data-public-navigation"];
  return result as unknown as HTMLAnchorElement;
};
const publicPage = new URL("https://guteneo.com/?lang=de");
const ordinaryClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public navigation boundaries", () => {
  it.each(site.paths)("accepts registered public route %s", (path) => {
    expect(isPublicNavigationUrl(new URL(path, publicPage))).toBe(true);
    expect(isPublicNavigationUrl(new URL(`${path}?lang=lb`, publicPage))).toBe(
      true,
    );
  });
  it.each([
    "/unknown/",
    "/app",
    "/api/session",
    "/auth/login",
    "/invitation/",
    "/?lang=en&lang=de",
    "/?lang=xx",
    "/?lang=",
    "/?token=opaque",
    "/?code=opaque&state=opaque",
    "/?utm_source=campaign",
    "/?LANG=en",
    "/#/app/my-documents",
    "/#/email-preferences",
    "/#/privacy",
    "https://name:password@guteneo.com/pricing/",
    "file:///pricing/",
  ])("keeps %s outside public client routing", (path) => {
    expect(isPublicNavigationUrl(new URL(path, publicPage))).toBe(false);
    expect(getPublicNavigationTarget(anchor(path), publicPage)).toBeNull();
  });
  it("preserves explicit target language and supplies the current URL language otherwise", () => {
    expect(
      getPublicNavigationTarget(anchor("/pricing/#pdf-checks"), publicPage)
        ?.href,
    ).toBe("https://guteneo.com/pricing/?lang=de#pdf-checks");
    expect(
      getPublicNavigationTarget(anchor("/pricing/?lang=lb"), publicPage)?.href,
    ).toBe("https://guteneo.com/pricing/?lang=lb");
    expect(
      getPublicNavigationTarget(
        anchor("/pricing/"),
        new URL("https://guteneo.com/"),
      )?.href,
    ).toBe("https://guteneo.com/pricing/");
  });
  it.each([
    ["https://engineering.guteneo.com/", {}],
    ["https://status.guteneo.com/", {}],
    ["https://other.invalid/pricing/", {}],
    ["mailto:help@guteneo.com", {}],
    ["#installation", {}],
    ["/?lang=de#installation", {}],
    ["/pricing/", { target: "_blank" }],
    ["/pricing/", { target: "named-window" }],
    ["/pricing/", { download: "" }],
    ["/pricing/", { rel: "external" }],
    ["/pricing/", { "data-public-navigation": "native" }],
  ] as const)(
    "preserves native semantics for %s with %j",
    (href, attributes) => {
      expect(
        getPublicNavigationTarget(anchor(href, attributes), publicPage),
      ).toBeNull();
    },
  );
  it("never starts public enhancement from a private or credential-bearing source", () => {
    for (const path of [
      "/#/app",
      "/?code=private",
      "/invitation/",
      "/auth/login",
    ])
      expect(
        getPublicNavigationTarget(
          anchor("/pricing/"),
          new URL(path, publicPage),
        ),
      ).toBeNull();
    expect(
      getPublicNavigationTarget(
        anchor("/pricing/", { target: "_SELF" }),
        publicPage,
      )?.pathname,
    ).toBe("/pricing/");
  });
  it("enhances ordinary mouse and keyboard activation only", () => {
    expect(isPublicNavigationClick(ordinaryClick)).toBe(true);
    for (const variation of [
      { button: 1 },
      { button: 2 },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { defaultPrevented: true },
    ])
      expect(isPublicNavigationClick({ ...ordinaryClick, ...variation })).toBe(
        false,
      );
  });
});

function browserFixture() {
  const events = new Map<string, (event: Event) => void>();
  const rootAttributes = new Map<string, string>();
  const root = {
    setAttribute: (key: string, value: string) =>
      rootAttributes.set(key, value),
    removeAttribute: (key: string) => rootAttributes.delete(key),
  };
  const assign = vi.fn();
  const location = Object.assign(new URL(publicPage), { assign });
  const eventTarget = new EventTarget();
  const history = {
    state: { incumbent: "preserved" } as Record<string, unknown>,
    replaceState: vi.fn((state: Record<string, unknown>) => {
      history.state = state;
    }),
    pushState: vi.fn((state: Record<string, unknown>, _: string, url: URL) => {
      history.state = state;
      location.href = url.href;
    }),
  };
  vi.stubGlobal("Element", Anchor);
  vi.stubGlobal("document", {
    getElementById: () => root,
    addEventListener: (name: string, handler: (event: Event) => void) =>
      events.set(name, handler),
    removeEventListener: (name: string) => events.delete(name),
  });
  vi.stubGlobal("window", {
    location,
    history,
    scrollX: 0,
    scrollY: 420,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });
  const connection = { saveData: false };
  vi.stubGlobal("navigator", { connection });
  const activate = (href: string, type = "click") => {
    const preventDefault = vi.fn();
    events.get(type)?.({
      ...ordinaryClick,
      type,
      target: anchor(href),
      preventDefault,
    } as unknown as Event);
    return preventDefault;
  };
  return {
    activate,
    assign,
    connection,
    events,
    history,
    location,
    rootAttributes,
  };
}

describe("bounded public navigation lifecycle", () => {
  it("pushes a public destination synchronously and preserves incumbent history state", () => {
    const browser = browserFixture();
    const stop = installPublicNavigation();
    expect(browser.activate("/pricing/")).toHaveBeenCalledOnce();
    expect(browser.location.href).toBe("https://guteneo.com/pricing/?lang=de");
    expect(browser.history.pushState).toHaveBeenCalledOnce();
    expect(browser.history.replaceState.mock.calls[0][0].incumbent).toBe(
      "preserved",
    );
    expect(browser.assign).not.toHaveBeenCalled();
    stop();
    expect(browser.events.size).toBe(0);
  });
  it("leaves authentication, external origins, downloads and unknown routes to the browser", () => {
    const browser = browserFixture();
    const stop = installPublicNavigation();
    for (const href of [
      "/auth/login",
      "/#/app/my-documents",
      "/unknown/",
      "https://engineering.guteneo.com/",
    ])
      expect(browser.activate(href)).not.toHaveBeenCalled();
    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(browser.assign).not.toHaveBeenCalled();
    stop();
  });
  it("does not install speculative pointer or focus reads and removes its listener on teardown", () => {
    const browser = browserFixture();
    const stop = installPublicNavigation();
    expect(browser.events.has("pointerover")).toBe(false);
    expect(browser.events.has("focusin")).toBe(false);
    stop();
    browser.activate("/pricing/");
    expect(browser.history.pushState).not.toHaveBeenCalled();
  });
});
