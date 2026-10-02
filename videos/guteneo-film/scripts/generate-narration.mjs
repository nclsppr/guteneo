import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://api.elevenlabs.io';
const LOCALES = ['fr', 'en', 'de', 'lb'];
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL = 'eleven_v4';
const FORMAT = 'mp3_44100_128';
const API_ADAPTER_MESSAGE = 'Eleven v4 API generation is disabled: a Text to Dialogue adapter must be qualified. Import existing web exports instead.';
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
// Preserve the legacy cache identity for downloaded web exports. This endpoint
// string is a fingerprint component, not an enabled API route.
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

export async function generateNarration() {
  fail(API_ADAPTER_MESSAGE, 'API_ADAPTER_UNQUALIFIED');
}

async function main() {
  const args = process.argv.slice(2);
  const options = { manifest: path.join(filmRoot, 'narration/scripts.json'), config: path.join(filmRoot, 'narration/voices.example.json'), outputDir: path.join(filmRoot, 'out/narration'), kind: 'all' };
  const valued = new Map([['--manifest', 'manifest'], ['--config', 'config'], ['--output-dir', 'outputDir'], ['--kind', 'kind'], ['--locales', 'locales'], ['--cue', 'cue'], ['--max-characters', 'maxCharacters']]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') {
      console.log('Usage: node scripts/generate-narration.mjs [--kind all|introduction|roles] [--locales fr,en,de,lb] [--cue id] [--config file] [--manifest file] [--output-dir dir]\nDefault: offline plan. --generate is disabled until an Eleven v4 Text to Dialogue adapter is qualified; use web imports.');
      return;
    }
    if (arg === '--generate') { options.generate = true; continue; }
    const key = valued.get(arg);
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) fail('Unknown or incomplete CLI option.');
    options[key] = args[++index];
  }
  if (options.generate) fail(API_ADAPTER_MESSAGE, 'API_ADAPTER_UNQUALIFIED');
  const manifest = JSON.parse(await readFile(path.resolve(options.manifest), 'utf8'));
  const config = JSON.parse(await readFile(path.resolve(options.config), 'utf8'));
  const plan = buildPlan(manifest, config, { kind: options.kind, locales: options.locales?.split(','), cue: options.cue });
  console.log(JSON.stringify({ mode: 'offline-plan', schemaVersion: 1, modelId: plan.modelId, outputFormat: plan.outputFormat, totalCharacters: plan.totalCharacters, clips: plan.clips.map(({ text, voiceSettings, ...clip }) => ({ ...clip, voiceSelected: Boolean(clip.voiceId) })) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const safeCodes = ['API_ADAPTER_UNQUALIFIED', 'INVALID_INPUT', 'CACHE_INVALID', 'AUDIO_INVALID', 'SUBSCRIPTION_REJECTED', 'MODEL_REJECTED', 'LANGUAGE_REJECTED', 'BUDGET_REQUIRED', 'BUDGET_EXCEEDED', 'KEY_REQUIRED', 'VOICE_REQUIRED', 'LOCKED', 'OUTCOME_UNKNOWN', 'PROVIDER_REJECTED', 'TIMING_EXCEEDED'];
    console.error(safeCodes.includes(error.code) ? `${error.code}: ${error.message}` : 'NARRATION_ERROR: Narration failed; no automatic retry was made.');
    process.exitCode = 1;
  });
}
