import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { studyVoices } from '../src/live/content/studyVoices';
import { PEN_MARK_MAX } from '../src/live/content/penQuip';

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
