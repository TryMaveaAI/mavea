// locateText.ts — finds a claim's verbatim quote inside a document's extracted "page" text (a Word
// section, a slide's text, a chunk of plain text/Markdown/code), the same way grounding matches it
// (normalized: case/whitespace-insensitive), but returns the ORIGINAL substring so what's displayed
// stays verbatim. Used by TextSurface (Word/TXT/Markdown/code — zoom + ink + margin notes); its
// normalize-and-map matcher (buildNormalizedMap/findSpan) is also reused by sheetLocate.ts, which
// finds a quote's TABLE ROW instead of an inline span (a spreadsheet has no flowing text to mark).
import { normalizePdfText } from './grounding';

/** Normalize `text` char-by-char while remembering each normalized index's ORIGINAL index, so a hit
 *  in normalized space can be sliced back out of the real string (case/whitespace exactly as
 *  authored). `map[k]` is the original index of the k-th normalized character. */
export function buildNormalizedMap(text: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = '';
  for (let i = 0; i < text.length; i += 1) {
    const piece = normalizePdfText(text[i]);
    for (let j = 0; j < piece.length; j += 1) {
      norm += piece[j];
      map.push(i);
    }
    // normalizePdfText collapses whitespace; emulate by ensuring a single space between tokens.
    if (/\s/.test(text[i]) && norm.at(-1) !== ' ') {
      norm += ' ';
      map.push(i);
    }
  }
  return { norm, map };
}

/** Find `quote`'s [start, end) span in `text`'s ORIGINAL index space against an already-built
 *  normalized map, or null if not found — the one matching pass every quote lookup below reuses,
 *  so it's derived once instead of once per quote. */
export function findSpan(quote: string, norm: string, map: number[]): [number, number] | null {
  const nQuote = normalizePdfText(quote);
  if (!nQuote) return null;
  const hit = norm.indexOf(nQuote);
  if (hit < 0) return null;
  const start = map[hit];
  const end = map[Math.min(hit + nQuote.length - 1, map.length - 1)] + 1;
  return [start, end];
}

export interface TextSegment {
  text: string;
  /** 'primary' for the claim's own quote, `also-${i}` for the i-th sibling claim's quote (the same
   *  index AnnotationLayer's `also`/`alsoRects` use) — the caller renders this as the mark's
   *  `data-prism-anchor`, which useAnchoredRects reads back to measure it. Undefined = plain text. */
  anchor?: string;
}

/** Locate the primary quote AND every sibling ("also") claim's quote inside the SAME page text, and
 *  return the whole page as one ordered run of segments — plain text interleaved with the located
 *  spans — a caller can render as `<mark data-prism-anchor>` runs. Reuses `findSpan` (the same matching
 *  logic `locateInText` uses) per quote rather than re-deriving it. An overlap is resolved in favor
 *  of whichever quote was checked first (primary, then each `also` in order) — the SAME span is
 *  never marked twice. */
export function locateAllInText(
  text: string,
  quote: string,
  also: readonly { quote: string }[] | undefined,
): TextSegment[] {
  if (!text) return [];
  const { norm, map } = buildNormalizedMap(text);

  const found: { anchor: string; start: number; end: number }[] = [];
  const candidates: { anchor: string; quote: string }[] = [
    { anchor: 'primary', quote },
    ...(also ?? []).map((a, i) => ({ anchor: `also-${i}`, quote: a.quote })),
  ];
  for (const c of candidates) {
    if (!c.quote.trim()) continue;
    const span = findSpan(c.quote, norm, map);
    if (!span) continue;
    const [start, end] = span;
    // Priority order (primary first, then also in order) — an already-accepted span always wins a
    // character range over a later candidate, so the same words never carry two marks.
    if (found.some((f) => start < f.end && f.start < end)) continue;
    found.push({ anchor: c.anchor, start, end });
  }
  found.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start > cursor) segments.push({ text: text.slice(cursor, f.start) });
    segments.push({ text: text.slice(f.start, f.end), anchor: f.anchor });
    cursor = f.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
