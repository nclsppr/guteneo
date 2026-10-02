import assert from 'node:assert/strict';

const locales = ['fr', 'en', 'de', 'lb'];
const mediaPath = /^\/videos\/[a-z0-9-]+\.mp4$/;
const captionsPath = /^\/videos\/[a-z0-9.-]+\.vtt$/;
export const naturalFrenchRoles = Object.freeze({
  movie: '/videos/guteneo-roles-v3-fr.mp4',
  captions: '/videos/guteneo-roles-v3.fr.vtt',
  source: '/videos/guteneo-roles-natural-c-v1-fr-music.mp4',
  poster: '/videos/guteneo-roles-v3-fr.webp',
  composition: 'Guteneo-Roles-FR-Natural-C',
  library: 'roles-fr-natural-c-v1',
});

export function isNaturalFrenchRoles(job) {
  return job.kind === 'roles' && job.locale === 'fr' && job.activeAsset.movie === naturalFrenchRoles.movie;
}

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
      const natural = locale === 'fr' && original === source.roles.fr && published.movie === naturalFrenchRoles.movie;
      assert.equal(published.poster, natural ? naturalFrenchRoles.poster : original.poster, 'The validated poster must remain attached to its source.');
      if (natural) assert.equal(published.captions, naturalFrenchRoles.captions, 'The natural French film needs its matching captions.');
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
      ...(kind !== 'introduction' ? [{
        id: locale === 'fr' && active.roles.fr.movie === naturalFrenchRoles.movie ? naturalFrenchRoles.composition : `Guteneo-Roles-${suffix}`,
        locale, kind: 'roles', format: 'horizontal',
        asset: locale === 'fr' && active.roles.fr.movie === naturalFrenchRoles.movie
          ? {movie: naturalFrenchRoles.source, poster: naturalFrenchRoles.poster} : source.roles[locale],
        activeAsset: active.roles[locale],
      }] : []),
    ];
  });
}
