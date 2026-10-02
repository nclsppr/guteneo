import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import test from 'node:test';
import {buildPlan, generateNarration} from '../scripts/generate-narration.mjs';
import {importNarration, probeMp3Duration} from '../scripts/import-narration.mjs';
import {mixVideos} from '../scripts/mix-narration.mjs';

const run = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const config = {modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', voiceId: 'ObservedWebVoice123', voiceSettings: {stability: 0.5, similarity_boost: 0.75}};
const makeManifest = () => ({schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', narrations: [{
  id: 'introduction-fr', kind: 'introduction', locale: 'fr', durationSeconds: 56, endCardStartSeconds: 51,
  cues: [{id: 'one', startSeconds: 1, endSeconds: 5, text: 'Chaque document compte.'}],
}]});

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'guteneo-web-narration-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const filePath = path.join(directory, 'web-export.mp3');
  await writeFile(filePath, 'synthetic-unit-test-audio');
  const outputDir = path.join(directory, 'cache');
  const manifest = makeManifest();
  return {directory, filePath, outputDir, manifest, config: structuredClone(config), narrationId: 'introduction-fr', cueId: 'one', probeAudio: async () => 2};
}
const receipt = async (outputDir) => JSON.parse(await readFile(path.join(outputDir, 'generation.json'), 'utf8'));

test('web import uses the shared fingerprint, receipt and lock without any network call', async (t) => {
  const input = await fixture(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('No network permitted');};
  try {
    const result = await importNarration({...input, probeAudio: async (filePath) => {
      assert.equal((await stat(path.join(input.outputDir, 'generation.lock'))).isFile(), true);
      assert.deepEqual(await readFile(filePath), await readFile(input.filePath));
      return 2;
    }});
    const clip = buildPlan(input.manifest, input.config).clips[0];
    const entry = (await receipt(input.outputDir)).clips['introduction-fr/one'];
    assert.equal(result.mode, 'imported');
    assert.equal(result.path, clip.relativePath);
    assert.equal(result.timingFit, true);
    assert.equal(entry.fingerprint, clip.fingerprint);
    assert.equal(entry.status, 'complete');
    assert.equal(entry.source, 'elevenlabs-web');
    assert.equal(entry.sourceFilename, 'web-export.mp3');
    assert.ok(Number.isFinite(Date.parse(entry.importedAt)));
    assert.equal(entry.durationSeconds, 2);
    assert.equal(entry.audioSha256, hash(await readFile(input.filePath)));
    assert.equal(entry.requestId, undefined);
    assert.equal(entry.billedCharacters, undefined);
    assert.equal(entry.requestedAt, undefined);
    assert.ok(!JSON.stringify(entry).includes('Chaque document compte.'));
    await assert.rejects(stat(path.join(input.outputDir, 'generation.lock')), {code: 'ENOENT'});
  } finally {globalThis.fetch = originalFetch;}
});

test('identical completed audio is idempotent and the disabled API leaves its cache intact', async (t) => {
  const input = await fixture(t);
  const first = await importNarration(input);
  const before = await receipt(input.outputDir);
  const audioPath = path.join(input.outputDir, first.path);
  const modifiedAt = (await stat(audioPath)).mtimeMs;
  const second = await importNarration(input);
  assert.equal(second.mode, 'cached');
  assert.deepEqual(await receipt(input.outputDir), before);
  assert.equal((await stat(audioPath)).mtimeMs, modifiedAt);
  await assert.rejects(generateNarration(buildPlan(input.manifest, input.config), {
    outputDir: input.outputDir, maxCharacters: 1, apiKey: 'mock-key-not-used', fetchImpl: async () => {throw new Error('No request allowed for imported cache');},
  }), {code: 'API_ADAPTER_UNQUALIFIED'});
  assert.deepEqual(await receipt(input.outputDir), before);
  assert.equal((await stat(audioPath)).mtimeMs, modifiedAt);
});

test('explicit web take provenance is recorded without changing the API fingerprint', async (t) => {
  const input = await fixture(t);
  input.config.webGeneration = 2;
  const fingerprint = buildPlan(input.manifest, config).clips[0].fingerprint;
  assert.equal(buildPlan(input.manifest, input.config).clips[0].fingerprint, fingerprint);
  const result = await importNarration({...input, webGeneration: 2});
  const entry = (await receipt(input.outputDir)).clips['introduction-fr/one'];
  assert.equal(result.webGeneration, 2);
  assert.equal(entry.webGeneration, 2);
  assert.equal(entry.fingerprint, fingerprint);
  assert.equal(entry.requestId, undefined);
  assert.equal(entry.billedCharacters, undefined);
  const cached = await importNarration(input);
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.webGeneration, 2);
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].webGeneration, 2);
});

test('casting configuration and legacy/API receipts never imply a web generation number', async (t) => {
  const input = await fixture(t);
  input.config.webGeneration = 2;
  const result = await importNarration(input);
  const state = await receipt(input.outputDir);
  assert.equal(result.webGeneration, undefined);
  assert.equal(state.clips['introduction-fr/one'].webGeneration, undefined);
  const entry = state.clips['introduction-fr/one'];
  delete entry.source;
  delete entry.sourceFilename;
  delete entry.importedAt;
  entry.requestId = 'mock-existing-api-request';
  await writeFile(path.join(input.outputDir, 'generation.json'), JSON.stringify(state));
  const cached = await importNarration(input);
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.webGeneration, undefined);
  assert.deepEqual(await receipt(input.outputDir), state);
  await assert.rejects(importNarration({...input, webGeneration: 2}), {code: 'CACHE_CONFLICT'});
});

test('changing known take provenance requires explicit replacement even for identical bytes', async (t) => {
  const input = await fixture(t);
  await importNarration({...input, webGeneration: 1});
  await assert.rejects(importNarration({...input, webGeneration: 2}), {code: 'CACHE_CONFLICT'});
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].webGeneration, 1);
  const replacement = await importNarration({...input, webGeneration: 2, replace: true});
  assert.equal(replacement.mode, 'imported');
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].webGeneration, 2);
  const cached = await importNarration({...input, webGeneration: 2});
  assert.equal(cached.mode, 'cached');
});

test('take provenance can be explicitly added to a legacy web receipt, and invalid numbers are rejected', async (t) => {
  const input = await fixture(t);
  for (const webGeneration of [0, 3, -1, '2', null, NaN]) await assert.rejects(importNarration({...input, webGeneration}), {code: 'INVALID_INPUT'});
  await assert.rejects(stat(input.outputDir), {code: 'ENOENT'});
  const first = await importNarration(input);
  const audioPath = path.join(input.outputDir, first.path);
  const modifiedAt = (await stat(audioPath)).mtimeMs;
  const result = await importNarration({...input, webGeneration: 2});
  assert.equal(result.mode, 'cached');
  assert.equal((await stat(audioPath)).mtimeMs, modifiedAt);
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].webGeneration, 2);
});

test('changed audio and changed voice require explicit replacement and leave the existing cache intact', async (t) => {
  const input = await fixture(t);
  const first = await importNarration(input);
  const originalReceipt = await receipt(input.outputDir);
  const originalBytes = await readFile(path.join(input.outputDir, first.path));
  await writeFile(input.filePath, 'second-web-export');
  await assert.rejects(importNarration(input), {code: 'CACHE_CONFLICT'});
  assert.deepEqual(await receipt(input.outputDir), originalReceipt);
  assert.deepEqual(await readFile(path.join(input.outputDir, first.path)), originalBytes);
  await writeFile(input.filePath, originalBytes);
  const changedConfig = {...input.config, voiceId: 'DifferentObservedVoice456'};
  await assert.rejects(importNarration({...input, config: changedConfig}), {code: 'CACHE_CONFLICT'});
  const replacement = await importNarration({...input, config: changedConfig, replace: true});
  assert.equal(replacement.mode, 'imported');
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].fingerprint, buildPlan(input.manifest, changedConfig).clips[0].fingerprint);
  await writeFile(input.filePath, 'third-authorized-web-export');
  await importNarration({...input, config: changedConfig, replace: true});
  assert.equal(await readFile(path.join(input.outputDir, first.path), 'utf8'), 'third-authorized-web-export');
});

test('overlong audio is retained in full, marked unfit, and cannot trigger an API regeneration', async (t) => {
  const input = await fixture(t);
  const result = await importNarration({...input, probeAudio: async () => 7});
  const entry = (await receipt(input.outputDir)).clips['introduction-fr/one'];
  assert.equal(result.timingFit, false);
  assert.equal(entry.status, 'complete');
  assert.equal(entry.durationSeconds, 7);
  assert.equal(entry.timingFit, false);
  assert.deepEqual(await readFile(path.join(input.outputDir, result.path)), await readFile(input.filePath));
  await assert.rejects(generateNarration(buildPlan(input.manifest, input.config), {
    outputDir: input.outputDir, maxCharacters: 100, apiKey: 'mock-unused', fetchImpl: async () => {throw new Error('No regeneration allowed');},
  }), {code: 'API_ADAPTER_UNQUALIFIED'});
  assert.deepEqual((await receipt(input.outputDir)).clips['introduction-fr/one'], entry);
});

test('cue timing changes requalify the existing bytes without replacing them', async (t) => {
  const input = await fixture(t);
  await importNarration({...input, probeAudio: async () => 3});
  const manifest = structuredClone(input.manifest);
  manifest.narrations[0].cues[0].endSeconds = 3;
  const result = await importNarration({...input, manifest, probeAudio: async () => 3});
  assert.equal(result.mode, 'cached');
  assert.equal(result.timingFit, false);
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].timingFit, false);
});

test('unknown or interrupted receipts cannot be replaced implicitly', async (t) => {
  const input = await fixture(t);
  await importNarration(input);
  for (const status of ['unknown', 'inflight', 'rejected']) {
    const state = await receipt(input.outputDir);
    state.clips['introduction-fr/one'].status = status;
    await writeFile(path.join(input.outputDir, 'generation.json'), JSON.stringify(state));
    await assert.rejects(importNarration(input), {code: 'CACHE_CONFLICT'});
    assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].status, status);
    await importNarration({...input, replace: true});
    assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].status, 'complete');
  }
});

test('missing receipt, altered cached bytes and a competing generation lock require inspection', async (t) => {
  const input = await fixture(t);
  const result = await importNarration(input);
  const cachedPath = path.join(input.outputDir, result.path);
  await writeFile(cachedPath, 'altered-cache');
  await assert.rejects(importNarration(input), {code: 'CACHE_CONFLICT'});
  await importNarration({...input, replace: true});
  await rm(path.join(input.outputDir, 'generation.json'));
  await assert.rejects(importNarration(input), {code: 'CACHE_CONFLICT'});
  await importNarration({...input, replace: true});
  await writeFile(path.join(input.outputDir, 'generation.lock'), 'another process owns this lock');
  await assert.rejects(importNarration({...input, replace: true}), {code: 'LOCKED'});
  assert.equal(await readFile(path.join(input.outputDir, 'generation.lock'), 'utf8'), 'another process owns this lock');
});

test('bad selections, missing voices, empty audio and probe failure cannot alter receipts', async (t) => {
  const input = await fixture(t);
  for (const changed of [{narrationId: '../outside'}, {cueId: '../outside'}, {filePath: 'relative.mp3'}, {config: {...config, voiceId: null}}]) {
    await assert.rejects(importNarration({...input, ...changed}));
  }
  await assert.rejects(stat(input.outputDir), {code: 'ENOENT'});
  await importNarration(input);
  const before = await receipt(input.outputDir);
  await writeFile(input.filePath, '');
  await assert.rejects(importNarration({...input, replace: true}), {code: 'AUDIO_INVALID'});
  await writeFile(input.filePath, 'new-unqualified-export');
  for (const probeAudio of [async () => NaN, async () => -1, async () => {throw new Error('Sensitive decoder diagnostic');}]) {
    await assert.rejects(importNarration({...input, replace: true, probeAudio}), {code: 'AUDIO_INVALID'});
  }
  assert.deepEqual(await receipt(input.outputDir), before);
});

test('configuration mutations while importing cannot change the shared fingerprint', async (t) => {
  const input = await fixture(t);
  const expected = buildPlan(input.manifest, input.config).clips[0].fingerprint;
  await importNarration({...input, probeAudio: async () => {
    input.config.voiceId = 'CallerMutation';
    input.manifest.narrations[0].cues[0].text = 'Changed while waiting.';
    return 2;
  }});
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].fingerprint, expected);
});

test('a real imported MP3 qualifies for the mixer; an unfit import blocks mixing before replacement', {timeout: 30000}, async (t) => {
  const input = await fixture(t);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=1', '-c:a', 'libmp3lame', '-b:a', '128k', input.filePath]);
  const repositoryRoot = path.join(input.directory, 'synthetic-repository');
  const videoDir = path.join(repositoryRoot, 'apps/web/public/videos');
  await mkdir(videoDir, {recursive: true});
  const sourcePath = path.join(videoDir, 'source.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2450db:s=160x90:r=30:d=56',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=56', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k', '-movflags', '+faststart', sourcePath]);
  await importNarration({...input, probeAudio: probeMp3Duration});
  const catalog = {introduction: {fr: {horizontal: {movie: '/videos/source.mp4'}}}, roles: {}};
  const mixInput = {manifest: input.manifest, plan: buildPlan(input.manifest, input.config), catalog, repositoryRoot, outputDir: input.outputDir, execute: true};
  const result = await mixVideos(mixInput);
  assert.equal(result.mode, 'local-candidates');
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].criticalListening, 'pending');
  assert.equal(result.movies[0].sourceVideoSha256, result.movies[0].outputVideoSha256);
  assert.equal(result.movies[0].clips[0].fingerprint, (await receipt(input.outputDir)).clips['introduction-fr/one'].fingerprint);
  const candidatePath = path.join(input.outputDir, 'videos/source.mp4');
  const candidateHash = hash(await readFile(candidatePath));
  const narrowManifest = structuredClone(input.manifest);
  narrowManifest.narrations[0].cues[0].endSeconds = 1.2;
  const requalified = await importNarration({...input, manifest: narrowManifest, probeAudio: probeMp3Duration});
  assert.equal(requalified.timingFit, false);
  await assert.rejects(mixVideos({...mixInput, manifest: narrowManifest, plan: buildPlan(narrowManifest, input.config)}), /Missing, stale or unqualified/);
  assert.equal(hash(await readFile(candidatePath)), candidateHash);
});

test('CLI imports a real local MP3 offline; duration overflow exits clearly and remains cached', {timeout: 30000}, async (t) => {
  const input = await fixture(t);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=1', '-c:a', 'libmp3lame', '-b:a', '128k', input.filePath]);
  const expectedDuration = await probeMp3Duration(input.filePath);
  const manifestPath = path.join(input.directory, 'manifest.json');
  const configPath = path.join(input.directory, 'voices.json');
  await writeFile(manifestPath, JSON.stringify(input.manifest));
  await writeFile(configPath, JSON.stringify(input.config));
  const scriptPath = fileURLToPath(new URL('../scripts/import-narration.mjs', import.meta.url));
  const args = ['--import', 'data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error(%22Network%20forbidden%22)%7D', scriptPath,
    '--manifest', manifestPath, '--config', configPath, '--narration', 'introduction-fr', '--cue', 'one', '--file', input.filePath, '--output-dir', input.outputDir, '--web-generation', '2'];
  const {stdout} = await run(process.execPath, args);
  assert.equal(JSON.parse(stdout).mode, 'imported');
  assert.equal(JSON.parse(stdout).durationSeconds, expectedDuration);
  assert.equal(JSON.parse(stdout).webGeneration, 2);
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].webGeneration, 2);
  assert.ok(!stdout.includes('Chaque document compte.'));
  input.manifest.narrations[0].cues[0].endSeconds = 1.2;
  await writeFile(manifestPath, JSON.stringify(input.manifest));
  await assert.rejects(run(process.execPath, args), (error) => {
    assert.equal(error.code, 2);
    assert.equal(JSON.parse(error.stdout).mode, 'cached');
    assert.equal(JSON.parse(error.stdout).timingFit, false);
    assert.match(error.stderr, /retained without truncation or acceleration/);
    return true;
  });
  assert.equal((await receipt(input.outputDir)).clips['introduction-fr/one'].durationSeconds, expectedDuration);
  assert.deepEqual(await readFile(path.join(input.outputDir, 'clips/introduction-fr/one.mp3')), await readFile(input.filePath));
  const wavePath = path.join(input.directory, 'not-mp3.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.2', wavePath]);
  await assert.rejects(probeMp3Duration(wavePath), {code: 'AUDIO_INVALID'});
});
