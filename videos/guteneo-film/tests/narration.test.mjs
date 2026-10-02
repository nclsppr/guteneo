import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
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
function provider({ tier = 'starter', status = 'active', canTts = true, languages = ['fra', 'eng', 'deu', 'ltz'], postStatus = 200, postError } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (url.endsWith('/v1/user/subscription')) return Response.json({ tier, status });
    if (url.endsWith('/v1/models')) return Response.json([{ model_id: 'eleven_v4', can_do_text_to_speech: canTts, languages: languages.map((language_id) => ({ language_id })) }]);
    assert.equal(options.method, 'POST');
    assert.ok(url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/'));
    const body = JSON.parse(options.body);
    assert.equal(body.model_id, 'eleven_v4');
    assert.deepEqual(Object.keys(body.voice_settings).sort(), ['similarity_boost', 'stability']);
    assert.ok(['fr', 'en', 'de', 'lb'].includes(body.language_code));
    if (postError) throw postError;
    return new Response(Buffer.from('mock-mp3-audio'), { status: postStatus, headers: { 'request-id': 'request-123' } });
  };
  return { calls, fetchImpl, posts: () => calls.filter((call) => call.options.method === 'POST') };
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
  for (const changedConfig of [{ ...config, voiceId: 'OtherVoice' }, { ...config, voiceSettings: { ...config.voiceSettings, stability: 0.6 } }, { ...config, voiceSettings: { ...config.voiceSettings, similarity_boost: 0.8 } }]) assert.notEqual(buildPlan(manifest(), changedConfig).clips[0].fingerprint, original);
  const m = manifest(); m.narrations[0].cues[0].text += ' Changed.';
  assert.notEqual(buildPlan(m, config).clips[0].fingerprint, original);
  assert.notEqual(buildPlan(manifest(['en']), config).clips[0].fingerprint, original);
  assert.equal(buildPlan(manifest(), { ...config, voiceSettings: { similarity_boost: 0.75, stability: 0.5 } }).clips[0].fingerprint, original);
});

test('budget and missing voice gates stop before all network requests', async (t) => {
  const outputDir = await directory(t);
  const fake = provider();
  await assert.rejects(generateNarration(buildPlan(manifest(), config), { ...options, outputDir, maxCharacters: 1, fetchImpl: fake.fetchImpl }), { code: 'BUDGET_EXCEEDED' });
  await assert.rejects(generateNarration(buildPlan(manifest(), { ...config, voiceId: null }), { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'VOICE_REQUIRED' });
  await assert.rejects(generateNarration(buildPlan(manifest(), config), { ...options, outputDir, maxCharacters: undefined, fetchImpl: fake.fetchImpl }), { code: 'BUDGET_REQUIRED' });
  assert.equal(fake.calls.length, 0);
});

test('generation rejects a tampered plan instead of trusting its character count or fingerprint', async (t) => {
  const outputDir = await directory(t);
  const fake = provider();
  for (const mutate of [
    (p) => { p.clips[0].text += ' Added after budgeting.'; },
    (p) => { p.clips[0].textCharacters = 1; },
    (p) => { p.clips[0].fingerprint = '0'.repeat(64); },
    (p) => { p.clips[0].endSeconds = 52; },
    (p) => { p.clips[0].voiceSettings.speed = 4; },
    (p) => { p.clips.push(structuredClone(p.clips[0])); },
  ]) {
    const plan = buildPlan(manifest(), config); mutate(plan);
    await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'INVALID_INPUT' });
  }
  assert.equal(fake.calls.length, 0);
});

test('changing plan total cannot lower billing budget, and async caller mutation cannot change a POST', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(), config);
  plan.totalCharacters = 1;
  const fake = provider();
  await assert.rejects(generateNarration(plan, { ...options, maxCharacters: 1, outputDir, fetchImpl: fake.fetchImpl }), { code: 'BUDGET_EXCEEDED' });
  assert.equal(fake.calls.length, 0);
  const originalText = plan.clips[0].text;
  const fetchImpl = async (url, requestOptions) => {
    plan.clips[0].text = 'Caller changed text while preflight awaits.';
    return fake.fetchImpl(url, requestOptions);
  };
  await generateNarration(plan, { ...options, outputDir, fetchImpl });
  assert.equal(JSON.parse(fake.posts()[0].options.body).text, originalText);
});

test('only active recognized paid subscriptions pass; no POST on gate failure', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(), config);
  for (const subscription of [{ tier: 'free' }, { tier: 'trial' }, { tier: 'unknown-paid' }, ...['trialing', 'incomplete', 'past_due', 'free', 'free_disabled'].map((status) => ({ status }))]) {
    const fake = provider(subscription);
    await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'SUBSCRIPTION_REJECTED' });
    assert.equal(fake.posts().length, 0);
  }
});

test('model and Luxembourgish gates prevent POST; ISO639-3 maps to ISO639-1 requests', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(['lb']), config);
  for (const settings of [{ canTts: false }, { languages: ['fra', 'eng', 'deu'] }]) {
    const fake = provider(settings);
    await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }));
    assert.equal(fake.posts().length, 0);
  }
  const fake = provider();
  await generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl });
  assert.equal(JSON.parse(fake.posts()[0].options.body).language_code, 'lb');
});

test('controlled bibliographic fre/ger aliases map to fr/de API requests', async (t) => {
  const outputDir = await directory(t);
  const fake = provider({ languages: ['fre', 'ger'] });
  await generateNarration(buildPlan(manifest(['fr', 'de']), config), { ...options, outputDir, fetchImpl: fake.fetchImpl });
  assert.deepEqual(fake.posts().map((call) => JSON.parse(call.options.body).language_code), ['fr', 'de']);
});

test('inflight is persisted before POST and complete cache is never billed twice', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(), config);
  const fake = provider();
  const fetchImpl = async (url, requestOptions) => {
    if (requestOptions.method === 'POST') {
      const state = JSON.parse(await readFile(path.join(outputDir, 'generation.json'), 'utf8'));
      assert.equal(state.clips['introduction-fr/sources'].status, 'inflight');
    }
    return fake.fetchImpl(url, requestOptions);
  };
  const first = await generateNarration(plan, { ...options, outputDir, fetchImpl });
  assert.equal(first.generated, 1);
  assert.equal(first.billedCharacters, plan.totalCharacters);
  const second = await generateNarration(plan, { ...options, maxCharacters: 1, outputDir, fetchImpl: async () => { throw new Error('Cache must not call provider'); } });
  assert.equal(second.cached, 1);
  assert.equal(second.billedCharacters, 0);
  assert.equal(fake.posts().length, 1);
  assert.equal(second.clips['introduction-fr/sources'].requestId, 'request-123');
});

test('unknown outcomes and prior process interruption cannot be retried', async (t) => {
  const outputDir = await directory(t);
  const plan = buildPlan(manifest(), config);
  const fake = provider({ postError: new Error('Simulated lost response') });
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'OUTCOME_UNKNOWN' });
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'OUTCOME_UNKNOWN' });
  assert.equal(fake.posts().length, 1);
  const statePath = path.join(outputDir, 'generation.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.clips['introduction-fr/sources'].status = 'inflight';
  await writeFile(statePath, JSON.stringify(state));
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'OUTCOME_UNKNOWN' });
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).clips['introduction-fr/sources'].status, 'unknown');
  assert.equal(fake.posts().length, 1);
});

test('HTTP 5xx remains unknown; explicit rejection has no automatic retry', async (t) => {
  for (const [postStatus, expectedStatus, code] of [[503, 'unknown', 'OUTCOME_UNKNOWN'], [422, 'rejected', 'PROVIDER_REJECTED']]) {
    const outputDir = await directory(t);
    const fake = provider({ postStatus });
    await assert.rejects(generateNarration(buildPlan(manifest(), config), { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code });
    const state = JSON.parse(await readFile(path.join(outputDir, 'generation.json'), 'utf8'));
    assert.equal(state.clips['introduction-fr/sources'].status, expectedStatus);
    assert.equal(fake.posts().length, 1);
  }
});

test('timing overflow preserves paid audio but refuses use and regeneration', async (t) => {
  const outputDir = await directory(t);
  const fake = provider();
  const plan = buildPlan(manifest(), config);
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl, probeAudio: async () => 7 }), { code: 'TIMING_EXCEEDED' });
  const state = JSON.parse(await readFile(path.join(outputDir, 'generation.json'), 'utf8'));
  assert.equal(state.clips['introduction-fr/sources'].status, 'complete');
  assert.equal(state.clips['introduction-fr/sources'].timingFit, false);
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'TIMING_EXCEEDED' });
  assert.equal(fake.posts().length, 1);
});

test('a failed duration probe retains the paid output and cannot trigger regeneration', async (t) => {
  const outputDir = await directory(t);
  const fake = provider();
  const plan = buildPlan(manifest(), config);
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl, probeAudio: async () => { throw new Error('Probe failed with sensitive diagnostic'); } }), { code: 'AUDIO_INVALID' });
  const state = JSON.parse(await readFile(path.join(outputDir, 'generation.json'), 'utf8'));
  assert.equal(state.clips['introduction-fr/sources'].status, 'complete');
  assert.equal(state.clips['introduction-fr/sources'].durationSeconds, null);
  assert.equal(state.clips['introduction-fr/sources'].timingFit, false);
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'AUDIO_INVALID' });
  assert.equal(fake.posts().length, 1);
});

test('cache tampering and competing lock refuse generation without provider calls', async (t) => {
  const outputDir = await directory(t);
  const fake = provider();
  const plan = buildPlan(manifest(), config);
  await generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl });
  await writeFile(path.join(outputDir, plan.clips[0].relativePath), 'tampered');
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'CACHE_INVALID' });
  await writeFile(path.join(outputDir, 'generation.lock'), 'other-owner');
  await assert.rejects(generateNarration(plan, { ...options, outputDir, fetchImpl: fake.fetchImpl }), { code: 'LOCKED' });
  assert.equal(fake.posts().length, 1);
});
