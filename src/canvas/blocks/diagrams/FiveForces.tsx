// FiveForces — Porter's Five Forces: a central "Industry Rivalry" hub with four satellite
// forces ringed at the compass points, the same angle-based radial placement FreeBodyDiagram
// uses for its own force arrows. Connector thickness and color track each force's rated
// strength, so the forces squeezing the industry hardest read at a glance. Every satellite
// sits at a FIXED compass slot keyed by its id — new entrants arrive from outside (top),
// suppliers feed in from the left, buyers sit where value flows out (right), substitutes
// undercut from below — so the figure reads identically no matter how a model orders its
// `forces` array, and an entry with a missing/unrecognized id is simply dropped rather than
// guessed into a slot.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FiveForcesProps, FiveForceEntry, FiveForceId, ForceStrength } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FiveForcesProps & { delay?: number };

// --- viewBox geometry (units; the SVG scales to fit via width:100% in CSS) ---
// tall enough that the E/W satellite boxes (RADIUS + BOX_W/2 = 254 past center) never clip
const VB = 512;
const CX = VB / 2;
const CY = VB / 2;
const HUB_R = 62;
const BOX_W = 152;
const RADIUS = 178; // hub centre → satellite centre — independent of box height
// A box's height is computed from its own wrapped content (see `boxHeight`) rather than a
// fixed constant: a satellite with a two-line label AND a two-line note needs real room the
// short/no-note case doesn't, and a fixed height either clipped the long case or wasted the
// short one.
const SLOT_H = 16; // slot-label strip at the top
const LABEL_LINE_H = 15;
const NOTE_LINE_H = 12;
const STRENGTH_ROW_H = 16; // bottom strip reserved for the strength badge
const BOX_PAD_BOTTOM = 8;

function boxHeight(labelLines: number, noteLines: number): number {
  const noteH = noteLines > 0 ? noteLines * NOTE_LINE_H + 4 : 0;
  return SLOT_H + labelLines * LABEL_LINE_H + noteH + STRENGTH_ROW_H + BOX_PAD_BOTTOM;
}

type SatelliteId = Exclude<FiveForceId, 'rivalry'>;

const SLOT: Record<SatelliteId, { dx: number; dy: number }> = {
  newEntrants: { dx: 0, dy: -1 },
  suppliers: { dx: -1, dy: 0 },
  buyers: { dx: 1, dy: 0 },
  substitutes: { dx: 0, dy: 1 },
};
const SLOT_ORDER: SatelliteId[] = ['newEntrants', 'suppliers', 'buyers', 'substitutes'];
const SLOT_LABEL: Record<SatelliteId, string> = {
  newEntrants: 'Threat of new entrants',
  suppliers: 'Supplier power',
  buyers: 'Buyer power',
  substitutes: 'Threat of substitutes',
};

const STRENGTH_COLOR: Record<ForceStrength, string> = {
  low: 'var(--text-faint)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
};
const STRENGTH_WIDTH: Record<ForceStrength, number> = { low: 2, medium: 3.5, high: 5.5 };
const STRENGTH_LABEL: Record<ForceStrength, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const VALID_STRENGTH = new Set<ForceStrength>(['low', 'medium', 'high']);

/** A missing/mistyped strength reads as `medium` — the middle of the scale, never a silent
 *  zero-width connector. */
function safeStrength(s: unknown): ForceStrength {
  return VALID_STRENGTH.has(s as ForceStrength) ? (s as ForceStrength) : 'medium';
}

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        truncated = true;
        cur = '';
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length) {
    const li = lines.length - 1;
    let last = lines[li];
    if (last.length > perLine) last = last.slice(0, perLine - 1).trimEnd();
    if (truncated || lines[li].length > perLine) last = last.replace(/[…\s]*$/, '') + '…';
    lines[li] = last;
  }
  return lines.length ? lines : [''];
}

interface Satellite {
  id: SatelliteId;
  entry: FiveForceEntry;
  strength: ForceStrength;
  dx: number;
  dy: number;
  boxCx: number;
  boxCy: number;
  h: number;
  labelLines: string[];
  noteLines: string[];
  hub: { x: number; y: number };
  rim: { x: number; y: number };
}

export function FiveForces({
  title,
  icon = 'chart',
  iconColor = 'var(--warning)',
  industry,
  forces,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const safeForces = Array.isArray(forces) ? forces : [];

  // First entry wins per id — a duplicate/malformed id never overwrites an already-placed slot.
  const byId = new Map<FiveForceId, FiveForceEntry>();
  for (const f of safeForces) {
    if (!f || typeof f !== 'object') continue;
    const id = (f as FiveForceEntry).id;
    if (typeof id === 'string' && !byId.has(id as FiveForceId)) byId.set(id as FiveForceId, f);
  }

  const rivalry = byId.get('rivalry');
  const rivalryStrength =
    rivalry && VALID_STRENGTH.has(rivalry.strength) ? safeStrength(rivalry.strength) : null;

  const satellites: Satellite[] = SLOT_ORDER.map((id) => {
    const entry = byId.get(id);
    if (!entry || typeof entry.label !== 'string' || !entry.label.trim()) return null;
    const { dx, dy } = SLOT[id];
    const strength = safeStrength(entry.strength);
    const labelLines = wrap(entry.label, 19, 2);
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    const noteLines = note ? wrap(note, 24, 2) : [];
    const h = boxHeight(labelLines.length, noteLines.length);
    const boxCx = CX + dx * RADIUS;
    const boxCy = CY + dy * RADIUS;
    return {
      id,
      entry,
      strength,
      dx,
      dy,
      boxCx,
      boxCy,
      h,
      labelLines,
      noteLines,
      hub: { x: CX + dx * HUB_R, y: CY + dy * HUB_R },
      // The box is axis-aligned and sits on a purely cardinal axis from the hub, so the near
      // edge facing the hub is just the box centre pulled back by half its own footprint —
      // no rim-trim approximation needed (that machinery exists for arbitrary-angle layouts).
      // Width is fixed so this only matters for E/W; N/S use each box's OWN computed height.
      rim: { x: boxCx - dx * (BOX_W / 2), y: boxCy - dy * (h / 2) },
    };
  }).filter((s): s is Satellite => s !== null);

  const industryLabel = wrap((industry || 'this market').trim(), 15, 1)[0];

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage ff-stage">
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="dg-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* connectors first, so the hub + boxes sit on top of where they meet */}
          {satellites.map((s) => (
            <line
              key={`c-${s.id}`}
              x1={s.hub.x}
              y1={s.hub.y}
              x2={s.rim.x}
              y2={s.rim.y}
              className="ff-link"
              style={{
                stroke: STRENGTH_COLOR[s.strength],
                strokeWidth: STRENGTH_WIDTH[s.strength],
              }}
            />
          ))}

          {/* hub */}
          <circle
            cx={CX}
            cy={CY}
            r={HUB_R}
            className="ff-hub"
            style={rivalryStrength ? { stroke: STRENGTH_COLOR[rivalryStrength] } : undefined}
          />
          <text x={CX} y={CY - 12} textAnchor="middle" className="ff-hub-title">
            Industry
          </text>
          <text x={CX} y={CY + 6} textAnchor="middle" className="ff-hub-title">
            Rivalry
          </text>
          <text x={CX} y={CY + 26} textAnchor="middle" className="ff-hub-sub">
            {industryLabel}
          </text>
          {rivalryStrength && (
            <text
              x={CX}
              y={CY + 42}
              textAnchor="middle"
              className="ff-strength"
              style={{ fill: STRENGTH_COLOR[rivalryStrength] }}
            >
              {STRENGTH_LABEL[rivalryStrength]}
            </text>
          )}

          {/* satellites */}
          {satellites.map((s) => {
            const x = s.boxCx - BOX_W / 2;
            const y = s.boxCy - s.h / 2;
            const labelTop = y + SLOT_H + LABEL_LINE_H - 4;
            return (
              <g key={s.id}>
                <rect
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={s.h}
                  rx={12}
                  className="ff-box"
                  style={{ stroke: STRENGTH_COLOR[s.strength] }}
                />
                <rect x={x} y={y} width={4} height={s.h} rx={2} fill={STRENGTH_COLOR[s.strength]} />
                <text x={s.boxCx} y={y + 15} textAnchor="middle" className="ff-slot-lbl">
                  {SLOT_LABEL[s.id]}
                </text>
                <text textAnchor="middle" className="ff-box-lbl">
                  {s.labelLines.map((ln, i) => (
                    <tspan key={i} x={s.boxCx} y={labelTop + i * LABEL_LINE_H}>
                      {ln}
                    </tspan>
                  ))}
                </text>
                {s.noteLines.length > 0 && (
                  <text textAnchor="middle" className="ff-box-note">
                    {s.noteLines.map((ln, i) => (
                      <tspan
                        key={i}
                        x={s.boxCx}
                        y={labelTop + s.labelLines.length * LABEL_LINE_H + 3 + i * NOTE_LINE_H}
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>
                )}
                <text
                  x={x + BOX_W - 10}
                  y={y + s.h - 9}
                  textAnchor="end"
                  className="ff-strength"
                  style={{ fill: STRENGTH_COLOR[s.strength] }}
                >
                  {STRENGTH_LABEL[s.strength]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
