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

/** Laptop-shaped: what the product is art-directed for, and short enough that a three-up row of
 *  them stays readable rather than becoming six tall crops. */
const VIEWPORT = { width: 1440, height: 900 };
/** Rasterized at 2× (2880×1800). The README shows each shot ~300px wide, but both GitHub and npm
 *  open the full file on click — and a reader who clicks in to read the labels is exactly the
 *  reader worth having, so the file behind the thumbnail is the retina one. */
const SCALE = 2;
/** JPEG, not PNG: these are photographic-density UI shots, and `docs/media` ships inside the npm
 *  package, which is size-gated (check-package-artifact.mjs). Chosen against the 2× capture — at
 *  this scale the artifacts land below a pixel, so the trade buys resolution, not mush. */
const QUALITY = 72;
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
    | { from: 'demo'; persona: string; asCanvas?: boolean; then?: string[] }
    | { from: 'tour'; chapter: string }
    | { from: 'ripple'; section: string; then?: string[] }
    | { from: 'route'; hash: string; ready: string; click?: string[] }
  );

const SHOTS: Shot[] = [
  // Row 1 — an answer, three ways: narrated and marked up, spread out as a board, and forming
  // live while someone is still talking.
  { name: 'answer-ink', from: 'demo', persona: 'dev', settleMs: 20_000 },
  { name: 'canvas-view', from: 'demo', persona: 'dev', settleMs: 26_000, asCanvas: true },
  // The settled thought map, from the dev-only harness (#/mindlab) rather than a live session:
  // its threads and themes come from a model, so a key-free tour chapter can only ever show the
  // listening half. Same component, same CSS, a real settled spec — and reproducible.
  {
    name: 'think-map',
    from: 'route',
    hash: '#/mindlab',
    ready: '.ms-hub',
    settleMs: 3500,
  },
  // Row 2 — what it can be pointed at: a document, a repository, a whole subject.
  { name: 'doc-prism', from: 'tour', chapter: 'prism', settleMs: 30_000 },
  {
    name: 'repo-course',
    from: 'ripple',
    section: 'Courses',
    // The curriculum opens on its orientation course, which is two short lessons and reads bare.
    // Skipping ahead lands on the feature-building course: real files, a cause-and-effect warning.
    then: ['I already know this, skip ahead'],
    settleMs: 4000,
  },
  // The settled answer's own spoken track, as a waveform you can drag: the canvas un-builds to
  // what had been SAID by that moment, then rebuilds as the voice replays.
  { name: 'voice-scrub', from: 'demo', persona: 'dev', settleMs: 42_000, scrollTop: 0 },
  // The export studio, reached the way a person reaches it — the replay's own export beat is
  // minutes in, and waiting for it would make `pnpm gen:media` a coffee break.
  {
    name: 'doc-export',
    from: 'demo',
    persona: 'dev',
    settleMs: 30_000,
    // The menu item is matched by its blurb: its label alone also matches the topbar trigger.
    // The studio's own chrome is a fixed dark lightbox (ExportModal's panel is hardcoded), so the
    // Document tab — a white page filling the preview — is what keeps this from reading as a
    // different product than the tiles beside it.
    then: ['Share', 'Choose a template and export', 'Document'],
  },
  {
    name: 'deck-export',
    from: 'demo',
    persona: 'dev',
    settleMs: 30_000,
    // Slide 1 is the title card — the least interesting thing a generated deck contains. Step
    // past it to a content slide, which is what someone is deciding about when they look at this.
    then: [
      'Share',
      'Choose a template and export',
      // A light deck skin, so the tile sits with the others rather than reading as a dark outlier.
      'Lumen',
      'Next slide',
      'Next slide',
      'Next slide',
      'Next slide',
    ],
  },
  // The trip, drawn: a real map with its stops numbered beside the hour-by-hour plan. Late in the
  // replay, where the second answer has built — the frame is the answer, not the reveal.
  { name: 'trip-plan', from: 'demo', persona: 'traveler', settleMs: 72_000, scrollTop: 650 },
  {
    name: 'deep-zoom',
    from: 'route',
    hash: '#/deepzoom?demo=1',
    ready: '.dz-topbar',
    click: ['Zoom into The leaves', 'Zoom into The inner tissue'],
    settleMs: 4000,
  },
  // Row 3 — reasoning made visible, and made to stick: a real-world "why" laid open, and a
  // question that grows into a taught course.
  { name: 'living-answer', from: 'tour', chapter: 'living-answer', settleMs: 6000 },
  { name: 'course-lesson', from: 'tour', chapter: 'course', settleMs: 6000 },
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
  '.demox, .demox-banner, .demox-badge, .tourx, .ink-coach, .feature-use-notice, .mindlab-bar { display: none !important; }';

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

/** Walk a short click path by accessible name — a menu, then the item inside it, then whatever
 *  that opened. Used to reach a surface the replay would otherwise only visit minutes in. */
async function clickThrough(page: Page, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    // Prefer the control whose accessible name STARTS with the label — a menu trigger reads as
    // "Share", while the item inside it reads as "Export" plus its blurb, so a plain text match
    // would find the trigger again and close the menu it just opened.
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byRole = page.getByRole('button', { name: new RegExp(`^${escaped}`, 'i') });
    const target = (await byRole.count()) ? byRole : page.getByText(label, { exact: false });
    await target.first().click({ timeout: 20_000 });
    await page.waitForTimeout(2500);
  }
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
    if (shot.then) {
      await clickThrough(page, shot.then);
      // Short: the replay is still playing underneath, and its own next beat (the palette, its
      // export) would take the studio back off screen while we waited.
      await page.waitForTimeout(1500);
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
    await page.waitForTimeout(2500);
    // A section can open on its thinnest state — the first course is a two-lesson orientation.
    // Follow-up clicks land the shot on the part worth showing.
    await clickThrough(page, shot.then ?? []);
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
        deviceScaleFactor: SCALE,
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
