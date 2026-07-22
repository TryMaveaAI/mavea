// Guards the reel's reduced-motion contract.
//
// The ~40 full-bleed finishes render directly in `.reel-stage > .reel-trans` — NOT inside
// `.reel-card` — so an earlier `prefers-reduced-motion` rule that only tamed `.reel-card *`
// left every bleed finish's marquee/sheen/looping draw moving for users who asked the OS to
// reduce motion. The fix neutralizes animations stage-wide (`.reel-stage *`). This source scan
// fails if that stage-wide neutralizer is ever narrowed back to card-only, which would silently
// re-break the bleed finishes (jsdom has no layout/media engine, so this can't be caught at render).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('reel reduced-motion', () => {
  const css = readFileSync(join(__dirname, '../src/clip/reel/reel.css'), 'utf8');

  function reducedMotionBlock(): string {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThan(-1);
    // Walk braces from the media query's opening brace to find its matching close.
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open, i + 1);
    }
    throw new Error('unterminated reduced-motion media block');
  }

  it('neutralizes every in-stage animation (covers bleed finishes, not just .reel-card)', () => {
    const block = reducedMotionBlock();
    // The stage-wide selector is what reaches the bleed finishes' internal animations.
    expect(block).toMatch(/\.reel-stage\s+\*/);
    // And it must actually cut the animation down, not merely list the selector.
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('still stops the ambient brand loops (jelly, glow, dot)', () => {
    const block = reducedMotionBlock();
    expect(block).toMatch(/\.reel-jelly/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
  });
});
