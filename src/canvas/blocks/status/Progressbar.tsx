import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProgressbarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ProgressbarProps & { delay?: number };

export function Progressbar({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  caption,
  segments,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const doneVal = segments.reduce((s, x) => s + (x.done ? x.value : 0), 0);
  const donePct = Math.round((doneVal / total) * 100);

  // default-hover the first in-progress (not-done) segment, else the last.
  // clamp to 0 so an empty `segments` array doesn't index at -1.
  const firstOpen = segments.findIndex((s) => !s.done);
  const fallbackHover = Math.max(0, segments.length - 1);
  const [hover, setHover] = useState<number>(firstOpen === -1 ? fallbackHover : firstOpen);
  // The salient segment is the active frontier — first incomplete, else last (the
  // most recently completed). Mavéa's gesture circles its fill shape.
  const salient = firstOpen === -1 ? fallbackHover : firstOpen;
  const hs = segments[hover];
  const hsPct = hs ? Math.round((hs.value / total) * 100) : 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pb-head">
        <span className="pb-caption tab-num">{caption || `${donePct}% complete`}</span>
        <span className="pb-frac faint tab-num">
          {donePct}
          <span className="pb-frac-d">%</span>
        </span>
      </div>

      <div
        className="pb-track"
        onMouseLeave={() => setHover(firstOpen === -1 ? fallbackHover : firstOpen)}
      >
        {segments.map((s, i) => {
          const c = s.color || 'var(--presence)';
          const w = (s.value / total) * 100;
          const on = hover === i;
          return (
            <div
              key={i}
              className={`pb-seg ${s.done ? 'done' : 'pending'} ${on ? 'on' : ''}`}
              style={{ width: w + '%', ['--seg-c' as string]: c } as CSSProperties}
              onMouseEnter={() => setHover(i)}
            >
              <span className="pb-seg-fill" data-mark={i === salient ? 'circle' : undefined} />
              {s.done && <Icon.check className="ic pb-seg-check" />}
            </div>
          );
        })}
      </div>

      <div className="pb-legend">
        {segments.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`pb-chip ${hover === i ? 'on' : ''}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
          >
            <span className="pb-dot" style={{ background: s.color || 'var(--presence)' }} />
            {s.label}
          </button>
        ))}
      </div>

      {hs && (
        <div
          className="pb-detail"
          style={{ ['--seg-c' as string]: hs.color || 'var(--presence)' } as CSSProperties}
        >
          <span className="pb-detail-label">{hs.label}</span>
          <span className="pb-detail-pct tab-num">{hsPct}%</span>
          {hs.detail && <span className="pb-detail-sub faint">{hs.detail}</span>}
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
