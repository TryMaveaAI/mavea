import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FreebodyDiagramProps, FBDForce } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FreebodyDiagramProps & { delay?: number };

// Inside a viewBox a font-size is in USER UNITS, so a force label lands on screen at its authored
// size times the drawn width over W. The diagram is drawn as wide as the card allows (see
// .fbd-svg), which on a canvas card is well under W — so the box is kept tight and the arrows
// short, buying both the type size that clears the 9px legibility floor and the room between an
// arrowhead and the canvas edge that the label budget below is sized against.
const W = 400;
const H = 296;
const CX = W / 2; // center of the object
const CY = H / 2;
const BOX = 30; // half-size of the object box
const FORCE_LEN = 48; // base arrow length in viewBox units
const LABEL_GAP = 11; // distance from the arrowhead to the label block
const LINE_H = 13.5; // baseline-to-baseline advance inside a label block

// Convert a magnitude to a capped arrow length
const arrowLen = (mag: number | undefined) =>
  mag !== undefined ? Math.min(FORCE_LEN * 1.4, FORCE_LEN * Math.max(0.4, mag / 10)) : FORCE_LEN;

// Force labels sit at a fixed offset beyond the arrowhead with no wrap and no width check —
// a model-authored label longer than the demo fixture's ("Weight", "Normal") runs past the
// viewBox edge or collides with a neighbouring force's label/arrow. Cap it to a conservative
// character budget sized for the label font (see .fbd-lbl) and the room between the longest
// arrow's tip and the diagram edge — 92 units at the widest arrow, ~6 per character at
// .fbd-lbl's size — same idiom as PianoKeys/StoryArc/EtymTree.
const FORCE_LABEL_MAX_CHARS = 14;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** Arrowhead polygon at the tip of a force vector. */
function Head({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const len = 9,
    hw = 4.5;
  const bx = x - Math.cos(angle) * len;
  const by = y - Math.sin(angle) * len;
  const pa = angle + Math.PI / 2;
  return (
    <polygon
      points={[
        `${x},${y}`,
        `${bx + Math.cos(pa) * hw},${by + Math.sin(pa) * hw}`,
        `${bx - Math.cos(pa) * hw},${by - Math.sin(pa) * hw}`,
      ].join(' ')}
      fill={color}
    />
  );
}

/** A single force arrow: starts from the surface of the object and extends outward. */
function ForceArrow({ force, cx, cy }: { force: FBDForce; cx: number; cy: number }) {
  const col = force.color || 'var(--presence)';
  // angle is CCW from right in math degrees; SVG y is flipped → negate sin component
  const rad = (force.angle * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = -Math.sin(rad); // negate because SVG y increases downward

  // Start at the surface of the box in the arrow's direction
  const surfX = cx + cosA * BOX;
  const surfY = cy + sinA * BOX;
  const len = arrowLen(force.magnitude);
  const tipX = surfX + cosA * len;
  const tipY = surfY + sinA * len;
  const angle = Math.atan2(sinA, cosA);

  // Shorten the visible line end so it doesn't overlap the arrowhead
  const lx2 = tipX - cosA * 8;
  const ly2 = tipY - sinA * 8;

  // Label placed beyond the tip. The magnitude gets its own line rather than trailing the name:
  // side by side, a long name plus its value consumed more room than the gap between the arrowhead
  // and the canvas edge, and the diagram has vertical slack to spend where it has no horizontal.
  const lblX = tipX + cosA * LABEL_GAP;
  const lblY = tipY + sinA * LABEL_GAP;
  const hasMag = force.magnitude !== undefined;
  // Stack the block away from the arrow: an upward force's label grows above its anchor, a
  // downward one's below it, and a sideways one straddles it.
  const nameY = !hasMag || sinA > 0.2 ? lblY : sinA < -0.2 ? lblY - LINE_H : lblY - LINE_H / 2;

  return (
    <g>
      <line x1={surfX} y1={surfY} x2={lx2} y2={ly2} stroke={col} className="fbd-arrow" />
      <Head x={tipX} y={tipY} angle={angle} color={col} />
      <text
        x={lblX}
        y={nameY}
        fill={col}
        className="fbd-lbl"
        textAnchor={cosA > 0.2 ? 'start' : cosA < -0.2 ? 'end' : 'middle'}
        dominantBaseline={sinA < -0.2 ? 'auto' : sinA > 0.2 ? 'hanging' : 'middle'}
      >
        {force.label.length > FORCE_LABEL_MAX_CHARS && <title>{force.label}</title>}
        {truncate(force.label, FORCE_LABEL_MAX_CHARS)}
        {hasMag && (
          <tspan className="fbd-mag" x={lblX} y={nameY + LINE_H}>
            {force.magnitude} N
          </tspan>
        )}
      </text>
    </g>
  );
}

export function FreeBodyDiagram({
  title,
  icon = 'chart',
  iconColor = 'var(--insight)',
  object = 'Object',
  forces = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fbd-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="fbd-svg" role="img" aria-label={title}>
          {/* Force arrows (drawn behind the box) */}
          {forces.map((f, i) => (
            <ForceArrow key={i} force={f} cx={CX} cy={CY} />
          ))}

          {/* Central object — drawn on top of force arrow roots */}
          <rect x={CX - BOX} y={CY - BOX} width={BOX * 2} height={BOX * 2} className="fbd-box" />
          <text x={CX} y={CY} className="fbd-obj-lbl" textAnchor="middle" dominantBaseline="middle">
            {object}
          </text>
        </svg>
      </div>
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
