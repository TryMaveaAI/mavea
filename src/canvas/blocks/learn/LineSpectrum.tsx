import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LineSpectrumProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LineSpectrumProps & { delay?: number };

const W = 340;
const H = 120;
const PAD_X = 16;
const STRIP_Y = 20;
const STRIP_H = 52;

// Line labels sit at 9px (see .ls-label) — roughly 5.2px per glyph is a safe average for the
// mixed letters/digits/symbols these carry (e.g. "Hα", "656 nm").
const LABEL_CHAR_W = 5.2;
const LABEL_ROW_H = 10; // vertical offset between an alternated pair of label rows
const LABEL_GAP = 3; // minimum breathing room between two same-row label boxes

// Spectral colour stops — wavelength (nm) mapped to hex.
// These are science-rendering colours, not UI styling tokens.
const SPECTRAL_STOPS: [number, string][] = [
  [380, '#7B00D7'],
  [420, '#5700FF'],
  [470, '#0047FF'],
  [500, '#00AAFF'],
  [530, '#00FF28'],
  [570, '#AAFF00'],
  [600, '#FF8C00'],
  [650, '#FF2200'],
  [780, '#800000'],
];

/** Map a wavelength (nm) to an approximate visible-spectrum hex colour. */
function wavelengthToHex(wl: number): string {
  const stops = SPECTRAL_STOPS;
  if (wl <= stops[0][0]) return stops[0][1];
  if (wl >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [w0, c0] = stops[i];
    const [w1, c1] = stops[i + 1];
    if (wl >= w0 && wl <= w1) {
      const t = (wl - w0) / (w1 - w0);
      // Simple linear interpolation on hex components
      const r0 = parseInt(c0.slice(1, 3), 16);
      const g0 = parseInt(c0.slice(3, 5), 16);
      const b0 = parseInt(c0.slice(5, 7), 16);
      const r1 = parseInt(c1.slice(1, 3), 16);
      const g1 = parseInt(c1.slice(3, 5), 16);
      const b1 = parseInt(c1.slice(5, 7), 16);
      const r = Math.round(r0 + (r1 - r0) * t)
        .toString(16)
        .padStart(2, '0');
      const g = Math.round(g0 + (g1 - g0) * t)
        .toString(16)
        .padStart(2, '0');
      const b = Math.round(b0 + (b1 - b0) * t)
        .toString(16)
        .padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  return '#888';
}

/** Assign each labelled line a stacked "row" (0 = closest to the strip, 1 = one row further up)
 *  so that labels whose centred text boxes would overlap their nearest earlier neighbour on the
 *  same row get pushed to the next row instead — an alternating above/above-that layout rather
 *  than letting dense lines print illegible overlapping text. Lines are visited in x-order so
 *  the greedy per-row "last box end" tracking only ever compares adjacent labels. */
function assignLabelRows(items: { x: number; text: string }[]): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x);
  const rowEndX: number[] = []; // right edge of the last label placed on each row, in x-order
  const rows = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const half = (items[i].text.length * LABEL_CHAR_W) / 2;
    const left = items[i].x - half;
    let row = 0;
    while (rowEndX[row] !== undefined && left < rowEndX[row] + LABEL_GAP) row++;
    rows[i] = row;
    rowEndX[row] = items[i].x + half;
  }
  return rows;
}

export function LineSpectrum({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  lines,
  mode = 'emission',
  range = [380, 780],
  elementLabel,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const gradId = `ls-grad-${useId().replace(/:/g, '')}`;

  const [minWl, maxWl] = range;
  const stripW = W - PAD_X * 2;

  const xFor = (wl: number) =>
    PAD_X + ((Math.max(minWl, Math.min(maxWl, wl)) - minWl) / (maxWl - minWl)) * stripW;

  // Axis ticks every 50 nm
  const axisTicks = useMemo(() => {
    const ticks: number[] = [];
    const start = Math.ceil(minWl / 50) * 50;
    for (let wl = start; wl <= maxWl; wl += 50) ticks.push(wl);
    return ticks;
  }, [minWl, maxWl]);

  // Labels packed close enough in wavelength to collide (dense series, or a range zoomed out
  // over many lines) alternate onto a further-back row instead of printing on top of each other.
  const labelRows = useMemo(() => {
    const labelled = lines
      .map((line, i) => ({ i, x: xFor(line.wavelength), text: line.label ?? '' }))
      .filter((item) => item.text);
    const rows = assignLabelRows(labelled);
    const byIndex = new Map<number, number>();
    labelled.forEach((item, k) => byIndex.set(item.i, rows[k]));
    return byIndex;
    // xFor only closes over minWl/maxWl/stripW (stripW is a module constant), so those two
    // range bounds are the complete, stable dependency set — re-deriving xFor itself every
    // render would just recreate the same function and re-run this unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, minWl, maxWl]);

  const maxLabelRow = labelRows.size ? Math.max(...labelRows.values()) : 0;
  // Extra headroom above the strip for however many label rows stacked up, plus the fixed
  // element-label caption band below the axis ticks.
  const stripTop = STRIP_Y + maxLabelRow * LABEL_ROW_H;
  const tickY = stripTop + STRIP_H + 4;
  const labelY = tickY + 14;
  const vbH = H + maxLabelRow * LABEL_ROW_H + (elementLabel ? 14 : 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ls-wrap">
        <svg
          viewBox={`0 0 ${W} ${vbH}`}
          className="ls-svg"
          role="img"
          aria-label={elementLabel ? `${elementLabel} spectrum` : title}
        >
          <defs>
            {/* Full visible-spectrum gradient */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              {SPECTRAL_STOPS.map(([wl, col]) => (
                <stop key={wl} offset={`${((wl - 380) / 400) * 100}%`} stopColor={col} />
              ))}
            </linearGradient>
          </defs>

          {/* Background strip */}
          {mode === 'emission' ? (
            // Dark background for emission mode
            <rect
              x={PAD_X}
              y={stripTop}
              width={stripW}
              height={STRIP_H}
              fill="var(--surface-inset, #1a1a2e)"
              rx={3}
            />
          ) : (
            // Rainbow strip for absorption
            <rect
              x={PAD_X}
              y={stripTop}
              width={stripW}
              height={STRIP_H}
              fill={`url(#${gradId})`}
              rx={3}
            />
          )}

          {/* For emission: overlay a faint rainbow tint */}
          {mode === 'emission' && (
            <rect
              x={PAD_X}
              y={stripTop}
              width={stripW}
              height={STRIP_H}
              fill={`url(#${gradId})`}
              opacity={0.15}
              rx={3}
            />
          )}

          {/* Spectral lines */}
          {lines.map((line, i) => {
            const x = xFor(line.wavelength);
            const intensity = line.intensity ?? 1;
            const lineH = STRIP_H * Math.max(0.2, intensity);
            const lineY = stripTop + STRIP_H - lineH;
            const col = wavelengthToHex(line.wavelength);
            const labelRow = labelRows.get(i) ?? 0;

            return (
              <g key={i}>
                {mode === 'emission' ? (
                  <line
                    x1={x}
                    y1={lineY}
                    x2={x}
                    y2={stripTop + STRIP_H}
                    stroke={col}
                    strokeWidth={1.8}
                    opacity={0.85 + 0.15 * intensity}
                  />
                ) : (
                  // Absorption: dark cutout line
                  <line
                    x1={x}
                    y1={stripTop}
                    x2={x}
                    y2={stripTop + STRIP_H}
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth={2}
                  />
                )}
                {/* Line label above the strip — labels close enough to collide alternate onto
                    a further-back row (assignLabelRows) instead of overlapping. */}
                {line.label && (
                  <text
                    x={x}
                    y={stripTop - 4 - labelRow * LABEL_ROW_H}
                    textAnchor="middle"
                    className="ls-label"
                  >
                    {line.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis ticks + labels */}
          {axisTicks.map((wl) => {
            const x = xFor(wl);
            return (
              <g key={wl}>
                <line x1={x} y1={tickY} x2={x} y2={tickY + 4} className="ls-axis" />
                <text x={x} y={labelY} textAnchor="middle" className="ls-tick-lbl">
                  {wl}
                </text>
              </g>
            );
          })}

          {/* X-axis label */}
          <text x={W / 2} y={vbH - 2} textAnchor="middle" className="ls-axis-label">
            {elementLabel ?? 'Wavelength (nm)'}
          </text>
        </svg>
      </div>

      {caption && <p className="ls-caption">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
