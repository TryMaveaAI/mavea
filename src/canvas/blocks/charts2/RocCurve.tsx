// RocCurve — ROC (Receiver Operating Characteristic) curve for classifier evaluation.
// Plots TPR (recall) vs FPR at each decision threshold, with a shaded AUC area, the
// diagonal chance-level baseline, and an interactive operating-point marker. Multiple
// curves let you compare models on the same axes. AUC is model-supplied (not recomputed)
// to keep the display honest. Geometry is computed from the data; never hard-placed.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { RocCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RocCurveProps & { delay?: number };

// ── layout constants ────────────────────────────────────────────────────────
const W = 340;
const H = 280;
const M = { top: 18, right: 16, bottom: 50, left: 52 };

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'] as const;

export function RocCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  curves,
  operatingPoint,
  xLabel,
  yLabel,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  // Operating-point state for the first curve (click-along interaction)
  const [opIdx, setOpIdx] = useState<number>(operatingPoint ?? 0);

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const sx = useMemo(() => scaleLinear([0, 1], [M.left, M.left + innerW]), [innerW]);
  const sy = useMemo(() => scaleLinear([0, 1], [M.top + innerH, M.top]), [innerH]);

  // Build path + AUC fill polygon for one curve
  const buildPath = (pts: { fpr: number; tpr: number }[]) => {
    if (!pts.length) return { d: '', fill: '' };
    const sorted = [...pts].sort((a, b) => a.fpr - b.fpr);
    const pathPts = sorted.map((p) => `${sx(p.fpr)},${sy(p.tpr)}`);
    const d = `M${pathPts.join('L')}`;
    // Fill polygon: close along the bottom edge to (1,0) then to (0,0)
    const fillD = `${d}L${sx(1)},${sy(0)}L${sx(0)},${sy(0)}Z`;
    return { d, fillD };
  };

  // Safe operating-point index
  const firstCurve = curves[0];
  const opPt =
    firstCurve && firstCurve.points.length > 0 && opIdx < firstCurve.points.length
      ? firstCurve.points[opIdx]
      : null;

  // Axis tick values (every 0.2)
  const axisTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="roc-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="roc-svg"
          role="img"
          aria-label={title ?? 'ROC curve'}
        >
          {/* ── defs: AUC fill clips + glow markers ── */}
          <defs>
            {curves.map((_, i) => (
              <clipPath key={`cp${i}`} id={`roc-clip-${i}`}>
                <rect x={M.left} y={M.top} width={innerW} height={innerH} />
              </clipPath>
            ))}
          </defs>

          {/* ── grid lines ── */}
          {axisTicks.map((t) => (
            <g key={`g${t}`}>
              <line x1={sx(t)} y1={M.top} x2={sx(t)} y2={M.top + innerH} className="roc-gridline" />
              <line
                x1={M.left}
                y1={sy(t)}
                x2={M.left + innerW}
                y2={sy(t)}
                className="roc-gridline"
              />
            </g>
          ))}

          {/* ── chance diagonal (random classifier) ── */}
          <line
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(1)}
            y2={sy(1)}
            className="roc-diagonal"
            strokeDasharray="5 4"
          />

          {/* ── AUC fills (drawn before curves) ── */}
          {curves.map((curve, i) => {
            const color = curve.color ?? PALETTE[i % PALETTE.length];
            const { fillD } = buildPath(curve.points);
            return (
              <path
                key={`fill${i}`}
                d={fillD}
                fill={`color-mix(in oklab, ${color} 14%, transparent)`}
                clipPath={`url(#roc-clip-${i})`}
              />
            );
          })}

          {/* ── curves ── */}
          {curves.map((curve, i) => {
            const color = curve.color ?? PALETTE[i % PALETTE.length];
            const { d } = buildPath(curve.points);
            return (
              <path
                key={`curve${i}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                clipPath={`url(#roc-clip-${i})`}
              />
            );
          })}

          {/* ── operating-point marker on the first curve (interactive) ── */}
          {opPt && firstCurve && (
            <g>
              <circle
                cx={sx(opPt.fpr)}
                cy={sy(opPt.tpr)}
                r={8}
                className="roc-op"
                style={{ cursor: 'pointer' }}
              />
              {/* Invisible wider hit target for clicking along the curve */}
              {firstCurve.points.map((pt, idx) => (
                <circle
                  key={`hit${idx}`}
                  cx={sx(pt.fpr)}
                  cy={sy(pt.tpr)}
                  r={10}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setOpIdx(idx)}
                  aria-label={`Set operating point to FPR=${pt.fpr.toFixed(2)}, TPR=${pt.tpr.toFixed(2)}`}
                />
              ))}
            </g>
          )}

          {/* ── axes ── */}
          {/* x-axis */}
          <line
            x1={M.left}
            y1={M.top + innerH}
            x2={M.left + innerW}
            y2={M.top + innerH}
            className="roc-axis"
          />
          {/* y-axis */}
          <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + innerH} className="roc-axis" />

          {/* ── x ticks + labels ── */}
          {axisTicks.map((t) => (
            <g key={`xt${t}`}>
              <line
                x1={sx(t)}
                y1={M.top + innerH}
                x2={sx(t)}
                y2={M.top + innerH + 4}
                className="roc-tick"
              />
              <text
                x={sx(t)}
                y={M.top + innerH + 16}
                textAnchor="middle"
                className="roc-tick-label"
              >
                {t === 0 ? '0' : t === 1 ? '1' : t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* ── y ticks + labels ── */}
          {axisTicks.map((t) => (
            <g key={`yt${t}`}>
              <line x1={M.left - 4} y1={sy(t)} x2={M.left} y2={sy(t)} className="roc-tick" />
              <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" className="roc-tick-label">
                {t === 0 ? '0' : t === 1 ? '1' : t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* ── axis labels ── */}
          <text
            x={M.left + innerW / 2}
            y={M.top + innerH + 36}
            textAnchor="middle"
            className="roc-axis-label"
          >
            {xLabel ?? 'False Positive Rate (FPR)'}
          </text>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            className="roc-axis-label"
            transform={`translate(14, ${M.top + innerH / 2}) rotate(-90)`}
          >
            {yLabel ?? 'True Positive Rate (TPR)'}
          </text>
        </svg>
      </div>

      {/* ── operating-point readout ── */}
      {opPt && firstCurve && (
        <div className="roc-readout" aria-live="polite">
          <span className="roc-readout-item">
            <span className="roc-readout-key">TPR</span>
            <span className="roc-readout-val">{opPt.tpr.toFixed(3)}</span>
          </span>
          <span className="roc-readout-item">
            <span className="roc-readout-key">FPR</span>
            <span className="roc-readout-val">{opPt.fpr.toFixed(3)}</span>
          </span>
          {opPt.threshold !== undefined && (
            <span className="roc-readout-item">
              <span className="roc-readout-key">Threshold</span>
              <span className="roc-readout-val">{opPt.threshold.toFixed(3)}</span>
            </span>
          )}
        </div>
      )}

      {/* ── AUC legend ── */}
      <div className="roc-legend">
        {curves.map((curve, i) => {
          const color = curve.color ?? PALETTE[i % PALETTE.length];
          return (
            <div key={i} className="roc-legend-item">
              <span className="roc-legend-dot" style={{ background: color }} />
              <span className="roc-legend-name">{curve.name}</span>
              {curve.auc !== undefined && (
                <span className="roc-legend-auc">AUC {curve.auc.toFixed(3)}</span>
              )}
            </div>
          );
        })}
        <div className="roc-legend-item roc-legend-diagonal">
          <span className="roc-legend-dash" />
          <span className="roc-legend-name">Random</span>
          <span className="roc-legend-auc">AUC 0.500</span>
        </div>
      </div>

      {caption && <p className="roc-caption">{caption}</p>}

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
