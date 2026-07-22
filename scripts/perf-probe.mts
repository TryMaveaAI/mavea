// perf-probe.mts — does Mavéa still work on a slow machine?
//
// Every performance number a developer sees is measured on a developer's laptop, which is the one
// machine that never has the problem. This drives the real app under CDP CPU throttling (6x is a
// budget laptop from a few years ago; 4x a mid-range one), and reports the numbers a person
// actually feels: when the first pixel lands, how long the main thread is blocked, and whether the
// heavy assets (the voice model, the WASM, the block library) are being pulled down before anyone
// asked for them.
//
// Measure the SHIPPED artifact, not the dev server. The probe emulates a slow connection, and an
// unbundled dev server answers hundreds of separate module requests under that emulation — every
// surface then misses its budget while doing no actual work. The eager-asset check also matches
// built chunk names. So build first and serve it with the real CLI:
//   pnpm build && pnpm preview
//   pnpm perf -- --url http://localhost:4173
//   pnpm perf -- --url http://localhost:4173 --throttle 4
import { chromium, type Page, type CDPSession } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance.js';

interface Scenario {
  name: string;
  path: string;
  /** Wait for this to exist before calling the surface "there". */
  ready: string;
  budgetMs: number;
  /** Heavy assets this surface genuinely needs (as opposed to an accidental eager fetch). */
  allowedHeavy?: RegExp;
}

const COLD_SHELL_BUDGET_MS = 2000;

const SCENARIOS: Scenario[] = [
  { name: 'landing', path: '/', ready: '.fl-hero, .flagship', budgetMs: COLD_SHELL_BUDGET_MS },
  {
    name: 'live (welcome)',
    path: '/#/live',
    // The demo landing also uses `.live-voice`; only the dedicated Live surface owns the rail.
    // Keep this selector surface-specific so the warm probe proves Live really mounted/unmounted.
    ready: '.mavea-app.with-rail',
    budgetMs: COLD_SHELL_BUDGET_MS,
  },
  {
    name: 'gallery',
    path: '/#/gallery',
    ready: '.vlib-tile',
    budgetMs: COLD_SHELL_BUDGET_MS,
    // Gallery renders the real component catalog. Its topics chunk is requested functionality,
    // not landing-page eagerness; every other surface must still leave it alone until needed.
    allowedHeavy: /topics-[a-z0-9]+\.js/i,
  },
  {
    name: 'dashboards',
    path: '/#/dashboards',
    ready: '.dash-topbar, .dash-home',
    budgetMs: COLD_SHELL_BUDGET_MS,
  },
  { name: 'flashcards', path: '/#/flashcards', ready: '.fc-nav', budgetMs: COLD_SHELL_BUDGET_MS },
  { name: 'courses', path: '/#/courses', ready: '.cr-nav', budgetMs: COLD_SHELL_BUDGET_MS },
  { name: 'prism', path: '/#/prism', ready: '.prism-app', budgetMs: COLD_SHELL_BUDGET_MS },
  { name: 'synthesis', path: '/#/synthesis', ready: '.prism-app', budgetMs: COLD_SHELL_BUDGET_MS },
  { name: 'deepzoom', path: '/#/deepzoom', ready: '.dz-topbar', budgetMs: COLD_SHELL_BUDGET_MS },
  { name: 'ripple', path: '/#/ripple', ready: '.ripple-panel', budgetMs: COLD_SHELL_BUDGET_MS },
];

/** Assets nobody should be paying for before they ask: the voice model, its WASM runtime, the
 *  on-device embedder, speech, and the block library itself. */
// Match the ASSETS, not the modules that reference them. VadVoice.ts is a small source file that
// merely knows how to load the voice model; the thing nobody should be paying for up front is the
// model itself — the ONNX weights, the WASM runtime, the embedder matrix, the block library chunk.
const EAGER_FORBIDDEN =
  /\.onnx|ort-wasm.*\.wasm|silero.*\.onnx|\/semantic\/(index\.json|matrix\.i8|vocab\.txt)|ricky0123|topics-[a-z0-9]+\.js|katex.*\.(js|css)|leaflet.*\.js|jspdf.*\.js/i;

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

/** Every connected-feature surface sits behind the one-time legal acknowledgement, so a fresh
 *  browser context renders the gate instead of the surface and the ready selector never appears.
 *  These budgets describe a returning user reaching a surface, not a first-run consent screen —
 *  seed the acceptance the same way accepting it once would, before any script on the page runs. */
const SEED_LEGAL_ACCEPTANCE = `
  try {
    localStorage.setItem(${JSON.stringify(LEGAL_ACCEPTANCE_STORAGE_KEY)}, JSON.stringify({
      version: ${JSON.stringify(LEGAL_ACCEPTANCE_VERSION)},
      acceptedAt: new Date(0).toISOString(),
    }));
  } catch { /* a context without storage still measures the landing route */ }
`;

/** Long tasks are what a stutter actually is: the main thread held for >50ms, unable to answer a click. */
const OBSERVE = `
  window.__perf = { long: [], fcp: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration));
  }).observe({ entryTypes: ['longtask'] });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = Math.round(e.startTime);
  }).observe({ type: 'paint', buffered: true });
`;

async function run(page: Page, cdp: CDPSession, s: Scenario, base: string, rate: number) {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(SEED_LEGAL_ACCEPTANCE);
  await page.addInitScript(OBSERVE);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });

  const t0 = Date.now();
  await page.goto(base + s.path, { waitUntil: 'commit' });
  let shell = -1;
  const shellSelector = s.path === '/' ? s.ready : `.surface-fallback, ${s.ready}`;
  try {
    await page
      .locator(shellSelector)
      .first()
      .waitFor({ state: 'visible', timeout: s.budgetMs * 3 });
    shell = Date.now() - t0;
  } catch {
    /* left as -1: even the dependency-free route shell missed its budget window */
  }
  let ready = -1;
  try {
    await page
      .locator(s.ready)
      .first()
      .waitFor({ state: 'visible', timeout: s.budgetMs * 4 });
    ready = Date.now() - t0;
  } catch {
    /* left as -1: it never got there inside three times its own budget */
  }
  // Let anything deferred settle, so idle work shows up in the long-task list too.
  await page.waitForTimeout(2500);

  const perf = (await page.evaluate('window.__perf')) as { long: number[]; fcp: number };
  const heap = (await page.evaluate(
    '(performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0)',
  )) as number;
  const eager = requests.filter(
    (u) => EAGER_FORBIDDEN.test(u) && !(s.allowedHeavy?.test(u) ?? false),
  );
  const long = perf.long.filter((d) => d > 50);
  const worst = long.length ? Math.max(...long) : 0;
  const blocked = long.reduce((a, d) => a + (d - 50), 0);

  return { ...s, shell, ready, fcp: perf.fcp, worst, blocked, longCount: long.length, heap, eager };
}

/** Measure an already-downloaded in-app route transition. This is the defensible sub-150ms
 * target: no network transfer and no cold browser boot, just click → requested surface rendered.
 * We warm each route once, navigate back to the landing, verify its old DOM is detached, then
 * time a real hash-router transition. The budget scales with CPU throttle: 150ms on a current
 * machine, 900ms at 6× slowdown. */
async function runWarmTransitions(base: string, rate: number) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(SEED_LEGAL_ACCEPTANCE);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.locator(SCENARIOS[0].ready).first().waitFor({ state: 'visible', timeout: 12000 });

  const results: { name: string; ms: number; budget: number }[] = [];
  const warmBudget = rate >= 6 ? 500 : 150;
  for (const s of SCENARIOS.slice(1)) {
    // Warm this route's actual lazy chunks, then return to a known lightweight route.
    await page.evaluate((path) => {
      window.location.hash = path.slice(1);
    }, s.path);
    await page
      .locator(s.ready)
      .first()
      .waitFor({ state: 'visible', timeout: s.budgetMs * 3 });
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.locator(SCENARIOS[0].ready).first().waitFor({ state: 'visible', timeout: 12000 });
    await page.locator(s.ready).first().waitFor({ state: 'detached', timeout: 12000 });

    await page.evaluate((path) => {
      (window as Window & { __routeStarted?: number }).__routeStarted = performance.now();
      window.location.hash = path.slice(1);
    }, s.path);
    await page
      .locator(s.ready)
      .first()
      .waitFor({ state: 'visible', timeout: s.budgetMs * 3 });
    const ms = await page.evaluate(() =>
      Math.round(
        performance.now() -
          ((window as Window & { __routeStarted?: number }).__routeStarted ?? performance.now()),
      ),
    );
    results.push({ name: s.name, ms, budget: warmBudget });
  }

  await ctx.close();
  await browser.close();
  return results;
}

async function main(): Promise<void> {
  const base = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const rate = Number(readFlag('throttle', '6'));

  const browser = await chromium.launch({ headless: true });
  console.log(
    `\nCPU throttled ${rate}× — ${rate === 1 ? 'current-machine baseline' : 'slow-device simulation'}.\n`,
  );
  console.log(
    'surface           shell  usable    FCP   worst-task  blocked  heap   eager-heavy-assets',
  );
  console.log('─'.repeat(88));

  let failures = 0;
  for (const s of SCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const r = await run(page, cdp, s, base, rate);

    const shellTxt = r.shell < 0 ? 'NEVER' : `${r.shell}ms`;
    const readyTxt = r.ready < 0 ? 'NEVER' : `${r.ready}ms`;
    const over = r.shell < 0 || r.shell > r.budgetMs;
    const bad = over || r.ready < 0 || r.eager.length > 0 || r.worst > 200 || r.blocked > 300;
    if (bad) failures++;
    console.log(
      `${s.name.padEnd(17)} ${shellTxt.padStart(6)} ${readyTxt.padStart(7)} ${String(r.fcp + 'ms').padStart(6)} ` +
        `${String(r.worst + 'ms').padStart(11)} ${String(r.blocked + 'ms').padStart(8)} ` +
        `${String(r.heap + 'MB').padStart(6)}   ${r.eager.length ? '⚠ ' + r.eager.length : '—'}` +
        (over ? `   ← shell over its ${r.budgetMs}ms budget` : '') +
        (r.worst > 200 ? '   ← long task >200ms' : '') +
        (r.blocked > 300 ? '   ← blocking >300ms' : ''),
    );
    if (r.eager.length) {
      for (const u of [...new Set(r.eager)].slice(0, 4)) {
        console.log(`${' '.repeat(20)}pulled before asked: ${u.split('/').pop()}`);
      }
    }
    await ctx.close();
  }
  await browser.close();

  const warm = await runWarmTransitions(base, rate);
  console.log(`\nWarm in-app route response (budget ${rate >= 6 ? 500 : 150}ms at ${rate}× CPU):`);
  for (const r of warm) {
    const over = r.ms > r.budget;
    if (over) failures++;
    console.log(
      `${r.name.padEnd(17)} ${String(r.ms + 'ms').padStart(6)}` +
        (over ? `   ← over ${r.budget}ms budget` : ''),
    );
  }

  console.log(
    '\nshell = immediate route acknowledgement; usable = the real surface is there. blocked = main-thread\n' +
      'time over the 50ms bar, i.e. how long\n' +
      'the page could not answer a click. eager-heavy-assets = the voice model / WASM / block library pulled\n' +
      'down before the user asked for anything. Warm route response is measured after its code is cached;\n' +
      'it is intentionally separate from a cold network load and is the only sub-150ms claim this gate makes.\n',
  );
  if (failures) process.exitCode = 1;
}

await main();
