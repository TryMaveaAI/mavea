import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { CutListProps, CutPart } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CutListProps & { delay?: number };

// Fills for the packed parts — the same calm cycle FloorPlan uses, so the two read as one family.
const PART_FILLS = [
  'color-mix(in oklab, var(--presence) 14%, transparent)',
  'color-mix(in oklab, var(--insight) 14%, transparent)',
  'color-mix(in oklab, var(--warning) 16%, transparent)',
  'color-mix(in oklab, var(--presence) 8%, transparent)',
  'color-mix(in oklab, var(--insight) 8%, transparent)',
];
const PART_STROKES = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

interface Placed {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ci: number;
}

// A part label is centered in a rect whose width shrinks with the sheet's own packing, so a long
// name ("Cabinet Side Panel A") or a small piece can run past the rect's edges — the same overrun
// TamSam/Treemap/FloorPlan/SportsPitch hit with author-supplied text. Budget a character count
// from the rect's own width at the label's actual font-size (~0.6 × font-size average glyph
// advance) and truncate with an ellipsis, keeping the full label as a native <title> tooltip so
// it's never silently lost, only visually shortened.
const CUT_LABEL_CHAR_ADVANCE = 0.6;
function truncateCutLabel(text: string, boxW: number, fontSize: number): string {
  const max = Math.max(3, Math.floor(boxW / (fontSize * CUT_LABEL_CHAR_ADVANCE)));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// A material cut list + nesting layout. Each authored part (label · w×h · qty) becomes one or
// more rectangles packed onto the stock sheet: an authored x/y is honoured, otherwise a simple
// left-to-right shelf-pack places it. The leftover area is highlighted and the yield (used area ÷
// sheet area) is computed — never invented. The parts table sits beside the nesting figure.
export function CutList({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  stock,
  parts,
  unit = 'mm',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const sheetW = Math.max(1, stock.w);
  const sheetH = Math.max(1, stock.h);
  const placed = packParts(parts, sheetW, sheetH);

  // Yield: total placed area over the sheet area. Computed from the laid-out rectangles, so it
  // honestly reflects what actually fit (a part that overran the sheet is dropped, not counted).
  const usedArea = placed.reduce((s, p) => s + p.w * p.h, 0);
  const sheetArea = sheetW * sheetH;
  const yieldPct = Math.round((usedArea / sheetArea) * 100);

  // The figure is drawn in sheet units directly (a viewBox), so the nesting is exactly to scale.
  const PAD = 4;
  const vbW = sheetW + PAD * 2;
  const vbH = sheetH + PAD * 2;

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

      <div className="cut-grid">
        <div className="cut-tablewrap">
          <table className="cut-table">
            <thead>
              <tr>
                <th>Part</th>
                <th className="cut-num">Size</th>
                <th className="cut-num">Qty</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={i}>
                  <td>
                    <span
                      className="cut-swatch"
                      style={{ background: PART_STROKES[i % PART_STROKES.length] }}
                    />
                    <span className="cut-label">{p.label}</span>
                  </td>
                  <td className="cut-num cut-mono">
                    {formatValue(p.w)} × {formatValue(p.h)}
                  </td>
                  <td className="cut-num cut-mono">{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="cut-stats">
            <div className="cut-stat">
              <span className="cut-stat-k">Sheet</span>
              <span className="cut-stat-v">
                {formatValue(sheetW)} × {formatValue(sheetH)} {unit}
              </span>
            </div>
            <div className="cut-stat">
              <span className="cut-stat-k">Yield</span>
              <span className="cut-stat-v cut-yield" data-low={yieldPct < 60 ? '' : undefined}>
                {yieldPct}%
              </span>
            </div>
          </div>
        </div>

        <div className="cut-figwrap">
          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="cut-svg" role="img" aria-label={title}>
            {/* the stock sheet */}
            <rect x={PAD} y={PAD} width={sheetW} height={sheetH} className="cut-sheet" />
            {placed.map((p, i) => {
              const stroke = PART_STROKES[p.ci % PART_STROKES.length];
              const fill = PART_FILLS[p.ci % PART_FILLS.length];
              const small = Math.min(p.w, p.h) < sheetW * 0.12;
              return (
                <g key={i}>
                  <rect
                    x={PAD + p.x}
                    y={PAD + p.y}
                    width={p.w}
                    height={p.h}
                    rx={Math.min(2, sheetW * 0.006)}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={sheetW * 0.0028}
                    {...(i === 0 ? { 'data-mark': 'circle' } : {})}
                  />
                  {!small &&
                    (() => {
                      const fontSize = Math.max(sheetW * 0.022, 10);
                      const shortLabel = truncateCutLabel(p.label, p.w - fontSize * 0.5, fontSize);
                      const isTruncated = shortLabel !== p.label;
                      return (
                        <text
                          x={PAD + p.x + p.w / 2}
                          y={PAD + p.y + p.h / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="cut-piece-lbl"
                          style={{ fontSize }}
                        >
                          {isTruncated && <title>{p.label}</title>}
                          {shortLabel}
                        </text>
                      );
                    })()}
                </g>
              );
            })}
            {stock.label && (
              <text x={PAD + 2} y={PAD - 1.2} className="cut-sheet-lbl">
                {stock.label}
              </text>
            )}
          </svg>
        </div>
      </div>

      {caption && <div className="cut-caption">{caption}</div>}

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

// Place every part instance on the sheet. An authored x/y on the FIRST instance of a part anchors
// it (the qty copies tile to its right on the same row); parts without coordinates shelf-pack into
// the remaining space — left to right, wrapping to a new shelf when a row fills, tracking the row's
// max height. A piece that cannot fit the sheet at all is dropped (so the yield stays honest).
function packParts(parts: CutPart[], sheetW: number, sheetH: number): Placed[] {
  const out: Placed[] = [];
  const gap = sheetW * 0.008;
  let cx = 0; // current shelf cursor x
  let cy = 0; // current shelf cursor y (top of the active shelf)
  let rowH = 0; // tallest piece on the active shelf

  parts.forEach((p, ci) => {
    const qty = Math.max(1, p.qty);
    for (let q = 0; q < qty; q++) {
      // An explicit placement is honoured for the first instance; copies flow from it.
      if (p.x != null && p.y != null && q === 0) {
        out.push({ label: p.label, x: p.x, y: p.y, w: p.w, h: p.h, ci });
        // Resume the shelf cursor past this anchored piece so the pack doesn't overlap it.
        cx = p.x + p.w + gap;
        cy = p.y;
        rowH = p.h;
        continue;
      }
      // Wrap to a new shelf when the piece would overrun the sheet width.
      if (cx + p.w > sheetW) {
        cx = 0;
        cy += rowH + gap;
        rowH = 0;
      }
      // Drop a piece that can't fit the sheet vertically — keeps yield honest.
      if (cy + p.h > sheetH || p.w > sheetW) continue;
      out.push({ label: p.label, x: cx, y: cy, w: p.w, h: p.h, ci });
      cx += p.w + gap;
      rowH = Math.max(rowH, p.h);
    }
  });

  return out;
}
