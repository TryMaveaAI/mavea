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
  // The finance persona is not shot at all, and the student replay is savings/interest — the
  // README should show what the canvas does without leading with someone's money.
  { name: 'hero', persona: 'traveler', settleMs: 24_000 },
  { name: 'canvas-build', persona: 'dev', settleMs: 26_000, scrollTop: 360 },
  { name: 'canvas-plan', persona: 'traveler', settleMs: 30_000, scrollTop: 360 },
];

const THEMES = ['light', 'dark'] as const;

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

/** Dismiss the replay's opening dialog and wait for a built canvas. */
async function startReplay(page: Page, { settleMs, scrollTop = 0 }: Shot): Promise<void> {
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
  await page.waitForTimeout(400);
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of SHOTS) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({
          viewport: VIEWPORT,
          // Settled, not mid-animation: a reveal caught halfway reads as a rendering bug.
          reducedMotion: 'reduce',
        });
        const page = await ctx.newPage();
        await page.addInitScript(
          ({ initialTheme, legalKey, legalVersion }) => {
            localStorage.setItem('mavea-theme', initialTheme);
            localStorage.setItem(
              legalKey,
              JSON.stringify({ version: legalVersion, acceptedAt: '2026-08-12T00:00:00.000Z' }),
            );
          },
          {
            initialTheme: theme,
            legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY,
            legalVersion: LEGAL_ACCEPTANCE_VERSION,
          },
        );
        await page.goto(`${baseUrl}/#/live?demo=${shot.persona}`, { waitUntil: 'load' });
        await startReplay(page, shot);
        const path = `${OUT_DIR}/${shot.name}-${theme}.jpg`;
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
