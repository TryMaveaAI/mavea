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
// Inside a viewBox a font-size is a SHARE OF THE FIGURE, not a pixel count: this diagram renders
// ~320px wide in a half-width card, so a unit lands at ~0.63px there and the HTML fluid ramp
// (--fs-2xs floors at 9px) drew every label at 5.6px — under the ~9px legibility floor. Type
// large enough to read has to be paid for in layout, which sets the two asymmetries below:
//  · the N/S boxes run wider than the E/W pair, because nothing else shares their row while E/W
//    has to split its row with the hub. The longest slot names ("Threat of new entrants") are
//    N/S, so that is also where the width is needed.
//  · the vertical arm is longer than the horizontal one, because a box is taller than the gap a
//    cardinal neighbour leaves — RADIUS_V has to clear a full box height, RADIUS_H a hub radius.
const VB_W = 512;
const HUB_R = 62;
const BOX_W_MAIN = 240; // N/S
const BOX_W_SIDE = 160; // E/W
// A box's height is computed from its own wrapped content (see `boxHeight`) rather than a
// fixed constant: a satellite with a two-line label AND a three-line note needs real room the
// short/no-note case doesn't, and a fixed height either clipped the long case or wasted the
// short one.
const SLOT_H = 25; // slot-label strip at the top
const LABEL_LINE_H = 22;
const NOTE_LINE_H = 20;
const STRENGTH_ROW_H = 25; // bottom strip reserved for the strength badge
const BOX_PAD_BOTTOM = 10;
const MAX_LABEL_LINES = 2;
const MAX_NOTE_LINES = 3;

function boxHeight(labelLines: number, noteLines: number): number {
  const noteH = noteLines > 0 ? noteLines * NOTE_LINE_H + 4 : 0;
  return SLOT_H + labelLines * LABEL_LINE_H + noteH + STRENGTH_ROW_H + BOX_PAD_BOTTOM;
}

/** Tallest a box can get, i.e. every wrap budget spent. The arms are laid out against it so the
 *  figure holds together for whatever the entries actually say, not just the short case. */
const MAX_BOX_H = boxHeight(MAX_LABEL_LINES, MAX_NOTE_LINES);
/** Clear space a connector crosses, between the two shapes it joins. */
const ARM_GAP = 26;
const RADIUS_H = HUB_R + ARM_GAP + BOX_W_SIDE / 2; // hub centre → E/W box centre
const RADIUS_V = MAX_BOX_H + ARM_GAP; // hub centre → N/S box centre
const VB_MARGIN = 9; // breathing room outside the outermost box edge
const VB_H = (RADIUS_V + MAX_BOX_H / 2 + VB_MARGIN) * 2;
const CX = VB_W / 2;
const CY = VB_H / 2;

/** Wrap budgets in characters, per box width. Sized off the widest a line can get at the font
 *  sizes in styles.css (~0.6em per character for the bold label, ~0.55em for the note, plus the
 *  one character `wrap` may add back as an ellipsis) so a long real label stays inside its own
 *  box instead of only the fixture's short ones. */
const WRAP_MAIN = { label: 22, note: 25 };
const WRAP_SIDE = { label: 14, note: 16 };
/** Widest the hub's industry caption can run and still sit inside the circle at its baseline —
 *  a chord, not the full diameter, since the caption sits below the centre. */
const HUB_SUB_CHARS = 12;

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
  w: number;
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
    const onSideArm = dx !== 0;
    const w = onSideArm ? BOX_W_SIDE : BOX_W_MAIN;
    const budget = onSideArm ? WRAP_SIDE : WRAP_MAIN;
    const labelLines = wrap(entry.label, budget.label, MAX_LABEL_LINES);
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    const noteLines = note ? wrap(note, budget.note, MAX_NOTE_LINES) : [];
    const h = boxHeight(labelLines.length, noteLines.length);
    const boxCx = CX + dx * RADIUS_H;
    const boxCy = CY + dy * RADIUS_V;
    return {
      id,
      entry,
      strength,
      dx,
      dy,
      boxCx,
      boxCy,
      w,
      h,
      labelLines,
      noteLines,
      hub: { x: CX + dx * HUB_R, y: CY + dy * HUB_R },
      // The box is axis-aligned and sits on a purely cardinal axis from the hub, so the near
      // edge facing the hub is just the box centre pulled back by half its own footprint —
      // no rim-trim approximation needed (that machinery exists for arbitrary-angle layouts).
      // E/W pulls back by half the box width, N/S by half its OWN computed height.
      rim: { x: boxCx - dx * (w / 2), y: boxCy - dy * (h / 2) },
    };
  }).filter((s): s is Satellite => s !== null);

  const industryLabel = wrap((industry || 'this market').trim(), HUB_SUB_CHARS, 1)[0];

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
          viewBox={`0 0 ${VB_W} ${VB_H}`}
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
          <text x={CX} y={CY - 22} textAnchor="middle" className="ff-hub-title">
            Industry
          </text>
          <text x={CX} y={CY - 1} textAnchor="middle" className="ff-hub-title">
            Rivalry
          </text>
          <text x={CX} y={CY + 19} textAnchor="middle" className="ff-hub-sub">
            {industryLabel}
          </text>
          {rivalryStrength && (
            <text
              x={CX}
              y={CY + 38}
              textAnchor="middle"
              className="ff-strength"
              style={{ fill: STRENGTH_COLOR[rivalryStrength] }}
            >
              {STRENGTH_LABEL[rivalryStrength]}
            </text>
          )}

          {/* satellites */}
          {satellites.map((s) => {
            const x = s.boxCx - s.w / 2;
            const y = s.boxCy - s.h / 2;
            const labelTop = y + SLOT_H + LABEL_LINE_H - 4;
            return (
              <g key={s.id}>
                <rect
                  x={x}
                  y={y}
                  width={s.w}
                  height={s.h}
                  rx={12}
                  className="ff-box"
                  style={{ stroke: STRENGTH_COLOR[s.strength] }}
                />
                <rect x={x} y={y} width={4} height={s.h} rx={2} fill={STRENGTH_COLOR[s.strength]} />
                <text x={s.boxCx} y={y + 19} textAnchor="middle" className="ff-slot-lbl">
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
                  x={x + s.w - 12}
                  y={y + s.h - BOX_PAD_BOTTOM - 2}
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
