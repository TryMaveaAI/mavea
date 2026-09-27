import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Exercise real animation, not reduced motion: manual selection used to freeze
// the incoming card's fade-in when it paused the playback timer.
const browser = await chromium.launch();
try {
  for (const [theme, width] of [
    ['light', 390],
    ['dark', 390],
    ['light', 1440],
    ['dark', 1440],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height: 1100 },
      reducedMotion: 'no-preference',
    });
    await page.addInitScript((value) => localStorage.setItem('mavea-theme', value), theme);
    await page.goto(process.argv[2] ?? 'http://localhost:5173');
    await page.locator('.answer-theatre').scrollIntoViewIfNeeded();
    for (const example of ['Watch money grow', 'See a network learn', 'Trace the Pacific coast']) {
      await page.getByRole('button', { name: example, exact: true }).click();
      for (const part of [0, 1, 2]) {
        await page.locator('.answer-theatre-progress button').nth(part).click();
        const card = page.locator('.answer-theatre .card');
        await card.waitFor();
        await page.waitForTimeout(1800);
        const opacity = await card.evaluate((element) => {
          let value = 1;
          for (let node = element; node; node = node.parentElement) {
            value *= Number(getComputedStyle(node).opacity);
          }
          return value;
        });
        assert(opacity > 0.95, `${theme}: ${example}, ${part} stayed dim (${opacity})`);
        if (width === 390 && example === 'See a network learn' && part === 0) {
          const bounds = await page.locator('.dg-cw-svg').boundingBox();
          assert(bounds && bounds.height < 300, 'Mobile learning loop has excessive blank space');
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Learning loop is clipped');
          assert.equal(await page.locator('.answer-cycle-key li').count(), 4);
        }
      }
    }
    await page.close();
    console.log(`${theme}, ${width}px: all nine manually selected answer parts are visible`);
  }
} finally {
  await browser.close();
}
