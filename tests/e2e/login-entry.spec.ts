import { mkdir, readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as base, type Page } from "@playwright/test";

const origin = "https://login-ui.example.test";
const buildDirectory = fileURLToPath(
  new URL("../../dist/web/", import.meta.url),
);
const assetTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".vtt": "text/vtt; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

async function builtPublicResource(url: URL) {
  const hashedAsset = url.pathname.startsWith("/assets/");
  if (
    url.search ||
    url.hash ||
    !(hashedAsset
      ? /^\/assets\/[A-Za-z0-9._-]+$/.test(url.pathname)
      : /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(url.pathname))
  )
    throw new Error("Invalid built asset path.");
  const contentType = assetTypes[extname(url.pathname)];
  if (!contentType) throw new Error("Unsupported built asset type.");
  const directory = await realpath(buildDirectory);
  const file = await realpath(resolve(directory, "." + url.pathname));
  // Validate the physical path too: a symlink must not escape the build assets.
  const permittedDirectory =
    directory + sep + (hashedAsset ? "assets" + sep : "");
  if (!file.startsWith(permittedDirectory))
    throw new Error(
      "Built public resource is outside its permitted directory.",
    );
  return { contentType, body: await readFile(file) };
}

type RetainedResource = { requested: Promise<void>; release: () => void };
type RetentionGate = { requested: () => void; released: Promise<void> };

type HostedEntry = {
  requestOrigin: string;
  authRequests: string[];
  registrationEnabled: boolean;
  capabilitiesStatus: number;
  authenticated: boolean;
  logoutStatus: number;
  logoutRequests: number;
  deliveredBuildPaths: string[];
  httpProxyPaths: string[];
  retainBuiltResource: (path: string) => RetainedResource;
  retainHttpProxy: (path: string) => RetainedResource;
  drainStaticProxies: () => Promise<void>;
};

const hostedSession = {
  user: {
    id: "hosted-entry-user",
    name: "Hosted account",
    role: "member",
    preferredLocale: "en",
  },
  organization: { id: "hosted-entry-org", name: "Hosted workshop" },
  csrfToken: "fixture-csrf",
  simulation: false,
  verifiedAccount: true,
};

const test = base.extend<{ hosted: HostedEntry }>({
  hosted: async ({ page, baseURL }, use) => {
    const staticProxies = new Set<Promise<void>>();
    const retainedResources = new Map<string, RetentionGate>();
    const retainedHttpProxies = new Map<string, RetentionGate>();
    const retain = (gates: Map<string, RetentionGate>, path: string) => {
      let requested!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        requested = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.set(path, { requested, released });
      return { requested: ready, release };
    };
    const drainStaticProxies = async () => {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            while (staticProxies.size) await Promise.all([...staticProxies]);
          })(),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () =>
                reject(
                  new Error(
                    "Local static proxy did not drain within 5 seconds.",
                  ),
                ),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    };
    const state: HostedEntry = {
      requestOrigin: origin,
      authRequests: [],
      registrationEnabled: true,
      capabilitiesStatus: 200,
      authenticated: false,
      logoutStatus: 200,
      logoutRequests: 0,
      deliveredBuildPaths: [],
      httpProxyPaths: [],
      retainBuiltResource: (path) => retain(retainedResources, path),
      retainHttpProxy: (path) => retain(retainedHttpProxies, path),
      drainStaticProxies,
    };
    const unexpected: string[] = [];
    // A reserved origin exercises the hosted sign-in surface. Every browser
    // request is intercepted, including any attempted third-party navigation.
    // Public scripts/images use the frozen build. Documents retain the local
    // server's response headers; API/authentication guards remain independent.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.origin === state.requestOrigin &&
        url.pathname === "/api/logout" &&
        request.method() === "POST"
      ) {
        state.logoutRequests++;
        if (state.logoutStatus === 200) state.authenticated = false;
        await route.fulfill({
          status: state.logoutStatus,
          json:
            state.logoutStatus === 200
              ? { signedOut: true }
              : {
                  error: {
                    code: "LOGOUT_UNAVAILABLE",
                    message: "Sign-out unavailable.",
                  },
                },
        });
      } else if (
        url.origin !== state.requestOrigin ||
        request.method() !== "GET"
      ) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.fulfill({
          status: 403,
          body: "Blocked by the UI fixture.",
        });
      } else if (url.pathname === "/api/personal/session") {
        // The unified account bootstrap probes personal authority after an
        // unauthenticated workshop response. This fixture has neither session.
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Connectez-vous.",
            },
          },
        });
      } else if (url.pathname === "/api/session") {
        await route.fulfill(
          state.authenticated
            ? { json: hostedSession }
            : {
                status: 401,
                json: {
                  error: {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "Connectez-vous.",
                  },
                },
              },
        );
      } else if (
        state.authenticated &&
        url.pathname === "/api/account/workspaces"
      ) {
        await route.fulfill({
          json: {
            items: [
              {
                ...hostedSession.organization,
                role: hostedSession.user.role,
                current: true,
              },
            ],
          },
        });
      } else if (
        state.authenticated &&
        ["/api/account/sessions", "/api/account/contacts"].includes(
          url.pathname,
        )
      ) {
        await route.fulfill({ json: { items: [], hasMore: false } });
      } else if (
        state.authenticated &&
        url.pathname === "/api/account/expert-approval"
      ) {
        await route.fulfill({
          json: { connections: [], canManage: false },
        });
      } else if (url.pathname === "/api/capabilities") {
        await route.fulfill({
          status: state.capabilitiesStatus,
          json:
            state.capabilitiesStatus === 200
              ? { registration: { enabled: state.registrationEnabled } }
              : { error: { code: "UNAVAILABLE", message: "Unavailable." } },
        });
      } else if (["/auth/login", "/auth/signup"].includes(url.pathname)) {
        state.authRequests.push(url.href);
        // A 204 navigation leaves the current document intact so that the
        // pending state and a restored pageshow can be tested without Auth0.
        await route.fulfill({ status: 204 });
      } else if (/^\/(api|auth|oauth|mcp)(\/|$)/.test(url.pathname)) {
        unexpected.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 403,
          body: "Blocked by the UI fixture.",
        });
      } else {
        const fromBuild =
          request.resourceType() !== "document" &&
          (url.pathname.startsWith("/assets/") ||
            Boolean(assetTypes[extname(url.pathname)]));
        const proxy = (async () => {
          try {
            if (fromBuild) {
              const retained = retainedResources.get(url.pathname);
              retained?.requested();
              if (retained) await retained.released;
              await route.fulfill({
                status: 200,
                ...(await builtPublicResource(url)),
              });
              state.deliveredBuildPaths.push(url.pathname);
            } else {
              state.httpProxyPaths.push(url.pathname);
              const retained = retainedHttpProxies.get(url.pathname);
              retained?.requested();
              if (retained) await retained.released;
              const response = await route.fetch({
                url: new URL(url.pathname + url.search, baseURL).href,
                maxRedirects: 0,
                timeout: 5000,
              });
              await route.fulfill({ response });
            }
          } catch {
            // Do not leave a failed route to resolve the reserved fixture host.
            // Paths, queries and underlying transport errors may carry secrets.
            await route.abort("failed").catch(() => undefined);
            throw new Error(
              fromBuild
                ? "Hosted entry fixture could not deliver a built public resource."
                : `Hosted entry fixture local static proxy failed before fulfillment (${request.resourceType()}).`,
            );
          }
        })();
        staticProxies.add(proxy);
        try {
          await proxy;
        } finally {
          staticProxies.delete(proxy);
        }
      }
    });
    try {
      await use(state);
    } finally {
      // Finish fetch + fulfill while the route still exists. Removing handlers
      // with a proxy in flight can continue its request before fulfill returns.
      await drainStaticProxies();
      await page.unrouteAll({ behavior: "wait" });
      expect(unexpected).toEqual([]);
    }
  },
});

test("explicit sign-out returns to the public site without reopening SSO and keeps private entry direct", async ({
  page,
  hosted,
}) => {
  hosted.authenticated = true;
  hosted.logoutStatus = 503;
  await page.goto(`${origin}/?lang=en#/app/account`);
  await expect(page.locator("#account-name")).toHaveValue("Hosted account");
  // V2 keeps sign-out in the account menu at every viewport.
  const account = page.locator(".workspace-identity-trigger");
  const logout = page
    .locator(".workspace-identity-menu")
    .getByRole("button", { name: "Sign out", exact: true });
  await account.click();
  await logout.click();
  await expect(page.getByRole("alert")).toContainText("Sign-out unavailable.");
  await expect(page.locator("#account-name")).toHaveValue("Hosted account");
  expect(hosted.authenticated).toBe(true);
  expect(hosted.authRequests).toEqual([]);
  expect(hosted.logoutRequests).toBe(1);

  hosted.logoutStatus = 200;
  // The focused error closes the menu when focus was inside it.
  await expect(page.getByRole("alert")).toBeFocused();
  if ((await account.getAttribute("aria-expanded")) !== "true")
    await account.click();
  await logout.click();
  // The explicit English choice survives sign-out. The bare public URL is only
  // a navigation intermediate before locale initialization canonicalizes it.
  const publicEnglishUrl = `${origin}/?lang=en`;
  await expect(page).toHaveURL(publicEnglishUrl);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".workspace")).toHaveCount(0);
  expect(hosted.authenticated).toBe(false);
  expect(hosted.logoutRequests).toBe(2);
  expect(hosted.authRequests).toEqual([]);
  await page.reload();
  await expect(page).toHaveURL(publicEnglishUrl);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.locator('.site-header a[href^="/auth/login?"]'),
  ).toHaveCount(2);
  expect(hosted.authRequests).toEqual([]);

  // The simulated Auth0 handoff returns 204 and deliberately opens no document.
  await page.goto(`${origin}/#/app/connection/chatgpt`, {
    waitUntil: "commit",
  });
  await expect.poll(() => hosted.authRequests.length).toBe(1);
  const handoff = new URL(hosted.authRequests[0]);
  expect(handoff.pathname).toBe("/auth/login");
  expect(handoff.searchParams.get("returnTo")).toBe(
    "/#/app/connection/chatgpt",
  );
  await expect(page.locator(".access-panel")).toHaveCount(0);
});

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

const locales = [
  {
    code: "fr",
    title: "Reprenons la connexion.",
    login: "Se connecter",
    signup: "Créer un compte",
    back: "Retour au site",
    error: "La connexion n’a pas abouti. Vous pouvez réessayer.",
  },
  {
    code: "en",
    title: "Let’s try signing in again.",
    login: "Sign in",
    signup: "Create an account",
    back: "Back to the website",
    error: "Sign-in did not complete. You can try again.",
  },
  {
    code: "de",
    title: "Versuchen wir die Anmeldung erneut.",
    login: "Anmelden",
    signup: "Konto erstellen",
    back: "Zurück zur Website",
    error:
      "Die Anmeldung wurde nicht abgeschlossen. Sie können es erneut versuchen.",
  },
  {
    code: "lb",
    title: "Probéiere mir d’Umeldung nach eng Kéier.",
    login: "Aloggen",
    signup: "E Kont erstellen",
    back: "Zréck op de Site",
    error:
      "D’Umeldung gouf net ofgeschloss. Dir kënnt et nach eng Kéier probéieren.",
  },
] as const;

for (const copy of locales) {
  test(`${copy.code}: recovery keeps one clear action and the requested destination`, async ({
    page,
    hosted,
  }, info) => {
    for (const destination of [
      "/#/app",
      "/#/app/connection/chatgpt",
      "/#/app/prepare?entry=direct",
    ]) {
      await page.goto("about:blank");
      await page.goto(
        `${origin}/?auth=LOGIN_EXCHANGE_FAILED&lang=${copy.code}${destination.slice(1)}`,
      );
      await expect(page.locator("html")).toHaveAttribute("lang", copy.code);
      await expect(
        page.getByRole("status").filter({ hasText: copy.error }),
      ).toBeVisible();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(copy.title);
      const login = page.getByRole("link", { name: copy.login, exact: true });
      const signup = page.getByRole("link", { name: copy.signup, exact: true });
      await expect(login).toBeVisible();
      await expect(signup).toBeVisible();
      await expect(page.locator("main a.primary")).toHaveCount(1);
      await expect(login).toHaveClass(/\bprimary\b/);
      await expect(signup).not.toHaveClass(/\bprimary\b/);
      for (const [link, intent] of [
        [login, "login"],
        [signup, "signup"],
      ] as const) {
        const href = new URL((await link.getAttribute("href"))!, origin);
        expect(href.origin).toBe(origin);
        expect(href.pathname).toBe(`/auth/${intent}`);
        expect(href.searchParams.get("returnTo")).toBe(destination);
        expect(href.searchParams.get("locale")).toBe(copy.code);
        expect(href.searchParams.get("fresh")).toBe(
          intent === "login" ? "1" : null,
        );
      }
      await expect(
        page.locator(".organization-button, .simulation-stamp"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: copy.back, exact: true }),
      ).toHaveAttribute("href", "/");
      await noHorizontalOverflow(page);
    }
    if (copy.code === "lb") {
      await expect(
        page.getByText(
          "Auth0 ënnerstëtzt kee Lëtzebuergesch. Fir dëse Schrëtt gëtt eng aner Sprooch benotzt.",
          { exact: true },
        ),
      ).toBeVisible();
    }
    if (copy.code === "fr") {
      await page.evaluate(() => document.fonts.ready);
      await mkdir("/tmp/guteneo-signin-proof", { recursive: true });
      await page.screenshot({
        path: `/tmp/guteneo-signin-proof/${info.project.name}-fr.png`,
        fullPage: true,
      });
    }
    // Every locale is also checked at the narrowest supported phone width.
    await page.setViewportSize({ width: 320, height: 740 });
    await noHorizontalOverflow(page);
    await expect(
      page.getByRole("link", { name: copy.login, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: copy.signup, exact: true }),
    ).toBeVisible();
    if (copy.code === "fr") {
      await page.screenshot({
        path: `/tmp/guteneo-signin-proof/${info.project.name}-fr-320.png`,
        fullPage: true,
      });
    }
    expect(hosted.authRequests).toEqual([]);
  });
}

for (const copy of locales) {
  test(`${copy.code}: workspace entry hands off directly to Auth0 without a choice page`, async ({
    page,
    hosted,
  }, info) => {
    for (const [entry, destination] of [
      ["/#/app", "/#/app"],
      ["/#/app/connection/chatgpt", "/#/app/connection/chatgpt"],
      ["/#/app/prepare?entry=direct", "/#/app/prepare?entry=direct"],
      ["/app", "/#/app"],
      ["/app/prepare?entry=direct", "/#/app/prepare?entry=direct"],
    ]) {
      const entryUrl = new URL(entry, origin);
      entryUrl.searchParams.set("lang", copy.code);
      const priorRequests = hosted.authRequests.length;
      // The intercepted 204 leaves the document alive. Start a fresh visit so
      // consecutive hash routes do not merely reuse its intentional retry guard.
      await page.goto("about:blank");
      await page.goto(entryUrl.href, { waitUntil: "domcontentloaded" });
      await expect
        .poll(() => hosted.authRequests.length)
        .toBe(priorRequests + 1);
      const handoff = new URL(hosted.authRequests[priorRequests]);
      expect(handoff.origin).toBe(origin);
      expect(handoff.pathname).toBe("/auth/login");
      expect(handoff.searchParams.get("locale")).toBe(copy.code);
      expect(handoff.searchParams.get("returnTo")).toBe(destination);
      expect(handoff.searchParams.get("fresh")).toBeNull();
      await expect(page.locator(".access-panel")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: copy.signup, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator(".organization-button, .simulation-stamp"),
      ).toHaveCount(0);
      await noHorizontalOverflow(page);
    }
    // Both public navigation variants bypass the workspace entry document.
    await page.goto(`${origin}/?lang=${copy.code}`);
    const links = page.locator('.site-header a[href^="/auth/login?"]');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      const href = new URL((await link.getAttribute("href"))!, origin);
      expect(href.searchParams.get("locale")).toBe(copy.code);
      expect(href.searchParams.get("returnTo")).toBe("/#/app");
    }
    let visibleLink = page.locator(
      '.site-header a[href^="/auth/login?"]:visible',
    );
    if (!(await visibleLink.count())) {
      await page.locator(".public-menu-toggle").click();
      visibleLink = page.locator(
        '.site-header a[href^="/auth/login?"]:visible',
      );
    }
    const priorRequests = hosted.authRequests.length;
    await visibleLink.click();
    await expect.poll(() => hosted.authRequests.length).toBe(priorRequests + 1);
    expect(new URL(hosted.authRequests[priorRequests]).pathname).toBe(
      "/auth/login",
    );
    if (copy.code === "fr") {
      // Capture the actual transient handoff, never the removed choice screen.
      await page.goto(`${origin}/?lang=fr#/app`, {
        waitUntil: "domcontentloaded",
      });
      await expect
        .poll(() => hosted.authRequests.length)
        .toBe(priorRequests + 2);
      await page.evaluate(() => document.fonts.ready);
      await mkdir("/tmp/guteneo-signin-proof", { recursive: true });
      await page.screenshot({
        path: `/tmp/guteneo-signin-proof/${info.project.name}-direct-fr.png`,
        fullPage: true,
      });
    }
  });
}

test("sign-in and registration announce the handoff once and recover after a cached return", async ({
  page,
  hosted,
}) => {
  for (const intent of ["login", "signup"] as const) {
    await hosted.drainStaticProxies();
    await page.goto(
      `${origin}/?auth=LOGIN_EXCHANGE_FAILED&lang=fr#/app/prepare?entry=direct`,
    );
    const login = page.getByRole("link", { name: "Se connecter", exact: true });
    const signup = page.getByRole("link", {
      name: "Créer un compte",
      exact: true,
    });
    await expect(signup).toBeVisible();
    const selected = intent === "login" ? login : signup;
    const priorRequests = hosted.authRequests.length;
    await selected.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => hosted.authRequests.length).toBe(priorRequests + 1);
    const request = new URL(hosted.authRequests[priorRequests]);
    expect(request.pathname).toBe(`/auth/${intent}`);
    expect(request.searchParams.get("returnTo")).toBe(
      "/#/app/prepare?entry=direct",
    );
    expect(request.searchParams.get("locale")).toBe("fr");
    await expect(
      page.getByRole("status").filter({ hasText: "Redirection vers Auth0…" }),
    ).toBeVisible();
    for (const link of [page.locator('a[href^="/auth/login?"]'), signup]) {
      await expect(link).toHaveAttribute("aria-disabled", "true");
      // Real pointer events bypass Playwright's disabled-actionability guard,
      // proving that repeated activation is blocked by the interface itself.
      const box = (await link.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    expect(hosted.authRequests).toHaveLength(priorRequests + 1);
    if (intent === "login") {
      await expect(
        page.getByRole("link", {
          name: "Ouverture de la connexion…",
          exact: true,
        }),
      ).toHaveAttribute("aria-busy", "true");
    }
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    await expect(login).toBeVisible();
    await expect(login).not.toHaveAttribute("aria-disabled", "true");
    await expect(signup).not.toHaveAttribute("aria-disabled", "true");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Connexion sécurisée par Auth0." }),
    ).toBeVisible();
    await noHorizontalOverflow(page);
    // A cached recovery page stays put until the visitor explicitly retries.
    await hosted.drainStaticProxies();
    await page.reload();
    await expect(signup).toBeVisible();
    expect(hosted.authRequests).toHaveLength(priorRequests + 1);
  }
});

test("unavailable registration keeps sign-in usable and an expired attempt offers a fresh recovery", async ({
  page,
  hosted,
}) => {
  hosted.registrationEnabled = false;
  for (const status of [200, 503]) {
    hosted.capabilitiesStatus = status;
    await page.goto(
      `${origin}/?auth=LOGIN_STATE_INVALID&lang=fr#/app/connection/claude`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Reprenons la connexion.",
    );
    await expect(
      page.getByRole("link", { name: "Créer un compte", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "L’inscription sera disponible dès que le service de connexion sera raccordé.",
        { exact: true },
      ),
    ).toBeVisible();
    const recovery = page.getByRole("link", {
      name: "Se connecter",
      exact: true,
    });
    await expect(recovery).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Votre connexion a expiré. Recommencez pour ouvrir votre espace.",
      }),
    ).toBeVisible();
    const href = new URL((await recovery.getAttribute("href"))!, origin);
    expect(href.searchParams.get("fresh")).toBe("1");
    expect(href.searchParams.get("locale")).toBe("fr");
    expect(href.searchParams.get("returnTo")).toBe("/#/app/connection/claude");
    await noHorizontalOverflow(page);
  }
  await page.getByRole("link", { name: "Se connecter", exact: true }).click();
  await expect.poll(() => hosted.authRequests.length).toBe(1);
  expect(new URL(hosted.authRequests[0]).searchParams.get("fresh")).toBe("1");
  await expect(
    page.getByRole("status").filter({ hasText: "Redirection vers Auth0…" }),
  ).toBeVisible();
});

test("local entry retains the isolated demonstration without an Auth0 redirect", async ({
  page,
  baseURL,
  hosted,
}) => {
  hosted.requestOrigin = new URL(baseURL!).origin;
  await page.goto("/?lang=fr#/app");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Explorez la démonstration",
  );
  await expect(
    page.getByRole("button", { name: /Entrer dans l’espace de travail$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Entrer dans le Studio$/ }),
  ).toBeVisible();
  await expect(page.locator(".simulation-stamp")).toBeVisible();
  await expect(page.locator('a[href^="/auth/"]')).toHaveCount(0);
  expect(hosted.authRequests).toEqual([]);
  await noHorizontalOverflow(page);
});

test("built public scripts bypass held HTTP relays and draining waits for a retained image", async ({
  page,
  baseURL,
  hosted,
}) => {
  hosted.requestOrigin = new URL(baseURL!).origin;
  const script = hosted.retainBuiltResource("/locale-init.js");
  const image = hosted.retainBuiltResource("/brand/guteneo-portrait-128.webp");
  const localeHttp = hosted.retainHttpProxy("/locale-init.js");
  const themeHttp = hosted.retainHttpProxy("/theme-init.js");
  const unexpectedHttp = Promise.race([
    localeHttp.requested,
    themeHttp.requested,
  ]).then(() => {
    throw new Error("A built root script unexpectedly used the HTTP relay.");
  });
  try {
    await page.goto("/?lang=fr#/app", { waitUntil: "commit" });
    await Promise.race([script.requested, unexpectedHttp]);
    expect(hosted.deliveredBuildPaths).not.toContain("/locale-init.js");
    await expect(page.locator(".access-panel")).toHaveCount(0);
    script.release();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Explorez la démonstration",
    );
    // The header may choose a different DPR-specific portrait. Start this
    // exact existing public image after bootstrap, independently of srcset.
    await page.evaluate(() => {
      const retained = new Image(1, 1);
      retained.alt = "";
      retained.src = "/brand/guteneo-portrait-128.webp";
      document.body.appendChild(retained);
    });
    await Promise.race([image.requested, unexpectedHttp]);
    let drained = false;
    const draining = hosted.drainStaticProxies().then(() => {
      drained = true;
    });
    // A browser round trip gives an incorrectly early drain time to resolve;
    // the image remains blocked by its explicit gate, without a timed sleep.
    await page.evaluate(() => document.readyState);
    expect(drained).toBe(false);
    image.release();
    await draining;
    expect(hosted.deliveredBuildPaths).toEqual(
      expect.arrayContaining([
        "/locale-init.js",
        "/theme-init.js",
        "/brand/guteneo-portrait-128.webp",
      ]),
    );
    expect(hosted.authRequests).toEqual([]);
    expect(hosted.httpProxyPaths).toContain("/");
    expect(hosted.httpProxyPaths).not.toContain("/locale-init.js");
    expect(hosted.httpProxyPaths).not.toContain("/theme-init.js");
  } finally {
    script.release();
    image.release();
    localeHttp.release();
    themeHttp.release();
  }
});
