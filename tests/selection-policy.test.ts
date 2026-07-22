import { select as selectComponents } from './helpers/select';
import { describe, it, expect } from 'vitest';

import { annotateMenu } from '../src/live/select/synthesis';
import { ANNOTATABLE_TYPES } from '../src/engine/liveSchema';
import { ARCHETYPE_BASE, COERCIBLE_TYPES } from '../src/live/select/catalog';
import { catalogMeta } from '../src/canvas/blocks/catalog/lookup';

// The selection POLICY, as distinct from its reach (selection-accuracy.test.ts). Three rules landed
// together and each is a promise the menu makes to the model: a better-fitting component is never
// passed over for a worse one, the leading form's plain base is always available, and randomness
// only survives where the selector has no reason to prefer one option over another.

const ROTATIONS = 24;
const menusFor = (ask: string) =>
  Array.from({ length: ROTATIONS }, (_, rotation) =>
    selectComponents({ userText: ask, tier: 'frontier', rotation }),
  );

describe('fit-first draw — relevance no longer depends on luck', () => {
  it('offers the same fitting specialists on EVERY rotation of a shaped ask', () => {
    // Before the near-tie band, a strongly-fitting component won the menu only as often as the
    // weighted draw happened to pick it (diagramflow surfaced ~5% of rotations for this ask). Fit
    // now orders the draw, so what fits is offered every single turn.
    const menus = menusFor('explain the process and feedback loop as a state machine diagram');
    for (const m of menus) expect(m.types).toContain('diagramflow');
  });

  it('a vague ask still rotates — variety survives exactly where nothing fits', () => {
    // Zero-fit candidates never enter the fit-ordered stage, so the leftover pool draws as before.
    const menus = Array.from({ length: 5 }, (_, rotation) =>
      selectComponents({ userText: 'surprise me', tier: 'frontier', rotation }).types.join('|'),
    );
    expect(new Set(menus).size).toBeGreaterThan(1);
  });

  it('is still reproducible for a given (ask, rotation)', () => {
    const ask = 'how has bitcoin changed over the past year';
    const a = selectComponents({ userText: ask, tier: 'frontier', rotation: 3 });
    const b = selectComponents({ userText: ask, tier: 'frontier', rotation: 3 });
    expect(a.types).toEqual(b.types);
  });
});

describe("the leading form's base is always offered", () => {
  it('pins a plain codeblock even when specialized code views out-score it', () => {
    // `codewalk`, `terminal` and `algorithmtrace` all out-fit `codeblock` on this ask and would take
    // every clustered slot; the base pin is what keeps an ordinary code answer reachable.
    for (const m of menusFor('how do i reverse a linked list in javascript')) {
      expect(m.types).toContain('codeblock');
    }
  });

  it('pins the real map for a location ask rather than a stylized lookalike', () => {
    for (const m of menusFor("what's near the riverwalk in chicago")) {
      expect(m.types).toContain('geomap');
      expect(m.types).not.toContain('markermap');
    }
  });

  it('every archetype base names a component Live can actually build', () => {
    // A base may borrow another form's component when it has no dedicated one (distribution → bars,
    // tree → breakdown) — what the pin depends on is that the type exists and is coercible, so
    // pinning it can never put an unbuildable type in the menu or the validator gate.
    for (const [archetype, base] of Object.entries(ARCHETYPE_BASE)) {
      expect(catalogMeta(base as string), `ARCHETYPE_BASE.${archetype} → "${base}"`).toBeTruthy();
      expect(COERCIBLE_TYPES.has(base as string), `${base} is not coercible`).toBe(true);
    }
  });
});

describe('annotate-the-base rung', () => {
  it('only ever advertises bases whose renderer honors annotations', () => {
    // The prompt is generated from ANNOTATABLE_TYPES, so a base can never be taught a field that
    // would be silently dropped on render.
    expect(ANNOTATABLE_TYPES.has('datatable')).toBe(true);
    for (const t of ANNOTATABLE_TYPES) expect(catalogMeta(t)).toBeTruthy();
  });

  it('names the offered bases and demands the annotations refer to real data', () => {
    const menu = annotateMenu(['datatable']);
    expect(menu).toContain('datatable');
    expect(menu).toMatch(/actually in the block/i);
    expect(menu).toMatch(/receipt/i);
  });
});
