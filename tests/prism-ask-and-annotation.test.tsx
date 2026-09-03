import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADAPTERS } from '../src/live/providers';
import { penStrokes, type PenRect } from '../src/live/annotate/penStrokes';
import { groundSpans, selectPages } from '../src/live/prism/ask';
import { askDocument, recoverSpans, type AskContext } from '../src/live/prism/ask/ask';
import { AskPanel } from '../src/live/prism/ask/AskPanel';
import { autoAnnotationSteps } from '../src/live/prism/annotation/annotationAuto';
import {
  claimExplain,
  claimReelCaption,
  inkForKind,
  INK_KEY,
} from '../src/live/prism/annotation/pen';
import { buildBriefing } from '../src/live/prism/briefing';
import { locateQuote } from '../src/live/prism/extractPdf';
import { buildLeverModel, type RawLeverNode } from '../src/live/prism/levers/build';
import { boundSatisfied, evaluate } from '../src/live/prism/levers/dag';
import { evalExpr, identifiersIn } from '../src/live/prism/levers/expr';
import type { Attachment } from '../src/live/attachments';
import type { AskTurn } from '../src/live/prism/ask';
import type { Placed } from '../src/live/prism/layout';
import type { LeverNode } from '../src/live/prism/levers/types';
import type { Claim, ClaimKind, ClaimRole, PrismSpec, Thread } from '../src/live/prism/types';
import type { Verdict } from '../src/live/prism/veracity';
import type { ModelConfig } from '../src/types/mavea';

describe('Ask It — span grounding and page selection', () => {
  // groundSpans is the anti-hallucination gate for an Ask It answer: a span may only point at a quote
  // that appears VERBATIM in the cited document. Same sacred rule as a claim card — anything the page
  // can't prove is dropped, never shown.
  describe('groundSpans', () => {
    const corpus = [['intro about widgets', 'the market reaches $87B by 2030', 'closing remarks']];

    it('keeps a verbatim span and corrects a drifted page', () => {
      const out = groundSpans([{ doc: 0, page: 1, quote: 'reaches $87B' }], corpus);
      expect(out).toEqual([{ doc: 0, page: 2, quote: 'reaches $87B' }]);
    });

    it('drops a fabricated span that appears on no page', () => {
      expect(
        groundSpans([{ doc: 0, page: 1, quote: 'profits tripled overnight' }], corpus),
      ).toEqual([]);
    });

    it('clamps an out-of-range doc index to a real document', () => {
      const out = groundSpans([{ doc: 9, page: 3, quote: 'closing remarks' }], corpus);
      expect(out).toEqual([{ doc: 0, page: 3, quote: 'closing remarks' }]);
    });

    it('grounds against the right document in multi-document mode', () => {
      const multi = [['alpha one'], ['beta two']];
      expect(groundSpans([{ doc: 1, page: 1, quote: 'beta two' }], multi)).toEqual([
        { doc: 1, page: 1, quote: 'beta two' },
      ]);
    });

    it('de-duplicates identical spans', () => {
      const out = groundSpans(
        [
          { doc: 0, page: 2, quote: 'reaches $87B' },
          { doc: 0, page: 2, quote: 'reaches $87B' },
        ],
        corpus,
      );
      expect(out).toHaveLength(1);
    });

    it('caps the number of spans so an answer never floods the eye', () => {
      const pages = Array.from({ length: 9 }, (_, i) => `page ${i} marker${i}`);
      const spans = Array.from({ length: 9 }, (_, i) => ({
        doc: 0,
        page: i + 1,
        quote: `marker${i}`,
      }));
      expect(groundSpans(spans, [pages])).toHaveLength(8);
    });

    it('ignores a non-array or malformed input', () => {
      expect(groundSpans(null, corpus)).toEqual([]);
      expect(groundSpans([{ doc: 0 }, 'nope', null], corpus)).toEqual([]);
    });

    it('never grounds an empty quote', () => {
      expect(groundSpans([{ doc: 0, page: 1, quote: '   ' }], corpus)).toEqual([]);
    });
  });

  // selectPages is the free, local retrieval that keeps the one ask cheap on a big pile: a small corpus
  // goes whole (in reading order); a large one is ranked by keyword overlap and trimmed to budget.
  describe('selectPages', () => {
    it('returns every non-empty page in reading order for a small corpus', () => {
      const out = selectPages([['a', '', 'b']], 'anything');
      expect(out).toEqual([
        { doc: 0, page: 1, text: 'a' },
        { doc: 0, page: 3, text: 'b' },
      ]);
    });

    it('picks the most relevant page when the corpus exceeds the budget', () => {
      const corpus = [['apples and oranges', 'rockets to mars', 'bananas everywhere']];
      // Tiny budget forces ranking: only the page matching the question's keywords survives.
      const out = selectPages(corpus, 'mars rockets', 12);
      expect(out).toEqual([{ doc: 0, page: 2, text: 'rockets to mars' }]);
    });
  });
});

// Ask It used to collapse "the model paraphrased its supporting quote" into the false "not in this
// document." These pin the fix: a near-verbatim quote is re-anchored to the longest real run, and an
// answer that still can't be pinned is kept + flagged `unpinned` (honest caveat), never reported absent.
describe('Ask It — quote recovery and honest coverage', () => {
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
  const cfg: ModelConfig = { provider: 'anthropic', model: 'test', apiKey: 'test-key' };
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
          spans: [
            { page: 1, quote: 'a completely reworded paraphrase with no verbatim run at all' },
          ],
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
});

// AskPanel is the "ask the document" dock: a silent, text-first thread. These pin its core wiring —
// the answer renders with an honest coverage pill + page chips, a chip click spotlights its span, a
// typed question is asked, send is disabled while busy, and an outside fact is walled off from the doc.
describe('Ask It — the AskPanel dock', () => {
  afterEach(cleanup);

  const span = { doc: 0, page: 3, quote: 'Rent shall remain fixed for the term.' };
  const answered: AskTurn = {
    id: 'q1',
    question: 'Can they raise rent mid-term?',
    status: 'done',
    answer: { text: 'No — rent is fixed for the term.', coverage: 'full', spans: [span] },
  };

  function renderPanel(overrides: Partial<React.ComponentProps<typeof AskPanel>> = {}) {
    const props = {
      turns: [answered],
      busy: false,
      onAsk: vi.fn(),
      onFocusSpan: vi.fn(),
      activeSpan: null,
      multiDoc: false,
      docLabel: (d: number) => `Doc ${d}`,
      onClose: vi.fn(),
      ...overrides,
    };
    render(<AskPanel {...props} />);
    return props;
  }

  describe('AskPanel', () => {
    it('renders the answer, its coverage, and the verbatim page chip', () => {
      renderPanel();
      expect(screen.getByText('No — rent is fixed for the term.')).toBeTruthy();
      expect(screen.getByText('in the document')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'p.3' })).toBeTruthy();
    });

    it('spotlights the span when its chip is clicked', () => {
      const { onFocusSpan } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'p.3' }));
      expect(onFocusSpan).toHaveBeenCalledWith(span);
    });

    it('asks a typed question', () => {
      const { onAsk } = renderPanel();
      const input = screen.getByLabelText('Ask this document a question');
      fireEvent.change(input, { target: { value: 'Who pays utilities?' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      expect(onAsk).toHaveBeenCalledWith('Who pays utilities?');
    });

    it('disables send while an answer is in flight', () => {
      renderPanel({ busy: true });
      expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('shows honest provenance and walls off an outside fact when the document does not cover it', () => {
      const none: AskTurn = {
        id: 'q2',
        question: "What's the stock price?",
        status: 'done',
        answer: {
          text: '',
          coverage: 'none',
          spans: [],
          outside: {
            fact: 'It traded at $5 yesterday.',
            citation: { quote: 'shares closed at $5', url: 'https://ex.com/a', host: 'ex.com' },
          },
        },
      };
      renderPanel({ turns: [none] });
      expect(screen.getByText('not in this document')).toBeTruthy();
      expect(screen.getByText('from outside this document')).toBeTruthy();
      expect(screen.getByText('It traded at $5 yesterday.')).toBeTruthy();
    });

    it('labels a page chip with its document in multi-document mode', () => {
      renderPanel({ multiDoc: true, docLabel: (d) => `Lease ${d}` });
      expect(screen.getByRole('button', { name: 'Lease 0 · p.3' })).toBeTruthy();
    });

    it('never links an outside citation whose URL is not plain http(s)', () => {
      const unsafe: AskTurn = {
        id: 'q3',
        question: 'Any price target?',
        status: 'done',
        answer: {
          text: '',
          coverage: 'none',
          spans: [],
          outside: {
            fact: 'Analysts see $80.',
            citation: {
              quote: 'price target of $80',
              url: 'javascript:alert(1)',
              host: 'ex.com',
            },
          },
        },
      };
      renderPanel({ turns: [unsafe] });
      expect(screen.getByText('Analysts see $80.')).toBeTruthy();
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText(/price target of \$80/)).toBeTruthy();
    });
  });
});

// The share reel's auto tour builds its narration with no model call. These lock the two things the
// user called out: the caption is a guided-tour line (frames WHY it matters) — NOT a raw quote dump —
// and a non-PDF document still produces beats (a caption-only card), so the reel is never empty.
describe('Annotation reel — the auto tour', () => {
  function claim(over: Partial<Claim> = {}): Claim {
    return {
      id: 'k',
      quote: 'Net revenue rose 12% to $4.2B in the fourth quarter of the fiscal year.',
      page: 3,
      kind: 'stat',
      title: 'Net revenue rose 12%',
      ask: 'how?',
      role: 'load-bearing',
      region: 'Results',
      source: 0,
      ...over,
    };
  }

  function spec(claims: Claim[], doc: Partial<PrismSpec['documents'][number]> = {}): PrismSpec {
    return {
      documents: [{ fileName: 'notes.txt', pageCount: 1, ...doc }],
      fileName: 'notes.txt',
      pageCount: 1,
      claims,
      regions: ['Results'],
      threads: [],
    };
  }

  const textDoc: Attachment = {
    name: 'notes.txt',
    mime: 'text/plain',
    data: '',
    size: 10,
  };

  describe('claimReelCaption', () => {
    it('frames the claim by role + kind + page, without dumping the raw quote', () => {
      const cap = claimReelCaption(claim());
      expect(cap).toBe('The figure the document leans on · page 3');
      // never the verbatim sentence
      expect(cap).not.toContain('$4.2B');
    });

    it('reads naturally for each role', () => {
      expect(claimReelCaption(claim({ role: 'supporting', kind: 'finding', page: 2 }))).toBe(
        'Supporting finding · page 2',
      );
      expect(claimReelCaption(claim({ role: 'context', kind: 'definition', page: 1 }))).toBe(
        'Context — definition · page 1',
      );
      expect(claimReelCaption(claim({ role: 'load-bearing', kind: 'forecast', page: 4 }))).toBe(
        'The forecast the document leans on · page 4',
      );
    });
  });

  describe('autoAnnotationSteps', () => {
    it('emits a framed caption beat for a non-PDF document (reel is never empty)', async () => {
      const steps = await autoAnnotationSteps(spec([claim()]), [textDoc]);
      expect(steps).toHaveLength(1);
      expect(steps[0].pageImage).toBe(''); // no raster — the finish shows a clean card
      expect(steps[0].rects).toEqual([]);
      expect(steps[0].explanation).toBe('The figure the document leans on · page 3');
      expect(steps[0].title).toBe('Net revenue rose 12%');
      // the explanation is a tour line, not the verbatim quote
      expect(steps[0].explanation).not.toContain('$4.2B');
    });
  });
});

// The pen-gesture selection that Prism's live page and the reel finish BOTH run, so the exported clip
// draws the exact mark the reader saw. Pure geometry → these lock the gesture choice per located
// shape, finiteness/containment, and determinism per seed.
describe('Annotation pen — gestures and ink', () => {
  const W = 1000;
  const H = 1400;

  /** Every coordinate in an SVG path `d`, for finiteness + containment checks. */
  function coords(d: string): { x: number; y: number }[] {
    const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
    return out;
  }

  const short: PenRect = { x: 120, y: 200, w: 80, h: 18 }; // a value: circled
  const wide: PenRect = { x: 50, y: 400, w: 720, h: 16 }; // a full prose line: degrades to underline
  const figure: PenRect = { x: 120, y: 600, w: 300, h: 200 };

  describe('penStrokes', () => {
    it('lassoes a figure when the claim is a figure', () => {
      const s = penStrokes([], figure, true, W, H, 'd0c0');
      expect(s).toHaveLength(1);
      expect(s[0].kind).toBe('circle');
    });

    it('circles a single short value', () => {
      const s = penStrokes([short], undefined, false, W, H, 'd0c1');
      expect(s).toHaveLength(1);
      expect(s[0].kind).toBe('circle');
    });

    it('degrades a single wide line to an underline (strokeFor)', () => {
      const s = penStrokes([wide], undefined, false, W, H, 'd0c2');
      expect(s).toHaveLength(1);
      expect(s[0].kind).toBe('underline');
    });

    it('underlines a two-line quote in reading order', () => {
      const lines: PenRect[] = [
        { x: 60, y: 300, w: 400, h: 16 },
        { x: 60, y: 322, w: 380, h: 16 },
      ];
      const s = penStrokes(lines, undefined, false, W, H, 'd0c3');
      expect(s).toHaveLength(2);
      expect(s.every((k) => k.kind === 'underline')).toBe(true);
      // reading order: the second underline sits lower than the first.
      const ys = s.map((k) => Math.min(...coords(k.d).map((p) => p.y)));
      expect(ys[0]).toBeLessThan(ys[1]);
    });

    it('braces a passage of three or more lines — a reader groups, never piles underlines', () => {
      const lines: PenRect[] = [
        { x: 60, y: 300, w: 400, h: 16 },
        { x: 60, y: 322, w: 380, h: 16 },
        { x: 60, y: 344, w: 220, h: 16 },
      ];
      const s = penStrokes(lines, undefined, false, W, H, 'd0c3');
      expect(s).toHaveLength(1);
      expect(s[0].kind).toBe('brace');
      // The brace spans the whole passage vertically, in the left margin of the lines.
      const ys = coords(s[0].d).map((p) => p.y);
      expect(Math.min(...ys)).toBeLessThanOrEqual(300);
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(360);
      expect(Math.max(...coords(s[0].d).map((p) => p.x))).toBeLessThan(60);
    });

    it('draws nothing when nothing is located (caption-only)', () => {
      expect(penStrokes([], undefined, false, W, H, 'd0c4')).toEqual([]);
    });

    it('keeps every coordinate finite and inside the page', () => {
      for (const s of penStrokes([wide, short], undefined, false, W, H, 'seed')) {
        for (const p of coords(s.d)) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          expect(p.x).toBeGreaterThanOrEqual(-2);
          expect(p.x).toBeLessThanOrEqual(W + 2);
          expect(p.y).toBeGreaterThanOrEqual(-2);
          expect(p.y).toBeLessThanOrEqual(H + 2);
        }
      }
    });

    it('is deterministic per seed', () => {
      const a = penStrokes([short], figure, false, W, H, 'same');
      const b = penStrokes([short], figure, false, W, H, 'same');
      const c = penStrokes([short], figure, false, W, H, 'other');
      expect(a.map((s) => s.d)).toEqual(b.map((s) => s.d));
      expect(a[0].d).not.toBe(c[0].d);
    });
  });

  function claim(role: ClaimRole, kind: ClaimKind): Claim {
    return {
      id: 'd0c0',
      kind,
      title: 'Net revenue rose 12%',
      ask: '?',
      role,
      region: 'Results',
      source: 0,
      quote: 'Revenue rose 12% to $4.2B',
      page: 3,
    };
  }

  describe('claimExplain', () => {
    it('reads the role and title into one line (no page reference — reel shows location visually)', () => {
      expect(claimExplain(claim('load-bearing', 'stat'))).toBe(
        'The document leans on this — Net revenue rose 12%',
      );
      expect(claimExplain(claim('supporting', 'finding'))).toBe(
        'Supporting evidence — Net revenue rose 12%',
      );
      expect(claimExplain(claim('context', 'definition'))).toBe('Context — Net revenue rose 12%');
    });

    it('contains no page reference', () => {
      expect(claimExplain(claim('load-bearing', 'stat'))).not.toMatch(/p\.\d|page \d/i);
    });
  });

  describe('ink colors', () => {
    it('is a concrete hex per kind (never a var(--…) token)', () => {
      const kinds: ClaimKind[] = [
        'forecast',
        'stat',
        'finding',
        'risk',
        'definition',
        'method',
        'diagram',
      ];
      for (const k of kinds) expect(inkForKind(k)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(INK_KEY).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// The grounding promise: when a claim says "page 5, this quote", the panel must highlight EXACTLY
// that text — not the whole line, not nothing. locateQuote turns pdf.js text items into highlight
// boxes; these tests pin that it boxes the matched substring precisely, spans line breaks, and
// matches through the same normalization the grounding gate uses (hyphenation, ligatures, case).
describe('locateQuote — precise highlight boxes on a PDF page', () => {
  // A stubbed pdf.js: identity viewport (canvas coords == item coords) and a Util.transform that
  // composes the viewport (identity) with the item transform — so we control positions directly.
  const pdfjs = {
    Util: {
      transform: (_vp: number[], m: number[]) => m, // identity viewport → item transform passes through
    },
  };
  const viewport = { transform: [1, 0, 0, 1, 0, 0], scale: 1 };

  /** Build a pdf.js-style text item at baseline (x, y) with the given font size and measured width. */
  function item(str: string, x: number, y: number, fontSize = 10, width = str.length * 6) {
    // transform = [fontSize, 0, 0, fontSize, x, y] → Util.transform returns it unchanged here
    return { str, transform: [fontSize, 0, 0, fontSize, x, y], width };
  }

  /** Total x-extent covered by the returned highlight rects. */
  function span(rects: { x: number; w: number }[]) {
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    return { left, right };
  }

  describe('locateQuote', () => {
    it('boxes only the matched substring, not the whole line', () => {
      // One item, 30 chars wide=180px from x=100. "reaches $87b" is chars 11..22.
      const content = { items: [item('the market reaches $87b by 2030', 100, 200)] };
      const rects = locateQuote(content, 'reaches $87B', viewport, pdfjs);
      expect(rects.length).toBeGreaterThan(0);
      const { left, right } = span(rects);
      // the match starts ~11 chars in (not at the line start) and ends well before the line end
      expect(left).toBeGreaterThan(100 + 40); // not the start of the line
      expect(right).toBeLessThan(100 + 180); // not the end of the line
    });

    it('spans a line break (two items on different lines)', () => {
      const content = {
        items: [
          item('cost parity with', 100, 200, 10, 96),
          item('beef was reached', 100, 180, 10, 96), // next line down (pdf.js y grows upward)
        ],
      };
      const rects = locateQuote(content, 'parity with beef', viewport, pdfjs);
      // the match crosses the line break → at least two bars on two y-rows
      const ys = new Set(rects.map((r) => Math.round(r.y)));
      expect(ys.size).toBe(2);
    });

    it('rejoins line-wrap hyphenation ("manage- ment" → "management")', () => {
      const content = {
        items: [
          item('improved manage-', 100, 200, 10, 96),
          item('ment of costs', 100, 180, 10, 78),
        ],
      };
      const rects = locateQuote(content, 'management of costs', viewport, pdfjs);
      expect(rects.length).toBeGreaterThan(0);
    });

    it('matches across ligatures and case (the ﬁ ligature, uppercase quote)', () => {
      const content = { items: [item('the ﬁnal report summary', 100, 200, 10, 144)] };
      const rects = locateQuote(content, 'FINAL REPORT', viewport, pdfjs);
      expect(rects.length).toBeGreaterThan(0);
    });

    it('returns nothing when the quote is not on the page', () => {
      const content = { items: [item('completely unrelated text', 100, 200)] };
      expect(locateQuote(content, 'profits tripled overnight', viewport, pdfjs)).toEqual([]);
    });

    it('derives a sensible box height from the font size (not a zero/garbage height)', () => {
      const content = { items: [item('readable claim text here', 100, 200, 12, 144)] };
      const rects = locateQuote(content, 'claim text', viewport, pdfjs);
      expect(rects.length).toBeGreaterThan(0);
      // height should be on the order of the 12px font, not the unreliable item.height (absent here)
      expect(rects[0].h).toBeGreaterThan(8);
      expect(rects[0].h).toBeLessThan(40);
    });
  });
});

// buildBriefing composes a deterministic flight from the settled map. Captions are assembled ONLY from
// real titles/quotes/relations/verdicts — these pin that the arc opens on the spine, dwells on real
// tensions/verdicts, and lands on the weakest point, with no invented prose.
describe('buildBriefing — the deterministic flight over a settled map', () => {
  function claim(over: Partial<Placed>): Placed {
    return {
      id: 'c',
      kind: 'finding',
      title: 'title',
      ask: 'ask',
      role: 'supporting',
      region: 'R',
      source: 0,
      quote: 'quote',
      page: 1,
      x: 0,
      y: 0,
      ...over,
    };
  }

  describe('buildBriefing', () => {
    it('returns no beats for an empty map', () => {
      expect(buildBriefing([], [], new Map())).toEqual([]);
    });

    it('opens on the load-bearing claim and closes honestly when nothing contradicts', () => {
      const claims = [
        claim({ id: 'k', role: 'load-bearing', quote: 'the market reaches $87B by 2030', page: 2 }),
      ];
      const beats = buildBriefing(claims, [], new Map());
      expect(beats).toHaveLength(2);
      expect(beats[0].kind).toBe('open');
      expect(beats[0].claimIds).toEqual(['k']);
      expect(beats[0].caption).toContain('the market reaches $87B by 2030');
      expect(beats.at(-1)?.kind).toBe('close');
      expect(beats.at(-1)?.caption).toContain('Nothing here contradicts itself');
    });

    it('picks the most-connected load-bearing claim as the spine', () => {
      const claims = [
        claim({ id: 'k1', role: 'load-bearing', page: 1 }),
        claim({ id: 'k2', role: 'load-bearing', page: 2 }),
        claim({ id: 's', role: 'supporting', page: 3 }),
      ];
      const threads: Thread[] = [{ a: 'k2', b: 's', relation: 'contradicts' }];
      const beats = buildBriefing(claims, threads, new Map());
      expect(beats[0].claimIds).toEqual(['k2']); // k2 has a thread, k1 has none
    });

    it('dwells on a contradiction and lands on it when there are no verdicts', () => {
      const claims = [
        claim({ id: 'a', role: 'load-bearing', quote: 'growth is 40%', page: 1 }),
        claim({ id: 'b', role: 'load-bearing', quote: 'growth is 30%', page: 5 }),
      ];
      const threads: Thread[] = [{ a: 'a', b: 'b', relation: 'contradicts' }];
      const beats = buildBriefing(claims, threads, new Map());
      const tension = beats.find((x) => x.kind === 'tension');
      expect(tension?.claimIds).toEqual(['a', 'b']);
      expect(tension?.caption).toContain('contradicts');
      const close = beats.at(-1);
      expect(close?.caption).toContain('contradicts itself');
      expect(close?.caption).toContain('p.1');
      expect(close?.caption).toContain('p.5');
    });

    it('surfaces a troubled verdict and lands on the weakest point', () => {
      const claims = [
        claim({ id: 'k', role: 'load-bearing', quote: 'core thesis', page: 1 }),
        claim({ id: 'm', role: 'supporting', quote: 'a shaky stat', page: 4 }),
      ];
      const verdicts = new Map<string, Verdict>([['m', 'contradicted']]);
      const beats = buildBriefing(claims, [], verdicts);
      const verdict = beats.find((x) => x.kind === 'verdict');
      expect(verdict?.claimIds).toEqual(['m']);
      expect(verdict?.caption).toContain('CONTRADICTED');
      const close = beats.at(-1);
      expect(close?.caption).toContain('The weak point');
      expect(close?.caption).toContain('CONTRADICTED');
    });

    it('paces every beat to a readable, bounded dwell', () => {
      const beats = buildBriefing([claim({ id: 'k', role: 'load-bearing' })], [], new Map());
      for (const b of beats) {
        expect(b.dwellMs).toBeGreaterThanOrEqual(2600);
        expect(b.dwellMs).toBeLessThanOrEqual(7000);
      }
    });
  });
});

// The Live Levers verdict path is pure code — this is what makes dragging trustworthy. These pin the
// safe evaluator, the dependency executor, and the grounding + self-consistency gate.
describe('Live Levers — the pure verdict path', () => {
  describe('evalExpr', () => {
    it('evaluates arithmetic with precedence and parentheses', () => {
      expect(evalExpr('2 + 3 * 4', {})).toBe(14);
      expect(evalExpr('(2 + 3) * 4', {})).toBe(20);
      expect(evalExpr('price * units', { price: 80, units: 100000 })).toBe(8_000_000);
      expect(evalExpr('(revenue - cost) / revenue * 100', { revenue: 100, cost: 60 })).toBe(40);
      expect(evalExpr('-x + 5', { x: 3 })).toBe(2);
    });

    it('returns NaN on division by zero, an unbound id, or malformed syntax', () => {
      expect(evalExpr('1 / 0', {})).toBeNaN();
      expect(evalExpr('a + b', { a: 1 })).toBeNaN();
      expect(evalExpr('2 +', {})).toBeNaN();
      expect(evalExpr('', {})).toBeNaN();
    });

    it('never executes anything but arithmetic (no JS evaluation)', () => {
      // identifiers are just unbound variables → NaN, never executed
      expect(evalExpr('alert(1)', {})).toBeNaN();
    });

    it('lists referenced identifiers', () => {
      expect(identifiersIn('price * units + tax')).toEqual(['price', 'units', 'tax']);
    });
  });

  function node(over: Partial<LeverNode>): LeverNode {
    return {
      id: 'n',
      label: 'n',
      printed: 0,
      unit: 'number',
      deps: [],
      quote: 'q',
      page: 1,
      doc: 0,
      ...over,
    };
  }

  describe('evaluate', () => {
    const nodes: LeverNode[] = [
      node({ id: 'price', printed: 80 }),
      node({ id: 'units', printed: 100000 }),
      node({
        id: 'revenue',
        printed: 8_000_000,
        formula: 'price * units',
        deps: ['price', 'units'],
      }),
    ];

    it('computes derived values from inputs', () => {
      expect(evaluate(nodes, new Map()).values.get('revenue')).toBe(8_000_000);
    });

    it('recomputes when an input is overridden', () => {
      expect(evaluate(nodes, new Map([['price', 40]])).values.get('revenue')).toBe(4_000_000);
    });

    it('leaves a cycle or bad formula unresolved, never a wrong number', () => {
      const cyc: LeverNode[] = [
        node({ id: 'a', formula: 'b + 1', deps: ['b'] }),
        node({ id: 'b', formula: 'a + 1', deps: ['a'] }),
      ];
      const r = evaluate(cyc, new Map());
      expect(r.unresolved.has('a')).toBe(true);
      expect(r.unresolved.has('b')).toBe(true);
    });
  });

  describe('boundSatisfied', () => {
    it('checks each comparator', () => {
      expect(boundSatisfied({ op: 'gte', value: 0 }, -5)).toBe(false);
      expect(boundSatisfied({ op: 'gte', value: 0 }, 5)).toBe(true);
      expect(boundSatisfied({ op: 'lt', value: 10 }, 8)).toBe(true);
    });
  });

  describe('buildLeverModel', () => {
    const corpus = [['Revenue is $100 and cost is $60.', 'Profit is $40.']];
    const raw: RawLeverNode[] = [
      {
        id: 'revenue',
        label: 'Revenue',
        value: 100,
        unit: 'currency',
        quote: 'Revenue is $100 and cost is $60.',
        page: 1,
      },
      {
        id: 'cost',
        label: 'Cost',
        value: 60,
        unit: 'currency',
        quote: 'Revenue is $100 and cost is $60.',
        page: 1,
      },
      {
        id: 'profit',
        label: 'Profit',
        value: 40,
        unit: 'currency',
        formula: 'revenue - cost',
        quote: 'Profit is $40.',
        page: 2,
        bound: { op: 'gte', value: 0 },
      },
    ];

    it('builds a grounded model where the derivation reproduces the printed value', () => {
      const model = buildLeverModel(raw, corpus);
      expect(model).not.toBeNull();
      expect(model!.inputs.sort()).toEqual(['cost', 'revenue']);
      expect(model!.nodes.find((n) => n.id === 'profit')?.formula).toBe('revenue - cost');
      // dragging cost above revenue flips the profit bound red
      const r = evaluate(model!.nodes, new Map([['cost', 120]]));
      expect(boundSatisfied({ op: 'gte', value: 0 }, r.values.get('profit')!)).toBe(false);
    });

    it('drops a derivation that does NOT reproduce the document’s printed value (self-consistency)', () => {
      // The document itself prints profit as $50, but revenue − cost = $40 → the formula doesn't follow,
      // so profit is dropped (no consistent derivation remains → nothing safe to drive).
      const badCorpus = [['Revenue is $100 and cost is $60.', 'Profit is $50.']];
      const bad = raw.map((n) =>
        n.id === 'profit' ? { ...n, value: 50, quote: 'Profit is $50.' } : n,
      );
      expect(buildLeverModel(bad, badCorpus)).toBeNull();
    });

    it('drops a node whose value is not grounded in its quote', () => {
      const ungrounded: RawLeverNode[] = [
        {
          id: 'x',
          value: 999,
          unit: 'currency',
          quote: 'Revenue is $100 and cost is $60.',
          page: 1,
        },
        ...raw,
      ];
      const model = buildLeverModel(ungrounded, corpus);
      expect(model?.nodes.some((n) => n.id === 'x')).toBeFalsy();
    });

    it('grounds each node to the document its quote actually lives in (multi-doc)', () => {
      // doc 0 has no figures; the whole model lives in doc 1. Every node must ground to doc 1, on the
      // right page WITHIN that document — not always doc 0.
      const multi = [
        ['Introduction with no figures.'],
        ['Revenue is $500 and cost is $200.', 'Profit is $300.'],
      ];
      const multiRaw: RawLeverNode[] = [
        {
          id: 'revenue',
          value: 500,
          unit: 'currency',
          quote: 'Revenue is $500 and cost is $200.',
          doc: 1,
          page: 1,
        },
        {
          id: 'cost',
          value: 200,
          unit: 'currency',
          quote: 'Revenue is $500 and cost is $200.',
          doc: 1,
          page: 1,
        },
        {
          id: 'profit',
          value: 300,
          unit: 'currency',
          formula: 'revenue - cost',
          quote: 'Profit is $300.',
          doc: 1,
          page: 2,
        },
      ];
      const model = buildLeverModel(multiRaw, multi);
      expect(model).not.toBeNull();
      expect(model!.nodes.every((n) => n.doc === 1)).toBe(true);
      expect(model!.nodes.find((n) => n.id === 'profit')?.page).toBe(2);
    });

    it('drops a node that claims the wrong document (quote not verbatim there)', () => {
      // The quote only exists in doc 1, but the node claims doc 0 → grounding against doc 0 fails → drop.
      const multi = [['Introduction with no figures.'], ['Revenue is $500 here.']];
      const wrongDoc: RawLeverNode[] = [
        {
          id: 'revenue',
          value: 500,
          unit: 'currency',
          quote: 'Revenue is $500 here.',
          doc: 0,
          page: 1,
        },
      ];
      expect(buildLeverModel(wrongDoc, multi)).toBeNull();
    });
  });
});
