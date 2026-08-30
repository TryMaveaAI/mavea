import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { studyVoices } from '../src/live/content/studyVoices';
import { PEN_MARK_MAX, PEN_SLOTS } from '../src/live/content/penQuip';

// The Study pins four notes beside each object, and each has two possible authors: the model
// (in `block.study`, written in the same call as the answer) or Mavéa's own read of the object.
// These pin WHICH one speaks — the whole point of the field is that a model-authored voice can
// carry a fact the card does not contain, while a derived one can only ever re-read the card.

function block(study?: Block['study']): Block {
  return {
    type: 'breakdown',
    id: 'live-1',
    col: 6,
    props: {
      title: 'Needs: where the $2,500 goes',
      rows: [
        { name: 'Rent', val: '$1,200', pct: 48 },
        { name: 'Groceries', val: '$400', pct: 16 },
      ],
    },
    ...(study ? { study } : {}),
  } as Block;
}

const FULL = {
  assumes: 'The 48% rent share assumes rent stays fixed through the year.',
  pattern: 'The old benchmark is 30% of gross on housing, so $1,200 on $5,000 is comfortable.',
  test: 'Is renters’ insurance inside that $250, or a seventh row nobody counted?',
};

describe('studyVoices — the model speaks first, Mavéa is the floor', () => {
  it('always returns the four voices in the design’s order', () => {
    for (const b of [block(), block(FULL)]) {
      const notes = studyVoices(b, 0, null, 'standard');
      expect(notes).toHaveLength(4);
      expect(notes.map((n) => n.kind)).toEqual(['caution', 'insight', 'evidence', 'question']);
      for (const n of notes) expect(n.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses the model’s margin voices verbatim when it wrote them', () => {
    const notes = studyVoices(block(FULL), 0, null, 'standard');
    expect(notes[0].text).toBe(FULL.assumes);
    expect(notes[1].text).toBe(FULL.pattern);
    expect(notes[3].text).toBe(FULL.test);
  });

  it('falls back per-slot, so one missing voice never blanks the others', () => {
    const derived = studyVoices(block(), 0, null, 'standard');
    const partial = studyVoices(block({ pattern: FULL.pattern }), 0, null, 'standard');
    expect(partial[1].text).toBe(FULL.pattern);
    // The two the model left out are Mavéa's own reads, identical to the fully-derived case.
    expect(partial[0].text).toBe(derived[0].text);
    expect(partial[3].text).toBe(derived[3].text);
  });

  it('never lets the model author the evidence check', () => {
    // A model-authored receipt would be a fabricated one: the evidence voice is Mavéa's reading
    // of the turn's REAL sources, and with none attached it says exactly that.
    const forged = { ...FULL, pattern: 'x' } as Block['study'];
    const notes = studyVoices(block(forged), 0, null, 'standard');
    expect(notes[2].kind).toBe('evidence');
    expect(notes[2].text).toContain('no sources are attached');
    expect(Object.values(FULL)).not.toContain(notes[2].text);
  });

  it('keeps the margin quip on the first note, model-authored or not', () => {
    // The scrawl is read from the block's own structure, so it rides the assumption either way.
    const derived = studyVoices(block(), 0, null, 'standard');
    const authored = studyVoices(block(FULL), 0, null, 'standard');
    expect(derived[0].marks?.length).toBeGreaterThan(0);
    expect(authored[0].marks).toEqual(derived[0].marks);
  });

  it('draws the model’s scrawls in the margin when it wrote them', () => {
    const notes = studyVoices(
      block({ ...FULL, scrawls: ['rent 24% of gross — under the rule', 'only rent is fixed'] }),
      0,
      null,
      'standard',
    );
    expect(notes[0].marks?.map((m) => m.text)).toEqual([
      'rent 24% of gross — under the rule',
      'only rent is fixed',
    ]);
    expect(notes[0].marks?.map((m) => m.slot)).toEqual(['left', 'bottom']);
  });

  it('drops a scrawl too wide for the margin rather than truncating it', () => {
    const wide = 'x'.repeat(PEN_MARK_MAX + 1);
    const kept = 'gross ≠ net here';
    const notes = studyVoices(block({ scrawls: [wide, kept] }), 0, null, 'standard');
    expect(notes[0].marks?.map((m) => m.text)).toEqual([kept]);
    // And when EVERY scrawl is too wide, the derived pair carries the margin instead of leaving
    // the card bare.
    const none = studyVoices(block({ scrawls: [wide, wide] }), 0, null, 'standard');
    expect(none[0].marks?.length).toBeGreaterThan(0);
    expect(none[0].marks?.map((m) => m.text)).not.toContain(wide);
  });

  it('varies the derived assumption by explain level, and the model’s never', () => {
    const simple = studyVoices(block(), 0, null, 'simple')[0].text;
    const deep = studyVoices(block(), 0, null, 'deep')[0].text;
    expect(simple).not.toBe(deep);
    // The model wrote its voice AT the reader's level already (the prompt says so), so the level
    // must not then rewrite it underneath.
    expect(studyVoices(block(FULL), 0, null, 'simple')[0].text).toBe(FULL.assumes);
    expect(studyVoices(block(FULL), 0, null, 'deep')[0].text).toBe(FULL.assumes);
  });
});

describe('the desk draws every slot the scrawls can land in', () => {
  // PEN_SLOTS is the only list; the CSS positions are the other half of the same contract, and
  // TypeScript cannot see a stylesheet. A slot added to the union without a rule renders at the
  // card's top-left corner, on top of whatever is already there.
  const css = readFileSync(join(__dirname, '..', 'src/canvas/study/study.css'), 'utf8');

  it.each(PEN_SLOTS)('positions .slot-%s', (slot) => {
    expect(css).toContain(`.study-mark.slot-${slot} {`);
    expect(css).toContain(`.study-mark.slot-${slot} .study-mark-arrow {`);
  });

  it('aligns every scrawl toward the side its own arrow is on', () => {
    // The box is a fixed width so a long remark wraps in place. That means a SHORT one has to be
    // pushed to the arrow's end, or it floats out in the parchment with a gap the arrow never
    // crosses — measured at ~80px on slot-top, where "predictable" sat right-aligned while its
    // arrow started at the box's left edge.
    const rule = (slot: string): string => {
      const at = css.indexOf(`.study-mark.slot-${slot} {`);
      return css.slice(at, css.indexOf('}', at));
    };
    const arrowRule = (slot: string): string => {
      const at = css.indexOf(`.study-mark.slot-${slot} .study-mark-arrow {`);
      return css.slice(at, css.indexOf('}', at));
    };
    for (const slot of PEN_SLOTS) {
      // An arrow pinned by `left` reaches rightward from the box's left edge, so the words start
      // there; one pinned by `right` reaches leftward, so the words end there.
      const arrowOnLeft = /left:\s*-/.test(arrowRule(slot));
      const align = /text-align:\s*(\w+)/.exec(rule(slot))?.[1] ?? 'left';
      expect(align, `${slot} hugs its arrow`).toBe(arrowOnLeft ? 'left' : 'right');
    }
  });

  it('places the two later slots by PERCENTAGE, so they hold at any card height', () => {
    // A card is sized by its content, so a fixed offset is only ever right for one card. These
    // two sit between the fixed three; measured, a third hand down the LEFT margin collides with
    // slot-bottom below ~200px of card, which is why both of these are in the right gutter.
    for (const slot of ['right', 'rightlow'] as const) {
      const rule = css.slice(css.indexOf(`.study-mark.slot-${slot} {`));
      expect(rule.slice(0, rule.indexOf('}'))).toMatch(/top:\s*\d+%/);
    }
  });
});

describe('a dense slide gets the ink it earned, whatever the model wrote', () => {
  // The prompt asks for a count keyed to the block's density, but asking is not enough: measured
  // on live turns a small model settles on two scrawls whatever it is looking at, so a four-row
  // breakdown came out annotated exactly like a one-figure card.
  function rows(n: number, scrawls?: string[]): Block {
    return {
      type: 'breakdown',
      id: 'live-1',
      col: 6,
      props: {
        title: 'Needs',
        rows: Array.from({ length: n }, (_, i) => ({
          name: `Row ${i + 1}`,
          val: `$${i + 1}00`,
          pct: 10,
        })),
      },
      ...(scrawls ? { study: { scrawls } } : {}),
    } as Block;
  }

  it('tops a four-row block up to three scrawls when the model wrote two', () => {
    const marks = studyVoices(rows(4, ['a', 'b']), 0, null, 'standard')[0].marks ?? [];
    expect(marks).toHaveLength(3);
    expect(marks.slice(0, 2).map((m) => m.text)).toEqual(['a', 'b']);
  });

  it('tops up as far as the block can honestly be read', () => {
    // The floor is a target, not a promise: the derived readings are bespoke per block type and
    // there are two of them, so a six-row block the model gave one scrawl reaches three, not
    // four. Inventing a third to hit a number is the stock-phrase failure this file exists to
    // avoid — better a slide with three real remarks than four where one says nothing.
    expect(studyVoices(rows(6, ['a']), 0, null, 'standard')[0].marks).toHaveLength(3);
    expect(studyVoices(rows(6, ['a', 'b']), 0, null, 'standard')[0].marks).toHaveLength(4);
  });

  it('leaves a sparse block at the count the model chose', () => {
    // Two rows earn two remarks; topping THAT up is the annoying end of the trade.
    expect(studyVoices(rows(2, ['a']), 0, null, 'standard')[0].marks).toHaveLength(1);
  });

  it('never repeats a remark the model already wrote', () => {
    const derived = studyVoices(rows(6), 0, null, 'standard')[0].marks ?? [];
    const authored = studyVoices(rows(6, [derived[0].text]), 0, null, 'standard')[0].marks ?? [];
    const texts = authored.map((m) => m.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('never fills more slots than the desk draws', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(studyVoices(rows(9, many), 0, null, 'standard')[0].marks).toHaveLength(PEN_SLOTS.length);
  });
});
