// On a 4K window Ripple restates the type ramp at its ceilings × a factor (ripple.css). Those
// ceilings are copies of tokens-base.css's clamp() maxima, so a retuned ramp would leave Ripple's 4K
// sizes behind with nothing to say so. This holds each copy to its token.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const tokens = read('src/styles/tokens-base.css');
const ripple = read('src/live/ripple/ripple.css');

const STEPS = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

/** The px ceiling (the clamp's third term) of a type token in tokens-base.css. */
function ceiling(step: string): number {
  const decl = new RegExp(`--fs-${step}:\\s*clamp\\(([\\s\\S]*?)\\);`).exec(tokens)?.[1] ?? '';
  const terms = [...decl.matchAll(/calc\(([\d.]+)px \* var\(--fs-scale\)\)/g)].map((m) => m[1]);
  return Number(terms.at(-1));
}

/** The px base Ripple's 4K rule multiplies for a step. */
function rippleBase(step: string): number {
  const block = /@media \(width >= 2560px\) and \(height >= 1500px\) \{([\s\S]*?)\n\}/.exec(
    ripple,
  )?.[1];
  return Number(
    new RegExp(`--fs-${step}:\\s*calc\\(([\\d.]+)px \\* var\\(--ripple-type\\)\\)`).exec(
      block ?? '',
    )?.[1],
  );
}

describe('Ripple 4K type ramp', () => {
  it.each(STEPS)('--fs-%s starts from the token ceiling', (step) => {
    expect(ceiling(step)).toBeGreaterThan(0);
    expect(rippleBase(step)).toBe(ceiling(step));
  });

  it('is named on the breakpoint ladder, not a one-off', () => {
    expect(ripple).not.toMatch(/container:\s*ripple-scrim/);
  });
});
