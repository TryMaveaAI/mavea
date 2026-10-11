import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// The dock's row collapsed on WINDOW width, but the session rail takes 236px of dock without the
// window changing: at 560-900px wide the labelled row overflowed, the ask field shrank to a few
// pixels and the send disc ran off the end. Geometry is the browser's to measure (audit:surfaces
// does); this pins the cause — every collapse of that row answers to the dock (`.live-dock` is an
// inline-size container), and the spark's phase-width floor comes off when it goes square.

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of every at-rule block whose prelude matches, with nested braces balanced. */
function blocks(css: string, prelude: RegExp): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(new RegExp(prelude.source + '\\s*\\{', 'g'))) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}

const composer = read('src/styles/composer.css');
const dock = read('src/live/livedock.css');
const ask = read('src/styles/living-answer-ask.css');
const media = (css: string) => blocks(css, /@media[^{]*/).join('\n');
const container = (css: string) => blocks(css, /@container[^{]*/).join('\n');

describe('the dock row fits the dock, whatever the window', () => {
  it('collapses on the dock container, never on a window query', () => {
    for (const css of [composer, dock, ask]) {
      expect(media(css)).not.toMatch(/\.composer\s*\{[^}]*grid-template-columns/);
      expect(media(css)).not.toMatch(/\.(mark-toggle-label|composer-watch span)\b/);
    }
    expect(container(dock)).toMatch(/\.composer\s*\{[^}]*grid-template-columns/);
    expect(container(dock)).toMatch(/\.mark-toggle-label\s*\{\s*display:\s*none/);
  });

  it('takes the spark’s width floor off when it goes square', () => {
    expect(container(composer)).toMatch(/\.composer-watch\s*\{[^}]*min-width:\s*0/);
  });
});

describe('a topbar menu paints over the session rail', () => {
  it('lifts the bar above the rail while a menu is open', () => {
    const room = read('src/styles/living-answer-room.css');
    const rail = read('src/styles/side-rail.css');
    const railZ = Number(/\.side-rail\s*\{[^}]*z-index:\s*(\d+)/.exec(rail)?.[1]);
    const lift = Number(/\.topbar:has\(\.tpl-menu\)\s*\{[^}]*z-index:\s*(\d+)/.exec(room)?.[1]);
    expect(railZ).toBeGreaterThan(0);
    expect(lift).toBeGreaterThan(railZ);
  });
});

describe('the wide-board header grid keeps its children full width', () => {
  // At >= 1600px the answer wrap becomes a grid so the hero and the doors share a row. A grid item
  // centred with `margin-inline: auto` shrinks to its content where a block child stretches — the
  // working skeletons collapsed into one narrow column of plates under the face.
  it('gives every child of the grid its width back, at zero specificity', () => {
    const stage = read('src/styles/living-answer-stage.css');
    const wide = blocks(stage, /@media \(width >= 1600px\)/).join('\n');
    expect(wide).toMatch(/display:\s*grid/);
    expect(wide).toMatch(/:where\([^{]*\.topic-wrap[^{]*\)\s*>\s*\*\s*\{\s*width:\s*100%/);
  });
});
