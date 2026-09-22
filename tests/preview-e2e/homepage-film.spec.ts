import { test, expect, type Page } from "@playwright/test";

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
  }, mode);
  // These tests isolate browser interaction from large production assets.
  await page.route("**/videos/*.mp4", (route) => route.abort());
}

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
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect(player).toHaveAttribute(
    "src",
    "/videos/guteneo-vertical-v5.mp4",
  );
  const calls = await page.evaluate(
    () => (window as unknown as FilmWindow).filmCalls,
  );
  expect(calls.map((call) => call.name)).toEqual(["fullscreen", "play"]);
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

test("plays and seeks the delivered movie without browser API mocks", async ({
  page,
}) => {
  await page.goto("/");
  const phone = page.viewportSize()!.width <= 767;
  const player = page.locator(".homepage-film-video");
  await page.getByRole("button", { name: /Découvrir le film/ }).click();
  await expect
    .poll(
      () =>
        player.evaluate((element) => (element as HTMLVideoElement).currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0.2);
  const media = await player.evaluate((element) => {
    const video = element as HTMLVideoElement;
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      source: video.getAttribute("src"),
    };
  });
  expect(media.width).toBe(phone ? 1320 : 1920);
  expect(media.height).toBe(phone ? 2868 : 1080);
  expect(Math.abs(media.duration - 56)).toBeLessThan(0.1);
  expect(media.source).toBe(
    `/videos/guteneo-${phone ? "vertical" : "horizontal"}-v5.mp4`,
  );
  await player.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 40;
  });
  await expect
    .poll(
      () =>
        player.evaluate((element) => (element as HTMLVideoElement).currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(40.2);
  await player.evaluate(async (element) => {
    if (document.fullscreenElement) await document.exitFullscreen();
    const video = element as HTMLVideoElement & {
      webkitDisplayingFullscreen?: boolean;
      webkitExitFullscreen?: () => void;
    };
    if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
  });
  await page.getByRole("button", { name: "Fermer le lecteur" }).click();
  await expect(player).not.toHaveAttribute("src");
  await expect(
    page.getByRole("button", { name: /Découvrir le film/ }),
  ).toBeFocused();
});
