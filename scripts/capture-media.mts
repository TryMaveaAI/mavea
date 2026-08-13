// capture-media.mts — regenerate the README's screenshots from the key-free surfaces.
//
// README media goes stale silently: the UI moves, the picture doesn't, and a first-time reader
// judges the product by a screenshot three versions old. So the shots are GENERATED rather than
// hand-captured — `pnpm gen:media` re-shoots all of them against the current build, which makes
// refreshing them a command instead of a chore.
//
// Every subject replays without a model key: the recorded demo personas, the walkthrough's baked
// chapters, Ripple's worked example, and the hand-authored Deep Zoom descent. Subjects are
// deliberately spread across topics and are explanatory rather than advisory — never money, law,
// or health — so the strip reads as what the canvas can do, not as counsel nobody asked for.
//
// Run the dev server first (`pnpm dev`), then `pnpm gen:media`.
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

/** Laptop-shaped, at 1× — the README renders these ~270px wide in a three-up row, so a taller
 *  frame only buys rows nobody can read and a 2× capture would triple the npm tarball. */
const VIEWPORT = { width: 1440, height: 900 };
/** JPEG, not PNG: these are photographic-density UI shots, and `docs/media` ships inside the npm
 *  package, which is size-gated (check-package-artifact.mjs). */
const QUALITY = 80;
const OUT_DIR = 'docs/media';

interface BaseShot {
  /** File stem. */
  name: string;
  /** How long to let the surface build before shooting — long enough for the answer to reveal
   *  and the ink to land, short enough to stay clear of the end-of-replay card. */
  settleMs: number;
  /** Where to park the answer scroller, so the frame lands on the card worth showing. Omitted
   *  means "leave it where the replay put it" — the answer scrolls itself as it narrates, and
   *  yanking it back to the top would frame the wrong card. */
  scrollTop?: number;
}

/** Which key-free surface the shot comes from, and what it needs to get there. */
type Shot = BaseShot &
  (
    | { from: 'demo'; persona: string; asCanvas?: boolean }
    | { from: 'tour'; chapter: string }
    | { from: 'ripple'; section: string }
    | { from: 'route'; hash: string; ready: string; click?: string[] }
  );

const SHOTS: Shot[] = [
  // Row 1 — an answer, three ways: narrated and marked up, spread out as a board, and forming
  // live while someone is still talking.
  { name: 'answer-ink', from: 'demo', persona: 'dev', settleMs: 20_000 },
  { name: 'canvas-view', from: 'demo', persona: 'dev', settleMs: 26_000, asCanvas: true },
  { name: 'think-map', from: 'tour', chapter: 'think', settleMs: 8000 },
  // Row 2 — what it can be pointed at: a document, a repository, a whole subject.
  { name: 'doc-prism', from: 'tour', chapter: 'prism', settleMs: 30_000 },
  { name: 'repo-course', from: 'ripple', section: 'Courses', settleMs: 6000 },
  {
    name: 'deep-zoom',
    from: 'route',
    hash: '#/deepzoom?demo=1',
    ready: '.dz-topbar',
    click: ['Zoom into The leaves', 'Zoom into The inner tissue'],
    settleMs: 4000,
  },
];

/** The README shows one look, not two: the paper template in light, which is what the product is
 *  art-directed around. A dark twin behind prefers-color-scheme meant half of readers saw a
 *  different product than the one being described. */
const TEMPLATE = 'paper';
const THEME = 'light';

/** Chrome that belongs to the harness rather than the product — the replay transport, the persona
 *  badge, the walkthrough panel, the coach hint — plus any notice, which dates a shot and covers
 *  the canvas. Hidden via a stylesheet, not by removing nodes: the replay keeps driving underneath. */
const HIDE_HARNESS =
  '.demox, .demox-banner, .demox-badge, .tourx, .ink-coach, .feature-use-notice { display: none !important; }';

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

/** A lazily-imported surface can lose its first fetch on a cold headless run; the overlay offers
 *  exactly one honest retry, so take it rather than shooting the error state. */
async function retryOnce(page: Page, waitMs: number): Promise<void> {
  const retry = page.getByRole('button', { name: /^retry$/i });
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
    await page.waitForTimeout(waitMs);
  }
}

/** Drive one shot's surface up to the moment before the frame is taken. */
async function openSurface(page: Page, baseUrl: string, shot: Shot): Promise<void> {
  if (shot.from === 'demo') {
    await page.goto(`${baseUrl}/#/live?demo=${shot.persona}`, { waitUntil: 'load' });
    const start = page.getByRole('button', { name: /start demo/i });
    await start.waitFor({ state: 'visible', timeout: 30_000 });
    await start.click();
    await page.waitForSelector('.card-grid .card', { timeout: 30_000 });
    await page.waitForTimeout(shot.settleMs);
    if (shot.asCanvas) {
      await page.getByRole('button', { name: /view as canvas/i }).click({ timeout: 15_000 });
      await page.waitForTimeout(2500);
    }
    return;
  }
  if (shot.from === 'tour') {
    // Solo: the chapter plays alone instead of running on into the rest of the walkthrough.
    await page.goto(`${baseUrl}/#/live?tour=1&ch=${shot.chapter}&solo=1`, { waitUntil: 'load' });
    await page.waitForSelector('.mavea-app', { timeout: 60_000 });
    const start = page.getByRole('button', { name: /start the tour/i });
    await start.waitFor({ state: 'visible', timeout: 30_000 });
    await start.click();
    // Half the settle, then the retry, then the rest: a chapter that opens a lazy feature needs
    // the recovery early enough that the frame still lands mid-chapter, not on the end card.
    await page.waitForTimeout(shot.settleMs / 2);
    await retryOnce(page, shot.settleMs / 2);
    await page.waitForTimeout(shot.settleMs / 2);
    return;
  }
  if (shot.from === 'ripple') {
    await page.goto(`${baseUrl}/#/live?ripple=1`, { waitUntil: 'load' });
    await page.waitForSelector('.ripple-panel', { timeout: 60_000 });
    await page.getByRole('button', { name: shot.section }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(shot.settleMs);
    return;
  }
  await page.goto(`${baseUrl}/${shot.hash}`, { waitUntil: 'load' });
  await page.waitForSelector(shot.ready, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  for (const label of shot.click ?? []) {
    await page.getByRole('button', { name: label }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(shot.settleMs);
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const only = readFlag('only', '');
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of SHOTS) {
      if (only && !only.split(',').includes(shot.name)) continue;
      const ctx = await browser.newContext({
        viewport: VIEWPORT,
        // Settled, not mid-animation: a reveal caught halfway reads as a rendering bug.
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      await page.addInitScript(
        ({ initialTheme, initialTemplate, legalKey, legalVersion }) => {
          localStorage.setItem('mavea-theme', initialTheme);
          localStorage.setItem('mavea-template', initialTemplate);
          localStorage.setItem(
            legalKey,
            JSON.stringify({ version: legalVersion, acceptedAt: '2026-08-12T00:00:00.000Z' }),
          );
        },
        {
          initialTheme: THEME,
          initialTemplate: TEMPLATE,
          legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY,
          legalVersion: LEGAL_ACCEPTANCE_VERSION,
        },
      );
      await openSurface(page, baseUrl, shot);
      await page.addStyleTag({ content: HIDE_HARNESS });
      if (shot.scrollTop !== undefined) {
        await page.evaluate((top) => {
          document.querySelector('.canvas-scroll')?.scrollTo({ top });
          window.scrollTo({ top: 0 });
        }, shot.scrollTop);
      }
      await page.waitForTimeout(600);
      const path = `${OUT_DIR}/${shot.name}.jpg`;
      await page.screenshot({ path, type: 'jpeg', quality: QUALITY });
      console.log(`✓ ${path}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

await main();
