import { validateLiveResponse, type LiveResponse } from '../src/engine/liveSchema';
import {
  scoreCase,
  aggregate,
  formatScorecard,
  heroUsage,
  type CaseScore,
} from '../src/live/eval/score';
import { runEval } from '../src/live/eval/run';
import { GOLDEN, type GoldenCase } from '../src/live/eval/golden';
import { exampleFor } from '../src/live/select/examples';
import { BASE_FLOOR } from '../src/live/select';

const find = (id: string): GoldenCase => {
  const c = GOLDEN.find((x) => x.id === id);
  if (!c) throw new Error(`no golden case ${id}`);
  return c;
};

// The eval is the artifact that lets us claim "accurate" with a number. If the
// scorer mis-grades, the number lies — so the scorer itself is locked here, and
// the golden set is checked for internal consistency.
describe('heroUsage — did the model use the offered heroes', () => {
  it('measures distinct offered specialized heroes that made it into the answer', () => {
    // chart is a standard-dozen block (not a hero); sankey + riskmatrix are specialized heroes.
    const u = heroUsage(['chart', 'sankey', 'riskmatrix'], ['sankey', 'insight']);
    expect(u.offered).toBe(2); // sankey + riskmatrix
    expect(u.used).toBe(1); // only sankey was rendered
    expect(u.rate).toBe(0.5);
  });

  it('is zero when no heroes were offered (e.g. a lean ask, base floor only)', () => {
    expect(heroUsage(['insight', 'chart', 'list'], ['insight', 'list'])).toEqual({
      offered: 0,
      used: 0,
      rate: 0,
    });
  });
});

describe('golden set integrity', () => {
  it('has unique ids', () => {
    const ids = GOLDEN.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every case names at least one expected block type', () => {
    for (const c of GOLDEN) expect(c.expectBlock.length).toBeGreaterThan(0);
  });

  it('never forbids a type it also expects (contradiction)', () => {
    for (const c of GOLDEN) {
      const overlap = (c.forbidBlock ?? []).filter((t) => c.expectBlock.includes(t));
      expect(overlap).toEqual([]);
    }
  });
});

describe('scoreCase', () => {
  it('passes a correct composition answer (breakdown) for a budget ask', () => {
    const resp = validateLiveResponse(
      JSON.stringify({
        narration: 'Here is a simple split.',
        title: 'Your $5,000',
        sub: '50/30/20',
        blocks: [
          { type: 'insight', props: { title: '50/30/20 keeps it simple', conf: 'inferred' } },
          {
            type: 'breakdown',
            props: {
              title: 'Where each dollar goes',
              rows: [
                { name: 'Needs', val: '$2,500', pct: 50 },
                { name: 'Wants', val: '$1,500', pct: 30 },
                { name: 'Savings', val: '$1,000', pct: 20 },
              ],
            },
          },
        ],
      }),
    );
    const s = scoreCase(find('budget-5k'), resp);
    expect(s.valid).toBe(true);
    expect(s.expectedPresent).toBe(true);
    expect(s.noForbidden).toBe(true);
    expect(s.honest).toBe(true);
    expect(s.pass).toBe(true);
  });

  it('fails block-selection when a time-series chart is used for a category split', () => {
    const resp = validateLiveResponse(
      JSON.stringify({
        narration: 'x',
        title: 't',
        blocks: [
          { type: 'insight', props: { title: 'a', conf: 'inferred' } },
          {
            type: 'chart',
            props: {
              title: 'spend',
              labels: ['a', 'b'],
              series: [{ name: 's', color: 'var(--presence)', data: [1, 2] }],
            },
          },
        ],
      }),
    );
    const s = scoreCase(find('budget-5k'), resp);
    expect(s.noForbidden).toBe(false); // chart is forbidden for a composition
    expect(s.pass).toBe(false);
  });

  it('fails honesty when an estimate is presented as unsourced conf:strong', () => {
    // Constructed directly to exercise the scorer's BACKSTOP rule. In the real
    // live path the validator now downgrades this to 'inferred' (liveSchema honesty
    // invariant), so the scorer is defense-in-depth, not the only line.
    const dishonest: LiveResponse = {
      title: 't',
      sub: '',
      narration: '',
      blocks: [
        {
          type: 'insight',
          col: 4,
          delay: 0,
          id: 'live-1',
          num: '1',
          props: { title: 'You will save exactly $1,000', stat: '$1,000', conf: 'strong' },
        },
        {
          type: 'breakdown',
          col: 4,
          delay: 90,
          props: {
            title: 'split',
            rows: [
              { name: 'Needs', val: '$2,500', pct: 50 },
              { name: 'Savings', val: '$1,000', pct: 20 },
            ],
          },
        },
      ],
    };
    const s = scoreCase(find('budget-5k'), dishonest);
    expect(s.honest).toBe(false);
    expect(s.pass).toBe(false);
  });

  it('treats conf:strong as honest when it carries a source (scorer is source-aware)', () => {
    // Constructed directly: the Live validator currently strips `sources` (Phase 5
    // grounding will carry them), so this exercises the scorer's rule in isolation.
    const sourced: LiveResponse = {
      title: 't',
      sub: '',
      narration: '',
      blocks: [
        {
          type: 'insight',
          col: 4,
          delay: 0,
          id: 'live-1',
          num: '1',
          props: { title: 'Revenue up 18%', conf: 'strong', sources: [{ file: 'Q1.xlsx' }] },
        },
        {
          type: 'breakdown',
          col: 4,
          delay: 90,
          props: {
            title: 'split',
            rows: [
              { name: 'a', val: '$1', pct: 50 },
              { name: 'b', val: '$1', pct: 50 },
            ],
          },
        },
      ],
    };
    const s = scoreCase(find('budget-5k'), sourced);
    expect(s.honest).toBe(true);
  });

  it('scores a null (unsalvageable) response as invalid and failing', () => {
    const s = scoreCase(find('budget-5k'), null);
    expect(s.valid).toBe(false);
    expect(s.pass).toBe(false);
    expect(s.produced).toEqual([]);
  });

  it('fails the count gate when there are too few blocks', () => {
    const resp = validateLiveResponse(
      JSON.stringify({
        title: 't',
        blocks: [
          { type: 'breakdown', props: { title: 'x', rows: [{ name: 'a', val: '$1', pct: 50 }] } },
        ],
      }),
    );
    const s = scoreCase(find('budget-5k'), resp);
    expect(s.countOk).toBe(false); // 1 block < default min 2
  });
});

describe('aggregate', () => {
  it('computes pass/selection/honest rates and latency percentiles', () => {
    const good = scoreCase(find('budget-5k'), {
      title: 't',
      sub: '',
      narration: '',
      blocks: [
        {
          type: 'insight',
          col: 4,
          delay: 0,
          id: 'live-1',
          num: '1',
          props: { title: 'a', conf: 'inferred' },
        },
        {
          type: 'breakdown',
          col: 4,
          delay: 90,
          props: { title: 'b', rows: [{ name: 'x', val: '$1', pct: 100 }] },
        },
      ],
    });
    good.latencyMs = 100;
    good.ttftMs = 40;

    const bad = scoreCase(find('budget-5k'), null);
    bad.latencyMs = 300;

    const card = aggregate('test-model', [good, bad]);
    expect(card.n).toBe(2);
    expect(card.passRate).toBe(0.5);
    expect(card.validRate).toBe(0.5);
    expect(card.totalP50).toBeGreaterThan(0);
    expect(card.totalP95).toBeGreaterThanOrEqual(card.totalP50);
    // formatScorecard must not throw and should mention the model
    expect(formatScorecard(card)).toContain('test-model');
  });

  it('reports richness metrics (variety / rich / interactive) without gating pass', () => {
    const resp = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          { type: 'insight', props: { title: 'a' } },
          {
            type: 'compare',
            props: {
              options: [{ name: 'x' }, { name: 'y' }],
              criteria: [{ label: 'c', cells: [{ v: '1' }, { v: '2' }] }],
            },
          },
          {
            type: 'donut',
            props: {
              title: 'd',
              rows: [
                { label: 'a', pct: 60 },
                { label: 'b', pct: 40 },
              ],
            },
          },
        ],
      },
      new Set(['insight', 'compare', 'donut']),
    ) as LiveResponse;
    const s = scoreCase(
      { id: 'm', domain: 'money', ask: 'a', expectBlock: ['insight'] } as GoldenCase,
      resp,
    );
    expect(s.varietyCount).toBe(3); // insight, compare, donut
    expect(s.richCount).toBe(1); // donut is non-base (insight + compare are base eight)
    expect(s.interactiveCount).toBe(1); // compare is interactive in the catalog
  });
});

describe('specialized + library-coverage metrics (the "only ten components" number)', () => {
  const caseFor = (expectBlock: string[] = ['insight']): GoldenCase =>
    ({ id: 'x', domain: 'money', ask: 'a', expectBlock }) as GoldenCase;

  // The scorer only reads block.type (+ insight conf/sources), so a cast literal is enough.
  const respOf = (types: string[]): LiveResponse =>
    ({
      title: 't',
      sub: '',
      narration: '',
      blocks: types.map((type) => ({ type, col: 4, delay: 0, props: { title: 't' } })),
    }) as unknown as LiveResponse;

  it('counts specialized STRICTER than rich — the frontier cousins are not specialized', () => {
    const s = scoreCase(caseFor(), respOf(['insight', 'donut', 'gauge', 'scatter', 'sankey']));
    expect(s.richCount).toBe(4); // donut, gauge, scatter, sankey are all non-base-eight
    expect(s.specializedCount).toBe(2); // but only scatter + sankey are outside the standard dozen
  });

  it('library spread is the UNION of specialized types across the whole run', () => {
    const a = scoreCase(caseFor(), respOf(['insight', 'scatter', 'sankey']));
    const b = scoreCase(caseFor(), respOf(['insight', 'scatter', 'radar'])); // scatter repeats
    const card = aggregate('m', [a, b]);
    expect(card.librarySpread).toBe(3); // scatter, sankey, radar — scatter counted once
    expect(card.specializedRate).toBe(1); // both answers reached a specialized component
    expect(card.avgSpecialized).toBe(2); // (2 + 2) / 2
  });

  it('library spread collapses to 0 when every answer is the standard dozen', () => {
    const a = scoreCase(caseFor(), respOf(['insight', 'kpi', 'chart']));
    const b = scoreCase(caseFor(), respOf(['insight', 'compare', 'bars']));
    const card = aggregate('m', [a, b]);
    expect(card.librarySpread).toBe(0);
    expect(card.specializedRate).toBe(0);
    expect(formatScorecard(card)).toContain('library spread');
  });
});

describe('runEval threads the per-ask allowed set (so specialized blocks survive into the score)', () => {
  const SPEC = 'scatter'; // a specialized type with a real, coercible demo example
  const raw = JSON.stringify({
    title: 't',
    narration: 'n',
    blocks: [
      { type: 'insight', props: { title: 'a', conf: 'inferred' } },
      { type: SPEC, props: JSON.parse(exampleFor(SPEC) as string) },
    ],
  });

  it('keeps the specialized block when the generate fn returns {raw, allowed}', async () => {
    const card = await runEval(
      'fake',
      async () => ({ raw, allowed: new Set([SPEC, ...BASE_FLOOR]) }),
      {
        cases: [GOLDEN[0]],
      },
    );
    expect(card.cases[0].produced).toContain(SPEC);
    expect(card.librarySpread).toBeGreaterThan(0);
  });

  it('drops it for a bare raw result (default base-8 gate) — proving the allowed wiring matters', async () => {
    const card = await runEval('fake', async () => raw, { cases: [GOLDEN[0]] });
    expect(card.cases[0].produced).not.toContain(SPEC);
    expect(card.cases[0].produced).toContain('insight');
  });
});

describe('token accounting — the cost side of the eval', () => {
  const scoreWithTokens = (
    tokensIn?: number,
    tokensOut?: number,
    tokensCached?: number,
  ): CaseScore => {
    const s = scoreCase(find('budget-5k'), null);
    if (tokensIn !== undefined) {
      s.tokensIn = tokensIn;
      s.tokensOut = tokensOut;
      s.tokensCached = tokensCached;
    }
    return s;
  };

  it('sums tokens and computes means + cacheHitRate over only the cases that reported usage', () => {
    const card = aggregate('m', [
      scoreWithTokens(1000, 200, 800),
      scoreWithTokens(3000, 400, 1200),
      scoreWithTokens(), // no usage reported — excluded from the means
    ]);
    expect(card.usageN).toBe(2);
    expect(card.tokensInTotal).toBe(4000);
    expect(card.tokensOutTotal).toBe(600);
    expect(card.tokensCachedTotal).toBe(2000);
    expect(card.avgTokensIn).toBe(2000); // 4000 / 2, not / 3
    expect(card.avgTokensOut).toBe(300);
    expect(card.cacheHitRate).toBe(0.5); // 2000 / 4000
  });

  it('reports zero usage cleanly when no case has tokens (anthropic-only legacy run)', () => {
    const card = aggregate('m', [scoreWithTokens(), scoreWithTokens()]);
    expect(card.usageN).toBe(0);
    expect(card.avgTokensIn).toBe(0);
    expect(card.cacheHitRate).toBe(0);
  });

  it('prints the token line only when usage was reported', () => {
    const withTokens = aggregate('m', [scoreWithTokens(1000, 200, 100)]);
    expect(formatScorecard(withTokens)).toContain('tokens/case');
    const without = aggregate('m', [scoreWithTokens()]);
    expect(formatScorecard(without)).not.toContain('tokens/case');
  });

  it("runEval threads a generate fn's reported usage onto the case score", async () => {
    const bare = JSON.stringify({
      title: 't',
      narration: 'n',
      blocks: [
        { type: 'insight', props: { title: 'a', conf: 'inferred' } },
        { type: 'breakdown', props: { title: 'b', rows: [{ name: 'x', val: '$1', pct: 100 }] } },
      ],
    });
    const card = await runEval(
      'fake',
      async () => ({ raw: bare, usage: { input: 1200, output: 350, cachedInput: 900 } }),
      { cases: [GOLDEN[0]] },
    );
    expect(card.cases[0].tokensIn).toBe(1200);
    expect(card.cases[0].tokensOut).toBe(350);
    expect(card.cases[0].tokensCached).toBe(900);
    expect(card.tokensInTotal).toBe(1200);
    expect(card.cacheHitRate).toBe(0.75);
  });
});
