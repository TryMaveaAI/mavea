// mindshape-validate.test.ts — unit tests for validateMindShape.
// Exercises the safety and coercion rules: drop atoms without quotes,
// force unsaid.confidence='maybe', strip clinical terms, clamp lengths.
import { describe, it, expect } from 'vitest';
import { validateMindShape, validateMindShapePatch } from '../src/live/mindshape/validate';
import type { MindShapeSpec } from '../src/live/mindshape/types';

const VALID_SHAPE: MindShapeSpec = {
  center: 'Is it the right time — or am I just running?',
  atoms: [
    {
      id: 'a1',
      kind: 'option',
      label: 'Take the Seattle offer',
      quote: "there's this offer in Seattle it's more money",
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
    {
      id: 'a2',
      kind: 'fear',
      label: 'Scared of staying still',
      quote: "i think i'm just scared of staying still",
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
  ],
  links: [{ from: 'a1', to: 'a2', kind: 'tensions', label: 'pulls against' }],
  clusters: [{ id: 'c1', label: 'The Seattle offer', atomIds: ['a1', 'a2'], weight: 2 }],
};

describe('validateMindShape', () => {
  it('returns a valid shape unchanged', () => {
    const result = validateMindShape(VALID_SHAPE);
    expect(result).not.toBeNull();
    expect(result!.center).toBe(VALID_SHAPE.center);
    expect(result!.atoms).toHaveLength(2);
  });

  it('parses a raw JSON string', () => {
    const result = validateMindShape(JSON.stringify(VALID_SHAPE));
    expect(result).not.toBeNull();
    expect(result!.atoms).toHaveLength(2);
  });

  it('extracts JSON embedded in prose', () => {
    const result = validateMindShape(
      `Here is the mindshape: ${JSON.stringify(VALID_SHAPE)} — hope that helps.`,
    );
    expect(result).not.toBeNull();
  });

  it('returns null for empty input', () => {
    expect(validateMindShape(null)).toBeNull();
    expect(validateMindShape(undefined)).toBeNull();
    expect(validateMindShape('')).toBeNull();
    expect(validateMindShape('{}')).toBeNull();
  });

  it('returns null when center is missing', () => {
    const { center: _c, ...withoutCenter } = VALID_SHAPE;
    expect(validateMindShape(withoutCenter)).toBeNull();
  });

  it('drops atoms that have no quote', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [
        ...VALID_SHAPE.atoms,
        {
          id: 'a3',
          kind: 'want',
          label: 'Career growth',
          quote: '',
          status: 'stable',
          confidence: 'said',
        },
        { id: 'a4', kind: 'want', label: 'Something else', status: 'stable', confidence: 'said' },
      ],
    };
    const result = validateMindShape(shape);
    expect(result).not.toBeNull();
    // Only the two with real quotes should survive
    expect(result!.atoms).toHaveLength(2);
    expect(result!.atoms.every((a) => a.quote.trim().length > 0)).toBe(true);
  });

  it('forces unsaid.confidence to "maybe" regardless of model output', () => {
    const shape = {
      ...VALID_SHAPE,
      unsaid: {
        label: 'This is not about the job',
        why: 'She keeps framing it as career but circles back to fear',
        confidence: 'certain', // model tried to claim certainty
      },
    };
    const result = validateMindShape(shape);
    expect(result?.unsaid?.confidence).toBe('maybe');
  });

  it('preserves a complete ordinary-length unsaid sentence instead of inserting an ellipsis', () => {
    const label = 'How are the special cases actually supposed to interact with the main rule?';
    const shape = {
      ...VALID_SHAPE,
      unsaid: {
        label,
        why: 'The question kept resurfacing without a direct answer.',
        confidence: 'maybe',
      },
    };

    const result = validateMindShape(shape);

    expect(result?.unsaid?.label).toBe(label);
    expect(result?.unsaid?.label).not.toContain('…');
  });

  it('drops unsaid entirely when label is missing', () => {
    const shape = {
      ...VALID_SHAPE,
      unsaid: { label: '', why: 'some explanation', confidence: 'maybe' },
    };
    const result = validateMindShape(shape);
    expect(result?.unsaid).toBeUndefined();
  });

  it('clamps center to ≤90 chars', () => {
    const longCenter =
      'Is it the right time or am I just running away from everything because I am afraid of what happens if I actually stay somewhere long enough to find out?';
    const shape = { ...VALID_SHAPE, center: longCenter };
    const result = validateMindShape(shape);
    expect(result).not.toBeNull();
    expect(result!.center.length).toBeLessThanOrEqual(90);
  });

  it('clamps atom labels to ≤80 chars', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [
        {
          ...VALID_SHAPE.atoms[0],
          label:
            'This is an extremely long label that exceeds the maximum allowed length for display purposes',
        },
        VALID_SHAPE.atoms[1],
      ],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms[0].label.length).toBeLessThanOrEqual(80);
  });

  it('clamps quotes to ≤120 chars', () => {
    const longQuote = 'a'.repeat(200);
    const shape = {
      ...VALID_SHAPE,
      atoms: [{ ...VALID_SHAPE.atoms[0], quote: longQuote }, VALID_SHAPE.atoms[1]],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms[0].quote.length).toBeLessThanOrEqual(120);
  });

  it('drops atoms with clinical language in the label', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [
        VALID_SHAPE.atoms[0],
        {
          id: 'a_clinical',
          kind: 'fear',
          label: 'Borderline personality patterns',
          quote: 'she acts a certain way sometimes',
          status: 'stable',
          confidence: 'inferred',
        },
      ],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms.some((a) => a.id === 'a_clinical')).toBe(false);
  });

  it('drops atoms with clinical language in the quote', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [
        VALID_SHAPE.atoms[0],
        {
          id: 'a_clinical2',
          kind: 'fear',
          label: 'Fear of intimacy',
          quote: 'shows signs of avoidant attachment in relationships',
          status: 'stable',
          confidence: 'inferred',
        },
      ],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms.some((a) => a.id === 'a_clinical2')).toBe(false);
  });

  it('drops links that reference non-existent atoms', () => {
    const shape = {
      ...VALID_SHAPE,
      links: [
        ...VALID_SHAPE.links,
        { from: 'a1', to: 'nonexistent', kind: 'tensions' as const },
        { from: 'also_missing', to: 'a2', kind: 'supports' as const },
      ],
    };
    const result = validateMindShape(shape);
    // Only the original valid link should survive
    expect(result?.links).toHaveLength(1);
    expect(result?.links[0].from).toBe('a1');
    expect(result?.links[0].to).toBe('a2');
  });

  it('drops self-referencing links', () => {
    const shape = {
      ...VALID_SHAPE,
      links: [{ from: 'a1', to: 'a1', kind: 'same_thread' as const }],
    };
    const result = validateMindShape(shape);
    expect(result?.links).toHaveLength(0);
  });

  it('returns null when all atoms are invalid (no valid shape)', () => {
    const shape = {
      center: 'Is it the right time?',
      atoms: [
        // No quotes — all should be dropped
        { id: 'x1', kind: 'fear', label: 'Something', status: 'stable', confidence: 'said' },
      ],
      links: [],
    };
    expect(validateMindShape(shape)).toBeNull();
  });

  it('coerces unknown atom status to "stable"', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [{ ...VALID_SHAPE.atoms[0], status: 'unknown_status' }, VALID_SHAPE.atoms[1]],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms[0].status).toBe('stable');
  });

  it('coerces unknown atom confidence to "said"', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [{ ...VALID_SHAPE.atoms[0], confidence: 'definitely' }, VALID_SHAPE.atoms[1]],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms[0].confidence).toBe('said');
  });

  it('drops atoms with unknown kind', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [
        {
          id: 'x',
          kind: 'emotion',
          label: 'Sadness',
          quote: 'i feel sad about this',
          status: 'stable',
          confidence: 'said',
        },
        VALID_SHAPE.atoms[1],
      ],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms.some((a) => a.id === 'x')).toBe(false);
  });

  it('clamps weight to 1–3', () => {
    const shape = {
      ...VALID_SHAPE,
      atoms: [{ ...VALID_SHAPE.atoms[0], weight: 99 }, VALID_SHAPE.atoms[1]],
    };
    const result = validateMindShape(shape);
    expect(result?.atoms[0].weight).toBeLessThanOrEqual(3);
  });

  it('keeps a valid cluster with resolved atom ids', () => {
    const result = validateMindShape(VALID_SHAPE);
    expect(result?.clusters).toHaveLength(1);
    expect(result?.clusters?.[0]).toMatchObject({
      id: 'c1',
      label: 'The Seattle offer',
      atomIds: ['a1', 'a2'],
    });
  });

  it('drops a cluster member that references a non-existent atom', () => {
    const shape = {
      ...VALID_SHAPE,
      clusters: [{ id: 'c1', label: 'The offer', atomIds: ['a1', 'ghost'], weight: 1 }],
    };
    const result = validateMindShape(shape);
    expect(result?.clusters?.[0].atomIds).toEqual(['a1']);
  });

  it('drops a cluster whose members all dangle', () => {
    const shape = {
      ...VALID_SHAPE,
      clusters: [{ id: 'c1', label: 'Phantom theme', atomIds: ['ghost1', 'ghost2'] }],
    };
    const result = validateMindShape(shape);
    expect(result?.clusters).toBeUndefined();
  });

  it('de-dupes repeated cluster member ids', () => {
    const shape = {
      ...VALID_SHAPE,
      clusters: [{ id: 'c1', label: 'The offer', atomIds: ['a1', 'a1', 'a2'] }],
    };
    const result = validateMindShape(shape);
    expect(result?.clusters?.[0].atomIds).toEqual(['a1', 'a2']);
  });

  it('clamps cluster labels to ≤32 chars', () => {
    const shape = {
      ...VALID_SHAPE,
      clusters: [
        {
          id: 'c1',
          label: 'The move to Seattle and everything that comes with leaving home',
          atomIds: ['a1'],
        },
      ],
    };
    const result = validateMindShape(shape);
    expect(result?.clusters?.[0].label.length).toBeLessThanOrEqual(32);
  });

  it('drops a cluster with clinical language in the label', () => {
    const shape = {
      ...VALID_SHAPE,
      clusters: [{ id: 'c1', label: 'Avoidant attachment theme', atomIds: ['a1'] }],
    };
    const result = validateMindShape(shape);
    expect(result?.clusters).toBeUndefined();
  });

  it('validates a spec with no clusters and omits the field (back-compat)', () => {
    const { clusters: _c, ...withoutClusters } = VALID_SHAPE;
    const result = validateMindShape(withoutClusters);
    expect(result).not.toBeNull();
    expect(result!.atoms).toHaveLength(2);
    expect(result!.clusters).toBeUndefined();
  });
});

describe('validateMindShape — G1 verbatim grounding', () => {
  const transcript =
    "okay so there's this offer in Seattle it's more money and i'm just scared of staying still";

  it('drops an atom whose quote was never spoken', () => {
    const shape = {
      center: 'Is it the right time?',
      atoms: [
        {
          id: 'a1',
          kind: 'option',
          label: 'Seattle',
          quote: "there's this offer in Seattle",
          status: 'stable',
          confidence: 'said',
        },
        {
          id: 'a2',
          kind: 'fear',
          label: 'Invented',
          quote: "she said she'd never forgive me",
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    const result = validateMindShape(shape, transcript);
    expect(result?.atoms.map((a) => a.id)).toEqual(['a1']);
  });

  it('keeps an atom whose quote matches a transcript span verbatim', () => {
    const shape = {
      center: 'Is it the right time?',
      atoms: [
        {
          id: 'a1',
          kind: 'fear',
          label: 'Scared',
          quote: "i'm just scared of staying still",
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    expect(validateMindShape(shape, transcript)?.atoms).toHaveLength(1);
  });

  it("tolerates STT punctuation variance (its vs it's)", () => {
    const shape = {
      center: 'Is it the right time?',
      atoms: [
        {
          id: 'a1',
          kind: 'want',
          label: 'Money',
          quote: 'its more money',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    expect(validateMindShape(shape, transcript)?.atoms).toHaveLength(1);
  });

  it('skips grounding entirely when no transcript is supplied (back-compat)', () => {
    const shape = {
      center: 'Is it the right time?',
      atoms: [
        {
          id: 'a1',
          kind: 'fear',
          label: 'X',
          quote: 'a quote that appears in no transcript at all',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    expect(validateMindShape(shape)?.atoms).toHaveLength(1);
  });
});

describe('validateMindShapePatch', () => {
  const transcript = 'i want to take the new role but my partner is worried about the move';

  it('returns new atoms and keeps a link to a prior (off-delta) atom for merge-time checking', () => {
    const patch = {
      add: [
        {
          id: 'n1',
          kind: 'option',
          label: 'New role',
          quote: 'take the new role',
          status: 'stable',
          confidence: 'said',
        },
      ],
      addLinks: [{ from: 'n1', to: 'p1', kind: 'tensions' }],
    };
    const r = validateMindShapePatch(patch, transcript);
    expect(r?.add).toHaveLength(1);
    // p1 is not in the delta; the endpoint check is deferred to the merge, so the link survives here
    expect(r?.addLinks).toHaveLength(1);
  });

  it('grounds patch atoms — an invented quote yields an empty delta (null)', () => {
    const patch = {
      add: [
        {
          id: 'n1',
          kind: 'fear',
          label: 'Bogus',
          quote: 'a quote never spoken aloud',
          status: 'stable',
          confidence: 'said',
        },
      ],
      addLinks: [],
    };
    expect(validateMindShapePatch(patch, transcript)).toBeNull();
  });

  it('returns null for an empty delta', () => {
    expect(validateMindShapePatch({ add: [], addLinks: [] }, transcript)).toBeNull();
  });
});
