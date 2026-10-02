import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {probeMedia, validateMixCues} from './mix-narration.mjs';
import {naturalFrenchRoles} from './render-catalog.mjs';

const run = promisify(execFile);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const cues = ['intro', 'administrator', 'supervisor', 'operator', 'observer', 'review'];
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

function mediaPath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Natural narration expects a relative cache path.');
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Natural narration cache path escapes its library.');
  return file;
}

export function derivedClipFingerprint({source, clip, text, voiceId}) {
  return digest(JSON.stringify(canonical({
    derivation: 'exact-pcm24-cut-v1', sourceSha256: source.sha256, enhancedText: source.prompt,
    cueId: clip.cueId, cueText: text, voiceId, modelId: 'eleven_v4', languageCode: 'fr',
    variationIndex: 2, sampleRate: 44100, channels: 1, sampleFormat: 's24le', tempo: 1,
    sourceStartSample: clip.sourceStartSample, sourceEndSample: clip.sourceEndSample,
  })));
}

export async function decodePcm24(file) {
  const {stdout} = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode',
    '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s24le', '-f', 's24le', '-'],
  {encoding: 'buffer', maxBuffer: 8 * 1024 * 1024});
  if (!stdout.length || stdout.length % 3) throw new Error('Natural narration has an incomplete decoded PCM signal.');
  return stdout;
}

export async function qualifyNaturalVideo({repositoryRoot, timeline}) {
  const file = path.join(repositoryRoot, 'apps/web/public', naturalFrenchRoles.source.slice(1));
  const media = await probeMedia(file);
  const video = media.streams.find((stream) => stream.codec_type === 'video');
  const audio = media.streams.find((stream) => stream.codec_type === 'audio');
  if (media.streams.length !== 2 || video?.codec_name !== 'h264' || video.width !== timeline.width || video.height !== timeline.height
    || video.avg_frame_rate !== '30/1' || Number(video.nb_frames) !== timeline.durationInFrames
    || audio?.codec_name !== 'aac' || audio.channels !== 2 || Number(audio.sample_rate) !== 48000
    || Math.abs(Number(media.format.duration) - timeline.durationInFrames / timeline.fps) > 0.1
    || (await stat(file)).size >= 25 * 1024 * 1024) throw new Error('Natural roles source failed its H.264, audio, frame or size qualification.');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-i', file, '-f', 'null', '-']);
}

async function checkedMedia(root, record, codec) {
  const file = mediaPath(root, record.path);
  if (digest(await readFile(file)) !== record.sha256) throw new Error('Natural narration media hash mismatch.');
  const media = await probeMedia(file);
  const audio = media.streams[0];
  if (media.streams.length !== 1 || audio.codec_type !== 'audio' || audio.codec_name !== codec
    || Number(audio.sample_rate) !== 44100 || audio.channels !== 1
    || (codec === 'pcm_s24le' && Number(audio.bits_per_sample) !== 24)) {
    throw new Error('Natural narration requires MP3 sources and mono PCM24 WAV clips at 44100 Hz.');
  }
  return decodePcm24(file);
}

// This library records real plugin variations and exact local PCM cuts. It does
// not reuse the legacy TTS fingerprint, invent an API request, or call a provider.
export async function qualifyNaturalNarration(library) {
  const [saved, manifest, generation, enhancement, timeline, sourceCatalog] = await Promise.all([
    readJson(path.join(library, 'library.json')), readJson(path.join(library, 'scripts.json')),
    readJson(path.join(library, 'generation.json')), readJson(path.join(library, 'enhancement.json')),
    readJson(path.join(library, 'timeline.json')), readJson(path.join(library, 'source-video.json')),
  ]);
  const narration = manifest.narrations?.[0];
  if (saved.schemaVersion !== 1 || saved.id !== 'roles-fr-natural-c-v1' || saved.source !== 'elevenlabs-creative-plugin'
    || saved.modelId !== 'eleven_v4' || saved.languageCode !== 'fr' || saved.selectedVariationNumber !== 2
    || saved.musicPolicy?.mode !== 'constant' || saved.musicPolicy.gain !== 0.22
    || saved.voice?.voiceId !== 'm5U7XCsc8v988k2RJAqN' || saved.method !== 'C-three-blocks'
    || saved.webGeneration !== undefined || generation.schemaVersion !== 1
    || manifest.schemaVersion !== 1 || manifest.modelId !== saved.modelId || manifest.outputFormat !== 'wav_pcm_s24le_44100_mono'
    || manifest.narrations?.length !== 1 || narration?.id !== 'roles-fr-natural-c' || narration.kind !== 'roles' || narration.locale !== 'fr'
    || !Number.isFinite(narration.durationSeconds) || !Number.isFinite(narration.endCardStartSeconds)
    || Math.abs(narration.durationSeconds - narration.endCardStartSeconds - 5) > 0.000001
    || JSON.stringify(narration.cues?.map((cue) => cue.id)) !== JSON.stringify(cues)
    || !Array.isArray(saved.sources) || saved.sources.length !== 3 || !Array.isArray(saved.clips) || saved.clips.length !== 6
    || enhancement.source !== 'elevenlabs-native-enhance' || enhancement.spokenTextUnchanged !== true
    || enhancement.voice?.voiceId !== saved.voice.voiceId) throw new Error('Unsupported or mislabeled natural narration library.');
  const spoken = (text) => text.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
  if (spoken(enhancement.originalText) !== spoken(enhancement.enhancedText)
    || spoken(enhancement.originalText) !== narration.cues.map((cue) => cue.text).join(' ')
    || timeline.fps !== 30 || timeline.width !== 1920 || timeline.height !== 1080
    || timeline.compositionId !== naturalFrenchRoles.composition || !Number.isSafeInteger(timeline.durationInFrames)
    || timeline.endCardDurationInFrames !== 150 || timeline.durationInFrames - timeline.endCardStartFrame !== 150
    || timeline.scenes?.at(-1)?.startFrame !== timeline.endCardStartFrame || timeline.scenes.at(-1).durationInFrames !== 150
    || narration.durationSeconds !== timeline.durationInFrames / 30 || narration.endCardStartSeconds !== timeline.endCardStartFrame / 30
    || JSON.stringify(timeline.scenes?.map((scene) => scene.id)) !== JSON.stringify([...cues, 'logo'])
    || sourceCatalog.roles?.fr?.movie !== naturalFrenchRoles.source || sourceCatalog.roles.fr.poster !== naturalFrenchRoles.poster) {
    throw new Error('Natural narration text, source catalog and timeline must agree.');
  }
  let previousSceneEnd = 0;
  for (const [index, scene] of timeline.scenes.entries()) {
    if (!Number.isSafeInteger(scene.startFrame) || !Number.isSafeInteger(scene.durationInFrames)
      || scene.startFrame !== previousSceneEnd || scene.durationInFrames <= 0) throw new Error('Natural narration scenes must be contiguous.');
    previousSceneEnd += scene.durationInFrames;
    if (index < cues.length && (narration.cues[index].startSeconds !== (scene.startFrame + 12) / 30
      || narration.cues[index].endSeconds !== (scene.startFrame + scene.durationInFrames - 15) / 30)) {
      throw new Error('Natural narration cue must keep its scene entry and exit breathing room.');
    }
  }
  if (previousSceneEnd !== timeline.durationInFrames) throw new Error('Natural narration scene total differs from its duration.');
  const decoded = new Map();
  for (const source of saved.sources) {
    const block = enhancement.blocks.find((entry) => entry.id === source.blockId);
    if (decoded.has(source.blockId) || source.variationIndex !== 2 || source.modelId !== saved.modelId
      || source.languageCode !== 'fr' || source.voiceId !== saved.voice.voiceId || !source.path.endsWith('.mp3')
      || source.source !== saved.source || source.outputFormat !== 'mp3_44100_128'
      || source.prompt !== block?.prompt || source.requestTextSha256 !== digest(source.prompt)
      || spoken(source.prompt) !== block.cueIds.map((id) => narration.cues.find((cue) => cue.id === id)?.text).join(' ')) {
      throw new Error('Natural narration source does not match its selected plugin variation and enhanced text.');
    }
    const pcm = await checkedMedia(library, source, 'mp3');
    if (pcm.length / 3 !== source.decodedSamples || digest(pcm) !== source.decodedPcmSha256) {
      throw new Error('Natural narration source has changed its complete decoded signal.');
    }
    decoded.set(source.blockId, pcm);
  }
  const clips = [];
  const previousEnd = new Map(saved.sources.map((source) => [source.blockId, 0]));
  for (let index = 0; index < cues.length; index++) {
    const clip = saved.clips[index];
    const cue = narration.cues[index];
    const source = saved.sources.find((entry) => entry.blockId === clip.sourceBlockId);
    if (clip.cueId !== cue.id || !source || !enhancement.blocks.find((block) => block.id === source.blockId)?.cueIds.includes(cue.id)
      || clip.tempo !== 1 || !clip.path.endsWith('.wav')
      || !Number.isSafeInteger(clip.sourceStartSample) || !Number.isSafeInteger(clip.sourceEndSample)
      || clip.sourceStartSample !== previousEnd.get(source.blockId) || clip.sourceEndSample <= clip.sourceStartSample
      || clip.sourceEndSample > source.decodedSamples) throw new Error('Natural narration cuts must preserve the complete native-pace blocks.');
    const pcm = await checkedMedia(library, clip, 'pcm_s24le');
    const expected = decoded.get(source.blockId).subarray(clip.sourceStartSample * 3, clip.sourceEndSample * 3);
    if (!pcm.equals(expected) || digest(pcm) !== clip.pcmSha256) throw new Error('Natural narration WAV is not an exact source PCM cut.');
    previousEnd.set(source.blockId, clip.sourceEndSample);
    const fingerprint = derivedClipFingerprint({source, clip, text: cue.text, voiceId: saved.voice.voiceId});
    if (typeof cue.text !== 'string' || !cue.text.trim()) throw new Error('Natural narration cue text is missing.');
    const record = generation.clips?.[`${narration.id}/${cue.id}`];
    const durationSeconds = pcm.length / 3 / 44100;
    if (record?.status !== 'complete' || record.source !== saved.source || record.variationIndex !== 2
      || record.webGeneration !== undefined || record.fingerprint !== fingerprint || clip.fingerprint !== fingerprint
      || record.path !== clip.path || record.audioSha256 !== clip.sha256 || record.tempo !== 1
      || record.durationSeconds !== durationSeconds || record.timingFit !== true) {
      throw new Error('Natural narration derived receipt is stale or mislabeled.');
    }
    clips.push({narrationId: narration.id, cueId: cue.id, kind: 'roles', locale: 'fr',
      durationSeconds: narration.durationSeconds, endCardStartSeconds: narration.endCardStartSeconds,
      startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, text: cue.text,
      relativePath: clip.path, fingerprint, actualDurationSeconds: durationSeconds});
  }
  if (saved.sources.some((source) => previousEnd.get(source.blockId) !== source.decodedSamples)) {
    throw new Error('Natural narration must retain every source sample.');
  }
  validateMixCues(narration, clips.map((clip) => ({...clip, durationSeconds: clip.actualDurationSeconds})));
  return {manifest, generation, metadata: saved, timeline,
    plan: {schemaVersion: 1, modelId: saved.modelId, outputFormat: 'pcm_s24le', clips}};
}
