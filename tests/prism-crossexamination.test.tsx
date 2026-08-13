import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrossExamPanel } from '../src/live/prism/crossexam/CrossExamPanel';
import { asObjectionKind, resolveObjection } from '../src/live/prism/crossexam/resolve';
import type { ModelConfig } from '../src/types/mavea';

// resolveObjection is the pure gate: an objection may only point at the document's OWN verbatim words,
// and it is "addressed" only with a REAL verbatim rebuttal. A model that invents an anchor or claims a
// rebuttal that isn't there can't sneak past — exactly the trust the feature rests on.
describe('cross-examination — the pure objection gate', () => {
  const claim = { id: 'k', source: 0 };
  const corpus = [['the model assumes linear growth', 'we validated this on the full sample']];

  describe('resolveObjection', () => {
    it('grounds an objection whose anchor is verbatim and leaves it open by default', () => {
      const o = resolveObjection(
        {
          claimId: 'k',
          kind: 'unstated-assumption',
          question: 'why assume linearity?',
          anchorQuote: 'the model assumes linear growth',
          addressed: false,
        },
        claim,
        corpus,
        1,
      );
      expect(o).not.toBeNull();
      expect(o).toMatchObject({ claimId: 'k', doc: 0, anchorPage: 1, status: 'open' });
    });

    it('drops an objection whose anchor is not in the document', () => {
      expect(
        resolveObjection(
          { claimId: 'k', question: 'q', anchorQuote: 'the model assumes exponential growth' },
          claim,
          corpus,
          1,
        ),
      ).toBeNull();
    });

    it('marks it addressed only with a real verbatim rebuttal', () => {
      const o = resolveObjection(
        {
          claimId: 'k',
          question: 'what about the full sample?',
          anchorQuote: 'the model assumes linear growth',
          addressed: true,
          rebuttalQuote: 'we validated this on the full sample',
        },
        claim,
        corpus,
        2,
      );
      expect(o?.status).toBe('addressed');
      expect(o?.rebuttalPage).toBe(2);
    });

    it('keeps it open when the claimed rebuttal is not really in the document', () => {
      const o = resolveObjection(
        {
          claimId: 'k',
          question: 'q',
          anchorQuote: 'the model assumes linear growth',
          addressed: true,
          rebuttalQuote: 'we ran every possible control',
        },
        claim,
        corpus,
        3,
      );
      expect(o?.status).toBe('open');
      expect(o?.rebuttalQuote).toBeUndefined();
    });

    it('finds a rebuttal in another document (cross-doc answer)', () => {
      const multi = [['claim words here'], ['the appendix answers it fully']];
      const o = resolveObjection(
        {
          claimId: 'k',
          question: 'q',
          anchorQuote: 'claim words here',
          addressed: true,
          rebuttalQuote: 'the appendix answers it fully',
        },
        claim,
        multi,
        1,
      );
      expect(o?.status).toBe('addressed');
      expect(o?.rebuttalDoc).toBe(1);
    });

    it('drops a malformed objection (no question or anchor)', () => {
      expect(resolveObjection({ claimId: 'k', anchorQuote: 'x' }, claim, corpus, 1)).toBeNull();
    });
  });

  describe('asObjectionKind', () => {
    it('keeps a valid kind and defaults an unknown one', () => {
      expect(asObjectionKind('circular')).toBe('circular');
      expect(asObjectionKind('missing-baseline')).toBe('missing-baseline');
      expect(asObjectionKind('nonsense')).toBe('unstated-assumption');
    });
  });
});

let adapterReply: string | object = '{"objections":[]}';
let adapterFails = false;

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    generate: async () => {
      if (adapterFails) throw new Error('rate limited');
      return { raw: adapterReply };
    },
  }),
}));

const { runCrossExam } = await import('../src/live/prism/crossexam/run');

// runCrossExam's contract is "exactly ONE objection per claim". A model that returns several for the
// same claim must collapse to one — otherwise the headline count and per-claim glow over-count.
describe('cross-examination — the run', () => {
  const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;
  const corpus = [['the model assumes linear growth across every market it enters']];
  const claims = [
    { id: 'k', source: 0, page: 1, quote: 'growth is linear', title: 'Linear growth' },
  ];

  afterEach(() => {
    adapterFails = false;
  });

  describe('runCrossExam', () => {
    it('keeps only one objection per claim even if the model returns several', async () => {
      adapterReply = JSON.stringify({
        objections: [
          {
            claimId: 'k',
            kind: 'unstated-assumption',
            question: 'why assume linearity?',
            anchorQuote: 'the model assumes linear growth',
            addressed: false,
          },
          {
            claimId: 'k', // a second, duplicate objection for the same claim
            kind: 'overgeneralization',
            question: 'does it hold in every market?',
            anchorQuote: 'across every market it enters',
            addressed: false,
          },
        ],
      });
      const out = await runCrossExam(claims, corpus, cfg);
      expect(out).toHaveLength(1);
      expect(out?.[0]?.claimId).toBe('k');
    });

    it('salvages the complete objections from a truncated stream instead of losing them all', async () => {
      // The stream was cut mid-JSON: the first objection is complete, the second is chopped off and
      // the closing braces never arrive, so the whole-object parse fails. Without salvage this drops
      // EVERY objection; with it, the one complete + grounded objection still lands.
      adapterReply =
        '{"objections":[{"claimId":"k","kind":"unstated-assumption","question":"why assume linearity?","anchorQuote":"the model assumes linear growth","addressed":false},{"claimId":"k","kind":"overgen';
      const out = await runCrossExam(claims, corpus, cfg);
      expect(out).toHaveLength(1);
      expect(out?.[0]?.claimId).toBe('k');
    });

    it('returns null — not an empty all-clear — when the model call fails outright', async () => {
      // [] is "the pass ran and nothing stuck"; a 429 / dropped connection is not that, and reporting
      // it as one hands the document a clean bill of health it never earned.
      adapterFails = true;
      expect(await runCrossExam(claims, corpus, cfg)).toBeNull();
    });

    it('still returns [] when the pass really did run and nothing stuck', async () => {
      adapterReply = '{"objections":[]}';
      expect(await runCrossExam(claims, corpus, cfg)).toEqual([]);
    });
  });
});

// What the reader actually sees when that null comes back: the dock must say the pass didn't run,
// never reuse the "nothing stuck" line — the same failure the null return exists to preserve.
describe('cross-examination — the panel', () => {
  afterEach(cleanup);

  it('says the cross-examination could not run instead of clearing the document', () => {
    render(
      <CrossExamPanel
        objections={[]}
        busy={false}
        failed
        onFocusObjection={vi.fn()}
        activeId={null}
        multiDoc={false}
        docLabel={() => 'doc'}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Couldn’t run the cross-examination — try again/)).toBeTruthy();
    expect(screen.queryByText(/No objection stuck/)).toBeNull();
  });

  it('keeps the honest all-clear when the pass really ran and found nothing', () => {
    render(
      <CrossExamPanel
        objections={[]}
        busy={false}
        onFocusObjection={vi.fn()}
        activeId={null}
        multiDoc={false}
        docLabel={() => 'doc'}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/No objection stuck/)).toBeTruthy();
  });
});
