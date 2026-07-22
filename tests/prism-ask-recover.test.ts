import { afterEach, describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/live/providers';
import { recoverSpans, askDocument, type AskContext } from '../src/live/prism/ask/ask';
import type { ModelConfig } from '../src/types/mavea';

// Ask It used to collapse "the model paraphrased its supporting quote" into the false "not in this
// document." These pin the fix: a near-verbatim quote is re-anchored to the longest real run, and an
// answer that still can't be pinned is kept + flagged `unpinned` (honest caveat), never reported absent.

const PAGE =
  'The next design choice is who performs the process of conflict resolution. The system needs to be ' +
  'able to exploit heterogeneity in the infrastructure it runs on. Divergent versions of a data item ' +
  'arise in two scenarios: node failures and concurrent writers updating the same item.';

describe('recoverSpans', () => {
  it('re-anchors a near-verbatim quote to its longest real run', () => {
    // "scenario" vs the page's "scenarios" — a one-word paraphrase that fails the strict gate.
    const raw = [{ page: 1, quote: 'Divergent versions of a data item arise in two scenario' }];
    const spans = recoverSpans(raw, [[PAGE]]);
    expect(spans).toHaveLength(1);
    expect(PAGE).toContain(spans[0].quote); // the recovered run is genuinely verbatim on the page
    expect(spans[0].quote.length).toBeGreaterThanOrEqual(24);
    expect(spans[0].quote).toContain('Divergent versions of a data item arise in two');
  });

  it('recovers nothing when no substantial run is verbatim', () => {
    expect(
      recoverSpans([{ page: 1, quote: 'wholly unrelated invented sentence here' }], [[PAGE]]),
    ).toEqual([]);
  });
});

// ── askDocument coverage semantics (stubbed model) ──
const cfg: ModelConfig = { provider: 'anthropic', model: 'test' };
const ctx = (corpus: string[][]): AskContext => ({ corpus, cfg, multiDoc: false });
const original = ADAPTERS.anthropic;
afterEach(() => {
  ADAPTERS.anthropic = original;
});
function stub(raw: string): void {
  ADAPTERS.anthropic = {
    async generate() {
      return { raw };
    },
  } as unknown as (typeof ADAPTERS)['anthropic'];
}

describe('askDocument no longer cries "not in document" wrongly', () => {
  it('recovers the anchor when the model paraphrases (span grounded via recovery)', async () => {
    stub(
      JSON.stringify({
        answer: 'Divergent versions arise from node failures and concurrent writers.',
        coverage: 'full',
        spans: [{ page: 1, quote: 'Divergent versions of a data item arise in two scenario' }],
      }),
    );
    const a = await askDocument('why are there divergent versions?', ctx([[PAGE]]));
    expect(a.spans.length).toBeGreaterThan(0);
    expect(a.text).toContain('Divergent');
    expect(a.unpinned).toBeUndefined();
  });

  it('keeps the answer with an honest unpinned flag when nothing can be pinned', async () => {
    stub(
      JSON.stringify({
        answer: 'The document explains that divergent versions arise in two scenarios.',
        coverage: 'full',
        spans: [{ page: 1, quote: 'a completely reworded paraphrase with no verbatim run at all' }],
      }),
    );
    const a = await askDocument('why are there divergent versions?', ctx([[PAGE]]));
    expect(a.unpinned).toBe(true);
    expect(a.text).toContain('divergent versions'); // the answer is kept…
    expect(a.text).not.toContain("couldn't find"); // …NOT replaced by the false-absence line
  });

  it('still says "not in document" when the model itself reports coverage none', async () => {
    stub(
      JSON.stringify({ answer: 'the document does not cover this', coverage: 'none', spans: [] }),
    );
    const a = await askDocument('what is the airspeed of a swallow?', ctx([[PAGE]]));
    expect(a.unpinned).toBeUndefined();
    expect(a.coverage).toBe('none');
    expect(a.text).toContain("couldn't find");
  });
});
