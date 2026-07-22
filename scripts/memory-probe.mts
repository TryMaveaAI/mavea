// memory-probe.mts — production-browser soak for route-level leaks.
//
// Unit cleanup tests catch forgotten observers/timers in isolation. This complements them by
// mounting and unmounting every public surface repeatedly in one real Chromium process, forcing
// GC, and comparing the browser's own heap/DOM/listener counters after the lazy chunks and module
// caches have already been warmed. Growth after that baseline is the suspicious part.
import { chromium, type CDPSession, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance.js';

/** Connected-feature surfaces sit behind the one-time legal acknowledgement, so a fresh context
 *  renders the gate instead of the route and every wait times out. Seed the acceptance before any
 *  page script runs — this probe measures a returning user's mount/unmount churn, not consent. */
const SEED_LEGAL_ACCEPTANCE = `
  try {
    localStorage.setItem(${JSON.stringify(LEGAL_ACCEPTANCE_STORAGE_KEY)}, JSON.stringify({
      version: ${JSON.stringify(LEGAL_ACCEPTANCE_VERSION)},
      acceptedAt: new Date(0).toISOString(),
    }));
  } catch { /* no storage: the landing route still measures */ }
`;

interface Route {
  name: string;
  hash: string;
  ready: string;
}

const ROUTES: Route[] = [
  { name: 'live', hash: '#/live', ready: '.mavea-app.with-rail' },
  { name: 'gallery', hash: '#/gallery', ready: '.vlib-tile' },
  { name: 'dashboards', hash: '#/dashboards', ready: '.dash-topbar, .dash-home' },
  { name: 'flashcards', hash: '#/flashcards', ready: '.fc-nav' },
  { name: 'courses', hash: '#/courses', ready: '.cr-nav' },
  { name: 'prism', hash: '#/prism', ready: '.prism-app' },
  { name: 'synthesis', hash: '#/synthesis', ready: '.prism-app' },
  { name: 'deepzoom', hash: '#/deepzoom', ready: '.dz-topbar' },
  { name: 'ripple', hash: '#/ripple', ready: '.ripple-panel' },
];

interface Snapshot {
  heapMb: number;
  nodes: number;
  listeners: number;
  documents: number;
}

async function detachedHeapSummary(cdp: CDPSession): Promise<void> {
  const chunks: string[] = [];
  const onChunk = ({ chunk }: { chunk: string }) => chunks.push(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const heap = JSON.parse(chunks.join('')) as {
    snapshot: { meta: { node_fields: string[]; node_types: Array<string[] | string> } };
    nodes: number[];
    strings: string[];
  };
  const fields = heap.snapshot.meta.node_fields;
  const stride = fields.length;
  const typeAt = fields.indexOf('type');
  const nameAt = fields.indexOf('name');
  const detachedAt = fields.indexOf('detachedness');
  if (detachedAt < 0) {
    console.log('heap summary: this Chromium snapshot does not expose detachedness');
    return;
  }
  const typeNames = heap.snapshot.meta.node_types[typeAt] as string[];
  const counts = new Map<string, number>();
  for (let index = 0; index < heap.nodes.length; index += stride) {
    if (heap.nodes[index + detachedAt] === 0) continue;
    const type = typeNames[heap.nodes[index + typeAt]] ?? '?';
    const name = heap.strings[heap.nodes[index + nameAt]] ?? '?';
    const key = `${type}:${name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log('\nDetached heap nodes (top classes):');
  for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(count).padStart(6)}  ${name}`);
  }
}

function flag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function snapshot(cdp: CDPSession): Promise<Snapshot> {
  // Two passes make weakly-held DOM wrappers settle reliably across Chromium versions.
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const [metrics, dom] = await Promise.all([
    cdp.send('Performance.getMetrics'),
    cdp.send('Memory.getDOMCounters'),
  ]);
  const values = new Map(metrics.metrics.map((metric) => [metric.name, metric.value]));
  return {
    heapMb: Number(((values.get('JSHeapUsedSize') ?? 0) / 1048576).toFixed(1)),
    nodes: dom.nodes,
    listeners: values.get('JSEventListeners') ?? 0,
    documents: dom.documents,
  };
}

async function visit(page: Page, route: Route): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, route.hash);
  await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 15000 });
}

async function landing(page: Page, oldReady?: string): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.locator('.fl-hero').waitFor({ state: 'visible', timeout: 15000 });
  if (oldReady) await page.locator(oldReady).first().waitFor({ state: 'detached', timeout: 15000 });
}

function delta(now: Snapshot, base: Snapshot): Snapshot {
  return {
    heapMb: Number((now.heapMb - base.heapMb).toFixed(1)),
    nodes: now.nodes - base.nodes,
    listeners: now.listeners - base.listeners,
    documents: now.documents - base.documents,
  };
}

async function main(): Promise<void> {
  const baseUrl = flag('url', 'http://127.0.0.1:4173').replace(/\/$/, '');
  const cycles = Math.max(1, Number(flag('cycles', '10')) || 10);
  const trace = process.argv.slice(2).includes('--trace');
  const heapSummary = process.argv.slice(2).includes('--heap-summary');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(SEED_LEGAL_ACCEPTANCE);
  const cdp = await context.newCDPSession(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  // This probe measures memory OUR app retains, so a failed load only counts when it is ours to
  // fix. Two kinds are not:
  //   • the voice/model backends (/tts, /stt, /llm) are optional and proxied — without the Kokoro
  //     container the server answers 502, which is the documented "no Docker, so captions instead
  //     of speech" path, not a defect;
  //   • third-party origins, which answer a datacenter IP however they like (a 403 from an
  //     external API says nothing about this codebase).
  // Everything else — our own assets and chunks — still fails the soak, now named by URL, which
  // the console message alone never carried.
  const OPTIONAL_BACKEND = /^\/(tts|stt|llm)\//;
  const ownOrigin = new URL(baseUrl).origin;
  page.on('response', (response) => {
    if (response.status() < 400) return;
    let url: URL;
    try {
      url = new URL(response.url());
    } catch {
      return;
    }
    if (url.origin !== ownOrigin) return;
    if (OPTIONAL_BACKEND.test(url.pathname)) return;
    errors.push(`http ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Reported by the response listener above, with the URL attached; counting it here too would
    // double-report the same failure and hide which resource it was.
    if (/Failed to load resource/i.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  await cdp.send('Performance.enable');

  await page.goto(`${baseUrl}/`, { waitUntil: 'commit' });
  await page.locator('.fl-hero').waitFor({ state: 'visible', timeout: 15000 });

  // Warm every lazy module and its stable caches before taking the baseline.
  for (const route of ROUTES) {
    await visit(page, route);
    await landing(page, route.ready);
  }
  await page.waitForTimeout(500);
  const baseline = await snapshot(cdp);
  console.log(
    `baseline  heap=${baseline.heapMb}MB nodes=${baseline.nodes} ` +
      `listeners=${baseline.listeners} documents=${baseline.documents}`,
  );

  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const route of ROUTES) {
      await visit(page, route);
      await landing(page, route.ready);
      if (trace) {
        const current = await snapshot(cdp);
        const growth = delta(current, baseline);
        console.log(
          `  after ${route.name.padEnd(10)} heap=${growth.heapMb >= 0 ? '+' : ''}${growth.heapMb}MB ` +
            `nodes=${growth.nodes >= 0 ? '+' : ''}${growth.nodes} ` +
            `listeners=${growth.listeners >= 0 ? '+' : ''}${growth.listeners}`,
        );
      }
    }
    if (cycle === cycles || cycle % Math.max(1, Math.floor(cycles / 3)) === 0) {
      const current = await snapshot(cdp);
      const growth = delta(current, baseline);
      console.log(
        `cycle ${String(cycle).padStart(2)} heap=${current.heapMb}MB (${growth.heapMb >= 0 ? '+' : ''}${growth.heapMb}) ` +
          `nodes=${current.nodes} (${growth.nodes >= 0 ? '+' : ''}${growth.nodes}) ` +
          `listeners=${current.listeners} (${growth.listeners >= 0 ? '+' : ''}${growth.listeners}) ` +
          `documents=${current.documents} (${growth.documents >= 0 ? '+' : ''}${growth.documents})`,
      );
    }
  }

  const final = await snapshot(cdp);
  const growth = delta(final, baseline);
  const heapLimit = Math.max(8, baseline.heapMb * 0.35);
  const failures: string[] = [];
  if (growth.heapMb > heapLimit)
    failures.push(`heap grew ${growth.heapMb}MB (limit ${heapLimit.toFixed(1)}MB)`);
  if (growth.nodes > 300) failures.push(`DOM nodes grew ${growth.nodes} (limit 300)`);
  if (growth.listeners > 80) failures.push(`event listeners grew ${growth.listeners} (limit 80)`);
  if (growth.documents > 4) failures.push(`documents grew ${growth.documents} (limit 4)`);
  if (errors.length)
    failures.push(`${errors.length} browser error(s): ${errors.slice(0, 3).join(' | ')}`);

  if (heapSummary) await detachedHeapSummary(cdp);

  await context.close();
  await browser.close();
  if (failures.length) {
    console.error(`\n✗ Memory soak failed: ${failures.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\n✓ ${cycles} full public-route cycles completed without retained-growth signals.`,
    );
  }
}

await main();
