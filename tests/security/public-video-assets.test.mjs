import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public film manifest describes the exact deployed MP4 bytes and fast-start layout", async () => {
  const root = new URL("../../", import.meta.url);
  const catalog = JSON.parse(
    await readFile(
      new URL("packages/contracts/src/public-videos.json", root),
      "utf8",
    ),
  );
  const locales = ["fr", "en", "de", "lb"];
  assert.deepEqual(Object.keys(catalog.introduction), locales);
  assert.deepEqual(Object.keys(catalog.roles), locales);
  const assets = [];
  for (const locale of locales) {
    assert.deepEqual(Object.keys(catalog.introduction[locale]), [
      "horizontal",
      "vertical",
    ]);
    for (const kind of ["introduction", "roles"]) {
      const timeline = JSON.parse(await readFile(new URL(
        `videos/guteneo-film/narration/releases/${kind}-${locale}-natural-c-v1/timeline.json`, root), "utf8"));
      const formats = kind === "introduction" ? ["horizontal", "vertical"] : ["roles"];
      for (const format of formats) {
        const version = kind === "introduction" ? 8 : locale === "fr" ? 3 : 4;
        const asset = kind === "introduction" ? catalog.introduction[locale][format] : catalog.roles[locale];
        assert.deepEqual(asset, {
          movie: `/videos/guteneo-${format}-v${version}-${locale}.mp4`,
          poster: `/videos/guteneo-${format}-v${version}-${locale}.webp`,
          captions: `/videos/guteneo-${kind === "introduction" ? "v8" : `roles-v${version}`}.${locale}.vtt`,
          durationSeconds: timeline.durationSeconds,
        });
        assert.equal(timeline.endCardDurationInFrames, 150, "every film keeps its five second logo");
      }
    }
    assets.push(
      ...Object.values(catalog.introduction[locale]),
      catalog.roles[locale],
    );
  }
  const movies = assets.map((asset) => asset.movie);
  assert.equal(
    new Set(movies).size,
    12,
    "each language and film has its own explicit movie",
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("apps/api/src/public-video-manifest.json", root),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(manifest).sort(), movies.sort());
  for (const asset of assets) {
    assert.match(
      asset.movie,
      /^\/videos\/guteneo-(?:(?:horizontal|vertical)-v8-(?:fr|en|de|lb)|roles-(?:v3-fr|v4-(?:en|de|lb)))\.mp4$/,
    );
    const poster = await readFile(
      new URL(`apps/web/public${asset.poster}`, root),
    );
    assert.equal(
      poster.toString("ascii", 0, 4),
      "RIFF",
      `${asset.poster} is WebP`,
    );
    assert.equal(
      poster.toString("ascii", 8, 12),
      "WEBP",
      `${asset.poster} is WebP`,
    );
    if (asset.captions) {
      const captions = await readFile(
        new URL(`apps/web/public${asset.captions}`, root),
        "utf8",
      );
      assert.ok(captions.startsWith("WEBVTT\n"), `${asset.captions} is WebVTT`);
    }
  }
  for (const [path, asset] of Object.entries(manifest)) {
    const bytes = await readFile(new URL(`apps/web/public${path}`, root));
    assert.ok(
      bytes.length > 0 && bytes.length < 25 * 1024 * 1024,
      `${path} must fit Static Assets`,
    );
    assert.equal(asset.bytes, bytes.length, `${path} manifest length`);
    assert.equal(
      asset.sha256,
      createHash("sha256").update(bytes).digest("hex"),
      `${path} manifest digest`,
    );
    const boxes = [];
    for (let offset = 0; offset < bytes.length;) {
      assert.ok(offset + 8 <= bytes.length, `${path} complete MP4 box`);
      const rawSize = bytes.readUInt32BE(offset);
      const size =
        rawSize === 1
          ? Number(bytes.readBigUInt64BE(offset + 8))
          : rawSize === 0
            ? bytes.length - offset
            : rawSize;
      assert.ok(
        Number.isSafeInteger(size) &&
          size >= 8 &&
          offset + size <= bytes.length,
        `${path} bounded MP4 box`,
      );
      boxes.push(bytes.toString("ascii", offset + 4, offset + 8));
      offset += size;
    }
    assert.equal(boxes[0], "ftyp");
    assert.ok(
      boxes.indexOf("moov") > 0 &&
        boxes.indexOf("moov") < boxes.indexOf("mdat"),
      `${path} starts playback before downloading the film`,
    );
  }
});
