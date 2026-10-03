import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {link, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {validateManifest} from '../videos/guteneo-film/scripts/generate-narration.mjs';

const run = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIT_POLICY = Object.freeze({thresholdDb: -45, minimumSilenceSeconds: 0.06, edgeMarginSeconds: 0.06, maxTempo: 1.10});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const epsilon = 0.001;
const outputSilenceMinimumSeconds = 0.005;

function fail(message, code = 'INVALID_INPUT') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function ffmpeg(args) {
  return run('ffmpeg', ['-hide_banner', '-nostdin', ...args], {timeout: 120000, maxBuffer: 8 * 1024 * 1024});
}

async function probeMp3(file) {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 30000});
  const media = JSON.parse(stdout);
  const audio = media.streams?.filter((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number(media.format?.duration);
  if (media.format?.format_name !== 'mp3' || audio?.length !== 1 || audio[0].codec_name !== 'mp3'
    || ![1, 2].includes(audio[0].channels) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    fail('Expected one readable mono or stereo MP3 audio stream.', 'AUDIO_INVALID');
  }
  return {durationSeconds, sampleRate: Number(audio[0].sample_rate), channels: audio[0].channels};
}

export function parseSilences(stderr, durationSeconds) {
  const intervals = [];
  let start;
  for (const line of stderr.split('\n')) {
    const beginning = line.match(/silence_start:\s*(-?[\d.]+)/);
    const ending = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (beginning) {
      if (start !== undefined) fail('Overlapping silence detector events.', 'AUDIO_INVALID');
      start = Number(beginning[1]);
    }
    if (ending) {
      if (start === undefined) fail('Unpaired silence detector events.', 'AUDIO_INVALID');
      intervals.push({startSeconds: start, endSeconds: Number(ending[1])});
      start = undefined;
    }
  }
  if (start !== undefined) intervals.push({startSeconds: start, endSeconds: durationSeconds});
  return intervals;
}

export async function analyzeMp3(file, {minimumSilenceSeconds = FIT_POLICY.minimumSilenceSeconds} = {}) {
  if (!Number.isFinite(minimumSilenceSeconds) || minimumSilenceSeconds <= 0) fail('Invalid silence measurement threshold.');
  const media = await probeMp3(file);
  const {stderr} = await ffmpeg(['-err_detect', 'explode', '-i', file, '-map', '0:a:0', '-af',
    `silencedetect=noise=${FIT_POLICY.thresholdDb}dB:d=${minimumSilenceSeconds},astats=metadata=0:reset=0`, '-f', 'null', '-']);
  const counts = [...stderr.matchAll(/Number of samples:\s*(\d+)/g)];
  const decodedSamples = Number(counts.at(-1)?.[1]);
  if (!Number.isFinite(decodedSamples) || decodedSamples <= 0 || !Number.isFinite(media.sampleRate) || media.sampleRate <= 0) {
    fail('Complete decoded audio duration could not be measured.', 'AUDIO_INVALID');
  }
  const decodedDurationSeconds = decodedSamples / media.sampleRate;
  return {...media, decodedSamples, decodedDurationSeconds, silences: parseSilences(stderr, decodedDurationSeconds)};
}

// Only the first and last silence touching the file boundaries can be removed.
// Preserve 66ms in the source, nominally 60ms at the maximum 1.10x tempo.
// atempo may reshape the output edges; measure those separately in the proof.
// Silence detection is an amplitude heuristic, not a transcript or word boundary.
export function planEdgeFit({durationSeconds, decodedDurationSeconds, silences, windowSeconds}) {
  if (![durationSeconds, decodedDurationSeconds, windowSeconds].every((value) => Number.isFinite(value) && value > 0)
    || !Array.isArray(silences)) fail('Invalid measured duration or cue window.');
  let previousEnd = 0;
  for (const interval of silences) {
    if (![interval.startSeconds, interval.endSeconds].every(Number.isFinite) || interval.startSeconds < previousEnd
      || interval.startSeconds < 0 || interval.endSeconds <= interval.startSeconds || interval.endSeconds > decodedDurationSeconds + epsilon) {
      fail('Invalid or overlapping silence intervals.', 'AUDIO_INVALID');
    }
    previousEnd = interval.endSeconds;
  }
  const first = silences[0];
  const last = silences.at(-1);
  if (first?.startSeconds <= epsilon && first.endSeconds >= decodedDurationSeconds - epsilon) {
    fail('The audio is entirely below the silence threshold; review it manually.', 'AUDIO_SILENT');
  }
  const unchanged = Math.max(durationSeconds, decodedDurationSeconds) <= windowSeconds;
  const sourceMarginSeconds = FIT_POLICY.edgeMarginSeconds * FIT_POLICY.maxTempo;
  const trimStartSeconds = unchanged || first?.startSeconds > epsilon || !first ? 0 : Math.max(0, first.endSeconds - sourceMarginSeconds);
  const trimEndSeconds = unchanged || !last || last.endSeconds < decodedDurationSeconds - epsilon
    ? 0 : Math.max(0, decodedDurationSeconds - last.startSeconds - sourceMarginSeconds);
  const retainedStartSeconds = trimStartSeconds;
  const retainedEndSeconds = decodedDurationSeconds - trimEndSeconds;
  const retainedDurationSeconds = retainedEndSeconds - retainedStartSeconds;
  const requiredTempo = Math.max(1, retainedDurationSeconds / windowSeconds);
  return {
    mode: unchanged ? 'unchanged' : requiredTempo > FIT_POLICY.maxTempo ? 'needs-shorter-text' : 'candidate',
    windowSeconds, trimStartSeconds, trimEndSeconds, retainedStartSeconds, retainedEndSeconds,
    retainedDurationSeconds, requiredTempo, sourceEdgeMarginSeconds: sourceMarginSeconds,
    nominalOutputEdgeMarginSeconds: FIT_POLICY.edgeMarginSeconds,
  };
}

function outputEdgesFromAnalysis(audio) {
  const first = audio.silences[0];
  const last = audio.silences.at(-1);
  return {
    thresholdDb: FIT_POLICY.thresholdDb, minimumSilenceSeconds: outputSilenceMinimumSeconds,
    startDurationSeconds: first?.startSeconds <= epsilon ? first.endSeconds : 0,
    endDurationSeconds: last && last.endSeconds >= audio.decodedDurationSeconds - epsilon
      ? audio.decodedDurationSeconds - last.startSeconds : 0,
    decodedDurationSeconds: audio.decodedDurationSeconds, wordBoundariesVerified: false,
  };
}

export async function measureOutputEdges(file) {
  return outputEdgesFromAnalysis(await analyzeMp3(file, {minimumSilenceSeconds: outputSilenceMinimumSeconds}));
}

async function assertAbsent(file) {
  try {await stat(file); fail('Output or proof already exists; choose a new copy path.', 'OUTPUT_EXISTS');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
}

function selectedCue(manifest, narrationId, cueId) {
  validateManifest(manifest);
  const narration = manifest.narrations.find((item) => item.id === narrationId);
  const cue = narration?.cues.find((item) => item.id === cueId);
  if (!cue) fail('The selected narration or cue does not exist.');
  return {...cue, narrationId, cueId, windowSeconds: cue.endSeconds - cue.startSeconds};
}

export async function fitWebNarration({manifest, narrationId, cueId, inputPath, outputPath, proofPath, execute = false}) {
  if (typeof execute !== 'boolean' || ![inputPath, outputPath].every((file) => typeof file === 'string' && path.isAbsolute(file))
    || !outputPath.endsWith('.mp3')) fail('Provide absolute input and new output MP3 paths.');
  proofPath ??= `${outputPath}.fit.json`;
  if (!path.isAbsolute(proofPath) || new Set([inputPath, outputPath, proofPath].map((file) => path.resolve(file))).size !== 3) {
    fail('Source, copy and proof must have distinct absolute paths.');
  }
  const stableManifest = structuredClone(manifest);
  const cue = selectedCue(stableManifest, narrationId, cueId);
  if (execute) {
    await assertAbsent(outputPath);
    await assertAbsent(proofPath);
    await mkdir(path.dirname(outputPath), {recursive: true});
    await mkdir(path.dirname(proofPath), {recursive: true});
  }
  const temporary = await mkdtemp(path.join(execute ? path.dirname(outputPath) : os.tmpdir(), '.guteneo-fit-'));
  try {
    // Decode and transform this immutable snapshot, never a live cache entry.
    const bytes = await readFile(inputPath);
    if (!bytes.length) fail('The MP3 is empty.', 'AUDIO_INVALID');
    const snapshot = path.join(temporary, 'source.mp3');
    await writeFile(snapshot, bytes, {mode: 0o600});
    const input = await analyzeMp3(snapshot);
    const plan = planEdgeFit({...input, windowSeconds: cue.windowSeconds});
    const {stdout: version} = await run('ffmpeg', ['-version']);
    const proof = {
      schemaVersion: 1, operation: 'local-web-narration-fit', createdAt: new Date().toISOString(), narrationId, cueId,
      manifestSha256: sha256(JSON.stringify(stableManifest)), cue: {startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, windowSeconds: cue.windowSeconds},
      input: {path: inputPath, sha256: sha256(bytes), bytes: bytes.length, ...input},
      policy: FIT_POLICY, plan, ffmpegVersion: version.split('\n')[0], attempts: [],
      output: null, timingFit: false, criticalListening: 'pending',
    };
    if (!execute) return {...proof, execution: 'dry-run'};
    const candidate = path.join(temporary, 'candidate.mp3');
    let appliedTempo = 1;
    if (plan.mode === 'unchanged') {
      await writeFile(candidate, bytes, {mode: 0o600});
      proof.output = {path: outputPath, sha256: proof.input.sha256, bytes: bytes.length,
        ...await analyzeMp3(candidate, {minimumSilenceSeconds: outputSilenceMinimumSeconds})};
      proof.timingFit = Math.max(proof.output.durationSeconds, proof.output.decodedDurationSeconds) <= cue.windowSeconds;
    } else if (plan.mode === 'candidate') {
      const encode = async (tempo) => {
        const filters = [`atrim=start=${plan.retainedStartSeconds}:end=${plan.retainedEndSeconds}`, 'asetpts=PTS-STARTPTS'];
        if (tempo > 1) filters.push(`atempo=${tempo}`);
        await ffmpeg(['-y', '-err_detect', 'explode', '-i', snapshot, '-map', '0:a:0', '-map_metadata', '-1',
          '-af', filters.join(','), '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', candidate]);
        const output = await analyzeMp3(candidate, {minimumSilenceSeconds: outputSilenceMinimumSeconds});
        proof.attempts.push({tempo, filters, durationSeconds: output.durationSeconds,
          decodedDurationSeconds: output.decodedDurationSeconds});
        return output;
      };
      // Try trimming alone first. Do not speed up audio that already fits.
      let output = await encode(1);
      while (Math.max(output.durationSeconds, output.decodedDurationSeconds) > cue.windowSeconds && appliedTempo < FIT_POLICY.maxTempo) {
        // Start from the measured encoded duration, with a 1ms rounding guard.
        // This avoids speeding every phrase up for hypothetical codec padding.
        // Small monotone steps cross atempo rounding plateaus without jumping
        // straight to the ceiling. Each step advances by at least 0.001.
        appliedTempo = Math.min(FIT_POLICY.maxTempo,
          Math.max(appliedTempo + 0.001,
            appliedTempo * Math.max(output.durationSeconds, output.decodedDurationSeconds)
              / Math.max(epsilon, cue.windowSeconds - epsilon)));
        output = await encode(appliedTempo);
      }
      proof.timingFit = Math.max(output.durationSeconds, output.decodedDurationSeconds) <= cue.windowSeconds;
      if (proof.timingFit) {
        const resultBytes = await readFile(candidate);
        proof.output = {path: outputPath, sha256: sha256(resultBytes), bytes: resultBytes.length, ...output};
      } else proof.plan.mode = 'needs-shorter-text';
    }
    if (proof.output) {
      proof.output.detectedEdgeSilences = outputEdgesFromAnalysis(proof.output);
      delete proof.output.silences;
    }
    proof.appliedTempo = proof.output ? appliedTempo : null;
    if (!proof.timingFit) proof.reason = 'The complete cue cannot fit within 1.10x; shorten or regenerate its text. No qualified MP3 copy was written.';
    proof.nextStep = proof.timingFit ? {
      operation: 'explicit-import', script: 'videos/guteneo-film/scripts/import-narration.mjs', narrationId, cueId,
      filePath: outputPath, replaceRequired: true, audibleReviewRequired: true,
    } : {operation: 'shorten-or-regenerate-in-coordination'};
    // link() publishes a complete copy and cannot overwrite an existing file.
    if (proof.output) await link(candidate, outputPath);
    try {await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, {flag: 'wx', mode: 0o600});}
    catch (error) {if (proof.output) await rm(outputPath, {force: true}); throw error;}
    return proof;
  } finally {await rm(temporary, {recursive: true, force: true});}
}

async function main() {
  const options = {manifestPath: path.join(repositoryRoot, 'videos/guteneo-film/narration/scripts.json'), execute: false};
  const valued = new Map([['--manifest', 'manifestPath'], ['--narration', 'narrationId'], ['--cue', 'cueId'], ['--input', 'inputPath'], ['--output', 'outputPath'], ['--proof', 'proofPath']]);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') {
      process.stdout.write('Fit an existing MP3 locally on a new copy, without provider calls. Default: analysis only.\n--narration introduction-fr --cue personal --input /absolute/source.mp3 --output /absolute/new-copy.mp3 [--execute] [--proof /absolute/proof.json] [--manifest file]\nOnly edge silences are removed. A 66ms source cushion targets 60ms nominally at the 1.10x tempo cap; actual output edges are measured in the proof.\nA refused fit writes a proof only with --execute and exits 2. Listen before explicit import --replace.\n');
      return;
    }
    if (arg === '--execute') {options.execute = true; continue;}
    const key = valued.get(arg);
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) fail('Unknown or incomplete fit option.');
    options[key] = args[++index];
  }
  const manifest = JSON.parse(await readFile(path.resolve(options.manifestPath), 'utf8'));
  const proof = await fitWebNarration({...options, manifest});
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  if (proof.plan.mode === 'needs-shorter-text') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'FIT_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
