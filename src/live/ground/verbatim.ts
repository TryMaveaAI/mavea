// verbatim.ts — the strict, unicode-preserving "is this quote really in the source?" gate.
//
// Canonical home for the document-grade verbatim check (Prism's grounding gate is now a re-export of
// this). A claim may only show a quote that appears VERBATIM in the source it cites. This gate is
// deliberately STRICT — an exact substring match after source-shaped, unicode-preserving
// normalization — because a document you hold in your hand is not misheard speech: it must (a) reject
// a fabricated quote that merely shares words, and (b) accept a real quote containing accents or
// ligatures. (The fuzzy speech grounder lives in transcript.ts and is a different tool on purpose.)
// Pure + deterministic.

/**
 * Normalize source text so a real quote and its source match despite extraction artifacts, WITHOUT
 * discarding what distinguishes real text from a fabrication:
 *   · NFKC folds compatibility forms (ﬁ/ﬂ ligatures, full-width chars) → 'fi', 'fl', …
 *   · soft hyphens (U+00AD) are removed
 *   · smart quotes/dashes are flattened to ASCII so they compare equal
 *   · line-wrap hyphenation ("manage-\nment") is rejoined
 *   · all whitespace (incl. NBSP) collapses to single spaces; case is folded for the match
 * Accented letters are PRESERVED (NFKC keeps "é"), so "café" still matches "café".
 */
export function normalizePdfText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/­/g, '') // soft hyphen
    .replace(/[‘’‛]/g, "'") // ' ' ‛ → '
    .replace(/[“”]/g, '"') // " " → "
    .replace(/[‐-―]/g, '-') // various unicode hyphens/dashes → -
    .replace(/-\s+/g, '') // rejoin line-wrap hyphenation ("manage- ment" → "management")
    .replace(/\s+/g, ' ') // collapse all whitespace (incl. NBSP, already NFKC→space)
    .replace(/([$€£¥]) (?=[\d(])/g, '$1') // bind a currency symbol to its number: "$ 10,253" → "$10,253"
    .trim()
    .toLowerCase();
}

/** True if `quote` appears verbatim (after normalization) within `pageText`. Empty quotes never
 *  ground — a card must carry real supporting text. */
export function isVerbatimOnPage(quote: string, pageText: string): boolean {
  const q = normalizePdfText(quote);
  if (q.length === 0) return false;
  return normalizePdfText(pageText).includes(q);
}

/**
 * The same gate bound to one fixed body of text, which is normalized here rather than on every
 * check. Reach for this whenever many quotes are tested against a single source — a causal web
 * grounds every node and every edge against the same corpus, and the corpus is by far the expensive
 * side of the comparison. The verdict is identical to isVerbatimOnPage's, quote for quote.
 */
export function makeVerbatimGrounder(sourceText: string): (quote: string) => boolean {
  const source = normalizePdfText(sourceText);
  return (quote: string): boolean => {
    const q = normalizePdfText(quote);
    return q.length > 0 && source.includes(q);
  };
}

/**
 * Normalized page text, remembered against the page array it came from. A real document is grounded
 * one claim at a time and each claim sweeps the same pages, so without this a page is re-folded
 * through NFKC and the whole regex chain once per claim. Filled lazily — a page costs nothing until
 * some claim actually looks at it — and held weakly, so a document's normalized copy is released
 * along with the document. Callers only ever read `pages`, so an entry can't go stale.
 */
const normalizedPages = new WeakMap<readonly string[], (string | undefined)[]>();

/** The normalized text of `pages[i]`, computed at most once per page array. */
function normalizedPage(pages: readonly string[], i: number): string {
  let cached = normalizedPages.get(pages);
  if (!cached) {
    cached = [];
    normalizedPages.set(pages, cached);
  }
  return (cached[i] ??= normalizePdfText(pages[i]));
}

/** A claim's verifiable parts: the quote and the 1-indexed page it claims to come from. */
export interface GroundableClaim {
  quote: string;
  /** 1-indexed page number, as humans (and pdfjs) count them. */
  page: number;
}

/**
 * Whether a claim is real: its page must be in range and its quote must appear verbatim on exactly
 * that page. `pages[i]` is the extracted text of page i+1. A claim that fails either check is not
 * grounded and must be dropped (never rendered). The page check is strict — a quote that exists on
 * a different page than claimed is a mis-citation and is rejected, so every shown page number is true.
 */
export function isClaimGrounded(claim: GroundableClaim, pages: readonly string[]): boolean {
  if (!Number.isInteger(claim.page) || claim.page < 1 || claim.page > pages.length) return false;
  const q = normalizePdfText(claim.quote);
  if (q.length === 0) return false;
  return normalizedPage(pages, claim.page - 1).includes(q);
}

/**
 * Find the 1-indexed page that actually contains this quote verbatim, or 0 if none does. We check the
 * claimed page first (so a correctly-cited quote keeps its page), then sweep the rest. This is for
 * real PDFs, where pdf.js's page boundaries and the model's page counting can drift by a page — the
 * quote is still verbatim *somewhere*, so rather than drop a real claim over a page-number mismatch
 * we correct the attribution to the page where the text genuinely lives. The anti-hallucination
 * guarantee is unchanged: a quote that appears on NO page still grounds nowhere and is dropped.
 */
export function groundedPageOf(
  quote: string,
  pages: readonly string[],
  claimedPage?: number,
): number {
  const q = normalizePdfText(quote);
  if (q.length === 0) return 0;
  if (
    claimedPage &&
    claimedPage >= 1 &&
    claimedPage <= pages.length &&
    normalizedPage(pages, claimedPage - 1).includes(q)
  ) {
    return claimedPage;
  }
  for (let i = 0; i < pages.length; i += 1) {
    if (normalizedPage(pages, i).includes(q)) return i + 1;
  }
  return 0;
}
