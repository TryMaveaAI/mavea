// print-export.test.ts — guards the PDF "Export" path against the regressions that broke it:
//   1. print.css was imported ONLY inside the lazy Live chunk, so exporting from the demo (which
//      also has an Export button) printed the raw on-screen chrome — no reflow, shell not hidden.
//   2. The generated page header (`.mavea-app::before`) read `attr(data-title)`, but no surface
//      ever set `data-title`, so every PDF was headed by a bare "Mavéa —".
//   3. `.mavea-app::before` is also the ambient-glow pseudo (position:absolute; inset:0) in
//      styles.css; the print header reused it without resetting position, so the title overlapped
//      the whole canvas.
// These are source-scan tripwires (no DOM/print engine needed) — the cheapest durable guard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const main = read('src/main.tsx');
const liveApp = read('src/live/LiveApp.tsx');
const topicCanvas = read('src/canvas/TopicCanvas.tsx');
const printCss = read('src/live/print/print.css');

describe('PDF export — print styles are global', () => {
  it('loads print.css with TopicCanvas so every printable canvas gets it', () => {
    expect(topicCanvas).toMatch(/import\s+['"]\.\.\/live\/print\/print\.css['"]/);
    // The landing no longer contains a canvas or export action, so it should not pay for print CSS.
    expect(main).not.toMatch(/import\s+['"][^'"]*print\.css['"]/);
  });

  it('does NOT import print.css from the lazy Live chunk (would scope it to Live only)', () => {
    expect(liveApp).not.toMatch(/import\s+['"][^'"]*print\.css['"]/);
  });
});

describe('PDF export — header title', () => {
  it('Live sets data-title on its .mavea-app root so the PDF header is not a bare "Mavéa —"', () => {
    expect(liveApp).toMatch(/data-title=\{turn\.spec\?\.title/);
  });
});

describe('PDF export — interactive-only affordances are dropped', () => {
  // The voice scrubber and the "what I understood" chips live inside the canvas, but they only
  // make sense as something to tap/drag — a static PDF can't honour that, so print must hide them.
  it.each(['.voice-scrub', '.understood'])('hides %s in print', (selector) => {
    const idx = printCss.indexOf(selector);
    expect(idx).toBeGreaterThan(-1);
    const rule = printCss.slice(idx, printCss.indexOf('}', idx));
    expect(rule).toMatch(/display:\s*none\s*!important/);
  });
});

describe('PDF export — header does not overlap the canvas', () => {
  it('resets the reused ambient-glow pseudo to normal flow (position/inset) in print', () => {
    // The .mavea-app::before print rule must neutralize the absolute positioning it inherits from
    // the ambient-glow rule in styles.css, or the title floats over the page. Anchor on the real
    // rule via its generated `content:` (not the explanatory comment that quotes the glow rule).
    const contentIdx = printCss.indexOf("content: 'Mavéa");
    expect(contentIdx).toBeGreaterThan(-1);
    const ruleStart = printCss.lastIndexOf('.mavea-app::before', contentIdx);
    const rule = printCss.slice(ruleStart, printCss.indexOf('}', contentIdx));
    expect(rule).toMatch(/position:\s*static\s*!important/);
    expect(rule).toMatch(/inset:\s*auto\s*!important/);
  });

  it('the design system really does define .mavea-app::before as an absolute glow (the reason for the reset)', () => {
    // The glow is route-scoped with Live chrome so the landing does not download transcript CSS.
    const styles = read('src/styles/live-transcript.css');
    const before = styles.slice(styles.indexOf('.mavea-app::before'));
    const rule = before.slice(0, before.indexOf('}'));
    expect(rule).toMatch(/position:\s*absolute/);
  });
});
