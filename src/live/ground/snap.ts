// snap.ts — quote snapping, the recovery path for noisy sources (OCR scans, odd extractions).
//
// The strict gate in verbatim.ts rejects a quote that differs from the page by even one OCR artifact
// ("PATENT-ED" vs "PATENTED"), which silently discards every real claim on a scanned document.
// Snapping fixes that WITHOUT weakening the invariant: it fuzzily LOCATES the span the model
// meant, then returns the page's own exact text for that span — so what gets shown is the
// document's words (garble and all), never the model's paraphrase. The result always re-passes
// the strict gate (guaranteed by construction and re-checked before returning); a quote that
// aligns with nothing real still returns null and the claim is dropped.
//
// Kept apart from verbatim.ts on purpose: the strict gate is shared by half the app, while only
// Prism's claim grounding snaps, so this stays out of every other surface's payload.
import { isVerbatimOnPage, normalizePdfText } from './verbatim';

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

/** Character-bigram Dice similarity of `a` against the window `s[from, to)` — order-tolerant enough
 *  for OCR noise, strict enough that unrelated sentences score low. `a`'s bigram multiset is built
 *  once, so one quote can be scored against hundreds of page windows without slicing either side
 *  into two-char strings; a bigram is keyed by its two UTF-16 code units, which is exactly the
 *  equality those slices compared. A window bigram hits while `a` still has an unused copy of it. */
function bigramScorer(a: string): (s: string, from: number, to: number) => number {
  const code = (t: string, i: number): number => t.charCodeAt(i) * 0x10000 + t.charCodeAt(i + 1);
  const slot = new Map<number, number>();
  const counts: number[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    const k = slot.get(code(a, i));
    if (k === undefined) {
      slot.set(code(a, i), counts.length);
      counts.push(1);
    } else counts[k]++;
  }
  const used = new Int32Array(counts.length);
  return (s, from, to) => {
    const len = to - from;
    if (a.length < 2 || len < 2) return a === s.slice(from, to) ? 1 : 0;
    used.fill(0);
    let hit = 0;
    for (let i = from; i < to - 1; i++) {
      const k = slot.get(code(s, i));
      if (k !== undefined && used[k] < counts[k]) {
        used[k]++;
        hit++;
      }
    }
    return (2 * hit) / (a.length + len - 2);
  };
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
  if (a.length >= 4 && b.length >= 4 && bigramScorer(a)(b, 0, b.length) >= 0.7) return true;
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
function alignSubsequence(
  q: string,
  pageToks: readonly PageToken[],
): { start: number; end: number } | null {
  const qToks = q.split(' ').filter(Boolean);
  if (qToks.length < 4) return null;
  // Up to 240 anchors each walk every quote token across a 14-token window, so the same (quote
  // token, page word) pair is asked hundreds of times over; a page repeats its vocabulary, so the
  // verdicts are kept per distinct page word (0 = not yet asked, 1 = match, 2 = no match).
  const verdicts = new Map<string, Uint8Array>();
  const matches = (qi: number, word: string): boolean => {
    let row = verdicts.get(word);
    if (!row) {
      row = new Uint8Array(qToks.length);
      verdicts.set(word, row);
    }
    if (row[qi] === 0) row[qi] = fuzzyTok(qToks[qi], word) ? 1 : 2;
    return row[qi] === 1;
  };
  // Anchor on positions matching the quote's first (or second) token.
  const anchors: number[] = [];
  for (let j = 0; j < pageToks.length && anchors.length < 240; j++) {
    if (matches(0, pageToks[j].t) || matches(1, pageToks[j].t)) anchors.push(j);
  }
  let best: { ratio: number; span: number; start: number; end: number } | null = null;
  for (const a of anchors) {
    let cursor = a;
    let matched = 0;
    let first = -1;
    let last = -1;
    for (let qi = 0; qi < qToks.length; qi++) {
      const limit = Math.min(pageToks.length, cursor + SKIP_RUN);
      for (let j = cursor; j < limit; j++) {
        if (matches(qi, pageToks[j].t)) {
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

/** One page as the snapper reads it. Everything past `raw` is derived on first use and reused by
 *  every later quote tried against the same page. */
interface SnapPage {
  raw: string;
  map?: NormalizedMap;
  tokens?: PageToken[];
}

/** One quote as the snapper reads it: normalized once, its bigrams tabled on first use. */
interface SnapQuote {
  q: string;
  dice?: (s: string, from: number, to: number) => number;
}

function snapPrepared(quote: SnapQuote, pg: SnapPage): string | null {
  const { q } = quote;
  if (q.length < SNAP_MIN_CHARS) return null;
  const page = (pg.map ??= normalizeWithMap(pg.raw));
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
    const dice = (quote.dice ??= bigramScorer(q));
    // Coarse scan: slide a q-sized window in q/8 steps and keep the best bigram-Dice score …
    const step = Math.max(2, Math.floor(q.length / 8));
    let bestAt = -1;
    let bestScore = 0;
    for (let at = 0; at + q.length <= page.text.length; at += step) {
      const score = dice(page.text, at, at + q.length);
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
        const score = dice(page.text, at, at + len);
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
      const sub = alignSubsequence(q, (pg.tokens ??= tokenize(page.text)));
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
  if (snapped.length < SNAP_MIN_CHARS || !isVerbatimOnPage(snapped, pg.raw)) return null;
  return snapped;
}

/**
 * Locate the page span a (possibly OCR-mismatched) quote refers to and return the page's OWN text
 * for it — or null when nothing on the page aligns. The returned string always passes
 * isVerbatimOnPage against this page; display it in place of the model's version.
 */
export function snapQuoteToPage(quote: string, pageText: string): string | null {
  return snapPrepared({ q: normalizePdfText(quote) }, { raw: pageText });
}

/**
 * `snapQuoteToPage` over one document, for a caller that tries many quotes against many pages. A
 * quote that grounds nowhere is swept across EVERY page, so re-normalizing and re-tokenizing each
 * page per quote made a long document's recovery pass cost seconds. Pages are prepared on first
 * use and held only as long as the returned function is.
 */
export function makePageSnapper(
  pages: readonly string[],
): (quote: string, pageIndex: number) => string | null {
  const prepared: SnapPage[] = [];
  let last: { raw: string; quote: SnapQuote } | null = null;
  return (quote, pageIndex) => {
    if (last?.raw !== quote) last = { raw: quote, quote: { q: normalizePdfText(quote) } };
    return snapPrepared(last.quote, (prepared[pageIndex] ??= { raw: pages[pageIndex] ?? '' }));
  };
}
