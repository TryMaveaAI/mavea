import { afterEach, describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/live/providers';
import { mapCorpus, batches, plannedCallCount } from '../src/live/prism/synthesis/mapCorpus';
import type { Attachment } from '../src/live/attachments';
import type { ModelConfig } from '../src/types/mavea';

// The corpus pipeline is the load-bearing scaling move: pure code extracts/digests/retrieves/grounds/
// pairs, and the model is reduced to a few bounded batched calls. This runs the whole thing against a
// canned adapter to pin three guarantees at once: the call budget (≈ 1 + ⌈N/B⌉ + 1), verbatim
// grounding (a fabricated quote is dropped), and honest gating (a real cross-source contradiction
// survives, an absent facet becomes a gap).

// Three sources: two studies that genuinely contradict on efficacy, one unrelated cost source.
const S0 = ['Foci et al. 2024. 42% improvement at 12 weeks on the primary endpoint symptom score.'];
const S1 = [
  'Maso et al. 2023. No significant effect at 12 weeks on the primary endpoint symptom score.',
];
const S2 = ['Costa et al. 2022. Manufacturing cost rose to $5,775 per unit in the analysis.'];

const THEME_JSON = JSON.stringify({
  themes: ['Efficacy'],
  facets: [
    {
      label: 'Pediatric population',
      theme: 'Efficacy',
      surfaceForms: ['pediatric', 'paediatric', 'children', 'under 18'],
    },
  ],
});

const CLAIMS_JSON = JSON.stringify({
  claims: [
    {
      source: 0,
      quote: '42% improvement at 12 weeks on the primary endpoint symptom score',
      page: 1,
      theme: 'Efficacy',
      kind: 'stat',
      title: '42% improvement',
      role: 'load-bearing',
    },
    {
      source: 1,
      quote: 'No significant effect at 12 weeks on the primary endpoint symptom score',
      page: 1,
      theme: 'Efficacy',
      kind: 'finding',
      title: 'No significant effect',
      role: 'load-bearing',
    },
    {
      source: 2,
      quote: 'Manufacturing cost rose to $5,775 per unit',
      page: 1,
      theme: 'Efficacy',
      kind: 'stat',
      title: 'Cost rose',
      role: 'supporting',
    },
    // a fabricated quote that appears NOWHERE — must be dropped by the grounding gate
    {
      source: 0,
      quote: 'THIS SENTENCE IS INVENTED AND NOT IN ANY SOURCE',
      page: 1,
      theme: 'Efficacy',
      kind: 'finding',
      title: 'bogus',
      role: 'context',
    },
  ],
});

const COMPARE_JSON = JSON.stringify({
  pairs: [
    {
      id: 'p0',
      relation: 'contradicts',
      sharedQuantity: 'efficacy at 12 weeks',
      comparable: true,
      matchPhrase: 'at 12 weeks on the primary endpoint symptom score',
    },
  ],
});

let calls = 0;
function fakeAdapter() {
  return {
    id: 'anthropic',
    capabilities: {},
    probe: async () => ({ ok: true }),
    async generate(req: { system: string }) {
      calls += 1;
      const sys = req.system;
      if (sys.includes('organize a corpus')) return { raw: THEME_JSON };
      if (sys.includes('extract grounded')) return { raw: CLAIMS_JSON };
      if (sys.includes('compare pairs of grounded')) return { raw: COMPARE_JSON };
      return { raw: '{}' };
    },
  } as unknown as (typeof ADAPTERS)['anthropic'];
}

const cfg: ModelConfig = { provider: 'anthropic', model: 'test' };
const att = (name: string): Attachment => ({ name, mime: 'text/plain', data: '', size: 1 });

const original = ADAPTERS.anthropic;
afterEach(() => {
  ADAPTERS.anthropic = original;
});

describe('mapCorpus pipeline', () => {
  it('grounds, gates a real contradiction, finds a gap — within the call budget', async () => {
    calls = 0;
    ADAPTERS.anthropic = fakeAdapter();
    const res = await mapCorpus(
      [att('foci.txt'), att('maso.txt'), att('costa.txt')],
      cfg,
      undefined,
      {
        pagesOverride: [S0, S1, S2],
      },
    );

    expect(res.spec).not.toBeNull();
    const spec = res.spec!;

    // budget: theme reduce (1) + one claim batch (1) + one adjudication (1) = 3, ≤ the planned bound.
    expect(res.callCount).toBe(3);
    expect(calls).toBe(3);
    expect(res.callCount).toBeLessThanOrEqual(plannedCallCount(3));

    // grounding: the fabricated quote is dropped; the three real ones survive. `proposed` must reflect
    // all four raw claims the model returned, not the post-grounding count — otherwise the shared "N
    // read · M grounded · K dropped" counter always reads 100% grounded for a corpus (see SynthesisOverlay).
    expect(spec.claims).toHaveLength(3);
    expect(spec.claims.every((c) => c.title !== 'bogus')).toBe(true);
    expect(res.proposed).toBe(4);

    // contradiction: the two studies survive as a HARD, comparable contradiction, with a verified phrase.
    expect(spec.contradictions).toHaveLength(1);
    const x = spec.contradictions[0];
    expect(x.relation).toBe('contradicts');
    expect(x.comparable).toBe(true);
    expect(x.matchPhrase).toContain('primary endpoint');
    expect(x.seedQuestion).toContain('comparable');

    // gap: no source mentions a pediatric population → an honest "absent" gap over 3 sources.
    expect(spec.gaps).toHaveLength(1);
    expect(spec.gaps[0].kind).toBe('absent');
    expect(spec.gaps[0].facet.label).toBe('Pediatric population');

    // themes + counts read straight off the settled objects.
    expect(spec.themes.map((t) => t.name)).toContain('Efficacy');
    expect(spec.counts.contradictions).toBe(1);
    expect(spec.counts.gaps).toBe(1);
  });

  it('returns an honest error when nothing extracts', async () => {
    ADAPTERS.anthropic = fakeAdapter();
    const res = await mapCorpus([att('empty.txt')], cfg, undefined, { pagesOverride: [[]] });
    expect(res.spec).toBeNull();
    expect(res.error).toBeTruthy();
  });
});

describe('budget helpers', () => {
  it('batches by size and plans O(N/B) calls', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(plannedCallCount(100, 12)).toBe(11); // 1 + ceil(100/12)=9 + 1
    expect(plannedCallCount(1, 12)).toBe(3);
  });
});
