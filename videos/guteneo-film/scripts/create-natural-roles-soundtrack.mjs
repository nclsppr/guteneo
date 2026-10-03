#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options: {
  'end-card-start-frame': {type: 'string'},
  output: {type: 'string', default: 'public/audio/roles-natural-c-fr-soundtrack.wav'},
  proof: {type: 'string', default: 'out/narration/roles-fr-c-natural/music-proof.json'},
}});
const endCardStartFrame = Number(values['end-card-start-frame']);
if (!Number.isInteger(endCardStartFrame) || endCardStartFrame <= 0) {
  throw new Error('An explicit, positive end-card start frame at 30 fps is required.');
}
const endCardStartSeconds = endCardStartFrame / 30;
if (endCardStartSeconds + 0.2 >= 49.2) throw new Error('The body must end before the original score releases.');
const source = path.join(filmRoot, 'public/audio/vertical-soundtrack.wav');
const sourceBytes = await readFile(source);
const output = path.resolve(filmRoot, values.output);
const proofPath = path.resolve(filmRoot, values.proof);
await mkdir(path.dirname(output), {recursive: true});
await mkdir(path.dirname(proofPath), {recursive: true});
const temporary = `${output}.tmp.wav`;
const filter = `[0:a]atrim=0:${endCardStartSeconds + 0.2},asetpts=PTS-STARTPTS[a];[0:a]atrim=51:56,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.2:c1=tri:c2=tri[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-y', '-i', source,
  '-filter_complex', filter, '-map', '[out]', '-c:a', 'pcm_s16le', temporary]);
const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temporary], {encoding: 'utf8'}));
const audio = media.streams.find((stream) => stream.codec_type === 'audio');
const expectedDurationSeconds = (endCardStartFrame + 150) / 30;
if (audio?.codec_name !== 'pcm_s16le' || audio.sample_rate !== '48000' || audio.channels !== 2
  || Math.abs(Number(media.format.duration) - expectedDurationSeconds) > 1 / 48000) {
  throw new Error('Natural-role music metadata differs from its frame timeline.');
}
const outputBytes = await readFile(temporary);
await rename(temporary, output);
const proof = {
  schemaVersion: 1,
  source: 'public/audio/vertical-soundtrack.wav',
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  output: path.relative(filmRoot, output),
  outputSha256: createHash('sha256').update(outputBytes).digest('hex'),
  sourceBodySeconds: [0, endCardStartSeconds + 0.2],
  sourceFinalCadenceSeconds: [51, 56],
  crossfadeSeconds: 0.2,
  crossfadeCurves: ['tri', 'tri'],
  endCardStartFrame,
  endCardStartSeconds,
  endCardDurationInFrames: 150,
  durationInFrames: endCardStartFrame + 150,
  durationSeconds: expectedDurationSeconds,
  sampleRate: 48000,
  channels: 2,
  pcmBits: 16,
  instrumentalOnly: true,
  originalAssetsModified: false,
  externalSamplesOrServices: false,
  criticalListening: 'pending',
};
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof));
