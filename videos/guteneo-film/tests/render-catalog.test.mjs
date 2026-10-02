import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildRenderJobs, validateRenderCatalogs} from '../scripts/render-catalog.mjs';

const root = new URL('../../../', import.meta.url);
const json = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('instrumental render jobs never use the active narrated paths', async () => {
  const source = await json('videos/guteneo-film/narration/source-videos.json');
  const active = await json('packages/contracts/src/public-videos.json');
  const manifest = await json('apps/api/src/public-video-manifest.json');
  assert.doesNotThrow(() => validateRenderCatalogs(source, active, manifest));
  const jobs = buildRenderJobs(source, active, ['fr', 'en', 'de', 'lb'], 'all');
  assert.equal(jobs.length, 12);
  for (const job of jobs.filter((job) => ['fr', 'en'].includes(job.locale))) {
    assert.notEqual(job.asset.movie, job.activeAsset.movie);
    assert.match(job.asset.movie, /-v(?:5|1)(?:-[a-z]{2})?\.mp4$/);
    assert.match(job.activeAsset.movie, /-v(?:6|2)-(?:fr|en)\.mp4$/);
  }
  assert.equal(buildRenderJobs(source, active, ['fr'], 'roles').length, 1);
});

test('corrupt source catalogs and incomplete active manifests fail before rendering', async () => {
  const source = await json('videos/guteneo-film/narration/source-videos.json');
  const active = await json('packages/contracts/src/public-videos.json');
  const manifest = await json('apps/api/src/public-video-manifest.json');
  const corrupt = structuredClone(source);
  corrupt.introduction.fr.horizontal.movie = active.introduction.fr.horizontal.movie;
  assert.throws(() => validateRenderCatalogs(corrupt, active, manifest), /original V5/);
  const incomplete = structuredClone(manifest);
  delete incomplete[active.roles.en.movie];
  assert.throws(() => validateRenderCatalogs(source, active, incomplete), /qualified asset manifest/);
  const noCaptions = structuredClone(active);
  delete noCaptions.roles.fr.captions;
  assert.throws(() => validateRenderCatalogs(source, noCaptions, manifest), /caption track/);
  const extra = {...manifest, '/videos/unqualified.mp4': {bytes: 1, sha256: 'a'.repeat(64)}};
  assert.throws(() => validateRenderCatalogs(source, active, extra), /only the active catalog/);
});
