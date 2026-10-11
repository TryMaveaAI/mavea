// Cycle wheel — an illustrated closed loop. The stages ring a circle (the first sits
// at the top and the rest run clockwise), each a node carrying a glyph, a label, and an
// optional caption, and curved arrows flow one stage into the next and finally back to the
// start — because the loop never ending is the whole point. Every position is COMPUTED from
// the stage count: a node's centre is (cos/sin) around the ring, and each connector is an arc
// concentric with that ring (offset outward by a fixed bow), so the arrows always read as a
// rotation and never cut across the middle. The model supplies only the stages.
// Use for the water cycle, a butterfly/cell life cycle, the carbon/nitrogen/rock cycle.
import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CycleWheelProps, CycleStage } from './types';
import { richInnerHtml } from '../../../lib/richText';
import {
  ASCENT,
  CAP_OFFSET,
  CLH,
  LABEL_GAP,
  LH,
  NODE_R,
  RING_R,
  frameFor,
  sideOf,
  stageText,
} from './cycleWheelLayout';
import type { Side } from './cycleWheelLayout';

type Props = CycleWheelProps & { delay?: number };

// --- viewBox geometry (units; the SVG scales to fit via width:100% in CSS) ---
// The canvas is LANDSCAPE: the ring sits centred with a label gutter reserved on each side, so
// the labels that radiate outward from the edge nodes live *inside* the viewBox and never clip.
// The ring and label metrics live in cycleWheelLayout; the frame around them is sized here.
const GLYPH = 30; // node glyph box (sub-SVG side)

const LABEL_W = 158; // horizontal room reserved for a label/caption beside each node

const VBW = 2 * (RING_R + NODE_R + LABEL_GAP + LABEL_W); // wide enough for ring + a gutter each side
const CX = VBW / 2; // ring centre x

const ARC_GAP = 0.26; // radians trimmed off each connector end so it clears the node discs
const ARC_BOW = 22; // how far outside the ring each connector arc bows, for an airy loop
const ARROW = 9; // arrowhead half-length

interface Placed {
  stage: CycleStage;
  /** node centre in viewBox units */
  cx: number;
  cy: number;
  /** the angle (radians) of the node on the ring, measured from +x */
  ang: number;
  /** which way the label reads out from the disc */
  side: Side;
}

/** Place the stages evenly around the ring, the first at 12 o'clock and the rest clockwise,
 *  so a process reads the way a clock does. Pure: positions are a function of the count alone. */
function placeStages(stages: CycleStage[], cy: number): Placed[] {
  const n = Math.max(1, stages.length);
  return stages.map((stage, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      stage,
      cx: CX + Math.cos(ang) * RING_R,
      cy: cy + Math.sin(ang) * RING_R,
      ang,
      side: sideOf(ang),
    };
  });
}

/** A point on the ring at a given angle, pushed out by `bow` so the connector arcs sit just
 *  outside the node discs. */
function ringPoint(ang: number, bow: number, cy: number): { x: number; y: number } {
  const r = RING_R + bow;
  return { x: CX + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
}

export function CycleWheel({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  stages,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  // arrowhead markers must be unique per instance so two wheels on one canvas don't recolor
  // each other's arrows
  const uid = useId().replace(/:/g, '');
  const { cy, vbh } = frameFor(stages);
  const placed = placeStages(stages, cy);
  const n = placed.length;

  return (
    <div
      className="card reveal dg-cw-card"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="dg-cw-stage">
        <svg
          className="dg-cw-svg"
          viewBox={`0 0 ${VBW} ${vbh}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title ?? 'Cycle'}
        >
          <defs>
            <marker
              id={`dg-cw-arrow-${uid}`}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth={ARROW}
              markerHeight={ARROW}
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="dg-cw-arrowfill" />
            </marker>
          </defs>

          {/* the faint guide ring the loop turns around */}
          <circle className="dg-cw-ring" cx={CX} cy={cy} r={RING_R} />

          {/* connectors first, so the node discs sit on top of where the arcs meet them */}
          {placed.map((p, i) => {
            const next = placed[(i + 1) % n];
            // a single stage has no loop to draw; with two, the arc still closes the round-trip
            if (n < 2) return null;
            return <Connector key={`c${i}`} from={p} to={next} uid={uid} cy={cy} />;
          })}

          {placed.map((p, i) => (
            <Node key={`n${i}`} placed={p} index={i} />
          ))}
        </svg>
      </div>

      {caption && <p className="dg-cw-cap">{caption}</p>}
      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}

/** A curved arrow from one node to the next, drawn as an arc concentric with the ring (bowed
 *  outward) and trimmed at both ends so it springs from one disc's rim and lands on the next's. */
function Connector({ from, to, uid, cy }: { from: Placed; to: Placed; uid: string; cy: number }) {
  // walk the shorter way round the circle from `from` to `to`
  let delta = to.ang - from.ang;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  const dir = delta >= 0 ? 1 : -1;

  const start = ringPoint(from.ang + ARC_GAP * dir, ARC_BOW, cy);
  const end = ringPoint(to.ang - ARC_GAP * dir, ARC_BOW, cy);
  const r = RING_R + ARC_BOW;
  // sweep-flag follows the travel direction; large-arc only if the gap exceeds a half-turn
  const large = Math.abs(delta) - ARC_GAP * 2 > Math.PI ? 1 : 0;
  const sweep = dir > 0 ? 1 : 0;

  return (
    <path
      className="dg-cw-link"
      d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`}
      markerEnd={`url(#dg-cw-arrow-${uid})`}
    />
  );
}

/** One stage node: a tinted disc with a glyph (or a numbered token when no icon is given),
 *  the label radiating outward, and an optional caption under it. Beside the disc on the
 *  flanks (anchors flip on the left so every label reads away from the centre), and centred
 *  above or below it at the top and bottom, where the arcs run past both sides. */
function Node({ placed, index }: { placed: Placed; index: number }) {
  const { stage, cx, cy, side } = placed;
  const Glyph = stage.icon ? Icon[stage.icon] : undefined;
  const { labelLines, capLines, span } = stageText(stage);
  const reach = NODE_R + LABEL_GAP;
  const labelX = side === 'left' ? cx - reach : side === 'right' ? cx + reach : cx;
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
  // Beside the disc the block is centred on it; above or below, it stacks away from the rim.
  const firstBaseline =
    side === 'top'
      ? cy - reach - span
      : side === 'bottom'
        ? cy + reach + ASCENT
        : cy - span / 2 + 4;
  const capBaseline = firstBaseline + (labelLines.length - 1) * LH + CAP_OFFSET;

  return (
    <g className="dg-cw-node">
      <circle className="dg-cw-disc" cx={cx} cy={cy} r={NODE_R} />
      {Glyph ? (
        <Glyph
          x={cx - GLYPH / 2}
          y={cy - GLYPH / 2}
          width={GLYPH}
          height={GLYPH}
          className="dg-cw-glyph"
        />
      ) : (
        <text className="dg-cw-num" x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
          {index + 1}
        </text>
      )}
      <text className="dg-cw-label" textAnchor={anchor}>
        {labelLines.map((ln, i) => (
          <tspan key={i} x={labelX} y={firstBaseline + i * LH}>
            {ln}
          </tspan>
        ))}
      </text>
      {capLines.length > 0 && (
        <text className="dg-cw-cap-lbl" textAnchor={anchor}>
          {capLines.map((ln, j) => (
            <tspan key={j} x={labelX} y={capBaseline + j * CLH}>
              {ln}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}
