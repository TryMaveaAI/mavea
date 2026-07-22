import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BoardKind, GameBoardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GameBoardProps & { delay?: number };

// Default grid dimension per board: chess/checkers are 8×8, Go is 19×19, the generic grids 8.
const DEFAULT_SIZE: Record<BoardKind, number> = {
  chess: 8,
  checkers: 8,
  go: 19,
  hex: 8,
  grid: 8,
};

// The board is drawn in its own square coordinate space; this is the side of that space in user
// units. Cells, pieces, and arrows are all sized off it, so the figure stays to scale at any size.
const SPAN = 100;
const PAD = 6; // room for the rank/file gutter on chess/checkers

// A configurable abstract game board. Square boards (chess/checkers) draw alternating cells with
// pieces ON the squares; Go draws stones on the line INTERSECTIONS of a (size−1)² grid; hex draws a
// staggered offset grid; grid is a plain ruled field. Every cell rectangle, intersection point, and
// arrow endpoint is COMPUTED from `board` + `size` — the model supplies only what sits where.
export function GameBoard({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  board = 'chess',
  size,
  pieces,
  highlights,
  moves,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // A per-instance prefix so two boards in one answer don't share `gb-arr-0` marker ids.
  const uid = useId().replace(/:/g, '');

  const kind: BoardKind = DEFAULT_SIZE[board] ? board : 'chess';
  const n = Math.max(2, Math.min(25, Math.round(size ?? DEFAULT_SIZE[kind])));

  // Go places stones on the line intersections, so a step spans the gap between the (n-1) lines;
  // every other board addresses the n cells themselves, so a step is one cell wide.
  const intersection = kind === 'go';
  // The drawing area inside the gutter, and the size of one cell/step.
  const inner = SPAN - PAD * 2;
  const step = inner / (intersection ? n - 1 || 1 : n);

  // Centre of a cell/intersection in user space. For square boards a piece sits at the middle of
  // its square; for Go it sits exactly on the intersection point.
  const cx = (col: number) => PAD + (intersection ? col * step : (col + 0.5) * step);
  const cy = (row: number) => PAD + (intersection ? row * step : (row + 0.5) * step);

  const radius = step * (intersection ? 0.4 : 0.38);
  const stroke = Math.max(0.18, step * 0.03);

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

      <div className="gb-wrap">
        <svg viewBox={`0 0 ${SPAN} ${SPAN}`} className="gb-svg" role="img" aria-label={title}>
          {/* the board surface */}
          <rect x={PAD} y={PAD} width={inner} height={inner} className="gb-frame" />

          {/* checkerboard fill — chess + checkers alternate light/dark squares */}
          {(kind === 'chess' || kind === 'checkers') &&
            Array.from({ length: n * n }, (_, i) => {
              const row = Math.floor(i / n);
              const col = i % n;
              if ((row + col) % 2 === 0) return null; // light square = bare frame
              return (
                <rect
                  key={`sq-${i}`}
                  x={PAD + col * step}
                  y={PAD + row * step}
                  width={step}
                  height={step}
                  className="gb-dark"
                />
              );
            })}

          {/* ruled lines — Go draws on its n intersection lines, grid/hex rule the n+1 cell edges */}
          {(kind === 'go' || kind === 'grid' || kind === 'hex') &&
            Array.from({ length: intersection ? n : n + 1 }, (_, i) => {
              const at = PAD + i * step;
              return (
                <g key={`ln-${i}`}>
                  <line x1={at} y1={PAD} x2={at} y2={PAD + inner} className="gb-grid" />
                  <line x1={PAD} y1={at} x2={PAD + inner} y2={at} className="gb-grid" />
                </g>
              );
            })}

          {/* hex stagger — offset every other row's dots so the lattice reads as hexagonal */}
          {kind === 'hex' &&
            Array.from({ length: n * n }, (_, i) => {
              const row = Math.floor(i / n);
              const col = i % n;
              const offset = (row % 2) * step * 0.5;
              const px = PAD + (col + 0.5) * step + offset;
              if (px > PAD + inner) return null; // the shifted last column falls off the edge
              return (
                <circle
                  key={`hx-${i}`}
                  cx={px}
                  cy={PAD + (row + 0.5) * step}
                  r={step * 0.06}
                  className="gb-hexdot"
                />
              );
            })}

          {/* Go star points (hoshi) — the conventional 9 reference dots on a 19×19 board */}
          {kind === 'go' &&
            n === 19 &&
            [3, 9, 15].flatMap((r) =>
              [3, 9, 15].map((c) => (
                <circle
                  key={`star-${r}-${c}`}
                  cx={cx(c)}
                  cy={cy(r)}
                  r={step * 0.09}
                  className="gb-star"
                />
              )),
            )}

          {/* highlighted squares — a target, a threatened cell */}
          {highlights?.map((h, i) => {
            if (intersection) {
              return (
                <circle
                  key={`hl-${i}`}
                  cx={cx(h.col)}
                  cy={cy(h.row)}
                  r={radius * 1.25}
                  className="gb-hl-dot"
                />
              );
            }
            return (
              <rect
                key={`hl-${i}`}
                x={PAD + h.col * step}
                y={PAD + h.row * step}
                width={step}
                height={step}
                className="gb-hl"
              />
            );
          })}

          {/* pieces — a glyph or a short label, tinted by side */}
          {pieces.map((p, i) => {
            const px = cx(p.col);
            const py = cy(p.row);
            const glyph = p.glyph || p.label || '';
            return (
              <g key={`pc-${i}`} className={`gb-piece side-${p.side === 'b' ? 'b' : 'a'}`}>
                <circle cx={px} cy={py} r={radius} className="gb-disc" strokeWidth={stroke} />
                {glyph && (
                  <text
                    x={px}
                    y={py}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="gb-glyph"
                    style={{ fontSize: radius * 1.15 }}
                  >
                    {glyph}
                  </text>
                )}
              </g>
            );
          })}

          {/* move arrows — from one cell centre to another */}
          <defs>
            <marker
              id={`gb-arr-${uid}`}
              markerWidth="5"
              markerHeight="5"
              refX="3.5"
              refY="2.5"
              orient="auto"
            >
              <path d="M0,0 L0,5 L5,2.5 Z" className="gb-arrhead" />
            </marker>
          </defs>
          {moves?.map((m, i) => (
            <line
              key={`mv-${i}`}
              x1={cx(m.from[1])}
              y1={cy(m.from[0])}
              x2={cx(m.to[1])}
              y2={cy(m.to[0])}
              className="gb-move"
              strokeWidth={Math.max(0.6, step * 0.08)}
              markerEnd={`url(#gb-arr-${uid})`}
            />
          ))}
        </svg>
      </div>

      {caption && <div className="gb-caption">{caption}</div>}

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
