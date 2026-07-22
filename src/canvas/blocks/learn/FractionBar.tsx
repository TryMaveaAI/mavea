import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FractionBarProps, FractionEntry } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FractionBarProps & { delay?: number };

// The three accent tokens cycle when the caller doesn't specify a color.
const ACCENT_CYCLE = ['var(--presence)', 'var(--insight)', 'var(--warning)'] as const;

function resolveColor(entry: FractionEntry, index: number): string {
  return entry.color ?? ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

/** Clamp n/d to [0, 1] so malformed data never blows the layout. */
function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(1, Math.max(0, numerator / denominator));
}

/** Format a fraction like "3/8". */
function fractionLabel(entry: FractionEntry): string {
  return entry.label ?? `${entry.numerator}/${entry.denominator}`;
}

// A caller-supplied label (e.g. "Probability of drawing a red marble from the bag") or a huge
// denominator ("1/97") has no natural length cap, and .lr-fb-meta is a baseline flex row with no
// width constraint of its own — so either span can outrun the row and clip past the card edge.
// Contained inline (rather than in the family's shared styles.css) so a concurrent edit to a
// sibling component's styles can't collide with this fix.
const TRUNCATE_STYLE: CSSProperties = {
  maxWidth: '100%',
  minWidth: 0,
  flexShrink: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Decimal value formatted to at most 3 significant digits. */
function decimalLabel(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  const v = numerator / denominator;
  // Show clean decimals: 0.5, 0.333…, 0.125 → "0.5", "0.333", "0.125"
  return parseFloat(v.toPrecision(3)).toString();
}

// ── Pie (SVG arc) ──────────────────────────────────────────────────────────
// Draws a simple two-sector circle: filled arc for the numerator fraction, the rest
// is the track. Avoids a full-circle edge-case by flooring near-1 ratios to 0.9999.
function PieSegment({ fill, color }: { fill: number; color: string }) {
  const SIZE = 36;
  const R = 14;
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  // Clamp so the arc commands stay valid at 0% and 100%.
  const f = Math.min(0.9999, Math.max(0.0001, fill));
  const angle = f * 2 * Math.PI;
  const x1 = CX + R * Math.sin(0);
  const y1 = CY - R * Math.cos(0);
  const x2 = CX + R * Math.sin(angle);
  const y2 = CY - R * Math.cos(angle);
  const largeArc = f > 0.5 ? 1 : 0;

  const filledArc = [
    `M ${CX} ${CY}`,
    `L ${x1} ${y1}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
    'Z',
  ].join(' ');

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="lr-fb-pie"
      aria-hidden="true"
    >
      {/* Track (unfilled portion) */}
      <circle cx={CX} cy={CY} r={R} className="lr-fb-pie-track" />
      {/* Filled portion */}
      <path d={filledArc} fill={color} className="lr-fb-pie-fill" />
      {/* Thin ring border for definition against the card background */}
      <circle cx={CX} cy={CY} r={R} className="lr-fb-pie-ring" />
    </svg>
  );
}

// ── Segmented bar (pure CSS flexbox) ───────────────────────────────────────
function SegmentBar({
  numerator,
  denominator,
  color,
}: {
  numerator: number;
  denominator: number;
  color: string;
}) {
  // Guard: clamp denominator to a sane range (1–100) so the segment array stays finite.
  const den = Math.min(100, Math.max(1, Math.round(denominator)));
  const num = Math.min(den, Math.max(0, Math.round(numerator)));

  return (
    <div className="lr-fb-bar" aria-hidden="true">
      {Array.from({ length: den }, (_, i) => (
        <div
          key={i}
          className={`lr-fb-seg${i < num ? ' lr-fb-seg--on' : ''}`}
          style={i < num ? ({ '--seg-color': color } as CSSProperties) : undefined}
        />
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function FractionBar({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  fractions,
  showPie = false,
  note,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Scrollable list — max 8 rows visible before scrolling kicks in. */}
      <ul className="lr-fb-list">
        {fractions.map((entry, i) => {
          const color = resolveColor(entry, i);
          const fill = ratio(entry.numerator, entry.denominator);

          return (
            <li key={i} className="lr-fb-row">
              {showPie && <PieSegment fill={fill} color={color} />}

              <div className="lr-fb-row-body">
                <SegmentBar
                  numerator={entry.numerator}
                  denominator={entry.denominator}
                  color={color}
                />
                <div className="lr-fb-meta">
                  <span className="lr-fb-fraction" style={{ ...TRUNCATE_STYLE, color }}>
                    {fractionLabel(entry)}
                  </span>
                  <span className="lr-fb-decimal" style={TRUNCATE_STYLE}>
                    = {decimalLabel(entry.numerator, entry.denominator)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {note && <p className="lr-fb-note">{note}</p>}

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
