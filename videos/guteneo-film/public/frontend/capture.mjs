import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, '../../../..');
const require = createRequire(resolve(root, 'package.json'));
const { chromium } = require('playwright');
const port = Number(process.env.GUTENEO_FILM_PREVIEW_PORT || 5198);
const preview = `http://127.0.0.1:${port}`;
const publicUrl = 'https://guteneo.com/';
const viewport = { width: 1920, height: 1080 };
const capturedAt = new Date().toISOString();
const localCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const appChanges = execFileSync('git', ['status', '--short', '--', 'apps/web', 'packages'], { cwd: root, encoding: 'utf8' }).trim();
const release = await fetch(new URL('release.json', publicUrl)).then((response) => response.json());
const capabilities = await fetch(new URL('api/capabilities', publicUrl)).then((response) => response.json());
await mkdir(output, { recursive: true });

// The existing application's isolated browser fixture is explicitly selected.
// No D1, R2, production login or domain simulator is started.
const server = spawn(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1',
  '--port', String(port), '--strictPort',
], {
  cwd: root,
  env: { ...process.env, VITE_PUBLIC_PREVIEW: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
let browser;
const evidence = [];
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Preview server exited: ${serverLog}`);
    try {
      const response = await fetch(preview);
      if (response.ok) break;
    } catch {}
    if (attempt === 99) throw new Error('Preview server did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  for (const capture of [
    { file: 'homepage.png', url: publicUrl, heading: 'Votre assistant prépare.', fixture: false },
    { file: 'atelier.png', url: `${preview}/#/app`, heading: 'Votre correspondance, au clair.', fixture: true },
    { file: 'approval.png', url: `${preview}/#/app/prepare?channel=postal`, heading: 'Le bon à envoyer.', fixture: true, preparePostal: true },
  ]) {
    // Each capture uses a fresh unauthenticated context with no user cookies.
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const blocked = [];
    const publicReads = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const backend = /^\/(api|auth|oauth|mcp)(\/|$)/.test(url.pathname);
      const publicRead = !capture.fixture && url.origin === 'https://guteneo.com' && ['/api/capabilities', '/api/session'].includes(url.pathname) && request.method() === 'GET';
      if (publicRead) publicReads.push(url.pathname);
      if (request.method() !== 'GET' || (backend && !publicRead)) {
        blocked.push({ path: url.pathname, method: request.method() });
        await route.abort();
      } else {
        await route.continue();
      }
    });
    await page.goto(capture.url, { waitUntil: 'networkidle' });
    if (capture.preparePostal) {
      await page.getByRole('radio', { name: 'Courrier postal', exact: true }).check();
      await page.getByLabel('Document', { exact: true }).selectOption('preview_atelier_document_1');
      await page.getByLabel('Nom du destinataire', { exact: true }).fill('Maison Papier · fictive');
      await page.getByLabel('Adresse', { exact: true }).fill('12 rue de l’Exemple');
      await page.getByLabel('Code postal', { exact: true }).fill('75002');
      await page.getByLabel('Ville', { exact: true }).fill('Paris');
      await page.getByLabel('Pays', { exact: true }).selectOption('FR');
      await page.getByRole('button', { name: 'Vérifier et préparer', exact: true }).click();
      // Stop before any approval, confirmation or send, including simulated sends.
      await page.locator('canvas').waitFor({ state: 'visible' });
    }
    await page.getByRole('heading', { name: new RegExp(capture.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].filter((image) => image.complete && image.naturalWidth).map((image) => image.decode().catch(() => {})));
      window.scrollTo(0, 0);
    });
    if (capture.fixture && !/Aperçu interactif|Espace de démonstration|exemples fictifs/i.test(await page.locator('body').innerText())) {
      throw new Error('The fixture disclosure is missing');
    }
    if (blocked.length || errors.length) throw new Error(JSON.stringify({ file: capture.file, blocked, errors }));
    await page.screenshot({ path: resolve(output, capture.file), fullPage: false, animations: 'disabled' });
    evidence.push({ ...capture, finalUrl: page.url(), viewport, publicReads, blockedBackendRequests: blocked, pageErrors: errors });
    await context.close();
  }
  const releaseAfter = await fetch(new URL('release.json', publicUrl)).then((response) => response.json());
  if (release.sourceCommit !== releaseAfter.sourceCommit) throw new Error('Public release changed during capture; run again');
  await writeFile(resolve(output, 'provenance.json'), JSON.stringify({ capturedAt, publicRelease: { sourceCommit: release.sourceCommit, builtAt: release.builtAt, version: release.version }, capabilities: { version: capabilities.version, mode: capabilities.mode, channels: capabilities.channels.map(({id, liveSending}) => ({ id, liveSending })) }, localCommit, appChanges: appChanges || null, evidence }, null, 2) + '\n');
  await writeFile(resolve(output, 'provenance.md'), `# Captures du frontend Guteneo\n\nCapturées le ${capturedAt}, avec Chromium Playwright, fenêtre 1920 × 1080, densité 1, français, mouvement réduit.\n\n## homepage.png\n\n- URL : ${publicUrl}\n- Version publique : ${release.sourceCommit}\n- Construction publique : ${release.builtAt}\n- Page d'accueil réellement servie, sans session ni données de compte.\n- L'API publique annonce fax et courrier ouverts, e-mail fermé. Cette capture ne qualifie aucun envoi.\n\n## atelier.png\n\n- URL locale : ${preview}/#/app\n- Source locale : ${localCommit}\n- Modifications locales de apps/web et packages : ${appChanges || 'aucune'}\n- Application existante démarrée avec VITE_PUBLIC_PREVIEW=true, comme prévu dans docs/PUBLIC_PREVIEW.md et apps/web/src/api.ts.\n- Données fictives natives de apps/web/src/preview.ts. Les mentions d'aperçu et de simulation restent visibles.\n- Aucun login, backend, document client ou envoi réel. Les données ne qualifient pas une disponibilité fournisseur.\n\n## Reproduction\n\nDepuis la racine du dépôt, lancer :\n\n\`\`\`sh\nnode videos/guteneo-film/public/frontend/capture.mjs\n\`\`\`\n\nLe script démarre puis arrête son serveur Vite local sur le port 5198. Il utilise des contextes navigateur neufs, bloque les méthodes non GET et les routes de services, sauf les lectures anonymes natives /api/capabilities et /api/session de la homepage. Il attend les polices et images, conserve le frontend sans retouche de DOM ni masquage d'éléments. L'atelier ne réalise aucun appel au backend. Le détail machine est dans provenance.json.\n`);
  console.log(JSON.stringify({ output, capturedAt, publicCommit: release.sourceCommit, localCommit, captures: evidence.map(({file}) => file) }));
  await appendFile(resolve(output, 'provenance.md'), `\n## approval.png\n\n- Vue native de relecture postale de la même fixture locale, 1920 × 1080.\n- Le formulaire a préparé un courrier uniquement dans la mémoire du navigateur, à partir du PDF natif « Votre courrier · exemple.pdf ».\n- Destinataire fictif : Maison Papier · fictive, 12 rue de l’Exemple, 75002 Paris, FR.\n- Arrêt avant toute approbation, confirmation ou expédition, y compris simulée. Aucun fournisseur ou backend contacté.\n- Le bandeau Simulation, le prix fictif, le destinataire et le PDF sont conservés tels que le frontend les affiche.\n`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
