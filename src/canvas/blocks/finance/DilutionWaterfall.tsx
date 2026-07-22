import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatPercent } from '../../lib';
import type { DilutionWaterfallProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DilutionWaterfallProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--text-muted)',
];

const H = 260;
const PAD_T = 10;
const PAD_B = 34;
const BAR_TOP = PAD_T;
const BAR_H = H - PAD_T - PAD_B;
const COL_PITCH = 110; // px per round at natural size — many rounds grow the SVG, not shrink it
const COL_W_FRAC = 0.5; // column width as a fraction of its pitch, leaving room for the ribbon

// Marimekko's stacked-column technique adapted for a different story: every column here is
// always a full 100% stack (ownership, not a value-weighted width), and what Marimekko has no
// concept of — one holder staying the SAME color and position band across every column — is
// the entire point, closed with a thin connecting quad to that holder's next segment so
// dilution reads as a shape shrinking, not just a column of numbers changing.
export function DilutionWaterfall({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  rounds,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<string | null>(null);

  const model = useMemo(() => {
    // Stable color + a fixed vertical band per holder, first-seen order across every round —
    // without this, a holder present in every round could still jump around the stack and the
    // ribbons would cross each other for no reason instead of reading as a settled dilution.
    const order: string[] = [];
    const colorOf = new Map<string, string>();
    rounds.forEach((r) =>
      r.holders.forEach((h) => {
        if (colorOf.has(h.holder)) return;
        colorOf.set(h.holder, h.color || PALETTE[order.length % PALETTE.length]);
        order.push(h.holder);
      }),
    );

    const n = Math.max(1, rounds.length);
    const width = Math.max(560, n * COL_PITCH);
    const colW = COL_PITCH * COL_W_FRAC;
    const colX = (i: number) =>
      i * COL_PITCH + (COL_PITCH - colW) / 2 + (width - n * COL_PITCH) / 2;

    const cols = rounds.map((r, i) => {
      const total = r.holders.reduce((s, h) => s + Math.max(0, h.pct), 0) || 1;
      let y = BAR_TOP;
      const segByHolder = new Map<string, { y0: number; y1: number; pct: number }>();
      // Walk in the GLOBAL order so the same holder always lands in the same band, skipping
      // whoever this round doesn't have rather than leaving a gap in the stack.
      for (const name of order) {
        const h = r.holders.find((x) => x.holder === name);
        if (!h) continue;
        const frac = Math.max(0, h.pct) / total;
        const y0 = y;
        const y1 = y + frac * BAR_H;
        segByHolder.set(name, { y0, y1, pct: h.pct });
        y = y1;
      }
      return { round: r.round, x: colX(i), segByHolder };
    });

    // One ribbon per holder between each adjacent pair of columns that both have them.
    const ribbons: { key: string; holder: string; d: string; color: string }[] = [];
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i];
      const b = cols[i + 1];
      for (const name of order) {
        const sa = a.segByHolder.get(name);
        const sb = b.segByHolder.get(name);
        if (!sa || !sb) continue;
        const x0 = a.x + colW;
        const x1 = b.x;
        ribbons.push({
          key: `${i}-${name}`,
          holder: name,
          color: colorOf.get(name)!,
          d: `M${x0} ${sa.y0} L${x0} ${sa.y1} L${x1} ${sb.y1} L${x1} ${sb.y0} Z`,
        });
      }
    }

    return { width, colW, cols, ribbons, order, colorOf };
  }, [rounds]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-dw-scroll">
        <svg
          viewBox={`0 0 ${model.width} ${H}`}
          width={model.width}
          height={H}
          className="fin-dw-svg"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHot(null)}
        >
          {model.ribbons.map((r) => {
            const lit = !hot || hot === r.holder;
            return (
              <path
                key={r.key}
                d={r.d}
                fill={r.color}
                opacity={lit ? 0.22 : 0.06}
                style={{ transition: 'opacity var(--m-fast)' }}
              />
            );
          })}
          {model.cols.map((c, ci) => (
            <g key={ci}>
              {[...c.segByHolder.entries()].map(([name, seg]) => {
                const lit = !hot || hot === name;
                const h = seg.y1 - seg.y0;
                return (
                  <g key={name}>
                    <rect
                      x={c.x}
                      y={seg.y0}
                      width={model.colW}
                      height={Math.max(0.6, h)}
                      fill={model.colorOf.get(name)}
                      opacity={lit ? 1 : 0.28}
                      style={{ cursor: 'pointer', transition: 'opacity var(--m-fast)' }}
                      onMouseEnter={() => setHot(name)}
                    />
                    {h >= 15 && (
                      <text
                        x={c.x + model.colW / 2}
                        y={(seg.y0 + seg.y1) / 2 + 4}
                        textAnchor="middle"
                        className="fin-dw-seg-lbl"
                        opacity={lit ? 1 : 0.4}
                      >
                        {formatPercent(seg.pct, { decimals: 0 })}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={c.x + model.colW / 2}
                y={H - PAD_B + 18}
                textAnchor="middle"
                className="fin-dw-col-lbl"
              >
                {c.round}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="fin-dw-legend">
        {model.order.map((name) => (
          <button
            key={name}
            className={'fin-dw-leg' + (hot === name ? ' on' : '')}
            onMouseEnter={() => setHot(name)}
            onMouseLeave={() => setHot(null)}
          >
            <i style={{ background: model.colorOf.get(name) }} />
            {name}
          </button>
        ))}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
