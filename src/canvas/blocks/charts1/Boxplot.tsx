import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks as niceTicks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { BoxplotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BoxplotProps & { delay?: number };

const W = 540,
  H = 250,
  PAD = { l: 40, r: 12, t: 14, b: 36 };
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

export function Boxplot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  groups,
  unit = '',
  domain,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const all = groups.flatMap((g) => [g.min, g.max, ...(g.outliers || [])]);
    // Math.min/max of [] is ±Infinity, which poisons every y() coordinate; fall back to a unit domain.
    const lo = domain ? domain[0] : all.length ? Math.min(...all) : 0;
    const hi = domain ? domain[1] : all.length ? Math.max(...all) : 1;
    const plotH = H - PAD.t - PAD.b;
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * plotH;
    return { y, lo, hi };
  }, [groups, domain]);

  const innerW = W - PAD.l - PAD.r;
  const slot = innerW / Math.max(1, groups.length);
  const bw = Math.min(46, slot * 0.5);
  const fmt = (v: number) => formatValue(v, { unit: unit || undefined });
  // Nice, round axis ticks across the value domain instead of raw quarter interpolations.
  const ticks = niceTicks(model.lo, model.hi, niceStep(model.hi - model.lo, 4));

  // Group labels used to sit at a fixed 10.5px and rely on each slot getting narrower as more
  // groups arrived — past ~4 groups the slots outpaced the (unchanging) label width and text
  // started to overlap its neighbors. Shrink the font as groups pack in, and once even a small
  // font would collide (8+ groups), rotate the labels so they read along the slot instead of
  // across it.
  const crowded = groups.length >= 8;
  const labelSize = Math.max(7.5, Math.min(10.5, slot / 4.4));
  const maxChars = Math.max(3, Math.floor(slot / (labelSize * 0.62)));
  const labelFor = (label: string) =>
    !crowded && label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;

  // The group with the widest interquartile range is the one whose middle 50% of values spread
  // out the most — call it out the same way TamSam marks its largest ring, so the eye lands on
  // the noisiest group first instead of scanning every box by hand.
  const widestIqr = groups.reduce(
    (best, g, i) => (g.q3 - g.q1 > groups[best].q3 - groups[best].q1 ? i : best),
    0,
  );

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
        style={{ display: 'block', overflow: 'visible' }}
      >
        {ticks.map((t, i) => {
          const yy = model.y(t);
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke="var(--grid-line)" />
              <text
                x={PAD.l - 6}
                y={yy + 4}
                textAnchor="end"
                fontSize="9.5"
                fill="var(--text-muted)"
                className="tab-num"
              >
                {formatValue(t)}
              </text>
            </g>
          );
        })}
        {groups.map((g, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const col = g.color || PALETTE[i % PALETTE.length];
          const active = hover === i;
          return (
            <g
              key={i}
              className="c1-bp-group"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ ['--i' as string]: i, cursor: 'pointer' } as CSSProperties}
            >
              {/* whiskers */}
              <line
                x1={cx}
                x2={cx}
                y1={model.y(g.max)}
                y2={model.y(g.q3)}
                stroke={col}
                strokeWidth={1.4}
                opacity={active ? 1 : 0.7}
              />
              <line
                x1={cx}
                x2={cx}
                y1={model.y(g.q1)}
                y2={model.y(g.min)}
                stroke={col}
                strokeWidth={1.4}
                opacity={active ? 1 : 0.7}
              />
              <line
                x1={cx - bw / 3}
                x2={cx + bw / 3}
                y1={model.y(g.max)}
                y2={model.y(g.max)}
                stroke={col}
                strokeWidth={1.4}
              />
              <line
                x1={cx - bw / 3}
                x2={cx + bw / 3}
                y1={model.y(g.min)}
                y2={model.y(g.min)}
                stroke={col}
                strokeWidth={1.4}
              />
              {/* box */}
              <rect
                x={cx - bw / 2}
                y={model.y(g.q3)}
                width={bw}
                height={Math.max(1, model.y(g.q1) - model.y(g.q3))}
                rx={4}
                fill={`color-mix(in oklab, ${col} ${active ? 42 : 24}%, transparent)`}
                stroke={col}
                strokeWidth={active ? 1.8 : 1.2}
                style={{ transition: 'all var(--m-fast)' }}
              />
              {/* median */}
              <line
                x1={cx - bw / 2}
                x2={cx + bw / 2}
                y1={model.y(g.median)}
                y2={model.y(g.median)}
                stroke={col}
                strokeWidth={2.4}
                data-mark={i === widestIqr ? 'circle' : undefined}
              />
              {/* outliers */}
              {(g.outliers || []).map((o, oi) => (
                <circle
                  key={oi}
                  cx={cx}
                  cy={model.y(o)}
                  r={2.6}
                  fill="none"
                  stroke={col}
                  strokeWidth={1.2}
                  opacity={0.8}
                />
              ))}
              <text
                x={cx}
                y={H - PAD.b + 18}
                textAnchor={crowded ? 'end' : 'middle'}
                fontSize={labelSize}
                fill="var(--text-muted)"
                transform={crowded ? `rotate(-45 ${cx} ${H - PAD.b + 18})` : undefined}
              >
                <title>{g.label}</title>
                {labelFor(g.label)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          (() => {
            const g = groups[hover];
            return (
              <span className="tab-num">
                <strong style={{ color: 'var(--text-primary)' }}>{g.label}</strong> · min{' '}
                {fmt(g.min)} · Q1 {fmt(g.q1)} ·{' '}
                <span style={{ color: 'var(--text-primary)' }}>med {fmt(g.median)}</span> · Q3{' '}
                {fmt(g.q3)} · max {fmt(g.max)}
                {g.outliers?.length
                  ? ` · ${g.outliers.length} outlier${g.outliers.length === 1 ? '' : 's'}`
                  : ''}
              </span>
            );
          })()
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a group for its quartile spread</span>
        )}
      </div>
    </div>
  );
}
