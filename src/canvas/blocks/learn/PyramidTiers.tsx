import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PyramidTiersProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';

type Props = PyramidTiersProps & { delay?: number };

// Preset fills cycling by tier index (bottom → top)
const TIER_FILLS = [
  'color-mix(in oklab, var(--presence) 22%, var(--surface-default))',
  'color-mix(in oklab, var(--insight) 22%, var(--surface-default))',
  'color-mix(in oklab, var(--warning) 22%, var(--surface-default))',
  'color-mix(in oklab, var(--presence) 14%, color-mix(in oklab, var(--insight) 28%, var(--surface-default)))',
  'color-mix(in oklab, var(--insight) 14%, color-mix(in oklab, var(--warning) 28%, var(--surface-default)))',
];

const W = 340;
const TIER_H = 40;
const TIER_GAP = 2;
const PAD_X = 12;

const MAX_TIERS = 8;

// The base's preferred width, and the most it may grow to make room for the labels.
const BASE_W = 220;
const MAX_BASE_W = W - PAD_X * 2;
// The narrowest the flat top may be, and the widest relative to the base before the shape stops
// reading as a pyramid and starts reading as a stack of boxes.
const MIN_TOP_W = 24;
const MAX_TOP_SHARE = 0.45;
// .py-tier-label's size, in viewBox units.
const LABEL_FONT_SIZE = 10;
// The step-down size still has to be READABLE — these are viewBox user units in a 340-wide box
// that renders ~320px in a narrow card, so 8.5 painted at 8.0px. A label that drops a size to fit
// must not drop out of legibility to do it; past this it squeezes glyphs instead.
const LABEL_FONT_SIZE_SMALL = 9.6;
// Clear space the label keeps inside its band's slanted sides, both together.
const LABEL_INSET = 10;
// Below this, a hard textLength squeeze reads as illegible smudged glyphs rather than tight
// text — better to trust the browser's own clip than compress a label past this floor.
const MIN_SQUEEZE_WIDTH = 18;

/**
 * The pyramid's top and base widths. Its sides are one straight slope from the top tier to the
 * bottom, and each label is measured against its band's narrowest (top) edge, so the top is made
 * just wide enough for the top label — the tightest spot — and the base widens only when a lower
 * label needs more than the default slope gives it.
 */
function pyramidWidths(needs: readonly number[], height: number, rowTop: (row: number) => number) {
  const topFor = (base: number) =>
    needs.reduce((top, need, row) => {
      const f = rowTop(row) / height;
      // need ≤ top + (base − top)·f, solved for top; f < 1 for every band's top edge.
      return Math.max(top, (need - base * f) / (1 - f));
    }, MIN_TOP_W);
  let base = BASE_W;
  while (base < MAX_BASE_W && topFor(base) > base * MAX_TOP_SHARE) base += 8;
  base = Math.min(base, MAX_BASE_W);
  return { base, top: Math.min(topFor(base), base * MAX_TOP_SHARE) };
}

export function PyramidTiers({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  tiers,
  showNotes = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const clamped = tiers.slice(0, MAX_TIERS);
  const n = clamped.length;

  const geometry = useMemo(() => {
    if (n === 0) return [];
    const labelOf = (tier: (typeof clamped)[number]) =>
      tier.value ? `${tier.label} · ${tier.value}` : tier.label;
    // Row 0 is the top of the drawing, which is the LAST tier: tiers run bottom → top.
    const rowTop = (row: number) => row * (TIER_H + TIER_GAP);
    const height = n * TIER_H + (n - 1) * TIER_GAP;
    const needs = Array.from(
      { length: n },
      (_, row) =>
        estimateTextWidth(labelOf(clamped[n - 1 - row]), LABEL_FONT_SIZE, true) + LABEL_INSET,
    );
    const { base, top } = pyramidWidths(needs, height, rowTop);
    const widthAt = (dy: number) => top + ((base - top) * dy) / height;
    return clamped.map((tier, i) => {
      const row = n - 1 - i;
      return {
        tier,
        label: labelOf(tier),
        halfW: widthAt(rowTop(row) + TIER_H) / 2,
        halfWNext: widthAt(rowTop(row)) / 2,
        cx: W / 2,
        y: PAD_X + rowTop(row),
      };
    });
  }, [clamped, n]);

  const vbH = Math.min(MAX_TIERS, n) * (TIER_H + TIER_GAP) + PAD_X * 2;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="py-wrap">
        <svg
          viewBox={`0 0 ${W} ${vbH}`}
          className="py-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          {geometry.map(({ tier, label, halfW, halfWNext, cx, y }, idx) => {
            const fill = tier.color
              ? `color-mix(in oklab, ${tier.color} 22%, var(--surface-default))`
              : (TIER_FILLS[idx % TIER_FILLS.length] ?? TIER_FILLS[0]);
            // Trapezoid: bottom-left, bottom-right, top-right, top-left
            const bL = cx - halfW;
            const bR = cx + halfW;
            const tL = cx - halfWNext;
            const tR = cx + halfWNext;
            const bY = y + TIER_H;
            const tY = y;
            const pts = `${bL},${bY} ${bR},${bY} ${tR},${tY} ${tL},${tY}`;

            const midY = y + TIER_H / 2;
            // Constrain to the trapezoid's own narrowest edge (its top, halfWNext) — the
            // label sits vertically centred, but a band's slanted sides mean the true
            // available width at mid-height is never less generous than this bound, so it's
            // safe for every row including the pyramid's own apex tier.
            const maxTextWidth = Math.max(0, halfWNext * 2 - LABEL_INSET);
            // Drop a size step before squeezing glyphs — a smaller-but-undistorted label
            // reads better than a full-size one forced narrow via lengthAdjust.
            const fontSize =
              estimateTextWidth(label, LABEL_FONT_SIZE, true) <= maxTextWidth
                ? LABEL_FONT_SIZE
                : LABEL_FONT_SIZE_SMALL;
            const estWidth = estimateTextWidth(label, fontSize, true);
            const fitsLoosely = estWidth <= maxTextWidth;
            const squeeze = !fitsLoosely && maxTextWidth >= MIN_SQUEEZE_WIDTH;

            return (
              <g key={idx}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="var(--surface-elevated, var(--surface-default))"
                  strokeWidth={1.5}
                />
                <text
                  x={cx}
                  y={midY + 5}
                  textAnchor="middle"
                  className="py-tier-label"
                  style={fontSize === LABEL_FONT_SIZE ? undefined : { fontSize }}
                  {...(squeeze
                    ? { textLength: maxTextWidth, lengthAdjust: 'spacingAndGlyphs' }
                    : {})}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {showNotes && clamped.some((t) => t.note) && (
        <ul className="py-notes">
          {[...clamped].reverse().map((tier, i) =>
            tier.note ? (
              <li key={i} className="py-notes-row">
                <span className="py-notes-label">{tier.label}</span>
                <span className="py-notes-text">{tier.note}</span>
              </li>
            ) : null,
          )}
        </ul>
      )}

      {caption && <p className="py-caption">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
