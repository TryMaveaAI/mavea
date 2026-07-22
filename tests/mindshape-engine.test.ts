// mindshape-engine.test.ts — the pure, network-free layer behind Watch-Me-Think: the local
// heuristic extractor, the intent classifier, the model-output validator, and the prompt fuser.
// Every describe below carries the header of the file it came from.
import { describe, expect, it } from 'vitest';
import {
  completeWordsOnly,
  countThoughts,
  localExtract,
  looksLikeThinkingAloud,
} from '../src/live/mindshape/localExtract';
import { detectIntent } from '../src/live/mindshape/intentDetect';
import { mindShapeToPrompt } from '../src/live/mindshape/mindShapeToPrompt';
import { validateMindShape, validateMindShapePatch } from '../src/live/mindshape/validate';
import type { MindAtom, MindShapeSpec } from '../src/live/mindshape/types';

// ─────────────────────────────────────────────────────────────────────────────
// localExtract — unit tests for localExtract.
// Pure, no network: asserts that heuristic patterns fire on expected inputs.
// ─────────────────────────────────────────────────────────────────────────────

describe('completeWordsOnly — guards the in-progress trailing word of an interim transcript', () => {
  it('drops the half-heard trailing word so "Ind" never reaches the live tagging', () => {
    expect(completeWordsOnly('tell me about Ind')).toBe('tell me about');
  });
  it('also drops a trailing word with no boundary yet (it may still be growing)', () => {
    expect(completeWordsOnly('tell me about India')).toBe('tell me about');
  });
  it('keeps everything once the word lands on a boundary (space or punctuation)', () => {
    expect(completeWordsOnly('tell me about India ')).toBe('tell me about India');
    expect(completeWordsOnly('tell me about India.')).toBe('tell me about India.');
    // the comma boundary means "India," has landed; the next word "and" is still in progress → dropped
    expect(completeWordsOnly('tell me about India, and')).toBe('tell me about India,');
  });
  it('returns empty when nothing has fully landed yet', () => {
    expect(completeWordsOnly('India')).toBe('');
    expect(completeWordsOnly('')).toBe('');
    expect(completeWordsOnly('   ')).toBe('');
  });
});

describe('localExtract', () => {
  it('detects a relationship-word person ("my dad")', () => {
    const atoms = localExtract("i don't know my dad is getting older and i feel guilty");
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.length).toBeGreaterThanOrEqual(1);
    expect(people[0].label.toLowerCase()).toContain('dad');
  });

  it('detects a named person via proper noun + action verb', () => {
    const atoms = localExtract('Maya just started her new school and she finally has friends');
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.some((p) => p.label === 'Maya')).toBe(true);
  });

  it('detects family title used as proper name ("Dad\'s not…")', () => {
    const atoms = localExtract(
      "Dad's not getting any younger and i'd be further from him if i take the job",
    );
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.some((p) => p.label === 'Dad')).toBe(true);
  });

  it('detects a fear ("scared of staying still")', () => {
    const atoms = localExtract("honestly i think i'm just scared of staying still");
    const fears = atoms.filter((a) => a.kind === 'fear');
    expect(fears.length).toBeGreaterThanOrEqual(1);
    expect(fears[0].quote).toContain('scared');
  });

  it('detects a fear with "worried" marker', () => {
    const atoms = localExtract("i'm worried that once i leave i won't be able to get back in");
    const fears = atoms.filter((a) => a.kind === 'fear');
    expect(fears.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a constraint ("my lease is up in March")', () => {
    const atoms = localExtract('my lease is up in March anyway and i have no choice');
    const constraints = atoms.filter((a) => a.kind === 'constraint');
    expect(constraints.length).toBeGreaterThanOrEqual(1);
    expect(constraints[0].quote).toContain('lease');
  });

  it('detects a constraint via "can\'t"', () => {
    const atoms = localExtract("i can't afford to take a risk right now with the mortgage");
    const constraints = atoms.filter((a) => a.kind === 'constraint');
    expect(constraints.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an open loop via "i don\'t know"', () => {
    const atoms = localExtract("i don't know is it even the right time or am i just running");
    const loops = atoms.filter((a) => a.kind === 'open_loop');
    expect(loops.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an open loop from a question mark', () => {
    const atoms = localExtract('what do i actually want from my career?');
    const loops = atoms.filter((a) => a.kind === 'open_loop');
    expect(loops.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an option via "offer"', () => {
    const atoms = localExtract("so there's this offer in Seattle it's more money a lot more");
    const options = atoms.filter((a) => a.kind === 'option');
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a want ("i want to feel settled")', () => {
    const atoms = localExtract("i want to feel settled i've always wanted that sense of stability");
    const wants = atoms.filter((a) => a.kind === 'want');
    expect(wants.length).toBeGreaterThanOrEqual(1);
  });

  it('every atom has a non-empty quote', () => {
    const transcript =
      "okay so there's this offer in Seattle it's more money a lot more but Maya just started her new school and she finally has friends and i keep telling myself it's about the career but honestly i think i'm just scared of staying still my lease is up in March anyway and Dad's not getting any younger i'd be further from him i don't know is it even the right time or am i just running";
    const atoms = localExtract(transcript);
    expect(atoms.length).toBeGreaterThan(0);
    for (const atom of atoms) {
      expect(atom.quote.trim().length).toBeGreaterThan(0);
    }
  });

  it('all atoms from the canonical transcript have status "forming"', () => {
    const atoms = localExtract(
      "okay so there's this offer in Seattle but Maya just started school and i'm scared of staying still my lease is up and i don't know",
    );
    expect(atoms.every((a) => a.status === 'forming')).toBe(true);
  });

  it('does not produce duplicate atoms for repeated mentions', () => {
    const atoms = localExtract(
      'my dad keeps calling me and my dad is worried and my dad said i should come home',
    );
    const people = atoms.filter((a) => a.kind === 'person');
    // Should deduplicate "dad" into one person atom
    const dadAtoms = people.filter((p) => p.label.toLowerCase().includes('dad'));
    expect(dadAtoms.length).toBe(1);
  });

  it('labels are clamped to ≤80 chars (a short summarizing sentence)', () => {
    const atoms = localExtract(
      "i'm worried that this really long sentence about many things going wrong will produce a very long label that exceeds the limit and causes display issues",
    );
    for (const atom of atoms) {
      expect(atom.label.length).toBeLessThanOrEqual(80);
    }
  });

  it('quotes are clamped to ≤120 chars', () => {
    const atoms = localExtract(
      'i am worried about this incredibly long sentence that has so many words in it that it would far exceed the quote character limit we have set in the system and would cause overflow issues in the canvas',
    );
    for (const atom of atoms) {
      expect(atom.quote.length).toBeLessThanOrEqual(120);
    }
  });
});

// ── countThoughts ────────────────────────────────────────────────────────────
describe('countThoughts', () => {
  it('counts several thoughts inside one breathless utterance', () => {
    const n = countThoughts(
      "i want to learn linear algebra but i'm worried it's too abstract and i also need to figure out how to go viral",
    );
    expect(n).toBeGreaterThan(1);
  });

  it('a single short clause counts as one thought', () => {
    expect(countThoughts('just go for it')).toBe(1);
  });

  it('empty text counts as zero', () => {
    expect(countThoughts('   ')).toBe(0);
  });
});

// ── looksLikeThinkingAloud ───────────────────────────────────────────────────
describe('looksLikeThinkingAloud', () => {
  it('a short, direct question is not thinking aloud (answer it directly)', () => {
    expect(looksLikeThinkingAloud("what's the capital of France")).toBe(false);
    expect(looksLikeThinkingAloud('how do I center a div?')).toBe(false);
  });

  it('multiple thoughts in one breath reads as thinking aloud', () => {
    expect(
      looksLikeThinkingAloud(
        "i should take the job but i'm scared and my partner wants to stay near family",
      ),
    ).toBe(true);
  });

  it('a longer exploratory single-thought utterance reads as thinking aloud', () => {
    expect(
      looksLikeThinkingAloud(
        'making a learning roadmap for linear algebra and directions to take it open source',
      ),
    ).toBe(true);
  });

  it('a long single-clause question still answers directly (not a ramble)', () => {
    expect(
      looksLikeThinkingAloud(
        'can you explain how eigenvalues and eigenvectors describe the way a linear transformation stretches space',
      ),
    ).toBe(false);
  });

  it('empty text is never thinking aloud', () => {
    expect(looksLikeThinkingAloud('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectIntent classifies thinking sessions correctly.
// ─────────────────────────────────────────────────────────────────────────────

describe('detectIntent', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// validateMindShape — unit tests for validateMindShape.
// Exercises the safety and coercion rules: drop atoms without quotes,
// force unsaid.confidence='maybe', strip clinical terms, clamp lengths.
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMindShape', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// mindShapeToPrompt fuses the WHOLE settled map into one ask so "Just answer it" and
// "Give me next steps" are grounded in everything the user said — not just the center line.
// ─────────────────────────────────────────────────────────────────────────────

describe('mindShapeToPrompt', () => {
  const SPEC: MindShapeSpec = {
    center: 'Should I take the Seattle offer?',
    atoms: [
      {
        id: 'o1',
        kind: 'option',
        label: 'Take the Seattle offer',
        quote: 'take the Seattle offer',
        status: 'stable',
        confidence: 'said',
      },
      {
        id: 'w1',
        kind: 'want',
        label: 'More money',
        quote: "it's a lot more money",
        status: 'stable',
        confidence: 'said',
      },
      {
        id: 'f1',
        kind: 'fear',
        label: 'Scared of staying still',
        quote: "i'm just scared of staying still",
        status: 'stable',
        confidence: 'inferred',
      },
      {
        id: 'p1',
        kind: 'person',
        label: 'Maya',
        quote: 'Maya just started her new school',
        status: 'stable',
        confidence: 'said',
      },
    ],
    links: [{ from: 'w1', to: 'f1', kind: 'tensions', label: 'pulls against' }],
  };

  it('answer mode includes the center, every atom label, and the tension', () => {
    const p = mindShapeToPrompt(SPEC, 'answer');
    expect(p).toContain('Should I take the Seattle offer?');
    expect(p).toContain('Take the Seattle offer');
    expect(p).toContain('More money');
    expect(p).toContain('Scared of staying still');
    expect(p).toContain('Maya');
    expect(p).toContain('pulls against');
    expect(p.toLowerCase()).toContain('clear');
  });

  it('plan mode asks for concrete next steps', () => {
    const p = mindShapeToPrompt(SPEC, 'plan');
    expect(p.toLowerCase()).toContain('next steps');
    // still carries the full context
    expect(p).toContain('Maya');
  });

  it('groups atoms under readable headings', () => {
    const p = mindShapeToPrompt(SPEC, 'answer');
    expect(p).toContain('Options on the table:');
    expect(p).toContain('What I want:');
    expect(p).toContain('What worries me:');
    expect(p).toContain('People involved:');
  });

  it('degrades gracefully with no center', () => {
    const p = mindShapeToPrompt({ ...SPEC, center: '' }, 'answer');
    expect(p).toContain('thinking out loud');
    expect(p).toContain('Take the Seattle offer');
  });

  it('omits the verbatim quote when it just repeats the label', () => {
    const spec: MindShapeSpec = {
      center: 'x',
      atoms: [
        {
          id: 'a',
          kind: 'want',
          label: 'More money',
          quote: 'More money',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    const p = mindShapeToPrompt(spec, 'answer');
    // label present once, no duplicated quoted echo
    expect(p).toContain('- More money');
    expect(p).not.toContain('("More money")');
  });
});
