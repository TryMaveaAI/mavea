import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { CircuitDiagramProps, CircuitKind } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { extent, knownKind, labelY, routeWires, type RoutedPart } from './circuitRoute';

type Props = CircuitDiagramProps & { delay?: number };

/** Components are authored on a 0–100 grid. The frame always spans that grid's width, so a
 *  sparse circuit keeps the same scale as a full one, and hugs the drawing vertically so a
 *  one-row loop is not floated in a square of empty card. */
const GRID_L = -10;
const GRID_R = 110;
const PAD = 6;

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
  const parts = useMemo<(RoutedPart & { full?: string })[]>(
    () =>
      (Array.isArray(components) ? components : [])
        .filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y))
        .map((c) => {
          const full = typeof c.label === 'string' && c.label ? c.label : undefined;
          return {
            id: c.id,
            kind: knownKind(c.kind),
            x: c.x,
            y: c.y,
            label: full && truncate(full, LABEL_MAX_CHARS),
            full,
          };
        }),
    [components],
  );
  const routes = useMemo(
    () => routeWires(parts, Array.isArray(wires) ? wires : []),
    [parts, wires],
  );
  const box = extent(parts, routes);
  const vx = Math.min(GRID_L, box.l - PAD);
  const vy = box.t - PAD;
  const vw = Math.max(GRID_R, box.r + PAD) - vx;
  const vh = box.b + PAD - vy;

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
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="dg-cir-svg"
          role="img"
          aria-label={title}
        >
          {/* wires under the parts, lead to lead */}
          {routes.map((r) => (
            <polyline
              key={r.index}
              points={r.points.map((q) => `${q.x},${q.y}`).join(' ')}
              className="dg-cir-wire"
              fill="none"
            />
          ))}
          {parts.map((c, index) => (
            <g key={`${c.id}-${index}`} transform={`translate(${c.x} ${c.y})`}>
              {glyph(c.kind)}
              {c.label && (
                <text x={0} y={labelY(c.kind)} className="dg-cir-lbl" textAnchor="middle">
                  {c.full !== c.label && <title>{c.full}</title>}
                  {c.label}
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
