// ControlBlockDiagram — a control-systems block diagram: transfer-function blocks drawn as
// labeled rectangles, a summing junction drawn as a small circle with a +/- sign at each
// incoming wire, joined by directional signal wires. A wire marked `feedback` is routed as a
// rectangular loop back to an earlier block (the standard textbook convention for a return
// path) instead of a straight line. Blocks without explicit x/y are auto-ranked left-to-right by
// the non-feedback wire graph — a Kahn-style longest-path relax, the same technique DiagramFlow's
// `layered` layout uses for its column assignment, collapsed here to one row since a control loop
// reads left-to-right rather than in bands — so a PID loop or a thermostat's closed loop the
// model describes as pure graph data still lays out like a textbook figure. A block that only
// lives on a return path (a sensor fed by the plant and feeding the junction, both as feedback)
// has no forward rank at all, so it goes on a return row under the span it closes, signal running
// right to left, rather than stacking onto the first column beside the setpoint.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ControlBlockDiagramProps, ControlBlockNode, ControlWire } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { RIM_GAP, elbow, returnPathIds, signAt } from './controlBlockLayout';
import type { Placed, Pt } from './controlBlockLayout';

type Props = ControlBlockDiagramProps & { delay?: number };

const VIEW_W = 1000;
const PAD_X = 130;
const TOP = 40;
const Y_BAND = 260; // vertical span a 0..100 manual `y` maps onto
const ROW_Y = TOP + Y_BAND / 2;
const STACK_GAP = 100; // same-rank pitch: a box's height plus clear air, so stacked boxes never touch
const RETURN_GAP = 56; // air between the forward row and a return row (and between return rows)
const RETURN_SPACING = 40; // least clear air between two blocks sharing a return row

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
): { placed: Placed[]; vbH: number; onReturn: Set<string> } {
  const onReturn = returnPathIds(blocks, wires);
  const rank = rankBlocks(blocks, wires);
  const forwardIds = blocks.filter((b) => !onReturn.has(b.id)).map((b) => b.id);
  const maxRank = Math.max(0, ...forwardIds.map((id) => rank.get(id) ?? 0));
  const innerW = VIEW_W - PAD_X * 2;

  const byRank = new Map<number, ControlBlockNode[]>();
  for (const b of blocks) {
    if (onReturn.has(b.id) || (Number.isFinite(b.x) && Number.isFinite(b.y))) continue;
    const r = rank.get(b.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const rankCursor = new Map<number, number>();

  const placed: Placed[] = blocks.map((b, index) => {
    const kind: Placed['kind'] = b.kind === 'sum' ? 'sum' : 'block';
    const label = typeof b.label === 'string' && b.label ? b.label : kind === 'sum' ? 'Σ' : 'Block';
    const halfW = kind === 'sum' ? SUM_R : boxWidth(label) / 2;
    const halfH = kind === 'sum' ? SUM_R : BOX_H / 2;
    const base = { id: b.id, renderId: `${b.id || 'block'}:${index}`, label, kind, halfW, halfH };

    if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
      return {
        ...base,
        cx: PAD_X + clamp01(b.x as number) * innerW,
        cy: TOP + clamp01(b.y as number) * Y_BAND,
      };
    }
    // Placed below, once the forward row it hangs under is known.
    if (onReturn.has(b.id)) return { ...base, cx: VIEW_W / 2, cy: ROW_Y };

    const r = rank.get(b.id) ?? 0;
    const siblings = byRank.get(r) ?? [b];
    const idx = rankCursor.get(r) ?? 0;
    rankCursor.set(r, idx + 1);
    const mid = (siblings.length - 1) / 2;
    const cx = maxRank === 0 ? VIEW_W / 2 : PAD_X + (r / maxRank) * innerW;
    return { ...base, cx, cy: ROW_Y + (idx - mid) * STACK_GAP };
  });

  placeReturnRows(placed, wires, onReturn);

  // Only a feedback wire that will actually be DRAWN as a loop under the row earns a track — the
  // renderer skips one whose endpoints name no block, and a return-path block's wires are elbows,
  // not tracks. Depth reserved for a wire nothing draws there is empty space the card is sized around.
  const drawable = new Set(placed.map((p) => p.id).filter(Boolean));
  const feedbackCount = wires.filter((w) => isTrack(w, drawable, onReturn)).length;
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
  return { placed, vbH, onReturn };
}

/** A feedback wire drawn as the classic loop under the whole row: both ends resolve and neither
 *  sits on a return row (those join the loop with elbows instead). */
function isTrack(w: ControlWire, drawable: Set<string>, onReturn: Set<string>): boolean {
  return (
    !!w.feedback &&
    drawable.has(w.from) &&
    drawable.has(w.to) &&
    !onReturn.has(w.from) &&
    !onReturn.has(w.to)
  );
}

/** Seat each return-path block under the span its loop closes: between the block that feeds it
 *  and the one it feeds back into, in the order the signal passes through, one row per loop with
 *  the shorter loop nested nearest the forward row. */
function placeReturnRows(placed: Placed[], wires: ControlWire[], onReturn: Set<string>): void {
  if (!onReturn.size) return;
  const byId = new Map<string, Placed>();
  for (const p of placed) if (p.id && !byId.has(p.id)) byId.set(p.id, p);
  const fbIn = new Map<string, string>();
  const fbOut = new Map<string, string>();
  for (const w of wires) {
    if (!w.feedback || !byId.has(w.from) || !byId.has(w.to)) continue;
    if (!fbIn.has(w.to)) fbIn.set(w.to, w.from);
    if (!fbOut.has(w.from)) fbOut.set(w.from, w.to);
  }
  const walk = (start: string, next: Map<string, string>) => {
    const seen = new Set([start]);
    let at = start;
    let steps = 0;
    for (;;) {
      const n = next.get(at);
      if (n === undefined || seen.has(n)) return { end: null, steps };
      steps++;
      if (!onReturn.has(n)) return { end: n, steps };
      seen.add(n);
      at = n;
    }
  };

  const groups = new Map<string, { from?: Placed; to?: Placed; members: [number, Placed][] }>();
  for (const id of onReturn) {
    const back = walk(id, fbIn);
    const ahead = walk(id, fbOut);
    const key = `${back.end ?? ''}\u0000${ahead.end ?? ''}`;
    const g = groups.get(key) ?? {
      from: back.end ? byId.get(back.end) : undefined,
      to: ahead.end ? byId.get(ahead.end) : undefined,
      members: [],
    };
    const p = byId.get(id);
    if (p) g.members.push([back.steps, p]);
    groups.set(key, g);
  }

  const forward = placed.filter((p) => !onReturn.has(p.id));
  const rowBottom = forward.length
    ? Math.max(...forward.map((p) => p.cy + p.halfH))
    : ROW_Y + BOX_H / 2;
  const spanOf = (g: { from?: Placed; to?: Placed }) =>
    g.from && g.to ? Math.abs(g.from.cx - g.to.cx) : Infinity;
  const ordered = [...groups.values()].sort((a, b) => spanOf(a) - spanOf(b));
  let top = rowBottom + RETURN_GAP;
  for (const g of ordered) {
    const members = g.members.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    const startX = g.from?.cx ?? g.to?.cx ?? VIEW_W / 2;
    const endX = g.to?.cx ?? g.from?.cx ?? VIEW_W / 2;
    const n = members.length;
    const widest = Math.max(...members.map((m) => m.halfW * 2));
    const dir = endX >= startX ? 1 : -1;
    const step = Math.max(Math.abs(endX - startX) / (n + 1), widest + RETURN_SPACING);
    const mid = (startX + endX) / 2;
    const tallest = Math.max(...members.map((m) => m.halfH));
    members.forEach((m, i) => {
      const x = mid + dir * (i - (n - 1) / 2) * step;
      m.cx = Math.min(VIEW_W - m.halfW - 8, Math.max(m.halfW + 8, x));
      m.cy = top + tallest;
    });
    top += tallest * 2 + RETURN_GAP;
  }
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

  const { placed, vbH, onReturn } = useMemo(
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
      .filter((e) => isTrack(e.w, new Set(byId.keys()), onReturn))
      .sort((a, b) => a.span - b.span);
    const depth = new Map<number, number>();
    withSpan.forEach((e, order) => depth.set(e.i, order + 1));
    return depth;
  }, [safeWires, byId, onReturn]);

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

            const signText = (tip: Pt, travel: Pt) => {
              if (!sign) return null;
              const at = signAt(tip, travel);
              return (
                <text
                  x={at.x}
                  y={at.y}
                  className="dg-cbd-sign"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {sign}
                </text>
              );
            };

            if (w.feedback && (onReturn.has(w.from) || onReturn.has(w.to))) {
              const pts = elbow(a, b);
              const tip = pts[pts.length - 1];
              const prev = pts[pts.length - 2];
              return (
                <g key={`w${i}`} className="dg-cbd-wire">
                  <polyline
                    points={pts.map((q) => `${q.x},${q.y}`).join(' ')}
                    fill="none"
                    markerEnd={`url(#${arrowId})`}
                  />
                  {signText(tip, { x: tip.x - prev.x, y: tip.y - prev.y })}
                </g>
              );
            }

            if (w.feedback) {
              const depth = feedbackOrder.get(i) ?? 1;
              const trackY = vbH - BOTTOM_PAD - (feedbackOrder.size - depth) * LOOP_STEP;
              const startY = a.cy + a.halfH;
              const endY = b.cy + b.halfH + RIM_GAP;
              const points = `${a.cx},${startY} ${a.cx},${trackY} ${b.cx},${trackY} ${b.cx},${endY}`;
              return (
                <g key={`w${i}`} className="dg-cbd-wire">
                  <polyline points={points} fill="none" markerEnd={`url(#${arrowId})`} />
                  {signText({ x: b.cx, y: endY }, { x: 0, y: -1 })}
                </g>
              );
            }

            const s = rimFrom(a, b);
            const t = rim(a, b);
            return (
              <g key={`w${i}`} className="dg-cbd-wire">
                <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} markerEnd={`url(#${arrowId})`} />
                {signText(t, { x: t.x - s.x, y: t.y - s.y })}
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
