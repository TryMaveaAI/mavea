import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, scaleLinear } from '../../lib/scale';
import { estimateTextWidth, fitText } from '../../lib/fitText';
import { formatValue } from '../../lib/format';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { LineBalanceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LineBalanceProps & { delay?: number };

function formatTakt(v: number, unit: string): string {
  return formatValue(v, { unit: unit || undefined, decimals: 1 });
}

const W = 360;
const H = 230;
const PAD = { top: 16, bottom: 34, left: 40 };
// The right gutter holds the takt line's label, sized from its value ("2.5 hours" is several
// times wider than "90") within these bounds.
const PAD_R_MIN = 24;
const PAD_R_MAX = W * 0.3;
// .c2-lb-takt-lbl, in user units. It already sits at the library's floor, so a label too long
// for the widest gutter wraps rather than shrinks.
const TAKT_FS = 9;
const TAKT_GAP = 4;
const TAKT_WORD = 'Takt';
// Baseline floor for a bar's "bottleneck" flag, in viewBox units: a bar reaching the top of the
// domain lifts its flag into the top padding rather than printing it over the bar.
const FLAG_TOP = 9;
// The hover read-out: .c2-lb-tip-val's size in user units, its box's padding and height, and the
// room it leaves above a bar (more when the bar carries a "bottleneck" flag).
const TIP_FS = 10.5;
const TIP_PAD_X = 8;
const TIP_H = 20;
const TIP_GAP = 6;
const TIP_FLAG_CLEAR = 16;
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

    // The label stacks "Takt" over its value, so the gutter only has to be as wide as the value:
    // on one line a unit makes it several times longer than a bare number, and every unit the
    // gutter takes is a unit the station bands (and their names) lose.
    const taktValue = taktValid ? formatTakt(takt as number, unit) : '';
    const padR = taktValue
      ? Math.min(
          PAD_R_MAX,
          Math.max(
            PAD_R_MIN,
            Math.max(
              estimateTextWidth(TAKT_WORD, TAKT_FS, true),
              estimateTextWidth(taktValue, TAKT_FS, true),
            ) +
              TAKT_GAP +
              2,
          ),
        )
      : PAD_R_MIN;
    const valueFit = taktValue
      ? fitText(taktValue, {
          maxWidth: padR - TAKT_GAP - 2,
          fontSize: TAKT_FS,
          minFontSize: TAKT_FS,
          maxLines: 2,
          bold: true,
        })
      : null;
    const taktFit = valueFit ? { ...valueFit, lines: [TAKT_WORD, ...valueFit.lines] } : null;
    const innerW = W - PAD.left - padR;
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

    return {
      list,
      labels,
      taktLabel: taktFit,
      padB,
      innerW,
      innerH,
      sy,
      sx,
      bandW,
      yTicks: sy.ticks(4),
    };
  }, [stations, takt, taktValid, unit]);

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
  const fmt = (v: number) => formatTakt(v, unit);
  const { taktLabel } = geom;
  const hotStation = hot === null ? undefined : geom.list[hot];
  const hotX = hot === null ? 0 : geom.sx(hot);

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
                      y={Math.max(y - 5, FLAG_TOP - PAD.top)}
                      textAnchor="middle"
                      className="c2-lb-flag"
                    >
                      bottleneck
                    </text>
                  )}
                </g>
              );
            })}

            {yTakt !== null && (
              <>
                <line x1={0} y1={yTakt} x2={geom.innerW} y2={yTakt} className="c2-lb-takt" />
                {taktLabel && (
                  <text
                    x={geom.innerW + TAKT_GAP}
                    // Centre the stack on the takt line, which it reads as the end of.
                    y={yTakt + 3 - ((taktLabel.lines.length - 1) * taktLabel.lineHeightPx) / 2}
                    className="c2-lb-takt-lbl"
                    style={{ fontSize: taktLabel.fontSize }}
                  >
                    {taktLabel.lines.map((line, k) => (
                      <tspan
                        key={k}
                        x={geom.innerW + TAKT_GAP}
                        dy={k === 0 ? 0 : taktLabel.lineHeightPx}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                )}
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

            {/* Last, so the read-out paints over the takt line and the neighbouring bars. */}
            {hotStation && (
              <HoverTip
                text={fmt(hotStation.cycleTime)}
                x={hotX}
                barTop={geom.sy(hotStation.cycleTime)}
                clearance={hotStation.isBottleneck ? TIP_FLAG_CLEAR : TIP_GAP}
              />
            )}
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

/** A bar's read-out, in the plot's translated frame. It is sized from its own text (a unit makes
 *  "2.9 hours" far wider than "101"), kept inside the viewBox horizontally, and drops inside the
 *  bar when there is no room above it. */
function HoverTip({
  text,
  x,
  barTop,
  clearance,
}: {
  text: string;
  x: number;
  barTop: number;
  clearance: number;
}) {
  const w = estimateTextWidth(text, TIP_FS, true) + TIP_PAD_X * 2;
  const minX = -PAD.left + w / 2 + 1;
  const maxX = W - PAD.left - w / 2 - 1;
  const cx = minX > maxX ? W / 2 - PAD.left : Math.min(maxX, Math.max(minX, x));
  const above = barTop - clearance - TIP_H;
  const top = above >= -PAD.top + 1 ? above : barTop + TIP_GAP;
  return (
    <g className="c2-lb-tip">
      <rect className="c2-lb-tip-bg" x={cx - w / 2} y={top} width={w} height={TIP_H} rx={4} />
      <text className="c2-lb-tip-val" x={cx} y={top + 14} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
