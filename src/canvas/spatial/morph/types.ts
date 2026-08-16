// morph/types.ts — the morph contract. One world of nodes and edges renders as four
// interchangeable representations, each produced by a pure
// LayoutFn that maps the SAME node ids to new geometry — which is what lets a surface animate a
// node from card to entry to mark instead of swapping components. Every one of them answers a
// question the others cannot: what led to what (graph), how much each cause mattered (flow), when
// each happened (timeline), and what each measured (chart). A representation that only re-arranges
// another's answer is not a view, it is a skin — three were built and cut on exactly that test. A layout never invents or drops
// a node: anything a representation cannot place honestly (an undated node on a timeline, a node
// with no measured series on a chart) is shelved in a labeled band instead. Geometry only — no
// React, no DOM; the renderer consumes a MorphLayout as data.
import type { Bbox } from '../camera';

export type Representation = 'graph' | 'timeline' | 'chart' | 'flow';

export interface MorphNodeDatum {
  id: string;
  label: string;
  role?: 'root' | 'mechanism' | 'outcome';
  depth?: number;
  /** ms epoch; absent → shelf in timeline. */
  date?: { start: number; end?: number };
  /** Absent/empty → shelf in chart. */
  series?: Array<{ t: number; v: number }>;
  value?: number;
  unit?: string;
  tier?: string;
  /** The sphere this node belongs to — the stage's categorical channel. Kept a plain string here:
   *  the geometry layer colours by it but has no business knowing the live contract's allowlist. */
  domain?: string;
  /** Semantic-zoom child: folded into its parent until the parent is expanded. */
  parentId?: string;
  /**
   * How a reader's what-if moved this node's RELATIVE strength: 1 is untouched, below 1 weaker,
   * above 1 stronger. Absent means no what-if is running.
   *
   * It is a render channel, not geometry — a counterfactual changes how much a cause matters, never
   * where it sits or when it happened — so no layout reads it and positions are identical with and
   * without one. The stage publishes it for the sheet to paint prominence from, and the host turns
   * it into words. Deliberately a bare ratio: it is computed from the world's own structure and has
   * nothing measuring it, so nothing downstream may render it AS a figure.
   */
  shift?: number;
}

export interface MorphEdgeDatum {
  id: string;
  from: string;
  to: string;
  sign?: 1 | -1;
  kind?: string;
  /** Contribution share ∈ [0,1], where the source contract has a real one — it sets how heavily
   *  the link is drawn. Absent means "no measured share", never zero. */
  weight?: number;
  /** Asserted with nothing behind it: drawn dashed and faint, never as an established link. */
  provisional?: boolean;
}

export interface WorldData {
  nodes: MorphNodeDatum[];
  edges: MorphEdgeDatum[];
  outcomeId?: string;
}

export type NodeFace = 'card' | 'entry' | 'mark';

export interface PlacedNode {
  x: number;
  y: number;
  w: number;
  h: number;
  face: NodeFace;
  shelved?: boolean;
  /** Semantic-zoom child parked ON its parent because the parent is not expanded. It is placed,
   *  never dropped — but it must not paint, or it covers the card it belongs to. */
  folded?: boolean;
}

export interface ChromeSpec {
  bands: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    className: string;
    label?: string;
  }>;
  paths: Array<{ id: string; d: string; className: string; draw?: boolean }>;
  labels: Array<{
    id: string;
    x: number;
    y: number;
    text: string;
    className: string;
    anchor?: 'start' | 'middle' | 'end';
  }>;
}

export interface MorphLayout {
  rep: Representation;
  positions: Map<string, PlacedNode>;
  /** `width` is a screen-px stroke weight (the paths draw with non-scaling-stroke); omitted where
   *  the layout has nothing to say about how heavy the link is. */
  edgePaths: Array<{ id: string; d: string; className: string; width?: number }>;
  chrome: ChromeSpec;
  bbox: Bbox;
}

export interface LayoutOpts {
  expandedIds?: ReadonlySet<string>;
  previous?: ReadonlyMap<string, { x: number; y: number }>;
  /** The box this layout's bbox will be fitted into, in px (the viewport less the fit margin) — a
   *  HINT, never a clip. A composition that could not be read at the scale it would be fitted to
   *  wraps instead (graphLayout's reading bands); layouts with a fixed axis ignore it. */
  viewport?: { w: number; h: number };
}

export type LayoutFn = (world: WorldData, opts?: LayoutOpts) => MorphLayout;
