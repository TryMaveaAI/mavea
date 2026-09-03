// The Study's pen marks are drawn into an `.ink-layer` that is `position: absolute; inset: 0`
// and carries the HOST CARD's box as its viewBox, with preserveAspectRatio="none". So the front
// card has to stay the positioning context that layer resolves against: the moment a rule hands
// it back to the stage, every stroke stretches to the stage's height and lands well below the
// words it points at. The compact desk (a laptop-height window) did exactly that by reflowing the
// card with `position: static`, which is invisible in jsdom — hence this source scan.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(__dirname, '../src/canvas/study/study.css'), 'utf8');

/** Every rule block whose selector list mentions the front card. */
function frontCardRules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const selector = m[1].trim();
    if (/\.study-card\b[^,{]*\.is-front\b|\.is-front\b[^,{]*\.study-card\b/.test(selector)) {
      out.push({ selector: selector.replace(/\s+/g, ' '), body: m[2] });
    }
  }
  return out;
}

describe('the Study front card stays the anchor its ink layer measures against', () => {
  it('finds the front-card rules at all (the scan is not silently empty)', () => {
    expect(frontCardRules().length).toBeGreaterThan(0);
  });

  it('never drops the front card out of the positioning context', () => {
    const offenders = frontCardRules()
      .filter((r) => /(^|[;{\s])position:\s*static\b/.test(r.body))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });

  it('keeps the compact desk’s front card positioned', () => {
    const compact = frontCardRules().find((r) =>
      /\[data-compact\][^,]*\.study-card\.is-front\s*$/.test(r.selector),
    );
    expect(compact).toBeDefined();
    expect(compact!.body).toMatch(/position:\s*relative\b/);
  });
});
