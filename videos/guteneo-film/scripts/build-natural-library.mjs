import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {derivedClipFingerprint, qualifyNaturalNarration} from './natural-narration.mjs';
import {naturalFilmSpec} from './render-catalog.mjs';

const filmRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

function inputFile(directory, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('A natural source must use a relative input path.');
  const file = path.resolve(directory, relative);
  if (!file.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Natural source path escapes its input directory.');
  return file;
}

function portableProof(value, directory) {
  if (Array.isArray(value)) return value.map((entry) => portableProof(entry, directory));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['modelPath', 'apiKey', 'token', 'accessToken', 'audioUrl', 'downloadUrl', 'signedUrl'].includes(key))
    .map(([key, entry]) => [key, portableProof(entry, directory)]));
  if (typeof value === 'string' && path.isAbsolute(value)) return value.startsWith(`${directory}${path.sep}`)
    ? path.relative(directory, value) : path.basename(value);
  return value;
}

export async function buildNaturalLibrary({inputDirectory, libraryRoot = path.join(filmRoot, 'narration/releases')}) {
  const input = path.resolve(inputDirectory);
  const [enhancement, provider, proof, manifest, timeline] = await Promise.all([
    json(path.join(input, 'enhancement.json')), json(path.join(input, 'provider-receipts.json')),
    json(path.join(input, 'clip-proof.json')), json(path.join(input, 'script-timed.json')), json(path.join(input, 'timeline.json')),
  ]);
  const narration = manifest.narrations?.[0];
  const spec = naturalFilmSpec(narration?.kind, narration?.locale);
  if (narration.id !== `${narration.kind}-${narration.locale}-natural-c`
    || !Array.isArray(narration.cues) || narration.cues.some((cue) => !/^[a-z]+(?:-[a-z]+)*$/.test(cue.id))) {
    throw new Error('Natural narration IDs must be safe and match their kind and locale.');
  }
  const destination = path.resolve(libraryRoot, spec.library);
  if (await stat(destination).then(() => true, (error) => {if (error.code === 'ENOENT') return false; throw error;})) {
    throw new Error('Natural narration libraries are immutable; the selected destination already exists.');
  }
  const selected = provider.files?.filter((entry) => entry.selected);
  if (provider.source !== 'elevenlabs-creative-plugin' || selected?.length !== 3) {
    throw new Error('A natural narration requires three real selected plugin variations.');
  }
  const sources = selected.map((entry) => {
    const block = proof.blocks?.find((record) => record.blockId === entry.blockId);
    if (!block || entry.variationIndex !== 2 || entry.source !== provider.source
      || !entry.generationId || entry.voice?.voiceId !== enhancement.voice?.voiceId) {
      throw new Error('The selected plugin variation lacks matching block, voice or real provider provenance.');
    }
    return {blockId: entry.blockId, path: `sources/${path.basename(entry.filename)}`, sha256: entry.sha256, bytes: entry.bytes,
      source: entry.source, generationId: entry.generationId, variationIndex: entry.variationIndex, modelId: entry.modelId,
      languageCode: entry.language, voiceId: entry.voice.voiceId, outputFormat: entry.outputFormat,
      prompt: entry.prompt, requestTextSha256: digest(entry.prompt), providerDurationSeconds: entry.providerDurationSeconds,
      decodedSamples: block.samples, decodedPcmSha256: block.decodedPcmSha256};
  });
  const clips = proof.clips?.map((entry) => ({cueId: entry.cueId, path: `clips/${narration.id}/${entry.cueId}.wav`,
    sha256: entry.sha256, sourceBlockId: entry.sourceBlockId, sourceStartSample: entry.sourceStartSample,
    sourceEndSample: entry.sourceEndSampleExclusive, pcmSha256: entry.pcmSha256, tempo: entry.tempoFactor}));
  if (!clips?.length) throw new Error('A natural narration requires the complete PCM cut proof.');
  if (clips.some((clip) => !narration.cues.some((cue) => cue.id === clip.cueId))) throw new Error('The cut proof contains an unknown cue.');
  for (const clip of clips) {
    const source = sources.find((entry) => entry.blockId === clip.sourceBlockId);
    const cue = narration.cues.find((entry) => entry.id === clip.cueId);
    if (!source || !cue) throw new Error('The natural cut proof has no matching source and narration cue.');
    clip.fingerprint = derivedClipFingerprint({source, clip, text: cue.text, voiceId: enhancement.voice.voiceId});
  }
  const library = {schemaVersion: 1, id: spec.library, method: 'C-three-blocks', source: provider.source,
    modelId: 'eleven_v4', languageCode: narration.locale, selectedVariationNumber: 2, voice: enhancement.voice,
    musicPolicy: {mode: 'constant', gain: 0.22}, criticalListening: 'pending', sources, clips};
  const generation = {schemaVersion: 1, clips: Object.fromEntries(clips.map((clip) => [`${narration.id}/${clip.cueId}`, {
    status: 'complete', source: provider.source, variationIndex: 2, path: clip.path, audioSha256: clip.sha256,
    fingerprint: clip.fingerprint, durationSeconds: (clip.sourceEndSample - clip.sourceStartSample) / 44100, timingFit: true, tempo: 1,
  }]))};
  const sourceCatalog = narration.kind === 'roles'
    ? {roles: {[narration.locale]: {movie: spec.source, poster: spec.poster}}}
    : {introduction: {[narration.locale]: Object.fromEntries(['horizontal', 'vertical'].map((format) => {
      const variant = naturalFilmSpec('introduction', narration.locale, format);
      return [format, {movie: variant.source, poster: variant.poster}];
    }))}};
  await mkdir(libraryRoot, {recursive: true});
  const temporary = await mkdtemp(path.join(path.resolve(libraryRoot), '.natural-library-'));
  try {
    await mkdir(path.join(temporary, 'sources'), {recursive: true});
    await mkdir(path.join(temporary, 'clips', narration.id), {recursive: true});
    for (const entry of selected) {
      const relative = entry.audioPath ?? `sources/${entry.filename}`;
      await cp(inputFile(input, relative), path.join(temporary, 'sources', path.basename(entry.filename)));
    }
    for (const entry of proof.clips) {
      await cp(inputFile(input, entry.path), path.join(temporary, 'clips', narration.id, `${entry.cueId}.wav`));
    }
    for (const [filename, value] of Object.entries({'library.json': library, 'scripts.json': manifest,
      'generation.json': generation, 'enhancement.json': enhancement, 'timeline.json': timeline, 'source-video.json': sourceCatalog})) {
      await save(path.join(temporary, filename), value);
    }
    await mkdir(path.join(temporary, 'provider-receipts'));
    for (const source of sources) await save(path.join(temporary, 'provider-receipts', `${source.blockId}.json`), source);
    const portableCuts = portableProof(proof, input);
    portableCuts.originalProofSha256 = digest(await readFile(path.join(input, 'clip-proof.json')));
    for (const clip of portableCuts.clips) {
      clip.path = `clips/${narration.id}/${clip.cueId}.wav`;
      clip.sourceAudioPath = sources.find((source) => source.blockId === clip.sourceBlockId).path;
    }
    await save(path.join(temporary, 'cut-proof.json'), portableCuts);
    const alignmentDir = path.join(input, 'alignment');
    const alignmentFiles = await readdir(alignmentDir).catch((error) => {if (error.code === 'ENOENT') return []; throw error;});
    if (alignmentFiles.length) {
      await mkdir(path.join(temporary, 'alignment'));
      for (const name of alignmentFiles.filter((file) => file.endsWith('.json'))) {
        const file = inputFile(alignmentDir, name);
        const proofBytes = await readFile(file);
        await save(path.join(temporary, 'alignment', name), {...portableProof(JSON.parse(proofBytes), input), originalProofSha256: digest(proofBytes)});
      }
    }
    const qualified = await qualifyNaturalNarration(temporary);
    await save(path.join(temporary, 'decoder-proof.json'), {schemaVersion: 1, sources: qualified.decoderQualification});
    await writeFile(path.join(temporary, 'README.md'), `# ${spec.library}\n\nFrozen natural narration: ${sources.length} real plugin MP3 sources, ${clips.length} canonical PCM24 cuts, tempo 1.\n\nNative ElevenLabs enhancement and any calm curation are recorded in enhancement.json. Voice and language come from the real selected provider variations. Every source sample is retained. SHA checks remain strict; decoder quantization is bounded to 8 PCM24 LSB with an unchanged sample count.\n\nReplay through the localized renderer with the ${spec.composition} composition and this library's timeline. Music uses constant gain 0.22; the last logo card lasts five seconds. This cache performs no provider calls. Critical human listening is pending.\n`);
    await rename(temporary, destination);
    return {library: destination, narrationId: narration.id, sources: sources.length, clips: clips.length,
      durationSeconds: narration.durationSeconds, decoderQualification: qualified.decoderQualification};
  } catch (error) {
    await rm(temporary, {recursive: true, force: true});
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let inputDirectory;
  let libraryRoot;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--input') inputDirectory = args[++index];
    else if (args[index] === '--library-root') libraryRoot = args[++index];
    else throw new Error('Use --input <natural-narration-directory> [--library-root <directory>].');
  }
  if (!inputDirectory) throw new Error('The natural narration input directory is required.');
  const result = await buildNaturalLibrary({inputDirectory, libraryRoot});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {process.stderr.write(`${error.message}\n`); process.exitCode = 1;});
}
