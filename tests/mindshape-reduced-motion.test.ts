// The reduced-motion rules must END each entrance, never MOVE anything. A percentage translate
// means two different things on the two kinds of element the map draws with: on a card (an HTML
// div) `translate(-50%, -50%)` is its centring anchor, but on an SVG path `transform-box` is
// `view-box`, so the same declaration resolves against the whole 1000×700 viewBox and slides the
// entire connection layer half a map up and to the left. Everyone with "Reduce motion" on — and
// every generated README screenshot, since the capture emulates it — saw spokes and tension
// threads floating off the cards they connect. Unit tests strip CSS, so this reads the source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync('src/canvas/blocks/diagrams/mindshape.css', 'utf8');
/** Classes that are SVG geometry, where a percentage transform resolves against the viewBox. */
const SVG_SELECTORS = ['.ms-spoke', '.ms-thread', '.ms-link'];

/** Every `@media (prefers-reduced-motion: reduce) { … }` body in the sheet, by brace matching —
 *  the surface has several, one per group of animated parts. */
function reducedMotionBlocks(css: string): string[] {
  const AT = '@media (prefers-reduced-motion: reduce)';
  const blocks: string[] = [];
  for (let at = css.indexOf(AT); at !== -1; at = css.indexOf(AT, at + AT.length)) {
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(css.slice(open + 1, i));
          break;
        }
      }
    }
  }
  expect(blocks.length).toBeGreaterThan(0);
  return blocks;
}

/** `{ selector, declarations }` for every rule in a block, comments stripped. */
function rules(block: string): { selector: string; body: string }[] {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

describe('mindshape reduced motion', () => {
  const reduced = reducedMotionBlocks(CSS).flatMap(rules);

  it('never transforms the SVG connection layer', () => {
    for (const rule of reduced) {
      const touchesSvg = SVG_SELECTORS.some((sel) =>
        rule.selector.split(',').some((s) => s.trim().endsWith(sel)),
      );
      if (!touchesSvg) continue;
      expect(rule.body, `"${rule.selector}" must not set transform`).not.toMatch(/\btransform\s*:/);
    }
  });

  it('still finishes the spoke and thread stroke reveal', () => {
    const drawn = reduced.filter((r) => r.body.includes('stroke-dashoffset: 0'));
    for (const sel of SVG_SELECTORS) {
      expect(
        drawn.some((r) => r.selector.split(',').some((s) => s.trim().endsWith(sel))),
        `${sel} must end its stroke reveal under reduced motion`,
      ).toBe(true);
    }
  });

  it('keeps a card on its own centre through the settle reveal', () => {
    // `transform: none` on a card drops it half a card off its position — the same bug in the
    // other direction. Only the action bar (which rises by a transform) may clear it.
    for (const rule of reduced) {
      if (!/\btransform\s*:\s*none/.test(rule.body)) continue;
      expect(rule.selector).not.toMatch(/\.ms-card/);
    }
  });
});
