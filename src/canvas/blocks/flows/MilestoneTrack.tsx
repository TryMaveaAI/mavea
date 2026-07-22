import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MilestoneTrackProps, FlowStatus } from './types';

type Props = MilestoneTrackProps & { delay?: number };

const statusColor = (s?: FlowStatus) =>
  s === 'done'
    ? 'var(--insight)'
    : s === 'active'
      ? 'var(--presence)'
      : s === 'blocked'
        ? 'var(--danger)'
        : s === 'risk'
          ? 'var(--warning)'
          : 'var(--text-muted)';

// Each point's cap has to fit in the slice of the track it owns, or neighboring labels
// overlap — the old fixed 80px assumed a ~5-6 item demo fixture. Shrinking the cap as the
// count grows (down to a floor that still fits a couple words) keeps captions inside their
// own slice instead of bleeding into the next one; past a point plain shrinking isn't enough,
// so labels also switch to single-line ellipsis (below) once there's no room left to wrap.
const MAX_POINT_W = 80;
const MIN_POINT_W = 34;
const WRAP_THRESHOLD = 6; // milestone count at/above which labels stop wrapping and truncate
function pointWidth(count: number): number {
  if (count <= WRAP_THRESHOLD) return MAX_POINT_W;
  // Linear falloff past the threshold, same shape as TamSam's ring-radius interpolation —
  // reaches the floor around 16 items and never goes narrower than that.
  const t = Math.min(1, (count - WRAP_THRESHOLD) / 10);
  return MAX_POINT_W - t * (MAX_POINT_W - MIN_POINT_W);
}

export function MilestoneTrack({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  milestones,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  // default-active milestone = first 'active', else last 'done'
  const initial =
    milestones.findIndex((m) => m.status === 'active') >= 0
      ? milestones.findIndex((m) => m.status === 'active')
      : Math.max(0, milestones.map((m) => m.status === 'done').lastIndexOf(true));
  const [hover, setHover] = useState<number>(initial >= 0 ? initial : 0);
  // The active (or last-done) milestone is the one Mavéa naturally speaks to first.
  const salient = initial >= 0 ? initial : 0;
  const m = milestones[hover];
  const w = pointWidth(milestones.length);
  const dense = milestones.length > WRAP_THRESHOLD;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-ms">
        <div className="fl-ms-line" />
        {milestones.map((ms, i) => (
          <button
            key={i}
            className={'fl-ms-point' + (hover === i ? ' is-on' : '')}
            onMouseEnter={() => setHover(i)}
            style={
              {
                left: milestones.length > 1 ? (i / (milestones.length - 1)) * 100 + '%' : '50%',
                ['--c' as string]: statusColor(ms.status),
                ['--w' as string]: w + 'px',
                // pointWidth knows the COUNT but not the width it has to fit into, so on a phone
                // five 80px caps were laid over a ~200px track and simply sat on top of each other.
                // Hand the count to CSS as well, so a cap can also be capped at the slice it owns.
                ['--n' as string]: String(Math.max(1, milestones.length - 1)),
              } as CSSProperties
            }
          >
            <span className="fl-ms-dot" data-mark={i === salient ? 'point' : undefined}>
              {ms.status === 'done' && <Icon.check className="ic" />}
            </span>
            <span className="fl-ms-cap">
              <span className="fl-ms-date tab-num">{ms.date}</span>
              <span
                className={'fl-ms-label' + (dense ? ' is-clipped' : '')}
                title={dense ? ms.label : undefined}
              >
                {ms.label}
              </span>
            </span>
          </button>
        ))}
      </div>
      {m && (
        <div
          className="fl-ms-detail"
          key={hover}
          style={{ ['--c' as string]: statusColor(m.status) } as CSSProperties}
        >
          <div className="fl-ms-detail-top">
            <span className="fl-ms-pill">{m.status || 'todo'}</span>
            <span className="tab-num faint">{m.date}</span>
            {m.owner && <span className="faint">· {m.owner}</span>}
          </div>
          <div className="fl-ms-detail-title">{m.label}</div>
          {m.detail && <div className="insight-summary">{m.detail}</div>}
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
