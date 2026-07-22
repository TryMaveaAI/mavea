// ask/types.ts — the shapes of an "Ask It" turn. You ask the exploded document a question; the
// answer comes back with verbatim span anchors (the exact sentences that support it, each on a real
// page) plus an honest coverage verdict — and, only when the document falls short and web search is
// on, one gated outside fact. Every span is verified against the real page text before it can show
// (see ask.ts / grounding.ts); nothing here can exist without grounding, exactly like a claim card.

/** How well the document itself answered the question. Drives the honest provenance line:
 *  `full` — the answer is wholly in the document; `partial` — part is, the rest isn't; `none` — the
 *  document doesn't address it (then `outside` may carry a cited world fact, if web search is on). */
export type AskCoverage = 'full' | 'partial' | 'none';

/** One verbatim anchor for an answer: the exact sentence(s), the document it's in, and the real page.
 *  Verified verbatim on that page before it's kept — a span that can't be cited is dropped, never shown. */
export interface AnswerSpan {
  /** Which attached document (index into the corpus / documents list). 0 for a single document. */
  doc: number;
  /** 1-indexed page, corrected to where the quote genuinely lives (see groundedPageOf). */
  page: number;
  /** The supporting sentence(s), copied verbatim from that page. */
  quote: string;
}

/** A cited fact from OUTSIDE the document — only ever present when the document didn't cover the
 *  question and web search is enabled. The citation rides the same verify gate as veracity (its quote
 *  must be verbatim in a snippet the search actually returned), so it is never invented. */
export interface OutsideFact {
  /** The world's answer, in plain words (kept distinct from the document's own text). */
  fact: string;
  citation: {
    /** Verbatim from a retrieved snippet (gate-verified). */
    quote: string;
    /** The real retrieved URL (never the model's transcription). */
    url: string;
    /** Display host, e.g. "imf.org". */
    host: string;
    /** Publication date if the source exposed one. */
    date?: string;
  };
}

/** A grounded answer to one question. `text` is the readout; `spans` are its proof on the page. */
export interface AskAnswer {
  /** The answer in plain words — a readout of the grounded spans, never beyond them. */
  text: string;
  /** Verbatim document anchors (may be empty when the answer lives entirely outside the document). */
  spans: AnswerSpan[];
  coverage: AskCoverage;
  /** A gated world fact, present only when coverage is partial/none AND web search is on AND it verified. */
  outside?: OutsideFact;
  /** True when the model DID answer from the retrieved pages but no supporting line could be verified
   *  verbatim (the small model paraphrased its quote). The answer is shown with an honest "couldn't
   *  highlight the exact line" note — NEVER the false "not in this document", which is what this fixes. */
  unpinned?: boolean;
}

/** One entry in the ask thread (the research notebook): the question and its resolving state. */
export interface AskTurn {
  id: string;
  question: string;
  status: 'pending' | 'done' | 'error';
  answer?: AskAnswer;
  error?: string;
}
