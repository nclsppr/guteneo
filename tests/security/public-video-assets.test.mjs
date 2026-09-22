import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public film manifest describes the exact deployed MP4 bytes and fast-start layout", async () => {
  const root = new URL("../../", import.meta.url);
  const manifest = JSON.parse(
    await readFile(
      new URL("apps/api/src/public-video-manifest.json", root),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(manifest).sort(), [
    "/videos/guteneo-horizontal-v5.mp4",
    "/videos/guteneo-vertical-v5.mp4",
  ]);
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
