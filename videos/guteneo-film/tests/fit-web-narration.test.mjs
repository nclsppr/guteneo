import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import {analyzeMp3, fitWebNarration, planEdgeFit} from '../../../scripts/fit-web-narration.mjs';

const run = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestFor = (windowSeconds) => ({schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', narrations: [{
  id: 'introduction-fr', kind: 'introduction', locale: 'fr', durationSeconds: 56, endCardStartSeconds: 51,
  cues: [{id: 'personal', startSeconds: 6.3, endSeconds: 6.3 + windowSeconds, text: 'Synthetic audio fixture.'}],
}]});

async function fixture(t, duration, windowSeconds, filter) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'guteneo-fit-test-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const inputPath = path.join(directory, 'original.mp3');
  const outputPath = path.join(directory, 'fitted.mp3');
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=44100:duration=${duration}`];
  if (filter) args.push('-af', filter);
  args.push('-c:a', 'libmp3lame', '-b:a', '128k', inputPath);
  await run('ffmpeg', args);
  return {inputPath, outputPath, execute: true, manifest: manifestFor(windowSeconds), narrationId: 'introduction-fr', cueId: 'personal'};
}

test('only boundary silence is eligible; internal pauses cannot rescue an overlong phrase', () => {
  const result = planEdgeFit({durationSeconds: 4.127313, decodedDurationSeconds: 4.127347, windowSeconds: 3.5, silences: [
    {startSeconds: 0, endSeconds: 0.129728},
    {startSeconds: 0.94551, endSeconds: 1.420136},
    {startSeconds: 2.063061, endSeconds: 2.393628},
    {startSeconds: 3.945533, endSeconds: 4.127347},
  ]});
  assert.equal(result.mode, 'needs-shorter-text');
  assert.ok(result.requiredTempo > 1.10);
  assert.ok(result.trimStartSeconds < 0.07 && result.trimEndSeconds < 0.13);
  assert.ok(result.retainedStartSeconds < 0.94551);
  assert.ok(result.retainedEndSeconds > 2.393628);
  assert.ok(result.sourceEdgeMarginSeconds / 1.10 >= 0.06);
});

test('malformed detector intervals and silent audio cannot become qualified speech', () => {
  const input = {durationSeconds: 2, decodedDurationSeconds: 2, windowSeconds: 1};
  for (const silences of [
    [{startSeconds: NaN, endSeconds: 1}],
    [{startSeconds: 1, endSeconds: 0.5}],
    [{startSeconds: 0, endSeconds: 0.5}, {startSeconds: 0.4, endSeconds: 0.6}],
    [{startSeconds: 0, endSeconds: 2.1}],
  ]) assert.throws(() => planEdgeFit({...input, silences}), {code: 'AUDIO_INVALID'});
  assert.throws(() => planEdgeFit({...input, silences: [{startSeconds: 0, endSeconds: 2}]}), {code: 'AUDIO_SILENT'});
});

test('an underestimated container duration cannot qualify longer decoded audio as unchanged', () => {
  const result = planEdgeFit({durationSeconds: 3.4, decodedDurationSeconds: 4, windowSeconds: 3.5, silences: []});
  assert.equal(result.mode, 'needs-shorter-text');
  assert.ok(result.requiredTempo > 1.10);
});

test('already fitting MP3 is copied byte-for-byte, remains offline and keeps source unchanged', async (t) => {
  const input = await fixture(t, 1, 3.5);
  const original = await readFile(input.inputPath);
  const modifiedAt = (await stat(input.inputPath)).mtimeMs;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('No provider call permitted');};
  try {
    const result = await fitWebNarration(input);
    assert.equal(result.plan.mode, 'unchanged');
    assert.equal(result.appliedTempo, 1);
    assert.equal(result.attempts.length, 0);
    assert.equal(result.timingFit, true);
    assert.equal(result.criticalListening, 'pending');
    assert.deepEqual(await readFile(input.outputPath), original);
    assert.deepEqual(await readFile(input.inputPath), original);
    assert.equal((await stat(input.inputPath)).mtimeMs, modifiedAt);
    assert.equal(result.input.sha256, result.output.sha256);
    assert.equal(result.nextStep.replaceRequired, true);
    assert.equal(result.nextStep.audibleReviewRequired, true);
  } finally {globalThis.fetch = savedFetch;}
});

test('real edge trimming preserves both audible blocks, the internal pause and edge cushions', async (t) => {
  const input = await fixture(t, 3.5, 3.15, "volume=0:enable='lt(t,0.3)+between(t,1.3,2.1)+gt(t,3.1)'");
  const original = await readFile(input.inputPath);
  const before = await analyzeMp3(input.inputPath);
  const result = await fitWebNarration(input);
  assert.equal(result.timingFit, true);
  assert.equal(result.appliedTempo, 1);
  assert.ok(result.plan.trimStartSeconds > 0.15 && result.plan.trimEndSeconds > 0.2);
  const after = await analyzeMp3(input.outputPath);
  const internal = (audio) => audio.silences.filter((silence) => silence.startSeconds > 0.15 && silence.endSeconds < audio.decodedDurationSeconds - 0.15);
  assert.equal(internal(before).length, 1);
  assert.equal(internal(after).length, 1);
  const pauseLength = (audio) => internal(audio)[0].endSeconds - internal(audio)[0].startSeconds;
  assert.ok(pauseLength(after) > 0.7);
  assert.ok(Math.abs(pauseLength(before) - pauseLength(after)) < 0.04);
  assert.ok(after.silences[0].endSeconds >= 0.055);
  assert.equal(after.silences[0].startSeconds, 0);
  assert.ok(after.decodedDurationSeconds - after.silences.at(-1).startSeconds >= 0.055);
  assert.ok(after.silences.at(-1).endSeconds >= after.decodedDurationSeconds - 0.001);
  assert.ok(after.durationSeconds <= 3.15);
  assert.deepEqual(await readFile(input.inputPath), original);
  const proof = JSON.parse(await readFile(`${input.outputPath}.fit.json`, 'utf8'));
  assert.equal(proof.input.sha256, hash(original));
  assert.equal(proof.output.sha256, hash(await readFile(input.outputPath)));
  assert.equal(proof.output.detectedEdgeSilences.wordBoundariesVerified, false);
  assert.ok(proof.output.detectedEdgeSilences.minimumSilenceSeconds < 0.06);
});

test('a small overrun uses bounded tempo and qualifies the complete encoded copy', async (t) => {
  const input = await fixture(t, 3.3, 3.1);
  const original = await readFile(input.inputPath);
  const result = await fitWebNarration(input);
  assert.equal(result.timingFit, true);
  assert.ok(result.appliedTempo > 1 && result.appliedTempo <= 1.10);
  assert.ok(result.output.durationSeconds <= 3.1);
  assert.ok(result.output.decodedDurationSeconds <= 3.1);
  assert.ok(result.attempts.every((attempt) => attempt.tempo <= 1.10));
  assert.deepEqual(await readFile(input.inputPath), original);
});

test('actual encoded duration can reject a theoretical fit without a qualified output', async (t) => {
  // A short real file exposes encoder/tempo rounding: the arithmetic duration
  // fits at 1.10x, but the measured complete output still exceeds its window.
  const input = await fixture(t, 0.4, 0.365);
  const original = await readFile(input.inputPath);
  const result = await fitWebNarration(input);
  assert.ok(result.plan.requiredTempo <= 1.10);
  assert.equal(result.plan.mode, 'needs-shorter-text');
  assert.equal(result.timingFit, false);
  assert.equal(result.output, null);
  assert.ok(result.attempts.length >= 2);
  assert.ok(result.attempts.at(-1).durationSeconds > 0.365);
  assert.ok(result.attempts.every((attempt) => attempt.tempo <= 1.10));
  await assert.rejects(stat(input.outputPath), {code: 'ENOENT'});
  assert.equal(JSON.parse(await readFile(`${input.outputPath}.fit.json`, 'utf8')).timingFit, false);
  assert.deepEqual(await readFile(input.inputPath), original);
});

test('dry-run and too-long input cannot overwrite source, copy or generation receipt', async (t) => {
  const input = await fixture(t, 5, 3.5);
  const original = await readFile(input.inputPath);
  const dryRun = await fitWebNarration({...input, execute: false});
  assert.equal(dryRun.execution, 'dry-run');
  assert.equal(dryRun.plan.mode, 'needs-shorter-text');
  await assert.rejects(stat(input.outputPath), {code: 'ENOENT'});
  await assert.rejects(stat(`${input.outputPath}.fit.json`), {code: 'ENOENT'});
  const refused = await fitWebNarration(input);
  assert.equal(refused.output, null);
  await assert.rejects(stat(input.outputPath), {code: 'ENOENT'});
  await assert.rejects(fitWebNarration({...input, outputPath: input.inputPath}), {code: 'INVALID_INPUT'});
  await assert.rejects(fitWebNarration(input), {code: 'OUTPUT_EXISTS'});
  assert.deepEqual(await readFile(input.inputPath), original);
});
