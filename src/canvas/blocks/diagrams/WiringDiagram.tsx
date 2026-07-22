// WiringDiagram — a residential/automotive one-line electrical diagram drawn with the
// real trade symbols. Each device is a recognisable glyph (breaker, switch, GFCI, light…);
// wires route between fixed device ports as right-angle (Manhattan) runs colour-coded by the
// conductor they carry — hot, neutral, ground, traveler — with optional gauge labels. The
// model supplies only the devices and how they connect; when x/y are omitted we auto-place
// them on a tidy grid, so the figure is always laid out and themes from tokens in light/dark.
import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { WiringDiagramProps, WiringKind, WiringConductor } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WiringDiagramProps & { delay?: number };

const VB_W = 100;
const VB_H = 64;

// Conductor → stroke colour, matching the trade convention (black hot, green ground…).
const CONDUCTOR_CLASS: Record<WiringConductor, string> = {
  hot: 'c-hot',
  neutral: 'c-neutral',
  ground: 'c-ground',
  traveler: 'c-traveler',
};

// Each device is an inline glyph centred on (0,0), ~16 units wide, drawn in design-system ink.
function glyph(kind: WiringKind): ReactNode {
  switch (kind) {
    case 'breaker':
      return (
        <g className="dg-wir-glyph">
          <rect x={-6} y={-7} width={12} height={14} rx={1.6} fill="none" />
          <line x1={-3.5} y1={-3.5} x2={3.5} y2={-1} />
          <circle cx={0} cy={3.5} r={1} className="dg-wir-fill" />
        </g>
      );
    case 'switch':
      return (
        <g className="dg-wir-glyph">
          <circle cx={-5} cy={0} r={1.1} className="dg-wir-fill" />
          <circle cx={5} cy={0} r={1.1} className="dg-wir-fill" />
          <line x1={-5} y1={0} x2={4} y2={-5} />
        </g>
      );
    case 'switch3way':
      return (
        <g className="dg-wir-glyph">
          {/* common on the left, two travelers on the right */}
          <circle cx={-5} cy={0} r={1.1} className="dg-wir-fill" />
          <circle cx={5} cy={-3} r={1.1} className="dg-wir-fill" />
          <circle cx={5} cy={3} r={1.1} className="dg-wir-fill" />
          <line x1={-5} y1={0} x2={4} y2={-4} />
        </g>
      );
    case 'outlet':
      return (
        <g className="dg-wir-glyph">
          <circle cx={0} cy={0} r={6} fill="none" />
          <line x1={-2.2} y1={-2.6} x2={-2.2} y2={1.4} />
          <line x1={2.2} y1={-2.6} x2={2.2} y2={1.4} />
          <line x1={0} y1={3} x2={0} y2={4.4} />
        </g>
      );
    case 'gfci':
      return (
        <g className="dg-wir-glyph">
          <rect x={-6} y={-7} width={12} height={14} rx={1.6} fill="none" />
          <circle cx={0} cy={-2.4} r={1.5} fill="none" />
          <circle cx={0} cy={3} r={1.5} fill="none" />
          <text x={7.5} y={-4} className="dg-wir-tick">
            G
          </text>
        </g>
      );
    case 'light':
      return (
        <g className="dg-wir-glyph">
          <circle cx={0} cy={0} r={6} fill="none" />
          <line x1={-4.2} y1={-4.2} x2={4.2} y2={4.2} />
          <line x1={-4.2} y1={4.2} x2={4.2} y2={-4.2} />
        </g>
      );
    case 'panel':
      return (
        <g className="dg-wir-glyph">
          <rect x={-7} y={-8} width={14} height={16} rx={1.6} fill="none" />
          <line x1={-7} y1={-2} x2={7} y2={-2} />
          <line x1={-7} y1={2.5} x2={7} y2={2.5} />
          <line x1={0} y1={-8} x2={0} y2={8} />
        </g>
      );
    case 'motor':
      return (
        <g className="dg-wir-glyph">
          <circle cx={0} cy={0} r={6.5} fill="none" />
          <text x={0} y={2.6} className="dg-wir-mark" textAnchor="middle">
            M
          </text>
        </g>
      );
    case 'ground':
      return (
        <g className="dg-wir-glyph">
          <line x1={0} y1={-7} x2={0} y2={0} />
          <line x1={-5} y1={0} x2={5} y2={0} strokeWidth={1.4} />
          <line x1={-3} y1={2.6} x2={3} y2={2.6} />
          <line x1={-1.4} y1={5} x2={1.4} y2={5} />
        </g>
      );
    default: // junction
      return <circle cx={0} cy={0} r={2.2} className="dg-wir-fill" />;
  }
}

export function WiringDiagram({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  nodes,
  wires,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  // Honour explicit coords; otherwise tile devices on a centred grid so the figure is always
  // laid out even when the model gives none.
  const pos = useMemo(() => {
    const n = Math.max(1, nodes.length);
    const cols = Math.min(n, Math.ceil(Math.sqrt(n) * 1.4));
    const rows = Math.ceil(n / cols);
    const cw = VB_W / (cols + 1);
    const ch = VB_H / (rows + 1);
    const m: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node, i) => {
      if (node.x !== undefined && node.y !== undefined) {
        m[node.id] = { x: node.x, y: node.y };
      } else {
        const r = Math.floor(i / cols);
        const c = i % cols;
        m[node.id] = { x: cw * (c + 1), y: ch * (r + 1) };
      }
    });
    return m;
  }, [nodes]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      <div className="dg-wir">
        <svg
          viewBox={`-8 -10 ${VB_W + 16} ${VB_H + 22}`}
          className="dg-wir-svg"
          role="img"
          aria-label={title || 'wiring diagram'}
        >
          {/* wires under devices, routed as right-angle Manhattan runs, coloured by conductor */}
          {wires.map((w, i) => {
            const a = pos[w.from];
            const b = pos[w.to];
            if (!a || !b) return null;
            const cls = CONDUCTOR_CLASS[w.conductor ?? 'hot'];
            // Elbow at (b.x, a.y) keeps runs orthogonal; the gauge sits at the elbow.
            const ex = b.x;
            const ey = a.y;
            return (
              <g key={i}>
                <polyline
                  points={`${a.x},${a.y} ${ex},${ey} ${b.x},${b.y}`}
                  className={`dg-wir-wire ${cls}`}
                  fill="none"
                />
                {w.gauge && (
                  <text
                    x={(a.x + ex) / 2}
                    y={ey - 1.6}
                    className="dg-wir-gauge"
                    textAnchor="middle"
                  >
                    {w.gauge}
                  </text>
                )}
              </g>
            );
          })}
          {/* devices */}
          {nodes.map((node) => {
            const p = pos[node.id];
            if (!p) return null;
            return (
              <g key={node.id} transform={`translate(${p.x} ${p.y})`}>
                {glyph(node.kind)}
                {node.label && (
                  <text x={0} y={13} className="dg-wir-lbl" textAnchor="middle">
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* conductor legend, derived from the conductors actually present */}
      <WiringLegend wires={wires} />
      {caption && <p className="dg-wir-cap">{caption}</p>}
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

const CONDUCTOR_LABEL: Record<WiringConductor, string> = {
  hot: 'Hot',
  neutral: 'Neutral',
  ground: 'Ground',
  traveler: 'Traveler',
};
const CONDUCTOR_ORDER: WiringConductor[] = ['hot', 'neutral', 'ground', 'traveler'];

function WiringLegend({ wires }: { wires: WiringDiagramProps['wires'] }): ReactNode {
  const present = new Set<WiringConductor>(wires.map((w) => w.conductor ?? 'hot'));
  const items = CONDUCTOR_ORDER.filter((c) => present.has(c));
  if (items.length < 2) return null;
  return (
    <div className="dg-wir-legend">
      {items.map((c) => (
        <span key={c} className="dg-wir-legend-item">
          <span className={`dg-wir-swatch ${CONDUCTOR_CLASS[c]}`} />
          {CONDUCTOR_LABEL[c]}
        </span>
      ))}
    </div>
  );
}
