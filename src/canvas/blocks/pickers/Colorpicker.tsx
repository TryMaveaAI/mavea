import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { ColorpickerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ColorpickerProps & { delay?: number };

const DEFAULT_SWATCHES = [
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#0EA5E9', name: 'Sky' },
  { hex: '#10B981', name: 'Emerald' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#14B8A6', name: 'Teal' },
];

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function hexToHue(hex: string): number {
  const m = hex.replace('#', '');
  if (m.length < 6) return 240;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

export function Colorpicker({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  label = 'Accent color',
  value = '#6366F1',
  swatches = DEFAULT_SWATCHES,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const initialHex = typeof value === 'string' && value.trim() ? value.toUpperCase() : '#6366F1';
  const safeSwatches = swatches.filter(
    (swatch): swatch is { hex: string; name?: string } =>
      !!swatch && typeof swatch.hex === 'string' && swatch.hex.trim().length > 0,
  );
  const [hex, setHex] = useState<string>(initialHex);
  const [hue, setHue] = useState<number>(hexToHue(initialHex));
  const [drag, setDrag] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const fromX = (cx: number) => {
    const el = stripRef.current;
    if (!el) return hue;
    const r = el.getBoundingClientRect();
    // floor width: a 0-width strip would make 0/0 = NaN slip past the clamp into the hue
    const ratio = Math.min(1, Math.max(0, (cx - r.left) / (r.width || 1)));
    return Math.round(ratio * 360);
  };
  const applyHue = (cx: number) => {
    const h = fromX(cx);
    setHue(h);
    setHex(hslToHex(h, 72, 60));
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    applyHue(e.clientX);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag) applyHue(e.clientX);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    setDrag(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const huePct = (hue / 360) * 100;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--cp-c' as string]: hex } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {label && <label className="pk-label">{label}</label>}

      <div className="cp-head">
        <span className="cp-preview" style={{ background: hex }} />
        <div className="cp-meta">
          <span className="cp-hex tab-num">{hex}</span>
          <span className="cp-hsl faint">H {hue}°</span>
        </div>
      </div>

      <div
        className={`cp-strip ${drag ? 'drag' : ''}`}
        ref={stripRef}
        data-interactive
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        role="slider"
        aria-valuenow={hue}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            const h = Math.min(360, hue + 4);
            setHue(h);
            setHex(hslToHex(h, 72, 60));
          }
          if (e.key === 'ArrowLeft') {
            const h = Math.max(0, hue - 4);
            setHue(h);
            setHex(hslToHex(h, 72, 60));
          }
        }}
      >
        <span
          className="cp-strip-handle"
          style={{ left: huePct + '%', background: hslToHex(hue, 72, 60) }}
        />
      </div>

      <div className="cp-swatches">
        {safeSwatches.map((s, index) => (
          <button
            key={`${s.hex}-${index}`}
            type="button"
            className={`cp-swatch ${hex.toUpperCase() === s.hex.toUpperCase() ? 'on' : ''}`}
            style={{ background: s.hex }}
            title={s.name || s.hex}
            aria-label={s.name || s.hex}
            onClick={() => {
              setHex(s.hex.toUpperCase());
              setHue(hexToHue(s.hex));
            }}
          >
            {hex.toUpperCase() === s.hex.toUpperCase() && (
              <Icon.check className="cp-swatch-check" />
            )}
          </button>
        ))}
      </div>

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
