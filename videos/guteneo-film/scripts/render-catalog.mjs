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

export function naturalFilmSpec(kind, locale, format = 'horizontal') {
  if (!locales.includes(locale) || !['introduction', 'roles'].includes(kind)
    || !['horizontal', 'vertical'].includes(format) || (kind === 'roles' && format !== 'horizontal')) {
    throw new Error('Unsupported natural film kind, locale or format.');
  }
  if (kind === 'roles' && locale === 'fr') return {...naturalFrenchRoles, kind, locale, format, width: 1920, height: 1080};
  const introduction = kind === 'introduction';
  const version = introduction ? 8 : 4;
  const prefix = introduction ? format : 'roles';
  return {kind, locale, format, movie: `/videos/guteneo-${prefix}-v${version}-${locale}.mp4`,
    captions: introduction ? `/videos/guteneo-v8.${locale}.vtt` : `/videos/guteneo-roles-v4.${locale}.vtt`,
    source: `/videos/guteneo-${prefix}-natural-c-v1-${locale}-music.mp4`,
    poster: `/videos/guteneo-${prefix}-v${version}-${locale}.webp`,
    composition: introduction ? `Guteneo-${format === 'horizontal' ? 'Horizontal' : 'iPhone'}-Natural-C-${locale.toUpperCase()}`
      : `Guteneo-Roles-${locale.toUpperCase()}-Natural-C`,
    library: `${kind}-${locale}-natural-c-v1`,
    width: format === 'vertical' ? 1320 : 1920, height: format === 'vertical' ? 2868 : 1080,
  };
}

export function isNaturalNarration(job) {
  return job.activeAsset.movie === naturalFilmSpec(job.kind, job.locale, job.format).movie;
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
    for (const [original, published, kind, format] of [
      ...['horizontal', 'vertical'].map((format) => [source.introduction[locale][format], active.introduction[locale][format], 'introduction', format]),
      [source.roles[locale], active.roles[locale], 'roles', 'horizontal'],
    ]) {
      assert.ok(published && mediaPath.test(published.movie), 'Invalid active film path.');
      const spec = naturalFilmSpec(kind, locale, format);
      const natural = published.movie === spec.movie;
      assert.equal(published.poster, natural ? spec.poster : original.poster, 'The validated poster must remain attached to its source.');
      if (natural) assert.equal(published.captions, spec.captions, 'The natural film needs its matching captions.');
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
    const job = (filmKind, format) => {
      const spec = naturalFilmSpec(filmKind, locale, format);
      const activeAsset = filmKind === 'roles' ? active.roles[locale] : active.introduction[locale][format];
      const natural = activeAsset.movie === spec.movie;
      const originalId = filmKind === 'roles' ? `Guteneo-Roles-${suffix}`
        : format === 'horizontal' ? `Guteneo-Horizontal-Vision-${suffix}` : `Guteneo-iPhone-18-Pro-Max-${suffix}`;
      return {id: natural ? spec.composition : originalId, locale, kind: filmKind, format,
        asset: natural ? {movie: spec.source, poster: spec.poster}
          : filmKind === 'roles' ? source.roles[locale] : source.introduction[locale][format], activeAsset};
    };
    return [
      ...(kind !== 'roles' ? ['horizontal', 'vertical'].map((format) => job('introduction', format)) : []),
      ...(kind !== 'introduction' ? [job('roles', 'horizontal')] : []),
    ];
  });
}
