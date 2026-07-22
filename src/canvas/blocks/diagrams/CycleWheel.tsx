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

type Props = CycleWheelProps & { delay?: number };

// --- viewBox geometry (units; the SVG scales to fit via width:100% in CSS) ---
// The canvas is LANDSCAPE: the ring sits centred with a label gutter reserved on each side, so
// the labels that radiate outward from the edge nodes live *inside* the viewBox and never clip.
const RING_R = 138; // radius the node centres sit on
const NODE_R = 40; // node disc radius
const GLYPH = 30; // node glyph box (sub-SVG side)
const LABEL_GAP = 10; // gap from a disc's rim to where its label starts
const LABEL_W = 158; // horizontal room reserved for a label/caption beside each node
const V_PAD = 22; // breathing room above/below the ring
const VBW = 2 * (RING_R + NODE_R + LABEL_GAP + LABEL_W); // wide enough for ring + a gutter each side
const VBH = 2 * (RING_R + NODE_R + V_PAD); // tall enough for the ring plus a little air
const CX = VBW / 2; // ring centre x
const CY = VBH / 2; // ring centre y
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
  /** whether the node sits on the left half (labels flip to read outward) */
  left: boolean;
}

/** Place the stages evenly around the ring, the first at 12 o'clock and the rest clockwise,
 *  so a process reads the way a clock does. Pure: positions are a function of the count alone. */
function placeStages(stages: CycleStage[]): Placed[] {
  const n = Math.max(1, stages.length);
  return stages.map((stage, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      stage,
      cx: CX + Math.cos(ang) * RING_R,
      cy: CY + Math.sin(ang) * RING_R,
      ang,
      left: Math.cos(ang) < -0.001,
    };
  });
}

/** A point on the ring at a given angle, pushed out by `bow` so the connector arcs sit just
 *  outside the node discs. */
function ringPoint(ang: number, bow: number): { x: number; y: number } {
  const r = RING_R + bow;
  return { x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r };
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
  const placed = placeStages(stages);
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
          viewBox={`0 0 ${VBW} ${VBH}`}
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
          <circle className="dg-cw-ring" cx={CX} cy={CY} r={RING_R} />

          {/* connectors first, so the node discs sit on top of where the arcs meet them */}
          {placed.map((p, i) => {
            const next = placed[(i + 1) % n];
            // a single stage has no loop to draw; with two, the arc still closes the round-trip
            if (n < 2) return null;
            return <Connector key={`c${i}`} from={p} to={next} uid={uid} />;
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
function Connector({ from, to, uid }: { from: Placed; to: Placed; uid: string }) {
  // walk the shorter way round the circle from `from` to `to`
  let delta = to.ang - from.ang;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  const dir = delta >= 0 ? 1 : -1;

  const start = ringPoint(from.ang + ARC_GAP * dir, ARC_BOW);
  const end = ringPoint(to.ang - ARC_GAP * dir, ARC_BOW);
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
 *  the label radiating outward, and an optional caption under it. Text anchors flip on the
 *  left half so every label reads away from the centre and never crosses the ring. */
function Node({ placed, index }: { placed: Placed; index: number }) {
  const { stage, cx, cy, left } = placed;
  const Glyph = stage.icon ? Icon[stage.icon] : undefined;
  // labels sit just outside the disc, anchored toward the rim they're on
  const labelX = cx + (left ? -(NODE_R + LABEL_GAP) : NODE_R + LABEL_GAP);
  const anchor = left ? 'end' : 'start';
  const labelLines = wrap(stage.label, 16, 2);
  const capLines = stage.caption ? wrap(stage.caption, 22, 2) : [];
  const LH = 16; // label line height
  const CLH = 14; // caption line height
  const CAP_OFFSET = 15; // first caption baseline below the last label baseline
  // centre the whole text block (label lines + caption) vertically on the node
  const span =
    (labelLines.length - 1) * LH + (capLines.length ? CAP_OFFSET + (capLines.length - 1) * CLH : 0);
  const firstBaseline = cy - span / 2 + 4;
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

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
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
