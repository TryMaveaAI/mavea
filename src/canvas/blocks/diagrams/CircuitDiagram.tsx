import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { CircuitDiagramProps, CircuitComponent, CircuitKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CircuitDiagramProps & { delay?: number };

const W = 100;
const H = 100;

// Each component is an inline schematic glyph centred on (0,0), ~14 units wide.
function glyph(kind: CircuitKind): ReactNode {
  switch (kind) {
    case 'battery':
      return (
        <g className="dg-cir-glyph">
          <line x1={-2.5} y1={-5} x2={-2.5} y2={5} strokeWidth={1.4} />
          <line x1={2.5} y1={-2.5} x2={2.5} y2={2.5} strokeWidth={1.4} />
          <line x1={-7} y1={0} x2={-2.5} y2={0} />
          <line x1={2.5} y1={0} x2={7} y2={0} />
        </g>
      );
    case 'resistor':
      return (
        <g className="dg-cir-glyph">
          <line x1={-7} y1={0} x2={-5} y2={0} />
          <polyline points="-5,0 -4,-3 -2,3 0,-3 2,3 4,-3 5,0" fill="none" />
          <line x1={5} y1={0} x2={7} y2={0} />
        </g>
      );
    case 'capacitor':
      return (
        <g className="dg-cir-glyph">
          <line x1={-7} y1={0} x2={-1.5} y2={0} />
          <line x1={-1.5} y1={-4} x2={-1.5} y2={4} />
          <line x1={1.5} y1={-4} x2={1.5} y2={4} />
          <line x1={1.5} y1={0} x2={7} y2={0} />
        </g>
      );
    case 'bulb':
      return (
        <g className="dg-cir-glyph">
          <line x1={-7} y1={0} x2={-5} y2={0} />
          <circle cx={0} cy={0} r={5} fill="none" />
          <line x1={-3.5} y1={-3.5} x2={3.5} y2={3.5} />
          <line x1={-3.5} y1={3.5} x2={3.5} y2={-3.5} />
          <line x1={5} y1={0} x2={7} y2={0} />
        </g>
      );
    case 'switch':
      return (
        <g className="dg-cir-glyph">
          <line x1={-7} y1={0} x2={-4} y2={0} />
          <circle cx={-4} cy={0} r={1} />
          <line x1={-4} y1={0} x2={4} y2={-4} />
          <circle cx={4} cy={0} r={1} />
          <line x1={4} y1={0} x2={7} y2={0} />
        </g>
      );
    case 'ground':
      return (
        <g className="dg-cir-glyph">
          <line x1={0} y1={-7} x2={0} y2={0} />
          <line x1={-5} y1={0} x2={5} y2={0} strokeWidth={1.4} />
          <line x1={-3} y1={2.5} x2={3} y2={2.5} />
          <line x1={-1.5} y1={5} x2={1.5} y2={5} />
        </g>
      );
    default:
      return <circle cx={0} cy={0} r={1.6} className="dg-cir-node" />;
  }
}

// Top edge (min y) of each glyph's drawn geometry, read off the coordinates above — glyphs are
// centred on (0,0) but aren't symmetric in height (e.g. ground's lead runs to y=-7, the resistor's
// zigzag only to y=-3). A fixed label offset tuned for the shortest glyph collides with the
// tallest ones (ground, battery, bulb); computing it per kind keeps the label clear of every glyph.
const GLYPH_TOP: Record<CircuitKind, number> = {
  battery: -5,
  resistor: -3,
  capacitor: -4,
  bulb: -5,
  switch: -4,
  ground: -7,
  node: -1.6,
};
const LABEL_GAP = 3;

/** Label baseline sits `LABEL_GAP` units above the glyph's own top edge, so longer labels or a
 *  taller glyph (ground, battery) never collide with the glyph they annotate. */
function labelY(kind: CircuitKind): number {
  return (GLYPH_TOP[kind] ?? GLYPH_TOP.node) - LABEL_GAP;
}

// SVG text neither wraps nor clips itself, so a long label (or many tightly-spaced components)
// runs into neighbouring glyphs. Truncate to a conservative character budget and keep the full
// text as a native <title> tooltip so nothing is silently lost — same idiom as GraphTrace.
const LABEL_MAX_CHARS = 14;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function CircuitDiagram({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  components,
  wires,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark || Icon.share;
  const byId = (id: string): CircuitComponent | undefined => components.find((c) => c.id === id);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="dg-cir">
        <svg
          viewBox={`-10 -15 ${W + 20} ${H + 30}`}
          className="dg-cir-svg"
          role="img"
          aria-label={title}
        >
          {/* wires (drawn under components), routed as right-angle Manhattan paths */}
          {wires.map((w, i) => {
            const a = byId(w.from);
            const b = byId(w.to);
            if (!a || !b) return null;
            return (
              <polyline
                key={i}
                points={`${a.x},${a.y} ${b.x},${a.y} ${b.x},${b.y}`}
                className="dg-cir-wire"
                fill="none"
              />
            );
          })}
          {/* components */}
          {components.map((c) => (
            <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
              {glyph(c.kind)}
              {c.label && (
                <text x={0} y={labelY(c.kind)} className="dg-cir-lbl" textAnchor="middle">
                  {c.label.length > LABEL_MAX_CHARS && <title>{c.label}</title>}
                  {truncate(c.label, LABEL_MAX_CHARS)}
                </text>
              )}
            </g>
          ))}
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
