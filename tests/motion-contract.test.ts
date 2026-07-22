import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { useCountUp, usePathDraw } from '../src/canvas/lib/motion';

// motion.css/motion.ts are the shared animation vocabulary every block is meant to reach for
// instead of hand-rolling its own keyframes or its own RAF-driven count-up (see
// component-protocol.test.ts's @keyframes source-scan for the enforcement half of that
// contract). jsdom can't play an animation, so — exactly like layout-contract.test.ts — this is
// a source-level regression guard: it asserts the four canonical keyframes and the
// reduced-motion gate are still present in the CSS, and that the two hooks the JS half promises
// are actually exported.

const css = readFileSync(join(__dirname, '../src/canvas/lib/motion.css'), 'utf8');
// The header comment documents the "never infinite" house rule in prose, so a naive scan for
// `animation-iteration-count: infinite` would match that sentence rather than real CSS. Strip
// comments first so every regex below only ever sees actual rules.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('motion.css — the four canonical keyframes exist', () => {
  for (const name of ['mavea-fade-rise', 'mavea-scale-in', 'mavea-draw', 'mavea-pulse-glow']) {
    it(`defines @keyframes ${name}`, () => {
      expect(css).toMatch(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
    });
  }
});

describe('motion.css — entrance/draw utilities only animate under prefers-reduced-motion: no-preference', () => {
  it('wraps a @media (prefers-reduced-motion: no-preference) block', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/);
  });

  it('the utility classes that trigger an animation live inside that block, not at top level', () => {
    const match = css.match(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*)\}\s*$/,
    );
    expect(match, 'no prefers-reduced-motion: no-preference block found').toBeTruthy();
    const gated = match![1];
    for (const cls of ['.m-stagger-item', '.m-fade-rise', '.m-scale-in', '.m-draw-path']) {
      expect(gated, `${cls} is not gated behind the reduced-motion media query`).toContain(cls);
    }
    // The part of the file OUTSIDE the gated block must never itself contain an `animation:`
    // declaration — an ungated entrance would play regardless of the OS motion preference.
    const ungated = css.slice(0, css.indexOf('@media'));
    expect(ungated).not.toMatch(/animation:\s*mavea-/);
  });

  it('never declares an infinite-looping animation (entrances/pulses are one-shot)', () => {
    expect(cssNoComments).not.toMatch(/animation-iteration-count:\s*infinite/);
  });
});

describe('motion.ts — the JS-driven half exports the two documented hooks', () => {
  it('exports useCountUp', () => {
    expect(typeof useCountUp).toBe('function');
  });
  it('exports usePathDraw', () => {
    expect(typeof usePathDraw).toBe('function');
  });
});
