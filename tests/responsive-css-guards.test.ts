// Regression guards for overflow bugs that only show up under real layout — jsdom has no layout
// engine (vitest runs with `css: false`, so no stylesheet is even parsed), so these are pinned by
// scanning the source text, the same idiom canvas-svg-label-patterns.test.ts uses for a layout bug
// that's likewise invisible to a jsdom render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('tour transport — 21 chapter dots must not blow out the panel on a phone', () => {
  const css = read('src/tour/tour.css');

  it('keeps Back/Play/Next/Skip a fixed size — only the dot rail is allowed to shrink', () => {
    // Without flex-shrink:0 the default flex-shrink:1 lets an overflowing row squash every
    // control (ovalizing the round buttons) instead of just scrolling the one element that
    // has more content than fits: the dots.
    const btnRule = /\.tourx-btn\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    const skipRule = /\.tourx-skip\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(btnRule).toMatch(/flex-shrink:\s*0/);
    expect(skipRule).toMatch(/flex-shrink:\s*0/);
  });

  it('makes the dot rail the one scrollable element instead of wrapping or overflowing', () => {
    const dotsRule = /\.tourx-dots\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(dotsRule).toMatch(/overflow-x:\s*auto/);
    expect(dotsRule).toMatch(/min-width:\s*0/);
  });

  it('gives each 7px dot a real touch-sized tap target via a transparent halo', () => {
    const haloRule = /\.tourx-dot::before\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(haloRule).toMatch(/inset:\s*-9px/);
  });

  it('centres the coach on the post-rail workspace axis at every desktop rail width', () => {
    const panelRule = /\.tourx-panel\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(panelRule).toMatch(/left:\s*calc\(50% \+ var\(--rail-w, 0px\) \/ 2\)/);
    expect(panelRule).toMatch(/width:\s*min\(560px, calc\(100vw - var\(--rail-w, 0px\) - 32px\)\)/);
  });
});

describe('gallery family chips — a sticky filter bar must never out-grow the viewport', () => {
  const css = read('src/gallery/gallery.css');

  it('scrolls the chip row instead of wrapping it across many lines', () => {
    // .vlib-bar is `position: sticky`; letting a dozen-plus chips wrap unbounded can make the
    // sticky bar taller than a phone's whole viewport, hiding every tile beneath it. A single
    // scrollable row keeps the bar's height fixed at any width.
    const chipsRule = /\.vlib-chips\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipsRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(chipsRule).toMatch(/overflow-x:\s*auto/);
  });

  it('keeps each chip from shrinking inside the scroll row', () => {
    const chipRule = /\.vlib-chip\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipRule).toMatch(/flex-shrink:\s*0/);
  });
});

describe('flagship mobile nav — the compact Explore items must actually win the cascade', () => {
  const css = read('src/flagship/flagship.css');

  it('uses a compound selector so display:none beats .fl-explore-item’s own display:flex', () => {
    // A single-class `.fl-explore-item--compact { display: none }` has the SAME specificity as
    // `.fl-explore-item { display: flex }` — whichever rule is later in the file wins, which
    // silently broke this on desktop once before. The compound selector always wins regardless
    // of source order.
    expect(css).toMatch(/\.fl-explore-item\.fl-explore-item--compact\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.fl-explore-item\.fl-explore-item--compact\s*\{\s*display:\s*flex/);
  });
});
