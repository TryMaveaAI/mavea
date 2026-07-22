// interaction-matrix.mts — deterministic public-action performance gate.
//
// Exercises every registered feature through the public command palette plus the landing topbar
// controls. The landing resolves data-dependent features to baked walkthroughs or the empty Live
// shell, so this never needs a provider and must never make an LLM request.
import { chromium, type Page } from 'playwright';
import { FEATURES } from '../src/live/features/registry';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

const ACK_BUDGET_MS = 100;
// Pointer intent warms the bytes, but each case deliberately starts from a fresh document, so the
// first Live mount still has to initialise its stores and full interaction tree. Keep that honest
// first-mount budget separate from the already-mounted sub-150ms route gate in perf-probe.mts.
const PRELOADED_FIRST_MOUNT_BUDGET_MS = 500;

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function readySelector(featureId: string): string {
  if (featureId === 'gallery') return '.vlib-tile';
  if (featureId === 'dashboards') return '.dash-topbar, .dash-home';
  return '.mavea-app.with-rail';
}

interface Result {
  action: string;
  ackMs: number;
  usableMs: number;
  result: 'pass' | 'fail';
  reason?: string;
}

async function freshLanding(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.fl-hero, .flagship').first().waitFor({ state: 'visible' });
  await page.evaluate(() => sessionStorage.clear());
}

async function measureFeature(page: Page, base: string, featureId: string): Promise<Result> {
  await freshLanding(page, base);
  const search = page.getByRole('button', { name: 'Search all features' }).first();
  await search.hover();
  await page.waitForLoadState('networkidle');
  await search.click();
  const palette = page.locator('.cmdk-panel');
  await palette.waitFor({ state: 'visible' });

  const row = page.locator(`#cmdk-opt-${featureId}`);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  // Pointer intent uses the exact promise React.lazy will mount. Network-idle makes this a real
  // warm-action measurement instead of racing an arbitrarily chosen sleep.
  await page.waitForLoadState('networkidle');

  const started = Date.now();
  await row.click();
  await palette.waitFor({ state: 'hidden', timeout: ACK_BUDGET_MS * 3 });
  const ackMs = Date.now() - started;

  let usableMs = -1;
  let reason: string | undefined;
  try {
    await page
      .locator(readySelector(featureId))
      .first()
      .waitFor({ state: 'visible', timeout: 2_000 });
    usableMs = Date.now() - started;
  } catch {
    reason = 'surface never became usable';
  }

  if (ackMs > ACK_BUDGET_MS) reason ??= `acknowledgement exceeded ${ACK_BUDGET_MS}ms`;
  if (usableMs > PRELOADED_FIRST_MOUNT_BUDGET_MS) {
    reason ??= `preloaded first mount exceeded ${PRELOADED_FIRST_MOUNT_BUDGET_MS}ms`;
  }
  return {
    action: featureId,
    ackMs,
    usableMs,
    result: reason ? 'fail' : 'pass',
    reason,
  };
}

async function measureTopbar(page: Page, base: string): Promise<Result[]> {
  const results: Result[] = [];

  await freshLanding(page, base);
  const theme = page.locator('.fl-nav-theme');
  const before = await theme.getAttribute('aria-label');
  let started = Date.now();
  await theme.click();
  await page.waitForFunction(
    (label) => document.querySelector('.fl-nav-theme')?.getAttribute('aria-label') !== label,
    before,
  );
  let elapsed = Date.now() - started;
  results.push({
    action: 'topbar:theme',
    ackMs: elapsed,
    usableMs: elapsed,
    result: elapsed <= ACK_BUDGET_MS ? 'pass' : 'fail',
    ...(elapsed > ACK_BUDGET_MS ? { reason: 'theme toggle acknowledged too slowly' } : {}),
  });

  await freshLanding(page, base);
  const explore = page.getByRole('button', { name: 'Explore' });
  started = Date.now();
  await explore.click();
  await page.getByRole('menu', { name: 'Explore features' }).waitFor({ state: 'visible' });
  elapsed = Date.now() - started;
  results.push({
    action: 'topbar:explore-menu',
    ackMs: elapsed,
    usableMs: elapsed,
    result: elapsed <= ACK_BUDGET_MS ? 'pass' : 'fail',
    ...(elapsed > ACK_BUDGET_MS ? { reason: 'Explore menu acknowledged too slowly' } : {}),
  });
  await page.keyboard.press('Escape');

  await freshLanding(page, base);
  const demoTop = await page
    .locator('#flagship-demo')
    .evaluate((element) => element.getBoundingClientRect().top);
  started = Date.now();
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  // The flagship stage owns the scroll transform, so window.scrollY intentionally stays at zero.
  // Acknowledgement is the demo section beginning to move toward the viewport, not waiting for the
  // smooth scroll's decorative animation to finish.
  await page.waitForFunction(
    (initialTop) =>
      (document.getElementById('flagship-demo')?.getBoundingClientRect().top ?? initialTop) <
      initialTop,
    demoTop,
  );
  elapsed = Date.now() - started;
  results.push({
    action: 'topbar:demo',
    ackMs: elapsed,
    usableMs: elapsed,
    result: elapsed <= ACK_BUDGET_MS ? 'pass' : 'fail',
    ...(elapsed > ACK_BUDGET_MS ? { reason: 'Demo scroll acknowledged too slowly' } : {}),
  });

  for (const label of ['Take the tour', 'Open Mavéa']) {
    await freshLanding(page, base);
    const button = page.getByRole('button', { name: label, exact: true }).first();
    await button.hover();
    await page.waitForLoadState('networkidle');
    started = Date.now();
    await button.click();
    await page.waitForFunction(() => window.location.hash.startsWith('#/live'));
    const ackMs = Date.now() - started;
    await page.locator('.mavea-app.with-rail').waitFor({ state: 'visible', timeout: 2_000 });
    elapsed = Date.now() - started;
    const reason =
      ackMs > ACK_BUDGET_MS
        ? `${label} acknowledgement exceeded ${ACK_BUDGET_MS}ms`
        : elapsed > PRELOADED_FIRST_MOUNT_BUDGET_MS
          ? `${label} preloaded first mount exceeded ${PRELOADED_FIRST_MOUNT_BUDGET_MS}ms`
          : undefined;
    results.push({
      action: `topbar:${label.toLowerCase().replaceAll(' ', '-')}`,
      ackMs,
      usableMs: elapsed,
      result: reason ? 'fail' : 'pass',
      reason,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const base = readFlag('url', 'http://127.0.0.1:5173').replace(/\/$/, '');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Pre-accept the legal gate the same way ui-audit does: consent UI is not part of the
  // interaction budgets being measured, and a fresh profile would otherwise stall every
  // #/live-bound click at the acknowledgement screen instead of reaching the rail.
  await context.addInitScript(
    ({ legalKey, legalVersion }) => {
      localStorage.setItem('mavea-tour-seen-v1', '1');
      localStorage.setItem('mavea-live-setup-v1', '1');
      localStorage.setItem(
        legalKey,
        JSON.stringify({ version: legalVersion, acceptedAt: '2026-07-16T00:00:00.000Z' }),
      );
    },
    { legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY, legalVersion: LEGAL_ACCEPTANCE_VERSION },
  );
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const modelCalls: string[] = [];
  let currentAction = 'boot';
  page.on('pageerror', (error) => pageErrors.push(`${currentAction}: ${error.message}`));
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (
      /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.x\.ai|\/v1\/(messages|chat\/completions|responses)/i.test(
        request.url(),
      )
    ) {
      modelCalls.push(`${currentAction}: ${request.method()} ${request.url()}`);
    }
  });

  const results: Result[] = [];
  try {
    for (const feature of FEATURES) {
      currentAction = feature.id;
      try {
        results.push(await measureFeature(page, base, feature.id));
      } catch (error) {
        results.push({
          action: feature.id,
          ackMs: -1,
          usableMs: -1,
          result: 'fail',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    currentAction = 'topbar';
    results.push(...(await measureTopbar(page, base)));
  } finally {
    await context.close();
    await browser.close();
  }

  console.table(results);
  const failed = results.filter((result) => result.result === 'fail');
  if (pageErrors.length) console.error('\nPage errors:\n' + pageErrors.join('\n'));
  if (modelCalls.length) console.error('\nForbidden model calls:\n' + modelCalls.join('\n'));
  if (failed.length || pageErrors.length || modelCalls.length) process.exitCode = 1;
  else {
    console.log(
      `\nInteraction matrix passed: ${FEATURES.length} registry actions + ${results.length - FEATURES.length} topbar controls; zero model calls.`,
    );
  }
}

await main();
