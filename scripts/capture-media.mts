// capture-media.mts — regenerate the README's screenshots from the baked demo replays.
//
// README media goes stale silently: the UI moves, the picture doesn't, and a first-time reader
// judges the product by a screenshot three versions old. So the shots are GENERATED rather than
// hand-captured — `pnpm gen:media` re-shoots all of them against the current build, which makes
// refreshing them a command instead of a chore.
//
// Subjects come from the recorded demo personas, which need no API key and replay real sessions.
// The finance persona is deliberately not shot: the README should show what the canvas can do
// without putting a money screenshot in front of a reader who has not accepted anything yet.
//
// Run the dev server first (`pnpm dev`), then `pnpm gen:media`.
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

/** Laptop-shaped, at 1× — the README renders these ~820px wide, so a 2× capture would triple the
 *  npm tarball for detail nobody sees. */
const VIEWPORT = { width: 1440, height: 1150 };
/** JPEG, not PNG: these are photographic-density UI shots, and `docs/media` ships inside the npm
 *  package, which is size-gated (check-package-artifact.mjs). */
const QUALITY = 82;
const OUT_DIR = 'docs/media';

interface Shot {
  /** File stem — the theme suffix is appended. */
  name: string;
  /** Baked persona to replay (src/demo/corpus). */
  persona: string;
  /** How long to let the replay build its canvas before shooting. Long enough for the cards to
   *  reveal, short enough to stay clear of the end-of-replay dialog. */
  settleMs: number;
}

const SHOTS: Shot[] = [
  // Subjects are deliberately explanatory rather than advisory, and never money, law or health:
  // a protocol walkthrough, then the block library itself, which has no subject at all.
  { name: 'canvas-view', persona: 'dev', settleMs: 26_000, asCanvas: true },
  { name: 'canvas-build', persona: 'dev', settleMs: 26_000, scrollTop: 360 },
  { name: 'canvas-steps', persona: 'dev', settleMs: 26_000, scrollTop: 1000 },
  { name: 'canvas-code', persona: 'dev', settleMs: 26_000, scrollTop: 1750 },
  { name: 'canvas-risk', persona: 'dev', settleMs: 26_000, scrollTop: 2500 },
  { name: 'canvas-lead', persona: 'dev', settleMs: 26_000, scrollTop: 0 },
];

/** The README shows one look, not two: the paper template in light, which is what the product is
 *  art-directed around. A dark twin behind prefers-color-scheme meant half of readers saw a
 *  different product than the one being described. */
const TEMPLATE = 'paper';
const THEME = 'light';

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

/** Dismiss the replay's opening dialog and wait for a built canvas. */
async function startReplay(page: Page, { settleMs, scrollTop = 0, asCanvas }: Shot): Promise<void> {
  const start = page.getByRole('button', { name: /start demo/i });
  await start.waitFor({ state: 'visible', timeout: 30_000 });
  await start.click();
  await page.waitForSelector('.card-grid .card', { timeout: 30_000 });
  await page.waitForTimeout(settleMs);
  // Hide what belongs to the replay harness rather than the product — the transport bar, the
  // persona badge, the coach hint — plus any notice, which dates a shot and covers the canvas.
  // Hidden via a stylesheet, not by removing nodes: the replay keeps driving the canvas underneath.
  await page.addStyleTag({
    content:
      '.demox, .demox-banner, .demox-badge, .ink-coach, .feature-use-notice { display: none !important; }',
  });
  // Frame the answer from its top: a canvas caught mid-scroll reads as a cropping mistake.
  await page.evaluate((top) => {
    document.querySelector('.canvas-scroll')?.scrollTo({ top });
    window.scrollTo({ top: 0 });
  }, scrollTop);
  if (asCanvas) {
    const toggle = page.getByRole('button', { name: /view as canvas/i });
    await toggle.click({ timeout: 15_000 });
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(400);
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of SHOTS) {
      {
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
        if (shot.chapter) {
          await page.goto(`${baseUrl}/#/live?tour=1&ch=${shot.chapter}`, { waitUntil: 'load' });
          await page.waitForSelector('.mavea-app', { timeout: 60_000 });
          const startTour = page.getByRole('button', { name: /start the tour/i });
          await startTour.waitFor({ state: 'visible', timeout: 30_000 });
          await startTour.click();
          await page.waitForTimeout(shot.settleMs);
          // A lazily-imported surface can lose its first fetch on a cold headless run; the overlay
          // offers exactly one honest retry, so take it rather than shooting the error state.
          const retry = page.getByRole('button', { name: /^retry$/i });
          if (await retry.isVisible().catch(() => false)) {
            await retry.click();
            await page.waitForTimeout(7000);
          }
          await page.addStyleTag({
            content: '.demox, .ink-coach, .feature-use-notice { display: none !important; }',
          });
          await page.waitForTimeout(500);
        } else if (shot.route) {
          await page.goto(`${baseUrl}/${shot.route}`, { waitUntil: 'load' });
          await page.waitForSelector('.vlib-tile', { timeout: 60_000 });
          await page.waitForTimeout(9000);
          await page.evaluate((top) => window.scrollTo({ top }), shot.scrollTop ?? 0);
          await page.waitForTimeout(1200);
        } else {
          await page.goto(`${baseUrl}/#/live?demo=${shot.persona}`, { waitUntil: 'load' });
          await startReplay(page, shot);
        }
        const path = `${OUT_DIR}/${shot.name}.jpg`;
        await page.screenshot({ path, type: 'jpeg', quality: QUALITY });
        console.log(`✓ ${path}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
