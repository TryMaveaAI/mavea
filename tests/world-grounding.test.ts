// world-grounding.test.ts — what the grounding park is allowed to HOLD. A turn parks the evidence
// its world would be built from (the user's attached files and the sources it cited) because the
// explode can run minutes later, and re-fetching would spend the search budget twice. That park is
// a module-level Map keyed by question text, so without a cap it is a session-long leak: every
// causal question a reader ever asks keeps its whole attachment payload alive for a world nobody
// opened. These pin the cap, the eviction order, the honest empty answer past it — and that a
// source's own EXCERPT reaches the corpus, without which every figure a world proposes fails the
// verbatim gate it is about to be judged by.
import { describe, expect, it } from 'vitest';
import { makeAttributor } from '../src/live/ground/evidence';
import { GROUNDING_CAP, rememberTurnGrounding, turnCorpus } from '../src/live/world/grounding';

/** A question and the one source line a turn would have parked with it. */
const park = (n: number): string => {
  const question = `why did thing ${n} happen?`;
  rememberTurnGrounding(question, {
    attachments: [],
    sources: [
      {
        title: `Source ${n}`,
        url: `https://example.test/${n}`,
        snippet: `Thing ${n} rose 12% over the year.`,
      },
    ],
  });
  return question;
};

describe('the grounding park', () => {
  it(`holds ${GROUNDING_CAP} questions and evicts the least recently parked`, async () => {
    const questions = Array.from({ length: GROUNDING_CAP + 1 }, (_, i) => park(i));
    const [evicted, ...kept] = questions;

    // Past the cap the oldest is gone — and gone means EMPTY, not stale: a world built on it is
    // honestly structure-only rather than grounded in another question's evidence.
    expect((await turnCorpus(evicted)).text).toBe('');
    for (const question of kept) expect((await turnCorpus(question)).text).toContain('Source');
  });

  it('re-parking a question refreshes it, so a re-ask survives the next eviction', async () => {
    const first = park(10);
    for (let i = 11; i < 10 + GROUNDING_CAP; i += 1) park(i);
    park(10); // the reader asks it again — the newer turn's grounding, at the newest position

    park(99); // one more, which must push out the OTHER entry, not the refreshed one
    expect((await turnCorpus(first)).text).toContain('Source 10');
  });

  it('answers a question nobody parked with an empty corpus', async () => {
    const corpus = await turnCorpus('why did a turn that never offered a world happen?');
    expect(corpus.text).toBe('');
    expect(corpus.chunks).toEqual([]);
  });

  it("carries each source's EXCERPT, and attributes a quote to the source it was found in", async () => {
    // The corpus used to be title-and-URL only, so the sentence a T2 figure has to quote was never
    // in it: the model proposed a real number, the verbatim gate could not find it, and the world
    // came out ungrounded however good the evidence behind it was.
    const question = park(42);
    const corpus = await turnCorpus(question);
    expect(corpus.text).toContain('Thing 42 rose 12% over the year.');

    // And the provenance is Mavéa's, derived from where the quote actually matched — never a URL
    // the model wrote next to its own claim.
    const sourceOf = makeAttributor(corpus);
    expect(sourceOf('Thing 42 rose 12% over the year.')).toMatchObject({
      kind: 'web',
      url: 'https://example.test/42',
      host: 'example.test',
    });
    expect(sourceOf('a sentence no source ever carried')).toBeNull();
  });
});
