import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ContractionTimerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ContractionTimerProps & { delay?: number };

// A labor-contraction interval strip — a DISPLAY of already-logged contractions, not a live timer.
// Each contraction is a bar whose height is scaled to its duration against the longest in the log,
// and the gaps between bars are scaled to the interval to the next contraction, so the pattern
// (longer, closer, stronger) is visible at a glance. The duration / frequency read-outs and the
// "go in" check are computed from the most recent entries — every number comes from the data.
export function ContractionTimer({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  contractions,
  rule,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  const list = contractions ?? [];
  const maxDur = list.reduce((m, c) => Math.max(m, c.durationSec || 0), 0) || 1;
  const intervals = list.map((c) => c.intervalMin).filter((v): v is number => v !== undefined);
  const maxGap = intervals.reduce((m, v) => Math.max(m, v), 0) || 1;

  // The recent read-outs: average duration (seconds) and average frequency (minutes) across the
  // entries that carry the field. These are the numbers a "5-1-1" check is read against.
  const avgDurSec = list.length
    ? Math.round(list.reduce((s, c) => s + (c.durationSec || 0), 0) / list.length)
    : 0;
  const avgFreqMin = intervals.length
    ? Math.round((intervals.reduce((s, v) => s + v, 0) / intervals.length) * 10) / 10
    : undefined;

  // Format mm:ss for a duration read-out.
  const mmss = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="cn-caption">{caption}</div>}

      <div className="cn-readouts">
        <div className="cn-readout">
          <span className="cn-ro-val">{mmss(avgDurSec)}</span>
          <span className="cn-ro-label">avg duration</span>
        </div>
        <div className="cn-readout">
          <span className="cn-ro-val">{avgFreqMin !== undefined ? `${avgFreqMin} min` : '—'}</span>
          <span className="cn-ro-label">avg apart</span>
        </div>
        <div className="cn-readout">
          <span className="cn-ro-val">{list.length}</span>
          <span className="cn-ro-label">logged</span>
        </div>
      </div>

      {list.length > 0 && (
        <div className="cn-strip" role="img" aria-label={`${list.length} contractions`}>
          {list.map((c, i) => {
            const h = 28 + (c.durationSec / maxDur) * 40; // bar height by duration
            // Spacing to the NEXT bar scales with the interval; the last bar needs no trailing gap.
            const gapPct = c.intervalMin !== undefined ? (c.intervalMin / maxGap) * 100 : 0;
            return (
              <div
                key={i}
                className="cn-slot"
                style={{ flexGrow: i < list.length - 1 ? Math.max(0.4, gapPct / 100 + 0.4) : 0.4 }}
              >
                <div
                  className="cn-bar"
                  style={{ height: h }}
                  title={`${c.start} · ${mmss(c.durationSec)}`}
                />
                <span className="cn-bar-time">{c.start}</span>
                {c.intervalMin !== undefined && i < list.length - 1 && (
                  // Alternate the gap label above/below the bar's midline by index — with many
                  // contractions logged, every label pinned to the same fixed top:40% band would
                  // collide with its neighbours as the strip gets denser.
                  <span className="cn-gap-label" style={{ top: i % 2 === 0 ? '18%' : '62%' }}>
                    {c.intervalMin}m
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rule && (
        <div className="cn-rule">
          <Icon.bell className="ic" />
          <span>
            Go in at the <strong>{rule}</strong> rule — contractions {rule.split('-')[0]} min apart,
            ~{rule.split('-')[1]} min each, for {rule.split('-')[2]} hour.
          </span>
        </div>
      )}

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
