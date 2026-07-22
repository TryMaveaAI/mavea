import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FunnelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FunnelProps & { delay?: number };

const W = 540,
  ROW_H = 46,
  GAP = 10,
  PAD_X = 8;
const PALETTE = [
  'var(--presence)',
  'var(--presence-soft)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
];

export function Funnel({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  stages,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const top = stages[0]?.value || 1;
    const innerW = W - PAD_X * 2;
    return stages.map((s, i) => {
      const frac = s.value / top;
      const w = innerW * frac;
      const fromPrior = i === 0 ? 1 : s.value / (stages[i - 1].value || 1);
      const drop = i === 0 ? 0 : 1 - fromPrior;
      return { ...s, w, frac, fromPrior, drop, color: s.color || PALETTE[i % PALETTE.length] };
    });
  }, [stages]);

  const H = stages.length * (ROW_H + GAP);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block' }}
      >
        {model.map((s, i) => {
          const y = i * (ROW_H + GAP);
          const x = (W - s.w) / 2;
          const next = model[i + 1];
          const active = hover === i;
          const cy = y + ROW_H / 2;
          return (
            <g
              key={i}
              // Rows bloom in from their own center on mount, staggered by --i — same
              // .c1-tm-cell primitive Treemap's cells use, reused here since a funnel row
              // is just a single-cell "layer" stacked vertically instead of tiled in 2D.
              className="c1-tm-cell"
              style={
                {
                  ['--i' as string]: i,
                  transformOrigin: `${W / 2}px ${cy}px`,
                  cursor: 'pointer',
                } as CSSProperties
              }
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {next && (
                <path
                  d={`M${x} ${y + ROW_H} L${x + s.w} ${y + ROW_H} L${(W + next.w) / 2} ${y + ROW_H + GAP} L${(W - next.w) / 2} ${y + ROW_H + GAP} Z`}
                  fill="var(--cell-empty)"
                />
              )}
              <rect
                x={x}
                y={y}
                width={s.w}
                height={ROW_H}
                rx={6}
                fill={`color-mix(in oklab, ${s.color} ${active ? 80 : 58}%, transparent)`}
                stroke={s.color}
                strokeWidth={active ? 1.6 : 1}
                data-mark={i === 0 ? 'circle' : undefined}
                style={{ transition: 'all var(--m-fast)' }}
              />
              <text
                x={W / 2}
                y={y + ROW_H / 2 - 3}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="var(--text-primary)"
              >
                {s.label}
              </text>
              <text
                x={W / 2}
                y={y + ROW_H / 2 + 13}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text-secondary)"
                className="tab-num"
              >
                {unit}
                {s.value.toLocaleString()} · {Math.round(s.frac * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {hover != null ? (
          hover === 0 ? (
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{model[0].label}</strong> · top of
              funnel · {unit}
              {model[0].value.toLocaleString()}
            </span>
          ) : (
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{model[hover].label}</strong> ·{' '}
              {Math.round(model[hover].fromPrior * 100)}% kept ·{' '}
              <span style={{ color: 'var(--danger)' }}>
                −{Math.round(model[hover].drop * 100)}% drop-off
              </span>{' '}
              vs {model[hover - 1].label}
            </span>
          )
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a stage for drop-off vs the prior step</span>
        )}
      </div>
    </div>
  );
}
