import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {qualifyNaturalNarration} from './natural-narration.mjs';
import {naturalFilmSpec} from './render-catalog.mjs';
import {probeMedia, videoStreamHash} from './mix-narration.mjs';

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function renderNaturalSources({libraries, outputDir = path.join(filmRoot, 'out/natural-sources'), concurrency = 4}) {
  if (!Array.isArray(libraries) || !libraries.length || new Set(libraries).size !== libraries.length
    || libraries.some((name) => !/^(introduction|roles)-(fr|en|de|lb)-natural-c-v1$/.test(name))) {
    throw new Error('Choose each qualified natural narration library once.');
  }
  if (libraries.includes('roles-fr-natural-c-v1')) throw new Error('The accepted French roles source must be preserved; it is excluded from initial seed rendering.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Render concurrency must be 1–16.');
  const publicRoot = path.resolve(filmRoot, '../../apps/web/public');
  const target = path.resolve(outputDir);
  if (target === publicRoot || target.startsWith(`${publicRoot}${path.sep}`)) throw new Error('Initial natural sources must be staged outside public assets.');
  // Qualify the entire audio selection before creating sources. This stage is
  // offline and cannot publish a movie, change the catalog, or call a provider.
  const qualified = [];
  for (const name of libraries) {
    const library = path.join(filmRoot, 'narration/releases', name);
    const result = await qualifyNaturalNarration(library);
    qualified.push({library, ...result});
  }
  await mkdir(target, {recursive: true});
  for (const entry of qualified) {
    const narration = entry.manifest.narrations[0];
    execFileSync(process.execPath, [path.join(filmRoot, 'scripts/create-natural-soundtrack.mjs'),
      '--end-card-start-frame', String(entry.timeline.endCardStartFrame),
      '--signature-frames', narration.kind === 'introduction' ? '60' : '0',
      '--output', path.join(filmRoot, 'public/audio', `${narration.kind}-natural-c-${narration.locale}-soundtrack.wav`)], {stdio: 'inherit'});
  }
  const serveUrl = await bundle({entryPoint: path.join(filmRoot, 'src/index.ts'), publicDir: path.join(filmRoot, 'public'),
    outDir: path.join(target, 'bundle'), rspack: true});
  const proof = {schemaVersion: 1, mode: 'local-instrumental-candidates', remotion: '4.0.526', assets: []};
  for (const entry of qualified) {
    const narration = entry.manifest.narrations[0];
    for (const format of narration.kind === 'introduction' ? ['horizontal', 'vertical'] : ['horizontal']) {
      const spec = naturalFilmSpec(narration.kind, narration.locale, format);
      const inputProps = {locale: narration.locale, timeline: entry.timeline,
        musicFile: `audio/${narration.kind}-natural-c-${narration.locale}-soundtrack.wav`};
      const composition = await selectComposition({serveUrl, id: spec.composition, inputProps});
      if (composition.durationInFrames !== entry.timeline.durationInFrames || composition.fps !== 30
        || composition.width !== spec.width || composition.height !== spec.height) throw new Error('The natural composition does not match its qualified timeline and format.');
      const master = path.join(target, `${spec.composition}-master.mp4`);
      let lastLog = 0;
      await renderMedia({composition, serveUrl, inputProps, codec: 'h264', outputLocation: master, crf: 16,
        imageFormat: 'jpeg', pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', concurrency, overwrite: true,
        onProgress: ({progress}) => {if (Date.now() - lastLog > 20000 || progress === 1) {
          process.stdout.write(`${spec.composition}: ${Math.round(progress * 100)}%\n`); lastLog = Date.now();
        }},
      });
      const movie = path.join(target, path.basename(spec.source));
      const staged = `${movie}.tmp.mp4`;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', master, '-c:v', 'libx264', '-preset', 'slow', '-threads', '4',
        '-crf', '21', '-maxrate', '3200k', '-bufsize', '6400k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', staged]);
      const media = await probeMedia(staged);
      const video = media.streams.find((stream) => stream.codec_type === 'video');
      const audio = media.streams.find((stream) => stream.codec_type === 'audio');
      const bytes = (await stat(staged)).size;
      if (video?.codec_name !== 'h264' || video.width !== spec.width || video.height !== spec.height || video.avg_frame_rate !== '30/1'
        || Number(video.nb_frames) !== entry.timeline.durationInFrames || audio?.codec_name !== 'aac' || audio.channels !== 2
        || Number(audio.sample_rate) !== 48000 || Math.abs(Number(media.format.duration) - entry.timeline.durationInFrames / 30) > 0.1
        || bytes >= 25 * 1024 * 1024) throw new Error('The staged natural instrumental failed its web qualification.');
      execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', staged, '-f', 'null', '-']);
      await rename(staged, movie);
      proof.assets.push({narrationId: narration.id, compositionId: spec.composition, format, sourceMovie: spec.source,
        candidate: path.basename(movie), bytes, sha256: digest(await readFile(movie)), videoSha256: await videoStreamHash(movie),
        width: spec.width, height: spec.height, frames: entry.timeline.durationInFrames, durationSeconds: entry.timeline.durationInFrames / 30,
        endCardStartFrame: entry.timeline.endCardStartFrame, endCardDurationFrames: 150,
        musicOnly: true, voiceAdded: false, criticalListening: 'pending'});
      await writeFile(path.join(target, 'source-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
    }
  }
  return proof;
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--libraries') options.libraries = args[++index]?.split(',');
    else if (args[index] === '--out') options.outputDir = args[++index];
    else if (args[index] === '--concurrency') options.concurrency = Number(args[++index]);
    else throw new Error('Use --libraries <comma-separated-snapshot-ids> [--out <candidate-directory>] [--concurrency 4].');
  }
  await renderNaturalSources(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {process.stderr.write(`${error.message}\n`); process.exitCode = 1;});
}
