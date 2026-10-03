import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildNaturalLibrary} from '../scripts/build-natural-library.mjs';
import {qualifyNaturalNarration} from '../scripts/natural-narration.mjs';
import {renderNaturalSources} from '../scripts/render-natural-sources.mjs';

const library = path.resolve(import.meta.dirname, '../narration/releases/roles-fr-natural-c-v1');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function realFrenchInput(directory) {
  await cp(library, directory, {recursive: true});
  const saved = await json(path.join(library, 'library.json'));
  await cp(path.join(directory, 'scripts.json'), path.join(directory, 'script-timed.json'));
  await cp(path.join(directory, 'cut-proof.json'), path.join(directory, 'clip-proof.json'));
  const provider = {source: saved.source, files: saved.sources.map((source) => ({...source,
    filename: path.basename(source.path), audioPath: source.path, voice: saved.voice, language: source.languageCode, selected: true}))};
  await writeFile(path.join(directory, 'provider-receipts.json'), JSON.stringify(provider));
}

test('snapshot builder installs a fully qualified real cache offline and refuses any replacement', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-build-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('Provider calls are forbidden during immutable snapshot assembly.');};
  try {
    const inputDirectory = path.join(temporary, 'input');
    const libraryRoot = path.join(temporary, 'releases');
    await realFrenchInput(inputDirectory);
    const result = await buildNaturalLibrary({inputDirectory, libraryRoot});
    assert.equal(result.sources, 3);
    assert.equal(result.clips, 6);
    const qualified = await qualifyNaturalNarration(result.library);
    assert.equal(qualified.manifest.narrations[0].durationSeconds, 1346 / 30);
    const before = await readFile(path.join(result.library, 'library.json'));
    await assert.rejects(buildNaturalLibrary({inputDirectory, libraryRoot}), /immutable/);
    assert.deepEqual(await readFile(path.join(result.library, 'library.json')), before);
    for (const source of qualified.metadata.sources) assert.deepEqual(await readFile(path.join(result.library, source.path)), await readFile(path.join(library, source.path)));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, {recursive: true, force: true});
  }
});

test('snapshot assembly rejects incomplete cuts before installing a library', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-build-invalid-'));
  try {
    const inputDirectory = path.join(temporary, 'input');
    const libraryRoot = path.join(temporary, 'releases');
    await realFrenchInput(inputDirectory);
    const proofFile = path.join(inputDirectory, 'clip-proof.json');
    const proof = await json(proofFile);
    proof.clips[0].sourceEndSampleExclusive--;
    await writeFile(proofFile, JSON.stringify(proof));
    await assert.rejects(buildNaturalLibrary({inputDirectory, libraryRoot}), /exact source PCM cut/);
    await assert.rejects(stat(path.join(libraryRoot, 'roles-fr-natural-c-v1')), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('initial source renderer protects the accepted French role film and public asset directory', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-source-guard-'));
  try {
    const outputDir = path.join(temporary, 'unwritten');
    await assert.rejects(renderNaturalSources({libraries: ['roles-fr-natural-c-v1'], outputDir}), /accepted French roles source/);
    const publicDir = path.resolve(import.meta.dirname, '../../../apps/web/public');
    await assert.rejects(renderNaturalSources({libraries: ['introduction-fr-natural-c-v1'], outputDir: publicDir}), /outside public assets/);
    await assert.rejects(stat(outputDir), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('offline source guards load while every optional Remotion package is unavailable', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'guteneo-natural-no-render-deps-'));
  try {
    const loader = path.join(temporary, 'block-remotion.mjs');
    await writeFile(loader, `export async function resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@remotion/')) throw new Error('Optional renderer dependencies unavailable');
      return nextResolve(specifier, context);
    }\n`);
    const register = path.join(temporary, 'register-loader.mjs');
    await writeFile(register, "import {register} from 'node:module'; register('./block-remotion.mjs', import.meta.url);\n");
    const renderer = new URL('../scripts/render-natural-sources.mjs', import.meta.url).href;
    const outputDir = path.join(temporary, 'unwritten');
    const code = `import assert from 'node:assert/strict';
      const {renderNaturalSources} = await import(${JSON.stringify(renderer)});
      await assert.rejects(renderNaturalSources({libraries: ['roles-fr-natural-c-v1'],
        outputDir: ${JSON.stringify(outputDir)}}), /accepted French roles source/);`;
    execFileSync(process.execPath, ['--import', register, '--input-type=module', '-e', code]);
    await assert.rejects(stat(outputDir), {code: 'ENOENT'});
  } finally {await rm(temporary, {recursive: true, force: true});}
});
