import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FreebodyDiagramProps, FBDForce } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FreebodyDiagramProps & { delay?: number };

const W = 420;
const H = 340;
const CX = 210; // center of the object
const CY = 165;
const BOX = 34; // half-size of the object box
const FORCE_LEN = 70; // base arrow length in SVG pixels

// Convert a magnitude to a capped arrow length
const arrowLen = (mag: number | undefined) =>
  mag !== undefined ? Math.min(FORCE_LEN * 1.4, FORCE_LEN * Math.max(0.4, mag / 10)) : FORCE_LEN;

// Force labels sit at a fixed offset beyond the arrowhead with no wrap and no width check —
// a model-authored label longer than the demo fixture's ("Weight", "Normal") runs past the
// viewBox edge or collides with a neighbouring force's label/arrow. Cap it to a conservative
// character budget sized for the label font (9.5px, see .fbd-lbl) and the room between the
// tip and the diagram edge, same idiom as PianoKeys/StoryArc/EtymTree.
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

  // Label placed beyond the tip
  const lblX = tipX + cosA * 11;
  const lblY = tipY + sinA * 11;

  return (
    <g>
      <line x1={surfX} y1={surfY} x2={lx2} y2={ly2} stroke={col} className="fbd-arrow" />
      <Head x={tipX} y={tipY} angle={angle} color={col} />
      <text
        x={lblX}
        y={lblY}
        fill={col}
        className="fbd-lbl"
        textAnchor={cosA > 0.2 ? 'start' : cosA < -0.2 ? 'end' : 'middle'}
        dominantBaseline={sinA < -0.2 ? 'auto' : sinA > 0.2 ? 'hanging' : 'middle'}
      >
        {force.label.length > FORCE_LABEL_MAX_CHARS && <title>{force.label}</title>}
        {truncate(force.label, FORCE_LABEL_MAX_CHARS)}
        {force.magnitude !== undefined && <tspan className="fbd-mag"> ({force.magnitude} N)</tspan>}
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
