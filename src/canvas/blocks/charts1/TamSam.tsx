import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import { estimateTextWidth } from '../../lib/fitText';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { TamSamProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TamSamProps & { delay?: number };

const RING_COLORS = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

const W = 320;
const H = 220;
const CX = W / 2;
const CY = 108;
const MAX_R = 92;
const MIN_R = MAX_R * 0.32;
const CAGR_TEXT = (cagr: number) => `${formatValue(cagr, { decimals: 0 })}% CAGR`;

/** Smallest radius whose circle holds a ring's centre readout (name, figure, CAGR) whole. The
 *  readout spans CY-17..CY+31 (CY-17..CY+17 without a CAGR line); the circle is measured from its
 *  centre, so the reach is the farther corner. */
function readoutRadius(m: { label: string; value: number; unit?: string; cagr?: number }): number {
  const w = Math.max(
    estimateTextWidth(m.label.toUpperCase(), 11, true) * 1.06,
    estimateTextWidth(fmtMarket(m.value, m.unit), 15, true),
    m.cagr != null ? estimateTextWidth(CAGR_TEXT(m.cagr), 10) : 0,
  );
  const below = m.cagr != null ? 31 : 17;
  return Math.hypot(w / 2, Math.max(17, below)) + 4;
}

/** "$12B" / "$1,234M" — dollar-denominated market size, thousands-separated via formatValue. */
function fmtMarket(value: number, unit?: string): string {
  if (unit) return `$${formatValue(value)}${unit}`;
  if (value >= 1000) return `$${formatValue(value / 1000, { decimals: 1 })}T`;
  return `$${formatValue(value)}B`;
}

export function TamSam({
  title = 'Market Sizing',
  icon = 'chart',
  iconColor = 'var(--presence)',
  markets,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  // Rings nest by rank (outermost → innermost), evenly spaced regardless of how many markets
  // are given — the old formula crowded rings together as the count grew, which is what made
  // 3+ tiers' inline labels overlap. Radius no longer carries a label, so it can't happen again.
  const rings = useMemo(() => {
    const n = markets.length;
    // The innermost ring is the one that carries the readout by default, and any ring can take it
    // on hover, so it is sized to hold the widest of them (within reason: past 60% of the outer
    // ring the nesting stops reading). A fixed fraction let "$0.84B · 30% CAGR" spill out of SOM.
    const minR = Math.min(MAX_R * 0.6, Math.max(MIN_R, ...markets.map(readoutRadius)));
    return markets.map((m, i) => ({
      ...m,
      r: n > 1 ? MAX_R - (i * (MAX_R - minR)) / (n - 1) : MAX_R,
      color: RING_COLORS[i % RING_COLORS.length],
    }));
  }, [markets]);

  const salient = rings.reduce(
    (best, r, i) => (r.value > (rings[best]?.value ?? -1) ? i : best),
    0,
  );
  const focus = rings[hot ?? rings.length - 1];

  if (!hasData(markets.map((m) => m.value))) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
      </div>

      <div className="canvas-figure">
        <svg viewBox={`0 0 ${W} ${H}`} className="c1-ts-svg" role="img" aria-label={title}>
          {/* Painted largest→smallest so each nested ring reads as a translucent layer over the
            last — a stacked-glass look, not a value-proportional area chart. */}
          {[...rings].reverse().map((ring, revI) => {
            const i = rings.length - 1 - revI;
            const dim = hot != null && hot !== i;
            return (
              <circle
                key={i}
                className="c1-ts-ring"
                cx={CX}
                cy={CY}
                r={ring.r}
                fill={ring.color}
                fillOpacity={dim ? 0.05 : 0.08 + revI * 0.06}
                stroke={ring.color}
                strokeWidth={hot === i ? 2.2 : 1.8}
                strokeOpacity={dim ? 0.25 : 0.55}
                data-mark={i === salient ? 'circle' : undefined}
                style={
                  { ['--i' as string]: i, transformOrigin: `${CX}px ${CY}px` } as CSSProperties
                }
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              />
            );
          })}

          {focus && (
            <g className="c1-ts-center">
              <text
                x={CX}
                y={CY - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight="700"
                letterSpacing="0.06em"
                fill={focus.color}
                style={{ textTransform: 'uppercase' }}
              >
                {focus.label}
              </text>
              <text
                x={CX}
                y={CY + 13}
                textAnchor="middle"
                fontSize={15}
                fontWeight="700"
                fill="var(--text-primary)"
                className="tab-num"
              >
                {fmtMarket(focus.value, focus.unit)}
              </text>
              {focus.cagr != null && (
                <text
                  x={CX}
                  y={CY + 28}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-muted)"
                  className="tab-num"
                >
                  {CAGR_TEXT(focus.cagr)}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      <div className="c1-sun-legend">
        {rings.map((ring, i) => (
          <button
            key={i}
            type="button"
            className={'c1-legend-row' + (hot === i ? ' active' : '')}
            onMouseEnter={() => setHot(i)}
            onMouseLeave={() => setHot(null)}
          >
            <span className="c1-swatch" style={{ background: ring.color }} />
            <span className="c1-legend-label">{ring.label}</span>
            <span className="tab-num faint">
              {fmtMarket(ring.value, ring.unit)}
              {ring.cagr != null ? ` · ${formatValue(ring.cagr, { decimals: 0 })}% CAGR` : ''}
            </span>
            {ring.description && <span className="c1-legend-desc">{ring.description}</span>}
          </button>
        ))}
      </div>

      {footer && (
        <div className="insight-summary" dangerouslySetInnerHTML={richInnerHtml(footer)} />
      )}
    </div>
  );
}
