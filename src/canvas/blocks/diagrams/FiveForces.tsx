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
import {
  BOX_PAD_BOTTOM,
  BOX_W_MAIN,
  BOX_W_SIDE,
  HUB_R,
  LABEL_LINE_H,
  NOTE_LINE_H,
  SLOT_H,
  VB_W,
  boxText,
  forceFrame,
  hubLayout,
} from './fiveForcesLayout';

type Props = FiveForcesProps & { delay?: number };

// --- viewBox geometry (units; the SVG scales to fit via width:100% in CSS) ---
// Inside a viewBox a font-size is a SHARE OF THE FIGURE, not a pixel count: this diagram renders
// ~320px wide in a half-width card, so a unit lands at ~0.63px there and the HTML fluid ramp
// (--fs-2xs floors at 9px) drew every label at 5.6px — under the ~9px legibility floor. Type
// large enough to read has to be paid for in layout, which is why the N/S boxes run wider than
// the E/W pair: nothing else shares their row, while E/W split theirs with the hub. The longest
// slot names ("Threat of new entrants") are N/S, so that is also where the width is needed. The
// boxes and the frame are measured from their own text in fiveForcesLayout.

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
  /** The note as written, kept for the tooltip when a line had to be cut. */
  note: string;
  cut: boolean;
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

  // Measure every box first: the frame is built around the boxes it actually has to hold.
  const measured = SLOT_ORDER.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry || typeof entry.label !== 'string' || !entry.label.trim()) return [];
    const { dx, dy } = SLOT[id];
    const w = dx !== 0 ? BOX_W_SIDE : BOX_W_MAIN;
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    return [{ id, entry, dx, dy, w, note, ...boxText(entry.label.trim(), note, w) }];
  });
  const sides = measured.filter((m) => m.dx !== 0).map((m) => m.h);
  const frame = forceFrame({
    n: measured.find((m) => m.dy < 0)?.h,
    s: measured.find((m) => m.dy > 0)?.h,
    side: sides.length ? Math.max(...sides) : undefined,
  });
  const VB_H = frame.vbH;
  const CX = VB_W / 2;
  const CY = frame.cy;

  const satellites: Satellite[] = measured.map((m) => {
    const { dx, dy, w, h } = m;
    const boxCx = CX + dx * frame.radiusH;
    const boxCy = dy === 0 ? CY : CY + dy * (frame.reachV + h / 2);
    return {
      ...m,
      strength: safeStrength(m.entry.strength),
      boxCx,
      boxCy,
      hub: { x: CX + dx * HUB_R, y: CY + dy * HUB_R },
      // The box is axis-aligned and sits on a purely cardinal axis from the hub, so the near
      // edge facing the hub is just the box centre pulled back by half its own footprint —
      // no rim-trim approximation needed (that machinery exists for arbitrary-angle layouts).
      rim: { x: boxCx - dx * (w / 2), y: boxCy - dy * (h / 2) },
    };
  });

  const hub = hubLayout(industry ?? '');

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
          <text x={CX} y={CY + hub.titleY[0]} textAnchor="middle" className="ff-hub-title">
            Industry
          </text>
          <text x={CX} y={CY + hub.titleY[1]} textAnchor="middle" className="ff-hub-title">
            Rivalry
          </text>
          <text textAnchor="middle" className="ff-hub-sub">
            {industry && hub.sub.at(-1)?.endsWith('…') && <title>{industry}</title>}
            {hub.sub.map((ln, k) => (
              <tspan key={k} x={CX} y={CY + hub.subY[k]}>
                {ln}
              </tspan>
            ))}
          </text>
          {rivalryStrength && (
            <text
              x={CX}
              y={CY + hub.strengthY}
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
                >
                  {s.cut && (
                    <title>{s.note ? `${s.entry.label.trim()}: ${s.note}` : s.entry.label}</title>
                  )}
                </rect>
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
