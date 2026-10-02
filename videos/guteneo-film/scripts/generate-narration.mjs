import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const API_ORIGIN = 'https://api.elevenlabs.io';
const LOCALES = ['fr', 'en', 'de', 'lb'];
const LANGUAGE_IDS = { fr: ['fr', 'fra', 'fre'], en: ['en', 'eng'], de: ['de', 'deu', 'ger'], lb: ['lb', 'ltz'] };
const PAID_TIERS = new Set(['starter', 'creator', 'pro', 'scale', 'business', 'enterprise']);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL = 'eleven_v4';
const FORMAT = 'mp3_44100_128';
const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message, code = 'INVALID_INPUT') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function finite(value, name) {
  if (!Number.isFinite(value)) fail(`${name} must be finite.`);
}
function voiceId(value) {
  if (value !== null && value !== undefined && (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))) fail('Invalid voice ID.');
  return value ?? null;
}
function clipFingerprint(clip) {
  return hash(JSON.stringify(canonical({
    endpoint: `${API_ORIGIN}/v1/text-to-speech/${clip.voiceId}`,
    model_id: MODEL, output_format: FORMAT, language_code: clip.locale,
    text: clip.text, voice_settings: clip.voiceSettings, apply_text_normalization: 'auto',
  })));
}

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.modelId !== MODEL || manifest.outputFormat !== FORMAT) fail('Unsupported narration manifest, model or format.');
  if (!Array.isArray(manifest.narrations) || !manifest.narrations.length) fail('Manifest must contain narrations.');
  const narrationIds = new Set();
  for (const narration of manifest.narrations) {
    if (!['introduction', 'roles'].includes(narration.kind) || !LOCALES.includes(narration.locale)) fail('Unsupported narration kind or locale.');
    if (!SAFE_ID.test(narration.id) || narration.id !== `${narration.kind}-${narration.locale}` || narrationIds.has(narration.id)) fail('Invalid or duplicate narration ID.');
    narrationIds.add(narration.id);
    finite(narration.durationSeconds, 'durationSeconds');
    finite(narration.endCardStartSeconds, 'endCardStartSeconds');
    if (narration.durationSeconds <= 5 || Math.abs(narration.durationSeconds - narration.endCardStartSeconds - 5) > 0.000001) fail('The final card must retain five seconds without narration.');
    if (!Array.isArray(narration.cues) || !narration.cues.length) fail('Narration must contain cues.');
    const cueIds = new Set();
    let previousEnd = 0;
    for (const cue of narration.cues) {
      if (!SAFE_ID.test(cue.id) || cueIds.has(cue.id)) fail('Invalid or duplicate cue ID.');
      cueIds.add(cue.id);
      finite(cue.startSeconds, 'startSeconds');
      finite(cue.endSeconds, 'endSeconds');
      if (cue.startSeconds < previousEnd || cue.endSeconds <= cue.startSeconds || cue.endSeconds > narration.endCardStartSeconds) fail('Cue overlaps another cue or the final card.');
      if (typeof cue.text !== 'string' || !cue.text.trim()) fail('Cue text must be nonempty.');
      previousEnd = cue.endSeconds;
    }
  }
  return manifest;
}

export function buildPlan(manifest, config, filters = {}) {
  validateManifest(manifest);
  if (config?.modelId !== MODEL || config.outputFormat !== FORMAT) fail('Voice config must select eleven_v4 and mp3_44100_128.');
  const settings = config.voiceSettings ?? { stability: 0.5, similarity_boost: 0.75 };
  if (Object.keys(settings).some((key) => !['stability', 'similarity_boost'].includes(key))) fail('v4 settings support only stability and similarity_boost here.');
  for (const key of ['stability', 'similarity_boost']) {
    finite(settings[key], key);
    if (settings[key] < 0 || settings[key] > 1) fail('Voice settings must lie between 0 and 1.');
  }
  const kind = filters.kind ?? 'all';
  const locales = filters.locales ?? LOCALES;
  if (!['all', 'introduction', 'roles'].includes(kind) || !Array.isArray(locales) || !locales.length || locales.some((locale) => !LOCALES.includes(locale)) || new Set(locales).size !== locales.length) fail('Invalid kind or locales filter.');
  if (filters.cue !== undefined && !SAFE_ID.test(filters.cue)) fail('Invalid cue filter.');
  const clips = [];
  for (const narration of manifest.narrations) {
    if ((kind !== 'all' && narration.kind !== kind) || !locales.includes(narration.locale)) continue;
    for (const cue of narration.cues) {
      if (filters.cue !== undefined && filters.cue !== cue.id) continue;
      const resolvedVoice = voiceId(config.localeVoiceIds?.[narration.locale] ?? config.voiceId);
      const clip = {
        narrationId: narration.id, cueId: cue.id, kind: narration.kind, locale: narration.locale,
        durationSeconds: narration.durationSeconds, endCardStartSeconds: narration.endCardStartSeconds,
        startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, text: cue.text,
        textCharacters: Array.from(cue.text).length, voiceId: resolvedVoice, voiceSettings: { ...settings },
        relativePath: `clips/${narration.id}/${cue.id}.mp3`,
      };
      clips.push({ ...clip, fingerprint: clipFingerprint(clip) });
    }
  }
  if (!clips.length) fail('No narration cues match these filters.');
  return { schemaVersion: 1, modelId: MODEL, outputFormat: FORMAT, clips, totalCharacters: clips.reduce((sum, clip) => sum + clip.textCharacters, 0) };
}

async function saveState(statePath, state) {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}
async function loadState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (state.schemaVersion !== 1 || !state.clips || Array.isArray(state.clips) || typeof state.clips !== 'object') fail('Invalid generation state.', 'CACHE_INVALID');
    for (const [key, entry] of Object.entries(state.clips)) {
      if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key) || !entry || !['complete', 'inflight', 'unknown', 'rejected'].includes(entry.status) || !/^[a-f0-9]{64}$/.test(entry.fingerprint) || entry.path !== `clips/${key}.mp3`) fail('Invalid generation cache entry; inspect it before generating.', 'CACHE_INVALID');
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, clips: {} };
    throw error;
  }
}
async function probeDuration(audioPath) {
  const { stdout } = await runFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath], { timeout: 30000 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) fail('Audio duration is invalid.', 'AUDIO_INVALID');
  return duration;
}
async function request(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
}
async function preflight(plan, fetchImpl, apiKey, timeoutMs) {
  const options = { method: 'GET', headers: { 'xi-api-key': apiKey } };
  const subscriptionResponse = await request(fetchImpl, `${API_ORIGIN}/v1/user/subscription`, options, timeoutMs);
  if (!subscriptionResponse.ok) fail(`Subscription preflight failed (HTTP ${subscriptionResponse.status}).`, 'SUBSCRIPTION_REJECTED');
  const subscription = await subscriptionResponse.json();
  if (subscription.status !== 'active' || !PAID_TIERS.has(subscription.tier)) fail('An active, recognized paid subscription is required for commercial narration.', 'SUBSCRIPTION_REJECTED');
  const modelResponse = await request(fetchImpl, `${API_ORIGIN}/v1/models`, options, timeoutMs);
  if (!modelResponse.ok) fail(`Model preflight failed (HTTP ${modelResponse.status}).`, 'MODEL_REJECTED');
  const models = await modelResponse.json();
  const model = Array.isArray(models) && models.find((item) => item.model_id === MODEL);
  if (!model || model.can_do_text_to_speech !== true || model.requires_alpha_access === true) fail('The required production TTS model is unavailable.', 'MODEL_REJECTED');
  if (Number.isFinite(model.maximum_text_length_per_request) && plan.clips.some((clip) => clip.textCharacters > model.maximum_text_length_per_request)) fail('A cue exceeds the model request limit.', 'MODEL_REJECTED');
  const languages = new Set((Array.isArray(model.languages) ? model.languages : []).map((language) => language.language_id));
  for (const clip of plan.clips) if (!LANGUAGE_IDS[clip.locale].some((id) => languages.has(id))) fail(`Model does not declare support for locale ${clip.locale}.`, 'LANGUAGE_REJECTED');
}

export async function generateNarration(plan, { outputDir = path.join(filmRoot, 'out/narration'), maxCharacters, apiKey, fetchImpl = globalThis.fetch, probeAudio = probeDuration, timeoutMs = 60000 } = {}) {
  plan = structuredClone(plan);
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1) fail('Generation requires a positive --max-characters budget.', 'BUDGET_REQUIRED');
  if (!apiKey || typeof apiKey !== 'string') fail('ELEVENLABS_API_KEY is required for generation.', 'KEY_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) fail('Invalid request timeout.');
  if (plan?.schemaVersion !== 1 || plan.modelId !== MODEL || plan.outputFormat !== FORMAT || !Array.isArray(plan.clips) || !plan.clips.length) fail('Invalid generation plan.');
  for (const clip of plan.clips) {
    if (!clip.voiceId) fail('Select a voice ID before generation.', 'VOICE_REQUIRED');
    voiceId(clip.voiceId);
    if (clip.relativePath !== `clips/${clip.narrationId}/${clip.cueId}.mp3` || !SAFE_ID.test(clip.narrationId) || !SAFE_ID.test(clip.cueId)) fail('Invalid output path.');
    if (!LOCALES.includes(clip.locale) || !['introduction', 'roles'].includes(clip.kind) || clip.narrationId !== `${clip.kind}-${clip.locale}` || typeof clip.text !== 'string' || !clip.text.trim() || clip.textCharacters !== Array.from(clip.text).length) fail('Generation plan text or locale was altered.');
    if (!Number.isFinite(clip.startSeconds) || !Number.isFinite(clip.endSeconds) || clip.startSeconds < 0 || clip.endSeconds <= clip.startSeconds) fail('Invalid cue timing.');
    if (!Number.isFinite(clip.durationSeconds) || !Number.isFinite(clip.endCardStartSeconds) || clip.durationSeconds <= 5 || Math.abs(clip.durationSeconds - clip.endCardStartSeconds - 5) > 0.000001 || clip.endSeconds > clip.endCardStartSeconds) fail('Generation plan infringes the final card.');
    if (!clip.voiceSettings || Object.keys(clip.voiceSettings).sort().join(',') !== 'similarity_boost,stability' || Object.values(clip.voiceSettings).some((value) => !Number.isFinite(value) || value < 0 || value > 1) || clip.fingerprint !== clipFingerprint(clip)) fail('Generation plan parameters or fingerprint were altered.');
  }
  if (new Set(plan.clips.map((clip) => `${clip.narrationId}/${clip.cueId}`)).size !== plan.clips.length) fail('Generation plan contains duplicate cues.');
  outputDir = path.resolve(outputDir);
  await mkdir(outputDir, { recursive: true });
  const lockPath = path.join(outputDir, 'generation.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('Generation is locked. A stopped process requires manual inspection before unlocking.', 'LOCKED'); throw error; }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const statePath = path.join(outputDir, 'generation.json');
    const state = await loadState(statePath);
    let recoveredInflight = false;
    for (const entry of Object.values(state.clips)) if (entry.status === 'inflight') { entry.status = 'unknown'; recoveredInflight = true; }
    if (recoveredInflight) await saveState(statePath, state);
    const pending = [];
    const result = { schemaVersion: 1, clips: {}, generated: 0, cached: 0, billedCharacters: 0 };
    for (const clip of plan.clips) {
      const key = `${clip.narrationId}/${clip.cueId}`;
      const existing = state.clips[key];
      if (existing && ['inflight', 'unknown'].includes(existing.status)) fail(`Uncertain generation ${key} requires manual resolution.`, 'OUTCOME_UNKNOWN');
      if (existing?.status === 'complete' && existing.fingerprint === clip.fingerprint) {
        if (existing.path !== clip.relativePath) fail(`Invalid cache path for ${key}.`, 'CACHE_INVALID');
        let bytes;
        try { bytes = await readFile(path.join(outputDir, clip.relativePath)); } catch { fail(`Cached audio is missing for ${key}; resolve without regenerating.`, 'CACHE_INVALID'); }
        if (!bytes.length || hash(bytes) !== existing.audioSha256) fail(`Cached audio hash is invalid for ${key}.`, 'CACHE_INVALID');
        if (!Number.isFinite(existing.durationSeconds) || existing.durationSeconds <= 0) fail(`Cached audio duration is unqualified for ${key}.`, 'AUDIO_INVALID');
        const fits = existing.durationSeconds <= clip.endSeconds - clip.startSeconds + 0.000001;
        if (existing.timingFit !== fits) { existing.timingFit = fits; await saveState(statePath, state); }
        if (!fits) fail(`Cached narration exceeds its cue window: ${key}.`, 'TIMING_EXCEEDED');
        result.clips[key] = existing;
        result.cached++;
      } else pending.push(clip);
    }
    const pendingCharacters = pending.reduce((sum, clip) => sum + clip.textCharacters, 0);
    if (pendingCharacters > maxCharacters) fail(`Uncached narration requires ${pendingCharacters} characters, above budget ${maxCharacters}.`, 'BUDGET_EXCEEDED');
    if (!pending.length) return result;
    await preflight({ ...plan, clips: pending }, fetchImpl, apiKey, timeoutMs);
    for (const clip of pending) {
      const key = `${clip.narrationId}/${clip.cueId}`;
      const entry = { fingerprint: clip.fingerprint, status: 'inflight', path: clip.relativePath, textCharacters: clip.textCharacters, requestedAt: new Date().toISOString() };
      state.clips[key] = entry;
      await saveState(statePath, state);
      let response;
      let bytes;
      try {
        response = await request(fetchImpl, `${API_ORIGIN}/v1/text-to-speech/${clip.voiceId}?output_format=${FORMAT}`, {
          method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text: clip.text, model_id: MODEL, language_code: clip.locale, voice_settings: clip.voiceSettings, apply_text_normalization: 'auto' }),
        }, timeoutMs);
        const requestId = response.headers?.get('request-id') ?? response.headers?.get('x-request-id');
        if (requestId) { entry.requestId = requestId; await saveState(statePath, state); }
        if (!response.ok) {
          entry.status = response.status >= 400 && response.status < 500 ? 'rejected' : 'unknown';
          entry.httpStatus = response.status;
          await saveState(statePath, state);
          fail(`Narration ${key} failed (HTTP ${response.status}); no retry was made.`, entry.status === 'unknown' ? 'OUTCOME_UNKNOWN' : 'PROVIDER_REJECTED');
        }
        bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) fail('Provider returned empty audio.', 'AUDIO_INVALID');
      } catch (error) {
        if (entry.status === 'inflight') { entry.status = 'unknown'; await saveState(statePath, state); }
        if (entry.status === 'unknown') fail(`Uncertain provider outcome for ${key}; manual resolution is required.`, 'OUTCOME_UNKNOWN');
        throw error;
      }
      const audioPath = path.join(outputDir, clip.relativePath);
      await mkdir(path.dirname(audioPath), { recursive: true });
      const temporaryAudio = `${audioPath}.${randomUUID()}.tmp`;
      await writeFile(temporaryAudio, bytes, { mode: 0o600 });
      await rename(temporaryAudio, audioPath);
      let durationSeconds = null;
      try { durationSeconds = await probeAudio(audioPath); } catch { /* Persist the paid output; never re-request it automatically. */ }
      const validDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
      Object.assign(entry, { status: 'complete', audioSha256: hash(bytes), durationSeconds: validDuration ? durationSeconds : null, timingFit: validDuration && durationSeconds <= clip.endSeconds - clip.startSeconds + 0.000001 });
      await saveState(statePath, state);
      result.clips[key] = entry;
      result.generated++;
      result.billedCharacters += clip.textCharacters;
      if (!validDuration) fail(`Audio duration could not be qualified for ${key}; output was cached.`, 'AUDIO_INVALID');
      if (!entry.timingFit) fail(`Narration exceeds its cue window: ${key}; output was cached without truncation.`, 'TIMING_EXCEEDED');
    }
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = { manifest: path.join(filmRoot, 'narration/scripts.json'), config: path.join(filmRoot, 'narration/voices.example.json'), outputDir: path.join(filmRoot, 'out/narration'), kind: 'all' };
  const valued = new Map([['--manifest', 'manifest'], ['--config', 'config'], ['--output-dir', 'outputDir'], ['--kind', 'kind'], ['--locales', 'locales'], ['--cue', 'cue'], ['--max-characters', 'maxCharacters']]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') {
      console.log('Usage: node scripts/generate-narration.mjs [--kind all|introduction|roles] [--locales fr,en,de,lb] [--cue id] [--config file] [--manifest file] [--output-dir dir]\nDefault: offline plan. Generation requires --generate --max-characters N and ELEVENLABS_API_KEY.');
      return;
    }
    if (arg === '--generate') { options.generate = true; continue; }
    const key = valued.get(arg);
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) fail('Unknown or incomplete CLI option.');
    options[key] = args[++index];
  }
  const manifest = JSON.parse(await readFile(path.resolve(options.manifest), 'utf8'));
  const config = JSON.parse(await readFile(path.resolve(options.config), 'utf8'));
  const plan = buildPlan(manifest, config, { kind: options.kind, locales: options.locales?.split(','), cue: options.cue });
  if (!options.generate) {
    console.log(JSON.stringify({ mode: 'offline-plan', schemaVersion: 1, modelId: plan.modelId, outputFormat: plan.outputFormat, totalCharacters: plan.totalCharacters, clips: plan.clips.map(({ text, voiceSettings, ...clip }) => ({ ...clip, voiceSelected: Boolean(clip.voiceId) })) }, null, 2));
    return;
  }
  if (!/^\d+$/.test(options.maxCharacters ?? '')) fail('--generate requires --max-characters N.', 'BUDGET_REQUIRED');
  const result = await generateNarration(plan, { outputDir: options.outputDir, maxCharacters: Number(options.maxCharacters), apiKey: process.env.ELEVENLABS_API_KEY });
  console.log(JSON.stringify({ mode: 'generated', generated: result.generated, cached: result.cached, billedCharacters: result.billedCharacters }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const safeCodes = ['INVALID_INPUT', 'CACHE_INVALID', 'AUDIO_INVALID', 'SUBSCRIPTION_REJECTED', 'MODEL_REJECTED', 'LANGUAGE_REJECTED', 'BUDGET_REQUIRED', 'BUDGET_EXCEEDED', 'KEY_REQUIRED', 'VOICE_REQUIRED', 'LOCKED', 'OUTCOME_UNKNOWN', 'PROVIDER_REJECTED', 'TIMING_EXCEEDED'];
    console.error(safeCodes.includes(error.code) ? `${error.code}: ${error.message}` : 'NARRATION_ERROR: Narration failed; no automatic retry was made.');
    process.exitCode = 1;
  });
}
