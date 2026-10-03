#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options: {
  'end-card-start-frame': {type: 'string'},
  'signature-frames': {type: 'string', default: '0'},
  output: {type: 'string'},
  proof: {type: 'string'},
}});
const endCardStartFrame = Number(values['end-card-start-frame']);
const signatureFrames = Number(values['signature-frames']);
if (!Number.isInteger(endCardStartFrame) || endCardStartFrame <= 0 || ![0, 60].includes(signatureFrames)
  || !values.output || !values.proof) {
  throw new Error('Pass an explicit positive end-card frame, signature frames 0 or 60, output and proof.');
}
const bodySeconds = (endCardStartFrame - signatureFrames) / 30;
if (bodySeconds <= 0 || (signatureFrames === 60 && bodySeconds < 49)) {
  throw new Error('An introduction must retain its original 49-second scene minimum.');
}
const source = path.join(filmRoot, 'public/audio/vertical-soundtrack.wav');
const sourceBytes = await readFile(source);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceSha256 = sha256(sourceBytes);
if (sourceSha256 !== '3a62ed43b423d900debfcb54a841037a9867378634e0d83c552ebcaac3af28bb') {
  throw new Error('The original approved instrumental has changed.');
}
const output = path.resolve(filmRoot, values.output);
const proofPath = path.resolve(filmRoot, values.proof);
if (output === source) throw new Error('Never overwrite the approved source score.');
await mkdir(path.dirname(output), {recursive: true});
await mkdir(path.dirname(proofPath), {recursive: true});
const temporary = `${output}.tmp.wav`;
let filter = null;
let extensionSeconds = 0;
let repetitions = 0;
if (signatureFrames === 60 && bodySeconds === 49) {
  await copyFile(source, temporary);
} else if (bodySeconds <= 49 && signatureFrames === 0) {
  filter = `[0:a]atrim=0:${bodySeconds + 0.2},asetpts=PTS-STARTPTS[a];[0:a]atrim=51:56,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.2:c1=tri:c2=tri[out]`;
} else {
  // Add whole instrumental phrases at their original tempo. The final signature
  // and logo cadence retain their original PCM; voice never controls gain.
  extensionSeconds = bodySeconds - 49;
  repetitions = Math.max(1, Math.ceil(extensionSeconds / 16));
  const parts = ['[0:a]atrim=0:32.1,asetpts=PTS-STARTPTS[prefix]'];
  for (let i = 0; i < repetitions; i++) {
    parts.push(`[0:a]atrim=16:32.2,asetpts=PTS-STARTPTS[loop${i}]`);
  }
  let loop = 'loop0';
  for (let i = 1; i < repetitions; i++) {
    parts.push(`[${loop}][loop${i}]acrossfade=d=0.2:c1=tri:c2=tri[join${i}]`);
    loop = `join${i}`;
  }
  parts.push(`[${loop}]atrim=0:${extensionSeconds + 0.2},asetpts=PTS-STARTPTS[insert]`);
  if (signatureFrames === 60) {
    parts.push('[0:a]atrim=31.9:56,asetpts=PTS-STARTPTS[suffix]');
  } else {
    parts.push('[0:a]atrim=31.9:49.2,asetpts=PTS-STARTPTS[tail]');
    parts.push('[0:a]atrim=51:56,asetpts=PTS-STARTPTS[cadence]');
    parts.push('[tail][cadence]acrossfade=d=0.2:c1=tri:c2=tri[suffix]');
  }
  parts.push('[prefix][insert]acrossfade=d=0.2:c1=tri:c2=tri[body]');
  parts.push('[body][suffix]acrossfade=d=0.2:c1=tri:c2=tri[out]');
  filter = parts.join(';');
}
if (filter) {
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-y', '-i', source,
    '-filter_complex', filter, '-map', '[out]', '-c:a', 'pcm_s16le', temporary]);
}
const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temporary], {encoding: 'utf8'}));
const audio = media.streams.find((stream) => stream.codec_type === 'audio');
const durationSeconds = (endCardStartFrame + 150) / 30;
if (audio?.codec_name !== 'pcm_s16le' || audio.sample_rate !== '48000' || audio.channels !== 2
  || Math.abs(Number(media.format.duration) - durationSeconds) > 1 / 48000) {
  throw new Error('The soundtrack must match its complete frame timeline.');
}
const decode = (file) => execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', file,
  '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], {maxBuffer: 128 * 1024 * 1024});
const originalPcm = decode(source);
const outputPcm = decode(temporary);
const preservedTailSeconds = signatureFrames === 60 ? 7 : 4.8;
const preservedTailBytes = Math.round(preservedTailSeconds * 48000) * 4;
const originalTail = originalPcm.subarray(originalPcm.length - preservedTailBytes);
const outputTail = outputPcm.subarray(outputPcm.length - preservedTailBytes);
if (!originalTail.equals(outputTail)) throw new Error('The closing signature/logo PCM was altered.');
if (outputPcm.length !== Math.round(durationSeconds * 48000) * 4) throw new Error('The PCM sample count differs from the frame timeline.');
const outputBytes = await readFile(temporary);
await rename(temporary, output);
const proof = {
  schemaVersion: 1, source: 'public/audio/vertical-soundtrack.wav', sourceSha256,
  output: path.relative(filmRoot, output), outputSha256: sha256(outputBytes),
  bodySeconds, extensionSeconds, phraseSourceSeconds: [16, 32.2], phraseRepetitions: repetitions,
  crossfadeSeconds: filter ? 0.2 : 0, crossfadeCurves: ['tri', 'tri'],
  sourceFinalCadenceSeconds: signatureFrames === 60 ? [49, 56] : [51, 56],
  preservedTailSeconds, preservedTailPcmSha256: sha256(outputTail), preservedTailSampleExact: true,
  originalTempoPreserved: true, speechDependentGain: false, appliedGain: 1,
  endCardStartFrame, endCardStartSeconds: endCardStartFrame / 30,
  signatureFrames, endCardDurationInFrames: 150, durationInFrames: endCardStartFrame + 150,
  durationSeconds, sampleRate: 48000, channels: 2, pcmBits: 16,
  instrumentalOnly: true, originalAssetsModified: false, externalSamplesOrServices: false,
  criticalListening: 'pending',
};
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof));
