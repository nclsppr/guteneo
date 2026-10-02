import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import {buildPlan} from '../scripts/generate-narration.mjs';
import {buildMixJobs, mixVideo, mixVideos, musicVolumeExpression, validateMixCues, videoStreamHash} from '../scripts/mix-narration.mjs';

const run = promisify(execFile);
const narration = {id: 'roles-fr', kind: 'roles', locale: 'fr', durationSeconds: 36, endCardStartSeconds: 31};
const cue = {cueId: 'intro', startSeconds: 0.4, endSeconds: 2.8, durationSeconds: 1.5};
const root = path.resolve(import.meta.dirname, '../../..');
const manifestPath = path.join(root, 'videos/guteneo-film/narration/scripts.json');
const configPath = path.join(root, 'videos/guteneo-film/narration/voices.example.json');
const catalogPath = path.join(root, 'packages/contracts/src/public-videos.json');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('all eight narration tracks serve twelve films with an unchanged final card', async () => {
  const manifest = await json(manifestPath);
  const plan = buildPlan(manifest, await json(configPath));
  const catalog = await json(catalogPath);
  const jobs = buildMixJobs(manifest, plan, catalog, root);
  assert.equal(plan.clips.length, 68);
  assert.equal(plan.totalCharacters, 4151);
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
