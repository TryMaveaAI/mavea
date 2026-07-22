// TimeSeriesDecomposition — an STL-style split of a series into observed / trend / seasonal /
// residual, drawn as four small panels stacked on one shared x-axis (dates only labelled under
// the bottom panel, so they stay aligned instead of repeating four times). Each panel keeps its
// OWN y-scale — the seasonal and residual swings are usually an order of magnitude smaller than
// the observed series, and a shared y-axis would flatten them to a flat line. All four series are
// the caller's own numbers; nothing here is smoothed, filtered, or extrapolated.
import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import { formatValue } from '../../lib/format';
import type { TimeSeriesDecompositionProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TimeSeriesDecompositionProps & { delay?: number };

const W = 320;
const PAD = { l: 40, r: 12, t: 8 };
const PANEL_H = 56;
const PANEL_GAP = 8;
const BOTTOM_AXIS_H = 20;
const TICK_MAX_CHARS = 9;
// A reserved strip at the top of each panel for its label + latest-value readout — without it,
// a series that (after niceDomain pulls the floor down to 0) rides high in its own panel draws
// its line right through the value text instead of under it.
const HEADER_H = 15;

interface Panel {
  key: string;
  label: string;
  color: string;
  values: number[];
}

function truncate(text: string): string {
  return text.length > TICK_MAX_CHARS ? `${text.slice(0, TICK_MAX_CHARS - 1)}…` : text;
}

export function TimeSeriesDecomposition({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  dates,
  observed,
  trend,
  seasonal,
  residual,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const obsRef = useRef<SVGPathElement>(null);
  const trendRef = useRef<SVGPathElement>(null);
  const seasonRef = useRef<SVGPathElement>(null);
  const residRef = useRef<SVGPathElement>(null);
  const panelRefs = [obsRef, trendRef, seasonRef, residRef];

  const model = useMemo(() => {
    const n = Math.min(
      dates?.length ?? 0,
      observed?.length ?? 0,
      trend?.length ?? 0,
      seasonal?.length ?? 0,
      residual?.length ?? 0,
    );
    if (n === 0) return null;

    const panels: Panel[] = [
      {
        key: 'observed',
        label: 'Observed',
        color: 'var(--presence)',
        values: observed.slice(0, n),
      },
      { key: 'trend', label: 'Trend', color: 'var(--insight)', values: trend.slice(0, n) },
      { key: 'seasonal', label: 'Seasonal', color: 'var(--warning)', values: seasonal.slice(0, n) },
      {
        key: 'residual',
        label: 'Residual',
        color: 'var(--text-muted)',
        values: residual.slice(0, n),
      },
    ];

    const H = PAD.t + panels.length * PANEL_H + (panels.length - 1) * PANEL_GAP + BOTTOM_AXIS_H;
    const plotL = PAD.l;
    const plotR = W - PAD.r;
    const px = (i: number) =>
      n <= 1 ? plotL + (plotR - plotL) / 2 : plotL + (i / (n - 1)) * (plotR - plotL);

    const built = panels.map((panel, pi) => {
      const top = PAD.t + pi * (PANEL_H + PANEL_GAP);
      const bottom = top + PANEL_H;
      const ex = extent(panel.values) ?? [0, 1];
      const [yMin, yMax] = niceDomain(Math.min(0, ex[0]), Math.max(0, ex[1]));
      const sy = scaleLinear([yMin, yMax], [bottom - 4, top + HEADER_H]);
      const pts = panel.values.map((v, i) => ({ x: px(i), y: sy(v) }));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
      const zeroY = yMin <= 0 && yMax >= 0 ? sy(0) : null;
      const last = panel.values[panel.values.length - 1];
      return { ...panel, top, bottom, pts, d, zeroY, last };
    });

    const axisY = PAD.t + panels.length * (PANEL_H + PANEL_GAP) - PANEL_GAP;
    const tickCount = Math.min(6, n);
    const tickIdx =
      n <= 1
        ? [0]
        : Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (n - 1)));
    const uniqueTicks = [...new Set(tickIdx)];

    return { H, panels: built, px, axisY, uniqueTicks };
  }, [dates, observed, trend, seasonal, residual]);

  usePathDraw(obsRef, { delay: delay ?? 0 });
  usePathDraw(trendRef, { delay: (delay ?? 0) + 70 });
  usePathDraw(seasonRef, { delay: (delay ?? 0) + 140 });
  usePathDraw(residRef, { delay: (delay ?? 0) + 210 });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Time series decomposition'}
      </div>

      {model ? (
        <div className="tsd-wrap">
          <svg
            role="img"
            aria-label={title || 'time series decomposition'}
            viewBox={`0 0 ${W} ${model.H}`}
            className="tsd-svg"
          >
            {model.panels.map((panel, pi) => (
              <g key={panel.key}>
                {pi > 0 && (
                  <line
                    x1={PAD.l}
                    y1={panel.top - PANEL_GAP / 2}
                    x2={W - PAD.r}
                    y2={panel.top - PANEL_GAP / 2}
                    className="tsd-sep"
                  />
                )}
                {panel.zeroY !== null && (
                  <line
                    x1={PAD.l}
                    y1={panel.zeroY}
                    x2={W - PAD.r}
                    y2={panel.zeroY}
                    className="tsd-zero"
                  />
                )}
                <path
                  ref={panelRefs[pi]}
                  d={panel.d}
                  fill="none"
                  className="tsd-line"
                  style={{ stroke: panel.color }}
                />
                {/* A single-sample panel has no line to draw (a lone moveto is invisible) — mark
                    the one point directly so the panel is never blank. */}
                {panel.pts.length === 1 && (
                  <circle cx={panel.pts[0].x} cy={panel.pts[0].y} r={2.4} fill={panel.color} />
                )}
                <text x={PAD.l} y={panel.top + 8} className="tsd-panel-lbl">
                  {panel.label}
                </text>
                {panel.last !== undefined && Number.isFinite(panel.last) && (
                  <text x={W - PAD.r} y={panel.top + 8} textAnchor="end" className="tsd-panel-val">
                    {formatValue(panel.last, {
                      decimals: Math.abs(panel.last) < 10 ? 2 : undefined,
                    })}
                  </text>
                )}
              </g>
            ))}

            <line
              x1={PAD.l}
              y1={model.axisY}
              x2={W - PAD.r}
              y2={model.axisY}
              className="tsd-axis"
            />
            {model.uniqueTicks.map((i) => (
              <text
                key={i}
                x={model.px(i)}
                y={model.axisY + 13}
                textAnchor="middle"
                className="tsd-tick"
              >
                {truncate(dates[i] ?? '')}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="tsd-empty">
          Provide dates, observed, trend, seasonal, and residual arrays of matching length.
        </div>
      )}

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
