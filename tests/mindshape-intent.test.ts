// mindshape-intent.test.ts — detectIntent classifies thinking sessions correctly.
import { describe, expect, it } from 'vitest';
import { detectIntent } from '../src/live/mindshape/intentDetect';
import type { MindAtom, MindShapeSpec } from '../src/live/mindshape/types';

function atom(kind: MindAtom['kind'], id: string = kind): MindAtom {
  return { id, kind, label: id, quote: `quote ${id}`, status: 'stable', confidence: 'said' };
}

function spec(atoms: MindAtom[], hasTension = false): MindShapeSpec {
  return {
    center: '',
    atoms,
    links: hasTension
      ? [{ from: atoms[0]?.id ?? 'a', to: atoms[1]?.id ?? 'b', kind: 'tensions' }]
      : [],
  };
}

describe('detectIntent', () => {
  it('returns general for an empty spec', () => {
    expect(detectIntent({ center: '', atoms: [], links: [] })).toBe('general');
  });

  it('decision: ≥2 options + a real tension (non-provisional)', () => {
    const s: MindShapeSpec = {
      center: '',
      atoms: [atom('option', 'a'), atom('option', 'b'), atom('fear', 'c')],
      links: [{ from: 'a', to: 'b', kind: 'tensions' }],
    };
    expect(detectIntent(s)).toBe('decision');
  });

  it('decision is NOT triggered by a provisional tension', () => {
    const s: MindShapeSpec = {
      center: '',
      atoms: [atom('option', 'a'), atom('option', 'b')],
      links: [{ from: 'a', to: 'b', kind: 'tensions', provisional: true }],
    };
    // No real tension → falls through to general (no planning/exploration/processing criteria met)
    expect(detectIntent(s)).toBe('general');
  });

  it('planning: ≥3 open_loops/actions', () => {
    const s = spec([
      atom('open_loop', 'l1'),
      atom('open_loop', 'l2'),
      atom('action', 'a1'),
      atom('want', 'w1'),
    ]);
    expect(detectIntent(s)).toBe('planning');
  });

  it('planning: open_loops + actions count together', () => {
    const s = spec([atom('open_loop', 'l1'), atom('action', 'a1'), atom('action', 'a2')]);
    expect(detectIntent(s)).toBe('planning');
  });

  it('exploration: ≥40% questions', () => {
    const s = spec([
      atom('question', 'q1'),
      atom('question', 'q2'),
      atom('question', 'q3'),
      atom('want', 'w1'),
      atom('fear', 'f1'),
    ]);
    expect(detectIntent(s)).toBe('exploration');
  });

  it('processing: fears + wants + persons ≥50%', () => {
    const s = spec([
      atom('fear', 'f1'),
      atom('want', 'w1'),
      atom('person', 'p1'),
      atom('constraint', 'c1'),
    ]);
    expect(detectIntent(s)).toBe('processing');
  });

  it('decision takes priority over planning when both criteria are met', () => {
    // 2 options + tension + 3 open loops → decision wins (checked first)
    const s: MindShapeSpec = {
      center: '',
      atoms: [
        atom('option', 'o1'),
        atom('option', 'o2'),
        atom('open_loop', 'l1'),
        atom('open_loop', 'l2'),
        atom('open_loop', 'l3'),
      ],
      links: [{ from: 'o1', to: 'o2', kind: 'tensions' }],
    };
    expect(detectIntent(s)).toBe('decision');
  });

  it('general: mixed atoms that fit no specific category', () => {
    const s = spec([atom('want', 'w1'), atom('constraint', 'c1'), atom('tradeoff', 't1')]);
    expect(detectIntent(s)).toBe('general');
  });
});
