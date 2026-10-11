import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { estimateTextWidth } from '../../lib/fitText';
import { Legend } from '../../lib/axis';
import { hasData } from '../../lib/empty';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { EpiCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EpiCurveProps & { delay?: number };

type Classification = 'confirmed' | 'probable' | 'suspected' | 'unclassified';

const STACK_ORDER: Classification[] = ['confirmed', 'probable', 'suspected', 'unclassified'];
const CLASS_LABEL: Record<Classification, string> = {
  confirmed: 'Confirmed',
  probable: 'Probable',
  suspected: 'Suspected',
  unclassified: 'Unclassified',
};
const CLASS_COLOR: Record<Classification, string> = {
  confirmed: 'var(--danger)',
  probable: 'var(--warning)',
  suspected: 'var(--presence-soft)',
  unclassified: 'var(--text-muted)',
};
const CLASS_SET = new Set(['confirmed', 'probable', 'suspected']);

const W = 380;
const H = 230;
const PAD = { top: 16, right: 20, bottom: 34, left: 40 };
const PAD_BOTTOM_ROTATED = 52;
const ROTATE_AT = 8;
const PHASE_FS = 8.5; // .c2-ec-phase-lbl
const THRESHOLD_FS = 9; // .c2-ec-threshold-lbl
const PHASE_ROW = 14; // the row above the plot that phase names sit in

/** Cut a label to fit `maxW` user units at `fs`, ellipsis included. */
function fitWidth(label: string, maxW: number, fs: number): string {
  if (estimateTextWidth(label, fs) <= maxW) return label;
  let n = label.length;
  while (n > 1 && estimateTextWidth(label.slice(0, n) + '…', fs) > maxW) n--;
  return label.slice(0, n).trimEnd() + '…';
}

interface Period {
  period: string;
  segments: Partial<Record<Classification, number>>;
  total: number;
}

export function EpiCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  cases,
  threshold,
  phases,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const order: string[] = [];
    const byPeriod = new Map<string, Partial<Record<Classification, number>>>();
    for (const c of Array.isArray(cases) ? cases : []) {
      const period = typeof c?.period === 'string' && c.period.trim() ? c.period.trim() : '';
      if (!period) continue;
      if (!byPeriod.has(period)) {
        byPeriod.set(period, {});
        order.push(period);
      }
      const bucket: Classification = CLASS_SET.has(c?.classification as string)
        ? (c.classification as Classification)
        : 'unclassified';
      const count = Number.isFinite(c?.count) && c.count >= 0 ? c.count : 0;
      const rec = byPeriod.get(period)!;
      rec[bucket] = (rec[bucket] ?? 0) + count;
    }
    const periods: Period[] = order.map((period) => {
      const segments = byPeriod.get(period) ?? {};
      const total = STACK_ORDER.reduce((s, k) => s + (segments[k] ?? 0), 0);
      return { period, segments, total };
    });

    const presentClasses = STACK_ORDER.filter((k) => periods.some((p) => (p.segments[k] ?? 0) > 0));

    const rotateLabels = periods.length > ROTATE_AT;
    const padB = rotateLabels ? PAD_BOTTOM_ROTATED : PAD.bottom;
    const innerW = W - PAD.left - PAD.right;
    const n = Math.max(1, periods.length);
    const bandW = innerW / n;
    const sx = (i: number) => i * bandW + bandW / 2;

    // A phase starts at its period's left edge — on the gap between two bars, where the marker
    // runs clear of both — and its name sits flat in a row of its own above the plot. Drawn
    // through the middle of the period, the marker split a bar, ran through the threshold's
    // label, and its rotated name hid behind the bar it was naming.
    const periodIndex = new Map(order.map((p, i) => [p, i]));
    const phaseList: {
      label: string;
      full: string;
      x: number;
      tx: number;
      anchor: 'start' | 'end';
    }[] = [];
    let shelf = -Infinity;
    for (const ph of Array.isArray(phases) ? phases : []) {
      const full = typeof ph?.label === 'string' && ph.label.trim() ? ph.label.trim() : '';
      const idx = periodIndex.get(typeof ph?.period === 'string' ? ph.period.trim() : '');
      if (!full || idx === undefined) continue;
      const x = idx * bandW;
      // To the right of its marker (where the phase runs) whenever the name fits there.
      const right = innerW - x - 3 >= estimateTextWidth(full, PHASE_FS) || innerW - x - 3 >= x - 3;
      const label = fitWidth(full, Math.max(0, right ? innerW - x - 3 : x - 3), PHASE_FS);
      const w = estimateTextWidth(label, PHASE_FS);
      const x0 = right ? x + 3 : x - 3 - w;
      // A name that would run into the previous one keeps its marker and moves to a tooltip.
      const shown = x0 >= shelf + 6;
      if (shown) shelf = x0 + w;
      phaseList.push({
        label: shown ? label : '',
        full,
        x,
        tx: right ? x + 3 : x - 3,
        anchor: right ? 'start' : 'end',
      });
    }
    const padT = PAD.top + (phaseList.length ? PHASE_ROW : 0);
    const innerH = H - padT - padB;

    const thresholdValid = Number.isFinite(threshold?.value) && (threshold?.value as number) > 0;
    const maxTotal = periods.reduce((m, p) => Math.max(m, p.total), 0);
    const domainTop = Math.max(maxTotal, thresholdValid ? (threshold!.value as number) : 0, 1);
    const [, top] = niceDomain(0, domainTop);
    const sy = scaleLinear([0, top], [innerH, 0]);

    // The threshold's name goes at whichever end of its line no phase marker crosses, above the
    // line; with markers at both ends it drops below the line at the right.
    let thresholdLbl: { x: number; dy: number; anchor: 'start' | 'end' } | null = null;
    if (thresholdValid) {
      const w = estimateTextWidth(threshold?.label || 'Threshold', THRESHOLD_FS, true);
      const clear = (x0: number, x1: number) =>
        !phaseList.some((p) => p.x > x0 - 3 && p.x < x1 + 3);
      if (clear(innerW - w, innerW)) thresholdLbl = { x: innerW, dy: -4, anchor: 'end' };
      else if (clear(2, 2 + w)) thresholdLbl = { x: 2, dy: -4, anchor: 'start' };
      else thresholdLbl = { x: innerW, dy: THRESHOLD_FS + 3, anchor: 'end' };
    }

    return {
      periods,
      presentClasses,
      rotateLabels,
      padB,
      innerW,
      innerH,
      sy,
      sx,
      bandW,
      yTicks: sy.ticks(4),
      thresholdValid,
      thresholdLbl,
      phaseList,
      padT,
    };
  }, [cases, threshold, phases]);

  if (!hasData(geom.periods.map((p) => p.total))) {
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

  const yThreshold = geom.thresholdValid ? geom.sy(threshold!.value) : null;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-ec-wrap" onMouseLeave={() => setHot(null)}>
        <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="c2-ec-svg">
          <g transform={`translate(${PAD.left},${geom.padT})`}>
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

            {geom.phaseList.map((ph, i) => (
              <g key={i}>
                <line
                  x1={ph.x}
                  y1={-PHASE_ROW + 2}
                  x2={ph.x}
                  y2={geom.innerH}
                  className="c2-ec-phase"
                >
                  <title>{ph.full}</title>
                </line>
                {ph.label && (
                  <text
                    x={ph.tx}
                    y={-PHASE_ROW + 2 + PHASE_FS}
                    textAnchor={ph.anchor}
                    className="c2-ec-phase-lbl"
                  >
                    {ph.label !== ph.full && <title>{ph.full}</title>}
                    {ph.label}
                  </text>
                )}
              </g>
            ))}

            {geom.periods.map((p, i) => {
              const active = hot === i;
              let cursorY = geom.innerH;
              const barW = geom.bandW * 0.62;
              const x = geom.sx(i) - barW / 2;
              return (
                <g
                  key={i}
                  className="m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                  onMouseEnter={() => setHot(i)}
                >
                  {STACK_ORDER.map((k) => {
                    const v = p.segments[k] ?? 0;
                    if (v <= 0) return null;
                    const segH = geom.innerH - geom.sy(v);
                    cursorY -= segH;
                    return (
                      <rect
                        key={k}
                        x={x}
                        y={cursorY}
                        width={barW}
                        height={Math.max(0, segH)}
                        className={'c2-ec-seg' + (active ? ' on' : '')}
                        fill={CLASS_COLOR[k]}
                      />
                    );
                  })}
                  {active && (
                    <g
                      transform={`translate(${Math.min(Math.max(geom.sx(i), 34), geom.innerW - 34)},${Math.max(cursorY - 8, 2)})`}
                    >
                      <rect
                        className="c2-ec-tip-bg"
                        x={-34}
                        y={-24}
                        width={68}
                        height={20}
                        rx={4}
                      />
                      <text className="c2-ec-tip-val" x={0} y={-10} textAnchor="middle">
                        {p.total.toLocaleString()} cases
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {yThreshold !== null && (
              <>
                <line
                  x1={0}
                  y1={yThreshold}
                  x2={geom.innerW}
                  y2={yThreshold}
                  className="c2-ec-threshold"
                />
                <text
                  x={geom.thresholdLbl?.x ?? geom.innerW}
                  y={yThreshold + (geom.thresholdLbl?.dy ?? -4)}
                  className="c2-ec-threshold-lbl"
                  textAnchor={geom.thresholdLbl?.anchor ?? 'end'}
                >
                  {threshold?.label || 'Threshold'}
                </text>
              </>
            )}

            <line x1={0} y1={geom.innerH} x2={geom.innerW} y2={geom.innerH} className="cx-axis-l" />
            {geom.periods.map((p, i) => {
              const lx = geom.sx(i);
              const ly = geom.innerH + (geom.rotateLabels ? 8 : 14);
              return (
                <text
                  key={i}
                  x={lx}
                  y={ly}
                  className="cx-tick"
                  textAnchor={geom.rotateLabels ? 'end' : 'middle'}
                  transform={geom.rotateLabels ? `rotate(-40, ${lx}, ${ly})` : undefined}
                >
                  {p.period}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
      <Legend
        items={geom.presentClasses.map((k) => ({ label: CLASS_LABEL[k], color: CLASS_COLOR[k] }))}
      />
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
