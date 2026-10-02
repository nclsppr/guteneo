import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import {buildPlan} from '../scripts/generate-narration.mjs';
import {buildMixJobs, canonicalAudioDuration, mixVideo, mixVideos, musicVolumeExpression, validateMixCues, videoStreamHash} from '../scripts/mix-narration.mjs';

const run = promisify(execFile);
const narration = {id: 'roles-fr', kind: 'roles', locale: 'fr', durationSeconds: 36, endCardStartSeconds: 31};
const cue = {cueId: 'intro', startSeconds: 0.4, endSeconds: 2.8, durationSeconds: 1.5};
const root = path.resolve(import.meta.dirname, '../../..');
const manifestPath = path.join(root, 'videos/guteneo-film/narration/scripts.json');
const configPath = path.join(root, 'videos/guteneo-film/narration/voices.example.json');
const catalogPath = path.join(root, 'videos/guteneo-film/narration/source-videos.json');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('MP3 encoder padding cannot change the qualified speech duration or published envelope', async () => {
  const qualification = await json(path.join(root, 'videos/guteneo-film/narration/releases/fr-en-g2/qualification.json'));
  const receipt = (await json(path.join(root, 'videos/guteneo-film/narration/releases/fr-en-g2/generation.json'))).clips['roles-fr/supervisor'];
  const clip = qualification.clips.find((entry) => entry.key === 'roles-fr/supervisor');
  // The same frozen MP3 reports 5.616327 s in FFprobe 6.1.1 on Linux and
  // 5.588209 s on Mac. Its complete decoded signal is identical on both.
  for (const containerDurationSeconds of [5.616327, receipt.durationSeconds]) {
    assert.equal(canonicalAudioDuration({receiptDurationSeconds: receipt.durationSeconds, containerDurationSeconds,
      decodedDurationSeconds: clip.decodedSamples / clip.sampleRate, windowSeconds: clip.windowSeconds}), receipt.durationSeconds);
  }
});

test('complete decoded overruns, stale duration receipts and missing measurements fail closed', () => {
  const input = {receiptDurationSeconds: 1.5, containerDurationSeconds: 1.5, decodedDurationSeconds: 1.5, windowSeconds: 1.6};
  assert.throws(() => canonicalAudioDuration({...input, decodedDurationSeconds: 1.7}), /does not fit/);
  assert.throws(() => canonicalAudioDuration({...input, receiptDurationSeconds: 1}), /differs from its generation receipt/);
  assert.throws(() => canonicalAudioDuration({...input, decodedDurationSeconds: NaN}), /could not be qualified/);
  assert.equal(canonicalAudioDuration({...input, decodedDurationSeconds: 1.55}), 1.55, 'An underestimated container cannot shorten real speech.');
});

test('all eight narration tracks serve twelve films with an unchanged final card', async () => {
  const manifest = await json(manifestPath);
  const plan = buildPlan(manifest, await json(configPath));
  const catalog = await json(catalogPath);
  const jobs = buildMixJobs(manifest, plan, catalog, root);
  assert.equal(plan.clips.length, 68);
  assert.ok(Number.isSafeInteger(plan.totalCharacters) && plan.totalCharacters > 0 && plan.totalCharacters <= 4200, 'The current batch must remain inside the initial 4200-character ceiling.');
  assert.equal(new Set(jobs.map((job) => job.narration.id)).size, 8);
  assert.equal(jobs.length, 12);
  for (const locale of ['fr', 'en', 'de', 'lb']) {
    const formats = jobs.filter((job) => job.narration.id === `introduction-${locale}`);
    assert.equal(formats.length, 2);
    assert.strictEqual(formats[0].clips, formats[1].clips);
  }
  const dry = await mixVideos({manifest, plan, catalog, repositoryRoot: root});
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.videos.length, 12);
});

test('speech outside a scene, overlap and shortened final card are rejected', () => {
  assert.doesNotThrow(() => validateMixCues(narration, [cue]));
  assert.throws(() => validateMixCues(narration, [{...cue, durationSeconds: 3}]), /does not fit/);
  assert.throws(() => validateMixCues(narration, [cue, {...cue, cueId: 'other'}]), /does not fit/);
  assert.throws(() => validateMixCues(narration, [{...cue, startSeconds: 30.8, endSeconds: 31.5, durationSeconds: 0.5}]), /does not fit/);
  assert.throws(() => validateMixCues({...narration, endCardStartSeconds: 32}, [cue]), /five seconds/);
});

test('music ducking uses actual speech and has fully released before the logo', () => {
  // FFmpeg functions have equivalent JavaScript implementations for these arithmetic envelopes.
  const min = Math.min, max = Math.max;
  const expression = musicVolumeExpression(narration, [cue]);
  const gainAt = (t) => Function('t', 'min', 'max', `return ${expression};`)(t, min, max);
  assert.equal(gainAt(0), 1);
  assert.ok(Math.abs(gainAt(1) - 0.22) < 1e-12);
  assert.equal(gainAt(2.5), 1);
  for (const second of [31, 32, 35.9]) assert.equal(gainAt(second), 1);
});

test('mix refuses missing or changed cached audio before writing films', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-mix-cache-'));
  try {
    const manifest = await json(manifestPath);
    const plan = buildPlan(manifest, await json(configPath), {kind: 'roles', locales: ['fr']});
    const catalog = await json(catalogPath);
    await assert.rejects(mixVideos({manifest, plan, catalog, repositoryRoot: root, outputDir: path.join(root, 'apps/web/public'), execute: true}), /outside the published/);
    await assert.rejects(mixVideo({sourcePath: 'same.mp4', outputPath: 'same.mp4', narration, clips: [cue]}), /must not overwrite/);
    await writeFile(path.join(temporary, 'generation.json'), JSON.stringify({schemaVersion: 1, clips: {}}));
    await assert.rejects(mixVideos({manifest, plan, catalog, repositoryRoot: root, outputDir: temporary, execute: true}), /Missing, stale or unqualified/);
    await assert.rejects(readFile(path.join(temporary, 'mix-proof.json')), {code: 'ENOENT'});
    const clip = plan.clips[0];
    await writeFile(path.join(temporary, 'generation.json'), JSON.stringify({schemaVersion: 1, clips: {
      [`${clip.narrationId}/${clip.cueId}`]: {status: 'complete', fingerprint: 'changed', path: clip.relativePath, audioSha256: 'wrong'}
    }}));
    await assert.rejects(mixVideos({manifest, plan, catalog, repositoryRoot: root, outputDir: temporary, execute: true}), /Missing, stale or unqualified/);
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('generation-2 preference rejects generation 1 and unlabelled web receipts before writing any film', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-mix-generation-'));
  try {
    const manifest = await json(manifestPath);
    const plan = buildPlan(manifest, await json(configPath), {kind: 'roles', locales: ['fr']});
    const catalog = await json(catalogPath);
    const clip = plan.clips[0];
    const proofPath = path.join(temporary, 'mix-proof.json');
    await writeFile(proofPath, 'existing-candidate-proof');
    for (const webGeneration of [1, undefined]) {
      const entry = {status: 'complete', fingerprint: clip.fingerprint, path: clip.relativePath, timingFit: true, source: 'elevenlabs-web', ...(webGeneration !== undefined ? {webGeneration} : {})};
      await writeFile(path.join(temporary, 'generation.json'), JSON.stringify({schemaVersion: 1, clips: {[`${clip.narrationId}/${clip.cueId}`]: entry}}));
      await assert.rejects(mixVideos({manifest, plan, catalog, repositoryRoot: root, outputDir: temporary, execute: true, webGeneration: 2}), /Web generation 2 is required/);
      assert.equal(await readFile(proofPath, 'utf8'), 'existing-candidate-proof');
      await assert.rejects(stat(path.join(temporary, 'videos')), {code: 'ENOENT'});
      assert.deepEqual((await json(path.join(temporary, 'generation.json'))).clips[`${clip.narrationId}/${clip.cueId}`], entry);
    }
    await assert.rejects(mixVideos({manifest, plan, catalog, outputDir: path.join(temporary, 'invalid'), execute: true, webGeneration: 3}), /preference must be 1 or 2/);
    await assert.rejects(stat(path.join(temporary, 'invalid')), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('the CLI reads web preference from voice config without changing API fingerprints or writing a dry-run', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-mix-dry-'));
  try {
    const manifest = await json(manifestPath);
    const config = await json(configPath);
    assert.equal(config.webGeneration, 2);
    const withoutPreference = structuredClone(config);
    delete withoutPreference.webGeneration;
    assert.deepEqual(buildPlan(manifest, config), buildPlan(manifest, withoutPreference));
    const outputDir = path.join(temporary, 'not-created');
    const {stdout} = await run(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error(%22Network%20forbidden%22)%7D',
      path.join(root, 'videos/guteneo-film/scripts/mix-narration.mjs'), '--voices', configPath, '--kind', 'roles', '--locales', 'fr', '--out', outputDir]);
    const result = JSON.parse(stdout);
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.webGenerationPreference, 2);
    await assert.rejects(stat(outputDir), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('the CLI keeps original musical sources after the public catalog changes; overrides are explicit and missing sources fail closed', async () => {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'guteneo-mix-source-catalog-')));
  try {
    const filmDir = path.join(temporary, 'videos/guteneo-film');
    const scriptDir = path.join(filmDir, 'scripts');
    const narrationDir = path.join(filmDir, 'narration');
    const contractDir = path.join(temporary, 'packages/contracts/src');
    await Promise.all([mkdir(scriptDir, {recursive: true}), mkdir(narrationDir, {recursive: true}), mkdir(contractDir, {recursive: true})]);
    for (const filename of ['mix-narration.mjs', 'generate-narration.mjs']) {
      await writeFile(path.join(scriptDir, filename), await readFile(path.join(root, 'videos/guteneo-film/scripts', filename)));
    }
    await writeFile(path.join(narrationDir, 'scripts.json'), await readFile(manifestPath));
    await writeFile(path.join(narrationDir, 'voices.example.json'), await readFile(configPath));
    const baseCatalog = await json(catalogPath);
    const sourceCatalogPath = path.join(narrationDir, 'source-videos.json');
    await writeFile(sourceCatalogPath, JSON.stringify(baseCatalog));
    const publishedCatalog = structuredClone(baseCatalog);
    publishedCatalog.introduction.en.horizontal.movie = '/videos/guteneo-horizontal-v6-en.mp4';
    publishedCatalog.introduction.en.vertical.movie = '/videos/guteneo-vertical-v6-en.mp4';
    publishedCatalog.roles.en.movie = '/videos/guteneo-roles-v2-en.mp4';
    const liveCatalogPath = path.join(contractDir, 'public-videos.json');
    await writeFile(liveCatalogPath, JSON.stringify(publishedCatalog));
    const args = ['--import', 'data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error(%22Network%20forbidden%22)%7D',
      path.join(scriptDir, 'mix-narration.mjs'), '--kind', 'all', '--locales', 'en'];
    const defaultRun = JSON.parse((await run(process.execPath, args)).stdout);
    assert.deepEqual(defaultRun.videos.map((video) => video.source), [
      'guteneo-horizontal-v5-en.mp4', 'guteneo-vertical-v5-en.mp4', 'guteneo-roles-v1-en.mp4',
    ]);
    const baseJobs = buildMixJobs(await json(manifestPath), buildPlan(await json(manifestPath), await json(configPath), {locales: ['en']}), baseCatalog, temporary);
    assert.deepEqual(defaultRun.videos.map((video) => video.source), baseJobs.map((job) => job.basename));
    const overrideRun = JSON.parse((await run(process.execPath, [...args, '--catalog', liveCatalogPath])).stdout);
    assert.deepEqual(overrideRun.videos.map((video) => video.source), [
      'guteneo-horizontal-v6-en.mp4', 'guteneo-vertical-v6-en.mp4', 'guteneo-roles-v2-en.mp4',
    ], 'Only an explicit --catalog may change the selected source inventory.');
    await rm(sourceCatalogPath);
    await assert.rejects(run(process.execPath, args), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /source-videos\.json/);
      return true;
    });
    await assert.rejects(stat(path.join(filmDir, 'out')), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('API receipts stay separate while accepted web-generation-2 provenance survives into the mix proof', {timeout: 30000}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-mix-provenance-'));
  try {
    const videoDir = path.join(temporary, 'apps/web/public/videos');
    await mkdir(videoDir, {recursive: true});
    const sourcePath = path.join(videoDir, 'source.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2450db:s=160x90:r=30:d=36',
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=36', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '2', '-b:a', '128k', '-movflags', '+faststart', sourcePath]);
    const manifest = {schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', narrations: [{...narration, cues: [{id: 'intro', startSeconds: 0.4, endSeconds: 2.8, text: 'Four roles.'}]}]};
    const config = {modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', voiceId: 'SyntheticVoice', voiceSettings: {stability: 0.5, similarity_boost: 0.75}};
    const plan = buildPlan(manifest, config);
    const clip = plan.clips[0];
    const outputDir = path.join(temporary, 'cache');
    const audioPath = path.join(outputDir, clip.relativePath);
    await mkdir(path.dirname(audioPath), {recursive: true});
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=1.4', '-c:a', 'libmp3lame', '-b:a', '128k', audioPath]);
    const {stdout} = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath]);
    const base = {status: 'complete', fingerprint: clip.fingerprint, path: clip.relativePath, timingFit: true, durationSeconds: Number(stdout), audioSha256: createHash('sha256').update(await readFile(audioPath)).digest('hex')};
    const catalog = {introduction: {}, roles: {fr: {movie: '/videos/source.mp4'}}};
    for (const provenance of [{requestId: 'mock-api-request'}, {source: 'elevenlabs-api', requestId: 'mock-api-request'}, {source: 'elevenlabs-web', webGeneration: 2}]) {
      const state = {schemaVersion: 1, clips: {'roles-fr/intro': {...base, ...provenance}}};
      const statePath = path.join(outputDir, 'generation.json');
      await writeFile(statePath, JSON.stringify(state));
      const result = await mixVideos({manifest, plan, catalog, repositoryRoot: temporary, outputDir, execute: true, webGeneration: 2});
      const proofClip = result.movies[0].clips[0];
      assert.equal(proofClip.source, provenance.source);
      assert.equal(proofClip.webGeneration, provenance.source === 'elevenlabs-web' ? 2 : undefined);
      assert.equal(proofClip.fingerprint, clip.fingerprint);
      assert.deepEqual(await json(statePath), state, 'Mixing must not relabel generation receipts.');
    }
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('local FFmpeg mix preserves every H.264 packet and the original final score level', {timeout: 60000}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-narration-mix-'));
  const sourcePath = path.join(temporary, 'source.mp4');
  const audioPath = path.join(temporary, 'synthetic-voice.mp3');
  const outputPath = path.join(temporary, 'narrated.mp4');
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2450db:s=160x90:r=30:d=36',
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=36', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '2', '-b:a', '128k', '-movflags', '+faststart', sourcePath]);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=1.4',
      '-c:a', 'libmp3lame', '-b:a', '128k', audioPath]);
    const {stdout: duration} = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath]);
    const before = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
    const proof = await mixVideo({sourcePath, outputPath, narration, clips: [
      {...cue, audioPath, durationSeconds: Number(duration)},
      {...cue, cueId: 'administrator', startSeconds: 3.2, endSeconds: 8.8, audioPath, durationSeconds: Number(duration)}
    ]});
    assert.equal(proof.width, 160);
    assert.equal(proof.height, 90);
    assert.equal(proof.frames, 1080);
    assert.equal(proof.frameRate, '30/1');
    assert.equal(proof.durationSeconds, 36);
    assert.equal(proof.criticalListening, 'pending');
    assert.equal(await videoStreamHash(sourcePath), await videoStreamHash(outputPath));
    assert.equal(createHash('sha256').update(await readFile(sourcePath)).digest('hex'), before);
    const rms = async (file, start, durationSeconds) => {
      const {stdout} = await run('ffmpeg', ['-v', 'error', '-i', file, '-ss', String(start), '-t', String(durationSeconds),
        '-map', '0:a:0', '-ac', '1', '-f', 'f32le', '-'], {encoding: 'buffer', maxBuffer: 2 * 1024 * 1024});
      let squares = 0;
      for (let offset = 0; offset < stdout.length; offset += 4) squares += stdout.readFloatLE(offset) ** 2;
      return Math.sqrt(squares / (stdout.length / 4));
    };
    const sourceFinal = await rms(sourcePath, 32, 3);
    const outputFinal = await rms(outputPath, 32, 3);
    assert.ok(Math.abs(outputFinal / sourceFinal - 1) < 0.04, 'Final score returns to its original level after AAC encoding.');
    const frequencyAmplitude = async (file, frequency, start = 0.7) => {
      const {stdout} = await run('ffmpeg', ['-v', 'error', '-i', file, '-ss', String(start), '-t', '0.6',
        '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], {encoding: 'buffer'});
      let sine = 0, cosine = 0;
      const samples = stdout.length / 4;
      for (let index = 0; index < samples; index++) {
        const sample = stdout.readFloatLE(index * 4);
        const phase = 2 * Math.PI * frequency * index / 48000;
        sine += sample * Math.sin(phase);
        cosine += sample * Math.cos(phase);
      }
      return 2 * Math.hypot(sine, cosine) / samples;
    };
    assert.ok(await frequencyAmplitude(outputPath, 880) > 0.02, 'Synthetic voice is present at its assigned cue.');
    assert.ok(await frequencyAmplitude(outputPath, 880, 3.5) > 0.02, 'A second delayed voice clip remains present.');
    assert.ok(await frequencyAmplitude(sourcePath, 880) < 0.001, 'The original score contains no synthetic voice.');
    const musicRatio = await frequencyAmplitude(outputPath, 220) / await frequencyAmplitude(sourcePath, 220);
    assert.ok(Math.abs(musicRatio - 0.22) < 0.02, 'Score is ducked while the voice speaks.');
  } finally {await rm(temporary, {recursive: true, force: true});}
});
