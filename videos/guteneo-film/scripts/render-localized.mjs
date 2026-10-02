#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import {buildRenderJobs, isNaturalFrenchRoles, isNaturalNarration, validateRenderCatalogs} from './render-catalog.mjs';
import {canReuseRenderedJob, preparePublishedNarration, publishNarratedJobs} from './published-narration.mjs';

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(filmRoot, "../..");
const catalog = JSON.parse(await readFile(path.join(repoRoot, "packages/contracts/src/public-videos.json"), "utf8"));
const sourceCatalog = JSON.parse(await readFile(path.join(filmRoot, 'narration/source-videos.json'), 'utf8'));
const previousManifest = JSON.parse(await readFile(path.join(repoRoot, "apps/api/src/public-video-manifest.json"), "utf8"));
validateRenderCatalogs(sourceCatalog, catalog, previousManifest);
const { values } = parseArgs({ options: {
  locales: { type: "string", default: "fr,en,de,lb" },
  kind: { type: "string", default: "all" },
  "skip-existing": { type: "boolean", default: false },
  concurrency: { type: "string", default: "4" },
} });
const locales = values.locales.split(",");
if (locales.some((locale) => !Object.hasOwn(catalog.roles, locale))) throw new Error("Use locales fr,en,de,lb.");
if (new Set(locales).size !== locales.length) throw new Error('Choose each locale once.');
if (!["all", "introduction", "roles"].includes(values.kind)) throw new Error("Use kind all, introduction or roles.");
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("Concurrency must be 1–16.");
const jobs = buildRenderJobs(sourceCatalog, catalog, locales, values.kind);
for (const command of ["ffmpeg", "ffprobe", "cwebp"]) execFileSync(command, ["-version"], { stdio: "ignore" });
const out = path.join(filmRoot, "out/localized");
// Check in and qualify the real web-selected voice cache before any public
// write. The source catalog always points at the original instrumental media.
const preparedNarration = await preparePublishedNarration({jobs, filmRoot, repositoryRoot: repoRoot,
  sourceCatalog, kind: values.kind, outputRoot: out});
await mkdir(out, { recursive: true });
await mkdir(path.join(repoRoot, "apps/web/public/videos"), { recursive: true });

// Reuse Guteneo's own instrumental score, with its original final cadence.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(filmRoot, "public/audio/vertical-soundtrack.wav"),
  "-filter_complex", "[0:a]atrim=0:31.2,asetpts=PTS-STARTPTS[a];[0:a]atrim=51:56,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.2:c1=tri:c2=tri[out]",
  "-map", "[out]", "-c:a", "pcm_s16le", path.join(filmRoot, "public/audio/roles-soundtrack.wav")]);
const naturalMusic = new Map((preparedNarration?.naturalDefinitions ?? []).map((definition) => [definition.spec.library, definition]));
for (const {spec, timeline} of naturalMusic.values()) {
  const originalFrenchRoles = spec.kind === 'roles' && spec.locale === 'fr';
  const script = originalFrenchRoles ? 'create-natural-roles-soundtrack.mjs' : 'create-natural-soundtrack.mjs';
  const args = [path.join(filmRoot, 'scripts', script), '--end-card-start-frame', String(timeline.endCardStartFrame)];
  if (!originalFrenchRoles) args.push('--signature-frames', spec.kind === 'introduction' ? '60' : '0',
    '--output', path.join(filmRoot, 'public/audio', `${spec.kind}-natural-c-${spec.locale}-soundtrack.wav`),
    '--proof', path.join(out, `${spec.kind}-${spec.locale}-music-proof.json`));
  execFileSync(process.execPath, args, {stdio: 'inherit'});
}

const serveUrl = await bundle({ entryPoint: path.join(filmRoot, "src/index.ts"), publicDir: path.join(filmRoot, "public"), outDir: path.join(out, "bundle"), rspack: true });
const sourceFiles = [];
async function hashTree(directory) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await hashTree(file);
    else sourceFiles.push({ path: path.relative(filmRoot, file), sha256: createHash("sha256").update(await readFile(file)).digest("hex") });
  }
}
await hashTree(path.join(filmRoot, "src"));
await hashTree(path.join(filmRoot, "public"));
if (preparedNarration) for (const library of preparedNarration.libraryDirs) await hashTree(library);
for (const name of ["package-lock.json", "scripts/render-localized.mjs", 'scripts/render-catalog.mjs', 'scripts/published-narration.mjs',
  'scripts/mix-narration.mjs', 'scripts/natural-narration.mjs', 'scripts/generate-narration.mjs', 'narration/source-videos.json']) {
  sourceFiles.push({ path: name, sha256: createHash("sha256").update(await readFile(path.join(filmRoot, name))).digest("hex") });
}
if (jobs.some(isNaturalFrenchRoles)) sourceFiles.push({path: 'scripts/create-natural-roles-soundtrack.mjs',
  sha256: createHash('sha256').update(await readFile(path.join(filmRoot, 'scripts/create-natural-roles-soundtrack.mjs'))).digest('hex')});
if (jobs.some((job) => isNaturalNarration(job) && !isNaturalFrenchRoles(job))) sourceFiles.push({path: 'scripts/create-natural-soundtrack.mjs',
  sha256: createHash('sha256').update(await readFile(path.join(filmRoot, 'scripts/create-natural-soundtrack.mjs'))).digest('hex')});
const proof = { generatedAt: new Date().toISOString(), remotion: "4.0.526", sourceFiles, assets: [] };
for (const job of jobs) {
  const movie = path.join(repoRoot, "apps/web/public", job.asset.movie.slice(1));
  const activeMovie = path.join(repoRoot, 'apps/web/public', job.activeAsset.movie.slice(1));
  const poster = path.join(repoRoot, "apps/web/public", job.asset.poster.slice(1));
  const definition = preparedNarration?.naturalDefinitions.find((entry) => entry.spec.source === job.asset.movie);
  const inputProps = definition ? {locale: job.locale, timeline: definition.timeline,
    musicFile: `audio/${job.kind}-natural-c-${job.locale}-soundtrack.wav`} : undefined;
  const composition = await selectComposition({serveUrl, id: job.id, inputProps});
  if (definition && composition.durationInFrames !== definition.timeline.durationInFrames) {
    throw new Error(`${job.id} differs from its qualified narration timeline.`);
  }
  let reused = false;
  if (values["skip-existing"]) {
    reused = await canReuseRenderedJob({job, repositoryRoot: repoRoot, manifest: previousManifest, prepared: preparedNarration});
  }
  if (!reused) {
    console.log(`Rendering ${job.id}`);
    const master = path.join(out, `${job.id}.mp4`);
    let lastLog = 0;
    await renderMedia({ composition, serveUrl, inputProps, codec: "h264", outputLocation: master, crf: 16, imageFormat: "jpeg", pixelFormat: "yuv420p", audioCodec: "aac", audioBitrate: "192k", concurrency, overwrite: true,
      onProgress: ({ progress }) => { if (Date.now() - lastLog > 20_000 || progress === 1) { console.log(`${job.id}: ${Math.round(progress * 100)}%`); lastLog = Date.now(); } },
    });
    const staged = `${movie}.tmp.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-threads", "4", "-crf", "21", "-maxrate", "3200k", "-bufsize", "6400k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", staged]);
    if ((await stat(staged)).size >= 25 * 1024 * 1024) throw new Error(`${job.asset.movie} exceeds Static Assets limit.`);
    const stagedPoster = `${poster}.tmp.webp`;
    const posterFrame = path.join(out, `${job.id}-poster.png`);
    // Role posters include the first role, while introduction posters retain V5's opening.
    const firstRole = definition && job.kind === 'roles'
      ? preparedNarration.manifest.narrations.find((entry) => entry.id === `roles-${job.locale}-natural-c`).cues.find((cue) => cue.id === 'administrator').startSeconds + 1 : 5;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(job.kind === "roles" ? firstRole : 2), "-i", staged, "-frames:v", "1", posterFrame]);
    execFileSync("cwebp", ["-quiet", "-q", "90", posterFrame, "-o", stagedPoster]);
    await rename(staged, movie);
    await rename(stagedPoster, poster);
  }
  job.reused = reused;
  const verificationMovie = reused ? activeMovie : movie;
  const bytes = await readFile(verificationMovie);
  const metadata = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", verificationMovie], { encoding: "utf8" }));
  const video = metadata.streams.find(({ codec_type }) => codec_type === "video");
  const audio = metadata.streams.find(({ codec_type }) => codec_type === "audio");
  const expectedDuration = composition.durationInFrames / composition.fps;
  if (composition.fps !== 30 || video.codec_name !== "h264" || video.width !== composition.width || video.height !== composition.height || video.r_frame_rate !== "30/1" || Number(video.nb_frames) !== composition.durationInFrames || Math.abs(Number(metadata.format.duration) - expectedDuration) > 0.1 || audio?.codec_name !== "aac" || audio.channels !== 2) throw new Error(`${job.id} failed metadata checks.`);
  const qualified = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  if (job.activeAsset.movie === job.asset.movie) previousManifest[job.asset.movie] = qualified;
  proof.assets.push({ ...job, reused, ...qualified, width: video.width, height: video.height, frames: Number(video.nb_frames), duration: expectedDuration });
  // Persist evidence and qualified lengths after every successful output, so interrupted runs can resume.
  await writeFile(path.join(repoRoot, "apps/api/src/public-video-manifest.json"), `${JSON.stringify(previousManifest, null, 2)}\n`);
  await writeFile(path.join(out, "render-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`Ready ${job.asset.movie} (${(bytes.length / 1024 / 1024).toFixed(1)} MiB${reused ? ", verified existing file" : ""})`);
}
const narratedJobs = jobs.filter((job) => !job.reused);
const narratedMovies = await publishNarratedJobs({prepared: preparedNarration, jobs: narratedJobs, manifest: previousManifest});
proof.narratedMovies = narratedMovies;
validateRenderCatalogs(sourceCatalog, catalog, previousManifest);
await writeFile(path.join(repoRoot, 'apps/api/src/public-video-manifest.json'), `${JSON.stringify(previousManifest, null, 2)}\n`);
await writeFile(path.join(out, 'render-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
