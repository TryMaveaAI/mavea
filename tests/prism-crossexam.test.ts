import { describe, expect, it } from 'vitest';
import { resolveObjection, asObjectionKind } from '../src/live/prism/crossexam/resolve';

// resolveObjection is the pure gate: an objection may only point at the document's OWN verbatim words,
// and it is "addressed" only with a REAL verbatim rebuttal. A model that invents an anchor or claims a
// rebuttal that isn't there can't sneak past — exactly the trust the feature rests on.

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
