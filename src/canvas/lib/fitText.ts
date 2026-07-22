// fitText — fit a text label into a fixed box by wrapping AND shrinking the font, so the FULL
// string stays readable. This replaces the per-block "char-cap + … ellipsis" that quietly cut
// model-authored labels off against fixed SVG node/tick geometry: a label the user can only
// half-read is a bug, so we shrink to fit instead of truncating.
//
// Pure and DOM-free: width is estimated from an average glyph advance (the same technique the
// canvas layout tests already use), so it runs identically in the browser and under jsdom, and
// the node geometry that consumes the result is deterministic.

export interface FitTextOptions {
  /** Width available for a single line, in the same user units as `fontSize`. */
  maxWidth: number;
  /** Largest / preferred font size. */
  fontSize: number;
  /** Smallest legible font size. The text shrinks no further; past this it wraps to more lines
   *  rather than ever ellipsizing. Defaults to 60% of `fontSize` (floored at 9). */
  minFontSize?: number;
  /** Height available for the whole wrapped block. When set, the fit also shrinks to stay
   *  within it. Omit to let the block grow in height (wrap as far as it needs). */
  maxHeight?: number;
  /** Hard cap on wrapped lines regardless of size — a safety bound for pathological input. */
  maxLines?: number;
  /** Line height as a multiple of the font size. */
  lineHeight?: number;
  /** Bold text renders wider; widens the advance estimate. */
  bold?: boolean;
}

export interface FitTextResult {
  /** The wrapped lines — the FULL text, never ellipsized. */
  lines: string[];
  /** The font size the text fits at. */
  fontSize: number;
  /** Line height in user units (`fontSize * lineHeight`). */
  lineHeightPx: number;
}

// Average glyph advance as a fraction of the font size for the app's UI sans; bold runs wider.
// Deliberately a touch generous so the estimate errs toward "shrink a little more" over clipping.
const ADVANCE = 0.55;
const ADVANCE_BOLD = 0.6;

/** Estimated rendered width of `text` at `fontSize`. */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? ADVANCE_BOLD : ADVANCE);
}

/** Break a single word too wide for the line into width-fitting chunks (no ellipsis — the
 *  remainder wraps to the next line). Guaranteed to make progress: each chunk is ≥ 1 char. */
function hardBreak(word: string, maxWidth: number, fontSize: number, bold: boolean): string[] {
  const fits = (s: string): boolean => estimateTextWidth(s, fontSize, bold) <= maxWidth;
  if (fits(word)) return [word];
  const out: string[] = [];
  let rest = word;
  while (rest && !fits(rest)) {
    let lo = 1;
    let hi = rest.length;
    let cut = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(rest.slice(0, mid))) {
        cut = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Greedy word-wrap by MEASURED width (never a raw character count), so no line exceeds
 *  `maxWidth` at the given font size. */
function wrapByWidth(
  words: readonly string[],
  maxWidth: number,
  fontSize: number,
  bold: boolean,
): string[] {
  const fits = (s: string): boolean => estimateTextWidth(s, fontSize, bold) <= maxWidth;
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    // Place `w` on its own line; break it if it alone overflows.
    const parts = hardBreak(w, maxWidth, fontSize, bold);
    for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
    cur = parts[parts.length - 1];
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Wrap `text` to fit `maxWidth` (and optionally `maxHeight` / `maxLines`), shrinking the font
 * from `fontSize` down to `minFontSize` as needed. Returns the full text as wrapped lines plus
 * the chosen font size — the caller lays the lines out at `fontSize`/`lineHeightPx`.
 */
export function fitText(text: string, opts: FitTextOptions): FitTextResult {
  const {
    maxWidth,
    fontSize,
    minFontSize = Math.max(9, Math.round(fontSize * 0.6)),
    maxHeight,
    maxLines,
    lineHeight = 1.18,
    bold = false,
  } = opts;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [''], fontSize, lineHeightPx: fontSize * lineHeight };

  const floor = Math.min(minFontSize, fontSize);
  for (let size = fontSize; size >= floor; size--) {
    const lines = wrapByWidth(words, maxWidth, size, bold);
    const heightOk = maxHeight == null || lines.length * size * lineHeight <= maxHeight;
    const linesOk = maxLines == null || lines.length <= maxLines;
    if (heightOk && linesOk) return { lines, fontSize: size, lineHeightPx: size * lineHeight };
  }
  // At the floor the text still doesn't fit the box: wrap to fit WIDTH (keeps it readable and
  // out of its neighbours) and let the block run tall. Never ellipsize.
  const lines = wrapByWidth(words, maxWidth, floor, bold);
  return { lines, fontSize: floor, lineHeightPx: floor * lineHeight };
}
