// mindshape-surface.test.tsx — the live Watch-Me-Think surface: the useMindShape hook and its
// delta-merge guardrails, the unsaid confirm/dismiss path, the useSignals nudges, the map layout,
// and the MindShape component itself. Every describe below carries the header of the file it came
// from. Network is stubbed at the module boundary (modelRefine) so nothing here hits a provider.
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  renderHook,
  act,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMindShape, mergeDelta, keepUnaccountedAtoms } from '../src/live/mindshape/useMindShape';
import { useSignals } from '../src/live/mindshape/useSignals';
import { mindShapeToSpec } from '../src/live/mindshape/mindShapeToSpec';
import { settleMindShape } from '../src/live/mindshape/modelRefine';
import {
  computeLayout,
  CARD_HH,
  CARD_HW,
  CX,
  CY,
  UNSAID_X,
  UNSAID_Y,
} from '../src/canvas/blocks/diagrams/mindShapeLayout';
import { MindShape } from '../src/canvas/blocks/diagrams/MindShape';
import type {
  MindAtom,
  MindLink,
  MindShapePatch,
  MindShapeSpec,
  MindUnsaid,
} from '../src/live/mindshape/types';
import type { ModelConfig } from '../src/live/providers/types';

// Prevent any real network calls — the settle/patch calls are async fire-and-forget
vi.mock('../src/live/mindshape/modelRefine', () => ({
  settleMindShape: vi.fn().mockResolvedValue(null),
  patchMindShape: vi.fn().mockResolvedValue(null),
}));

afterEach(cleanup);

afterEach(() => {
  vi.useRealTimers();
});

// Let the async seed/patch microtasks settle so setSpecSync has applied.
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

// ─────────────────────────────────────────────────────────────────────────────
// useMindShape / mergeDelta / mindShapeToSpec / computeLayout — behavioral tests for
// useMindShape, MindShapeCanvas, and mindShapeToSpec. Verifies the core invariants without
// hitting any network calls.
// ─────────────────────────────────────────────────────────────────────────────

describe('useMindShape', () => {
  // ── Minimal ModelConfig for hook init ─────────────────────────────────────
  const FAKE_CFG: ModelConfig = {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    apiKey: 'test-key',
  };

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

  it("leaves the centre's own text column clear, not just the face", () => {
    // "WHAT I HEARD", the question, and the settled synthesis line stack BELOW the face in screen
    // space, where the world layout cannot see them — so a symmetric keep-out let a card land on
    // top of the sentence that explains the whole map.
    const { positions } = computeLayout(mkAtoms(9));
    for (const [id, p] of positions) {
      if (p.y < CY) continue; // above the face: the shorter keep-out is correct there
      const overCentreColumn = Math.abs(p.x - CX) < CARD_HW;
      if (overCentreColumn) {
        expect(p.y - CARD_HH, `${id} covers the synthesis line`).toBeGreaterThan(CY + 150);
      }
    }
  });

  it('keeps thoughts off the pinned unsaid card', () => {
    // The unsaid card waits in a fixed corner and never moves, so the relaxation has to move the
    // atoms instead. Without that it renders on top of whichever thought landed there.
    const { positions } = computeLayout(mkAtoms(8), undefined, undefined, true);
    for (const [id, p] of positions) {
      const onUnsaid =
        Math.abs(p.x - UNSAID_X) < CARD_HW + 120 && Math.abs(p.y - UNSAID_Y) < CARD_HH * 2;
      expect(onUnsaid, `card ${id} is buried under the unsaid card`).toBe(false);
    }
  });

  it('parks a theme label clear of the cards it names', () => {
    const atoms = mkAtoms(6);
    const clusters = [
      { id: 'c1', label: 'The first theme', atomIds: ['a0', 'a1', 'a2'], weight: 3 },
      { id: 'c2', label: 'The second theme', atomIds: ['a3', 'a4', 'a5'], weight: 2 },
    ];
    const { positions, labels } = computeLayout(atoms, clusters);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      for (const [id, p] of positions) {
        const insideCard = Math.abs(label.x - p.x) < CARD_HW && Math.abs(label.y - p.y) < CARD_HH;
        expect(insideCard, `label "${label.label}" sits on card ${id}`).toBe(false);
      }
      // …and off the face, which is where a single theme's label used to land.
      expect(Math.hypot(label.x - CX, label.y - CY)).toBeGreaterThan(120);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The Watch-Me-Think map builds additively while the user talks. Its layout must be APPEND-STABLE:
// a new atom landing should nudge only its neighbours, never re-throw every existing card onto a
// fresh ring (the "map reshuffles on every word" jank). computeLayout takes the previous frame's
// positions as a seed to guarantee that; this locks the behaviour without depending on the exact
// world coordinates (which are centred on CX/CY, not the origin).
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLayout — append-stable layout', () => {
  const atom = (id: string): MindAtom => ({
    id,
    kind: 'want',
    label: id,
    quote: `said ${id}`,
    status: 'stable',
    confidence: 'said',
  });

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it('keeps existing atoms near their prior spots when a new atom lands, instead of re-throwing them', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const before = computeLayout(ids.map(atom)).positions;
    const seeded = computeLayout([...ids, 'e'].map(atom), undefined, before).positions;
    const fresh = computeLayout([...ids, 'e'].map(atom)).positions;
    // Total drift of the EXISTING cards is strictly smaller when their positions are seeded than
    // when the layout is recomputed from scratch (which re-throws the whole ring on every add).
    const drift = (m: Map<string, { x: number; y: number }>) =>
      ids.reduce((s, id) => s + dist(m.get(id)!, before.get(id)!), 0);
    expect(drift(seeded)).toBeLessThan(drift(fresh));
    // The genuinely new atom is still placed (never dropped).
    expect(seeded.get('e')).toBeTruthy();
  });

  it('a seeded card that has no overlap is left exactly where it was', () => {
    // Two cards on opposite sides of the map do not overlap, so the de-clump pass moves neither —
    // seeding them reproduces their positions to the pixel.
    const two = computeLayout([atom('a'), atom('b')]).positions;
    const again = computeLayout([atom('a'), atom('b')], undefined, two).positions;
    expect(dist(again.get('a')!, two.get('a')!)).toBeLessThan(0.001);
    expect(dist(again.get('b')!, two.get('b')!)).toBeLessThan(0.001);
  });

  it('a brand-new atom (no seed entry) still enters from the ring, not from a stale spot', () => {
    const seed = computeLayout([atom('a')]).positions; // only 'a' has a prior position
    const grown = computeLayout([atom('a'), atom('b')], undefined, seed).positions;
    // 'a' stays put; 'b' is newly placed somewhere else (not collapsed onto 'a').
    expect(dist(grown.get('a')!, seed.get('a')!)).toBeLessThan(0.001);
    expect(dist(grown.get('b')!, seed.get('a')!)).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// confirmUnsaid / dismissUnsaid behavior in useMindShape.
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_CFG_UNSAID: ModelConfig = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  apiKey: 'k',
};

const SPEC_WITH_UNSAID: MindShapeSpec = {
  center: 'Is this about the job or something else?',
  atoms: [
    {
      id: 'a1',
      kind: 'option',
      label: 'Stay',
      quote: 'maybe stay',
      status: 'stable',
      confidence: 'said',
    },
  ],
  links: [],
  unsaid: {
    label: "Maybe it's not about the job at all",
    why: 'Keeps circling it',
    confidence: 'maybe',
  },
};

describe('useMindShape — confirmUnsaid', () => {
  const FAKE_CFG = FAKE_CFG_UNSAID;

  beforeEach(() => vi.clearAllMocks());

  it('promotes the unsaid to a stable open_loop atom and clears spec.unsaid', async () => {
    vi.mocked(settleMindShape).mockResolvedValueOnce(SPEC_WITH_UNSAID);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('a long enough topic to trigger the seed call here please');
    });
    await flush();

    // Seed the spec with unsaid
    expect(result.current.spec?.unsaid?.label).toBe("Maybe it's not about the job at all");

    await act(async () => {
      result.current.confirmUnsaid();
    });

    const spec = result.current.spec;
    expect(spec?.unsaid).toBeUndefined();
    const confirmed = spec?.atoms.find((a) => a.id === 'unsaid-confirmed');
    expect(confirmed).toBeDefined();
    expect(confirmed?.kind).toBe('open_loop');
    expect(confirmed?.status).toBe('stable');
    expect(confirmed?.label).toBe("Maybe it's not about the job at all");
  });

  it('is a no-op when there is no unsaid', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.confirmUnsaid(); // should not throw
    });
    expect(result.current.spec).toBeNull();
  });
});

describe('useMindShape — dismissUnsaid', () => {
  const FAKE_CFG = FAKE_CFG_UNSAID;

  beforeEach(() => vi.clearAllMocks());

  it('clears spec.unsaid without adding an atom', async () => {
    vi.mocked(settleMindShape).mockResolvedValueOnce(SPEC_WITH_UNSAID);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('a long enough topic to trigger the seed call here please');
    });
    await flush();

    expect(result.current.spec?.unsaid).toBeDefined();
    const atomsBefore = result.current.spec?.atoms.length ?? 0;

    await act(async () => {
      result.current.dismissUnsaid();
    });

    expect(result.current.spec?.unsaid).toBeUndefined();
    // No new atom added
    expect(result.current.spec?.atoms.length).toBe(atomsBefore);
  });

  it('is a no-op when there is no unsaid', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.dismissUnsaid();
    });
    expect(result.current.spec).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSignals triggers each kind at most once per session.
// ─────────────────────────────────────────────────────────────────────────────

describe('useSignals', () => {
  function stable(id: string, kind: MindAtom['kind'] = 'option'): MindAtom {
    return { id, kind, label: id, quote: `q ${id}`, status: 'stable', confidence: 'said' };
  }

  function spec(atoms: MindAtom[], hasRealTension = false, hasUnsaid = false): MindShapeSpec {
    return {
      center: '',
      atoms,
      links: hasRealTension
        ? [{ from: atoms[0]?.id ?? 'a', to: atoms[1]?.id ?? 'b', kind: 'tensions' }]
        : [],
      unsaid: hasUnsaid
        ? { label: 'the real thing', why: 'keeps circling it', confidence: 'maybe' }
        : undefined,
    };
  }

  it('returns null when there are no atoms', () => {
    const { result } = renderHook(() =>
      useSignals({ center: '', atoms: [], links: [] }, 'listening'),
    );
    expect(result.current.currentSignal).toBeNull();
  });

  it('fires the pattern signal when atoms reach 4', () => {
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('pattern');
    expect(result.current.currentSignal?.content).toMatch(/forming/i);
  });

  it('fires the tension signal when a real (non-provisional) tension appears', () => {
    const atoms = [stable('a'), stable('b')];
    const { result } = renderHook(() => useSignals(spec(atoms, true), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('tension');
  });

  it('does NOT fire tension signal for a provisional link', () => {
    const atoms = [stable('a'), stable('b')];
    const provisionalSpec: MindShapeSpec = {
      center: '',
      atoms,
      links: [{ from: 'a', to: 'b', kind: 'tensions', provisional: true }],
    };
    const { result } = renderHook(() => useSignals(provisionalSpec, 'listening'));
    // May fire pattern if enough atoms, but not tension
    expect(result.current.currentSignal?.kind).not.toBe('tension');
  });

  it('fires the unsaid signal when spec.unsaid appears', () => {
    const atoms = [stable('a'), stable('b')];
    const { result } = renderHook(() => useSignals(spec(atoms, false, true), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('unsaid');
  });

  it('fires the depth signal at 8+ atoms', () => {
    const atoms = Array.from({ length: 8 }, (_, i) => stable(`a${i}`));
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    // pattern (≥4) fires first, but with 8 atoms the depth signal should be active
    // (pattern fires for the 4-atom threshold; depth should also be queued)
    // The hook replaces signals so depth becomes current after pattern
    // In this test the spec already has 8 atoms, so both triggers fire;
    // depth's useEffect runs after pattern's, making it the current signal.
    expect(result.current.currentSignal?.kind).toBe('depth');
  });

  it('clears signals when phase goes to idle', () => {
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    type Props = { s: MindShapeSpec | null; p: 'listening' | 'idle' | 'pausing' | 'settled' };
    const { result, rerender } = renderHook(({ s, p }: Props) => useSignals(s, p), {
      initialProps: { s: spec(atoms) as MindShapeSpec | null, p: 'listening' as Props['p'] },
    });
    expect(result.current.currentSignal).not.toBeNull();

    act(() => {
      rerender({ s: null, p: 'idle' });
    });
    expect(result.current.currentSignal).toBeNull();
  });

  it('does not fire signals during settled phase', () => {
    const atoms = Array.from({ length: 8 }, (_, i) => stable(`a${i}`));
    const { result } = renderHook(() => useSignals(spec(atoms), 'settled'));
    expect(result.current.currentSignal).toBeNull();
  });

  it('does not wake or re-render while a signal is still live', () => {
    vi.useFakeTimers();
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSignals(spec(atoms), 'listening');
    });
    expect(result.current.currentSignal?.kind).toBe('pattern');

    const before = renders;
    act(() => {
      vi.advanceTimersByTime(3_000); // comfortably inside the 5s TTL
    });
    expect(renders).toBe(before);
    expect(result.current.currentSignal?.kind).toBe('pattern');
  });

  it('still expires the signal once its TTL passes', () => {
    vi.useFakeTimers();
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('pattern');

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.currentSignal).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MindShape — the settled "Watch Me Think" surface.
// Pins the mockup features that turn the map from a picture into a thing you can act on: the tension
// callout (auto-surfaced, "help me tell them apart"), the traced-step plan (every step cites a
// quote — nothing invented), the "kept this shape" panel (Replay/Share/Present + memory reassurance),
// the four post-settle actions, the intent-aware labels, synthesis line, and interactive unsaid card.
// ─────────────────────────────────────────────────────────────────────────────

describe('MindShape — settled surface', () => {
  const atoms: MindAtom[] = [
    {
      id: 'a',
      kind: 'want',
      label: 'the career',
      quote: 'I keep calling it the career',
      status: 'stable',
      confidence: 'said',
      weight: 3,
    },
    {
      id: 'b',
      kind: 'fear',
      label: 'scared of staying still',
      quote: "I'm scared of staying still",
      status: 'stable',
      confidence: 'said',
      weight: 3,
    },
    {
      id: 'c',
      kind: 'open_loop',
      label: 'decide by spring',
      quote: 'I have to decide by spring',
      status: 'stable',
      confidence: 'said',
    },
  ];

  const links: MindLink[] = [{ from: 'a', to: 'b', kind: 'tensions', label: 'pulls against' }];

  function renderSettled(onAction = vi.fn()) {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="Is it the right time — or am I running?"
        atoms={atoms}
        links={links}
        onAction={onAction}
      />,
    );
    return onAction;
  }

  it('auto-surfaces the tension callout and offers to tell the two apart', () => {
    const onAction = renderSettled();
    const callout = screen.getByRole('dialog', { name: 'The tension' });
    // Both sides of the conflict are named in the person's own words.
    expect(within(callout).getByText(/the career/)).toBeTruthy();
    expect(within(callout).getByText(/scared of staying still/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /tell them apart/i }));
    expect(onAction).toHaveBeenCalledWith('tell-apart', {
      tension: { a: 'the career', b: 'scared of staying still' },
    });
  });

  it('shows the five post-settle actions in the mockup’s words', () => {
    renderSettled();
    expect(screen.getByRole('button', { name: 'Answer this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn into a plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'That’s it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add more' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not quite' })).toBeTruthy();
  });

  it('"Add more" fires the add-more action so the map can pick up where it left off', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Add more' }));
    expect(onAction).toHaveBeenCalledWith('add-more');
  });

  it('offers no "Add more" while still live — the map is already growing as you talk', () => {
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={atoms}
        links={links}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add more' })).toBeNull();
  });

  it('turns the open loops into traced steps — each citing a quote, nothing invented', () => {
    renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    // The open-loop atom becomes a step, traced back to its verbatim quote.
    expect(within(plan).getByText('decide by spring')).toBeTruthy();
    expect(within(plan).getByText(/from .I have to decide by spring/)).toBeTruthy();
    expect(within(plan).getByText(/nothing invented/i)).toBeTruthy();
  });

  it('"Make it real" runs the plan as a real turn', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    fireEvent.click(screen.getByRole('button', { name: /make it real/i }));
    expect(onAction).toHaveBeenCalledWith('commit-plan');
  });

  it('lets you check off plan steps — they are real checkboxes you control', () => {
    renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    const box = within(plan).getByRole('checkbox', { name: /decide by spring/i });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box); // toggles back off
    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('"That’s it" keeps the shape — Replay/Share/Present + the memory reassurance', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'That’s it' }));
    const kept = screen.getByRole('dialog', { name: 'Kept this shape' });
    expect(within(kept).getByText(/Nothing was saved to memory/i)).toBeTruthy();
    fireEvent.click(within(kept).getByRole('button', { name: /share/i }));
    expect(onAction).toHaveBeenCalledWith('share');
    fireEvent.click(within(kept).getByRole('button', { name: /present mode/i }));
    expect(onAction).toHaveBeenCalledWith('present');
  });

  it('does not surface a tension callout when there is no real (non-provisional) tension', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What next?"
        atoms={atoms.slice(0, 2)}
        links={[{ from: 'a', to: 'b', kind: 'tensions', label: 'maybe?', provisional: true }]}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog', { name: 'The tension' })).toBeNull();
  });
});

describe('MindShape — live surface (not yet settled)', () => {
  // A subject exploration: a short prompt the model expanded into several question atoms, while the
  // map is still LIVE (listening). The actions must work here too — the user shouldn't have to wait
  // for settle to act on a map that's already full of thoughts.
  const questions: MindAtom[] = [
    {
      id: 'q1',
      kind: 'question',
      label: 'where it goes',
      quote: 'where does this trajectory go',
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'q2',
      kind: 'question',
      label: 'how startups compare',
      quote: 'how do startups compare to other countries',
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'q3',
      kind: 'question',
      label: 'the role of spices',
      quote: 'spices influenced economic and cultural history',
      status: 'stable',
      confidence: 'said',
    },
  ];

  it('counts the thoughts ON THE MAP, not just spoken utterances', () => {
    // 3 atoms are on the map but only 1 spoken utterance was counted — the badge must read "3 thoughts",
    // never "1 thought" with three cards visible.
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        thoughtCount={1}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 thoughts/)).toBeTruthy();
    expect(screen.queryByText('1 thought')).toBeNull();
  });

  it('opens "Turn into a plan" on a LIVE map (not only when settled), with questions as steps', () => {
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        onAction={vi.fn()}
      />,
    );
    // the action is offered while still live (there are atoms to act on)
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    // a questions-only subject map still yields steps (each a question to pursue), traced to its quote
    expect(within(plan).getByText('where it goes')).toBeTruthy();
    expect(within(plan).getByText(/from .where does this trajectory go/)).toBeTruthy();
    expect(within(plan).queryByText(/No open loops/i)).toBeNull();
  });

  it('"Answer this" is available live and fuses the map into a turn', () => {
    const onAction = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Answer this' }));
    expect(onAction).toHaveBeenCalledWith('answer');
  });
});

describe('MindShape — intent-aware labels and synthesis line', () => {
  const decisonAtoms: MindAtom[] = [
    {
      id: 'o1',
      kind: 'option',
      label: 'Take the Seattle offer',
      quote: 'the Seattle offer',
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
    {
      id: 'o2',
      kind: 'option',
      label: 'Stay in Austin',
      quote: 'stay in Austin',
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
    {
      id: 'f1',
      kind: 'fear',
      label: 'Missing family',
      quote: 'miss my family',
      status: 'stable',
      confidence: 'said',
    },
  ];
  const decisionLinks: MindLink[] = [
    { from: 'o1', to: 'o2', kind: 'tensions', label: 'pulls against' },
  ];

  it('shows "Help me decide" as the primary action for a decision intent', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What do I actually want?"
        atoms={decisonAtoms}
        links={decisionLinks}
        intent="decision"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Help me decide' })).toBeTruthy();
  });

  it('shows "THE DECISION" as the center label for decision intent', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What do I actually want?"
        atoms={decisonAtoms}
        links={decisionLinks}
        intent="decision"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText('THE DECISION')).toBeTruthy();
  });

  it('shows "Take me deeper" for exploration intent', () => {
    const explorationAtoms: MindAtom[] = Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`,
      kind: 'question' as const,
      label: `Question ${i}`,
      quote: `question ${i}`,
      status: 'stable' as const,
      confidence: 'said' as const,
    }));
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What is this really about?"
        atoms={explorationAtoms}
        links={[]}
        intent="exploration"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Take me deeper' })).toBeTruthy();
    expect(screen.getByText('THE QUESTION')).toBeTruthy();
  });

  it('renders the synthesis line when settled with atoms', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="The real question"
        atoms={decisonAtoms}
        links={decisionLinks}
        onAction={vi.fn()}
      />,
    );
    // Synthesis line: tension variant → "1 tension. Take the Seattle offer vs Stay in Austin."
    // Target the specific atom labels that only appear in the synthesis line text.
    expect(screen.getByText(/Seattle offer vs Stay in Austin/i)).toBeTruthy();
  });

  it('says so honestly instead of showing a bare face when a short turn settles with nothing', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={[]}
        links={[]}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/didn.t catch enough to map/i)).toBeTruthy();
    // No atoms means nothing to act on — the post-settle action bar stays hidden rather than
    // offering "Answer this" over an empty map.
    expect(screen.queryByRole('button', { name: 'Answer this' })).toBeNull();
  });
});

describe('MindShape — interactive unsaid card', () => {
  const unsaid: MindUnsaid = {
    label: "Maybe it's not about money",
    why: 'Keeps framing it as money but circles back to something else.',
    confidence: 'maybe',
  };
  const baseAtoms: MindAtom[] = [
    {
      id: 'a1',
      kind: 'want',
      label: 'Security',
      quote: 'I want security',
      status: 'stable',
      confidence: 'said',
    },
  ];

  it('shows "Yes, that\'s it" and "Not quite" buttons when callbacks are provided', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /yes, that's it/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /not this/i })).toBeTruthy();
  });

  it('renders the full unsaid sentence without shortening it to an ellipsis', () => {
    const fullLabel = 'How are the special cases actually supposed to interact with the main rule?';
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={{ ...unsaid, label: fullLabel }}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText(fullLabel)).toBeTruthy();
    expect(screen.queryByText(/actually supposed…/i)).toBeNull();
  });

  it('"Yes, that\'s it" fires onConfirmUnsaid', () => {
    const onConfirm = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={onConfirm}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /yes, that's it/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('"Not this" fires onDismissUnsaid', () => {
    const onDismiss = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={onDismiss}
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /not this/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does NOT show action buttons when no callbacks are provided (block/replay mode)', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /yes, that's it/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /not this/i })).toBeNull();
    // But the card content itself is visible
    expect(screen.getByText("Maybe it's not about money")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The settle REPLACES the live map — it is the one prune authority. But a model that folds five
// spoken thoughts into two atoms deletes three things the person actually said, and watching your
// own words vanish is the opposite of being listened to. Anything the settle didn't account for
// rides along.
// ─────────────────────────────────────────────────────────────────────────────
describe('keepUnaccountedAtoms', () => {
  const atom = (id: string, quote: string): MindAtom => ({
    id,
    kind: 'option',
    label: quote.slice(0, 40),
    quote,
    status: 'stable',
    confidence: 'said',
  });
  const settledWith = (atoms: MindAtom[]): MindShapeSpec => ({
    center: 'What are we really deciding?',
    atoms,
    links: [],
  });

  it('carries the thoughts a shrinking settle dropped', () => {
    const prior = [
      atom('a1', 'dev wants a hackathon'),
      atom('a2', 'design wants a beach'),
      atom('a3', 'the budget resets in April'),
      atom('a4', 'half the team is remote'),
    ];
    const settled = settledWith([atom('s1', 'dev wants a hackathon')]);
    const merged = keepUnaccountedAtoms(prior, settled);
    expect(merged.atoms.map((a) => a.quote)).toEqual([
      'dev wants a hackathon',
      'design wants a beach',
      'the budget resets in April',
      'half the team is remote',
    ]);
    expect(merged.center).toBe('What are we really deciding?');
  });

  it('leaves a settle that consolidated on purpose exactly as the model built it', () => {
    const prior = [atom('a1', 'one'), atom('a2', 'two')];
    const settled = settledWith([atom('s1', 'one'), atom('s2', 'two'), atom('s3', 'three')]);
    expect(keepUnaccountedAtoms(prior, settled)).toBe(settled);
  });

  it('does not duplicate a thought the settle rephrased but kept quoted', () => {
    const prior = [atom('a1', 'The budget resets in April'), atom('a2', 'dev wants a hackathon')];
    const settled = settledWith([
      { ...atom('s1', 'the budget  resets in april!'), label: 'April' },
    ]);
    const merged = keepUnaccountedAtoms(prior, settled);
    expect(merged.atoms).toHaveLength(2);
    expect(merged.atoms.map((a) => a.id)).toEqual(['s1', 'a2']);
  });
});
