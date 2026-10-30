import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as k from './anatomy/iso-kit.mjs';
import * as G from './anatomy/lathe.mjs';
import * as A from './anatomy/audit.mjs';

const OUTPUT = fileURLToPath(new URL('../../../public/illustrations/', import.meta.url));
mkdirSync(OUTPUT, { recursive: true });
const WIDTH = 900;
const HEIGHT = 510;
const BRAND_CSS = `
.iso[data-theme="light"]{--anatomy-paper:#f6f5ef;--anatomy-face:#fffdf8;--anatomy-top:#fffdf8;
--anatomy-shade-0:#cecac2;--anatomy-shade-1:#dcd8cf;--anatomy-shade-2:#e8e3d9;--anatomy-shade-3:#f1ece3;
--anatomy-hi:#242c38;--anatomy-mid:#7d8187;--anatomy-lo:#a8a8a5;--anatomy-faint:#c6c6c0;
--anatomy-lit:#2450db;--anatomy-lit-top:#e8edff;--anatomy-lit-shade:#cdd8ff;
--anatomy-halo:#a29d91;--anatomy-halo-opacity:.15;--anatomy-weight:.65px;
--anatomy-mono:"IBM Plex Mono",monospace}
.sample-paper .iso-top{fill:#edf1ff}.sample-paper .iso-edge{stroke:#2450db;stroke-width:1}
.is-filtered [data-station].is-active .iso-edge{stroke:#2450db}.is-filtered [data-station].is-active .iso-top{fill:#edf1ff}
@media(prefers-reduced-motion:reduce){[data-station]{transition:none}}
`;

function scene(name, bounds, label) {
  const P = k.fitProjection(bounds, WIDTH, HEIGHT, { pad: 58, azimuth: 42, elevation: 32 });
  const R = A.recorder(P, { order: ['packet'] });
  let station = 0;
  let count = 0;
  const at = (p) => k.iso(p, P);
  const put = (id, centre, svg, shape, options = {}) => {
    const nameOf = `${name}.${id}.${++count}`;
    return R.put({ name: nameOf, piece: 'machine', at: centre,
      svg: `<g data-station="${station}" data-component="${id}">${svg}</g>`,
      shapes: [R.solid({ ...shape, name: nameOf, ...options })] });
  };
  const slab = (id, x, y, w, d, z, h, { r = 1.4, tone = 'mid', lit = false, seam, inner = '', ...meta } = {}) => {
    const plan = { x, y, w, d, r };
    if (seam !== undefined) inner += k.lineSvg(k.sideSeam(plan, seam, P, 5), { tone: 'lo' });
    put(id, [x + w / 2, y + d / 2, z + h / 2],
      k.solidSvg(k.slabOf(plan, z, h, P, 5, .6), { tone, lit, inner }),
      A.slab(plan, z, h, {}, 5), meta);
  };
  const cylinder = (id, x, y, r, z, h, { tone = 'mid', lit = false, inner = '', ...meta } = {}) => {
    put(id, [x, y, z + h / 2], k.solidSvg(k.cylinder(x, y, r, z, h, P, 40, .25), { tone, lit, inner }),
      A.cylinder(x, y, r, z, h), meta);
  };
  const roller = (id, x, y, z, length, radius) => {
    const F = G.frameAlong([x, y, z], [1, 0, 0]);
    const profile = [[0, radius], [length, radius]];
    put(id, [x + length / 2, y, z], k.solidSvg(G.solidOf(profile, F, P), { tone: 'hi' }), A.solid(F, profile));
  };
  const rules = (x, y, w, z, rows = 3) => Array.from({ length: rows }, (_, i) =>
    k.lineSvg(k.lineOnTop([x, y + i * 3], [x + w * (i === rows - 1 ? .62 : 1), y + i * 3], z, P), { tone: 'lo', free: true })).join('');
  const paper = (id, x, y, w, d, z, { lit = false, envelope = false } = {}) => {
    const inner = envelope
      ? k.lineSvg(k.onTop([[x + .35, y], [x + w / 2, y + d * .6], [x + w - .35, y]], z + .65, P), { tone: lit ? 'blue' : 'lo' })
      : rules(x + 3, y + 4, w - 6, z + .65, 3);
    slab(id, x, y, w, d, z, .65, { r: .35, tone: lit ? 'blue' : 'lo', lit, inner });
  };
  const screws = (x, y, w, d, z) => {
    // Screw heads are recessed engravings on a solid surface, not floating solids.
    return k.lineSvg(k.corners({ x, y, w, d, r: 0 }, 4).map(([a, b]) => k.ring(a, b, .85, z, P, 12)).join(''), { tone: 'mid' });
  };
  const deck = (id, x, y, w, d) => {
    for (const [a, b] of k.corners({ x, y, w, d, r: 4 }, 15)) {
      slab(`${id}-foot`, a - 5, b - 5, 10, 10, -13, 6, { r: 2, tone: 'lo', ground: true });
    }
    const plan = { x, y, w, d, r: 7 };
    const inner = k.lineSvg(k.planOutline(k.insetPlan(plan, 5), 0, P, 5), { tone: 'faint' }) + screws(x, y, w, d, .01);
    slab(id, x, y, w, d, -7, 7, { r: 7, tone: 'lo', inner });
  };
  const rail = (from, to, y, ends = 'both') => {
    [from + 10, (from + to) / 2, to - 10].forEach((x) => slab('rail-mount', x - 4, y - 8, 8, 22, 0, 3, { tone: 'lo' }));
    [y - 4, y + 8].forEach((ry) => slab('travel-rail', from, ry, to - from, 3, 3, 3, { r: .6, tone: 'mid' }));
    [...(ends !== 'end' ? [from - 3] : []), ...(ends !== 'start' ? [to] : [])].forEach((x) => slab('rail-stop', x, y - 7, 3, 20, 3, 7, { tone: 'mid' }));
  };
  const machine = (id, x, y, w, d, h, options = {}) => {
    slab(`${id}-chassis`, x, y, w, d, 0, h, { r: 3, seam: h - 5, ...options });
    slab(`${id}-lid`, x + 2, y + 2, w - 4, d - 4, h, 2, { r: 2, tone: 'hi', inner: screws(x + 2, y + 2, w - 4, d - 4, h + 2) });
  };
  const slot = (id, x, y, w, d, z) => slab(id, x, y, w, d, z, .8, { r: .4, tone: 'lo' });
  const finish = (stops, subject = 'envelope') => {
    const [sx, sy, sz] = stops[0];
    const cardPlan = { x: sx - 12, y: sy - 10, w: 24, d: 20, r: 1 };
    // The document is a real solid resting on the rail; record its complete shape.
    const packet = k.solidSvg(k.slabOf(cardPlan, sz, 2, P, 4, .4), { lit: true, tone: 'blue', className: 'sample-paper',
      inner: subject === 'reference'
        ? rules(sx - 8, sy - 5, 16, sz + 2, 3)
        : k.lineSvg(k.onTop([[sx - 11, sy - 10], [sx, sy + 2], [sx + 11, sy - 10]], sz + 2, P), { tone: 'blue' }) });
    const origin = at(stops[0]);
    const offsets = stops.map((p) => { const q = at(p); return [q[0] - origin[0], q[1] - origin[1]]; });
    const subjectName = subject === 'reference' ? 'reference-coupon' : 'sample-envelope';
    R.put({ name: `${name}.${subjectName}`, piece: 'packet', move: [stops.at(-1)[0] - sx, 0, 0], at: [sx, sy, sz + 1],
      svg: `<g data-packet="" data-stops='${JSON.stringify(offsets)}'>${packet}</g>`,
      shapes: [R.solid(A.slab(cardPlan, sz, 2, { name: `${name}.${subjectName}` }, 4))] });
    count++;
    A.settle(R, P);
    R.items.sort((a, b) => a.key - b.key);
    A.auditOrExit(R, P);
    let svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label, standalone: 'light',
      body: `<style>${BRAND_CSS}</style>${R.items.map((item) => item.svg).join('')}` });
    const subjectDescription = subject === 'reference'
      ? 'The cobalt coupon follows an illustrative technical reference. It is not a document, approval, communication or live telemetry.'
      : 'The small cobalt envelope marks an illustrative document, not a live operation.';
    svg = svg.replace('role="img"', `role="img" data-diagram="${name}"`).replace('</svg>', `<desc>${label} ${subjectDescription}</desc></svg>`);
    writeFileSync(`${OUTPUT}/${name}.svg`, svg);
    console.log(`${name}: ${count} measured solid parts, ${stops.length} document positions`);
    return { name, parts: count, stops: offsets };
  };
  return { P, R, slab, cylinder, roller, paper, rules, deck, rail, machine, slot, screws, station: (value) => { station = value; }, finish };
}

function system() {
  const s = scene('system-architecture', [[-186, -84, -13], [186, 96, 0], [-120, -40, 70]],
    'A routing bench on two separate bases. The larger Cloudflare bench contains a Workers control chassis, D1 ledger drawers, a private R2 archive, a private validation gate and queue magazine. Across an open gap, external Telnyx fax, Pingen print and post, and Resend email machines receive authorized provider submissions.');
  const { slab, cylinder, paper, deck, machine, rail, slot } = s;
  s.station(-1); deck('cloudflare-deck', -184, -80, 211, 172); deck('provider-deck', 59, -80, 125, 172);
  s.station(0); machine('workers', -164, -58, 63, 49, 25);
  slot('control-window', -154, -47, 43, 24, 27);
  for (let i = 0; i < 3; i++) { cylinder('control-lamp', -151 + i * 9, -17, 1.7, 27, 1.4, { tone: i ? 'mid' : 'blue', lit: !i }); slot('vent', -158 + i * 12, -52, 8, 2, 27); }
  s.station(1); machine('d1-ledger', -88, -60, 43, 43, 35);
  for (let i = 0; i < 3; i++) { slab('ledger-drawer', -86, -17, 39, 1.5, 3 + i * 10, 8, { r: .5, tone: 'hi' }); slab('ledger-handle', -75, -15.5, 17, 2, 6 + i * 10, 2, { r: .5 }); }
  machine('r2-vault', -35, -62, 43, 45, 42);
  slot('archive-lock', -18, -45, 9, 11, 44); cylinder('archive-key', -13.5, -39.5, 2.2, 44.8, 2);
  for (const x of [-31, 1]) slab('archive-hinge', x, -61, 4, 9, 44, 1.3);
  s.station(2); slab('validation-bed', -157, 7, 69, 38, 0, 5, { r: 3 });
  for (const x of [-154, -97]) slab('validation-post', x, 12, 5, 25, 5, 27, { r: 1 });
  slab('validation-crosshead', -154, 12, 62, 25, 32, 5, { r: 1.5, tone: 'hi' });
  paper('inspection-sheet', -140, 14, 26, 25, 5);
  slab('queue-bed', -69, 3, 62, 42, 0, 5, { r: 2 });
  for (const x of [-66, -15]) slab('queue-guide', x, 5, 5, 37, 5, 13, { r: .6 });
  for (let i = 0; i < 3; i++) paper('queued-card', -58, 8 + i * 6, 34, 20, 5 + i * .65);
  s.station(3); machine('telnyx-fax', 78, -65, 84, 35, 24);
  slab('fax-input-tray', 83, -62, 28, 24, 26, 1.2, { r: .5 }); paper('fax-page', 85, -60, 24, 20, 27.2);
  cylinder('fax-control-dial', 148, -48, 6, 26, 3);
  for (let i = 0; i < 3; i++) slot('fax-key', 122 + i * 6, -40, 3.5, 3, 26);
  machine('pingen-printer', 78, -13, 84, 35, 22);
  slab('printer-input-tray', 83, -10, 25, 24, 24, 1, { r: .5 }); paper('print-page', 85, -8, 21, 20, 25);
  slab('printer-mouth', 116, -6, 38, 17, 24, 1.2, { tone: 'lo' });
  paper('postal-envelope', 120, -3, 28, 12, 25.2, { envelope: true });
  machine('resend-terminal', 78, 27, 84, 29, 20);
  slot('email-display', 86, 32, 42, 18, 22);
  paper('email-envelope', 90, 35, 33, 12, 22.8, { envelope: true });
  for (const x of [137, 145, 153]) cylinder('email-lamp', x, 41, 1.8, 22, 1.2);
  s.station(-1); rail(-168, 10, 68, 'start'); rail(72, 171, 68, 'end');
  return s.finish([[-145, 72, 6], [-78, 72, 6], [-10, 72, 6], [121, 72, 6]]);
}

function dispatch() {
  const s = scene('dispatch-lifecycle', [[-188, -70, -13], [188, 90, 0], [-80, -25, 85]],
    'An acceptance interlock. A separate approval plate clamps a prepared document. One crossbar couples quota reservation and outbox insertion in D1. A queue magazine leads to provider handoff. A separate stopped tray holds submission_unknown for reconciliation, with no automatic retry. Provider acceptance is distinct from delivery.');
  const { slab, cylinder, paper, deck, rail, machine, roller } = s;
  s.station(-1); deck('acceptance-deck', -184, -67, 368, 154); rail(-169, 168, 62);
  s.station(0); slab('prepared-tray', -168, -41, 52, 67, 0, 5, { r: 3 });
  for (const x of [-166, -121]) slab('tray-wall', x, -39, 5, 63, 5, 4, { r: .7 });
  for (let i = 0; i < 3; i++) paper('prepared-page', -157 + i, -30 + i, 30, 41, 5 + i * .8);
  s.station(1); slab('approval-bed', -103, -42, 57, 67, 0, 6, { r: 3 });
  for (const x of [-100, -54]) slab('review-post', x, -35, 5, 52, 6, 41, { r: 1 });
  slab('review-crosshead', -100, -35, 51, 52, 47, 5, { r: 1.5, tone: 'hi' });
  cylinder('approval-seal', -74, -9, 11, 52, 7, { tone: 'hi' });
  cylinder('seal-knob', -74, -9, 6, 59, 6, { tone: 'mid' });
  paper('immutable-approval-record', -91, -25, 32, 36, 6);
  for (const x of [-95, -61]) slab('clamp-shoe', x, -29, 7, 40, 6.65, 3, { r: .6 });
  s.station(2); machine('atomic-d1', -29, -45, 69, 65, 35);
  for (const x of [-25, 10]) { slab('transaction-drawer', x, 20, 29, 2, 5, 23, { r: .5, tone: 'hi' }); slab('drawer-handle', x + 8, 22, 13, 3, 16, 3, { r: .5 }); }
  slab('atomic-coupling', -24, 22, 62, 4, 19, 3, { r: .8, tone: 'hi' });
  for (const x of [-19, 31]) cylinder('coupling-boss', x, 24, 2, 22, 2);
  paper('transaction-record', -19, -32, 48, 37, 37);
  s.station(3); slab('queue-bed', 55, -42, 49, 63, 0, 6, { r: 2 });
  for (const x of [57, 98]) slab('magazine-guide', x, -39, 4, 56, 6, 14, { r: .7 });
  for (let i = 0; i < 4; i++) paper('outbox-card', 64, -34 + i * 8, 27, 21, 6 + i * .65);
  s.station(4); slab('handoff-bed', 119, -43, 48, 63, 0, 6, { r: 2 });
  for (const x of [122, 157]) slab('roller-bearing', x, -20, 7, 14, 6, 16, { r: 1 });
  roller('handoff-roller', 129, -13, 16, 28, 4);
  slab('provider-output-tray', 126, -1, 35, 19, 6, 1, { r: .7 }); paper('accepted-envelope', 130, 1, 27, 14, 7, { envelope: true });
  s.station(5); slab('unknown-tray', 56, -64, 111, 17, 0, 5, { r: 1.5 });
  for (const x of [56, 163]) slab('unknown-tray-stop', x, -64, 4, 17, 5, 6, { r: .6 });
  paper('held-outcome-card', 111, -62, 28, 12, 5, { envelope: true });
  slab('stop-semaphore', 71, -61, 4, 11, 5, 25, { r: .6, tone: 'hi' });
  slab('semaphore-cap', 66, -61, 14, 11, 30, 7, { r: 1, tone: 'hi' });
  return s.finish([[-142, 66, 6], [-74, 66, 6], [4, 66, 6], [79, 66, 6], [143, 66, 6], [143, 66, 6]]);
}

function documents() {
  const s = scene('document-pipeline', [[-188, -70, -13], [188, 88, 0], [30, -12, 95]],
    'A document workshop. A sealed original archive is separate from source-data cards and a mapping comb. A versioned template plate feeds a generation press. Its output is a new derived PDF with provenance, inspected before any later approval and dispatch. The original bytes are never overwritten.');
  const { slab, cylinder, paper, deck, rail, machine, roller, slot } = s;
  s.station(-1); deck('document-deck', -184, -67, 368, 154); rail(-169, 168, 62);
  s.station(0); machine('original-archive', -168, -47, 57, 63, 45);
  for (const x of [-163, -120]) slab('archive-hinge', x, -46, 4, 12, 47, 1.2);
  paper('original-sleeve', -155, -31, 31, 31, 47);
  slab('retention-clip', -144, -31, 10, 5, 47.65, 2, { r: .6, tone: 'hi' });
  s.station(1); slab('source-card-holder', -96, -45, 62, 64, 0, 5, { r: 2 });
  for (const x of [-94, -40]) slab('source-guide', x, -43, 4, 31, 5, 10, { r: .6 });
  for (let i = 0; i < 3; i++) paper('source-data-card', -86, -40 + i * 7, 37, 19, 5 + i * .65);
  slab('mapping-bed', -91, -4, 52, 19, 5, 2, { r: 1 });
  for (let i = 0; i < 4; i++) slab('mapping-tooth', -86 + i * 12, -3, 4, 16, 7, 6, { r: .6 });
  slab('profile-slider', -89, 6, 49, 6, 13, 2, { r: .7 });
  cylinder('profile-knob', -65, 9, 3, 15, 3);
  s.station(2); slab('template-holder', -19, -45, 49, 63, 0, 7, { r: 2 });
  for (let i = 0; i < 2; i++) paper('versioned-template', -13 + i * 3, -38 + i * 4, 33, 43, 7 + i * .65);
  for (const x of [-15, 22]) cylinder('registration-pin', x, -39, 2, 7, 8);
  s.station(3); slab('generation-bed', 45, -43, 62, 63, 0, 7, { r: 3 });
  for (const x of [48, 99]) slab('press-post', x, -36, 5, 47, 7, 49, { r: 1 });
  slab('press-crosshead', 48, -36, 56, 47, 56, 6, { r: 2, tone: 'hi' });
  for (const x of [53, 91]) slab('press-bearing', x, -30, 8, 29, 7, 22, { r: 1 });
  roller('printing-roller', 61, -16, 20, 30, 5);
  for (const x of [61, 89]) cylinder('pressure-cap', x, -15, 3, 62, 4);
  paper('generation-page', 64, -11, 24, 23, 7);
  s.station(4); slab('derived-output-tray', 121, -43, 47, 63, 0, 5, { r: 2 });
  for (const x of [123, 162]) slab('output-guide', x, -40, 4, 54, 5, 5, { r: .5 });
  for (let i = 0; i < 3; i++) paper('derived-pdf', 130 + i, -34 + i * 2, 27, 34, 5 + i * .65);
  slab('provenance-tab', 137, -7, 17, 10, 6.95, .8, { r: .4, tone: 'hi' });
  s.station(5); slab('inspection-stand', 122, -61, 45, 12, 0, 27, { r: 1.5 });
  slot('inspection-window', 128, -59, 33, 8, 27);
  for (let i = 0; i < 3; i++) slot('inspection-slot', 132 + i * 8, -57, 4, 4, 27.8);
  return s.finish([[-141, 66, 6], [-65, 66, 6], [5, 66, 6], [76, 66, 6], [144, 66, 6], [145, 66, 6]]);
}

function freshness() {
  const s = scene('provider-freshness', [[-188, -76, -13], [188, 90, 0], [80, -35, 66]],
    'A calibration bench selects only a reference used by an active mechanism. A press checks genuine source evidence, a ledger retains immutable revisions, a timer and bell mark the final twenty-four hours, and an interlock stops the affected operation at expiry. An automatic refresh never renews human authority.');
  const { slab, cylinder, paper, deck, rail, machine, slot, rules, screws, P } = s;
  s.station(-1); deck('calibration-deck', -184, -72, 368, 160); rail(-170, 165, 64);
  const strip = { x: -164, y: 79, w: 318, d: 5, r: .5 };
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + .4, .7, [2, 3.6], P);
  slab('deadline-ruler', strip.x, strip.y, strip.w, strip.d, 0, .7, { r: .5, tone: 'lo',
    inner: k.lineSvg(ticks.minor, { tone: 'lo' }) + k.lineSvg(ticks.major, { tone: 'mid' }) });

  s.station(0); machine('active-selector', -165, -55, 54, 56, 17);
  cylinder('selector-shaft', -139, -28, 3, 19, 4);
  cylinder('selector-knob', -139, -28, 8, 23, 5, { tone: 'hi',
    inner: k.lineSvg(k.knurl(-139, -28, 8, 23, 28, 32, P), { tone: 'lo' }) });
  for (const x of [-155, -121]) slab('selector-stop', x, -31, 3, 6, 19, 4, { r: .5 });
  slab('selector-label', -158, -48, 40, 9, 19, .6, { tone: 'lo', inner: rules(-154, -46, 31, 19.6, 2) });
  slab('inactive-holder', -163, 10, 49, 33, 0, 4, { r: 2 });
  for (const x of [-162, -119]) slab('source-guide', x, 13, 4, 27, 4, 7, { r: .5 });
  for (let i = 0; i < 3; i++) paper('unused-reference', -154, 15 + i * 3, 27, 18, 4 + i * .65);

  s.station(1); slab('inspection-bed', -96, -51, 54, 72, 0, 5, { r: 2 });
  for (const x of [-93, -50]) slab('inspection-upright', x, -45, 5, 48, 5, 29, { r: 1 });
  slab('inspection-crosshead', -93, -45, 48, 48, 34, 5, { r: 1.5, tone: 'hi', inner: screws(-93, -45, 48, 48, 39) });
  slab('inspection-service-cover', -86, -38, 34, 34, 39, .6, { r: .8, tone: 'lo', inner: screws(-86, -38, 34, 34, 39.6) });
  cylinder('inspection-calibration-crown', -69, -21, 5, 39.6, 4, { tone: 'hi',
    inner: k.lineSvg(k.knurl(-69, -21, 5, 39.6, 43.6, 24, P), { tone: 'lo' }) });
  for (const x of [-88, -58]) slab('inspection-bearing', x, -16, 8, 17, 5, 8, { r: .8 });
  cylinder('inspection-plunger', -69, -20, 2, 17, 17);
  slab('inspection-shoe', -80, -31, 22, 22, 13, 4, { r: 1, tone: 'hi' });
  paper('inspected-reference', -80, -31, 22, 22, 5);

  s.station(2); machine('revision-ledger', -24, -53, 54, 58, 36);
  for (let i = 0; i < 3; i++) {
    slab('revision-drawer', -21, 5, 48, 1.6, 3 + i * 10, 8, { r: .6, tone: 'hi' });
    slab('revision-handle', -7, 6.6, 20, 2, 6 + i * 10, 2, { r: .4 });
  }

  s.station(3); slab('timer-plinth', 47, -50, 52, 59, 0, 7, { r: 3 });
  cylinder('timer-housing', 73, -27, 21, 7, 10, { tone: 'hi' });
  const dial = k.lineSvg(k.ring(73, -27, 18.5, 17.6, P, 64), { tone: 'lo' });
  const scale = k.radialTicks(73, -27, 17.5, 24, 6, 17.6, [1.3, 2.5], P);
  const needle = k.lineSvg(k.lineOnTop([73, -27], [61, -31], 17.7, P), { tone: 'hi', free: true });
  cylinder('timer-face', 73, -27, 18.5, 17, .6, { tone: 'lo', inner: dial + k.lineSvg(scale.minor, { tone: 'lo' }) + k.lineSvg(scale.major, { tone: 'mid' }) + needle });
  cylinder('timer-pivot', 73, -27, 1.5, 17.6, .8, { tone: 'hi' });
  cylinder('timer-crown', 73, -27, 4, 18.4, 3, { tone: 'hi' });
  slab('warning-pedestal', 57, 20, 32, 23, 0, 5, { r: 2 });
  cylinder('warning-stem', 73, 31.5, 2.5, 5, 13);
  cylinder('warning-bell', 73, 31.5, 10, 18, 7, { tone: 'hi' });
  cylinder('warning-cap', 73, 31.5, 3, 25, 2, { tone: 'mid' });

  s.station(4); slab('interlock-bed', 117, -53, 52, 73, 0, 6, { r: 2 });
  for (const x of [120, 161]) slab('interlock-upright', x, -47, 5, 57, 6, 39, { r: 1 });
  slab('interlock-crosshead', 120, -47, 46, 57, 45, 6, { r: 1.5, tone: 'hi', inner: screws(120, -47, 46, 57, 51) });
  cylinder('interlock-lock-crown', 143, -17, 6, 51, 5, { tone: 'hi',
    inner: k.lineSvg(k.knurl(143, -17, 6, 51, 56, 28, P), { tone: 'lo' }) });
  slab('interlock-label', 129, -40, 28, 9, 51, .6, { tone: 'lo', inner: rules(133, -38, 20, 51.6, 2) });
  slab('interlock-shoe', 132, -30, 22, 22, 6, 15, { r: 1, tone: 'hi' });
  slot('interlock-stop', 132, -4, 22, 10, 6);
  return s.finish([[-140, 68, 6], [-69, 68, 6], [3, 68, 6], [73, 68, 6], [143, 68, 6]], 'reference');
}

const manifest = [system(), dispatch(), documents(), freshness()];
writeFileSync(`${OUTPUT}/anatomy-manifest.json`, `${JSON.stringify({ upstream: '1482e8469b0a9e0d8cc18ea2740a01423d29ae80', figures: manifest }, null, 2)}\n`);
