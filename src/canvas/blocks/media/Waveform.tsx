import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { WaveformProps } from './types';

type Props = WaveformProps & { delay?: number };

function clockAt(pct: number, durationLabel?: string) {
  // parse "3:24" → seconds, scale by pct, reformat
  const m = (durationLabel || '0:00').split(':').map((x) => parseInt(x, 10) || 0);
  const total = m.length === 2 ? m[0] * 60 + m[1] : m[0];
  const s = Math.round((total * pct) / 100);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Waveform({
  title,
  icon = 'speaker',
  iconColor = 'var(--presence)',
  bars,
  durationLabel = '3:24',
  color = 'var(--presence)',
  position = 32,
  markers = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.speaker;
  const [pos, setPos] = useState(Math.max(0, Math.min(100, position)));
  const [playing, setPlaying] = useState(true);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const onDown = (e: RPointerEvent) => {
    setDrag(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    move(e.clientX);
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-wave-row">
        <button
          className={'me-wave-play' + (playing ? ' on' : '')}
          style={{ ['--cc' as string]: color } as CSSProperties}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <span className="me-wave-pause">
              <i />
              <i />
            </span>
          ) : (
            <Icon.play />
          )}
        </button>

        <div
          className={'me-wave' + (drag ? ' dragging' : '')}
          ref={ref}
          data-interactive
          onPointerDown={onDown}
          onPointerMove={(e) => drag && move(e.clientX)}
          onPointerUp={() => setDrag(false)}
          onPointerLeave={() => setDrag(false)}
        >
          {bars.map((b, i) => {
            const at = bars.length > 1 ? (i / (bars.length - 1)) * 100 : 0;
            const played = at <= pos;
            return (
              <span
                key={i}
                className="me-wave-bar"
                style={{
                  height: Math.max(8, b * 100) + '%',
                  background: played ? color : 'var(--track)',
                }}
              />
            );
          })}
          {markers.map((m, i) => (
            // First marker is the authored emphasis callout; the span is a small dot → point.
            <span
              key={i}
              className="me-wave-marker"
              style={{ left: m.at + '%' }}
              title={m.label}
              {...(i === 0 ? { 'data-mark': 'point' } : {})}
            />
          ))}
          <span
            className="me-wave-head"
            style={{ left: pos + '%', ['--cc' as string]: color } as CSSProperties}
          />
        </div>

        <span className="tab-num me-wave-time">
          {clockAt(pos, durationLabel)} <span className="faint">/ {durationLabel}</span>
        </span>
      </div>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer || <span className="faint">Click or drag the waveform to scrub</span>}
      </div>
    </div>
  );
}
