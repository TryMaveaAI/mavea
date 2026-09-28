// ripple-layout-audit.mts — Ripple's two window-shape layouts, checked in a real browser.
//
//   pnpm audit:ripple                                  # starts its own dev server
//   pnpm audit:ripple -- --url http://localhost:5173   # against a running one
//
// The generic surface audit judges clipping, overlap and tap size; it cannot know what Ripple
// promises at the two extremes, so this does:
//   - a 320x568 phone: every section tab can be scrolled to without sitting under the Explain-for
//     switch, which takes a row of its own, with its three labels apart;
//   - a 3840x2025 4K window at 1x: the panel's type is restated large enough to read (>= 16px for
//     the body steps), while an equally wide ultrawide (2560x1080) keeps the app-wide ramp.
// Exits 1 with the failures listed.
import type { Page } from 'playwright';
import { startDevServer } from './dev-server.mts';
import { launchChromium } from './launch-chromium.mts';
import { LEGAL_SEED } from './lib/legalSeed.mts';

const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i !== -1 ? process.argv[i + 1] : undefined;
})();

interface Check {
  size: [number, number];
  run: (page: Page) => Promise<string[]>;
}

const PHONE = `(() => {
  const fail = [];
  const sections = document.querySelector('.ripple-rail-sections');
  const alt = document.querySelector('.ripple-rail-altitude');
  if (!sections || !alt) return ['rail or Explain-for switch missing'];
  const s = sections.getBoundingClientRect();
  const a = alt.getBoundingClientRect();
  if (a.top < s.bottom - 1) fail.push('Explain-for switch shares the tabs row (switch top ' + Math.round(a.top) + ' < tabs bottom ' + Math.round(s.bottom) + ')');
  for (const tab of sections.querySelectorAll('.ripple-rail-item')) {
    tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    const r = tab.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === tab || tab.contains(hit))) fail.push('tab "' + tab.textContent.trim() + '" is covered once scrolled to');
  }
  const buttons = [...alt.querySelectorAll('.ripple-alt button')];
  if (buttons.length !== 3) fail.push('expected 3 Explain-for choices, found ' + buttons.length);
  for (const b of buttons) {
    if (b.scrollWidth > b.clientWidth + 1) fail.push('Explain-for "' + b.textContent.trim() + '" overflows its button');
    const range = document.createRange();
    range.selectNodeContents(b);
    const text = range.getBoundingClientRect();
    const box = b.getBoundingClientRect();
    if (text.left - box.left < 6 || box.right - text.right < 6) fail.push('Explain-for "' + b.textContent.trim() + '" has under 6px either side of its label');
  }
  return fail;
})()`;

const typeFloor = (min: number, expectWide: boolean) => `(() => {
  const fail = [];
  const panel = document.querySelector('.ripple-panel');
  const body = document.querySelector('.ripple-rail-item');
  if (!panel || !body) return ['panel missing'];
  const fs = parseFloat(getComputedStyle(body).fontSize);
  if (${expectWide} ? fs < ${min} : fs >= ${min}) fail.push('section tab type is ' + fs.toFixed(1) + 'px (expected ' + (${expectWide} ? '>= ' : '< ') + ${min} + ')');
  const w = panel.getBoundingClientRect().width;
  if (${expectWide} && w <= 1700) fail.push('panel stayed ' + Math.round(w) + 'px wide');
  if (${expectWide}) {
    const alt = [...document.querySelectorAll('.ripple-alt button')];
    for (const b of alt) if (b.scrollWidth > b.clientWidth + 1) fail.push('Explain-for "' + b.textContent.trim() + '" overflows its button');
  }
  return fail;
})()`;

const CHECKS: Check[] = [
  { size: [320, 568], run: (p) => p.evaluate(PHONE) },
  { size: [3840, 2025], run: (p) => p.evaluate(typeFloor(16, true)) },
  { size: [2560, 1080], run: (p) => p.evaluate(typeFloor(16, false)) },
];

const server = argUrl ? null : await startDevServer();
const base = argUrl ?? server!.url;
const browser = await launchChromium({ headless: true });
const failures: string[] = [];
try {
  for (const { size, run } of CHECKS) {
    const [width, height] = size;
    const ctx = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      isMobile: width <= 414,
      hasTouch: width <= 414,
    });
    await ctx.addInitScript(
      ({ key, value }) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // A sandboxed frame has no storage and nothing here to seed.
        }
      },
      { key: LEGAL_SEED.key, value: LEGAL_SEED.value },
    );
    const page = await ctx.newPage();
    await page.goto(`${base}/#/live?ripple=1`);
    await page.waitForSelector('.ripple-panel', { timeout: 20_000 });
    await page.waitForTimeout(1500);
    const found = await run(page);
    console.log(`Ripple ${width}x${height} — ${found.length ? found.length + ' issue(s)' : '✓'}`);
    for (const f of found) failures.push(`${width}x${height}: ${f}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.stop();
}
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  process.exit(1);
}
