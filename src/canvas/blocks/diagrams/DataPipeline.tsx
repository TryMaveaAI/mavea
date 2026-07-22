// DataPipeline — an ETL/data-pipeline lineage diagram. The auto-layout engine (rank-by-edge-
// depth, left-to-right columns) is DiagramFlow's `layered` technique, unchanged — exactly the
// rank/column code SysArchDiagram already reuses for its own whiteboard figure. What's new
// here, on top of that shared engine, is a THIRD set of kind shapes tuned for offline data
// lineage rather than a live service architecture: a source is a rounded rectangle with an
// inbound-arrow glyph (data entering the pipeline), a transform is a hexagon (a processing
// step — also the fallback shape for an unrecognized kind), and a sink/store share
// SysArchDiagram's database-cylinder convention for "data at rest", told apart by a small
// inline icon the same way SysArchDiagram tells its own shared-rectangle kinds apart.
import { useId, useMemo } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type {
  DataPipelineProps,
  DataPipelineStage,
  DataPipelineEdge,
  DataPipelineStageKind,
} from './types';

type Props = DataPipelineProps & { delay?: number };

const VIEW_W = 1000;
const NODE_W = 186;
const NODE_H = 130;
const PAD = NODE_W / 2 + 20;
const ROW_GAP = 74;
const MIN_VBH = 320;
// A column needs at least a node width plus a gap of room, or same-row stages overlap and paint
// over each other's labels. The viewBox width grows to guarantee it (its height already grows
// with rows) — the same fix DiagramFlow carries.
const MIN_COL_SPACING = NODE_W + 40;
// The stage renders at ≤ STAGE_BASE_W px (its CSS max-width); a wider figure is let out to more
// of it so its nodes don't scale down to an unreadable size.
const STAGE_BASE_W = 720;

// The visual footprint reserved for the drawn shape, with the label + optional sub below it —
// identical proportions to SysArchDiagram so the two "whiteboard" diagram families read as one
// visual system when they appear side by side.
const SHAPE_H = 70;
const SHAPE_CY_OFFSET = -30;

const KIND_FILL: Record<DataPipelineStageKind, string> = {
  source: 'color-mix(in oklab, var(--presence) 18%, var(--surface-elevated-2))',
  transform: 'color-mix(in oklab, var(--presence) 10%, var(--surface-elevated-2))',
  store: 'color-mix(in oklab, var(--presence-soft) 20%, var(--surface-elevated-2))',
  sink: 'color-mix(in oklab, var(--insight) 16%, var(--surface-elevated-2))',
};
const KIND_STROKE: Record<DataPipelineStageKind, string> = {
  source: 'var(--presence)',
  transform: 'var(--line-strong)',
  store: 'var(--presence-soft)',
  sink: 'var(--insight)',
};

const LABEL_MAX_CHARS = 17;
const SUB_MAX_CHARS = 20;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface Placed extends DataPipelineStage {
  cx: number;
  cy: number;
}

/** Rank every stage by longest path over the edge graph (Kahn-style relax, bounded by stage
 *  count) — the same technique DiagramFlow's `layered` mode and SysArchDiagram both use, so a
 *  source → transform → transform → sink chain reads left-to-right regardless of authored
 *  order, and a fan-out (one transform feeding two sinks) still ranks correctly. */
function rankStages(stages: DataPipelineStage[], edges: DataPipelineEdge[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const s of stages) rank.set(s.id, 0);
  for (let pass = 0; pass < stages.length; pass++) {
    let moved = false;
    for (const e of edges) {
      if (!rank.has(e.from) || !rank.has(e.to)) continue;
      const next = (rank.get(e.from) ?? 0) + 1;
      if (next > (rank.get(e.to) ?? 0) && next < stages.length) {
        rank.set(e.to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

function computeVbH(stages: DataPipelineStage[], edges: DataPipelineEdge[]): number {
  if (stages.length === 0) return MIN_VBH;
  const rank = rankStages(stages, edges);
  const colDepths = new Map<number, number>();
  for (const s of stages) {
    const r = rank.get(s.id) ?? 0;
    colDepths.set(r, (colDepths.get(r) ?? 0) + 1);
  }
  const maxRows = colDepths.size > 0 ? Math.max(...colDepths.values()) : 1;
  const contentH = maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;
  return Math.max(MIN_VBH, contentH + PAD * 2);
}

/** Horizontal twin of computeVbH: the viewBox width grows with the column count so fixed-width
 *  stages packed into it never collide. */
function computeVbW(stages: DataPipelineStage[], edges: DataPipelineEdge[]): number {
  if (stages.length === 0) return VIEW_W;
  const rank = rankStages(stages, edges);
  const cols = new Set(stages.map((s) => rank.get(s.id) ?? 0)).size;
  return Math.max(VIEW_W, Math.max(1, cols - 1) * MIN_COL_SPACING + PAD * 2);
}

function layoutStages(
  stages: DataPipelineStage[],
  edges: DataPipelineEdge[],
  vbW: number,
  vbH: number,
): Placed[] {
  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  const placed: Placed[] = stages.map((s) =>
    Number.isFinite(s.x) && Number.isFinite(s.y)
      ? { ...s, cx: toX(clamp01(s.x as number)), cy: toY(clamp01(s.y as number)) }
      : { ...s, cx: 0, cy: 0 },
  );
  const byId = new Map(placed.map((p) => [p.id, p]));

  const auto = stages.filter((s) => !(Number.isFinite(s.x) && Number.isFinite(s.y)));
  const rank = rankStages(auto, edges);
  const cols = new Map<number, DataPipelineStage[]>();
  for (const s of auto) {
    const r = rank.get(s.id) ?? 0;
    if (!cols.has(r)) cols.set(r, []);
    cols.get(r)!.push(s);
  }
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  const span = Math.max(1, colKeys.length - 1);
  colKeys.forEach((key, ci) => {
    const col = cols.get(key)!;
    const x = colKeys.length === 1 ? vbW / 2 : toX(ci / span);
    col.forEach((s, ri) => {
      const p = byId.get(s.id)!;
      p.cx = x;
      p.cy = col.length === 1 ? vbH / 2 : toY((ri + 0.5) / col.length);
    });
  });
  return placed;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** The fixed-radius rim trim (DiagramFlow/SysArchDiagram's own approximation) silently
 *  reverses an arrow's apparent direction once a layout packs columns closer together than
 *  the trim radius — a real case here, not a hypothetical one: a 5+ stage lineage (source →
 *  two or three transforms → a store → a sink) is a perfectly ordinary pipeline, and each
 *  extra rank column narrows the gap between adjacent stages. Capping each end's trim at a
 *  fraction of the actual centre-to-centre distance keeps the two trimmed endpoints from ever
 *  crossing: at the cap, each end eats at most 40% of the gap, leaving a guaranteed 20% of it
 *  between them regardless of how tightly the columns are packed. Wide layouts are unaffected
 *  — the cap only bites once stages sit closer than the shapes are wide. */
function trimRadii(from: Placed, to: Placed): { rx: number; ry: number } {
  const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) || 1;
  const cap = dist * 0.4;
  return { rx: Math.min(NODE_W / 2 + 6, cap), ry: Math.min(NODE_H / 2 + 6, cap) };
}

/** Trim a connection to the rim of each stage's bounding ellipse — the same approximation
 *  DiagramFlow/SysArchDiagram use for their own boxy shapes — so the arrow meets the border,
 *  not the label. */
function rim(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  const { rx, ry } = trimRadii(from, to);
  return {
    x: to.cx - Math.cos(ang) * rx,
    y: to.cy - Math.sin(ang) * ry,
  };
}
function rimStart(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  const { rx, ry } = trimRadii(from, to);
  return {
    x: from.cx + Math.cos(ang) * rx,
    y: from.cy + Math.sin(ang) * ry,
  };
}

/** sink and store share the cylinder silhouette; this small glyph is the only thing that tells
 *  them apart at a glance — an outbound arrow (data leaving the pipeline) for a sink, stacked
 *  lines (data persisted in layers) for a store. */
function restIcon(kind: DataPipelineStageKind): ReactNode {
  if (kind === 'store') {
    return (
      <g className="dp-icon" transform="translate(0 -2)">
        <line x1={-9} y1={-4} x2={9} y2={-4} />
        <line x1={-9} y1={0} x2={9} y2={0} />
        <line x1={-9} y1={4} x2={9} y2={4} />
      </g>
    );
  }
  return (
    <g className="dp-icon" transform="translate(0 -2)">
      <line x1={-10} y1={0} x2={7} y2={0} />
      <path d="M 1 -6 L 11 0 L 1 6" fill="none" />
    </g>
  );
}

/** The three distinct silhouettes, drawn centred on (0,0) within roughly a `SHAPE_H`-tall,
 *  `NODE_W`-wide footprint. An unrecognized/missing kind falls through to `transform` — the
 *  most neutral "a step happens here" reading — rather than throwing. */
function stageShape(kind: DataPipelineStageKind, fill: string, stroke: string): ReactNode {
  const common = { fill, stroke, strokeWidth: 2.2 };
  switch (kind) {
    case 'source':
      return (
        <g>
          <rect
            x={-NODE_W / 2 + 18}
            y={-SHAPE_H / 2}
            width={NODE_W - 36}
            height={SHAPE_H}
            rx={14}
            {...common}
          />
          {/* inbound-arrow glyph: data flowing in from outside the pipeline */}
          <g className="dp-icon" transform="translate(-2 -2)">
            <line x1={-16} y1={0} x2={6} y2={0} />
            <path d="M 0 -6 L 8 0 L 0 6" fill="none" />
          </g>
        </g>
      );
    case 'sink':
    case 'store': {
      const rx = 58;
      const ry = 13;
      const top = -SHAPE_H / 2 + ry;
      const bot = SHAPE_H / 2 - ry;
      return (
        <g>
          <path
            d={`M ${-rx} ${top} A ${rx} ${ry} 0 0 1 ${rx} ${top} L ${rx} ${bot} A ${rx} ${ry} 0 0 1 ${-rx} ${bot} Z`}
            {...common}
          />
          <path
            d={`M ${-rx} ${top} A ${rx} ${ry} 0 0 0 ${rx} ${top}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
          />
          {restIcon(kind)}
        </g>
      );
    }
    default: {
      // transform (and any unrecognized kind): a hexagon — the standard flowchart "processing
      // step" silhouette, built the same cos/sin way SysArchDiagram draws its loadbalancer.
      const hrx = 66;
      const hry = 40;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${Math.cos(a) * hrx},${Math.sin(a) * hry}`;
      }).join(' ');
      return <polygon points={pts} {...common} />;
    }
  }
}

export function DataPipeline({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  stages,
  edges,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const uid = useId().replace(/:/g, '');

  const safeStages = useMemo(() => (Array.isArray(stages) ? stages : []), [stages]);
  const safeEdges = useMemo(() => (Array.isArray(edges) ? edges : []), [edges]);

  const vbW = useMemo(() => computeVbW(safeStages, safeEdges), [safeStages, safeEdges]);
  const vbH = useMemo(() => computeVbH(safeStages, safeEdges), [safeStages, safeEdges]);
  const placed = useMemo(
    () => layoutStages(safeStages, safeEdges, vbW, vbH),
    [safeStages, safeEdges, vbW, vbH],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);

  // A dense linear lineage (5+ sequential stages, an ordinary shape for an ETL chain) packs
  // columns close enough that an edge's own midpoint can fall inside a neighbouring stage's
  // shape. Resolving both endpoints once here lets the line and its label share the same
  // geometry while rendering the label in a SEPARATE pass drawn after every node (below) — so a
  // tight caption always stays legible on top of the shape it happens to sit near, instead of
  // being silently painted over by that shape's opaque fill.
  const routedEdges = useMemo(
    () =>
      safeEdges
        .map((e, i) => {
          const a = byId.get(e?.from);
          const b = byId.get(e?.to);
          if (!a || !b) return null;
          const s = rimStart(a, b);
          const t = rim(a, b);
          const label = typeof e.label === 'string' ? e.label : '';
          return { key: i, s, t, label };
        })
        .filter(
          (
            r,
          ): r is {
            key: number;
            s: { x: number; y: number };
            t: { x: number; y: number };
            label: string;
          } => r !== null,
        ),
    [safeEdges, byId],
  );

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage dp-stage" style={{ maxWidth: stageMaxW }}>
        <svg
          className="dg-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          <defs>
            <marker
              id={`dp-arrow-${uid}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="dp-arrowhead" />
            </marker>
          </defs>

          {routedEdges.map(({ key, s, t }) => (
            <g key={key} className="dp-edge">
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} markerEnd={`url(#dp-arrow-${uid})`} />
            </g>
          ))}

          {placed.map((p, i) => {
            const shapeCy = p.cy + SHAPE_CY_OFFSET;
            const label = typeof p.label === 'string' && p.label ? p.label : p.id || 'Stage';
            const kind = p.kind ?? 'transform';
            return (
              <g key={p.id ?? i}>
                <g transform={`translate(${p.cx} ${shapeCy})`}>
                  {stageShape(
                    kind,
                    KIND_FILL[kind] ?? KIND_FILL.transform,
                    KIND_STROKE[kind] ?? KIND_STROKE.transform,
                  )}
                </g>
                <text
                  x={p.cx}
                  y={shapeCy + SHAPE_H / 2 + 24}
                  className="dp-label"
                  textAnchor="middle"
                >
                  {label.length > LABEL_MAX_CHARS && <title>{label}</title>}
                  {truncate(label, LABEL_MAX_CHARS)}
                </text>
                {p.sub && (
                  <text
                    x={p.cx}
                    y={shapeCy + SHAPE_H / 2 + 44}
                    className="dp-sub"
                    textAnchor="middle"
                  >
                    {p.sub.length > SUB_MAX_CHARS && <title>{p.sub}</title>}
                    {truncate(p.sub, SUB_MAX_CHARS)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Edge captions drawn LAST — on top of every node — so a caption on a tightly packed
              column (a normal shape for a 5+ stage lineage) always stays readable instead of
              being painted over by a neighbouring stage's opaque fill. */}
          {routedEdges.map(({ key, s, t, label }) => {
            if (!label) return null;
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            return (
              <text key={key} x={mx} y={my - 8} className="dg-edge-label" textAnchor="middle">
                {truncate(label, 26)}
              </text>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
