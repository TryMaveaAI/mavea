// ControlBlockDiagram — a control-systems block diagram: transfer-function blocks drawn as
// labeled rectangles, a summing junction drawn as a small circle with a +/- sign at each
// incoming wire, joined by directional signal wires. A wire marked `feedback` is routed as a
// rectangular loop back to an earlier block (the standard textbook convention for a return
// path) instead of a straight line. Blocks without explicit x/y are auto-ranked left-to-right by
// the non-feedback wire graph — a Kahn-style longest-path relax, the same technique DiagramFlow's
// `layered` layout uses for its column assignment, collapsed here to one row since a control loop
// reads left-to-right rather than in bands — so a PID loop or a thermostat's closed loop the
// model describes as pure graph data still lays out like a textbook figure.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ControlBlockDiagramProps, ControlBlockNode, ControlWire } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ControlBlockDiagramProps & { delay?: number };

const VIEW_W = 1000;
const PAD_X = 130;
const TOP = 40;
const Y_BAND = 260; // vertical span a 0..100 manual `y` maps onto
const ROW_Y = TOP + Y_BAND / 2;
const STACK_GAP = 78; // vertical offset between same-rank auto-placed blocks
const LOOP_STEP = 64; // extra vertical depth per nested feedback loop
const BOX_H = 74;
const BOX_MIN_W = 148;
const BOX_MAX_W = 250;
const SUM_R = 24;
const BOTTOM_PAD = 46;

const LABEL_MAX_CHARS = 18;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 0.5;
}

function boxWidth(label: string): number {
  return Math.min(BOX_MAX_W, Math.max(BOX_MIN_W, 46 + label.length * 11));
}

interface Placed {
  id: string;
  renderId: string;
  label: string;
  kind: 'block' | 'sum';
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

/** Rank every block by longest path over non-feedback wires in O(blocks + wires). A stray
 *  forward cycle cannot be topologically ranked, so its members retain rank zero; feedback
 *  wires already take the explicit loop route. Unresolved ids are ignored. */
function rankBlocks(blocks: ControlBlockNode[], wires: ControlWire[]): Map<string, number> {
  const ids = new Set(blocks.map((block) => block.id));
  const rank = new Map<string, number>();
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    rank.set(id, 0);
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const wire of wires) {
    if (wire.feedback || !ids.has(wire.from) || !ids.has(wire.to)) continue;
    outgoing.get(wire.from)!.push(wire.to);
    indegree.set(wire.to, (indegree.get(wire.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const id of ids) if (indegree.get(id) === 0) queue.push(id);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const from = queue[cursor];
    for (const to of outgoing.get(from) ?? []) {
      rank.set(to, Math.max(rank.get(to) ?? 0, (rank.get(from) ?? 0) + 1));
      const remaining = (indegree.get(to) ?? 1) - 1;
      indegree.set(to, remaining);
      if (remaining === 0) queue.push(to);
    }
  }
  return rank;
}

function layoutBlocks(
  blocks: ControlBlockNode[],
  wires: ControlWire[],
): { placed: Placed[]; vbH: number } {
  const rank = rankBlocks(blocks, wires);
  const maxRank = Math.max(0, ...blocks.map((b) => rank.get(b.id) ?? 0));
  const innerW = VIEW_W - PAD_X * 2;

  const byRank = new Map<number, ControlBlockNode[]>();
  for (const b of blocks) {
    if (b.x !== undefined && b.y !== undefined) continue;
    const r = rank.get(b.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const rankCursor = new Map<number, number>();

  const placed: Placed[] = blocks.map((b, index) => {
    const kind = b.kind === 'sum' ? 'sum' : 'block';
    const label = typeof b.label === 'string' && b.label ? b.label : kind === 'sum' ? 'Σ' : 'Block';
    const halfW = kind === 'sum' ? SUM_R : boxWidth(label) / 2;
    const halfH = kind === 'sum' ? SUM_R : BOX_H / 2;

    if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
      return {
        id: b.id,
        renderId: `${b.id || 'block'}:${index}`,
        label,
        kind,
        cx: PAD_X + clamp01(b.x as number) * innerW,
        cy: TOP + clamp01(b.y as number) * Y_BAND,
        halfW,
        halfH,
      };
    }

    const r = rank.get(b.id) ?? 0;
    const siblings = byRank.get(r) ?? [b];
    const idx = rankCursor.get(r) ?? 0;
    rankCursor.set(r, idx + 1);
    const n = siblings.length;
    // Bound the total spread of a crowded rank (many unranked blocks sharing one column)
    // so the card stays a sane height instead of growing linearly with a long, flat input.
    const gap = n > 5 ? (STACK_GAP * 4) / (n - 1) : STACK_GAP;
    const mid = (n - 1) / 2;
    const cx = maxRank === 0 ? VIEW_W / 2 : PAD_X + (r / maxRank) * innerW;
    const cy = ROW_Y + (idx - mid) * gap;
    return { id: b.id, renderId: `${b.id || 'block'}:${index}`, label, kind, cx, cy, halfW, halfH };
  });

  const feedbackCount = wires.filter((w) => w.feedback).length;
  // A sum node's label sits ABOVE its circle (the "+"/"−" signs live at the sides/below), so
  // its effective top reaches further up than a block's own half-height.
  const topReach = (p: Placed) => p.cy - p.halfH - (p.kind === 'sum' ? 30 : 0);
  const maxTop = placed.length ? Math.min(...placed.map(topReach)) : TOP;
  const shift = maxTop < 0 ? -maxTop + 20 : 0;
  for (const p of placed) p.cy += shift;

  const maxBottom = placed.length
    ? Math.max(...placed.map((p) => p.cy + p.halfH))
    : ROW_Y + BOX_H / 2;
  const vbH = maxBottom + feedbackCount * LOOP_STEP + BOTTOM_PAD;
  return { placed, vbH };
}

/** Trim a straight connection to the rim of each endpoint's box (ellipse-approximated, exactly
 *  like DiagramFlow's rimPoint/rimStart — close enough for a rounded rectangle) so the arrow
 *  meets the border, not the label. */
function rim(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  return { x: to.cx - Math.cos(ang) * (to.halfW + 4), y: to.cy - Math.sin(ang) * (to.halfH + 4) };
}
function rimFrom(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  return {
    x: from.cx + Math.cos(ang) * (from.halfW + 4),
    y: from.cy + Math.sin(ang) * (from.halfH + 4),
  };
}

/** Where a "+"/"−" sign reads best: just outside the target on the side the signal arrives
 *  from. `travel` is the final segment's direction of motion (mostly horizontal for a forward
 *  wire on the row, straight up for a feedback wire entering from its loop below) — walking
 *  backward from the target center along that direction lands the label near the rim the wire
 *  actually touches, whichever shape it approached from. */
function signPos(target: Placed, travel: { x: number; y: number }): { x: number; y: number } {
  const len = Math.hypot(travel.x, travel.y) || 1;
  const ux = travel.x / len;
  const uy = travel.y / len;
  const reach = target.halfH + 20;
  return { x: target.cx - ux * reach, y: target.cy - uy * reach };
}

export function ControlBlockDiagram({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  blocks,
  wires,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;
  const uid = useId().replace(/:/g, '');
  const arrowId = `cbd-arrow-${uid}`;

  const safeBlocks = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks]);
  const safeWires = useMemo(() => (Array.isArray(wires) ? wires : []), [wires]);

  const { placed, vbH } = useMemo(
    () => layoutBlocks(safeBlocks, safeWires),
    [safeBlocks, safeWires],
  );
  const byId = useMemo(() => {
    const result = new Map<string, Placed>();
    for (const block of placed) if (block.id && !result.has(block.id)) result.set(block.id, block);
    return result;
  }, [placed]);

  // Feedback loops nest by wire span (rank distance) so a longer return path draws a deeper
  // loop than a short one and the two never cross.
  const feedbackOrder = useMemo(() => {
    const withSpan = safeWires
      .map((w, i) => ({
        w,
        i,
        span: Math.abs((byId.get(w.to)?.cx ?? 0) - (byId.get(w.from)?.cx ?? 0)),
      }))
      .filter((e) => e.w.feedback && byId.has(e.w.from) && byId.has(e.w.to))
      .sort((a, b) => a.span - b.span);
    const depth = new Map<number, number>();
    withSpan.forEach((e, order) => depth.set(e.i, order + 1));
    return depth;
  }, [safeWires, byId]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-cbd-stage">
        <svg
          className="dg-cbd-svg"
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="dg-cbd-arrowhead" />
            </marker>
          </defs>

          {safeWires.map((w, i) => {
            const a = byId.get(w.from);
            const b = byId.get(w.to);
            if (!a || !b) return null;
            const sign = b.kind === 'sum' ? (w.sign === 'minus' ? '−' : '+') : null;

            if (w.feedback) {
              const depth = feedbackOrder.get(i) ?? 1;
              const trackY = vbH - BOTTOM_PAD - (feedbackOrder.size - depth) * LOOP_STEP;
              const startY = a.cy + a.halfH;
              const endY = b.cy + b.halfH;
              const points = `${a.cx},${startY} ${a.cx},${trackY} ${b.cx},${trackY} ${b.cx},${endY + 6}`;
              const label = sign && (
                <text
                  x={b.cx + 16}
                  y={endY + 20}
                  className="dg-cbd-sign"
                  textAnchor="start"
                  dominantBaseline="middle"
                >
                  {sign}
                </text>
              );
              return (
                <g key={`w${i}`} className="dg-cbd-wire">
                  <polyline points={points} fill="none" markerEnd={`url(#${arrowId})`} />
                  {label}
                </g>
              );
            }

            const s = rimFrom(a, b);
            const t = rim(a, b);
            const pos = sign ? signPos(b, { x: t.x - s.x, y: t.y - s.y }) : null;
            const anchor = pos
              ? pos.x > b.cx + 2
                ? 'start'
                : pos.x < b.cx - 2
                  ? 'end'
                  : 'middle'
              : 'middle';
            return (
              <g key={`w${i}`} className="dg-cbd-wire">
                <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} markerEnd={`url(#${arrowId})`} />
                {pos && (
                  <text
                    x={pos.x}
                    y={pos.y}
                    className="dg-cbd-sign"
                    textAnchor={anchor}
                    dominantBaseline="middle"
                  >
                    {sign}
                  </text>
                )}
              </g>
            );
          })}

          {placed.map((p) =>
            p.kind === 'sum' ? (
              <g key={p.renderId}>
                <circle cx={p.cx} cy={p.cy} r={SUM_R} className="dg-cbd-sum" />
                <line
                  x1={p.cx - SUM_R * 0.4}
                  y1={p.cy}
                  x2={p.cx + SUM_R * 0.4}
                  y2={p.cy}
                  className="dg-cbd-sum-cross"
                />
                <line
                  x1={p.cx}
                  y1={p.cy - SUM_R * 0.4}
                  x2={p.cx}
                  y2={p.cy + SUM_R * 0.4}
                  className="dg-cbd-sum-cross"
                />
                <text
                  x={p.cx}
                  y={p.cy - SUM_R - 12}
                  className="dg-cbd-sum-label"
                  textAnchor="middle"
                >
                  {p.label.length > LABEL_MAX_CHARS && <title>{p.label}</title>}
                  {truncate(p.label, LABEL_MAX_CHARS)}
                </text>
              </g>
            ) : (
              <g key={p.renderId}>
                <rect
                  x={p.cx - p.halfW}
                  y={p.cy - p.halfH}
                  width={p.halfW * 2}
                  height={p.halfH * 2}
                  rx={10}
                  className="dg-cbd-box"
                />
                <text
                  x={p.cx}
                  y={p.cy}
                  className="dg-cbd-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {p.label.length > LABEL_MAX_CHARS && <title>{p.label}</title>}
                  {truncate(p.label, LABEL_MAX_CHARS)}
                </text>
              </g>
            ),
          )}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
