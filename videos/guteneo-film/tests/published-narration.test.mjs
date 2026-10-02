import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildRenderJobs} from '../scripts/render-catalog.mjs';
import {canReuseRenderedJob, preparePublishedNarration, publishNarratedJobs} from '../scripts/published-narration.mjs';
import {videoStreamHash} from '../scripts/mix-narration.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const filmRoot = path.join(repositoryRoot, 'videos/guteneo-film');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const digest = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const catalogs = async () => ({
  source: await json(path.join(filmRoot, 'narration/source-videos.json')),
  active: await json(path.join(repositoryRoot, 'packages/contracts/src/public-videos.json')),
});

test('instrumental locales need no narration cache and unsupported active narration fails closed', async () => {
  const {source, active} = await catalogs();
  const outputRoot = path.join(os.tmpdir(), `guteneo-unwritten-narration-${process.pid}`);
  const options = {filmRoot: '/missing-film', repositoryRoot, sourceCatalog: source, kind: 'roles', outputRoot};
  assert.equal(await preparePublishedNarration({...options, jobs: buildRenderJobs(source, active, ['de'], 'roles')}), null);
  const unsupported = structuredClone(active);
  unsupported.roles.de.movie = '/videos/guteneo-roles-v2-de.mp4';
  await assert.rejects(preparePublishedNarration({...options, jobs: buildRenderJobs(source, unsupported, ['de'], 'roles')}), /No checked-in narration library/);
  await assert.rejects(stat(outputRoot), {code: 'ENOENT'});
});

test('public narration rejects missing or non-web G2 receipts before changing assets', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-published-rejection-'));
  try {
    const {source, active} = await catalogs();
    const library = path.join(temporary, 'film/narration/releases/fr-en-g2');
    await cp(path.join(filmRoot, 'narration/releases/fr-en-g2'), library, {recursive: true});
    const options = {jobs: buildRenderJobs(source, active, ['fr'], 'roles'), filmRoot: path.join(temporary, 'film'),
      repositoryRoot: temporary, sourceCatalog: source, kind: 'roles', outputRoot: path.join(temporary, 'output')};
    const generation = await json(path.join(library, 'generation.json'));
    for (const receipt of [undefined, {...generation.clips['roles-fr/intro'], source: 'api', webGeneration: 2},
      {...generation.clips['roles-fr/intro'], webGeneration: 1}]) {
      const changed = structuredClone(generation);
      if (receipt) changed.clips['roles-fr/intro'] = receipt;
      else delete changed.clips['roles-fr/intro'];
      await writeFile(path.join(library, 'generation.json'), JSON.stringify(changed));
      await assert.rejects(preparePublishedNarration(options), /qualified Generation 2 web receipts/);
      await assert.rejects(stat(options.outputRoot), {code: 'ENOENT'});
      await assert.rejects(stat(path.join(temporary, 'apps/web/public')), {code: 'ENOENT'});
    }
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('renderer publication rebuilds the selected G2 role film and captions without changing source or voice cache', {timeout: 60000}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-published-replay-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('Provider network forbidden during published replay.');};
  try {
    const {source, active} = await catalogs();
    const publicRoot = path.join(temporary, 'apps/web/public');
    await mkdir(path.join(publicRoot, 'videos'), {recursive: true});
    const sourceMovie = path.join(publicRoot, source.roles.fr.movie.slice(1));
    const activeMovie = path.join(publicRoot, active.roles.fr.movie.slice(1));
    await cp(path.join(repositoryRoot, 'apps/web/public', source.roles.fr.movie.slice(1)), sourceMovie);
    await writeFile(activeMovie, 'existing-active-film');
    const cacheFile = path.join(filmRoot, 'narration/releases/fr-en-g2/generation.json');
    const clipFile = path.join(filmRoot, 'narration/releases/fr-en-g2/clips/roles-fr/intro.mp3');
    const before = await Promise.all([digest(sourceMovie), digest(cacheFile), digest(clipFile)]);
    const jobs = buildRenderJobs(source, active, ['fr'], 'roles');
    const manifest = await json(path.join(repositoryRoot, 'apps/api/src/public-video-manifest.json'));
    const prepared = await preparePublishedNarration({jobs, filmRoot, repositoryRoot: temporary, sourceCatalog: source,
      kind: 'roles', outputRoot: path.join(temporary, 'output')});
    assert.equal(await readFile(activeMovie, 'utf8'), 'existing-active-film', 'Preflight must not replace a public film.');
    await writeFile(path.join(prepared.outputDir, 'videos', path.basename(sourceMovie)), 'stale-preflight-candidate');
    const published = await publishNarratedJobs({prepared, jobs, manifest});
    assert.equal(published.length, 1);
    assert.equal(published[0].publicMovie, active.roles.fr.movie);
    assert.equal(await digest(activeMovie), published[0].outputSha256);
    assert.deepEqual(manifest[active.roles.fr.movie], {bytes: published[0].bytes, sha256: published[0].outputSha256});
    assert.equal(await videoStreamHash(activeMovie), await videoStreamHash(sourceMovie));
    assert.deepEqual(await Promise.all([digest(sourceMovie), digest(cacheFile), digest(clipFile)]), before);
    const captions = active.roles.fr.captions.slice(1);
    assert.equal(await readFile(path.join(publicRoot, captions), 'utf8'),
      await readFile(path.join(repositoryRoot, 'apps/web/public', captions), 'utf8'));
    await writeFile(path.join(publicRoot, source.roles.fr.poster.slice(1)), 'existing-poster');
    const reuse = () => canReuseRenderedJob({job: jobs[0], repositoryRoot: temporary, manifest, prepared});
    assert.equal(await reuse(), true);
    await writeFile(path.join(publicRoot, captions), 'WEBVTT\n');
    assert.equal(await reuse(), false, 'Changed caption text must not be reused.');
    await rm(path.join(publicRoot, captions));
    assert.equal(await reuse(), false, 'A missing caption track must be rebuilt.');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, {recursive: true, force: true});
  }
});
