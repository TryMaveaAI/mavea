import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, scaleLinear } from '../../lib/scale';
import { fitText } from '../../lib/fitText';
import { formatValue } from '../../lib/format';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { LineBalanceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LineBalanceProps & { delay?: number };

const W = 360;
const H = 230;
const PAD = { top: 16, right: 54, bottom: 34, left: 40 };
// .cx-tick's clamp ceiling, in user units — the size the labels would like to be.
const LABEL_FS = 9.5;
// Gap between the axis line and the first line of station type.
const LABEL_GAP = 12;

interface Station {
  name: string;
  cycleTime: number;
  isBottleneck: boolean;
}

export function LineBalance({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  takt,
  unit = '',
  stations,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const taktValid = Number.isFinite(takt) && takt > 0;

  const geom = useMemo(() => {
    const list: Station[] = (Array.isArray(stations) ? stations : []).map((s) => {
      const cycleTime = Number.isFinite(s?.cycleTime) && s.cycleTime >= 0 ? s.cycleTime : 0;
      const overTakt = taktValid && cycleTime > (takt as number);
      return {
        name: typeof s?.name === 'string' && s.name.trim() ? s.name.trim() : 'Station',
        cycleTime,
        isBottleneck: overTakt || s?.bottleneck === true,
      };
    });

    const innerW = W - PAD.left - PAD.right;
    const n = Math.max(1, list.length);
    const bandW = innerW / n;

    // Station names are model-authored and often long ("Panel cut + edge-band"). Sizing the axis
    // off the station COUNT alone let five long names collide into an unreadable pile while nine
    // short ones sat fine, so fit each name to the band it actually occupies: wrap and shrink to
    // the legibility floor, never truncate. The tallest label then sets the axis gutter, which
    // keeps the plot honest for any mix of name lengths rather than the fixture's own.
    const labels = list.map((s) =>
      fitText(s.name, { maxWidth: Math.max(16, bandW - 4), fontSize: LABEL_FS, maxLines: 3 }),
    );
    const labelBlockH = labels.reduce((m, f) => Math.max(m, f.lines.length * f.lineHeightPx), 0);
    const padB = Math.max(PAD.bottom, Math.round(LABEL_GAP + labelBlockH + 6));
    const innerH = H - PAD.top - padB;

    const maxCycle = list.reduce((m, s) => Math.max(m, s.cycleTime), 0);
    const domainTop = Math.max(maxCycle, taktValid ? (takt as number) : 0, 1);
    const [, top] = niceDomain(0, domainTop);
    const sy = scaleLinear([0, top], [innerH, 0]);
    const sx = (i: number) => i * bandW + bandW / 2;

    return { list, labels, padB, innerW, innerH, sy, sx, bandW, yTicks: sy.ticks(4) };
  }, [stations, takt, taktValid]);

  if (!hasData(geom.list.map((s) => s.cycleTime))) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  const yTakt = taktValid ? geom.sy(takt as number) : null;
  const fmt = (v: number) => formatValue(v, { unit: unit || undefined, decimals: 1 });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-lb-wrap" onMouseLeave={() => setHot(null)}>
        <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="c2-lb-svg">
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {geom.yTicks.map((t, i) => (
              <line
                key={i}
                x1={0}
                y1={geom.sy(t)}
                x2={geom.innerW}
                y2={geom.sy(t)}
                className="cx-grid-l"
              />
            ))}
            {geom.yTicks.map((t, i) => (
              <text key={i} x={-6} y={geom.sy(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t)}
              </text>
            ))}

            {geom.list.map((s, i) => {
              const barH = geom.innerH - geom.sy(s.cycleTime);
              const barW = geom.bandW * 0.55;
              const x = geom.sx(i) - barW / 2;
              const y = geom.sy(s.cycleTime);
              const active = hot === i;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, barH)}
                    rx={2.5}
                    className={
                      'c2-lb-bar m-stagger-item m-fade-rise' +
                      (s.isBottleneck ? ' c2-lb-bar-warn' : '') +
                      (active ? ' on' : '')
                    }
                    style={{ ['--i' as string]: i } as CSSProperties}
                    onMouseEnter={() => setHot(i)}
                  />
                  {s.isBottleneck && (
                    <text
                      x={geom.sx(i)}
                      y={Math.max(y - 5, 9)}
                      textAnchor="middle"
                      className="c2-lb-flag"
                    >
                      bottleneck
                    </text>
                  )}
                  {active && (
                    <g
                      transform={`translate(${Math.min(Math.max(geom.sx(i), 30), geom.innerW - 30)},${Math.max(y - (s.isBottleneck ? 20 : 8), 2)})`}
                    >
                      <rect
                        className="c2-lb-tip-bg"
                        x={-30}
                        y={-24}
                        width={60}
                        height={20}
                        rx={4}
                      />
                      <text className="c2-lb-tip-val" x={0} y={-10} textAnchor="middle">
                        {fmt(s.cycleTime)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {yTakt !== null && (
              <>
                <line x1={0} y1={yTakt} x2={geom.innerW} y2={yTakt} className="c2-lb-takt" />
                <text x={geom.innerW + 4} y={yTakt + 3} className="c2-lb-takt-lbl">
                  Takt · {fmt(takt as number)}
                </text>
              </>
            )}

            <line x1={0} y1={geom.innerH} x2={geom.innerW} y2={geom.innerH} className="cx-axis-l" />
            {geom.labels.map((fit, i) => {
              const lx = geom.sx(i);
              return (
                <text
                  key={i}
                  x={lx}
                  y={geom.innerH + LABEL_GAP}
                  className="cx-tick"
                  textAnchor="middle"
                  style={{ fontSize: fit.fontSize }}
                >
                  {fit.lines.map((line, k) => (
                    <tspan key={k} x={lx} dy={k === 0 ? 0 : fit.lineHeightPx}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}
          </g>
        </svg>
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
