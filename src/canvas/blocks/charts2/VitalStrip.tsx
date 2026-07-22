import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { VitalStripProps, VitalChannel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VitalStripProps & { delay?: number };

const W = 160;
const H = 38;

// One channel's mini trend: its normal-range band shaded behind the trace, the latest point
// emphasized, and the y-domain padded to include the whole series AND the normal band so the band
// never clips off-frame. The band bounds and the trace geometry are computed from the channel's own
// numbers — nothing here is fabricated.
function ChannelTrend({ ch, accent }: { ch: VitalChannel; accent: string }) {
  const s = ch.series;
  // domain spans the series and the normal band, with a small cushion for breathing room.
  const ext = extent([...s, ...(ch.normal ?? [])]) ?? [0, 1];
  const cushion = (ext[1] - ext[0]) * 0.12 || 1;
  const lo = ext[0] - cushion;
  const hi = ext[1] + cushion;
  const span = hi - lo || 1;
  const px = (i: number) => (s.length <= 1 ? W / 2 : (i / (s.length - 1)) * (W - 4) + 2);
  const py = (v: number) => 3 + (1 - (v - lo) / span) * (H - 6);

  const band = ch.normal
    ? { y: py(ch.normal[1]), h: Math.max(0, py(ch.normal[0]) - py(ch.normal[1])) }
    : null;
  const path = s.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const last = s.length ? s[s.length - 1] : null;

  return (
    <svg
      className="c2-vs-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {band && (
        <rect
          x={0}
          y={band.y}
          width={W}
          height={band.h}
          className="c2-vs-band"
          style={{ fill: `color-mix(in oklab, ${accent} 14%, transparent)` }}
        />
      )}
      {s.length > 0 && (
        <path d={path} fill="none" className="c2-vs-line" style={{ stroke: accent }} />
      )}
      {last != null && (
        <circle cx={px(s.length - 1)} cy={py(last)} r={2.2} style={{ fill: accent }} />
      )}
    </svg>
  );
}

export function VitalStrip({
  title,
  icon = 'alert',
  iconColor = 'var(--presence)',
  channels,
  windowLabel,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.alert;
  const [hot, setHot] = useState<number | null>(null);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
          {windowLabel && <span className="c2-vs-window">{windowLabel}</span>}
        </div>
      )}

      <div className="c2-vs" onMouseLeave={() => setHot(null)}>
        {channels.map((ch, i) => {
          const accent = ch.color || 'var(--presence)';
          const current = ch.current ?? (ch.series.length ? ch.series[ch.series.length - 1] : null);
          // out of range when the current reading sits outside the channel's normal band.
          const out =
            current != null && ch.normal ? current < ch.normal[0] || current > ch.normal[1] : false;
          return (
            <div
              key={i}
              className={'c2-vs-row' + (hot === i ? ' on' : '') + (out ? ' alarm' : '')}
              onMouseEnter={() => setHot(i)}
            >
              <div className="c2-vs-meta">
                <span className="c2-vs-label">{ch.label}</span>
                {ch.normal && (
                  <span className="c2-vs-norm tab-num">
                    {formatValue(ch.normal[0])}–{formatValue(ch.normal[1])}
                    {ch.unit ? ' ' + ch.unit : ''}
                  </span>
                )}
              </div>
              <div className="c2-vs-plot">
                <ChannelTrend ch={ch} accent={accent} />
              </div>
              <div className="c2-vs-now">
                <span
                  className="c2-vs-val tab-num"
                  style={{ color: out ? 'var(--danger)' : accent }}
                >
                  {current != null ? formatValue(current) : '—'}
                </span>
                {ch.unit && <span className="c2-vs-unit">{ch.unit}</span>}
                {out && <span className="c2-vs-flag">!</span>}
              </div>
            </div>
          );
        })}
      </div>

      {caption && <p className="c2-vs-caption">{caption}</p>}

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
