// A source scan over the edge sheet and the marker set. These are cascade facts jsdom cannot
// compute — it does not resolve `marker-end` — so they are asserted against the text of the rules
// themselves, which is also what makes them survive a rename.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src/canvas/spatial/morph/morph.css'), 'utf8');
const stage = readFileSync(
  join(__dirname, '..', 'src/canvas/spatial/morph/MorphStage.tsx'),
  'utf8',
);

/** Every rule in the sheet as { selectors, body }. Comments are stripped first, and a grouped
 *  selector is split — a rule may legitimately be written as a list, and matching the whole list as
 *  one string would quietly find nothing. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  sels: sel
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sel: sel.trim(),
  body,
}));
const ruleFor = (selector: string) => rules.find((r) => r.sels.includes(selector));

describe('an unbacked link keeps its direction', () => {
  it('never removes the head from a provisional edge', () => {
    // The dash and the ink weight already say "nothing behind this". Saying it a third time by
    // deleting the head takes a channel that carries an independent claim — WHICH WAY the causation
    // runs — which the gate never touched. On a world wide enough to wrap, an edge re-enters at the
    // LEFT of the next band, so a reader applying "left is cause" reads a headless link backwards.
    const offenders = rules
      .filter((r) => r.sel.includes('provisional') && /marker-end:\s*none/.test(r.body))
      .flatMap((r) => r.sels);
    expect(offenders).toEqual([]);
  });

  it('leaves exactly one thing headless, and it is the relation that means it', () => {
    // `correlates` is headless BY DESIGN — "moves with" asserts no direction. If anything else is
    // headless, a correlation is no longer distinguishable from it.
    const headless = rules
      .filter((r) => /marker-end:\s*none/.test(r.body))
      .flatMap((r) => r.sels)
      .filter((sel) => sel.startsWith('.morph-edge'));
    for (const sel of headless) expect(sel, sel).toContain('correlates');
  });

  it('gives every relation a provisional head as well as a solid one', () => {
    for (const rel of ['causes', 'contributes', 'enables']) {
      const solid = ruleFor(`.morph-edge--rel-${rel}`);
      const prov = ruleFor(`.morph-edge--provisional.morph-edge--rel-${rel}`);
      expect(solid?.body, `${rel} solid`).toMatch(/marker-end/);
      expect(prov?.body, `${rel} provisional`).toMatch(/marker-end/);
    }
    // …and the sign idiom survives at both levels: a dampening link keeps its crossbar, because
    // whether it pushes down was never the thing in doubt.
    expect(ruleFor('.morph-edge--provisional.morph-edge--damp')?.body).toMatch(
      /mv-arrow-damp-soft/,
    );
  });
});

describe('every marker a rule asks for actually exists', () => {
  it('resolves each url(#…) in the edge sheet to a marker id the stage renders', () => {
    // Renaming a marker used to be able to silently un-head half the graph: the CSS keeps pointing
    // at an id nothing defines, and SVG draws no marker rather than complaining.
    const wanted = new Set(
      [...css.matchAll(/marker-(?:end|start):\s*url\(#([\w-]+)\)/g)].map(([, id]) => id),
    );
    expect(wanted.size).toBeGreaterThan(4);
    // The stage builds both sets from one table: `id` for the solid head, `${id}-soft` for the
    // lighter one. Read the table rather than the markup.
    const base = new Set([...stage.matchAll(/id:\s*'([\w-]+)'/g)].map(([, id]) => id));
    const defined = new Set([...base, ...[...base].map((id) => `${id}-soft`)]);
    expect([...wanted].filter((id) => !defined.has(id))).toEqual([]);
  });
});
