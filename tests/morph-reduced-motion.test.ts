// A reduced-motion rule ENDS an entrance; it must never restate geometry. The morph stage is
// exactly the surface where getting that wrong is invisible in review: the world layer mixes HTML
// faces (where `translate(-50%, -50%)` is a centring anchor) with SVG chrome and edges (where
// `transform-box: view-box` makes the same declaration resolve against the whole viewBox and slide
// the connection layer half a world away). The mindshape sheet learned that the hard way — this is
// the same source-scan, applied before the morph can repeat it. Unit tests strip CSS, so it reads
// the source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync('src/canvas/spatial/morph/morph.css', 'utf8');
/** Classes that paint SVG geometry, where a percentage transform resolves against the viewBox. */
const SVG_SELECTORS = [
  '.mv-band',
  '.mv-edges',
  '.mv-chrome-svg',
  '.morph-edge',
  '.morph-series',
  '.morph-gridline',
  '.morph-axis',
  '.morph-tick',
];

/** Every `@media (prefers-reduced-motion: reduce) { … }` body in the sheet, by brace matching. */
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
  return blocks;
}

/** `{ selector, body }` for every rule in a block, comments stripped. */
function rules(block: string): { selector: string; body: string }[] {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

describe('morph reduced motion', () => {
  const blocks = reducedMotionBlocks(CSS);

  it('answers reduced motion in exactly one place', () => {
    expect(blocks).toHaveLength(1);
  });

  it('only kills transitions', () => {
    for (const rule of rules(blocks[0])) {
      expect(rule.body, `"${rule.selector}" must not set transform`).not.toMatch(/\btransform\s*:/);
      const declared = rule.body
        .split(';')
        .map((d) => d.split(':')[0].trim())
        .filter(Boolean);
      expect(declared, rule.selector).toEqual(['transition']);
      expect(rule.body).toMatch(/transition\s*:\s*none/);
    }
  });

  it('never selects the SVG geometry layers', () => {
    for (const rule of rules(blocks[0])) {
      for (const part of rule.selector.split(',')) {
        const sel = part.trim();
        for (const svg of SVG_SELECTORS) {
          expect(sel.endsWith(svg), `"${sel}" is SVG geometry`).toBe(false);
        }
      }
    }
  });
});
