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

// ── Quote snapping — the recovery path for noisy sources (OCR scans, odd extractions) ────────────
//
// The strict gate above rejects a quote that differs from the page by even one OCR artifact
// ("PATENT-ED" vs "PATENTED"), which silently discards every real claim on a scanned document.
// Snapping fixes that WITHOUT weakening the invariant: it fuzzily LOCATES the span the model
// meant, then returns the page's own exact text for that span — so what gets shown is the
// document's words (garble and all), never the model's paraphrase. The result always re-passes
// the strict gate (guaranteed by construction and re-checked before returning); a quote that
// aligns with nothing real still returns null and the claim is dropped.

/** The normalized text of a source plus, for each normalized char, the index of the char it came
 *  from in the NFKC'd original — so a normalized match span maps back to real source text. */
interface NormalizedMap {
  text: string;
  /** idx[i] = index in the NFKC source of the original char behind text[i]. */
  idx: number[];
  /** The NFKC'd source the indices point into. */
  source: string;
}

/** Mirror of normalizePdfText's transforms, kept per-character so every emitted char remembers
 *  where it came from. Must stay behaviorally identical to normalizePdfText — the strict gate
 *  re-checks every snapped quote, so any drift fails closed (snap returns null), never open. */
function normalizeWithMap(raw: string): NormalizedMap {
  const source = raw.normalize('NFKC');
  const text: string[] = [];
  const idx: number[] = [];
  let pendingSpace = false;
  const push = (c: string, at: number): void => {
    if (pendingSpace && text.length > 0) {
      text.push(' ');
      idx.push(at);
    }
    pendingSpace = false;
    text.push(c);
    idx.push(at);
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '­') continue; // soft hyphen
    if (/\s/.test(c)) {
      pendingSpace = true;
      continue;
    }
    if ("'‘’‛".includes(c)) {
      push("'", i);
      continue;
    }
    if ('“”'.includes(c)) {
      push('"', i);
      continue;
    }
    if (c >= '‐' && c <= '―') {
      // a unicode hyphen/dash; hyphenation rejoin below treats it like '-'
      if (/\s/.test(source[i + 1] ?? '')) {
        // "-\s+" → '' (line-wrap rejoin): drop the hyphen AND the whole whitespace run
        let j = i + 1;
        while (j < source.length && /\s/.test(source[j])) j++;
        i = j - 1;
        continue;
      }
      push('-', i);
      continue;
    }
    if (c === '-' && /\s/.test(source[i + 1] ?? '')) {
      // line-wrap hyphenation: drop the hyphen AND the following whitespace run
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j++;
      i = j - 1;
      continue;
    }
    if ('$€£¥'.includes(c) && pendingSpace === false) {
      push(c, i);
      // bind "$ 10,253" → "$10,253": swallow whitespace between a currency symbol and a digit
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j++;
      if (j > i + 1 && /[\d(]/.test(source[j] ?? '')) i = j - 1;
      continue;
    }
    push(c.toLowerCase(), i);
  }
  return { text: text.join(''), idx, source };
}

/** Character-bigram Dice similarity of two normalized strings — order-tolerant enough for OCR
 *  noise, strict enough that unrelated sentences score low. */
function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hit = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hit++;
    }
  }
  return (2 * hit) / (a.length + b.length - 2);
}

/** How similar an aligned span must be to count as "the span the model meant". High enough that
 *  a fabricated sentence sharing topic words can't pass; low enough to absorb OCR artifacts. */
const SNAP_THRESHOLD = 0.82;
/** Snapped quotes shorter than this are too weak to anchor a claim — reject. */
const SNAP_MIN_CHARS = 12;

/** One token of normalized page text with its char span, for subsequence alignment. */
interface PageToken {
  t: string;
  start: number;
  end: number;
}

function tokenize(text: string): PageToken[] {
  const out: PageToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ t: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** Loose token equality for OCR noise: exact, high bigram overlap, or a strong prefix/suffix
 *  relationship (hyphen-splits and chopped words: "librium" ↔ "equilibrium"). */
function fuzzyTok(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && bigramDice(a, b) >= 0.7) return true;
  if (a.length >= 5 || b.length >= 5) {
    const [sh, lo] = a.length <= b.length ? [a, b] : [b, a];
    if (sh.length / lo.length >= 0.5 && (lo.startsWith(sh) || lo.endsWith(sh))) return true;
  }
  return false;
}

/** How many consecutive page tokens an alignment may skip — an interleaved column line is roughly
 *  a dozen words, so this bridges two-column scans without letting a match wander the page. */
const SKIP_RUN = 14;
/** Minimum fraction of quote tokens that must align, and the max stretch of the matched span
 *  relative to the quote (interleave noise inflates the span; beyond this it's not one passage). */
const ALIGN_RATIO = 0.78;
const SPAN_STRETCH = 2.8;

/** Stage-2 recovery: align the quote's tokens as an ordered subsequence of the page's tokens,
 *  tolerating interleaved runs from OTHER columns between them (two-column scans whose OCR layer
 *  is line-interleaved). Returns the contiguous normalized span covering the alignment. */
function alignSubsequence(q: string, pageToks: PageToken[]): { start: number; end: number } | null {
  const qToks = q.split(' ').filter(Boolean);
  if (qToks.length < 4) return null;
  // Anchor on positions matching the quote's first (or second) token.
  const anchors: number[] = [];
  for (let j = 0; j < pageToks.length && anchors.length < 240; j++) {
    if (fuzzyTok(qToks[0], pageToks[j].t) || fuzzyTok(qToks[1], pageToks[j].t)) anchors.push(j);
  }
  let best: { ratio: number; span: number; start: number; end: number } | null = null;
  for (const a of anchors) {
    let cursor = a;
    let matched = 0;
    let first = -1;
    let last = -1;
    for (const qt of qToks) {
      const limit = Math.min(pageToks.length, cursor + SKIP_RUN);
      for (let j = cursor; j < limit; j++) {
        if (fuzzyTok(qt, pageToks[j].t)) {
          matched++;
          if (first < 0) first = j;
          last = j;
          cursor = j + 1;
          break;
        }
      }
    }
    if (first < 0 || last < 0) continue;
    const ratio = matched / qToks.length;
    const span = pageToks[last].end - pageToks[first].start;
    if (ratio < ALIGN_RATIO || span > q.length * SPAN_STRETCH) continue;
    if (!best || ratio > best.ratio || (ratio === best.ratio && span < best.span)) {
      best = { ratio, span, start: pageToks[first].start, end: pageToks[last].end };
    }
  }
  return best ? { start: best.start, end: best.end } : null;
}

/**
 * Locate the page span a (possibly OCR-mismatched) quote refers to and return the page's OWN text
 * for it — or null when nothing on the page aligns. The returned string always passes
 * isVerbatimOnPage against this page; display it in place of the model's version.
 */
export function snapQuoteToPage(quote: string, pageText: string): string | null {
  const q = normalizePdfText(quote);
  if (q.length < SNAP_MIN_CHARS) return null;
  const page = normalizeWithMap(pageText);
  if (page.text.length < q.length / 2) return null;

  // Fast path: already verbatim — return the source's exact span anyway (caller may still want
  // the source-cased text).
  const exact = page.text.indexOf(q);
  let start: number;
  let end: number;
  if (exact >= 0) {
    start = exact;
    end = exact + q.length;
  } else {
    // Coarse scan: slide a q-sized window in q/8 steps and keep the best bigram-Dice score …
    const step = Math.max(2, Math.floor(q.length / 8));
    let bestAt = -1;
    let bestScore = 0;
    for (let at = 0; at + q.length <= page.text.length; at += step) {
      const score = bigramDice(q, page.text.slice(at, at + q.length));
      if (score > bestScore) {
        bestScore = score;
        bestAt = at;
      }
    }
    if (bestAt < 0) return null;
    // … then refine around the winner at single-char resolution, letting the window stretch a
    // little (OCR inserts/drops characters, so the true span isn't exactly q.length long).
    const stretch = Math.max(4, Math.floor(q.length * 0.15));
    let refinedAt = bestAt;
    let refinedLen = q.length;
    for (
      let at = Math.max(0, bestAt - step);
      at <= Math.min(page.text.length - 1, bestAt + step);
      at++
    ) {
      for (const len of [q.length - stretch, q.length, q.length + stretch]) {
        if (len < SNAP_MIN_CHARS || at + len > page.text.length) continue;
        const score = bigramDice(q, page.text.slice(at, at + len));
        if (score > bestScore) {
          bestScore = score;
          refinedAt = at;
          refinedLen = len;
        }
      }
    }
    if (bestScore >= SNAP_THRESHOLD) {
      start = refinedAt;
      end = refinedAt + refinedLen;
    } else {
      // Contiguous alignment failed — try the subsequence path (two-column scans interleave the
      // quote with the other column's lines, so no contiguous window ever scores well).
      const sub = alignSubsequence(q, tokenize(page.text));
      if (!sub) return null;
      start = sub.start;
      end = sub.end;
    }
  }

  // Snap the span to word boundaries so the shown quote never starts or ends mid-word.
  while (start > 0 && page.text[start - 1] !== ' ') start--;
  while (end < page.text.length && page.text[end] !== ' ') end++;
  const from = page.idx[start];
  const to = page.idx[end - 1];
  if (from === undefined || to === undefined) return null;
  const snapped = page.source.slice(from, to + 1).trim();
  // The invariant, enforced: whatever we return must pass the strict gate. Any drift between
  // normalizeWithMap and normalizePdfText fails CLOSED here.
  if (snapped.length < SNAP_MIN_CHARS || !isVerbatimOnPage(snapped, pageText)) return null;
  return snapped;
}
