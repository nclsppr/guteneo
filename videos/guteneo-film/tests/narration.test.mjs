import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPlan, generateNarration, validateManifest } from '../scripts/generate-narration.mjs';

const config = { modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', voiceId: 'WarmMaleVoice123', voiceSettings: { stability: 0.5, similarity_boost: 0.75 } };
function manifest(locales = ['fr']) {
  return { schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'mp3_44100_128', narrations: locales.map((locale) => ({ id: `introduction-${locale}`, kind: 'introduction', locale, durationSeconds: 56, endCardStartSeconds: 51, cues: [{ id: 'sources', startSeconds: 2, endSeconds: 8, text: `Document ${locale}.` }] })) };
}
async function directory(t) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'guteneo-narration-test-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  return outputDir;
}
const options = { apiKey: 'test-only-key', maxCharacters: 1000, probeAudio: async () => 3 };

test('offline plans do not invoke fetch; locale voice overrides and paths are stable', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('Unexpected network'); };
  try {
    const plan = buildPlan(manifest(['fr', 'en', 'de', 'lb']), { ...config, localeVoiceIds: { lb: 'LuxVoice123' } }, { locales: ['lb'], cue: 'sources' });
    assert.equal(calls, 0);
    assert.equal(plan.clips.length, 1);
    assert.equal(plan.clips[0].voiceId, 'LuxVoice123');
    assert.equal(plan.clips[0].relativePath, 'clips/introduction-lb/sources.mp3');
    assert.equal(plan.totalCharacters, Array.from('Document lb.').length);
    assert.match(plan.clips[0].fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(buildPlan(manifest(), { ...config, voiceId: null }).clips[0].voiceId, null);
  } finally { globalThis.fetch = originalFetch; }
});

test('default CLI remains offline even with an API key and omits script text from logs', async (t) => {
  const outputDir = await directory(t);
  const manifestPath = path.join(outputDir, 'scripts.json');
  const configPath = path.join(outputDir, 'voices.json');
  await writeFile(manifestPath, JSON.stringify(manifest()));
  await writeFile(configPath, JSON.stringify(config));
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', 'data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error(%22Network%20forbidden%22)%7D',
    fileURLToPath(new URL('../scripts/generate-narration.mjs', import.meta.url)),
    '--manifest', manifestPath, '--config', configPath,
  ], { env: { ...process.env, ELEVENLABS_API_KEY: 'test-only-key' } });
  assert.equal(JSON.parse(stdout).mode, 'offline-plan');
  assert.ok(!stdout.includes('Document fr.'));
  assert.ok(!stdout.includes('test-only-key'));
});

test('manifest rejects overlapping cues, final-card speech, duplicate IDs and unsafe paths', () => {
  for (const mutate of [
    (m) => m.narrations[0].cues.push({ id: 'second', startSeconds: 7, endSeconds: 9, text: 'Second.' }),
    (m) => { m.narrations[0].cues[0].endSeconds = 52; },
    (m) => { m.narrations[0].endCardStartSeconds = 50; },
    (m) => { m.narrations[0].cues[0].id = '../escape'; },
    (m) => { m.narrations[0].cues[0].startSeconds = -1; },
    (m) => m.narrations.push(structuredClone(m.narrations[0])),
  ]) { const m = manifest(); mutate(m); assert.throws(() => validateManifest(m)); }
  assert.throws(() => buildPlan(manifest(), { ...config, voiceSettings: { ...config.voiceSettings, speed: 1 } }));
  assert.throws(() => buildPlan(manifest(), config, { locales: ['ltz'] }));
});

test('fingerprint covers text, voice, model-selected settings and locale', () => {
  const original = buildPlan(manifest(), config).clips[0].fingerprint;
  assert.equal(original, 'a81067d6abcefb109a6885fd8d0858e0daad85883e5d21ca4019d9d0fa503a8b');
  assert.equal(buildPlan(manifest(), { ...config, webGeneration: 2 }).clips[0].fingerprint, original);
  for (const changedConfig of [{ ...config, voiceId: 'OtherVoice' }, { ...config, voiceSettings: { ...config.voiceSettings, stability: 0.6 } }, { ...config, voiceSettings: { ...config.voiceSettings, similarity_boost: 0.8 } }]) assert.notEqual(buildPlan(manifest(), changedConfig).clips[0].fingerprint, original);
  const m = manifest(); m.narrations[0].cues[0].text += ' Changed.';
  assert.notEqual(buildPlan(m, config).clips[0].fingerprint, original);
  assert.notEqual(buildPlan(manifest(['en']), config).clips[0].fingerprint, original);
  assert.equal(buildPlan(manifest(), { ...config, voiceSettings: { similarity_boost: 0.75, stability: 0.5 } }).clips[0].fingerprint, original);
});

test('unqualified v4 API adapter blocks every locale before network, probe or output creation', async (t) => {
  const temporary = await directory(t);
  const outputDir = path.join(temporary, 'not-created');
  let requests = 0;
  let probes = 0;
  const fetchImpl = async () => { requests++; throw new Error('Network forbidden'); };
  const probeAudio = async () => { probes++; throw new Error('Probe forbidden'); };
  for (const locale of ['fr', 'en', 'de', 'lb']) {
    await assert.rejects(generateNarration(buildPlan(manifest([locale]), config), { ...options, outputDir, fetchImpl, probeAudio }), { code: 'API_ADAPTER_UNQUALIFIED', message: /Text to Dialogue adapter must be qualified/ });
  }
  assert.equal(requests, 0);
  assert.equal(probes, 0);
  assert.deepEqual(await readdir(temporary), []);
});

test('no key, budget, alternate fetch or modified plan can unlock the old paid API path', async (t) => {
  const outputDir = await directory(t);
  let requests = 0;
  const fetchImpl = async () => { requests++; return Response.json({ tier: 'creator', status: 'active' }); };
  for (const settings of [{}, { ...options }, { ...options, maxCharacters: 1 }, { ...options, apiKey: undefined }]) {
    const plan = buildPlan(manifest(), config);
    plan.totalCharacters = 1;
    plan.clips[0].textCharacters = 1;
    plan.clips[0].fingerprint = '0'.repeat(64);
    await assert.rejects(generateNarration(plan, { ...settings, outputDir, fetchImpl }), { code: 'API_ADAPTER_UNQUALIFIED' });
  }
  assert.equal(requests, 0);
  assert.deepEqual(await readdir(outputDir), []);
});

test('API guard leaves complete and uncertain web caches, audio and existing lock untouched', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(), config);
  const audioPath = path.join(outputDir, plan.clips[0].relativePath);
  await mkdir(path.dirname(audioPath), { recursive: true });
  const audio = Buffer.from('Existing imported web audio must remain exact.');
  await writeFile(audioPath, audio);
  await writeFile(path.join(outputDir, 'generation.lock'), 'existing-owner');
  for (const status of ['complete', 'inflight', 'unknown', 'rejected']) {
    const state = JSON.stringify({ schemaVersion: 1, clips: { 'introduction-fr/sources': {
      status, fingerprint: plan.clips[0].fingerprint, path: plan.clips[0].relativePath,
      source: 'elevenlabs-web', webGeneration: 2, requestId: undefined,
    } } });
    await writeFile(path.join(outputDir, 'generation.json'), state);
    await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: async () => { throw new Error('Network forbidden'); } }), { code: 'API_ADAPTER_UNQUALIFIED' });
    assert.equal(await readFile(path.join(outputDir, 'generation.json'), 'utf8'), state);
    assert.deepEqual(await readFile(audioPath), audio);
    assert.equal(await readFile(path.join(outputDir, 'generation.lock'), 'utf8'), 'existing-owner');
  }
});

test('CLI --generate is explicitly disabled before loading files or exposing key/content', async (t) => {
  const temporary = await directory(t);
  const outputDir = path.join(temporary, 'not-created');
  const run = promisify(execFile);
  const cli = fileURLToPath(new URL('../scripts/generate-narration.mjs', import.meta.url));
  const forbiddenNetwork = 'data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error(%22Network%20forbidden%22)%7D';
  for (const flags of [[], ['--max-characters', '1000']]) {
    await assert.rejects(run(process.execPath, ['--import', forbiddenNetwork, cli,
      '--generate', '--manifest', path.join(temporary, 'missing-manifest.json'),
      '--config', path.join(temporary, 'missing-config.json'), '--output-dir', outputDir, ...flags,
    ], { env: { ...process.env, ELEVENLABS_API_KEY: 'test-only-sensitive-key' } }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /^API_ADAPTER_UNQUALIFIED: Eleven v4 API generation is disabled:/);
      assert.match(error.stderr, /Text to Dialogue adapter must be qualified/);
      assert.ok(!error.stderr.includes('test-only-sensitive-key'));
      assert.ok(!error.stderr.includes(temporary));
      assert.equal(error.stdout, '');
      return true;
    });
  }
  assert.deepEqual(await readdir(temporary), []);
});

test('CLI help states the API block while keeping offline plan and web import available', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/generate-narration.mjs', import.meta.url)), '--help']);
  assert.match(stdout, /Default: offline plan/);
  assert.match(stdout, /--generate is disabled/);
  assert.match(stdout, /Text to Dialogue adapter is qualified/);
  assert.match(stdout, /web imports/);
});
