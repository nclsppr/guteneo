import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildPlan} from '../scripts/generate-narration.mjs';
import {compareDecodedPcm24, qualifyNaturalNarration} from '../scripts/natural-narration.mjs';
import {buildRenderJobs, naturalFrenchRoles} from '../scripts/render-catalog.mjs';
import {canReuseRenderedJob, preparePublishedNarration, publishNarratedJobs} from '../scripts/published-narration.mjs';
import {videoStreamHash} from '../scripts/mix-narration.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const filmRoot = path.join(repositoryRoot, 'videos/guteneo-film');
const library = path.join(filmRoot, 'narration/releases/roles-fr-natural-c-v1');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('PCM24 decoder quantization is bounded while every source sample is retained', () => {
  const canonical = Buffer.alloc(9);
  canonical.writeIntLE(-8000000, 0, 3);
  canonical.writeIntLE(0, 3, 3);
  canonical.writeIntLE(8000000, 6, 3);
  const bounded = Buffer.from(canonical);
  bounded.writeIntLE(8, 3, 3);
  assert.deepEqual(compareDecodedPcm24(canonical, bounded), {decodedSamples: 3, differentSamples: 1, maximumAbsoluteDelta: 8, toleranceLsb: 8});
  bounded.writeIntLE(9, 3, 3);
  assert.throws(() => compareDecodedPcm24(canonical, bounded), /8-LSB/);
  assert.throws(() => compareDecodedPcm24(canonical, canonical.subarray(3)), /sample count/);
});

test('natural C qualifies all selected plugin blocks and exact PCM24 cuts at their native pace', async () => {
  const before = await readFile(path.join(library, 'library.json'));
  const qualified = await qualifyNaturalNarration(library);
  assert.equal(qualified.metadata.sources.length, 3);
  assert.equal(qualified.plan.clips.length, 6);
  assert.equal(qualified.plan.outputFormat, 'pcm_s24le');
  assert.equal(qualified.metadata.voice.voiceId, 'm5U7XCsc8v988k2RJAqN');
  assert.deepEqual(qualified.metadata.musicPolicy, {mode: 'constant', gain: 0.22});
  assert.equal(qualified.manifest.narrations[0].durationSeconds, 1346 / 30);
  assert.equal(qualified.manifest.narrations[0].endCardStartSeconds, 1196 / 30);
  assert.equal(qualified.plan.clips.reduce((sum, clip) => sum + clip.actualDurationSeconds, 0), 34.32);
  assert.deepEqual(await readFile(path.join(library, 'library.json')), before, 'Qualification never rewrites source provenance.');
});

test('changed variation, tempo, source paths and mislabeled codecs fail closed', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-invalid-'));
  try {
    await cp(library, temporary, {recursive: true});
    const original = await json(path.join(temporary, 'library.json'));
    for (const change of [
      (value) => {value.sources[0].variationIndex = 1;},
      (value) => {value.clips[0].tempo = 1.01;},
      (value) => {value.clips[0].path = '../outside.wav';},
      (value) => {value.webGeneration = 2;},
      (value) => {value.musicPolicy.mode = 'ducked';},
    ]) {
      const value = structuredClone(original);
      change(value);
      await writeFile(path.join(temporary, 'library.json'), JSON.stringify(value));
      await assert.rejects(qualifyNaturalNarration(temporary));
    }
    const value = structuredClone(original);
    const fakeWav = await readFile(path.join(temporary, value.sources[0].path));
    await writeFile(path.join(temporary, value.clips[0].path), fakeWav);
    value.clips[0].sha256 = digest(fakeWav);
    await writeFile(path.join(temporary, 'library.json'), JSON.stringify(value));
    await assert.rejects(qualifyNaturalNarration(temporary), /requires MP3 sources and mono PCM24 WAV/);
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('a WAV with an updated file hash must still equal every retained source sample', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-pcm-'));
  try {
    await cp(library, temporary, {recursive: true});
    const value = await json(path.join(temporary, 'library.json'));
    const clip = value.clips[0];
    const file = path.join(temporary, clip.path);
    const bytes = await readFile(file);
    bytes[bytes.length - 6] ^= 1;
    await writeFile(file, bytes);
    clip.sha256 = digest(bytes);
    await writeFile(path.join(temporary, 'library.json'), JSON.stringify(value));
    await assert.rejects(qualifyNaturalNarration(temporary), /not an exact source PCM cut/);
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('the complete logo scene must retain its full five seconds', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-logo-'));
  try {
    await cp(library, temporary, {recursive: true});
    const timeline = await json(path.join(temporary, 'timeline.json'));
    timeline.scenes.at(-2).durationInFrames += 1;
    timeline.scenes.at(-1).startFrame += 1;
    timeline.scenes.at(-1).durationInFrames -= 1;
    await writeFile(path.join(temporary, 'timeline.json'), JSON.stringify(timeline));
    await assert.rejects(qualifyNaturalNarration(temporary), /timeline must agree/);
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('all 34 historical MP3 identities and the original music-only inventory remain unchanged', async () => {
  const legacy = path.join(filmRoot, 'narration/releases/fr-en-g2');
  const golden = {
    'generation.json': 'f16514a7fc01526a7d64ca7182829f0e43a708f46209dda6eb1308c9ac2c9f28',
    'scripts.json': '3c34036916f47b674644b8d5d4dbd307b786de86b9065c70958bb69665478a85',
    'voices.json': '21c073e22d39ac1c90e47f3556b7464880d2506d319c9acd0fed613624398572',
  };
  for (const [filename, sha256] of Object.entries(golden)) assert.equal(digest(await readFile(path.join(legacy, filename))), sha256);
  assert.equal(digest(await readFile(path.join(filmRoot, 'narration/source-videos.json'))), '5611a03addcc512c8ddd4a53cbb4d8e28beb86925e362708a2791d465ab2ec05');
  const manifest = await json(path.join(legacy, 'scripts.json'));
  const config = await json(path.join(legacy, 'voices.json'));
  const generation = await json(path.join(legacy, 'generation.json'));
  const plan = buildPlan(manifest, config, {locales: ['fr', 'en']});
  assert.equal(plan.clips.length, 34);
  for (const clip of plan.clips) {
    const record = generation.clips[`${clip.narrationId}/${clip.cueId}`];
    assert.equal(record.fingerprint, clip.fingerprint);
    assert.equal(digest(await readFile(path.join(legacy, record.path))), record.audioSha256);
  }
});

test('offline publication rebuilds natural C from its separate source and leaves the legacy film untouched', {timeout: 60000}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-replay-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('Provider network forbidden during natural replay.');};
  try {
    const source = await json(path.join(filmRoot, 'narration/source-videos.json'));
    const active = await json(path.join(repositoryRoot, 'packages/contracts/src/public-videos.json'));
    active.roles.fr = {movie: naturalFrenchRoles.movie, poster: naturalFrenchRoles.poster, captions: naturalFrenchRoles.captions};
    const publicRoot = path.join(temporary, 'apps/web/public');
    await mkdir(path.join(publicRoot, 'videos'), {recursive: true});
    const music = path.join(publicRoot, naturalFrenchRoles.source.slice(1));
    await cp(path.join(repositoryRoot, 'apps/web/public', naturalFrenchRoles.source.slice(1)), music);
    const legacy = path.join(publicRoot, source.roles.fr.movie.slice(1));
    await writeFile(legacy, 'legacy-instrumental-untouched');
    const jobs = buildRenderJobs(source, active, ['fr'], 'roles');
    const prepared = await preparePublishedNarration({jobs, filmRoot, repositoryRoot: temporary, sourceCatalog: source,
      kind: 'roles', outputRoot: path.join(temporary, 'output')});
    assert.deepEqual(prepared.musicPolicies, {'roles-fr-natural-c': {mode: 'constant', gain: 0.22}});
    const manifest = {};
    const [published] = await publishNarratedJobs({prepared, jobs, manifest});
    assert.equal(published.frames, 1346);
    assert.equal(published.endCardStartSeconds, 1196 / 30);
    assert.deepEqual(published.musicPolicy, {mode: 'constant', gain: 0.22});
    assert.equal(published.criticalListening, 'pending');
    assert.ok(published.clips.every((clip) => clip.source === 'elevenlabs-creative-plugin' && clip.variationIndex === 2 && clip.tempo === 1 && clip.webGeneration === undefined));
    const candidate = path.join(publicRoot, naturalFrenchRoles.movie.slice(1));
    assert.equal(await videoStreamHash(candidate), await videoStreamHash(music));
    assert.equal(await readFile(legacy, 'utf8'), 'legacy-instrumental-untouched');
    const vtt = await readFile(path.join(publicRoot, naturalFrenchRoles.captions.slice(1)), 'utf8');
    assert.match(vtt, /Manon, Eleven v4, deuxième variation du plugin/);
    assert.match(vtt, /Découvrons les quatre rôles/);
    assert.doesNotMatch(vtt, /Génération 2 web|George|\[thoughtful\]/);
    await writeFile(path.join(publicRoot, naturalFrenchRoles.poster.slice(1)), 'poster');
    assert.equal(await canReuseRenderedJob({job: jobs[0], repositoryRoot: temporary, manifest, prepared}), true);
    const replay = await publishNarratedJobs({prepared, jobs, manifest});
    assert.equal(replay[0].outputSha256, published.outputSha256, 'The same local source and PCM cache must replay byte for byte.');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, {recursive: true, force: true});
  }
});
