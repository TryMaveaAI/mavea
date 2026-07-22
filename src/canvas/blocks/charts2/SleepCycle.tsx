import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SleepCycleProps, SleepStage } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SleepCycleProps & { delay?: number };

const W = 340;
const H = 200;
const PAD_L = 50; // y-axis gutter for the stage row labels (Awake / REM / Light / Deep)
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 30; // x-axis gutter: hour ticks + the bedtime/wake clock row

// Stage lanes, top → bottom. Awake rides highest, Deep sits at the floor — the classic hypnogram
// ordering, so the line "descends" into deep sleep and "rises" toward REM/wake, reading like the
// night's depth. REM is pulled out (highlighted) because its lengthening toward morning is the
// architecture people come to see.
const LANES: { stage: SleepStage['stage']; label: string }[] = [
  { stage: 'awake', label: 'Awake' },
  { stage: 'rem', label: 'REM' },
  { stage: 'light', label: 'Light' },
  { stage: 'deep', label: 'Deep' },
];
const LANE_INDEX: Record<SleepStage['stage'], number> = {
  awake: 0,
  rem: 1,
  light: 2,
  deep: 3,
};

/** Minutes → "7h 12m" / "48m". Sleep durations read in hours-and-minutes, never raw minutes. */
function durLabel(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

// A one-night hypnogram. The stage spans are traced as a stepped line across the hours of the
// night on a categorical depth axis; REM spans are highlighted, bedtime and wake are marked, and
// the cycle count is reported. Every coordinate — the time scale, the step path, the per-stage
// totals, the REM bands — is computed from the supplied spans; no stage is fabricated.
export function SleepCycle({
  title,
  icon = 'moon',
  iconColor = 'var(--presence)',
  stages,
  bedtime,
  wake,
  cycles,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.moon;

  const geom = useMemo(() => {
    // Chronological order is the spine of a stepped line; never trust input ordering.
    const spans = [...stages]
      .filter((s) => s.toMin > s.fromMin)
      .sort((a, b) => a.fromMin - b.fromMin);
    const t0 = spans.length ? spans[0].fromMin : 0;
    const t1 = spans.length ? spans[spans.length - 1].toMin : 1;
    const total = t1 - t0 || 1;

    const sx = (min: number) => PAD_L + ((min - t0) / total) * (W - PAD_L - PAD_R);
    const laneH = (H - PAD_T - PAD_B) / LANES.length;
    // Centre of each lane row — the line rides the middle of its stage band.
    const sy = (stage: SleepStage['stage']) => PAD_T + (LANE_INDEX[stage] + 0.5) * laneH;

    // The stepped trace: hold each stage level across its span, then jump vertically to the next.
    const stepPts: [number, number][] = [];
    spans.forEach((s) => {
      const y = sy(s.stage);
      stepPts.push([sx(s.fromMin), y]);
      stepPts.push([sx(s.toMin), y]);
    });

    // Per-stage time totals for the legend read-out.
    const totals: Record<SleepStage['stage'], number> = { awake: 0, rem: 0, light: 0, deep: 0 };
    spans.forEach((s) => {
      totals[s.stage] += s.toMin - s.fromMin;
    });

    // REM bouts → cycle count when the caller doesn't pin one (one REM episode caps each cycle).
    const remBouts = spans.filter((s) => s.stage === 'rem').length;

    // Hour gridlines from the first whole hour after lights-out to the last before wake.
    const hourTicks: number[] = [];
    for (let m = Math.ceil(t0 / 60) * 60; m <= t1; m += 60) hourTicks.push(m);

    return { spans, t0, t1, total, sx, sy, laneH, stepPts, totals, remBouts, hourTicks };
  }, [stages]);

  const { spans, sx, laneH, stepPts, totals, remBouts, hourTicks } = geom;
  const cycleCount = cycles ?? remBouts;
  const asleep = totals.rem + totals.light + totals.deep;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {/* headline read-outs: total time asleep + the cycle count */}
      <div className="c2-sc-stats">
        <div className="c2-sc-stat">
          <span className="c2-sc-stat-v">{durLabel(asleep)}</span>
          <span className="c2-sc-stat-k">asleep</span>
        </div>
        <div className="c2-sc-stat">
          <span className="c2-sc-stat-v">{cycleCount}</span>
          <span className="c2-sc-stat-k">{cycleCount === 1 ? 'cycle' : 'cycles'}</span>
        </div>
      </div>

      <div className="c2-sc-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="c2-sc-svg"
          role="img"
          aria-label={title || 'Hypnogram'}
        >
          {/* lane rows + labels — REM's lane is tinted so the highlight reads even between bouts */}
          {LANES.map((lane, i) => {
            const yTop = PAD_T + i * laneH;
            return (
              <g key={lane.stage}>
                <rect
                  x={PAD_L}
                  y={yTop}
                  width={W - PAD_L - PAD_R}
                  height={laneH}
                  className={'c2-sc-lane' + (lane.stage === 'rem' ? ' c2-sc-lane--rem' : '')}
                />
                <text
                  x={PAD_L - 6}
                  y={yTop + laneH / 2 + 3}
                  className="c2-sc-lane-lbl"
                  textAnchor="end"
                >
                  {lane.label}
                </text>
              </g>
            );
          })}

          {/* hour gridlines */}
          {hourTicks.map((m) => (
            <line
              key={`h${m}`}
              x1={sx(m)}
              y1={PAD_T}
              x2={sx(m)}
              y2={H - PAD_B}
              className="c2-sc-grid"
            />
          ))}

          {/* REM bands: a filled block over each REM span so the highlighted stage pops */}
          {spans
            .filter((s) => s.stage === 'rem')
            .map((s, i) => (
              <rect
                key={`rem${i}`}
                x={sx(s.fromMin)}
                y={PAD_T + LANE_INDEX.rem * laneH + 2}
                width={Math.max(sx(s.toMin) - sx(s.fromMin), 0.5)}
                height={laneH - 4}
                className="c2-sc-rem"
                rx="2"
              />
            ))}

          {/* the stepped hypnogram trace */}
          <polyline
            points={stepPts.map((p) => `${p[0]},${p[1]}`).join(' ')}
            className="c2-sc-line"
          />

          {/* bedtime / wake markers — verticals at the strip's ends, clocks printed below */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="c2-sc-edge" />
          <line x1={W - PAD_R} y1={PAD_T} x2={W - PAD_R} y2={H - PAD_B} className="c2-sc-edge" />

          {/* hour-axis baseline */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="c2-sc-axis" />

          {/* bedtime + wake clock labels under the ends */}
          {bedtime && (
            <text x={PAD_L} y={H - PAD_B + 14} className="c2-sc-clock" textAnchor="start">
              {bedtime}
            </text>
          )}
          {wake && (
            <text x={W - PAD_R} y={H - PAD_B + 14} className="c2-sc-clock" textAnchor="end">
              {wake}
            </text>
          )}
        </svg>
      </div>

      {/* per-stage time legend (REM flagged as the highlighted stage) */}
      <div className="c2-sc-legend">
        {LANES.map((lane) => (
          <span
            key={lane.stage}
            className={'c2-sc-leg' + (lane.stage === 'rem' ? ' c2-sc-leg--rem' : '')}
          >
            <i className={'c2-sc-sw c2-sc-sw--' + lane.stage} />
            {lane.label}
            <b className="tab-num">{durLabel(totals[lane.stage])}</b>
          </span>
        ))}
      </div>

      {caption && <div className="c2-sc-caption">{caption}</div>}

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
