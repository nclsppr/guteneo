import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {buildPlan, validateManifest} from './generate-narration.mjs';

const run = promisify(execFile);
const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepositoryRoot = path.resolve(filmRoot, '../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {maxBuffer: 8 * 1024 * 1024});

export async function probeMedia(file) {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(stdout);
}

export async function videoStreamHash(file) {
  const {stdout} = await ffmpeg(['-i', file, '-map', '0:v:0', '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-']);
  return stdout.trim().replace(/^SHA256=/, '');
}

function confinedPath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Expected a relative media path.');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Media path escapes its output directory.');
  return resolved;
}

export function validateMixCues(narration, clips) {
  if (!Number.isFinite(narration.durationSeconds) || !Number.isFinite(narration.endCardStartSeconds)
    || narration.durationSeconds - narration.endCardStartSeconds < 5) throw new Error('The final card needs at least five seconds without narration.');
  let previousEnd = 0;
  for (const clip of clips) {
    const {startSeconds: start, endSeconds: end, durationSeconds: duration} = clip;
    if (![start, end, duration].every(Number.isFinite) || duration <= 0 || start < previousEnd || end <= start
      || duration > end - start + 0.001 || end > narration.endCardStartSeconds) {
      throw new Error(`Narration timing does not fit: ${narration.id}/${clip.cueId}.`);
    }
    previousEnd = end;
  }
  if (!clips.length) throw new Error(`No qualified narration clips for ${narration.id}.`);
}

// Duck only around actual speech, not through the entire reserved cue window.
// Release ends before the logo card, restoring the score to its original level.
export function musicVolumeExpression(narration, clips, gain = 0.22) {
  const envelopes = clips.map((clip) => {
    const attackStart = Math.max(0, clip.startSeconds - 0.15);
    const speechEnd = clip.startSeconds + clip.durationSeconds;
    const releaseEnd = Math.min(narration.endCardStartSeconds, speechEnd + 0.2);
    const attack = clip.startSeconds - attackStart;
    const release = releaseEnd - speechEnd;
    if (attack <= 0 || release <= 0) {
      return `if(between(t,${clip.startSeconds},${speechEnd}),1,0)`;
    }
    return `max(0,min(1,min((t-${attackStart})/${attack},(${releaseEnd}-t)/${release})))`;
  });
  const envelope = envelopes.reduce((left, right) => left ? `max(${left},${right})` : right, '');
  return `1-${1 - gain}*(${envelope})`;
}

export function buildMixJobs(manifest, plan, catalog, repositoryRoot = defaultRepositoryRoot) {
  const clipsByNarration = new Map();
  for (const clip of plan.clips) {
    const selected = clipsByNarration.get(clip.narrationId) ?? [];
    selected.push(clip);
    clipsByNarration.set(clip.narrationId, selected);
  }
  const jobs = [];
  for (const narration of manifest.narrations) {
    const clips = clipsByNarration.get(narration.id);
    if (!clips) continue;
    if (clips.length !== narration.cues.length) throw new Error('Mixing requires every cue in each selected narration.');
    const assets = narration.kind === 'introduction'
      ? Object.values(catalog.introduction[narration.locale] ?? {})
      : [catalog.roles[narration.locale]];
    if (!assets.length || assets.some((asset) => !asset?.movie?.startsWith('/videos/'))) throw new Error(`Missing video catalog entry for ${narration.id}.`);
    for (const asset of assets) {
      const sourcePath = confinedPath(path.join(repositoryRoot, 'apps/web/public'), asset.movie.slice(1));
      jobs.push({narration, clips, sourcePath, basename: path.basename(sourcePath)});
    }
  }
  if (!jobs.length) throw new Error('No videos selected.');
  return jobs;
}

async function qualifyClips(job, generation, outputDir) {
  const qualified = [];
  for (const clip of job.clips) {
    const record = generation.clips?.[`${clip.narrationId}/${clip.cueId}`];
    if (!record || record.status !== 'complete' || record.fingerprint !== clip.fingerprint
      || record.path !== clip.relativePath || record.timingFit === false) {
      throw new Error(`Missing, stale or unqualified audio: ${clip.narrationId}/${clip.cueId}.`);
    }
    const audioPath = confinedPath(outputDir, record.path);
    const bytes = await readFile(audioPath);
    if (!record.audioSha256 || sha256(bytes) !== record.audioSha256) throw new Error(`Audio hash mismatch: ${clip.narrationId}/${clip.cueId}.`);
    const media = await probeMedia(audioPath);
    const durationSeconds = Number(media.format.duration);
    if (Math.abs(durationSeconds - record.durationSeconds) > 0.002) throw new Error('Audio duration differs from its generation receipt.');
    qualified.push({...clip, audioPath, durationSeconds});
  }
  validateMixCues(job.narration, qualified);
  return qualified;
}

export async function mixVideo({sourcePath, outputPath, narration, clips}) {
  if (path.resolve(sourcePath) === path.resolve(outputPath)) throw new Error('A narrated candidate must not overwrite its source movie.');
  validateMixCues(narration, clips);
  const source = await probeMedia(sourcePath);
  const sourceVideo = source.streams.find((stream) => stream.codec_type === 'video');
  const sourceAudio = source.streams.find((stream) => stream.codec_type === 'audio');
  if (sourceVideo?.codec_name !== 'h264' || !sourceAudio
    || Math.abs(Number(source.format.duration) - narration.durationSeconds) > 0.1) {
    throw new Error('Source movie is not the qualified H.264 film with its original score.');
  }
  await mkdir(path.dirname(outputPath), {recursive: true});
  const temporaryDir = await mkdtemp(path.join(path.dirname(outputPath), '.mix-'));
  const candidate = path.join(temporaryDir, 'candidate.mp4');
  try {
    const args = ['-y', '-i', sourcePath];
    for (const clip of clips) args.push('-i', clip.audioPath);
    const filters = clips.map((clip, index) => {
      const delay = Math.round(clip.startSeconds * 48000);
      return `[${index + 1}:a:0]loudnorm=I=-18:TP=-2:LRA=7,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${delay}S:all=1[voice${index}]`;
    });
    const voiceInputs = clips.map((_, index) => `[voice${index}]`).join('');
    filters.push(`[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume='${musicVolumeExpression(narration, clips)}':eval=frame[music]`);
    // Mix all clips with the full-length score in one pass. Nested amix graphs
    // can drop short delayed inputs after a padded intermediate voice track.
    filters.push(`[music]${voiceInputs}amix=inputs=${clips.length + 1}:normalize=0:duration=first,alimiter=limit=0.95:level=false:latency=true,atrim=duration=${narration.durationSeconds}[mix]`);
    args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-t', String(narration.durationSeconds), '-movflags', '+faststart', candidate);
    await ffmpeg(args);
    const output = await probeMedia(candidate);
    const video = output.streams.find((stream) => stream.codec_type === 'video');
    const audio = output.streams.find((stream) => stream.codec_type === 'audio');
    const size = (await stat(candidate)).size;
    const [sourceVideoSha256, outputVideoSha256] = await Promise.all([videoStreamHash(sourcePath), videoStreamHash(candidate)]);
    if (sourceVideoSha256 !== outputVideoSha256 || video.width !== sourceVideo.width || video.height !== sourceVideo.height
      || video.avg_frame_rate !== sourceVideo.avg_frame_rate || video.nb_frames !== sourceVideo.nb_frames
      || audio?.codec_name !== 'aac' || audio.channels !== 2 || audio.sample_rate !== '48000'
      || Math.abs(Number(output.format.duration) - narration.durationSeconds) > 0.1 || size >= 25 * 1024 * 1024) {
      throw new Error('Narrated movie failed stream, timing or web-size verification.');
    }
    // Decode the complete result, including the original final card.
    await ffmpeg(['-i', candidate, '-f', 'null', '-']);
    const proof = {
      narrationId: narration.id, sourceMovie: path.basename(sourcePath), outputMovie: path.basename(outputPath),
      sourceSha256: sha256(await readFile(sourcePath)), outputSha256: sha256(await readFile(candidate)),
      sourceVideoSha256, outputVideoSha256, width: video.width, height: video.height,
      frameRate: video.avg_frame_rate, frames: Number(video.nb_frames), durationSeconds: Number(output.format.duration), bytes: size,
      endCardStartSeconds: narration.endCardStartSeconds, lastSpeechEndSeconds: Math.max(...clips.map((clip) => clip.startSeconds + clip.durationSeconds)),
      voiceTargetLufs: -18, musicGainDuringSpeech: 0.22,
      clips: clips.map((clip) => ({cueId: clip.cueId, fingerprint: clip.fingerprint, startSeconds: clip.startSeconds, durationSeconds: clip.durationSeconds})),
      criticalListening: 'pending'
    };
    await rename(candidate, outputPath);
    return proof;
  } finally {
    await rm(temporaryDir, {recursive: true, force: true});
  }
}

export async function mixVideos({manifest, plan, catalog, repositoryRoot = defaultRepositoryRoot, outputDir = path.join(filmRoot, 'out/narration'), execute = false}) {
  const jobs = buildMixJobs(manifest, plan, catalog, repositoryRoot);
  if (!execute) return {mode: 'dry-run', narrations: new Set(jobs.map((job) => job.narration.id)).size, videos: jobs.map((job) => ({narrationId: job.narration.id, source: job.basename, output: `videos/${job.basename}`}))};
  const publicRoot = path.resolve(repositoryRoot, 'apps/web/public');
  if (path.resolve(outputDir) === publicRoot || path.resolve(outputDir).startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('Mix candidates must be written outside the published asset directory.');
  }
  await mkdir(outputDir, {recursive: true});
  const lockPath = path.join(outputDir, '.mix.lock');
  const lock = await open(lockPath, 'wx').catch(() => {throw new Error('Another mix is active. Resolve a stale .mix.lock manually before restarting.');});
  try {
    const generation = await readJson(path.join(outputDir, 'generation.json'));
    if (generation.schemaVersion !== 1) throw new Error('Unsupported generation receipt.');
    // Qualify the entire selection before writing a single candidate film.
    for (const job of jobs) job.qualifiedClips = await qualifyClips(job, generation, outputDir);
    const movies = [];
    for (const job of jobs) {
      const proof = await mixVideo({sourcePath: job.sourcePath, outputPath: path.join(outputDir, 'videos', job.basename), narration: job.narration, clips: job.qualifiedClips});
      movies.push(proof);
      await writeFile(path.join(outputDir, 'mix-proof.json'), `${JSON.stringify({schemaVersion: 1, movies}, null, 2)}\n`);
    }
    return {mode: 'local-candidates', narrations: new Set(jobs.map((job) => job.narration.id)).size, movies};
  } finally {
    await lock.close();
    await rm(lockPath, {force: true});
  }
}

async function main() {
  const options = {kind: 'all', locales: ['fr', 'en', 'de', 'lb']};
  let voicesPath = path.join(filmRoot, 'narration/voices.example.json');
  let outputDir = path.join(filmRoot, 'out/narration');
  let execute = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--execute') execute = true;
    else if (arg === '--voices' || arg === '--out' || arg === '--kind' || arg === '--locales') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--voices') voicesPath = path.resolve(value);
      else if (arg === '--out') outputDir = path.resolve(value);
      else if (arg === '--kind') options.kind = value;
      else options.locales = value.split(',');
    } else if (arg === '--help') {
      process.stdout.write('Mix existing films locally. Default: dry-run, no writes or network.\n--execute --voices <local.json> --kind all|introduction|roles --locales fr,en,de,lb --out <directory>\n');
      return;
    } else throw new Error(`Unknown argument: ${arg}.`);
  }
  const manifest = validateManifest(await readJson(path.join(filmRoot, 'narration/scripts.json')));
  const config = await readJson(voicesPath);
  const plan = buildPlan(manifest, config, options);
  const catalog = await readJson(path.join(defaultRepositoryRoot, 'packages/contracts/src/public-videos.json'));
  const result = await mixVideos({manifest, plan, catalog, outputDir, execute});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {process.stderr.write(`${error.message}\n`); process.exitCode = 1;});
}
