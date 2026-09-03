// surface-audit.mts — headless sweep of every reader-facing SURFACE across the screen sizes people
// actually use, in both themes.
//
// `audit:ui` sweeps the block library inside the gallery; that catches a chart whose labels collide,
// and nothing about the room the chart sits in. The defects readers actually report live one level
// up: a reading column squeezed to a porthole by chrome that never shrinks, a panel taller than the
// window with no way to scroll it, a control stranded off the edge, a fixed overlay landing on top
// of the caption it was meant to sit above. None of those involve a block at all.
//
// So this drives the real surfaces and asks four questions of each: does anything sit outside the
// window, can everything that overflows actually be scrolled to, is the reading column a usable
// share of the screen, and is any text below the legibility floor.
//
// Requires a dev server already running:
//   pnpm dev
//   pnpm audit:surfaces
//   pnpm audit:surfaces -- --sizes 1366x620,2560x1080 --themes light
//   pnpm audit:surfaces -- --only study,ripple
//
// Exits 1 with a printed report if anything is flagged.
import { chromium, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

/** The shapes that break things. The short laptop (1366×620) is the one a 1440×900 sweep never
 *  finds, and the ultrawide is where a fixed-width design strands its content in the middle. */
const DEFAULT_SIZES = ['1024x768', '1280x720', '1366x620', '1440x900', '1920x1080', '2560x1080'];

/** Rendered px. Matches the app-wide floor `audit:ui` applies to block type. */
const TYPE_FLOOR = 9;

/** A reading column thinner than this share of the window is a porthole, however tall the page is:
 *  the chrome has taken the screen. Derived from the worst measured case rather than chosen — a
 *  short laptop was giving 27%, and the answer was unreadable at that share. */
const MIN_READING_SHARE = 0.45;

interface Surface {
  key: string;
  label: string;
  /** Where it lives, relative to the base URL. */
  hash: string;
  /** Rendered when the surface is ready to measure. */
  ready: string;
  /** Accessible names to click, in order, to reach the state worth measuring. */
  click?: string[];
  /** The element whose height is the reading column, when the surface has one. */
  reading?: string;
  /** Extra settle time for a surface that animates itself in. */
  settleMs?: number;
}

const SURFACES: Surface[] = [
  { key: 'landing', label: 'Landing', hash: '/', ready: '.fl-landing' },
  {
    key: 'live',
    label: 'Live (empty)',
    hash: '#/live',
    ready: '.mavea-app',
    reading: '.canvas-scroll',
  },
  {
    key: 'everything',
    label: 'Answer · Everything',
    hash: '#/live?demo=dev',
    ready: '.mavea-app',
    click: ['Start demo'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
  },
  {
    key: 'study',
    label: 'Answer · Study',
    hash: '#/live?demo=dev',
    ready: '.mavea-app',
    click: ['Start demo', 'Study'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
  },
  {
    key: 'focus',
    label: 'Answer · Focus',
    hash: '#/live?demo=dev',
    ready: '.mavea-app',
    click: ['Start demo', 'Focus'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
  },
  {
    key: 'ripple',
    label: 'Ripple',
    hash: '#/live?ripple=1',
    ready: '.ripple-panel',
    settleMs: 3000,
  },
  {
    key: 'deepzoom',
    label: 'Deep Zoom',
    hash: '#/deepzoom?demo=1',
    ready: '.dz-topbar',
    settleMs: 2500,
  },
  {
    key: 'gallery',
    label: 'Gallery',
    hash: '#/gallery',
    ready: '.gal-app,.gallery-app',
    settleMs: 2500,
  },
  { key: 'legal', label: 'Legal', hash: '#/legal', ready: '.legal-app' },
];

interface Finding {
  surface: string;
  size: string;
  theme: string;
  issues: string[];
}

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

/** Everything measured in the page, in one pass — a second evaluate would race the first's layout. */
async function measure(page: Page, reading: string | undefined, floor: number) {
  return page.evaluate(
    ({ readingSel, typeFloor }) => {
      const describe = (el: Element): string => {
        const cls = String((el as HTMLElement).className || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.');
        return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
      };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const outside: string[] = [];
      const tiny: string[] = [];
      const trapped: string[] = [];

      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;

        // Sitting outside the window with nothing able to bring it back. A box inside a scroller
        // is reachable by definition, so only measure against the scrollers that actually exist.
        const overRight = box.right - vw;
        const overBottom = box.bottom - vh;
        if (overRight > 2 || overBottom > 2) {
          let scrollable = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            const scrolls = /(auto|scroll)/.test(ps.overflowY + ps.overflowX);
            if (
              scrolls &&
              (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)
            ) {
              scrollable = true;
              break;
            }
          }
          if (!scrollable && el.children.length === 0) {
            outside.push(
              `${describe(el)} outside by ${Math.round(Math.max(overRight, overBottom))}px`,
            );
          }
        }

        // Type below the floor, judged on what is rendered rather than what was authored.
        if (el.children.length === 0 && (el.textContent ?? '').trim().length > 1) {
          const size = parseFloat(style.fontSize);
          if (size && size < typeFloor) tiny.push(`${describe(el)} ${size.toFixed(1)}px`);
        }

        // Content taller than its box, in a box that refuses to scroll: unreachable by any gesture.
        const hidden = el.scrollHeight - el.clientHeight;
        if (hidden > 4 && /hidden|clip/.test(style.overflowY) && el.clientHeight > 40) {
          trapped.push(
            `${describe(el)} hides ${Math.round(hidden)}px with overflow-y:${style.overflowY}`,
          );
        }
      }

      const readingEl = readingSel ? document.querySelector<HTMLElement>(readingSel) : null;
      const doc = document.scrollingElement as HTMLElement | null;
      return {
        outside: Array.from(new Set(outside)).slice(0, 8),
        tiny: Array.from(new Set(tiny)).slice(0, 8),
        trapped: Array.from(new Set(trapped)).slice(0, 8),
        readingH: readingEl ? Math.round(readingEl.clientHeight) : null,
        viewportH: vh,
        docScrollable: doc ? doc.scrollHeight > doc.clientHeight + 2 : false,
        bodyOverflowX: document.documentElement.scrollWidth > vw + 2,
      };
    },
    { readingSel: reading ?? null, typeFloor: floor },
  );
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const sizes = readFlag('sizes', DEFAULT_SIZES.join(','))
    .split(',')
    .map((s) => s.trim());
  const themes = readFlag('themes', 'light,dark')
    .split(',')
    .map((t) => t.trim());
  const only = readFlag('only', '').trim();
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;
  const surfaces = SURFACES.filter((s) => !wanted || wanted.has(s.key));

  const findings: Finding[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const surface of surfaces) {
      for (const size of sizes) {
        const [width, height] = size.split('x').map(Number);
        for (const theme of themes) {
          const ctx = await browser.newContext({
            viewport: { width, height },
            // Settled, not mid-animation: a reveal caught halfway reads as a layout bug.
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
          const issues: string[] = [];
          try {
            await page.goto(`${baseUrl}/${surface.hash}`, { waitUntil: 'load' });
            await page.waitForSelector(surface.ready, { timeout: 45_000 });
            for (const label of surface.click ?? []) {
              const button = page.getByRole('button', { name: new RegExp(`^${label}`, 'i') });
              await button.first().click({ timeout: 25_000 });
              await page.waitForTimeout(1200);
            }
            await page.waitForTimeout(surface.settleMs ?? 1200);

            const m = await measure(page, surface.reading, TYPE_FLOOR);
            for (const o of m.outside) issues.push(`unreachable: ${o}`);
            for (const t of m.trapped) issues.push(`trapped: ${t}`);
            for (const t of m.tiny) issues.push(`below ${TYPE_FLOOR}px: ${t}`);
            if (m.bodyOverflowX) issues.push('page scrolls horizontally');
            if (m.readingH !== null) {
              const share = m.readingH / m.viewportH;
              if (share < MIN_READING_SHARE) {
                issues.push(
                  `reading column ${m.readingH}px of ${m.viewportH}px (${Math.round(share * 100)}%, floor ${Math.round(MIN_READING_SHARE * 100)}%)`,
                );
              }
            }
          } catch (err) {
            issues.push(
              `did not reach a measurable state: ${(err as Error).message.split('\n')[0]}`,
            );
          }
          findings.push({ surface: surface.label, size, theme, issues });
          console.log(
            `${surface.label.padEnd(20)} ${size.padStart(9)} ${theme.padEnd(5)} — ${issues.length ? `${issues.length} issue(s)` : '✓'}`,
          );
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const dirty = findings.filter((f) => f.issues.length);
  if (!dirty.length) {
    console.log(`\n✓ ${findings.length} surface/size/theme combinations are clean.`);
    return;
  }
  console.log('\n─── Surface findings ───');
  for (const f of dirty) {
    console.log(`\n${f.surface} @ ${f.size} ${f.theme}`);
    for (const issue of f.issues) console.log(`  ${issue}`);
  }
  console.log(`\n${dirty.length} of ${findings.length} combinations flagged.`);
  process.exitCode = 1;
}

await main();
