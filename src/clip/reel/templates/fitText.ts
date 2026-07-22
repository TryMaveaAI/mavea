// Content-aware type ramps for the reel's fixed design space — the same idea as the slide deck's
// fit engine (src/slides/skins/layouts/fit.ts), which this reuses: map text LENGTH → a
// {size, line, maxLines} tier so long content reflows into a smaller, wider-measure setting instead
// of wrapping into a one-word-per-line tower. FitScale stays underneath as the uniform-shrink net,
// but a finish that picks its tier first hands FitScale something already near scale 1 — the
// difference between "a long answer reads like an editorial pull-quote" and "the whole slide
// shrinks to a sliver".
//
// Sizes are multiples of the board's --ru design unit (1% of a 9:16 board's height), so one ladder
// serves every format and the 1080px export identically. Ladders are calibrated against the
// TIGHTEST stage band (1:1, ~35ru tall — it grew from the old ~32ru once .reel-stage reclaimed
// some of the bottom inset) at each slot's coercion ceiling in reelScript.ts — that worst case is
// what tests/reel.test.ts renders. A grown band can only ease overflow risk, never worsen it,
// so ladders sized to the tighter figure stay a valid (if now slightly conservative) fit.
import type { CSSProperties } from 'react';
import { clampStyle, tierIndex, type Ladder } from '../../../slides/skins/layouts/fit';

export {
  nowrapEllipsis,
  tierIndex,
  type Ladder,
  type Tier,
} from '../../../slides/skins/layouts/fit';

/** The longest unbroken run in the text — the word that must survive whole on one line. */
function longestWord(text: string): number {
  let max = 0;
  for (const w of text.split(/\s+/)) if (w.length > max) max = w.length;
  return Math.max(1, max);
}

/**
 * A picked tier as spreadable style: ru-based font-size, line-height and the paired line clamp.
 *
 * Total length picks the starting tier, then the LONGEST WORD can only step it further down: a tier
 * whose size can't set that word on one line would let the clamp's emergency `overflow-wrap:
 * anywhere` split it mid-word ("Eigenval / ue") — the one-word-tower bug wearing a new hat. The cap
 * falls out of the board's unit math: 1ru of font ≈ 1.78rw wide × ~0.55em per glyph ≈ 0.98rw per
 * character-of-size, so a word fits when size ≤ measure / word-length.
 *
 * `measure` is the column's width in --rw units (default 78, the ~80rw column most finishes set).
 * Ladders are calibrated to that default, so a narrower column reads the text as proportionally
 * LONGER (120 chars in a 50rw frame wrap like 187 in the standard column) — that scaling is what
 * makes one set of ladders serve every finish. The very last tier still wears `anywhere` as the
 * genuine last resort for mega-words.
 */
export function fitText(
  text: string,
  ladder: Ladder,
  measure = 78,
): { tier: number; style: CSSProperties } {
  let i = tierIndex(Math.ceil(text.length * (78 / measure)), ladder);
  const cap = measure / longestWord(text);
  while (i < ladder.length - 1 && ladder[i].size > cap) i += 1;
  const t = ladder[i];
  return {
    tier: i,
    style: {
      fontSize: `calc(var(--ru) * ${t.size})`,
      lineHeight: t.line,
      ...clampStyle(t.maxLines),
    },
  };
}

/**
 * Single-line variant for hero words and stat values that must stay whole — no ellipsis on purpose
 * (a truncated "EIGE…" reads as broken), so the tier shrinks with length and FitScale absorbs the
 * rare remainder.
 */
export function fitLine(text: string, ladder: Ladder): { tier: number; style: CSSProperties } {
  const i = tierIndex(text.length, ladder);
  const t = ladder[i];
  return {
    tier: i,
    style: {
      fontSize: `calc(var(--ru) * ${t.size})`,
      lineHeight: t.line,
      whiteSpace: 'nowrap',
      // Self-size the line so an overflowing value WIDENS its ancestors instead of spilling
      // invisibly (a centered inline's overflow never registers in any scrollWidth, which blinds
      // the FitScale net — the countdown-value leak).
      display: 'inline-block',
    },
  };
}

/**
 * The min-height a stack of `fitText` blocks needs so a plain block ancestor's own auto-height
 * reliably budgets room for all of them, given as CSS to set directly on THAT ancestor (not on the
 * clamped blocks themselves — a min-height set on the clamped element's own `-webkit-box` box does
 * nothing for its parent's sizing; `-webkit-box` doesn't roll its true clamped extent into an
 * ordinary block ancestor's auto-height the reliable way a normal block child does). A card with no
 * explicit height can end up shorter than the clamped text it stacks needs, hard-clipping the last
 * line at the card edge instead of the clamp's own ellipsis ever getting a chance to fire. Each part
 * is a clamped block's own vertical padding (0 if none) plus the exact tier its text picked.
 */
export function stackedMinHeight(
  ...parts: { ladder: Ladder; tier: number; padRu?: number }[]
): CSSProperties {
  const terms = parts.map(({ ladder, tier, padRu = 0 }) => {
    const t = ladder[tier];
    return `(var(--ru) * ${t.size} * ${t.line} * ${t.maxLines} + var(--ru) * ${padRu})`;
  });
  return { minHeight: `calc(${terms.join(' + ')})` };
}

// ── Reel ladders ─────────────────────────────────────────────────────────────────────────────────
// Capacity math, measured in the browser (not estimated): a character occupies ≈ 0.98rw per ru of
// font-size at the reel's display weights, so chars-per-line ≈ measure / (0.98 × size) — about
// 80/size in the standard column. Every tier below carries ≥10% headroom between that capacity ×
// maxLines and its upTo budget, so a slot at its ceiling renders whole (no clamp ellipsis) and the
// clamp only ever fires past the enforced maximum.

/** Display headlines (concept titles and everything bridged into them, ceiling 140). */
export const HERO_TIERS: Ladder = [
  { upTo: 12, size: 9.6, line: 0.98, maxLines: 2 },
  { upTo: 26, size: 7.4, line: 1.02, maxLines: 3 },
  { upTo: 48, size: 6, line: 1.06, maxLines: 5 },
  { upTo: 80, size: 5, line: 1.1, maxLines: 6 },
  { upTo: 112, size: 4.3, line: 1.12, maxLines: 7 },
  { upTo: Infinity, size: 3.6, line: 1.16, maxLines: 8 },
];

/** Compact card titles (dictionary entries, tiles, passes — ceiling 140 via bridges). */
export const TITLE_TIERS: Ladder = [
  { upTo: 24, size: 5.4, line: 1.05, maxLines: 2 },
  { upTo: 48, size: 4.5, line: 1.08, maxLines: 3 },
  { upTo: 84, size: 3.8, line: 1.12, maxLines: 5 },
  { upTo: 116, size: 3.3, line: 1.16, maxLines: 6 },
  { upTo: Infinity, size: 3, line: 1.18, maxLines: 8 },
];

/** Quote bodies (ceiling 140). */
export const QUOTE_TIERS: Ladder = [
  { upTo: 60, size: 5.5, line: 1.2, maxLines: 5 },
  { upTo: 95, size: 4.6, line: 1.24, maxLines: 6 },
  { upTo: Infinity, size: 3.8, line: 1.3, maxLines: 7 },
];

/** Supporting prose — subtitles, answers, notes (ceiling 150; markup explanations reach 240). */
export const BODY_TIERS: Ladder = [
  { upTo: 90, size: 3.1, line: 1.4, maxLines: 5 },
  { upTo: 130, size: 2.8, line: 1.42, maxLines: 6 },
  { upTo: 180, size: 2.6, line: 1.45, maxLines: 7 },
  { upTo: Infinity, size: 2.4, line: 1.45, maxLines: 9 },
];

/** One giant word set solid (swiss/marquee heroes) — pair with `fitLine`, keyed by the WORD. */
export const WORD_TIERS: Ladder = [
  { upTo: 7, size: 8.4, line: 0.92, maxLines: 1 },
  { upTo: 10, size: 6.6, line: 0.94, maxLines: 1 },
  { upTo: 14, size: 5.2, line: 0.96, maxLines: 1 },
  { upTo: Infinity, size: 4, line: 1, maxLines: 1 },
];

/** Stat hero values — pair with `fitLine`, keyed by the value PLUS its inline unit so the whole
 *  figure fits the ~75rw card column together. Digits cut ~0.6em, wider than body glyphs. */
export const VALUE_TIERS: Ladder = [
  { upTo: 4, size: 16, line: 0.9, maxLines: 1 },
  { upTo: 6, size: 11.5, line: 0.9, maxLines: 1 },
  { upTo: 9, size: 7.6, line: 0.92, maxLines: 1 },
  { upTo: 12, size: 5.8, line: 0.94, maxLines: 1 },
  { upTo: Infinity, size: 4.6, line: 0.94, maxLines: 1 },
];

/** The title slide's quoted question (ceiling 140; its column is the wider 88rw prompt block). */
export const PROMPT_TIERS: Ladder = [
  { upTo: 48, size: 7.2, line: 1.06, maxLines: 5 },
  { upTo: 84, size: 5.2, line: 1.1, maxLines: 6 },
  { upTo: 116, size: 4.6, line: 1.12, maxLines: 7 },
  { upTo: Infinity, size: 4.2, line: 1.14, maxLines: 8 },
];
