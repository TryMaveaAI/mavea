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
import { columnsAcross, endpointIndex, planLayered, resolveLinks, rowFraction } from './layered';
import { honouredPlacements, honouredSpread } from './placement';
import {
  captionAt,
  columnSpacing,
  fitCaption,
  route,
  LABEL_DY,
  stackText,
  SUB_DY,
  SUB_LINE_H,
  type Footprint,
  type TextStack,
} from './whiteboard';
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
/** Half the widest silhouette (the source's rounded rectangle). */
const SHAPE_HALF_W = NODE_W / 2 - 18;

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

/** Clear air between two neighbouring nodes' text. */
const TEXT_GUTTER = 24;

interface Placed extends DataPipelineStage {
  cx: number;
  cy: number;
}

interface Figure {
  vbW: number;
  /** Centre-to-centre column spacing — the width a node's text may use. */
  colSpacing: number;
  vbH: number;
  placed: Placed[];
  /** The index of the stage an authored edge endpoint names, or null. */
  at: (endpoint?: string) => number | null;
}

/** The whole figure in one pass — which stage sits in which column, and the viewBox that holds
 *  them. Columns come from ./layered, which ranks by ARRAY INDEX: a model that omits `id` (or
 *  repeats one) used to collapse every colliding stage onto a single slot, piling their labels
 *  at the SVG origin while the card grew a row taller per stage. */
function layOut(stages: DataPipelineStage[], edges: DataPipelineEdge[]): Figure {
  const at = endpointIndex(stages);
  if (stages.length === 0)
    return { vbW: VIEW_W, colSpacing: MIN_COL_SPACING, vbH: MIN_VBH, placed: [], at };

  const honoured = honouredPlacements(stages);
  const auto = stages.map((_, i) => i).filter((i) => !honoured.has(i));
  const links = resolveLinks(edges, at, (e) => [e?.from, e?.to]);
  // A column is a shape plus room for the widest caption that has to sit beside it, so a long
  // step note widens the figure instead of landing on the next stage.
  const colSpacing = columnSpacing(MIN_COL_SPACING, SHAPE_HALF_W, edges.map(captionOf));
  const plan = planLayered(stages.length, links, {
    placeable: auto,
    maxColumns: columnsAcross(VIEW_W, PAD, colSpacing),
  });

  // The frame has to hold the placements it honoured as well as the layout it planned —
  // those nodes sit where they asked to, not where the plan's rows are.
  const spread = honouredSpread(stages, honoured);
  const rows = Math.max(plan.rows, spread.rows);
  const columns = Math.max(plan.columns.length, spread.columns);
  const contentH = rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;
  const vbH = Math.max(MIN_VBH, contentH + PAD * 2);
  const vbW = Math.max(VIEW_W, Math.max(1, columns - 1) * colSpacing + PAD * 2);
  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  // The seed is the middle of the card, not (0,0): every auto stage is written below, so this is
  // only ever what an explicitly-placed stage falls back to — and a stage nobody can see is
  // worse than one in the wrong place.
  const placed: Placed[] = stages.map((s, i) =>
    honoured.has(i)
      ? { ...s, cx: toX(clamp01(s.x as number)), cy: toY(clamp01(s.y as number)) }
      : { ...s, cx: vbW / 2, cy: vbH / 2 },
  );
  const span = Math.max(1, plan.columns.length - 1);
  plan.columns.forEach((column, ci) => {
    const x = plan.columns.length === 1 ? vbW / 2 : toX(ci / span);
    column.forEach((index, ri) => {
      placed[index].cx = x;
      placed[index].cy = toY(rowFraction(plan, column, ri));
    });
  });
  return { vbW, colSpacing, vbH, placed, at };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Each kind's silhouette as a box around its centre — what an edge is trimmed to, so it meets
 *  the stage it names rather than stopping at a fixed radius out in the air. */
const KIND_EXTENT: Record<DataPipelineStageKind, { halfW: number; halfH: number }> = {
  source: { halfW: SHAPE_HALF_W, halfH: SHAPE_H / 2 },
  transform: { halfW: 66, halfH: 35 },
  store: { halfW: 58, halfH: SHAPE_H / 2 },
  sink: { halfW: 58, halfH: SHAPE_H / 2 },
};

function footprint(p: Placed, text: TextStack): Footprint {
  return {
    x: p.cx,
    y: p.cy + SHAPE_CY_OFFSET,
    ...(KIND_EXTENT[p.kind ?? 'transform'] ?? KIND_EXTENT.transform),
    textHalfW: text.halfW,
    textBottom: text.bottom,
  };
}

function labelOf(p: Placed): string {
  return typeof p.label === 'string' && p.label.trim() ? p.label.trim() : p.id || 'Stage';
}

function captionOf(e: DataPipelineEdge | undefined): string {
  return typeof e?.label === 'string' ? e.label.trim() : '';
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

  const { vbW, colSpacing, vbH, placed, at } = useMemo(
    () => layOut(safeStages, safeEdges),
    [safeStages, safeEdges],
  );
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);
  // Each node's text gets its column's width, less a gutter so neighbours never touch.
  const stacks = useMemo(
    () => placed.map((p) => stackText(labelOf(p), p.sub, colSpacing - TEXT_GUTTER, SHAPE_H / 2)),
    [placed, colSpacing],
  );

  // Resolved once so the line and its caption read the same geometry; the caption is painted in
  // its own pass after every stage, so no opaque fill can bury it.
  const routedEdges = useMemo(() => {
    const prints = placed.map((p, i) => footprint(p, stacks[i]));
    return safeEdges.flatMap((e, key) => {
      const from = at(e?.from);
      const to = at(e?.to);
      if (from === null || to === null || from === to) return [];
      return [{ key, ...route(prints[from], prints[to]), label: captionOf(e) }];
    });
  }, [safeEdges, placed, stacks, at]);

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
            const label = labelOf(p);
            const text = stacks[i];
            const kind = p.kind ?? 'transform';
            return (
              <g key={i}>
                <g transform={`translate(${p.cx} ${shapeCy})`}>
                  {stageShape(
                    kind,
                    KIND_FILL[kind] ?? KIND_FILL.transform,
                    KIND_STROKE[kind] ?? KIND_STROKE.transform,
                  )}
                </g>
                <text
                  x={p.cx}
                  y={shapeCy + SHAPE_H / 2 + LABEL_DY}
                  className="dp-label"
                  textAnchor="middle"
                >
                  {text.clipped && <title>{[label, p.sub].filter(Boolean).join(' — ')}</title>}
                  {text.label}
                </text>
                {text.sub.length > 0 && (
                  <text className="dp-sub" textAnchor="middle">
                    {text.sub.map((ln, li) => (
                      <tspan key={li} x={p.cx} y={shapeCy + SHAPE_H / 2 + SUB_DY + li * SUB_LINE_H}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                )}
              </g>
            );
          })}

          {/* Edge captions drawn LAST — on top of every node — so a caption on a tightly packed
              column (a normal shape for a 5+ stage lineage) always stays readable instead of
              being painted over by a neighbouring stage's opaque fill. */}
          {routedEdges.map(({ key, s, t, length, label }) => {
            if (!label) return null;
            const fit = fitCaption(label, length);
            const { x, y0 } = captionAt(s, t, fit);
            return (
              <text
                key={key}
                x={x}
                className="dg-edge-label"
                textAnchor="middle"
                style={{ fontSize: fit.fontSize }}
              >
                {fit.lines.map((ln, li) => (
                  <tspan key={li} x={x} y={y0 + li * fit.lineHeight} dominantBaseline="middle">
                    {ln}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
