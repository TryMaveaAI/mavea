import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PyramidTiersProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

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

// Bottom tier full inner width; top tier min inner width
const BASE_W = 220;
const TOP_W = 40;

// Label sits at 10px/600 (see .py-tier-label) — an average glyph runs ~0.62em wide at that
// weight, and each tier band leaves this many px of breathing room inside its own (narrowest)
// edge before the label may touch the trapezoid's slanted sides.
const LABEL_FONT_SIZE = 10;
// The step-down size still has to be READABLE — these are viewBox user units in a 340-wide box
// that renders ~320px in a narrow card, so 8.5 painted at 8.0px. A label that drops a size to fit
// must not drop out of legibility to do it; past this it squeezes glyphs instead.
const LABEL_FONT_SIZE_SMALL = 9.6;
const AVG_GLYPH_WIDTH = 0.62;
const LABEL_INSET = 10;
// Below this, a hard textLength squeeze reads as illegible smudged glyphs rather than tight
// text — better to trust the browser's own clip than compress a label past this floor.
const MIN_SQUEEZE_WIDTH = 18;

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
    // Each tier i (0 = bottom, n-1 = top) has a different half-width.
    // Bottom: BASE_W/2, top: TOP_W/2, linearly interpolated.
    return clamped.map((tier, i) => {
      // i=0 is bottom → widest; i=n-1 is top → narrowest
      const t = n === 1 ? 0 : i / (n - 1);
      const halfW = ((1 - t) * BASE_W + t * TOP_W) / 2;
      // y increases downward; we draw from top of SVG downward, but tier 0 (bottom) is last row
      // Actually render top→bottom visually means tier[n-1] (top) is at the top of the SVG.
      // Invert: row 0 in SVG = tier[n-1], row n-1 in SVG = tier[0].
      const row = n - 1 - i; // SVG row index
      const y = PAD_X + row * (TIER_H + TIER_GAP);
      const cx = W / 2;
      // Next tier (one above in SVG = tier i+1) half-width — used to build the trapezoid top
      // edge. Clamped to 1: the apex tier (i = n-1) has no real "next" tier to interpolate
      // toward, and leaving tNext to run past 1 extrapolated the apex's own top edge past
      // TOP_W — at n=5 that came out negative, crossing the trapezoid's two top corners over
      // each other into a degenerate sliver instead of a band.
      const tNext = n === 1 ? 1 : Math.min(1, (i + 1) / (n - 1));
      const halfWNext = ((1 - tNext) * BASE_W + tNext * TOP_W) / 2;
      return { tier, halfW, halfWNext, cx, y, row };
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
          {geometry.map(({ tier, halfW, halfWNext, cx, y }, idx) => {
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
            const label = tier.value ? `${tier.label} · ${tier.value}` : tier.label;
            // Constrain to the trapezoid's own narrowest edge (its top, halfWNext) — the
            // label sits vertically centred, but a band's slanted sides mean the true
            // available width at mid-height is never less generous than this bound, so it's
            // safe for every row including the pyramid's own apex tier.
            const maxTextWidth = Math.max(0, halfWNext * 2 - LABEL_INSET);
            // Drop a size step before squeezing glyphs — a smaller-but-undistorted label
            // reads better than a full-size one forced narrow via lengthAdjust.
            const fontSize =
              label.length * (LABEL_FONT_SIZE * AVG_GLYPH_WIDTH) <= maxTextWidth
                ? LABEL_FONT_SIZE
                : LABEL_FONT_SIZE_SMALL;
            const estWidth = label.length * fontSize * AVG_GLYPH_WIDTH;
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
