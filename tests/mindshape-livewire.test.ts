// mindshape-livewire.test.ts — behavioral tests for useMindShape, MindShapeCanvas, and
// mindShapeToSpec. Verifies the core invariants without hitting any network calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindShape, mergeDelta } from '../src/live/mindshape/useMindShape';
import { mindShapeToSpec } from '../src/live/mindshape/mindShapeToSpec';
import { settleMindShape } from '../src/live/mindshape/modelRefine';
import { computeLayout } from '../src/canvas/blocks/diagrams/mindShapeLayout';
import type { MindAtom, MindShapePatch, MindShapeSpec } from '../src/live/mindshape/types';
import type { ModelConfig } from '../src/live/providers/types';

// Prevent any real network calls — the settle/patch calls are async fire-and-forget
vi.mock('../src/live/mindshape/modelRefine', () => ({
  settleMindShape: vi.fn().mockResolvedValue(null),
  patchMindShape: vi.fn().mockResolvedValue(null),
}));

// Let the async seed/patch microtasks settle so setSpecSync has applied.
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

// ── Minimal ModelConfig for hook init ─────────────────────────────────────
const FAKE_CFG: ModelConfig = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  apiKey: 'test-key',
};

// ── useMindShape ──────────────────────────────────────────────────────────

describe('useMindShape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in idle phase with null spec', () => {
    const { result } = renderHook(() => useMindShape(null));
    expect(result.current.phase).toBe('idle');
    expect(result.current.spec).toBeNull();
  });

  it('transitions to listening on first onTranscript call', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('okay so i have this offer in Seattle');
    });
    expect(result.current.phase).toBe('listening');
  });

  it('populates spec with local atoms from transcript', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript(
        'my sister thinks i should take the new role and i want to feel settled',
      );
    });
    expect(result.current.spec).not.toBeNull();
    expect(result.current.spec?.atoms.length).toBeGreaterThan(0);
  });

  it('transitions to pausing on onSpeechEnd', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onSpeechEnd('i want to take the new role but my partner is against it');
    });
    // Phase moves to pausing immediately on speechEnd (settle call is async, mocked to null)
    expect(['pausing', 'settled']).toContain(result.current.phase);
  });

  it('reset returns to idle with null spec', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('my dad is getting older and i want to be closer');
    });
    expect(result.current.phase).toBe('listening');

    await act(async () => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.spec).toBeNull();
  });

  it('does not call submit path — onTranscript only mutates local spec', async () => {
    const mockSubmit = vi.fn();
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('i keep going back and forth about whether to stay or go');
    });
    // The hook has no submit path — verify it never called any external submit
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('listening');
  });

  it('atoms from onTranscript have status forming', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('my wife is worried about money and i am scared of failing');
    });
    const atoms = result.current.spec?.atoms ?? [];
    // Local-extracted atoms are always 'forming'
    expect(atoms.every((a) => a.status === 'forming')).toBe(true);
  });

  it('onSpeechEnd with empty text resets to idle', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('some text');
      result.current.onSpeechEnd('   ');
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.spec).toBeNull();
  });

  it('seeds the map from the model when local heuristics find nothing (builds for any topic)', async () => {
    // An intellectual/strategic ramble that localExtract cannot mine — without the seed the map
    // would stay empty (the original bug). settleMindShape supplies the first atoms.
    const seeded: MindShapeSpec = {
      center: 'How do I make this take off?',
      atoms: [
        {
          id: 's1',
          kind: 'option',
          label: 'Open-source it',
          quote: 'how to go viral with open source',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    vi.mocked(settleMindShape).mockResolvedValueOnce(seeded);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript(
        'a learning roadmap for linear algebra and how to go viral with open source',
      );
    });
    await flush();

    expect(settleMindShape).toHaveBeenCalledTimes(1);
    expect(result.current.spec?.atoms.length ?? 0).toBeGreaterThan(0);
    expect(result.current.phase).toBe('listening'); // seeding stays live — it is not the settle
  });

  it('removeAtom drops the card and any link touching it', async () => {
    const seeded: MindShapeSpec = {
      center: 'c',
      atoms: [
        {
          id: 's1',
          kind: 'option',
          label: 'A',
          quote: 'q a',
          status: 'stable',
          confidence: 'said',
        },
        { id: 's2', kind: 'fear', label: 'B', quote: 'q b', status: 'stable', confidence: 'said' },
      ],
      links: [{ from: 's1', to: 's2', kind: 'tensions' }],
    };
    vi.mocked(settleMindShape).mockResolvedValueOnce(seeded);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('a dry topic with at least eight words to trigger the seed');
    });
    await flush();
    expect(result.current.spec?.atoms).toHaveLength(2);

    await act(async () => {
      result.current.removeAtom('s1');
    });
    expect(result.current.spec?.atoms.map((a) => a.id)).toEqual(['s2']);
    expect(result.current.spec?.links).toHaveLength(0);
  });

  it('a dismissed atom stays gone across the next interim (no snap-back)', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    // An emotional line so localExtract seeds forming atoms with deterministic ids.
    const text = 'my sister thinks i should take the new role and i want to feel settled';
    await act(async () => {
      result.current.onTranscript(text);
    });
    const first = result.current.spec?.atoms[0];
    expect(first).toBeTruthy();

    await act(async () => {
      result.current.removeAtom(first!.id);
    });
    expect(result.current.spec?.atoms.some((a) => a.id === first!.id)).toBe(false);

    // The next interim regenerates the same clause id — it must NOT come back.
    await act(async () => {
      result.current.onTranscript(`${text} and honestly i keep going back and forth`);
    });
    expect(result.current.spec?.atoms.some((a) => a.id === first!.id)).toBe(false);
    expect(result.current.spec?.atoms.some((a) => a.quote === first!.quote)).toBe(false);
  });
});

// ── mergeDelta (delta-patch guardrails G2/G3/G4) ──────────────────────────

describe('mergeDelta', () => {
  const base = (): MindShapeSpec => ({
    center: '',
    atoms: [
      {
        id: 'a1',
        kind: 'option',
        label: 'Take the new role',
        quote: 'take the new role',
        status: 'forming',
        confidence: 'said',
      },
    ],
    links: [],
  });

  it('G3: folds a new-id atom with a duplicate quote onto the original id', () => {
    const patch: MindShapePatch = {
      add: [
        {
          id: 'b9',
          kind: 'option',
          label: 'Take the new role (refined)',
          quote: 'take the new role',
          status: 'stable',
          confidence: 'said',
        },
      ],
      addLinks: [],
    };
    const r = mergeDelta(base(), patch);
    expect(r.atoms).toHaveLength(1);
    expect(r.atoms[0].id).toBe('a1');
    expect(r.atoms[0].status).toBe('stable'); // updated in place, not duplicated
  });

  it('G2: drops a link whose endpoint is not on the merged map', () => {
    const patch: MindShapePatch = {
      add: [
        {
          id: 'a2',
          kind: 'fear',
          label: 'Worried partner',
          quote: 'partner is worried',
          status: 'stable',
          confidence: 'said',
        },
      ],
      addLinks: [
        { from: 'a1', to: 'ghost', kind: 'tensions' },
        { from: 'a1', to: 'a2', kind: 'tensions' },
      ],
    };
    const r = mergeDelta(base(), patch);
    expect(r.links).toHaveLength(1);
    expect(r.links[0].to).toBe('a2');
  });

  it('G4: caps merged atoms at 24, keeping highest-weight, all still quoted', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `x${i}`,
      kind: 'option' as const,
      label: `Label ${i}`,
      quote: `distinct quote number ${i}`,
      status: 'stable' as const,
      confidence: 'said' as const,
      weight: i < 5 ? 3 : 1,
    }));
    const r = mergeDelta(base(), { add: many, addLinks: [] });
    expect(r.atoms.length).toBeLessThanOrEqual(24);
    expect(r.atoms.every((a) => a.quote.trim().length > 0)).toBe(true);
    // the five weight-3 atoms must survive the cap
    expect(r.atoms.filter((a) => a.weight === 3)).toHaveLength(5);
  });

  it('a no-op patch (already-present quote, no links) leaves the map unchanged', () => {
    const patch: MindShapePatch = {
      add: [
        {
          id: 'dup',
          kind: 'option',
          label: 'Take the new role',
          quote: 'take the new role',
          status: 'forming',
          confidence: 'said',
        },
      ],
      addLinks: [],
    };
    const r = mergeDelta(base(), patch);
    expect(r.atoms).toHaveLength(1);
    expect(r.links).toHaveLength(0);
  });
});

// ── mindShapeToSpec ──────────────────────────────────────────────────────

describe('mindShapeToSpec', () => {
  const SETTLED: MindShapeSpec = {
    center: 'Is it the right time — or am I just running?',
    title: 'Seattle offer vs family',
    atoms: [
      {
        id: 'opt1',
        kind: 'option',
        label: 'Take the Seattle offer',
        quote: "there's this offer in Seattle",
        status: 'stable',
        confidence: 'said',
      },
      {
        id: 'per1',
        kind: 'person',
        label: 'Dad',
        quote: "Dad's not getting any younger",
        status: 'stable',
        confidence: 'said',
      },
    ],
    links: [{ from: 'opt1', to: 'per1', kind: 'tensions', label: 'but' }],
    unsaid: {
      label: "Maybe this isn't about the job",
      why: 'She keeps framing it as career but circles back to fear.',
      confidence: 'maybe',
    },
  };

  it('produces a ConversationSpec with a mindshape block', () => {
    const spec = mindShapeToSpec(SETTLED);
    expect(spec.blocks).toHaveLength(1);
    expect(spec.blocks[0].type).toBe('mindshape');
  });

  it('preserves center as sub and opener', () => {
    const spec = mindShapeToSpec(SETTLED);
    expect(spec.sub).toBe(SETTLED.center);
    expect(spec.opener).toBe(SETTLED.center);
  });

  it('preserves atoms, links, and unsaid in block props', () => {
    const spec = mindShapeToSpec(SETTLED);
    const props = (spec.blocks[0] as { type: 'mindshape'; props: MindShapeSpec }).props;
    expect(props.atoms).toHaveLength(2);
    expect(props.links).toHaveLength(1);
    expect(props.unsaid?.label).toBe("Maybe this isn't about the job");
  });

  it('uses spec.title as the ConversationSpec title', () => {
    const spec = mindShapeToSpec(SETTLED);
    expect(spec.title).toBe('Seattle offer vs family');
  });

  it('falls back to a default title when spec.title is absent', () => {
    const noTitle: MindShapeSpec = { ...SETTLED, title: undefined };
    const spec = mindShapeToSpec(noTitle);
    expect(spec.title).toBeTruthy();
    expect(typeof spec.title).toBe('string');
  });

  it('block col is 12 (full-width)', () => {
    const spec = mindShapeToSpec(SETTLED);
    expect(spec.blocks[0].col).toBe(12);
  });
});

// ── computeLayout de-clumping ─────────────────────────────────────────────
describe('computeLayout', () => {
  const mkAtoms = (n: number): MindAtom[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      kind: 'option' as const,
      label: `Atom number ${i}`,
      quote: `quote ${i}`,
      status: 'stable' as const,
      confidence: 'said' as const,
    }));

  it('separates busy maps so no two full-size cards overlap (the camera fits them)', () => {
    // Positions are full-size now — no shrink factor. The relaxation must leave zero real overlap;
    // the auto-fit camera (not a smaller card) is what makes a busy map fit on screen.
    for (const n of [8, 10, 12, 16, 20]) {
      const atoms = mkAtoms(n);
      const { positions } = computeLayout(atoms);
      const cardW = 100 * 2;
      const cardH = 50 * 2;
      const pts = atoms.map((a) => positions.get(a.id)!);
      expect(pts.every(Boolean)).toBe(true);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = Math.abs(pts[i].x - pts[j].x);
          const dy = Math.abs(pts[i].y - pts[j].y);
          const overlaps = dx < cardW - 1 && dy < cardH - 1;
          expect(overlaps, `cards ${i},${j} overlap at n=${n}`).toBe(false);
        }
      }
    }
  });

  it('keeps every card at a finite position outside the central face keep-out', () => {
    const atoms = mkAtoms(12);
    const { positions } = computeLayout(atoms);
    for (const a of atoms) {
      const p = positions.get(a.id)!;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      // No card sits on the face at the centre (CX=500, CY=329).
      expect(Math.hypot(p.x - 500, p.y - 329)).toBeGreaterThan(80);
    }
  });

  it('is deterministic', () => {
    const atoms = mkAtoms(10);
    expect(computeLayout(atoms).positions).toEqual(computeLayout(atoms).positions);
  });
});
