#!/usr/bin/env node
// Bundle-size budget for the landing page. After a build, this sums the GZIPPED bytes the home
// route eagerly downloads — the entry <script>, its <link rel="modulepreload">s, and the
// stylesheets linked in dist/index.html — and exits non-zero if the total exceeds the budget.
//
// It is the byte-creep backstop that complements tests/eager-bundle.test.ts: that test guards the
// STRUCTURAL invariant (the catalog / block registry / provider adapters must stay lazy); this
// guards against gradual growth of whatever legitimately ships on the landing. Raise
// BUDGET_GZIP_KB deliberately, with a note, when the landing is meant to grow.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const INDEX = resolve(DIST, 'index.html');
// Eager JS+CSS the landing downloads on first paint. Catalog/block-registry/provider adapters stay
// lazy (confirmed: no createMeta/RAW_CATALOG strings in the eager chunk); the block-fixture corpus
// (data/topics, reached only by the lazy gallery/select chunks) and the baked demo shards
// (demo/corpus, one lazy chunk per persona) are deliberately OUTSIDE this budget. What remains
// eager is the FlagshipHost shell + flagship landing + shared styles. The budget trips if a heavy
// module (≈70 kB catalog, ≈220 kB registry, a corpus) accidentally becomes eager again.
// Tightened after the old scripted-demo surface (App.tsx + its engine + the eager voice stack)
// was deleted and route-owned CSS was split out: measured ~102 kB gzip. The requested product gate
// is 110 kB; growth above that is a deliberate decision.
const BUDGET_GZIP_KB = 110;
// Brotli is the preferred public-CDN representation; raw bytes bound parse/compile work on weak
// devices even when the transfer is compressed. All three budgets must stay green.
const BUDGET_BROTLI_KB = 100;
const BUDGET_RAW_KB = 500;

// Known feature-only chunks. Vite's generic 500 kB warning measures raw bytes and therefore
// overstates highly compressible grammars while saying nothing about transfer regressions. Keep
// the warning visible, but enforce raw + gzip + Brotli ceilings on the actual heavy features too.
// Each is behind an audited dynamic boundary; a missing match means chunking changed and must be
// reviewed instead of silently dropping the gate.
const LAZY_BUDGETS = [
  { label: 'PDF worker', match: /^pdf\.worker\.min-.*\.mjs$/, raw: 1400, gzip: 410, brotli: 335 },
  { label: 'chemistry renderer', match: /^openchemlib-.*\.js$/, raw: 1125, gzip: 350, brotli: 285 },
  {
    label: 'visual gallery + demos',
    match: /^GalleryApp-.*\.js$/,
    raw: 760,
    gzip: 255,
    brotli: 210,
  },
  {
    label: 'Prism tour corpus',
    match: /^prism\.generated-.*\.js$/,
    raw: 480,
    gzip: 225,
    brotli: 215,
  },
  {
    label: 'first-turn engine + examples',
    match: /^generateLive-.*\.js$/,
    raw: 430,
    gzip: 165,
    brotli: 140,
  },
  { label: 'Live surface', match: /^LiveApp-.*\.js$/, raw: 450, gzip: 150, brotli: 125 },
  {
    label: 'reel alternate finishes (on Remix)',
    match: /^alternateFinishes-.*\.js$/,
    raw: 200,
    gzip: 45,
    brotli: 40,
  },
  // Mediabunny's ESM entry is named src.js upstream. This budget locks the explicit-export
  // tree-shaking improvement in clip/capture.ts (the former whole namespace was ~627 kB raw).
  // The MP4 muxer (Mp4OutputFormat, for approved AV1+Opus exports) is a deliberate
  // +7 kB raw on top of the WebM-only 210 kB floor; the chunk stays export-time lazy.
  { label: 'reel encoder', match: /^src-.*\.js$/, raw: 225, gzip: 58, brotli: 52 },
];

if (!existsSync(INDEX)) {
  console.error('dist/index.html not found — run `pnpm build` (or `vite build`) first.');
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');
// The eager set: the entry <script src>, every <link rel="modulepreload">, and every stylesheet.
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const eager = [...new Set(refs)];

let totalRaw = 0;
let totalGzip = 0;
let totalBrotli = 0;
const rows = [];
for (const ref of eager) {
  const file = resolve(DIST, `.${ref}`);
  if (!existsSync(file)) continue;
  const content = readFileSync(file);
  const raw = content.length;
  const gzip = gzipSync(content).length;
  const brotli = brotliCompressSync(content, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  totalRaw += raw;
  totalGzip += gzip;
  totalBrotli += brotli;
  rows.push({ ref, raw, gzip, brotli });
}
rows.sort((a, b) => b.gzip - a.gzip);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log('Eager landing payload (raw / gzip / brotli):');
for (const row of rows) {
  console.log(
    `  ${kb(row.raw).padStart(10)}  ${kb(row.gzip).padStart(10)}  ${kb(row.brotli).padStart(10)}  ${row.ref}`,
  );
}
console.log(`  ${'—'.repeat(10)}`);
console.log(
  `  ${kb(totalRaw).padStart(10)}  ${kb(totalGzip).padStart(10)}  ${kb(totalBrotli).padStart(10)}  TOTAL`,
);
console.log(
  `  budgets: raw ${BUDGET_RAW_KB} kB · gzip ${BUDGET_GZIP_KB} kB · brotli ${BUDGET_BROTLI_KB} kB`,
);

const failures = [
  ['raw', totalRaw, BUDGET_RAW_KB],
  ['gzip', totalGzip, BUDGET_GZIP_KB],
  ['brotli', totalBrotli, BUDGET_BROTLI_KB],
].filter(([, bytes, budget]) => bytes > budget * 1024);
if (failures.length) {
  for (const [kind, bytes, budget] of failures) {
    console.error(`\n✖ Landing ${kind} payload ${kb(bytes)} exceeds the ${budget} kB budget.`);
  }
  console.error(
    '  If this growth is intentional, raise the affected budget with a note. Otherwise a',
  );
  console.error('  heavy module likely became eager — check tests/eager-bundle.test.ts for which.');
  process.exit(1);
}
console.log('\n✓ Within budget.');

console.log('\nFeature-scoped lazy payloads (raw / gzip / brotli):');
const assetNames = readdirSync(resolve(DIST, 'assets'));
let lazyFailed = false;
for (const budget of LAZY_BUDGETS) {
  const name = assetNames.find((candidate) => budget.match.test(candidate));
  if (!name) {
    console.error(`  ✖ ${budget.label}: expected chunk not found (${budget.match})`);
    lazyFailed = true;
    continue;
  }
  const content = readFileSync(resolve(DIST, 'assets', name));
  const sizes = {
    raw: content.length,
    gzip: gzipSync(content).length,
    brotli: brotliCompressSync(content, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
  console.log(
    `  ${kb(sizes.raw).padStart(10)}  ${kb(sizes.gzip).padStart(10)}  ${kb(sizes.brotli).padStart(10)}  ${budget.label}`,
  );
  for (const kind of ['raw', 'gzip', 'brotli']) {
    if (sizes[kind] > budget[kind] * 1024) {
      console.error(
        `  ✖ ${budget.label} ${kind} payload ${kb(sizes[kind])} exceeds ${budget[kind]} kB`,
      );
      lazyFailed = true;
    }
  }
}
if (lazyFailed) process.exit(1);
console.log('\n✓ Feature-scoped payloads are within budget.');

// Static closures for the public priority surfaces. Multiple roots model UI that mounts a second
// boundary immediately (Ripple overview) or necessarily loads it for cached content (lesson canvas).
const ROUTE_BUDGETS = [
  // The shared feature icon catalog is intentionally no longer charged to every landing visit.
  // Courses now pays that 2.6 kB only when opened; its landing + route total is still smaller.
  // 23 (was 21): two deliberate costs landed together — the topic/level pickers moved onto the
  // shared DropSelect menu (~1 kB for picker consistency), and the shared reveal hook grew an
  // arrival guarantee (scroll-settle/visibility fallbacks) that every deferred surface funds
  // (~0.7 kB here). Each alone fit in 22; the route now carries both.
  // 24 (was 23): the answer-shaping prompts this route's engine closure carries grew on purpose —
  // the continuity hint, the search date anchor, and the In-depth explanation level are product
  // behavior, not padding, and prompt text is the one payload that can't move to a lazy chunk.
  // 25 (was 24): the build sheet became escapable — Escape and the scrim now abort the in-flight
  // syllabus call rather than trapping the user for the ~90s it can take — and the checkpoint cache
  // gained a peek that does NOT touch the LRU, so a graded quiz answer stops rewriting the whole
  // cache to localStorage per cached lesson. Both are correctness, and the second is a net win at
  // runtime; neither can move to a lazy chunk because the route's own shell needs them.
  { label: 'Courses home', roots: ['src/live/course/CoursesApp.tsx'], gzip: 25 },
  {
    label: 'Cached course lesson',
    roots: ['src/live/course/CourseLessonReader.tsx', 'src/canvas/TopicCanvas.tsx'],
    gzip: 140,
  },
  { label: 'Prism intake', roots: ['src/live/prism/PrismApp.tsx'], gzip: 25 },
  {
    label: 'Ripple overview',
    // The seed is deferred from the route shell but is still part of every first overview.
    roots: [
      'src/live/ripple/RippleApp.tsx',
      'src/live/ripple/seed.ts',
      'src/live/ripple/RippleOverlay.tsx',
    ],
    gzip: 55,
  },
  // 47 (was 45): Video Studio adds its Conversation/Reel tabs and lazy conversation handoff, plus
  // the approved-codec capability gate and mandatory-audio failure path. The 1080p stage,
  // timeline, audio preparation, and encoder remain in their deferred chunks.
  { label: 'Reel first preview', roots: ['src/clip/ShareModal.tsx'], gzip: 47 },
  { label: 'Gallery', roots: ['src/gallery/GalleryApp.tsx'], gzip: 130 },
];

const manifestPath = resolve(DIST, '.vite/manifest.json');
if (!existsSync(manifestPath)) {
  console.error('\n✖ Build manifest missing — route budgets require `build.manifest: true`.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const eagerFiles = new Set(eager.map((ref) => ref.replace(/^\/assets\//, 'assets/')));

function closureFor(roots) {
  const seenEntries = new Set();
  const files = new Set();
  const visit = (key) => {
    if (!key || seenEntries.has(key)) return;
    seenEntries.add(key);
    const entry = manifest[key];
    if (!entry) return;
    if (entry.file && !eagerFiles.has(entry.file)) files.add(entry.file);
    for (const css of entry.css ?? []) if (!eagerFiles.has(css)) files.add(css);
    for (const imported of entry.imports ?? []) visit(imported);
  };
  for (const root of roots) {
    const name = root
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '');
    // Rolldown can promote a shared dynamic module to a named synthetic chunk (for example
    // `_TopicCanvas-*.js`). Those entries retain `name` but not the original `src`, so resolve
    // both forms; otherwise a chunking improvement accidentally disables the route budget.
    const key = Object.keys(manifest).find(
      (candidate) =>
        candidate.endsWith(root) ||
        manifest[candidate]?.src === root ||
        (!!name && manifest[candidate]?.name === name),
    );
    if (!key) throw new Error(`manifest entry not found for ${root}`);
    visit(key);
  }
  return files;
}

console.log('\nPriority route incremental payloads (gzip):');
let routeFailed = false;
for (const budget of ROUTE_BUDGETS) {
  let files;
  try {
    files = closureFor(budget.roots);
  } catch (error) {
    console.error(`  ✖ ${budget.label}: ${error instanceof Error ? error.message : error}`);
    routeFailed = true;
    continue;
  }
  const gzip = [...files].reduce(
    (total, file) => total + gzipSync(readFileSync(resolve(DIST, file))).length,
    0,
  );
  console.log(`  ${kb(gzip).padStart(10)}  ${budget.label} (budget ${budget.gzip} kB)`);
  if (gzip > budget.gzip * 1024) {
    console.error(`  ✖ ${budget.label} exceeds its ${budget.gzip} kB gzip budget.`);
    routeFailed = true;
  }
}
if (routeFailed) process.exit(1);
console.log('\n✓ Priority route payloads are within budget.');
