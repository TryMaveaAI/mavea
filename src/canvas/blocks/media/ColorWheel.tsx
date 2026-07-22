import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ColorWheelProps, ColorHarmony, ColorSwatch } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ColorWheelProps & { delay?: number };

const CX = 50;
const CY = 50;
const R_OUT = 44;
const R_IN = 30;

// The hue offsets (degrees from the base) each harmony rule places. Used both to draw the geometry
// over the wheel and to derive the swatch hues when the model doesn't supply explicit ones — so the
// lines and the swatches always describe the same colors.
const HARMONY_OFFSETS: Record<ColorHarmony, number[]> = {
  complementary: [0, 180],
  analogous: [0, 30, -30],
  triad: [0, 120, 240],
  split: [0, 150, 210],
  tetrad: [0, 90, 180, 270],
};

const norm = (deg: number) => ((deg % 360) + 360) % 360;

// A point on a circle for hue `deg` (0° at the top, clockwise — the conventional wheel layout).
function polar(deg: number, r: number): [number, number] {
  const a = (norm(deg) - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// A donut wedge spanning [a0, a1] degrees between the inner and outer radius — one hue segment.
function wedge(a0: number, a1: number): string {
  const [ox0, oy0] = polar(a0, R_OUT);
  const [ox1, oy1] = polar(a1, R_OUT);
  const [ix1, iy1] = polar(a1, R_IN);
  const [ix0, iy0] = polar(a0, R_IN);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

// HSL→hex at full saturation / mid lightness, so a derived hue renders a believable swatch when the
// model gives only an angle. Pure math, no allocation beyond the string.
function hueToHex(hue: number): string {
  const h = norm(hue) / 360;
  const s = 0.72;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h * 6) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[seg];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function ColorWheel({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  baseHue,
  harmony = 'complementary',
  swatches,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const offsets = HARMONY_OFFSETS[harmony] ?? HARMONY_OFFSETS.complementary;

  // Use the supplied swatches when present; otherwise derive them from the base hue + harmony so the
  // result is always self-consistent.
  const chips: ColorSwatch[] =
    swatches && swatches.length > 0
      ? swatches
      : offsets.map((off, i) => ({
          hue: norm(baseHue + off),
          hex: hueToHex(baseHue + off),
          role: i === 0 ? 'base' : 'accent',
        }));

  // The hue markers the geometry connects — taken from the swatches' own hues so the lines land on
  // exactly the colors shown in the row below.
  const markers = chips.map((c) => norm(c.hue));

  // Render the ring as 60 fine segments — smooth enough to read as a continuous gradient at any size.
  const SEG = 60;
  const seg = 360 / SEG;

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

      <div className="cw-wrap">
        <div className="cw-figbox">
          <svg viewBox="0 0 100 100" className="cw-svg" role="img" aria-label={title}>
            {/* the hue ring */}
            {Array.from({ length: SEG }, (_, i) => (
              <path key={i} d={wedge(i * seg, (i + 1) * seg)} fill={hueToHex(i * seg)} />
            ))}
            <circle cx={CX} cy={CY} r={R_IN} className="cw-hub" />

            {/* harmony geometry: spokes from the hub to each related hue on the ring */}
            {markers.map((deg, i) => {
              const [hx, hy] = polar(deg, R_IN);
              const [ox, oy] = polar(deg, R_OUT + 4);
              const hex = chips[i]?.hex ?? hueToHex(deg);
              const isBase = i === 0;
              return (
                <g key={`m${i}`}>
                  <line x1={CX} y1={CY} x2={hx} y2={hy} className="cw-spoke" />
                  <circle
                    cx={ox}
                    cy={oy}
                    r={isBase ? 4 : 3}
                    className={'cw-marker' + (isBase ? ' base' : '')}
                    fill={hex}
                    {...(isBase ? { 'data-mark': 'point' } : {})}
                  />
                </g>
              );
            })}
            <circle cx={CX} cy={CY} r={2.4} className="cw-center" />
          </svg>
        </div>

        <div className="cw-list">
          <div className="cw-harmony">{harmony}</div>
          {chips.map((c, i) => (
            <div key={i} className="cw-chip">
              <span className="cw-chip-sw" style={{ background: c.hex }} />
              <span className="cw-chip-body">
                <span className="cw-chip-hex tab-num">{c.hex}</span>
                {c.role && <span className="cw-chip-role">{c.role}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {caption && <div className="cw-caption">{caption}</div>}

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
