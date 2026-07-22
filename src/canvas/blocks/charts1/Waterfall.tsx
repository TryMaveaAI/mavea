import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { WaterfallProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WaterfallProps & { delay?: number };

const W = 540,
  H = 250,
  PAD = { l: 8, r: 8, t: 16, b: 40 };

export function Waterfall({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  steps,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    let running = 0;
    const bars = steps.map((s) => {
      const start = running;
      if (s.total) {
        running = s.value;
        return { ...s, start: 0, end: s.value, running: s.value };
      }
      running += s.value;
      return { ...s, start, end: running, running };
    });
    const allVals = bars.flatMap((b) => [b.start, b.end]);
    const lo = Math.min(0, ...allVals);
    // seed with 0 so an empty step list yields 0, not -Infinity (which is truthy and survives `|| 1`).
    const hi = Math.max(0, ...allVals);
    const range = hi - lo || 1;
    const plotH = H - PAD.t - PAD.b;
    const y = (v: number) => PAD.t + (1 - (v - lo) / range) * plotH;
    return { bars, y, lo, hi };
  }, [steps]);

  const innerW = W - PAD.l - PAD.r;
  const slot = innerW / Math.max(1, steps.length);
  const bw = Math.min(54, slot * 0.62);
  const colorOf = (b: { total?: boolean; value: number; color?: string }) =>
    b.color || (b.total ? 'var(--presence)' : b.value >= 0 ? 'var(--insight)' : 'var(--danger)');
  // The final total step is the most salient bar; if none is flagged, fall back to the largest
  // absolute delta — the step that moves the running value the most.
  const salient = (() => {
    let lastTotal = -1;
    model.bars.forEach((b, i) => {
      if (b.total) lastTotal = i;
    });
    if (lastTotal >= 0) return lastTotal;
    return model.bars.reduce(
      (best, b, i) => (Math.abs(b.value) > Math.abs(model.bars[best].value) ? i : best),
      0,
    );
  })();

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
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={model.y(0)}
          y2={model.y(0)}
          stroke="var(--grid-strong)"
        />
        {model.bars.map((b, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const yTop = model.y(Math.max(b.start, b.end));
          const yBot = model.y(Math.min(b.start, b.end));
          const h = Math.max(2, yBot - yTop);
          const col = colorOf(b);
          const active = hover === i;
          // Hovering a bar dims its neighbors so the eye follows the one under the cursor —
          // same "spotlight the hovered slice" convention as PieDonut's arc opacity.
          const dim = hover != null && !active;
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                cursor: 'pointer',
                opacity: dim ? 0.45 : 1,
                transition: 'opacity var(--m-fast)',
              }}
            >
              {i < model.bars.length - 1 && (
                <line
                  x1={cx + bw / 2}
                  x2={cx + slot - bw / 2}
                  y1={model.y(b.end)}
                  y2={model.y(b.end)}
                  stroke="var(--grid-line)"
                  strokeDasharray="3 3"
                />
              )}
              <rect
                className="c1-waterfall-bar"
                x={cx - bw / 2}
                y={yTop}
                width={bw}
                height={h}
                rx={4}
                fill={`color-mix(in oklab, ${col} ${active ? 78 : 55}%, transparent)`}
                stroke={col}
                strokeWidth={active ? 1.6 : 1}
                data-mark={i === salient ? 'circle' : undefined}
                style={
                  { ['--bar-idx' as string]: i, transition: 'all var(--m-fast)' } as CSSProperties
                }
              />
              <text
                x={cx}
                y={yTop - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="var(--text-primary)"
                className="tab-num"
              >
                {!b.total && b.value > 0 ? '+' : ''}
                {unit}
                {b.value.toLocaleString()}
              </text>
              <text
                x={cx}
                y={H - PAD.b + 18}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--text-muted)"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hover != null ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{model.bars[hover].label}</strong> ·
            running total {unit}
            {model.bars[hover].running.toLocaleString()}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a bar for the running total</span>
        )}
      </div>
    </div>
  );
}
