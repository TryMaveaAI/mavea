import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SeatingTable, SeatingChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SeatingChartProps & { delay?: number };

const PAD = 20;
const GAP = 30;
const SEAT_GAP = 15; // how far a seat dot sits outside its table's edge

// `tables[].seats` has no itemShapes entry beyond `label` to repair it, so a loose model
// reply can drop it entirely — every geometry helper below reads `safeSeats(t)` through this so a
// missing/non-finite count becomes an honest 0 rather than propagating NaN through footprint/
// radius math into a rendered total or an SVG viewBox.
function safeSeats(t: SeatingTable): number {
  return Number.isFinite(t.seats) ? Math.max(0, t.seats) : 0;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// A round table's radius grows with its seat count but caps out, and the per-seat dot shrinks
// a little past a dozen seats so a big table stays legible instead of its seats overlapping.
function roundRadius(seats: number): number {
  return Math.min(52, 24 + seats * 2.2);
}
function rectSize(seats: number): { w: number; h: number } {
  return { w: Math.min(150, 56 + seats * 5), h: 46 };
}
function seatRadius(seats: number): number {
  return Math.max(5, 9 - Math.max(0, seats - 12) * 0.15);
}

/** A table's bounding "footprint" radius — its own shape plus the seat dots ringed outside
 *  it — used to size auto-grid cells so no two tables' seats can ever overlap. */
function footprint(t: SeatingTable): number {
  if (t.shape === 'rect') {
    const { w, h } = rectSize(safeSeats(t));
    return Math.max(w, h) / 2 + SEAT_GAP + seatRadius(safeSeats(t));
  }
  return roundRadius(safeSeats(t)) + SEAT_GAP + seatRadius(safeSeats(t));
}

/** Walk clockwise around a rectangle's perimeter starting at the top-left corner, `along`
 *  units in, wrapping at the total perimeter. Distributes seats evenly by arc length so a
 *  longer side naturally gets proportionally more seats than a short one. */
function pointOnRectPerimeter(
  cx: number,
  cy: number,
  w: number,
  h: number,
  along: number,
): { x: number; y: number } {
  const halfW = w / 2,
    halfH = h / 2;
  const perim = 2 * (w + h);
  let d = ((along % perim) + perim) % perim;
  if (d <= w) return { x: cx - halfW + d, y: cy - halfH - SEAT_GAP };
  d -= w;
  if (d <= h) return { x: cx + halfW + SEAT_GAP, y: cy - halfH + d };
  d -= h;
  if (d <= w) return { x: cx + halfW - d, y: cy + halfH + SEAT_GAP };
  d -= w;
  return { x: cx - halfW - SEAT_GAP, y: cy + halfH - d };
}

function seatPosition(
  t: SeatingTable,
  cx: number,
  cy: number,
  seatIndex: number,
): { x: number; y: number } {
  const n = Math.max(1, safeSeats(t));
  if (t.shape === 'rect') {
    const { w, h } = rectSize(safeSeats(t));
    const perim = 2 * (w + h);
    return pointOnRectPerimeter(cx, cy, w, h, (seatIndex / n) * perim);
  }
  const r = roundRadius(safeSeats(t)) + SEAT_GAP;
  const a = (seatIndex / n) * Math.PI * 2 - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// Event floor plan: round or rectangular tables, auto-arranged on a grid when any table
// omits its x/y (mixing given and auto-placed tables would be ambiguous, so the whole floor
// falls back together), each seat plotted around its table by angle (round) or perimeter
// position (rect) and filled with the assigned guest's initials. An unassigned seat renders
// as a dashed, empty ring.
export function SeatingChart({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  venue,
  tables = [],
  assignments = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;

  const model = useMemo(() => {
    if (tables.length === 0) return null;

    const guestAt = new Map<string, string>();
    for (const a of assignments) guestAt.set(`${a.tableId}:${a.seatIndex}`, a.guest);

    const allHavePosition = tables.every((t) => t.x !== undefined && t.y !== undefined);
    const pos = new Map<string, { x: number; y: number }>();

    if (allHavePosition) {
      // Spread proportionally to table count so a sparse or dense floor both read cleanly,
      // while respecting the given RELATIVE arrangement (who's near whom).
      const xs = tables.map((t) => t.x!);
      const ys = tables.map((t) => t.y!);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs);
      const minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const cell = Math.max(...tables.map(footprint)) * 2 + GAP;
      const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
      const targetW = cols * cell;
      const targetH = Math.ceil(tables.length / cols) * cell;
      const maxR = Math.max(...tables.map(footprint));
      tables.forEach((t) => {
        pos.set(t.id, {
          x: PAD + maxR + ((t.x! - minX) / spanX) * targetW,
          y: PAD + maxR + ((t.y! - minY) / spanY) * targetH,
        });
      });
    } else {
      const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
      const maxR = Math.max(...tables.map(footprint));
      const cell = maxR * 2 + GAP;
      tables.forEach((t, i) => {
        const c = i % cols,
          r = Math.floor(i / cols);
        pos.set(t.id, { x: PAD + maxR + c * cell, y: PAD + maxR + r * cell });
      });
    }

    const maxR = Math.max(...tables.map(footprint));
    const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
    const rows = Math.ceil(tables.length / cols);
    const cell = maxR * 2 + GAP;
    const W = PAD * 2 + maxR * 2 + (cols - 1) * cell;
    const H = PAD * 2 + maxR * 2 + (rows - 1) * cell;

    const totalSeats = tables.reduce((s, t) => s + Math.max(0, safeSeats(t)), 0);
    const assignedSeats = assignments.length;

    return { pos, guestAt, W, H, totalSeats, assignedSeats };
  }, [tables, assignments]);

  if (!model) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div className="sc-note">No seating data was given.</div>
      </div>
    );
  }

  const { pos, guestAt, W, H, totalSeats, assignedSeats } = model;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sc-summary">
        {venue && <span className="sc-venue">{venue}</span>}
        <span className="sc-count tab-num">
          {assignedSeats} of {totalSeats} seated
        </span>
      </div>

      <div className="sc-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="sc-svg" role="img" aria-label={title}>
          {tables.map((t, ti) => {
            const p = pos.get(t.id);
            if (!p) return null;
            const isRect = t.shape === 'rect';
            const rr = roundRadius(safeSeats(t));
            const { w, h } = rectSize(safeSeats(t));
            const sr = seatRadius(safeSeats(t));
            const label = truncate(t.label, isRect ? 14 : 9);
            return (
              <g
                key={t.id}
                className="sc-table m-stagger-item m-scale-in"
                style={{ ['--i' as string]: ti } as CSSProperties}
              >
                <title>{t.label}</title>
                {isRect ? (
                  <rect
                    x={p.x - w / 2}
                    y={p.y - h / 2}
                    width={w}
                    height={h}
                    rx={6}
                    className="sc-table-shape"
                  />
                ) : (
                  <circle cx={p.x} cy={p.y} r={rr} className="sc-table-shape" />
                )}
                <text x={p.x} y={p.y + 3} textAnchor="middle" className="sc-table-label">
                  {label}
                </text>

                {Array.from({ length: Math.max(0, safeSeats(t)) }, (_, seatIndex) => {
                  const sp = seatPosition(t, p.x, p.y, seatIndex);
                  const guest = guestAt.get(`${t.id}:${seatIndex}`);
                  return (
                    <g key={seatIndex}>
                      {guest && <title>{guest}</title>}
                      <circle
                        cx={sp.x}
                        cy={sp.y}
                        r={sr}
                        className={guest ? 'sc-seat sc-seat--filled' : 'sc-seat sc-seat--empty'}
                      />
                      {guest && sr >= 6.5 && (
                        <text
                          x={sp.x}
                          y={sp.y + sr * 0.34}
                          textAnchor="middle"
                          className="sc-seat-initials"
                          style={{ fontSize: sr * 0.9 } as CSSProperties}
                        >
                          {initials(guest)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

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
