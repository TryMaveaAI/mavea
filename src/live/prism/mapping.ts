// mapping.ts — pure helpers for Prism's claim-mapping step.
//
// The model call itself (mapClaims) lives with the provider integration; these are its pure,
// testable parts: how we chunk a document so the LLM cost stays bounded (a 40-page PDF becomes
// ~10 small calls, not one giant prompt), and how we drop any candidate claim that isn't grounded
// in the real page text — the anti-hallucination gate (grounding.ts) applied to model output
// before a single card is shown. Pure + deterministic.
import {
  isClaimGrounded,
  groundedPageOf,
  snapQuoteToPage,
  type GroundableClaim,
} from './grounding';

export interface PageWindow {
  /** 1-indexed inclusive page range this chunk covers (also the range the model may cite from). */
  startPage: number;
  endPage: number;
  /** The pages' text, each prefixed with its page marker so the model can attribute a claim. */
  text: string;
}

/**
 * Split per-page text into ~`windowSize`-page chunks for the map step. Each window carries its
 * 1-indexed page range and the marked-up text. Bounds model cost (≈ pages/windowSize calls) and
 * gives the model only the pages it's allowed to cite. Empty input → no windows.
 */
export function chunkPages(pages: readonly string[], windowSize = 4): PageWindow[] {
  const size = Math.max(1, Math.floor(windowSize));
  const out: PageWindow[] = [];
  for (let i = 0; i < pages.length; i += size) {
    const slice = pages.slice(i, i + size);
    out.push({
      startPage: i + 1,
      endPage: i + slice.length,
      text: slice.map((t, k) => `[p.${i + k + 1}]\n${t}`).join('\n\n'),
    });
  }
  return out;
}

/**
 * A "skim" of the WHOLE document for the cheap first pass of skim-then-deep: a thin slice of every
 * page (enough to see what each page is ABOUT, not to quote from), whitespace-collapsed so the whole
 * outline stays small no matter how long the document is. The model reads this once and points at the
 * pages worth deep-reading, so a 400-page PDF costs ~2 bounded calls instead of one giant prompt (or
 * ~100 tiny ones). `perPage` is the character budget per page in the outline.
 */
export function skimPagesToPrompt(pages: readonly string[], perPage = 220): string {
  const body = pages
    .map((t, i) => `[page ${i + 1}] ${t.slice(0, perPage).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  return `DOCUMENT OUTLINE — a thin slice of every page:\n${body}`;
}

/**
 * Parse the skim model's chosen pages (`{"pages":[n,…]}`): keep valid, in-range, integer page
 * numbers, dedupe, sort, and cap to `cap`. If the model returns nothing usable, fall back to an even
 * spread across the document so a skim miss still deep-reads a representative slice, never zero pages.
 */
export function parseSkimPages(raw: string | object, pageCount: number, cap: number): number[] {
  let picked: number[] = [];
  try {
    const obj =
      typeof raw === 'object'
        ? (raw as { pages?: unknown })
        : (JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { pages?: unknown });
    if (Array.isArray(obj.pages)) {
      picked = obj.pages
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= pageCount);
    }
  } catch {
    /* malformed JSON → fall through to the spread */
  }
  const uniq = [...new Set(picked)].sort((a, b) => a - b).slice(0, cap);
  if (uniq.length > 0) return uniq;
  const step = Math.max(1, Math.floor(pageCount / Math.max(1, cap)));
  const spread: number[] = [];
  for (let n = 1; n <= pageCount && spread.length < cap; n += step) spread.push(n);
  return spread;
}

/**
 * The DEEP prompt for skim-then-deep: the full text (up to `perPage` chars) of just the chosen
 * pages, each keeping its ORIGINAL 1-based page number in its marker so cited "page" values — and
 * therefore grounding — still line up with the real document. `pageLabels` annotates a marker with a
 * spreadsheet's real sheet name when present.
 */
export function selectedPagesToPrompt(
  pages: readonly string[],
  selected: readonly number[],
  perPage: number,
  pageLabels?: readonly string[],
): string {
  const body = selected
    .map((n) => {
      const label = pageLabels?.[n - 1];
      const marker = label ? `[page ${n} — "${label}"]` : `[page ${n}]`;
      return `${marker}\n${(pages[n - 1] ?? '').slice(0, perPage)}`;
    })
    .join('\n\n');
  return `DOCUMENT TEXT (cite "page" by these markers):\n${body}`;
}

/**
 * Keep only candidate claims that are real: quote verbatim on the cited page, page in range. This
 * is the gate applied to a model's output before any card renders — a fabricated or mis-cited claim
 * is dropped, never shown. Generic over any claim shape carrying { quote, page }.
 */
export function selectGroundedClaims<T extends GroundableClaim>(
  candidates: readonly T[],
  pages: readonly string[],
): T[] {
  return candidates.filter((c) => isClaimGrounded(c, pages));
}

/**
 * Ground claims for a REAL extracted document: keep every claim whose quote appears verbatim
 * anywhere, and correct its `page` to the page where the text actually lives. Real PDFs (multi-column
 * papers especially) make pdf.js page boundaries and the model's page counting drift, so a strict
 * same-page check drops legitimate claims; finding the true page saves them while keeping the
 * guarantee intact — a quote on NO page still grounds nowhere and is dropped. Order is preserved.
 */
export function groundClaims<T extends GroundableClaim>(
  candidates: readonly T[],
  pages: readonly string[],
): T[] {
  const out: T[] = [];
  for (const c of candidates) {
    const page = groundedPageOf(c.quote, pages, c.page);
    if (page > 0) {
      out.push({ ...c, page });
      continue;
    }
    // Recovery for noisy sources (OCR scans): the quote matches nothing verbatim, but it may still
    // refer to real page text through extraction artifacts. Snap it — fuzzily align the quote and
    // take the page's OWN words for that span — checking the claimed page first, then sweeping.
    // A snapped claim shows the document's text, never the model's; no alignment → dropped.
    const order = [...new Set([c.page, ...pages.map((_, i) => i + 1)])].filter(
      (n) => n >= 1 && n <= pages.length,
    );
    for (const p of order) {
      const snapped = snapQuoteToPage(c.quote, pages[p - 1]);
      if (snapped) {
        out.push({ ...c, quote: snapped, page: p });
        break;
      }
    }
  }
  return out;
}
