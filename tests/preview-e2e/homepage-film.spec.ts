import { test, expect, type Page } from "@playwright/test";
import { supportedLocales } from "../../packages/contracts/src/locale";
import { publicFilmAsset } from "../../packages/contracts/src/public-videos";

type Call = { name: string; active: boolean; src: string };
type FilmWindow = Window & { filmCalls: Call[] };

async function mockPlayer(
  page: Page,
  mode: "standard" | "native-retry" | "refused" | "play-error" = "standard",
) {
  await page.addInitScript((mode) => {
    const calls: Call[] = [];
    (window as unknown as FilmWindow).filmCalls = calls;
    function record(name: string, player: HTMLVideoElement) {
      calls.push({
        name,
        active: navigator.userActivation.isActive,
        src: player.getAttribute("src") ?? "",
      });
    }
    Object.defineProperty(HTMLVideoElement.prototype, "requestFullscreen", {
      configurable: true,
      value: function (this: HTMLVideoElement) {
        record("fullscreen", this);
        return mode === "native-retry" || mode === "refused"
          ? Promise.reject(new Error("Fullscreen declined"))
          : Promise.resolve();
      },
    });
    if (mode === "native-retry") {
      let nativeAttempts = 0;
      Object.defineProperty(
        HTMLVideoElement.prototype,
        "webkitEnterFullscreen",
        {
          configurable: true,
          value: function (this: HTMLVideoElement) {
            record("native-fullscreen", this);
            if (++nativeAttempts === 1) throw new Error("Metadata not ready");
          },
        },
      );
    } else {
      Object.defineProperty(
        HTMLVideoElement.prototype,
        "webkitEnterFullscreen",
        {
          configurable: true,
          value: undefined,
        },
      );
    }
    Object.defineProperty(HTMLVideoElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLVideoElement) {
        record("play", this);
        return mode === "play-error"
          ? Promise.reject(new Error("Media unavailable"))
          : Promise.resolve();
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "pause", {
      configurable: true,
      value: function (this: HTMLVideoElement) {
        if (this.getAttribute("src")) record("pause", this);
      },
    });
  }, mode);
  // These tests isolate browser interaction from large production assets.
  await page.route("**/videos/*.mp4", (route) => route.abort());
}

for (const locale of supportedLocales) {
  for (const film of ["introduction", "roles"] as const) {
    test(`${film} selects the ${locale} movie and poster only after a gesture`, async ({
      page,
    }) => {
      await mockPlayer(page);
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith(".mp4")) requests.push(request.url());
      });
      await page.goto(`${film === "roles" ? "/roles/" : "/"}?lang=${locale}`);
      const section = page.locator(`[data-film="${film}"]`);
      const player = section.locator("video");
      const format =
        film === "roles" || page.viewportSize()!.width > 767
          ? "horizontal"
          : "vertical";
      const asset = publicFilmAsset(film, locale, format);
      await expect(section).toHaveAttribute("lang", locale);
      await expect(player).toHaveAttribute("lang", locale);
      await expect(player).not.toHaveAttribute("src");
      if (film === "introduction") {
        const captions = player.locator('track[kind="captions"]');
        await expect(captions).toHaveAttribute(
          "src",
          `/videos/guteneo-v5.${locale}.vtt`,
        );
        await expect(captions).toHaveAttribute("srclang", locale);
      }
      await expect
        .poll(() =>
          section
            .locator(".homepage-film-poster img")
            .evaluate((image) => (image as HTMLImageElement).currentSrc),
        )
        .toContain(asset.poster);
      await expect
        .poll(() =>
          section
            .locator(".homepage-film-poster img")
            .evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      expect(requests).toEqual([]);
      await section.locator(".homepage-film-play").click();
      await expect(player).toHaveAttribute("src", asset.movie);
      await expect(section.locator(".homepage-film-frame")).toHaveAttribute(
        "data-format",
        format,
      );
      await page.setViewportSize({
        width: format === "vertical" ? 1280 : 390,
        height: 800,
      });
      await expect(player).toHaveAttribute("src", asset.movie);
    });
  }

  test(`${locale} announces a localized playback error without substituting a French film`, async ({
    page,
  }) => {
    await mockPlayer(page, "play-error");
    await page.goto(`/?lang=${locale}`);
    const section = page.locator('[data-film="introduction"]');
    await section.locator(".homepage-film-play").click();
    await expect(section.getByRole("alert")).toBeVisible();
    const format = page.viewportSize()!.width > 767 ? "horizontal" : "vertical";
    await expect(section.locator("video")).toHaveAttribute(
      "src",
      publicFilmAsset("introduction", locale, format).movie,
    );
    await section.getByRole("alert").getByRole("button").click();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as FilmWindow).filmCalls.filter(
            (call) => call.name === "play",
          ).length,
      ),
    ).toBe(2);
  });
}

for (const film of ["introduction", "roles"] as const) {
  test(`${film} stops its old language and returns to a lazy poster after a language change`, async ({
    page,
  }) => {
    await mockPlayer(page);
    await page.goto(`${film === "roles" ? "/roles/" : "/"}?lang=en`);
    const section = page.locator(`[data-film="${film}"]`);
    await section.locator(".homepage-film-play").click();
    const source = await section.locator("video").getAttribute("src");
    await page.locator('header select[name="language"]').selectOption("de");
    await expect(section).toHaveAttribute("data-locale", "de");
    await expect(section.locator("video")).not.toHaveAttribute("src");
    await expect(section.locator("video")).toBeHidden();
    if (film === "introduction")
      await expect(section.locator('track[kind="captions"]')).toHaveAttribute(
        "src",
        "/videos/guteneo-v5.de.vtt",
      );
    expect(
      await page.evaluate(() =>
        (window as unknown as FilmWindow).filmCalls.some(
          (call) => call.name === "pause" && call.src.includes("-en.mp4"),
        ),
      ),
    ).toBe(true);
    await section.locator(".homepage-film-play").click();
    await expect(section.locator("video")).not.toHaveAttribute("src", source!);
    await expect(section.locator("video")).toHaveAttribute("src", /-de\.mp4$/);
  });
}

test("a saved browser language selects the matching film and poster", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("guteneo.locale", "lb"),
  );
  await mockPlayer(page);
  await page.goto("/");
  const section = page.locator('[data-film="introduction"]');
  await expect(section).toHaveAttribute("data-locale", "lb");
  await expect(section.locator("video")).not.toHaveAttribute("src");
  await section.locator(".homepage-film-play").click();
  await expect(section.locator("video")).toHaveAttribute("src", /-lb\.mp4$/);
});

test("loads no movie before a gesture, chooses the current screen, and keeps it through rotation", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) requests.push(request.url());
  });
  await mockPlayer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const player = page.locator(".homepage-film-video");
  await expect(
    page.getByRole("button", { name: /Découvrir le film/ }),
  ).toBeVisible();
  await expect(player).not.toHaveAttribute("src");
  const captions = player.locator('track[kind="captions"]');
  await expect(captions).toHaveAttribute("src", "/videos/guteneo-v5.fr.vtt");
  await expect(captions).toHaveAttribute("srclang", "fr");
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect(player).toHaveAttribute(
    "src",
    "/videos/guteneo-vertical-v5.mp4",
  );
  const calls = await page.evaluate(
    () => (window as unknown as FilmWindow).filmCalls,
  );
  expect(calls.map((call) => call.name)).toEqual(["play", "fullscreen"]);
  expect(calls.every((call) => call.active)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(player).toHaveAttribute(
    "src",
    "/videos/guteneo-vertical-v5.mp4",
  );
  await page.getByRole("button", { name: "Fermer le lecteur" }).click();
  await expect(player).not.toHaveAttribute("src");
  await expect(
    page.getByRole("button", { name: /Découvrir le film/ }),
  ).toBeFocused();
  await page.getByRole("button", { name: /Découvrir le film/ }).press("Enter");
  await expect(player).toHaveAttribute(
    "src",
    "/videos/guteneo-horizontal-v5.mp4",
  );
});

test("keeps native controls available when fullscreen is refused", async ({
  page,
}) => {
  await mockPlayer(page, "refused");
  await page.goto("/");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  const player = page.locator(".homepage-film-video");
  await player.dispatchEvent("playing");
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("controls", "");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Plein écran", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as FilmWindow).filmCalls.filter(
          (call) => call.name === "fullscreen",
        ).length,
    ),
  ).toBe(2);
});

test("a phone opened in landscape still receives the portrait movie and poster", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "iphone", "Requires a touch phone profile");
  await mockPlayer(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect
    .poll(() =>
      page
        .locator(".homepage-film-poster img")
        .evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toContain("guteneo-vertical-v5.webp");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect(page.locator(".homepage-film-video")).toHaveAttribute(
    "src",
    "/videos/guteneo-vertical-v5.mp4",
  );
});

test("retries Safari native fullscreen once playback is ready", async ({
  page,
}) => {
  await mockPlayer(page, "native-retry");
  await page.goto("/");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as FilmWindow).filmCalls.filter(
            (call) => call.name === "native-fullscreen",
          ).length,
      ),
    )
    .toBe(1);
  await page.locator(".homepage-film-video").dispatchEvent("playing");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as FilmWindow).filmCalls.filter(
            (call) => call.name === "native-fullscreen",
          ).length,
      ),
    )
    .toBe(2);
  await page.locator(".homepage-film-video").dispatchEvent("playing");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as FilmWindow).filmCalls.filter(
          (call) => call.name === "native-fullscreen",
        ).length,
    ),
  ).toBe(2);
});

test("can replay the finished film and close it with keyboard focus restored", async ({
  page,
}) => {
  await mockPlayer(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  const player = page.locator(".homepage-film-video");
  await player.dispatchEvent("playing");
  await player.dispatchEvent("ended");
  const replay = page.getByRole("button", { name: /Revoir le film/ });
  await expect(replay).toBeFocused();
  await replay.press("Space");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as FilmWindow).filmCalls.filter(
          (call) => call.name === "play",
        ).length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Fermer le lecteur" }).click();
  await expect(
    page.getByRole("button", { name: /Découvrir le film/ }),
  ).toBeFocused();
  await expect(player).toBeHidden();
});

test("a playback failure is announced and can be retried", async ({ page }) => {
  await mockPlayer(page, "play-error");
  await page.goto("/");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Vérifiez votre connexion",
  );
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as FilmWindow).filmCalls.filter(
          (call) => call.name === "play",
        ).length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Fermer le lecteur" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test.describe("delivered public media", () => {
  // These cases play audible media and request native fullscreen. Keep them
  // in one worker so another real-media case cannot change focus or audio.
  test.describe.configure({ mode: "default" });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const player = page.locator(".homepage-film-video");
    if (!(await player.count())) return;
    const state = await player.evaluate((element) => {
      const video = element as HTMLVideoElement & {
        webkitDisplayingFullscreen?: boolean;
        publicMediaEvents?: Array<Record<string, unknown>>;
      };
      const rect = video.getBoundingClientRect();
      return {
        source: video.getAttribute("src"),
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        ended: video.ended,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error?.code ?? null,
        visibility: document.visibilityState,
        fullscreen: document.fullscreenElement === video,
        nativeFullscreen: video.webkitDisplayingFullscreen ?? false,
        events: video.publicMediaEvents ?? [],
        viewport: { width: innerWidth, height: innerHeight },
        rect: { top: rect.top, bottom: rect.bottom, width: rect.width },
        buffered: Array.from({ length: video.buffered.length }, (_, index) => [
          video.buffered.start(index),
          video.buffered.end(index),
        ]),
      };
    });
    await testInfo.attach("public-media-state", {
      body: JSON.stringify(state, null, 2),
      contentType: "application/json",
    });
  });

  for (const locale of supportedLocales) {
    for (const film of ["introduction", "roles"] as const) {
      test(`${film} ${locale} decodes and seeks its delivered final card without browser API mocks`, async ({
        page,
      }) => {
        await page.goto(`${film === "roles" ? "/roles/" : "/"}?lang=${locale}`);
        const section = page.locator(`[data-film="${film}"]`);
        const portrait =
          film === "introduction" && page.viewportSize()!.width <= 767;
        const format = portrait ? "vertical" : "horizontal";
        const player = section.locator("video");
        await expect(player).toHaveAttribute("playsinline", "");
        if (film === "introduction")
          await player.evaluate((element) => {
            (element as HTMLVideoElement).textTracks[0].mode = "hidden";
          });
        await player.evaluate((element) => {
          const video = element as HTMLVideoElement & {
            publicMediaEvents?: Array<Record<string, unknown>>;
          };
          video.publicMediaEvents = [];
          for (const event of [
            "play",
            "playing",
            "pause",
            "waiting",
            "stalled",
            "suspend",
            "loadedmetadata",
            "loadeddata",
            "canplay",
            "seeking",
            "seeked",
            "error",
            "ended",
            "webkitbeginfullscreen",
            "webkitendfullscreen",
          ]) {
            video.addEventListener(event, () => {
              video.publicMediaEvents?.push({
                event,
                currentTime: video.currentTime,
                paused: video.paused,
                readyState: video.readyState,
                error: video.error?.code ?? null,
                visibility: document.visibilityState,
                fullscreen: document.fullscreenElement === video,
              });
            });
          }
        });
        await section.locator(".homepage-film-play").click();
        await expect
          .poll(
            () =>
              player.evaluate(
                (element) => (element as HTMLVideoElement).currentTime,
              ),
            { timeout: 20000 },
          )
          .toBeGreaterThan(0.2);
        if (film === "introduction")
          await expect
            .poll(() =>
              player.evaluate(
                (element) =>
                  (element as HTMLVideoElement).textTracks[0].cues?.length,
              ),
            )
            .toBeGreaterThan(0);
        const media = await player.evaluate((element) => {
          const video = element as HTMLVideoElement;
          return {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            source: video.getAttribute("src"),
          };
        });
        expect(media.width).toBe(portrait ? 1320 : 1920);
        expect(media.height).toBe(portrait ? 2868 : 1080);
        expect(
          Math.abs(media.duration - (film === "roles" ? 36 : 56)),
        ).toBeLessThan(0.1);
        expect(media.source).toBe(publicFilmAsset(film, locale, format).movie);
        const finalCard = film === "roles" ? 33 : 53;
        await player.evaluate((element, time) => {
          (element as HTMLVideoElement).currentTime = time;
        }, finalCard);
        await expect
          .poll(
            () =>
              player.evaluate(
                (element) => (element as HTMLVideoElement).currentTime,
              ),
            { timeout: 20000 },
          )
          .toBeGreaterThan(finalCard - 0.5);
        await expect
          .poll(
            () =>
              player.evaluate(
                (element) => (element as HTMLVideoElement).readyState,
              ),
            { timeout: 20000 },
          )
          .toBeGreaterThan(1);
        // Native iPhone controls may pause after a scripted seek. It must still
        // decode the final card; desktop also continues playback from that frame.
        if (page.viewportSize()!.width > 767)
          await expect
            .poll(
              () =>
                player.evaluate(
                  (element) => (element as HTMLVideoElement).currentTime,
                ),
              { timeout: 20000 },
            )
            .toBeGreaterThan(finalCard + 0.2);
        await player.evaluate(async (element) => {
          if (document.fullscreenElement) await document.exitFullscreen();
          const video = element as HTMLVideoElement & {
            webkitDisplayingFullscreen?: boolean;
            webkitExitFullscreen?: () => void;
          };
          if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
        });
        await section.locator(".homepage-film-toolbar button").last().click();
        await expect(player).not.toHaveAttribute("src");
        await expect(section.locator(".homepage-film-play")).toBeFocused();
      });
    }
  }
});
