import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {buildPlan} from './generate-narration.mjs';

const run = promisify(execFile);
const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fail(message, code = 'INVALID_INPUT') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function saveState(statePath, state) {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
    await rename(temporary, statePath);
  } finally {await rm(temporary, {force: true});}
}

async function loadState(statePath) {
  let state;
  try {state = JSON.parse(await readFile(statePath, 'utf8'));}
  catch (error) {
    if (error.code === 'ENOENT') return {schemaVersion: 1, clips: {}};
    fail('Generation receipt is unreadable; inspect it before importing.', 'CACHE_INVALID');
  }
  if (state?.schemaVersion !== 1 || !state.clips || typeof state.clips !== 'object' || Array.isArray(state.clips)) fail('Invalid generation receipt.', 'CACHE_INVALID');
  for (const [key, entry] of Object.entries(state.clips)) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key) || !entry || !['complete', 'inflight', 'unknown', 'rejected'].includes(entry.status)
      || !/^[a-f0-9]{64}$/.test(entry.fingerprint) || entry.path !== `clips/${key}.mp3`
      || (entry.webGeneration !== undefined && ![1, 2].includes(entry.webGeneration))) {
      fail('Invalid generation cache entry; inspect it before importing.', 'CACHE_INVALID');
    }
  }
  return state;
}

export async function probeMp3Duration(filePath) {
  let media;
  try {
    const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], {timeout: 30000, maxBuffer: 2 * 1024 * 1024});
    media = JSON.parse(stdout);
  } catch {fail('The export is not a readable MP3.', 'AUDIO_INVALID');}
  const audio = media.streams?.filter((stream) => stream.codec_type === 'audio');
  const duration = Number(media.format?.duration);
  if (media.format?.format_name !== 'mp3' || audio?.length !== 1 || audio[0].codec_name !== 'mp3' || !Number.isFinite(duration) || duration <= 0) {
    fail('The export must contain one valid MP3 audio stream with a measured duration.', 'AUDIO_INVALID');
  }
  return duration;
}

// This imports an already generated web export. It never contacts a provider or
// assigns API request identifiers, billed characters or a subscription result.
export async function importNarration({manifest, config, narrationId, cueId, filePath, outputDir = path.join(filmRoot, 'out/narration'), replace = false, webGeneration, probeAudio = probeMp3Duration} = {}) {
  if (typeof narrationId !== 'string' || typeof cueId !== 'string' || typeof filePath !== 'string' || !path.isAbsolute(filePath) || typeof replace !== 'boolean') fail('Provide a narration, cue and absolute MP3 file path.');
  if (webGeneration !== undefined && ![1, 2].includes(webGeneration)) fail('--web-generation must be 1 or 2.');
  // Build and snapshot the selected cue from the same source used by API and
  // mixing, rather than accepting caller-supplied fingerprints or cache paths.
  const plan = buildPlan(structuredClone(manifest), structuredClone(config), {cue: cueId});
  const clip = plan.clips.find((item) => item.narrationId === narrationId);
  if (!clip) fail('The selected narration and cue do not exist.');
  if (!clip.voiceId) fail('Select the actual web voice ID before importing.', 'VOICE_REQUIRED');
  outputDir = path.resolve(outputDir);
  await mkdir(outputDir, {recursive: true});
  const lockPath = path.join(outputDir, 'generation.lock');
  let lock;
  try {lock = await open(lockPath, 'wx', 0o600);}
  catch (error) {
    if (error.code === 'EEXIST') fail('Generation is locked. Inspect a stopped process before unlocking.', 'LOCKED');
    throw error;
  }
  let temporaryAudio;
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString(), operation: 'web-import'}));
    const statePath = path.join(outputDir, 'generation.json');
    const state = await loadState(statePath);
    const key = `${clip.narrationId}/${clip.cueId}`;
    const audioPath = path.join(outputDir, clip.relativePath);
    const existing = state.clips[key];
    let targetExists = false;
    try {await stat(audioPath); targetExists = true;} catch (error) {if (error.code !== 'ENOENT') throw error;}
    const bytes = await readFile(filePath);
    if (!bytes.length) fail('The MP3 export is empty.', 'AUDIO_INVALID');
    const audioSha256 = sha256(bytes);
    const sameReceipt = existing?.status === 'complete' && existing.fingerprint === clip.fingerprint && existing.audioSha256 === audioSha256;
    // A take number is an explicit statement about this export, not an API
    // model parameter or a default inferred from the local casting config.
    const provenanceConflict = webGeneration !== undefined && existing
      && ((existing.webGeneration !== undefined && existing.webGeneration !== webGeneration) || existing.source !== 'elevenlabs-web');
    let exactCache = false;
    if (sameReceipt && !provenanceConflict && targetExists) exactCache = sha256(await readFile(audioPath)) === audioSha256;
    if (!exactCache && (existing || targetExists) && !replace) fail('Existing audio or receipt differs. Explicit --replace is required after reviewing the replacement.', 'CACHE_CONFLICT');
    await mkdir(path.dirname(audioPath), {recursive: true});
    temporaryAudio = `${audioPath}.${randomUUID()}.import.mp3`;
    await writeFile(temporaryAudio, bytes, {mode: 0o600});
    // Probe the bytes that will be saved, so changes to the downloaded file
    // while probing cannot detach the duration from the stored hash.
    let durationSeconds;
    try {durationSeconds = await probeAudio(temporaryAudio);}
    catch {fail('The export duration could not be qualified; the source file is unchanged.', 'AUDIO_INVALID');}
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) fail('The measured MP3 duration is invalid.', 'AUDIO_INVALID');
    const timingFit = durationSeconds <= clip.endSeconds - clip.startSeconds + 0.000001;
    const result = {mode: exactCache ? 'cached' : 'imported', narrationId: clip.narrationId, cueId: clip.cueId, path: clip.relativePath, audioSha256, durationSeconds, timingFit};
    const selectedGeneration = webGeneration ?? (exactCache ? existing.webGeneration : undefined);
    if (selectedGeneration !== undefined) result.webGeneration = selectedGeneration;
    if (exactCache) {
      const addProvenance = webGeneration !== undefined && existing.webGeneration === undefined;
      if (existing.durationSeconds !== durationSeconds || existing.timingFit !== timingFit || addProvenance) {
        Object.assign(existing, {durationSeconds, timingFit});
        if (addProvenance) Object.assign(existing, {webGeneration, sourceFilename: path.basename(filePath), importedAt: new Date().toISOString()});
        await saveState(statePath, state);
      }
      return result;
    }
    const entry = {
      fingerprint: clip.fingerprint, status: 'inflight', path: clip.relativePath,
      source: 'elevenlabs-web', sourceFilename: path.basename(filePath), importedAt: new Date().toISOString(),
      textCharacters: clip.textCharacters, audioSha256, durationSeconds, timingFit,
    };
    if (webGeneration !== undefined) entry.webGeneration = webGeneration;
    state.clips[key] = entry;
    // Journal before replacement. A crash must leave an interrupted import,
    // rather than a complete receipt pointing to different audio bytes.
    await saveState(statePath, state);
    await rename(temporaryAudio, audioPath);
    temporaryAudio = undefined;
    entry.status = 'complete';
    await saveState(statePath, state);
    return result;
  } finally {
    if (temporaryAudio) await rm(temporaryAudio, {force: true});
    await lock.close();
    await rm(lockPath, {force: true});
  }
}

async function main() {
  const options = {manifest: path.join(filmRoot, 'narration/scripts.json'), config: path.join(filmRoot, 'narration/voices.example.json'), outputDir: path.join(filmRoot, 'out/narration'), replace: false};
  const valued = new Map([['--manifest', 'manifest'], ['--config', 'config'], ['--narration', 'narrationId'], ['--cue', 'cueId'], ['--file', 'filePath'], ['--output-dir', 'outputDir'], ['--web-generation', 'webGeneration']]);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') {
      process.stdout.write('Import an existing ElevenLabs web MP3 without network requests.\n--config local.json --narration introduction-fr --cue one --file /absolute/export.mp3 [--web-generation 1|2] [--replace] [--output-dir dir] [--manifest file]\nTake provenance is absent unless explicitly provided; it does not change the API fingerprint.\nToo-long audio is retained with timingFit:false and exits with status 2.\n');
      return;
    }
    if (arg === '--replace') {options.replace = true; continue;}
    const key = valued.get(arg);
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) fail('Unknown or incomplete import option.');
    options[key] = args[++index];
  }
  if (options.webGeneration !== undefined) {
    if (!/^[12]$/.test(options.webGeneration)) fail('--web-generation must be 1 or 2.');
    options.webGeneration = Number(options.webGeneration);
  }
  const manifest = JSON.parse(await readFile(path.resolve(options.manifest), 'utf8'));
  const config = JSON.parse(await readFile(path.resolve(options.config), 'utf8'));
  const result = await importNarration({...options, manifest, config});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.timingFit) {
    process.stderr.write('TIMING_EXCEEDED: Audio was retained without truncation or acceleration; mixing remains blocked.\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const safeCodes = ['INVALID_INPUT', 'CACHE_INVALID', 'CACHE_CONFLICT', 'LOCKED', 'AUDIO_INVALID', 'VOICE_REQUIRED'];
    process.stderr.write(safeCodes.includes(error.code) ? `${error.code}: ${error.message}\n` : 'IMPORT_ERROR: Local narration import failed; no provider call was made.\n');
    process.exitCode = 1;
  });
}
