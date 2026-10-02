import assert from 'node:assert/strict';

const locales = ['fr', 'en', 'de', 'lb'];
const mediaPath = /^\/videos\/[a-z0-9-]+\.mp4$/;
const captionsPath = /^\/videos\/[a-z0-9.-]+\.vtt$/;

export function validateRenderCatalogs(source, active, manifest) {
  for (const catalog of [source, active]) {
    assert.deepEqual(Object.keys(catalog), ['introduction', 'roles'], 'Unsupported film catalog.');
    assert.deepEqual(Object.keys(catalog.introduction), locales, 'Every introduction locale is required.');
    assert.deepEqual(Object.keys(catalog.roles), locales, 'Every roles locale is required.');
  }
  const movies = [];
  for (const locale of locales) {
    assert.deepEqual(Object.keys(source.introduction[locale]), ['horizontal', 'vertical']);
    assert.deepEqual(Object.keys(active.introduction[locale]), ['horizontal', 'vertical']);
    const suffix = locale === 'fr' ? '' : `-${locale}`;
    for (const format of ['horizontal', 'vertical']) {
      assert.deepEqual(source.introduction[locale][format], {
        movie: `/videos/guteneo-${format}-v5${suffix}.mp4`,
        poster: `/videos/guteneo-${format}-v5${suffix}.webp`,
      }, 'The music-only source catalog must keep the original V5 paths.');
    }
    assert.deepEqual(source.roles[locale], {
      movie: `/videos/guteneo-roles-v1-${locale}.mp4`,
      poster: `/videos/guteneo-roles-v1-${locale}.webp`,
    }, 'The music-only source catalog must keep the original V1 paths.');
    for (const [original, published] of [
      ...['horizontal', 'vertical'].map((format) => [source.introduction[locale][format], active.introduction[locale][format]]),
      [source.roles[locale], active.roles[locale]],
    ]) {
      assert.ok(published && mediaPath.test(published.movie), 'Invalid active film path.');
      assert.equal(published.poster, original.poster, 'The validated poster must remain attached to its source.');
      if (published.movie !== original.movie) {
        assert.ok(captionsPath.test(published.captions), 'A narrated film needs an explicit caption track.');
      } else {
        assert.equal(published.captions, undefined, 'Narration must use a distinct movie path.');
      }
      const entry = manifest?.[published.movie];
      assert.ok(entry && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes < 25 * 1024 * 1024
        && /^[a-f0-9]{64}$/.test(entry.sha256), 'Every active film needs a qualified asset manifest entry.');
      movies.push(published.movie);
    }
  }
  assert.equal(new Set(movies).size, 12, 'Each language and format needs a distinct film.');
  assert.deepEqual(Object.keys(manifest).sort(), movies.sort(), 'The asset manifest must cover only the active catalog.');
}

export function buildRenderJobs(source, active, selectedLocales, kind) {
  return selectedLocales.flatMap((locale) => {
    const suffix = locale.toUpperCase();
    return [
      ...(kind !== 'roles' ? ['horizontal', 'vertical'].map((format) => ({
        id: format === 'horizontal' ? `Guteneo-Horizontal-Vision-${suffix}` : `Guteneo-iPhone-18-Pro-Max-${suffix}`,
        locale, kind: 'introduction', format,
        asset: source.introduction[locale][format], activeAsset: active.introduction[locale][format],
      })) : []),
      ...(kind !== 'introduction' ? [{id: `Guteneo-Roles-${suffix}`, locale, kind: 'roles', format: 'horizontal',
        asset: source.roles[locale], activeAsset: active.roles[locale]}] : []),
    ];
  });
}
