// Content-aware fit for the fixed 1920×1080 slide frame.
//
// Slides render at a fixed design size, so font sizes are fixed px (not responsive units). The one
// variable is the *content*: a real answer's headline or quote can be three words or three lines.
// To keep every slot inside the frame we map text length → a {size, line, maxLines} tier, then pair
// the tier with a line-clamp so the worst case ellipsizes rather than silently clipping past the
// frame edge. The tiers are pure and deterministic, so the same result holds in the browser, in the
// PDF rasterizer, and in jsdom tests — that determinism is the fit *guarantee*.
//
// `useAutoFit` is an optional refinement on top: in a real browser it measures whether the clamp is
// actually truncating (e.g. a short-but-wide all-caps title that char length under-predicts) and
// steps the tier one notch smaller until it fits. It can only ever shrink, and it is a no-op where
// there is no layout (jsdom, detached nodes), so it never introduces overflow and never diverges
// from the deterministic baseline that the tests assert.
import { type CSSProperties, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { parsePadding } from '../../../export/paginate/geometry';
import type { SlideSkin } from '../types';

/** A type ramp step: font-size + line-height + the hard line cap that pairs with `clampStyle`. */
export interface Tier {
  /** px font-size in the 1920×1080 design space. */
  size: number;
  /** Unitless line-height. */
  line: number;
  /** Hard line cap; always render with `clampStyle(maxLines)` so overflow ellipsizes. */
  maxLines: number;
}

/** A tier plus the inclusive character budget it covers. Ladders are ordered largest → smallest. */
export type TierStep = Tier & { upTo: number };
export type Ladder = readonly TierStep[];

/** Index of the largest tier whose budget covers `len` (clamped to the last tier). */
export function tierIndex(len: number, ladder: Ladder): number {
  for (let i = 0; i < ladder.length; i += 1) if (len <= ladder[i].upTo) return i;
  return ladder.length - 1;
}

/** The largest tier whose character budget covers `len`. */
export function pickTier(len: number, ladder: Ladder): Tier {
  return ladder[tierIndex(len, ladder)];
}

/** Multi-line clamp with ellipsis — the universal vertical backstop on any arbitrary-content text. */
export function clampStyle(maxLines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: maxLines,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  };
}

/** Single-line truncation for value/label slots that must never wrap. */
export const nowrapEllipsis: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** nowrapEllipsis for DISPLAY-SCALE value slots (the hero figure, ledger and total values —
 *  display font, line-height at or below 1). Display glyphs ink OUTSIDE their layout box — a
 *  Didone '$' runs its currency bars past cap height and baseline, and serif curves can start
 *  left of the box — so the bare overflow:hidden clip visibly shaved those strokes (the Present
 *  "$4,000" with its dollar sign cut). The padding moves the clip edge off the ink; the top and
 *  left negative margins refund exactly that space so text position and sibling rhythm are
 *  unchanged. There is deliberately NO right/bottom refund: scrollable overflow only counts
 *  right- and down-ward box extension, so a right/bottom negative margin would poke the box past
 *  its ancestors' content edge and read as real clipping to the lab's overflow audit (and to
 *  Chromium's scrollWidth) — instead the bottom refund rides marginBottom (safe: every call site
 *  is a flex/grid item, where margins never collapse) and the right side needs no refund at all,
 *  because the right padding already lives inside the box. */
export const inkSafeEllipsis: CSSProperties = {
  ...nowrapEllipsis,
  padding: '0.15em 0.12em',
  marginTop: '-0.15em',
  marginBottom: '-0.15em',
  marginLeft: '-0.12em',
};

/**
 * Browser-only refinement for multi-line hero text. Returns a tier index (starting at the
 * deterministic pick) plus a ref to attach to the clamped text node. After layout, if the clamp is
 * truncating (`scrollHeight > clientHeight`), it steps one tier smaller and re-measures on the next
 * commit — converging in a handful of synchronous `useLayoutEffect` passes (before paint, so the
 * rasterizer captures the settled size). It only shrinks, and short-circuits when there is no layout
 * box (jsdom / detached / zero height), so it can never cause overflow and is inert in tests.
 */
export function useAutoFit(
  ladderLen: number,
  start: number,
): { idx: number; ref: RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(start);

  // New content (a different deterministic start) resets the ramp before re-measuring.
  useLayoutEffect(() => {
    setIdx(start);
  }, [start]);

  // Re-measures whenever the tier index changes; since it only ever steps the index *down* and
  // stops at the last tier, it converges in a few synchronous passes rather than looping.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    // jsdom and detached nodes report 0 — leave the deterministic tier untouched.
    if (el.clientHeight <= 0) return;
    if (idx < ladderLen - 1 && el.scrollHeight > el.clientHeight + 1) setIdx(idx + 1);
  }, [idx, ladderLen]);

  return { idx, ref };
}

// A SlideFrame stacks a fixed-height kicker row above the content and a fixed-height footer below
// it — both sized by fixed font/line-height/margin values, so they cost the same px regardless of
// skin. Only the skin's own `pad` token varies the band, and it varies more than the ladders below
// used to assume: Grid/Noir/Press pad the most (110px) yet that leaves the LEAST content room.
const KICKER_ROW_PX = 50;
const FOOTER_ROW_PX = 45;

/** The real content band (px) a skin's SlideFrame leaves after its own padding, the kicker row, and
 *  the footer — computed from the skin's actual `pad` token instead of a one-size-fits-all guess,
 *  reusing the same padding-shorthand parser the PDF export's page geometry already relies on. */
export function bandFor(skin: SlideSkin): number {
  const p = parsePadding(skin.tokens.pad);
  return 1080 - p.top - p.bottom - KICKER_ROW_PX - FOOTER_ROW_PX;
}

// Folio/Meridian/North/Lumen/Sol/Terra land at 793–801px; Cobalt at 785px; Grid/Noir/Press (the
// roomiest padding, ironically) at 765px. 790 is the cut that groups exactly {Grid, Noir, Press,
// Cobalt} as "tight" and leaves the other six alone — not the round "~780" a quick eyeball gives.
const TIGHT_BAND_PX = 790;

/** True once a skin's band is tight enough that a data layout's densest row/stat rhythm should
 *  shave its padding a touch to keep clearing the footer — Grid, Noir, Press, and Cobalt only. */
export function isTightBand(skin: SlideSkin): boolean {
  return bandFor(skin) < TIGHT_BAND_PX;
}

// ── Named ladders ───────────────────────────────────────────────────────────────────────────────
// Budgets assume the ~760–820px content band a SlideFrame leaves after padding, kicker and footer;
// full-frame layouts (cover/divider/closing) have a little more. Every ladder leaves ≥10% headroom
// and is calibrated against the real skin fonts in #/slidelab before the torture test locks it.

/** Cover headline (was a flat 132px). A very short title earns poster scale. */
export const COVER_TIERS: Ladder = [
  { upTo: 32, size: 156, line: 0.96, maxLines: 2 },
  { upTo: 60, size: 132, line: 0.98, maxLines: 2 },
  { upTo: 110, size: 108, line: 1.0, maxLines: 3 },
  { upTo: 180, size: 84, line: 1.04, maxLines: 3 },
  { upTo: Infinity, size: 64, line: 1.08, maxLines: 4 },
];

/** Closing headline (was a flat 168px). */
export const CLOSING_TIERS: Ladder = [
  { upTo: 40, size: 168, line: 0.92, maxLines: 2 },
  { upTo: 80, size: 120, line: 0.98, maxLines: 2 },
  { upTo: Infinity, size: 88, line: 1.02, maxLines: 3 },
];

/** Section-divider title (was a flat 116px, sharing the frame with the ghost numeral). */
export const DIVIDER_TIERS: Ladder = [
  { upTo: 40, size: 116, line: 0.98, maxLines: 2 },
  { upTo: 80, size: 88, line: 1.02, maxLines: 3 },
  { upTo: Infinity, size: 64, line: 1.08, maxLines: 3 },
];

/** Quote body (was an ad-hoc 96/80/64 with no line cap). */
export const QUOTE_TIERS: Ladder = [
  { upTo: 90, size: 96, line: 1.18, maxLines: 4 },
  { upTo: 160, size: 80, line: 1.2, maxLines: 5 },
  { upTo: 240, size: 64, line: 1.24, maxLines: 6 },
  { upTo: Infinity, size: 52, line: 1.3, maxLines: 7 },
];

/** Noir's centred serif-italic quote. */
export const NOIR_QUOTE_TIERS: Ladder = [
  { upTo: 90, size: 96, line: 1.18, maxLines: 4 },
  { upTo: 150, size: 80, line: 1.2, maxLines: 5 },
  { upTo: 220, size: 68, line: 1.24, maxLines: 6 },
  { upTo: Infinity, size: 56, line: 1.3, maxLines: 7 },
];

/** North's full-colour statement (larger, lives on a coloured field). */
export const NORTH_STATEMENT_TIERS: Ladder = [
  { upTo: 80, size: 116, line: 1.04, maxLines: 4 },
  { upTo: 150, size: 96, line: 1.08, maxLines: 5 },
  { upTo: 220, size: 76, line: 1.14, maxLines: 6 },
  { upTo: Infinity, size: 60, line: 1.2, maxLines: 7 },
];

/** Prose heading — display scale; the lede + rest carry the depth below it. */
export const PROSE_HEADING_TIERS: Ladder = [
  { upTo: 50, size: 92, line: 1.04, maxLines: 2 },
  { upTo: 100, size: 68, line: 1.08, maxLines: 3 },
  { upTo: Infinity, size: 54, line: 1.12, maxLines: 3 },
];

/** Prose lede — the opening sentence, set large like a standfirst; a one-liner gets statement
 *  scale so a short finding reads as a keynote takeaway, not a stranded caption. */
export const PROSE_LEDE_TIERS: Ladder = [
  { upTo: 90, size: 64, line: 1.24, maxLines: 3 },
  { upTo: 140, size: 56, line: 1.28, maxLines: 3 },
  { upTo: 200, size: 48, line: 1.32, maxLines: 4 },
  { upTo: Infinity, size: 40, line: 1.4, maxLines: 4 },
];

/** Prose body after the lede (or the whole body when no lede splits out). */
export const PROSE_BODY_TIERS: Ladder = [
  { upTo: 220, size: 36, line: 1.5, maxLines: 5 },
  { upTo: 420, size: 32, line: 1.5, maxLines: 7 },
  { upTo: Infinity, size: 30, line: 1.55, maxLines: 8 },
];

/** Press's all-serif heading (slightly smaller measure than Prose). */
export const PRESS_HEADING_TIERS: Ladder = [
  { upTo: 50, size: 76, line: 1.1, maxLines: 2 },
  { upTo: Infinity, size: 56, line: 1.15, maxLines: 3 },
];

/** Press's justified serif body with a drop-cap. */
export const PRESS_BODY_TIERS: Ladder = [
  { upTo: 300, size: 38, line: 1.62, maxLines: 7 },
  { upTo: Infinity, size: 32, line: 1.6, maxLines: 9 },
];

/** KeyFigure hero value — sized by the value's own length, single line, never wraps. */
export const KEYFIG_VALUE_TIERS: Ladder = [
  { upTo: 4, size: 220, line: 0.86, maxLines: 1 },
  { upTo: 6, size: 168, line: 0.9, maxLines: 1 },
  { upTo: 9, size: 128, line: 0.94, maxLines: 1 },
  { upTo: Infinity, size: 96, line: 1.0, maxLines: 1 },
];

/** KeyFigure supporting body. */
export const KEYFIG_BODY_TIERS: Ladder = [
  { upTo: 180, size: 30, line: 1.45, maxLines: 4 },
  { upTo: Infinity, size: 26, line: 1.45, maxLines: 6 },
];

/** FullBleed overlaid title (was a flat 104px). */
export const FULLBLEED_TIERS: Ladder = [
  { upTo: 50, size: 104, line: 0.98, maxLines: 2 },
  { upTo: 90, size: 80, line: 1.02, maxLines: 3 },
  { upTo: Infinity, size: 64, line: 1.08, maxLines: 3 },
];

/** Shared section-title ramp for the framed data/list layouts (chart, table, roadmap, …). */
export const TITLE_TIERS: Ladder = [
  { upTo: 40, size: 72, line: 1.02, maxLines: 2 },
  { upTo: 90, size: 56, line: 1.06, maxLines: 2 },
  { upTo: Infinity, size: 46, line: 1.1, maxLines: 2 },
];

/** Convenience for the framed layouts' headings. */
export function titleTier(len: number): Tier {
  return pickTier(len, TITLE_TIERS);
}

/** Agenda row title (kept to two lines, just shrinks for long entries). */
export const AGENDA_ITEM_TIERS: Ladder = [
  { upTo: 60, size: 42, line: 1.2, maxLines: 2 },
  { upTo: Infinity, size: 34, line: 1.2, maxLines: 2 },
];
