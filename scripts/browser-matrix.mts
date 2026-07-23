#!/usr/bin/env tsx
// Real-engine public-surface smoke matrix. This deliberately uses Chromium, Firefox, and WebKit:
// Chromium covers Chrome/Edge/Arc's engine, Firefox covers Gecko, and WebKit is the closest CI
// representation of Safari. Every public hash route is checked at desktop and phone widths.
import { chromium, firefox, webkit, type BrowserType, type Page } from 'playwright';

interface Surface {
  name: string;
  hash: string;
  ready: string;
}

const SURFACES: Surface[] = [
  { name: 'landing', hash: '', ready: '.fl-landing' },
  { name: 'live', hash: '#/live', ready: '.mavea-app.live-voice' },
  { name: 'dashboards', hash: '#/dashboards', ready: '.dash-app' },
  { name: 'flashcards', hash: '#/flashcards', ready: '.fc-app' },
  { name: 'gallery', hash: '#/gallery', ready: '.vlib' },
  { name: 'deep zoom', hash: '#/deepzoom', ready: '.deepzoom-app' },
  { name: 'courses', hash: '#/courses', ready: '.cr-app' },
  { name: 'course reader', hash: '#/course', ready: '.clr-app' },
  { name: 'synthesis', hash: '#/synthesis', ready: '.prism-app' },
  { name: 'prism', hash: '#/prism', ready: '.prism-app' },
  { name: 'ripple', hash: '#/ripple', ready: '.ripple-panel' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const ENGINES: Array<{ name: string; type: BrowserType }> = [
  { name: 'Chromium', type: chromium },
  { name: 'Firefox', type: firefox },
  { name: 'WebKit', type: webkit },
];

const arg = process.argv.find((value) => value.startsWith('--url='));
const baseUrl = (arg?.slice('--url='.length) || 'http://127.0.0.1:5173').replace(/\/$/, '');
const failures: string[] = [];
const rows: Array<Record<string, string | number>> = [];

async function inspect(page: Page): Promise<{ overflow: number; text: number; fallback: boolean }> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#root');
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      overflow: Math.max(0, Math.ceil(pageWidth - window.innerWidth)),
      text: (root?.innerText ?? '').trim().length,
      fallback: !!document.querySelector('.root-fallback, .surface-fallback'),
    };
  });
}

for (const engine of ENGINES) {
  const browser = await engine.type.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport });

      for (const surface of SURFACES) {
        // A fresh document per public entry verifies the route users actually bookmark/reload and
        // isolates one surface's global listeners, storage reads, or dev-HMR activity from the
        // next. The browser context (and HTTP cache) remains shared so this is not an artificial
        // 66-browser cold-start benchmark.
        const page = await context.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        const started = Date.now();
        let state = { overflow: 0, text: 0, fallback: true };
        let failure = '';
        try {
          await page.goto(`${baseUrl}/${surface.hash}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15_000,
          });
          // Every connected surface except landing/gallery sits behind the one-time legal
          // acknowledgement (src/legal/LegalGate.tsx); without accepting it here the ready
          // selector below never appears and every gated route times out identically.
          try {
            await page.waitForSelector('.legal-gate input[type="checkbox"]', { timeout: 3_000 });
            await page.check('.legal-gate input[type="checkbox"]');
            await page.click('.legal-gate button:has-text("Continue to Mavéa")');
          } catch {
            // This surface bypasses the gate (landing, gallery, prerecorded demos) — nothing to accept.
          }
          // A lazy surface may mount its shell, discover another lazy child, and briefly suspend
          // again. Also, Synthesis and Prism intentionally share the same root selector. Wait for
          // the requested hash AND a meaningful, fallback-free render in one atomic predicate so
          // a stale shell cannot make the check pass early.
          await page.waitForFunction(
            ({ ready, hash }) => {
              const root = document.querySelector<HTMLElement>('#root');
              return (
                window.location.hash === hash &&
                !!document.querySelector(ready) &&
                !document.querySelector('.root-fallback, .surface-fallback') &&
                (root?.innerText ?? '').trim().length >= 12
              );
            },
            { ready: surface.ready, hash: surface.hash },
            { timeout: 15_000 },
          );
          // Let lazy children and resize observers settle; this is still intentionally a smoke
          // budget, not a visual-audit delay.
          await page.waitForTimeout(250);
          state = await inspect(page);
          const reasons: string[] = [];
          if (state.fallback) reasons.push('still showing a fallback');
          if (state.text < 12) reasons.push('surface has no meaningful text');
          if (state.overflow > 2) reasons.push(`${state.overflow}px page overflow`);
          if (pageErrors.length) reasons.push(`page error: ${pageErrors[0]}`);
          if (consoleErrors.length) reasons.push(`console error: ${consoleErrors[0]}`);
          failure = reasons.join('; ');
        } catch (error) {
          failure = error instanceof Error ? error.message.split('\n')[0] : String(error);
        }

        const key = `${engine.name} · ${viewport.name} · ${surface.name}`;
        if (failure) failures.push(`${key}: ${failure}`);
        rows.push({
          engine: engine.name,
          viewport: viewport.name,
          surface: surface.name,
          ms: Date.now() - started,
          overflow: state.overflow,
          result: failure ? 'FAIL' : 'pass',
        });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

console.table(rows);
if (failures.length) {
  console.error(`\nBrowser matrix failed (${failures.length}/${rows.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nBrowser matrix passed: ${rows.length} route/viewport/engine checks.`);
}
