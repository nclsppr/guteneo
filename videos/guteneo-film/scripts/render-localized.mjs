#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(filmRoot, "../..");
const catalog = JSON.parse(await readFile(path.join(repoRoot, "packages/contracts/src/public-videos.json"), "utf8"));
const { values } = parseArgs({ options: {
  locales: { type: "string", default: "fr,en,de,lb" },
  kind: { type: "string", default: "all" },
  "skip-existing": { type: "boolean", default: false },
  concurrency: { type: "string", default: "4" },
} });
const locales = values.locales.split(",");
if (locales.some((locale) => !Object.hasOwn(catalog.roles, locale))) throw new Error("Use locales fr,en,de,lb.");
if (!["all", "introduction", "roles"].includes(values.kind)) throw new Error("Use kind all, introduction or roles.");
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("Concurrency must be 1–16.");
for (const command of ["ffmpeg", "ffprobe", "cwebp"]) execFileSync(command, ["-version"], { stdio: "ignore" });
const out = path.join(filmRoot, "out/localized");
await mkdir(out, { recursive: true });
await mkdir(path.join(repoRoot, "apps/web/public/videos"), { recursive: true });

// Reuse Guteneo's own instrumental score, with its original final cadence.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(filmRoot, "public/audio/vertical-soundtrack.wav"),
  "-filter_complex", "[0:a]atrim=0:31.2,asetpts=PTS-STARTPTS[a];[0:a]atrim=51:56,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.2:c1=tri:c2=tri[out]",
  "-map", "[out]", "-c:a", "pcm_s16le", path.join(filmRoot, "public/audio/roles-soundtrack.wav")]);

const jobs = locales.flatMap((locale) => {
  const suffix = locale.toUpperCase();
  return [
    ...(values.kind !== "roles" ? [
      { id: `Guteneo-Horizontal-Vision-${suffix}`, locale, kind: "introduction", format: "horizontal", asset: catalog.introduction[locale].horizontal },
      { id: `Guteneo-iPhone-18-Pro-Max-${suffix}`, locale, kind: "introduction", format: "vertical", asset: catalog.introduction[locale].vertical },
    ] : []),
    ...(values.kind !== "introduction" ? [{ id: `Guteneo-Roles-${suffix}`, locale, kind: "roles", format: "horizontal", asset: catalog.roles[locale] }] : []),
  ];
});
const serveUrl = await bundle({ entryPoint: path.join(filmRoot, "src/index.ts"), publicDir: path.join(filmRoot, "public"), outDir: path.join(out, "bundle"), rspack: true });
const compositions = await getCompositions(serveUrl);
const previousManifest = JSON.parse(await readFile(path.join(repoRoot, "apps/api/src/public-video-manifest.json"), "utf8"));
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
for (const name of ["package-lock.json", "scripts/render-localized.mjs"]) sourceFiles.push({ path: name, sha256: createHash("sha256").update(await readFile(path.join(filmRoot, name))).digest("hex") });
const proof = { generatedAt: new Date().toISOString(), remotion: "4.0.526", sourceFiles, assets: [] };
for (const job of jobs) {
  const movie = path.join(repoRoot, "apps/web/public", job.asset.movie);
  const poster = path.join(repoRoot, "apps/web/public", job.asset.poster);
  const composition = compositions.find(({ id }) => id === job.id);
  if (!composition) throw new Error(`Missing composition ${job.id}.`);
  let reused = false;
  if (values["skip-existing"]) {
    try {
      const bytes = await readFile(movie);
      const digest = createHash("sha256").update(bytes).digest("hex");
      // Only skip outputs with exact previously qualified bytes and an existing poster.
      reused = previousManifest[job.asset.movie]?.sha256 === digest && (await stat(poster)).size > 0;
    } catch { /* Render missing or unqualified outputs. */ }
  }
  if (!reused) {
    console.log(`Rendering ${job.id}`);
    const master = path.join(out, `${job.id}.mp4`);
    let lastLog = 0;
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: master, crf: 16, imageFormat: "jpeg", pixelFormat: "yuv420p", audioCodec: "aac", audioBitrate: "192k", concurrency, overwrite: true,
      onProgress: ({ progress }) => { if (Date.now() - lastLog > 20_000 || progress === 1) { console.log(`${job.id}: ${Math.round(progress * 100)}%`); lastLog = Date.now(); } },
    });
    const staged = `${movie}.tmp.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-threads", "4", "-crf", "21", "-maxrate", "3200k", "-bufsize", "6400k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", staged]);
    if ((await stat(staged)).size >= 25 * 1024 * 1024) throw new Error(`${job.asset.movie} exceeds Static Assets limit.`);
    const stagedPoster = `${poster}.tmp.webp`;
    const posterFrame = path.join(out, `${job.id}-poster.png`);
    // Role posters include the first role, while introduction posters retain V5's opening.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", job.kind === "roles" ? "5" : "2", "-i", staged, "-frames:v", "1", posterFrame]);
    execFileSync("cwebp", ["-quiet", "-q", "90", posterFrame, "-o", stagedPoster]);
    await rename(staged, movie);
    await rename(stagedPoster, poster);
  }
  const bytes = await readFile(movie);
  const metadata = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", movie], { encoding: "utf8" }));
  const video = metadata.streams.find(({ codec_type }) => codec_type === "video");
  const audio = metadata.streams.find(({ codec_type }) => codec_type === "audio");
  const expectedDuration = job.kind === "roles" ? 36 : 56;
  if (video.codec_name !== "h264" || video.width !== composition.width || video.height !== composition.height || video.r_frame_rate !== "30/1" || Number(video.nb_frames) !== expectedDuration * 30 || Math.abs(Number(metadata.format.duration) - expectedDuration) > 0.1 || audio?.codec_name !== "aac" || audio.channels !== 2) throw new Error(`${job.id} failed metadata checks.`);
  previousManifest[job.asset.movie] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  proof.assets.push({ ...job, reused, ...previousManifest[job.asset.movie], width: video.width, height: video.height, frames: Number(video.nb_frames), duration: expectedDuration });
  // Persist evidence and qualified lengths after every successful output, so interrupted runs can resume.
  await writeFile(path.join(repoRoot, "apps/api/src/public-video-manifest.json"), `${JSON.stringify(previousManifest, null, 2)}\n`);
  await writeFile(path.join(out, "render-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`Ready ${job.asset.movie} (${(bytes.length / 1024 / 1024).toFixed(1)} MiB${reused ? ", verified existing file" : ""})`);
}
