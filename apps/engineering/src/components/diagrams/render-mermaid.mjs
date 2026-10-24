import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const app = fileURLToPath(new URL('../../../', import.meta.url));
const illustrations = join(app, 'public/illustrations');
const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const browser = process.env.CHROME_PATH ?? require('@playwright/test').chromium.executablePath();
const temporary = mkdtempSync(join(tmpdir(), 'guteneo-mermaid-'));
const config = join(temporary, 'mermaid.json');
const puppeteer = join(temporary, 'puppeteer.json');
writeFileSync(config, JSON.stringify({
  theme: 'base', securityLevel: 'strict', fontFamily: 'IBM Plex Sans, Arial, sans-serif',
  themeVariables: {
    primaryColor: '#fffdf8', primaryTextColor: '#242c38', primaryBorderColor: '#8b8c8e',
    secondaryColor: '#f1ece3', tertiaryColor: '#f6f5ef', lineColor: '#707783',
    clusterBkg: '#f6f5ef', clusterBorder: '#c6c6c0', edgeLabelBackground: '#f6f5ef',
    entityBkg: '#fffdf8', entityBorder: '#2450db', entityTextColor: '#242c38',
    relationshipLineColor: '#707783', attributeBackgroundColorOdd: '#f6f5ef', attributeBackgroundColorEven: '#fffdf8',
    fontSize: '15px', fontFamily: 'IBM Plex Sans, Arial, sans-serif',
  },
  flowchart: { htmlLabels: false, curve: 'basis', padding: 15, nodeSpacing: 26, rankSpacing: 38 },
}));
writeFileSync(puppeteer, JSON.stringify({ executablePath: browser, args: ['--no-sandbox'] }));
try {
  const requested = process.argv.slice(2);
  const assets = ['system-architecture', 'dispatch-lifecycle', 'document-pipeline', 'data-model', 'service-release'];
  if (requested.some((asset) => !assets.includes(asset))) throw new Error('Unknown Mermaid asset requested.');
  for (const asset of requested.length ? requested : assets) {
    const result = spawnSync(join(app, 'node_modules/.bin/mmdc'), [
      '-i', join(illustrations, `${asset}.mmd`), '-o', join(illustrations, `${asset}-mermaid.svg`),
      '-c', config, '-p', puppeteer, '-b', '#f6f5ef', '--size', '1200', '--quiet',
    ], { cwd: app, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Mermaid rendering failed for ${asset} (${result.status}).`);
    console.log(`Rendered ${asset}-mermaid.svg`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
