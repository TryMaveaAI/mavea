// PrecisionRecallCurve — precision (y) vs recall (x) across decision thresholds, for comparing
// classifiers on imbalanced problems where ROC can look optimistic. Deliberately has NO chance
// baseline: unlike ROC's diagonal, a PR curve's no-skill line sits at the positive-class
// prevalence, a number this component is never given — drawing a diagonal (copying ROC) or
// guessing a prevalence would both be fabricating a value the caller didn't supply, so the axes
// carry only the curve(s) actually plotted.
import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import type { PrecisionRecallCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PrecisionRecallCurveProps & { delay?: number };

const W = 320;
const H = 260;
const M = { top: 16, right: 16, bottom: 44, left: 46 };
const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'] as const;
const AXIS_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
// One drawn-on reveal ref per palette slot — covers the overwhelming common case (1-4 curves
// being compared) with a real per-curve entrance; a 5th+ curve (already reusing a palette hue
// via modulo) simply renders solid with no individual draw-in rather than growing an unbounded
// ref list.

export function PrecisionRecallCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  curves,
  avgPrecision,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const ref0 = useRef<SVGPathElement>(null);
  const ref1 = useRef<SVGPathElement>(null);
  const ref2 = useRef<SVGPathElement>(null);
  const ref3 = useRef<SVGPathElement>(null);
  const curveRefs = [ref0, ref1, ref2, ref3];
  usePathDraw(ref0, { delay: delay ?? 0 });
  usePathDraw(ref1, { delay: (delay ?? 0) + 90 });
  usePathDraw(ref2, { delay: (delay ?? 0) + 180 });
  usePathDraw(ref3, { delay: (delay ?? 0) + 270 });

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const sx = useMemo(() => scaleLinear([0, 1], [M.left, M.left + innerW]), [innerW]);
  const sy = useMemo(() => scaleLinear([0, 1], [M.top + innerH, M.top]), [innerH]);

  const built = useMemo(
    () =>
      (curves ?? []).map((c) => {
        // Recall is the natural read order for a PR curve; sort so the drawn path and its
        // area-under-curve fill both run left→right without a caller having to pre-sort.
        const sorted = [...(c.points ?? [])]
          .filter((p) => Number.isFinite(p.recall) && Number.isFinite(p.precision))
          .sort((a, b) => a.recall - b.recall);
        const d = sorted.map((p) => `${sx(p.recall)},${sy(p.precision)}`).join('L');
        const path = d ? `M${d}` : '';
        const fill = sorted.length ? `${path}L${sx(1)},${sy(0)}L${sx(0)},${sy(0)}Z` : '';
        return { ...c, sorted, path, fill };
      }),
    [curves, sx, sy],
  );

  const hasData = built.some((c) => c.sorted.length > 0);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Precision-recall curve'}
        {avgPrecision !== undefined && (
          <span className="prc-ap-badge">AP {avgPrecision.toFixed(3)}</span>
        )}
      </div>

      {hasData ? (
        <div className="prc-wrap" onMouseLeave={() => setHot(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="prc-svg"
            role="img"
            aria-label={title ?? 'precision-recall curve'}
          >
            <defs>
              {built.map((_, i) => (
                <clipPath key={`cp${i}`} id={`prc-clip-${i}`}>
                  <rect x={M.left} y={M.top} width={innerW} height={innerH} />
                </clipPath>
              ))}
            </defs>

            {AXIS_TICKS.map((t) => (
              <g key={`g${t}`}>
                <line
                  x1={sx(t)}
                  y1={M.top}
                  x2={sx(t)}
                  y2={M.top + innerH}
                  className="prc-gridline"
                />
                <line
                  x1={M.left}
                  y1={sy(t)}
                  x2={M.left + innerW}
                  y2={sy(t)}
                  className="prc-gridline"
                />
              </g>
            ))}

            {built.map((c, i) => {
              if (!c.fill) return null;
              const color = c.color ?? PALETTE[i % PALETTE.length];
              const dim = hot !== null && hot !== i;
              return (
                <path
                  key={`fill${i}`}
                  d={c.fill}
                  fill={`color-mix(in oklab, ${color} 14%, transparent)`}
                  clipPath={`url(#prc-clip-${i})`}
                  style={{ opacity: dim ? 0.3 : 1, transition: 'opacity var(--m-fast)' }}
                />
              );
            })}
            {built.map((c, i) => {
              if (!c.path) return null;
              const color = c.color ?? PALETTE[i % PALETTE.length];
              const active = hot === i;
              const dim = hot !== null && !active;
              return (
                <path
                  key={`curve${i}`}
                  ref={curveRefs[i]}
                  d={c.path}
                  fill="none"
                  stroke={color}
                  strokeWidth={active ? 3 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  clipPath={`url(#prc-clip-${i})`}
                  style={{ opacity: dim ? 0.35 : 1, transition: 'opacity var(--m-fast)' }}
                  onMouseEnter={() => setHot(i)}
                />
              );
            })}

            <line
              x1={M.left}
              y1={M.top + innerH}
              x2={M.left + innerW}
              y2={M.top + innerH}
              className="prc-axis"
            />
            <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + innerH} className="prc-axis" />

            {AXIS_TICKS.map((t) => (
              <g key={`xt${t}`}>
                <line
                  x1={sx(t)}
                  y1={M.top + innerH}
                  x2={sx(t)}
                  y2={M.top + innerH + 4}
                  className="prc-tick"
                />
                <text
                  x={sx(t)}
                  y={M.top + innerH + 16}
                  textAnchor="middle"
                  className="prc-tick-label"
                >
                  {t === 0 ? '0' : t === 1 ? '1' : t.toFixed(1)}
                </text>
              </g>
            ))}
            {AXIS_TICKS.map((t) => (
              <g key={`yt${t}`}>
                <line x1={M.left - 4} y1={sy(t)} x2={M.left} y2={sy(t)} className="prc-tick" />
                <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" className="prc-tick-label">
                  {t === 0 ? '0' : t === 1 ? '1' : t.toFixed(1)}
                </text>
              </g>
            ))}

            <text
              x={M.left + innerW / 2}
              y={M.top + innerH + 34}
              textAnchor="middle"
              className="prc-axis-label"
            >
              Recall
            </text>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="prc-axis-label"
              transform={`translate(14, ${M.top + innerH / 2}) rotate(-90)`}
            >
              Precision
            </text>
          </svg>
        </div>
      ) : (
        <div className="prc-empty">Provide at least one curve with recall/precision points.</div>
      )}

      {hasData && (
        <div className="prc-legend">
          {built.map((c, i) => {
            const color = c.color ?? PALETTE[i % PALETTE.length];
            return (
              <button
                key={i}
                className={'prc-leg' + (hot === i ? ' on' : '')}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              >
                <i style={{ background: color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

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
