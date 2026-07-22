import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, formatPercent, niceDomain, scaleLinear, usePathDraw } from '../../lib';
import type { EfficientFrontierProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EfficientFrontierProps & { delay?: number };

const W = 320;
const H = 220;
const PAD = { l: 34, r: 12, t: 14, b: 26 };

// ScatterRegression's axes+points scaffold, but the curve is never a computed fit here — it's
// drawn exactly as given, the frontier itself as a caller-supplied ordered polyline, the same
// "only draw what you're given" rule Plot/AreaPlot hold for geometry a chart can't verify.
export function EfficientFrontier({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  assets,
  frontier,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  usePathDraw(pathRef, { delay });

  // `frontier` has no itemShapes entry (its points are pure risk/return coordinates, with no
  // natural single text field to teach), so a loose model reply can arrive as something other
  // than an array entirely, or drop a point's risk/return — drop anything that can't be
  // plotted rather than let a NaN domain/coordinate leak into the axes or the path.
  const safeAssets = useMemo(
    () =>
      (Array.isArray(assets) ? assets : []).filter(
        (a) => Number.isFinite(a?.risk) && Number.isFinite(a?.return),
      ),
    [assets],
  );
  const safeFrontier = useMemo(
    () =>
      (Array.isArray(frontier) ? frontier : []).filter(
        (f) => Number.isFinite(f?.risk) && Number.isFinite(f?.return),
      ),
    [frontier],
  );

  const geom = useMemo(() => {
    const risks = [...safeAssets.map((a) => a.risk), ...safeFrontier.map((f) => f.risk)];
    const returns = [...safeAssets.map((a) => a.return), ...safeFrontier.map((f) => f.return)];
    const xe = extent(risks);
    const ye = extent(returns);
    const [xLo, xHi] = niceDomain(xe ? xe[0] : 0, xe ? xe[1] : 1);
    const [yLo, yHi] = niceDomain(ye ? ye[0] : 0, ye ? ye[1] : 1);
    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yLo, yHi], [H - PAD.b, PAD.t]);
    return { sx, sy, xTicks: sx.ticks(4), yTicks: sy.ticks(4) };
  }, [safeAssets, safeFrontier]);

  const { sx, sy, xTicks, yTicks } = geom;
  const frontierPath = safeFrontier
    .map((f, i) => `${i === 0 ? 'M' : 'L'}${sx(f.risk)} ${sy(f.return)}`)
    .join(' ');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fin-ef-plot" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="fin-ef-svg" role="img" aria-label={title}>
          {xTicks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} className="fin-ef-grid" />
              <text x={sx(t)} y={H - PAD.b + 12} className="fin-ef-tick" textAnchor="middle">
                {formatPercent(t, { decimals: 0 })}
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} className="fin-ef-grid" />
              <text x={PAD.l - 4} y={sy(t) + 3} className="fin-ef-tick" textAnchor="end">
                {formatPercent(t, { decimals: 0 })}
              </text>
            </g>
          ))}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="fin-ef-axis" />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="fin-ef-axis" />

          {safeFrontier.length > 1 && (
            <path
              ref={pathRef}
              d={frontierPath}
              fill="none"
              stroke="var(--insight)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {safeAssets.map((a, i) => {
            const cx = sx(a.risk);
            const cy = sy(a.return);
            const active = hot === i;
            return (
              <g key={i}>
                {a.highlight && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill="none"
                    stroke="var(--presence)"
                    strokeWidth={1.4}
                    className="fin-ef-ring"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 5.5 : 4}
                  fill={a.highlight ? 'var(--presence)' : 'var(--text-secondary)'}
                  stroke="var(--surface-default)"
                  strokeWidth={1}
                  style={{ cursor: 'pointer', transition: 'r var(--m-fast)' }}
                  onMouseEnter={() => setHot(i)}
                />
              </g>
            );
          })}
        </svg>

        {hot != null && safeAssets[hot] && (
          <div
            className="fin-ef-tip"
            style={{
              left: `${(sx(safeAssets[hot].risk) / W) * 100}%`,
              top: `${(sy(safeAssets[hot].return) / H) * 100}%`,
            }}
          >
            <b>{safeAssets[hot].label}</b>
            <span className="tab-num faint">
              risk {formatPercent(safeAssets[hot].risk, { decimals: 1 })} · return{' '}
              {formatPercent(safeAssets[hot].return, { decimals: 1 })}
            </span>
          </div>
        )}
      </div>

      <div className="fin-ef-axlbl">
        <span>risk →</span>
        <span>↑ return</span>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
