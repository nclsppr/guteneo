import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildPlan, validateManifest} from './generate-narration.mjs';
import {mixVideos} from './mix-narration.mjs';
import {qualifyNaturalNarration, qualifyNaturalVideo} from './natural-narration.mjs';
import {isNaturalNarration, naturalFilmSpec} from './render-catalog.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

export function narrationCaptions(narration, movie) {
  const french = narration.locale === 'fr';
  if (!['fr', 'en', 'de', 'lb'].includes(narration.locale)) throw new Error('Unsupported published narration language.');
  const natural = narration.id.endsWith('-natural-c');
  const text = new Map(narration.cues.map((cue) => [cue.id, cue.text]));
  const labels = {
    fr: ['[Musique instrumentale]', '[La musique instrumentale continue.]', '[Un accord final résonne, sans percussion.]', '[La musique s’éteint doucement.]'],
    en: ['[Instrumental music]', '[The instrumental music continues.]', '[A final chord resonates, without percussion.]', '[The music gently fades away.]'],
    de: ['[Instrumentalmusik]', '[Die Instrumentalmusik läuft weiter.]', '[Ein Schlussakkord erklingt, ohne Schlagzeug.]', '[Die Musik klingt sanft aus.]'],
    lb: ['[Instrumental Musek]', '[D’Instrumentalmusek leeft weider.]', '[E Schlussakkord erklingt, ouni Perkussioun.]', '[D’Musek kléngt lues aus.]'],
  }[narration.locale];
  const voice = narration.voiceName ?? 'Manon';
  const naturalNote = {
    fr: `Narration française ${voice}, Eleven v4, deuxième variation du plugin. Texte amélioré dans ElevenLabs.`,
    en: `English ${voice} narration, Eleven v4, second plugin variation. Text enhanced in ElevenLabs.`,
    de: `Deutsche Erzählstimme ${voice}, Eleven v4, zweite Plugin-Variante. Text in ElevenLabs verbessert.`,
    lb: `Lëtzebuergesch Erzielstëmm ${voice}, Eleven v4, zweet Plugin-Variant. Text an ElevenLabs verbessert.`,
  }[narration.locale];
  const accompaniment = {
    fr: 'La musique instrumentale accompagne la narration.', en: 'Instrumental music accompanies the narration.',
    de: 'Instrumentalmusik begleitet die Erzählung.', lb: 'Instrumental Musek begleet d’Erzielung.',
  }[narration.locale];
  const lines = natural ? ['WEBVTT', '', 'NOTE', naturalNote, accompaniment, ''] : french
    ? ['WEBVTT', '', 'NOTE', 'Narration française George, Eleven v4, Génération 2 web.', 'La musique instrumentale accompagne la narration.', '']
    : ['WEBVTT', '', 'NOTE', 'English George narration, Eleven v4, web Generation 2.', 'Instrumental music continues under the narration.',
      narration.kind === 'introduction' ? 'Both introduction formats share these narration timings.' : 'The roles film uses its own narration timings.', ''];
  const add = (start, end, caption) => lines.push(`${stamp(start)} --> ${stamp(end)}`, caption, '');
  add(0, movie.clips[0].startSeconds, labels[0]);
  for (const clip of movie.clips) {
    const caption = text.get(clip.cueId);
    if (!caption) throw new Error('The mixed clip has no published narration text.');
    add(clip.startSeconds, clip.startSeconds + clip.durationSeconds, caption);
  }
  add(movie.lastSpeechEndSeconds, movie.endCardStartSeconds,
    movie.musicPolicy?.mode === 'constant'
      ? labels[1]
      : (french ? '[La musique instrumentale s’adoucit.]' : '[The instrumental music softens.]'));
  add(movie.endCardStartSeconds, movie.durationSeconds - 0.9,
    labels[2]);
  add(movie.durationSeconds - 0.9, movie.durationSeconds,
    labels[3]);
  return lines.join('\n');
}

export async function preparePublishedNarration({jobs, filmRoot, repositoryRoot, sourceCatalog, kind, outputRoot}) {
  const narrated = jobs.filter((job) => job.activeAsset.movie !== job.asset.movie);
  if (!narrated.length) return null;
  const libraries = [];
  const musicPolicies = {};
  const naturalDefinitions = [];
  for (const job of narrated) {
    if (isNaturalNarration(job)) continue;
    const originalPublishedMix = /^\/videos\/guteneo-(horizontal|vertical)-v6-(fr|en)\.mp4$/.test(job.activeAsset.movie)
      || job.activeAsset.movie === '/videos/guteneo-roles-v2-en.mp4';
    if (!originalPublishedMix) {
      musicPolicies[`${job.kind}-${job.locale}`] = {mode: 'constant', gain: 0.22};
    }
  }
  const historical = narrated.filter((job) => !isNaturalNarration(job));
  if (historical.length) {
    const locales = [...new Set(historical.map((job) => job.locale))];
    if (locales.some((locale) => !['fr', 'en'].includes(locale))) throw new Error('No checked-in narration library for a selected active film.');
    if (historical.some((job) => job.kind === 'roles' && job.locale === 'fr')) {
      throw new Error('No checked-in narration library for an unapproved French roles film.');
    }
    const library = path.join(filmRoot, 'narration/releases/fr-en-g2');
    const savedManifest = validateManifest(await readJson(path.join(library, 'scripts.json')));
    const selected = new Set(historical.map((job) => `${job.kind}-${job.locale}`));
    const manifest = validateManifest({...savedManifest, narrations: savedManifest.narrations.filter((entry) => selected.has(entry.id))});
    const config = await readJson(path.join(library, 'voices.json'));
    if (config.webGeneration !== 2) throw new Error('Published narration requires the selected Generation 2 exports.');
    const plan = buildPlan(manifest, config, {kind, locales});
    const generation = await readJson(path.join(library, 'generation.json'));
    for (const clip of plan.clips) {
      const receipt = generation.clips?.[`${clip.narrationId}/${clip.cueId}`];
      if (receipt?.source !== 'elevenlabs-web' || receipt.webGeneration !== 2) {
        throw new Error('Published narration requires qualified Generation 2 web receipts.');
      }
    }
    libraries.push({library, manifest, plan, generation});
  }
  const selectedNatural = new Map(narrated.filter(isNaturalNarration).map((job) => [`${job.kind}-${job.locale}`, job]));
  for (const job of selectedNatural.values()) {
    const spec = naturalFilmSpec(job.kind, job.locale, job.format);
    const library = path.join(filmRoot, 'narration/releases', spec.library);
    const qualified = await qualifyNaturalNarration(library);
    for (const selected of narrated.filter((entry) => isNaturalNarration(entry) && entry.kind === job.kind && entry.locale === job.locale)) {
      const definition = {timeline: qualified.timeline, spec: naturalFilmSpec(selected.kind, selected.locale, selected.format)};
      await qualifyNaturalVideo({repositoryRoot, ...definition});
      naturalDefinitions.push(definition);
    }
    if (!(job.kind === 'roles' && job.locale === 'fr')) {
      // The accepted French roles V3 caption bytes remain unchanged.
      qualified.manifest.narrations[0].voiceName = qualified.metadata.voice.name;
    }
    libraries.push({library, ...qualified});
    musicPolicies[qualified.manifest.narrations[0].id] = qualified.metadata.musicPolicy;
  }
  const manifest = {schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'qualified-mixed-audio',
    narrations: libraries.flatMap((entry) => entry.manifest.narrations)};
  const plan = {schemaVersion: 1, modelId: 'eleven_v4', outputFormat: 'qualified-mixed-audio',
    clips: libraries.flatMap((entry) => entry.plan.clips)};
  const generation = {schemaVersion: 1, clips: Object.assign({}, ...libraries.map((entry) => entry.generation.clips))};
  const selectedSources = structuredClone(sourceCatalog);
  for (const job of narrated) {
    if (job.kind === 'roles') selectedSources.roles[job.locale] = job.asset;
    else selectedSources.introduction[job.locale][job.format] = job.asset;
  }
  await mkdir(outputRoot, {recursive: true});
  const outputDir = await mkdtemp(path.join(outputRoot, 'narration-'));
  try {
    await writeFile(path.join(outputDir, 'generation.json'), `${JSON.stringify(generation, null, 2)}\n`);
    const decoderQualifications = libraries.filter((entry) => entry.decoderQualification).map((entry) => ({
      library: path.basename(entry.library), sources: entry.decoderQualification,
    }));
    if (decoderQualifications.length) await writeFile(path.join(outputDir, 'decoder-proof.json'),
      `${JSON.stringify({schemaVersion: 1, decoderQualifications}, null, 2)}\n`);
    for (const {library} of libraries) await cp(path.join(library, 'clips'), path.join(outputDir, 'clips'), {recursive: true});
    // Qualify every recorded hash, fingerprint, G2 selection and measured timing
    // before the renderer can replace any source or public asset. This writes
    // local candidates only and never calls ElevenLabs or changes the library.
    const result = await mixVideos({manifest, plan, catalog: selectedSources, repositoryRoot, outputDir, execute: true, webGeneration: 2, musicPolicies});
    return {manifest, plan, outputDir, sourceCatalog: selectedSources, repositoryRoot, movies: result.movies,
      libraryDirs: libraries.map((entry) => entry.library), musicPolicies, naturalDefinitions};
  } catch (error) {
    await rm(outputDir, {recursive: true, force: true});
    throw error;
  }
}

export async function canReuseRenderedJob({job, repositoryRoot, manifest, prepared}) {
  const publicRoot = path.join(repositoryRoot, 'apps/web/public');
  try {
    const bytes = await readFile(path.join(publicRoot, job.activeAsset.movie.slice(1)));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (manifest[job.activeAsset.movie]?.sha256 !== digest
      || (await stat(path.join(publicRoot, job.asset.poster.slice(1)))).size <= 0) return false;
    if (job.activeAsset.movie !== job.asset.movie) {
      const movie = prepared?.movies.find((entry) => entry.sourceMovie === path.basename(job.asset.movie));
      const narration = prepared?.manifest.narrations.find((entry) => entry.id === movie?.narrationId);
      if (!movie || !narration) return false;
      const captions = await readFile(path.join(publicRoot, job.activeAsset.captions.slice(1)), 'utf8');
      if (captions !== narrationCaptions(narration, movie)) return false;
    }
    return true;
  } catch { return false; }
}

export async function publishNarratedJobs({prepared, jobs, manifest}) {
  if (!prepared || !jobs.some((job) => job.activeAsset.movie !== job.asset.movie)) return [];
  for (const definition of prepared.naturalDefinitions) await qualifyNaturalVideo({repositoryRoot: prepared.repositoryRoot, ...definition});
  // Rendered music-only sources may have changed since preflight. Remake the
  // qualified local candidates from those sources, keeping their H.264 packets.
  const result = await mixVideos({manifest: prepared.manifest, plan: prepared.plan, catalog: prepared.sourceCatalog,
    repositoryRoot: prepared.repositoryRoot, outputDir: prepared.outputDir, execute: true, webGeneration: 2, musicPolicies: prepared.musicPolicies});
  const publicRoot = path.join(prepared.repositoryRoot, 'apps/web/public');
  const published = [];
  for (const job of jobs.filter((job) => job.activeAsset.movie !== job.asset.movie)) {
    const basename = path.basename(job.asset.movie);
    const proof = result.movies.find((movie) => movie.sourceMovie === basename);
    if (!proof) throw new Error(`No qualified narrated candidate for ${job.activeAsset.movie}.`);
    const destination = path.join(publicRoot, job.activeAsset.movie.slice(1));
    const staged = `${destination}.tmp.mp4`;
    await cp(path.join(prepared.outputDir, 'videos', basename), staged);
    await rename(staged, destination);
    const narration = prepared.manifest.narrations.find((entry) => entry.id === proof.narrationId);
    const captions = path.join(publicRoot, job.activeAsset.captions.slice(1));
    await writeFile(`${captions}.tmp.vtt`, narrationCaptions(narration, proof));
    await rename(`${captions}.tmp.vtt`, captions);
    manifest[job.activeAsset.movie] = {bytes: proof.bytes, sha256: proof.outputSha256};
    published.push({...proof, publicMovie: job.activeAsset.movie, captions: job.activeAsset.captions});
  }
  return published;
}
