// A figure's LENGTH belongs to the data, not to the design.
//
// The surface is laid out around a fixed 200px card and a fixed-width rail, and both were sized
// against figures a human would write. A world whose outcome is 9,007,199,254,740,990 rows — or a
// value with thirty digits — pushed the card wider than the composition, which widened the world,
// which made the whole stage scroll sideways; in the rail the same run of digits reached past the
// panel and took the evidence beside it out of view. Neither is a styling nit: it is the
// dynamic-data rule, and the fixtures that catch it are the extreme ones nobody looks at.
//
// A source scan rather than a render: jsdom has no layout, so it cannot measure an overflow — but
// it can prove the three rules that prevent one are still written down.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORLD_CSS = readFileSync('src/live/world/world.css', 'utf8');
const TRUST_CSS = readFileSync('src/live/trust/trust.css', 'utf8');

/** The body of one rule, by selector — enough to assert what it declares. */
function ruleFor(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('a figure can never set the layout', () => {
  it('clips an over-long value on the card instead of widening it', () => {
    // A card is a glance; the rail behind it is where a figure is read in full.
    const rule = ruleFor(WORLD_CSS, '.wo-num');
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('keeps the figure a pointer-sized target while it does so', () => {
    // `min-width` here is load-bearing twice over: it holds the 24px hit floor AND overrides a
    // flex item's default `min-width: auto`, which is what let a long number widen the card.
    // Setting it to 0 for the ellipsis silently shrank every short figure below the floor.
    expect(ruleFor(WORLD_CSS, '.wo-num,\n.wo-expand')).toMatch(/min-width:\s*24px/);
    expect(ruleFor(WORLD_CSS, '.wo-num')).not.toMatch(/min-width:\s*0/);
  });

  it.each([
    ['the world rail', WORLD_CSS, '.wo-detail-figure'],
    ['the what-if readout', TRUST_CSS, '.tr-wi-figure'],
  ])('wraps a long run of digits in %s rather than reaching past it', (_where, css, selector) => {
    // Digits offer no break opportunity, so a plain wrap does nothing for them.
    expect(ruleFor(css, selector)).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
