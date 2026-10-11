import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import type { EnergyDiagramProps, EnergyNode } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { profileHitsBox, profileYAt } from './energyLayout';
import { boxesOverlap, firstClear, labelBox, type Box } from './labelPlace';

type Props = EnergyDiagramProps & { delay?: number };

const W = 360;
const H = 280;
const LEFT = 46; // room for the y-axis (energy) tick labels
const RIGHT = 16;
const TOP = 20;
const BOT = 30; // room for the x-axis label
const LBL_FS = 10.5; // .enz-node-lbl / .enz-measure-lbl at their largest, for width estimates
const LBL_H = 11; // one label line, ascender to descender
// Heights along a measurement arrow to try its label at, best first: the middle, then out
// toward either end where a flank of the profile has usually moved further away.
const ALONG = [0.5, 0.35, 0.65, 0.2, 0.8];

type Anchor = 'start' | 'middle' | 'end';
interface Placed {
  x: number;
  y: number;
  anchor: Anchor;
  lines: string[];
  box: Box;
}

// Default per-kind accents. The transition state is the "danger" (high-energy) point;
// reactants/products are neutral plateaus; intermediates sit in a (warning) well.
const KIND_COLOR: Record<EnergyNode['kind'] & string, string> = {
  reactant: 'var(--presence)',
  ts: 'var(--danger)',
  intermediate: 'var(--warning)',
  product: 'var(--insight)',
};

/** Build the ordered node list from either explicit endpoints or a free `steps` array. */
function resolveNodes(p: EnergyDiagramProps): EnergyNode[] {
  if (p.steps && p.steps.length >= 2) return p.steps;
  // Endpoint form: reactants → (optional ts) → products.
  const out: EnergyNode[] = [];
  if (p.reactants !== undefined)
    out.push({ label: p.reactantLabel ?? 'Reactants', energy: p.reactants, kind: 'reactant' });
  if (p.ts !== undefined)
    out.push({ label: p.tsLabel ?? 'Transition state', energy: p.ts, kind: 'ts' });
  if (p.products !== undefined)
    out.push({ label: p.productLabel ?? 'Products', energy: p.products, kind: 'product' });
  return out;
}

/** Pick a plotted x for each node: plateaus (reactant/intermediate/product) get a flat shelf,
 *  peaks (ts) sit at a single point between their neighbours. Returns x-fractions in 0..1. */
function layoutX(nodes: EnergyNode[]): { cx: number; half: number }[] {
  // A plateau occupies a shelf of width `shelf`; a peak is a point (half = 0). We distribute the
  // available 0..1 track across the nodes, giving plateaus a little width so they read as a level.
  const shelf = nodes.length > 4 ? 0.08 : 0.12;
  const isPlateau = (n: EnergyNode) => n.kind !== 'ts';
  const slots = nodes.length;
  return nodes.map((n, i) => {
    const cx = slots === 1 ? 0.5 : i / (slots - 1);
    return { cx, half: isPlateau(n) ? shelf : 0 };
  });
}

export function EnergyDiagram({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  steps,
  reactants,
  ts,
  products,
  reactantLabel,
  tsLabel,
  productLabel,
  yLabel = 'Energy',
  yUnit,
  xLabel = 'Reaction progress',
  showEa = true,
  showDelta = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const model = useMemo(() => {
    const nodes = resolveNodes({
      steps,
      reactants,
      ts,
      products,
      reactantLabel,
      tsLabel,
      productLabel,
      title,
    });
    if (nodes.length < 2) return null;

    // y-scale (energy → SVG, inverted so higher energy is higher on screen).
    const energies = nodes.map((n) => n.energy);
    const ex = extent(energies)!;
    const [yMin, yMax] = niceDomain(ex[0], ex[1]);
    const sy = scaleLinear([yMin, yMax], [H - BOT, TOP]);

    // x-scale: reaction progress runs left→right across the plot area.
    const sx = scaleLinear([0, 1], [LEFT, W - RIGHT]);
    const lay = layoutX(nodes);

    // Control points of the energy profile. Each plateau contributes its left & right shelf ends
    // at the same energy (a flat level); each peak/well a single apex. Endpoints clamp to the edges.
    type Pt = { x: number; y: number };
    const pts: Pt[] = [];
    nodes.forEach((n, i) => {
      const { cx, half } = lay[i];
      const y = sy(n.energy);
      if (half > 0) {
        const lx = i === 0 ? 0 : cx - half;
        const rx = i === nodes.length - 1 ? 1 : cx + half;
        pts.push({ x: sx(lx), y }, { x: sx(rx), y });
      } else {
        pts.push({ x: sx(cx), y });
      }
    });

    // Smooth cubic through the control points with horizontal tangents at each point, so plateaus
    // stay flat and peaks/wells round over — the canonical reaction-coordinate look.
    const path = pts
      .map((pt, i) => {
        if (i === 0) return `M ${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
        const prev = pts[i - 1];
        const cxr = (prev.x + pt.x) / 2;
        return `C ${cxr.toFixed(2)},${prev.y.toFixed(2)} ${cxr.toFixed(2)},${pt.y.toFixed(2)} ${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
      })
      .join(' ');

    // Per-node apex (the single representative point used for dots + labels). The end plateaus
    // run to the plot's edges, so their point is the middle of their shelf rather than the
    // shelf's outer end, which put the reactant dot on the y-axis line.
    const apex = nodes.map((n, i) => {
      const { cx, half } = lay[i];
      const end = half > 0 && (i === 0 || i === nodes.length - 1);
      return {
        node: n,
        x: sx(end ? (i === 0 ? half / 2 : 1 - half / 2) : cx),
        y: sy(n.energy),
        color: n.color || KIND_COLOR[n.kind ?? 'reactant'] || 'var(--presence)',
      };
    });

    // Activation energy: from the reactant level up to the FIRST (highest early) transition state.
    const reactant = apex[0];
    const firstTs =
      apex.find((a) => a.node.kind === 'ts') ??
      apex.slice(1).reduce((hi, a) => (a.node.energy > hi.node.energy ? a : hi), apex[1]);
    const last = apex[apex.length - 1];

    const Ea = firstTs.node.energy - reactant.node.energy;
    const dH = last.node.energy - reactant.node.energy;
    // ΔH is measured at the far end of the product shelf, clear of the descending flank.
    const dhX = sx(1) - 4;
    const drawEa = showEa && Ea > 0;

    // ── Labels: each takes the first candidate spot that keeps it off the profile, off the
    // measurement arrows and off the labels already placed. Fixed offsets put "Ea" and "ΔH"
    // right where the flanks of a typical profile run.
    const taken: Box[] = [];
    const arrow = (x: number, ya: number, yb: number): Box => ({
      x1: x - 1.5,
      y1: Math.min(ya, yb),
      x2: x + 1.5,
      y2: Math.max(ya, yb),
    });
    if (drawEa) taken.push(arrow(firstTs.x, reactant.y, firstTs.y));
    if (showDelta) taken.push(arrow(dhX, reactant.y, last.y));
    const blocked = (b: Box) =>
      b.x1 < LEFT + 2 ||
      b.x2 > W - RIGHT + 2 ||
      b.y1 < 0 ||
      b.y2 > H - BOT ||
      profileHitsBox(pts, b, 1.5) ||
      taken.some((t) => boxesOverlap(t, b));
    type Cand = { x: number; y: number; anchor: Anchor; lines: string[] };
    const place = (cands: Cand[]): Placed => {
      const pick = firstClear(
        cands.map((c) => {
          const w = Math.max(...c.lines.map((l) => estimateTextWidth(l, LBL_FS, true)));
          return { ...c, box: labelBox(c.x, c.y, w, LBL_H * c.lines.length, c.anchor) };
        }),
        blocked,
      );
      taken.push(pick.box);
      return pick;
    };
    // Where the profile crosses height `y` walking from `fromX` in `dir`: the far side of the
    // hump or well the arrow stands in.
    const crossing = (fromX: number, y: number, dir: 1 | -1): number => {
      const y0 = profileYAt(pts, fromX);
      if (y0 == null) return fromX;
      const below = y0 > y;
      for (let x = fromX; x >= LEFT && x <= W - RIGHT; x += dir) {
        const yy = profileYAt(pts, x);
        if (yy != null && yy > y !== below) return x;
      }
      return fromX;
    };
    // A measurement label's spots, best first: beside its arrow on one line, then on two (the
    // name over the value), then just outside the profile's flank at the same height, where a
    // hump narrower than the label still leaves it next to what it measures.
    const measureCands = (
      x: number,
      yFrom: number,
      yTo: number,
      sides: Anchor[],
      text: string,
      outside: [number, Anchor][],
    ): Cand[] => {
      const eq = text.indexOf(' = ');
      const split = eq > 0 ? [text.slice(0, eq + 2), text.slice(eq + 3)] : [text];
      const beside = (lines: string[]) =>
        ALONG.flatMap((f) =>
          sides.map((anchor) => ({
            x: anchor === 'start' ? x + 6 : x - 6,
            y: yFrom + (yTo - yFrom) * f,
            anchor,
            lines,
          })),
        );
      const flank = ALONG.flatMap((f) => {
        const y = yFrom + (yTo - yFrom) * f;
        return outside.map(([dir, anchor]) => ({
          x: crossing(x, y, dir as 1 | -1) + (anchor === 'start' ? 6 : -6),
          y,
          anchor,
          lines: [text],
        }));
      });
      return [...beside([text]), ...beside(split), ...flank];
    };

    const eaText = `Ea = ${fmt(Ea)}${yUnit ? ` ${yUnit}` : ''}`;
    const dhText = `ΔH = ${dH > 0 ? '+' : ''}${fmt(dH)}${yUnit ? ` ${yUnit}` : ''}`;
    // The measurements go first: they have few good spots, a node name has many.
    const eaLabel = drawEa
      ? place(
          measureCands(firstTs.x, reactant.y, firstTs.y, ['start', 'end'], eaText, [
            [-1, 'end'],
            [1, 'start'],
          ]),
        )
      : null;
    const dhLabel = showDelta
      ? place([
          ...measureCands(dhX, reactant.y, last.y, ['end'], dhText, [[-1, 'end']]),
          // Last resort: under (or over) the product shelf, right-aligned to the arrow.
          {
            x: dhX - 6,
            y: last.y + (dH <= 0 ? 13 : -13),
            anchor: 'end' as const,
            lines: [dhText],
          },
        ])
      : null;

    const nodeLabels = apex.map((a, i) => {
      const first = i === 0;
      const lastNode = i === apex.length - 1;
      const anchor: Anchor = first ? 'start' : lastNode ? 'end' : 'middle';
      const x = first ? LEFT + 4 : lastNode ? (showDelta ? dhX - 6 : W - RIGHT - 2) : a.x;
      const ys = [a.y - 13];
      if (a.node.kind !== 'ts') ys.push(a.y + 13);
      return place(ys.map((y) => ({ x, y, anchor, lines: [a.node.label] })));
    });

    return {
      nodes,
      sx,
      sy,
      yMin,
      yMax,
      path,
      apex,
      reactant,
      firstTs,
      last,
      Ea,
      dH,
      dhX,
      drawEa,
      nodeLabels,
      eaLabel,
      dhLabel,
    };
  }, [
    steps,
    reactants,
    ts,
    products,
    reactantLabel,
    tsLabel,
    productLabel,
    title,
    showEa,
    showDelta,
    yUnit,
  ]);

  const yTicks = model ? model.sy.ticks(5) : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {model && (
        <div className="enz-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="enz-svg" role="img" aria-label={title}>
            {/* Horizontal gridlines at each energy tick */}
            <g className="enz-grid">
              {yTicks.map((t) => (
                <line key={`g${t}`} x1={LEFT} y1={model.sy(t)} x2={W - RIGHT} y2={model.sy(t)} />
              ))}
            </g>

            {/* Axes */}
            <line x1={LEFT} y1={TOP} x2={LEFT} y2={H - BOT} className="enz-axis" />
            <line x1={LEFT} y1={H - BOT} x2={W - RIGHT} y2={H - BOT} className="enz-axis" />

            {/* y-axis ticks + labels */}
            {yTicks.map((t) => (
              <g key={`yt${t}`}>
                <line
                  x1={LEFT - 4}
                  y1={model.sy(t)}
                  x2={LEFT}
                  y2={model.sy(t)}
                  className="enz-axis"
                />
                <text x={LEFT - 7} y={model.sy(t) + 3} className="enz-tick" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={0}
              y={0}
              transform={`translate(13, ${(TOP + H - BOT) / 2}) rotate(-90)`}
              className="enz-axis-lbl"
              textAnchor="middle"
            >
              {yUnit ? `${yLabel} (${yUnit})` : yLabel}
            </text>
            <text x={(LEFT + W - RIGHT) / 2} y={H - 8} className="enz-axis-lbl" textAnchor="middle">
              {xLabel} →
            </text>

            {/* Reference level lines (dashed) for the Ea / ΔH measurements */}
            {showEa && (
              <line
                x1={model.reactant.x}
                y1={model.reactant.y}
                x2={model.firstTs.x}
                y2={model.reactant.y}
                className="enz-ref"
              />
            )}
            {showDelta && (
              <line
                x1={model.reactant.x}
                y1={model.reactant.y}
                x2={model.dhX}
                y2={model.reactant.y}
                className="enz-ref"
              />
            )}

            {/* The energy profile */}
            <path d={model.path} className="enz-profile" />

            {/* Activation-energy arrow (reactant level → peak) */}
            {model.drawEa && model.eaLabel && (
              <g className="enz-measure enz-measure--ea">
                <line
                  x1={model.firstTs.x}
                  y1={model.reactant.y}
                  x2={model.firstTs.x}
                  y2={model.firstTs.y}
                  markerEnd="url(#enz-arrow-ea)"
                  markerStart="url(#enz-arrow-ea)"
                />
                <text
                  x={model.eaLabel.x}
                  y={model.eaLabel.y}
                  className="enz-measure-lbl"
                  textAnchor={model.eaLabel.anchor}
                  dominantBaseline="middle"
                >
                  <LabelLines p={model.eaLabel} />
                </text>
              </g>
            )}

            {/* ΔH arrow (reactant level → product level), drawn near the right edge */}
            {showDelta && model.dhLabel && (
              <g
                className={
                  model.dH <= 0 ? 'enz-measure enz-measure--exo' : 'enz-measure enz-measure--endo'
                }
              >
                <line
                  x1={model.dhX}
                  y1={model.reactant.y}
                  x2={model.dhX}
                  y2={model.last.y}
                  markerEnd="url(#enz-arrow-dh)"
                  markerStart="url(#enz-arrow-dh)"
                />
                <text
                  x={model.dhLabel.x}
                  y={model.dhLabel.y}
                  className="enz-measure-lbl"
                  textAnchor={model.dhLabel.anchor}
                  dominantBaseline="middle"
                >
                  <LabelLines p={model.dhLabel} />
                </text>
              </g>
            )}

            {/* Node dots + labels */}
            {model.apex.map((a, i) => (
              <g key={`n${i}`}>
                <circle cx={a.x} cy={a.y} r={3.5} fill={a.color} className="enz-dot" />
                <text
                  x={model.nodeLabels[i].x}
                  y={model.nodeLabels[i].y}
                  fill={a.color}
                  className="enz-node-lbl"
                  textAnchor={model.nodeLabels[i].anchor}
                  dominantBaseline="middle"
                >
                  {a.node.label}
                </text>
              </g>
            ))}

            <defs>
              <marker
                id="enz-arrow-ea"
                markerWidth="7"
                markerHeight="7"
                refX="3.5"
                refY="3.5"
                orient="auto"
              >
                <path d="M1.2,1.2 L3.5,3.5 L1.2,5.8" className="enz-arrowhead enz-arrowhead--ea" />
              </marker>
              <marker
                id="enz-arrow-dh"
                markerWidth="7"
                markerHeight="7"
                refX="3.5"
                refY="3.5"
                orient="auto"
              >
                <path d="M1.2,1.2 L3.5,3.5 L1.2,5.8" className="enz-arrowhead enz-arrowhead--dh" />
              </marker>
            </defs>
          </svg>
        </div>
      )}

      {!model && (
        <div className="enz-empty">Provide reactant, transition-state, and product energies.</div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

/** A placed label's lines, stacked about its y (the text is middle-baselined). */
function LabelLines({ p }: { p: Placed }) {
  if (p.lines.length === 1) return <>{p.lines[0]}</>;
  return (
    <>
      {p.lines.map((l, i) => (
        <tspan key={i} x={p.x} dy={i === 0 ? (-(p.lines.length - 1) * LBL_H) / 2 : LBL_H}>
          {l}
        </tspan>
      ))}
    </>
  );
}

/** Trim float dust from a computed Ea / ΔH so labels read cleanly (e.g. 75 not 74.99999). */
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}
