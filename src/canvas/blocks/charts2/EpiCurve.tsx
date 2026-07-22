import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
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
const MAX_PHASE_CHARS = 12;

function truncate(label: string): string {
  return label.length > MAX_PHASE_CHARS
    ? `${label.slice(0, MAX_PHASE_CHARS - 1).trimEnd()}…`
    : label;
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
    const innerH = H - PAD.top - padB;

    const thresholdValid = Number.isFinite(threshold?.value) && (threshold?.value as number) > 0;
    const maxTotal = periods.reduce((m, p) => Math.max(m, p.total), 0);
    const domainTop = Math.max(maxTotal, thresholdValid ? (threshold!.value as number) : 0, 1);
    const [, top] = niceDomain(0, domainTop);
    const sy = scaleLinear([0, top], [innerH, 0]);
    const n = Math.max(1, periods.length);
    const bandW = innerW / n;
    const sx = (i: number) => i * bandW + bandW / 2;

    const periodIndex = new Map(order.map((p, i) => [p, i]));
    const phaseList = (Array.isArray(phases) ? phases : [])
      .map((ph) => {
        const label = typeof ph?.label === 'string' && ph.label.trim() ? ph.label.trim() : '';
        const idx = periodIndex.get(typeof ph?.period === 'string' ? ph.period.trim() : '');
        if (!label || idx === undefined) return null;
        return { label, x: sx(idx) };
      })
      .filter((p): p is { label: string; x: number } => p !== null);

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
      phaseList,
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

            {geom.phaseList.map((ph, i) => (
              <g key={i}>
                <line x1={ph.x} y1={0} x2={ph.x} y2={geom.innerH} className="c2-ec-phase" />
                <text
                  x={0}
                  y={0}
                  className="c2-ec-phase-lbl"
                  transform={`translate(${ph.x - 5},${geom.innerH}) rotate(-90)`}
                >
                  <title>{ph.label}</title>
                  {truncate(ph.label)}
                </text>
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
                  x={geom.innerW}
                  y={yThreshold - 4}
                  className="c2-ec-threshold-lbl"
                  textAnchor="end"
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
