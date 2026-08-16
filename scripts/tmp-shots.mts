// Throwaway: screenshot the world lab for a reader's-eye pass.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

const OUT = process.env.SHOT_DIR!;
mkdirSync(OUT, { recursive: true });

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const ids = arg('scenario', '').split(',').filter(Boolean);
const views = arg('views', 'Graph,Over time,As a chart').split(',');
const theme = arg('theme', 'dark');
const base = `http://localhost:${arg('port', '5179')}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
  deviceScaleFactor: 2,
});
await ctx.addInitScript(
  ({ t, k, v }) => {
    localStorage.setItem('mavea-theme', t);
    localStorage.setItem(k, JSON.stringify({ version: v, acceptedAt: '2026-08-15T00:00:00.000Z' }));
  },
  { t: theme, k: LEGAL_ACCEPTANCE_STORAGE_KEY, v: LEGAL_ACCEPTANCE_VERSION },
);
const page = await ctx.newPage();

const settle = async (): Promise<void> => {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __k?: string; __n?: number };
      const nodes = [...document.querySelectorAll('.mv-node')];
      if (!nodes.length) return false;
      if (document.querySelector('.mv-chrome[data-exiting]')) return false;
      const key = nodes
        .map((n) => {
          const r = n.getBoundingClientRect();
          return `${Math.round(r.left)},${Math.round(r.top)}`;
        })
        .join('|');
      w.__n = key === w.__k ? (w.__n ?? 0) + 1 : 0;
      w.__k = key;
      return (w.__n ?? 0) >= 3;
    },
    null,
    { timeout: 30000, polling: 150 },
  );
  await page.evaluate(() => document.fonts.ready);
};

for (const id of ids) {
  await page.goto(`${base}/#/worldlab?s=${id}`, { waitUntil: 'load' });
  await page.waitForSelector('.wo-panel .mv-node', { state: 'attached', timeout: 30000 });
  await settle();
  const offered = await page
    .locator('.wo-views .wo-chip')
    .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  for (const label of offered) {
    if (!views.includes(label)) continue;
    await page.getByRole('button', { name: label, exact: true }).click();
    await settle();
    const slug = label.toLowerCase().replace(/\s+/g, '-');
    await page.locator('.wo-panel').screenshot({ path: `${OUT}/${id}__${slug}__${theme}.png` });
  }
}
await browser.close();
