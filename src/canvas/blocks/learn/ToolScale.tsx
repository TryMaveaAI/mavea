import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScaleInstrument, ToolScaleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ToolScaleProps & { delay?: number };

const VB_W = 280;

/** Reduce a fraction to lowest terms. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Render a value as a mixed number in eighths when `fractional` (an inch ruler) — 2.375 → "2 3/8".
 *  Falls back to a trimmed decimal otherwise. */
function readingLabel(value: number, unit: string | undefined, fractional: boolean): string {
  const u = unit ? ` ${unit}` : '';
  if (!fractional) {
    const v = parseFloat(value.toFixed(2));
    return `${v}${u}`;
  }
  const whole = Math.floor(value);
  const frac = value - whole;
  // Snap to the nearest eighth — the finest tick on a standard inch ruler.
  let num = Math.round(frac * 8);
  let den = 8;
  if (num === 0) return `${whole}${u}`;
  if (num === 8) return `${whole + 1}${u}`;
  const g = gcd(num, den);
  num /= g;
  den /= g;
  return whole > 0 ? `${whole} ${num}/${den}${u}` : `${num}/${den}${u}`;
}

// ── Ruler ────────────────────────────────────────────────────────────────────
function Ruler({ value, max, fractional }: { value: number; max: number; fractional: boolean }) {
  const H = 92;
  const PAD = 14;
  const top = 20;
  const bodyH = 40;
  const scaleW = VB_W - PAD * 2;
  const x = (v: number) => PAD + (Math.min(max, Math.max(0, v)) / max) * scaleW;
  // An inch ruler subdivides into eighths; a metric/decimal ruler into tenths.
  const minor = fractional ? max * 8 : max * 10;
  const ticks: ReactNode[] = [];
  for (let i = 0; i <= minor; i++) {
    const v = (i / minor) * max;
    const isUnit = fractional ? i % 8 === 0 : i % 10 === 0;
    const isHalf = fractional ? i % 4 === 0 : i % 5 === 0;
    const len = isUnit ? 22 : isHalf ? 14 : 8;
    ticks.push(
      <line
        key={i}
        x1={x(v)}
        y1={top}
        x2={x(v)}
        y2={top + len}
        className={isUnit ? 'lr-ts-tick lr-ts-tick--unit' : 'lr-ts-tick'}
      />,
    );
    if (isUnit) {
      ticks.push(
        <text key={`l${i}`} x={x(v)} y={top + 36} className="lr-ts-ticklbl" textAnchor="middle">
          {Math.round(v)}
        </text>,
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${VB_W} ${H}`} className="lr-ts-svg" role="img" aria-label="ruler">
      <rect x={PAD} y={top} width={scaleW} height={bodyH} rx={3} className="lr-ts-body" />
      {ticks}
      {/* Indicator at the measured value. */}
      <g className="lr-ts-ind">
        <line
          x1={x(value)}
          y1={top - 8}
          x2={x(value)}
          y2={top + bodyH}
          className="lr-ts-ind-line"
        />
        <polygon
          points={`${x(value)},${top - 8} ${x(value) - 5},${top - 16} ${x(value) + 5},${top - 16}`}
          className="lr-ts-ind-head"
        />
      </g>
    </svg>
  );
}

// ── Protractor ───────────────────────────────────────────────────────────────
function Protractor({ value, max }: { value: number; max: number }) {
  // The semicircle only ever sweeps upward from `cy` (0°–180°, y = cy − sin·R), so the deepest
  // content is the flat baseline itself, not cy + R. Keep real margin below it anyway — any future
  // addition below the axis (a caption, a below-baseline label) must not silently reclip.
  const cx = VB_W / 2;
  const cy = 128;
  const R = 108;
  const H = cy + 32;
  const clamped = Math.min(max, Math.max(0, value));
  // 0° points right; sweep counter-clockwise (up the page → negate the sine).
  const pt = (deg: number, r: number) => ({
    x: cx + Math.cos((deg * Math.PI) / 180) * r,
    y: cy - Math.sin((deg * Math.PI) / 180) * r,
  });
  const ind = pt(clamped, R);
  const ticks: ReactNode[] = [];
  for (let d = 0; d <= 180; d += 10) {
    const a = pt(d, R);
    const b = pt(d, R - (d % 30 === 0 ? 14 : 8));
    ticks.push(<line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="lr-ts-tick" />);
    if (d % 30 === 0) {
      const l = pt(d, R - 26);
      ticks.push(
        <text key={`l${d}`} x={l.x} y={l.y + 3} className="lr-ts-ticklbl" textAnchor="middle">
          {d}
        </text>,
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${VB_W} ${H}`} className="lr-ts-svg" role="img" aria-label="protractor">
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`}
        className="lr-ts-body lr-ts-arc"
      />
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} className="lr-ts-axis" />
      {ticks}
      {/* Swept angle + indicator radius. */}
      <path
        d={`M ${cx} ${cy} L ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${ind.x.toFixed(1)} ${ind.y.toFixed(1)} Z`}
        className="lr-ts-sweep"
      />
      <line x1={cx} y1={cy} x2={ind.x} y2={ind.y} className="lr-ts-ind-line" />
      <circle cx={cx} cy={cy} r={4} className="lr-ts-pin" />
    </svg>
  );
}

// ── Caliper ──────────────────────────────────────────────────────────────────
function Caliper({ value, max }: { value: number; max: number }) {
  const H = 96;
  const PAD = 14;
  const top = 30;
  const scaleW = VB_W - PAD * 2;
  const x = (v: number) => PAD + (Math.min(max, Math.max(0, v)) / max) * scaleW;
  const jaw = x(value);
  const ticks: ReactNode[] = [];
  const minor = max * 10;
  for (let i = 0; i <= minor; i++) {
    const v = (i / minor) * max;
    const isUnit = i % 10 === 0;
    ticks.push(
      <line
        key={i}
        x1={x(v)}
        y1={top}
        x2={x(v)}
        y2={top + (isUnit ? 12 : 6)}
        className={isUnit ? 'lr-ts-tick lr-ts-tick--unit' : 'lr-ts-tick'}
      />,
    );
  }
  return (
    <svg viewBox={`0 0 ${VB_W} ${H}`} className="lr-ts-svg" role="img" aria-label="caliper">
      {/* Main beam + fixed jaw at 0. */}
      <line x1={PAD} y1={top} x2={VB_W - PAD} y2={top} className="lr-ts-axis" />
      {ticks}
      <rect x={PAD - 4} y={top - 22} width={6} height={22} className="lr-ts-jaw" />
      {/* Sliding jaw clamps the object between 0 and `value`. */}
      <rect x={jaw - 2} y={top - 22} width={6} height={22} className="lr-ts-jaw lr-ts-jaw--slide" />
      <rect
        x={PAD}
        y={top - 18}
        width={Math.max(0, jaw - PAD)}
        height={14}
        rx={2}
        className="lr-ts-gap"
      />
    </svg>
  );
}

// ── Thermometer ──────────────────────────────────────────────────────────────
function Thermometer({ value, max }: { value: number; max: number }) {
  const H = 150;
  const cx = VB_W / 2;
  const top = 14;
  const bottom = 118;
  const bulbR = 14;
  const tubeW = 14;
  const frac = Math.min(1, Math.max(0, value / max));
  const fillY = bottom - frac * (bottom - top);
  const ticks: ReactNode[] = [];
  for (let i = 0; i <= 5; i++) {
    const v = (i / 5) * max;
    const y = bottom - (i / 5) * (bottom - top);
    ticks.push(
      <g key={i}>
        <line x1={cx + tubeW} y1={y} x2={cx + tubeW + 8} y2={y} className="lr-ts-tick" />
        <text x={cx + tubeW + 12} y={y + 3} className="lr-ts-ticklbl" textAnchor="start">
          {Math.round(v)}
        </text>
      </g>,
    );
  }
  return (
    <svg viewBox={`0 0 ${VB_W} ${H}`} className="lr-ts-svg" role="img" aria-label="thermometer">
      {/* Glass tube + bulb. */}
      <rect
        x={cx - tubeW / 2}
        y={top}
        width={tubeW}
        height={bottom - top + bulbR}
        rx={tubeW / 2}
        className="lr-ts-body"
      />
      <circle cx={cx} cy={bottom + bulbR} r={bulbR} className="lr-ts-body" />
      {/* Mercury column, height computed from value/max. */}
      <rect
        x={cx - tubeW / 2 + 3}
        y={fillY}
        width={tubeW - 6}
        height={bottom - fillY}
        className="lr-ts-mercury"
      />
      <circle cx={cx} cy={bottom + bulbR} r={bulbR - 3} className="lr-ts-mercury" />
      {ticks}
    </svg>
  );
}

const INSTRUMENTS: Record<
  ScaleInstrument,
  (p: { value: number; max: number; fractional: boolean }) => ReactNode
> = {
  ruler: ({ value, max, fractional }) => <Ruler value={value} max={max} fractional={fractional} />,
  protractor: ({ value, max }) => <Protractor value={value} max={max} />,
  caliper: ({ value, max }) => <Caliper value={value} max={max} />,
  thermometer: ({ value, max }) => <Thermometer value={value} max={max} />,
};

export function ToolScale({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  instrument,
  value,
  max,
  unit,
  fractional = false,
  reading,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Guard the scale so a zero/negative max never divides by zero downstream.
  const safeMax = max > 0 ? max : Math.max(1, Math.abs(value) || 1);

  const readOut = useMemo(
    () => reading ?? readingLabel(value, unit, fractional),
    [reading, value, unit, fractional],
  );
  const draw = INSTRUMENTS[instrument] ?? INSTRUMENTS.ruler;

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

      <div className="lr-ts-wrap">{draw({ value, max: safeMax, fractional })}</div>

      {/* Read-out, computed from the value (or the model's explicit string). */}
      <div className="lr-ts-read">
        <span className="lr-ts-read-k">Reading</span>
        <span className="lr-ts-read-v">{readOut}</span>
      </div>

      {caption && <p className="lr-ts-cap">{caption}</p>}

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
