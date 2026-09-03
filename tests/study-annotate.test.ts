import { describe, expect, it } from 'vitest';
import { PEN_MARK_MAX } from '../src/live/content/penQuip';
import type { Block } from '../src/data/conversation';
import { coerceStudyNotes, STUDY_MARKS_MAX } from '../src/engine/liveSchema';

// The Study's notes are bought in their own call now. That call's reply is keyed by BLOCK ID
// against an answer that already exists, so the coercer's job is different from the answer
// path's: it must refuse an id it does not recognise, and hold every gesture to exactly the gate
// a tour stop is held to — the notes were authored without the answer's own schema in front of
// the model, so they are the LESS trusted input of the two, not the more.

const blocks = [
  {
    type: 'insight',
    id: 'live-1',
    col: 4,
    props: { title: 'ARR', stat: '$15.1M', summary: 'Up from $12.4M.' },
  },
  {
    type: 'list',
    id: 'live-2',
    col: 6,
    props: { title: 'Drivers', items: ['New logos', 'Expansion'] },
  },
] as unknown as Block[];

const reply = (notes: unknown) => coerceStudyNotes({ notes } as never, blocks);

describe('coerceStudyNotes — the reply is keyed to the answer it annotates', () => {
  it('files each note under the block it names', () => {
    const out = reply([
      { id: 'live-2', assumes: 'Both drivers are counted net of churn.' },
      { id: 'live-1', pattern: 'A 21.8% quarter annualises to well past doubling.' },
    ]);
    expect(out.get('live-1')?.pattern).toBe('A 21.8% quarter annualises to well past doubling.');
    expect(out.get('live-2')?.assumes).toBe('Both drivers are counted net of churn.');
  });

  it('drops a note for a block that is not on this answer', () => {
    // Ids are the join. A note filed under a stale or invented id would otherwise land on
    // whichever card happened to share the position.
    expect(reply([{ id: 'live-9', assumes: 'x' }]).size).toBe(0);
    expect(reply([{ assumes: 'x' }]).size).toBe(0);
  });

  it('holds a gesture to the same gate a tour stop is held to', () => {
    const kept = reply([{ id: 'live-1', marks: [{ kind: 'circle', at: '$15.1M' }] }]);
    expect(kept.get('live-1')?.marks).toEqual([{ kind: 'circle', at: '$15.1M' }]);
    // An unknown kind, a target-less mark, and doubting a figure the answer called certain.
    expect(reply([{ id: 'live-1', marks: [{ kind: 'sparkle', at: '$15.1M' }] }]).size).toBe(0);
    expect(reply([{ id: 'live-1', marks: [{ kind: 'circle' }] }]).size).toBe(0);
    expect(reply([{ id: 'live-1', marks: [{ kind: 'question', at: '$15.1M' }] }]).size).toBe(0);
  });

  it('caps how much pen one slide can wear, however much is sent', () => {
    const many = Array.from({ length: STUDY_MARKS_MAX + 6 }, (_, i) => ({
      kind: 'point',
      at: i % 2 ? '$15.1M' : '$12.4M',
    }));
    const marks = reply([{ id: 'live-1', marks: many }]).get('live-1')?.marks ?? [];
    expect(marks.length).toBeLessThanOrEqual(STUDY_MARKS_MAX);
  });

  it('reads a reply wrapped in prose or code fences', () => {
    const raw = '```json\n{"notes":[{"id":"live-1","assumes":"Rates hold."}]}\n```';
    expect(coerceStudyNotes(raw as never, blocks).get('live-1')?.assumes).toBe('Rates hold.');
  });

  it('returns nothing rather than throwing on junk', () => {
    for (const junk of ['not json', '', '{}', '{"notes":"nope"}']) {
      expect(() => coerceStudyNotes(junk as never, blocks)).not.toThrow();
      expect(coerceStudyNotes(junk as never, blocks).size).toBe(0);
    }
  });
});

describe('a scrawl that cannot fit the margin is dropped, not cut', () => {
  // The coercer used to `.slice(0, 80)` while `studyVoices` filters on PEN_MARK_MAX (46). Anything
  // between the two was mangled to a length nothing draws, then coerced, cached, and discarded at
  // render — output the reader paid for and never saw. One constant, one outcome.
  it('keeps what fits and drops what does not', () => {
    const long = 'x'.repeat(PEN_MARK_MAX + 1);
    const notes = coerceStudyNotes(
      {
        notes: [
          { id: 'live-1', assumes: 'A.', pattern: 'B.', test: 'C?', scrawls: ['fits', long] },
        ],
      } as never,
      blocks,
    );
    expect(notes.get('live-1')?.scrawls).toEqual(['fits']);
  });

  it('never stores a truncated remark', () => {
    const notes = coerceStudyNotes(
      {
        notes: [
          {
            id: 'live-1',
            assumes: 'A.',
            pattern: 'B.',
            test: 'C?',
            scrawls: ['y'.repeat(PEN_MARK_MAX + 20)],
          },
        ],
      } as never,
      blocks,
    );
    for (const s of notes.get('live-1')?.scrawls ?? [])
      expect(s.length).toBeLessThanOrEqual(PEN_MARK_MAX);
  });
});
