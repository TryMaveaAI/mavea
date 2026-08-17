// world-perf.mts — what the living-answer surface COSTS a reader who is using it.
//
// The gauntlet proves every world builds and the audit proves it is legible. Neither can tell you
// that pulling a lever pins a core, because jsdom has no clock worth trusting and the audit only
// ever measures a settled frame. This drives the real surface in a real Chromium and records what
// the browser was doing between the input and the next paint.
//
// WHAT IS GATED — the response, never the choreography. This surface deliberately takes 1100ms to
// fly a camera and 420ms to cross-fade a face; those are designed, and a gate that measured
// "settled" would fail on its own art direction. What must stay small is the work the main thread
// does BEFORE the reader sees the first frame of a response: a long task blocks scrolling, typing
// and the animation itself, so it is the honest proxy for "does this feel instant, and will it
// still on a weaker machine".
//
// Requires a dev server already running (the lab route is dev-only):
//   pnpm dev                                       # or pnpm dev:web
//   pnpm perf:world
//   pnpm perf:world --scenario wide-election --throttle 4
//
// Exits 1 with a printed report if any interaction is over budget. It runs in weekly.yml's
// browser-gates job, which already has a dev server up — NOT on every push, and deliberately: these
// are CPU-TIME budgets, and a shared runner's idea of 200ms of main-thread work varies run to run,
// so a per-push timing gate is a coin flip that eventually gets ignored. What per-push CI enforces
// instead is the DETERMINISTIC half of the same contract, in jsdom: world-lever-drag pins that a
// lever re-opens no camera flight and moves no node, which is the regression that actually recurs.
import { chromium, type Browser, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';
import { allWorldScenario } from '../src/live/world/scenarios/index';

/** The window the budgets are measured in. `--viewport WxH` narrows it: a smaller stage fits fewer
 *  nodes at a legible scale, so the camera sits lower, the counter-scale works harder, and the same
 *  world costs more to lay out — `world:smoke` uses 1280×720 for exactly that reason. */
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/** The response budget. A task longer than this is one the reader feels: the frame it was due to
 *  paint in is gone, and so is the next one. */
const WORST_TASK_MS = 200;
/** Total main-thread time spent in tasks over 50ms across one interaction. One long-ish task is a
 *  hitch; several in a row is the fan spinning up. */
const BLOCKING_MS = 300;
/** How long to watch after an interaction. Long enough to cover the cinematic it starts (1100ms)
 *  plus the settle behind it, so late work cannot hide just past the window. */
const WINDOW_MS = 1600;

interface Measurement {
  name: string;
  worst: number;
  blocking: number;
  tasks: number;
}

/** Installed before any app code so no task escapes the count. Long-task entries are the only
 *  main-thread measure a page can take of itself; `blocking` follows the standard definition
 *  (everything a task spends past 50ms). */
const OBSERVE = (): void => {
  const w = window as unknown as { __wp?: { d: number[] } };
  w.__wp = { d: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__wp?.d.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* a host without the long-task API reports nothing rather than failing the run */
  }
};

async function reset(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wp?: { d: number[] } };
    if (w.__wp) w.__wp.d = [];
  });
}

async function collect(page: Page, name: string): Promise<Measurement> {
  await page.waitForTimeout(WINDOW_MS);
  const durations = await page.evaluate(() => {
    const w = window as unknown as { __wp?: { d: number[] } };
    return w.__wp?.d ?? [];
  });
  return {
    name,
    worst: Math.round(Math.max(0, ...durations)),
    blocking: Math.round(durations.reduce((sum, d) => sum + Math.max(0, d - 50), 0)),
    tasks: durations.length,
  };
}

/** One interaction: clear the buffer, do the thing, watch for a window, report. */
async function measure(page: Page, name: string, act: () => Promise<void>): Promise<Measurement> {
  await reset(page);
  await act();
  return collect(page, name);
}

/** One frame of a reader's hand on a what-if lever. */
const setLever = async (page: Page, pct: number): Promise<void> => {
  await page.evaluate((value) => {
    const lever = document.querySelector<HTMLInputElement>('.tr-levers input[type="range"]');
    if (!lever) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      lever,
      String(value),
    );
    lever.dispatchEvent(new Event('input', { bubbles: true }));
    lever.dispatchEvent(new Event('change', { bubbles: true }));
  }, pct);
};

/** The lever drag. Stepped from here, one value per frame, so the page runs exactly the work a
 *  dragging pointer would give it. Returns how many of those frames opened a camera flight, which
 *  is the cost long-task numbers cannot see: a frame treated as a morph restarts a 1100ms eased
 *  transform on the world and on every node in it.
 *
 *  The bar is now ZERO from the very first pull. A what-if is a re-weight of the world in place —
 *  no layout reads it and the camera is never called — where it used to compose a second lane and
 *  re-fit. If this ever counts a flight again, a shift has leaked into a layout. */
const DRAG = async (page: Page, steps: number): Promise<number> => {
  await setLever(page, 97);
  await page.waitForTimeout(1400);

  let flights = 0;
  for (let i = 0; i < steps; i += 1) {
    await setLever(page, Math.max(20, 94 - i * 2));
    await page.waitForTimeout(16);
    const morphing = await page.evaluate(
      () => document.querySelector<HTMLElement>('.mv-world')?.dataset.morphing === '',
    );
    if (morphing) flights += 1;
  }
  return flights;
};

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __wpKey?: string; __wpTicks?: number };
      const nodes = [...document.querySelectorAll('.mv-node')];
      if (!nodes.length) return false;
      const key = nodes
        .map((n) => {
          const r = n.getBoundingClientRect();
          return `${Math.round(r.left)},${Math.round(r.top)}`;
        })
        .join('|');
      w.__wpTicks = key === w.__wpKey ? (w.__wpTicks ?? 0) + 1 : 0;
      w.__wpKey = key;
      return (w.__wpTicks ?? 0) >= 3;
    },
    null,
    { timeout: 30_000, polling: 200 },
  );
  await page.evaluate(() => document.fonts.ready);
}

const readFlag = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

async function main(): Promise<void> {
  const port = readFlag('port', '5179');
  const baseUrl = readFlag('url', `http://localhost:${port}`).replace(/\/$/, '');
  const scenario = readFlag('scenario', 'seed-2008');
  const throttle = Number(readFlag('throttle', '1'));
  const sizeFlag = readFlag('viewport', '');
  const size = /^\d+x\d+$/.test(sizeFlag)
    ? { width: Number(sizeFlag.split('x')[0]), height: Number(sizeFlag.split('x')[1]) }
    : DEFAULT_VIEWPORT;
  if (sizeFlag && size === DEFAULT_VIEWPORT) {
    throw new Error(`Bad --viewport "${sizeFlag}". Use WxH, e.g. 1280x720.`);
  }
  if (!allWorldScenario(scenario)) {
    throw new Error(`Unknown scenario "${scenario}". Pass an id from src/live/world/scenarios.`);
  }

  console.log(
    `[world-perf] ${scenario} at ${size.width}×${size.height}` +
      `${throttle > 1 ? ` · CPU ×${throttle}` : ''} against ${baseUrl}\n` +
      `             budgets: worst task ≤ ${WORST_TASK_MS}ms · blocking ≤ ${BLOCKING_MS}ms per interaction`,
  );

  const browser: Browser = await chromium.launch({ headless: true });
  const results: Measurement[] = [];
  try {
    const ctx = await browser.newContext({ viewport: size });
    await ctx.addInitScript(
      ({ legalKey, legalVersion }) => {
        localStorage.setItem('mavea-theme', 'dark');
        localStorage.setItem(
          legalKey,
          JSON.stringify({ version: legalVersion, acceptedAt: '2026-08-15T00:00:00.000Z' }),
        );
      },
      { legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY, legalVersion: LEGAL_ACCEPTANCE_VERSION },
    );
    await ctx.addInitScript(OBSERVE);
    const page = await ctx.newPage();
    if (throttle > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }

    results.push(
      await measure(page, 'open the world', async () => {
        await page.goto(`${baseUrl}/#/worldlab?s=${scenario}`, { waitUntil: 'load' });
        await page.waitForSelector('.wo-panel .mv-node', { state: 'attached', timeout: 30_000 });
      }),
    );
    await settle(page);

    const chips = await page
      .locator('.wo-views .wo-chip')
      .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
    for (const label of chips) {
      results.push(
        await measure(page, `morph → ${label.toLowerCase()}`, async () => {
          await page.getByRole('button', { name: label, exact: true }).click();
        }),
      );
      await settle(page);
    }
    // Back to the graph, which is where the levers and the breakdown live.
    if (chips.length) {
      await page.getByRole('button', { name: chips[0], exact: true }).click();
      await settle(page);
    }

    const hasLever = await page.locator('.tr-levers input[type="range"]').count();
    if (hasLever) {
      // The drag's real cost was never main-thread time. It is COMPOSITING: a frame treated as a
      // morph restarts a 1100ms eased transform on the world and on every node in it, so a drag
      // could keep N interpolations permanently alive without ever spending a long task. Long-task
      // numbers cannot see that, so the frames that opened a flight are counted directly.
      let flights = 0;
      results.push(
        await measure(page, 'drag a what-if lever', async () => {
          flights = await DRAG(page, 30);
        }),
      );
      if (flights > 0) {
        console.log(
          `\n✗ drag a what-if lever   ${flights} of 30 frames restarted the camera flight — ` +
            'a drag must land directly, not re-animate\n',
        );
        process.exitCode = 1;
      }
      // A cheap interaction and an interaction that never happened both measure zero — and this one
      // is now EXPECTED to score a perfect zero, which is exactly when a silently broken selector
      // would read as the best result of the run. So it says out loud that the what-if really
      // reached the world.
      const shifted = await page.locator('.mv-node[data-shift]').count();
      if (shifted === 0) {
        throw new Error('the lever drag re-weighted nothing — the measurement is empty');
      }
      await settle(page);
    }

    // Dispatched rather than clicked: a node is a ZERO-SIZE anchor with its faces hanging off it,
    // so Playwright cannot scroll one into view or call it visible — the trap world-audit
    // documents for waitForSelector, met again here. The button's own handler is what matters, and
    // this is the same handler a reader's press runs.
    if (await page.locator('.wo-expand').count()) {
      results.push(
        await measure(page, 'break a cause down', () =>
          page.evaluate(() => document.querySelector<HTMLButtonElement>('.wo-expand')?.click()),
        ),
      );
      await settle(page);
    }

    if (await page.locator('.wo-num, .tr-num').count()) {
      results.push(
        await measure(page, 'open a figure’s provenance', () =>
          page.evaluate(() =>
            document.querySelector<HTMLButtonElement>('.wo-num, .tr-num')?.click(),
          ),
        ),
      );
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.worst > WORST_TASK_MS || r.blocking > BLOCKING_MS);
  const width = Math.max(...results.map((r) => r.name.length));
  console.log('');
  for (const r of results) {
    const over = r.worst > WORST_TASK_MS || r.blocking > BLOCKING_MS;
    console.log(
      `${over ? '✗' : '·'} ${r.name.padEnd(width)}  worst ${String(r.worst).padStart(4)}ms   ` +
        `blocking ${String(r.blocking).padStart(4)}ms   tasks ${r.tasks}`,
    );
  }
  if (failed.length) {
    console.log(`\n${failed.length} interaction(s) over budget.`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${results.length} interaction(s) within budget.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
