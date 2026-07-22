import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { SliderinputProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SliderinputProps & { delay?: number };

export function Sliderinput({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  prompt,
  min,
  max,
  step = 1,
  value,
  prefix = '',
  suffix = '',
  marks,
  outputLabel,
  outputFactor,
  outputPrefix = '',
  outputSuffix = '',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const span = max - min || 1;
  const mid = value != null ? value : Math.round((min + max) / 2);
  const [val, setVal] = useState<number>(Math.min(max, Math.max(min, mid)));
  const [drag, setDrag] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = ((val - min) / span) * 100;

  const fromClientX = (cx: number) => {
    const el = trackRef.current;
    if (!el) return val;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (cx - r.left) / r.width));
    const raw = min + ratio * span;
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, snapped));
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    setVal(fromClientX(e.clientX));
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setVal(fromClientX(e.clientX));
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    setDrag(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setVal((v) => Math.min(max, v + step));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setVal((v) => Math.max(min, v - step));
  };

  const fmt = (n: number) => (Number.isInteger(step) ? n.toLocaleString() : n.toFixed(1));
  const derived = outputFactor != null ? val * outputFactor : null;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sl-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {prompt && <div className="sl-prompt dim">{prompt}</div>}

      <div className="sl-readout">
        {/* the live numeric value is the single salient figure Mavéa underlines */}
        <span className="sl-value tab-num" data-mark="underline" style={{ color }}>
          {prefix}
          {fmt(val)}
          {suffix}
        </span>
      </div>

      <div
        className={`sl-track ${drag ? 'drag' : ''}`}
        ref={trackRef}
        data-interactive
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        role="slider"
        aria-valuenow={val}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onKeyDown={onKey}
      >
        <span className="sl-fill" style={{ width: pct + '%' }} />
        <span className="sl-handle" style={{ left: pct + '%' }}>
          <span className="sl-handle-dot" />
        </span>
      </div>

      {marks && marks.length > 0 && (
        <div className="sl-marks">
          {marks.map((m, i) => (
            <button
              key={i}
              type="button"
              className={`sl-mark ${val === m.at ? 'on' : ''}`}
              style={{ left: ((m.at - min) / span) * 100 + '%' }}
              onClick={() => setVal(Math.min(max, Math.max(min, m.at)))}
            >
              <span className="sl-mark-tick" />
              <span className="sl-mark-label faint">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {derived != null && (
        <div className="sl-output">
          <span className="sl-output-label faint">{outputLabel || 'Result'}</span>
          <span className="sl-output-val tab-num" style={{ color }}>
            {outputPrefix}
            {Math.round(derived).toLocaleString()}
            {outputSuffix}
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
