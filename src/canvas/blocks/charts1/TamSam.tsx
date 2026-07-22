import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
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
    return markets.map((m, i) => ({
      ...m,
      r: n > 1 ? MAX_R - (i * (MAX_R - MIN_R)) / (n - 1) : MAX_R,
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
              style={{ ['--i' as string]: i, transformOrigin: `${CX}px ${CY}px` } as CSSProperties}
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
                {formatValue(focus.cagr, { decimals: 0 })}% CAGR
              </text>
            )}
          </g>
        )}
      </svg>

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
