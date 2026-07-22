// PipingSchematic — a P&ID-lite piping / HVAC / hydraulic flow schematic. Each component is
// drawn as its standard process glyph (tank, pump, gate valve, heater, filter, instrument
// bubble, in-line fitting) and joined by right-angle connector runs that optionally carry a
// flow-direction arrowhead and a line-size label. The model supplies only the equipment and how
// it's plumbed; coords are auto-gridded when omitted, so the figure is always laid out and
// inherits the design system in light and dark.
import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { PipingSchematicProps, PipingKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PipingSchematicProps & { delay?: number };

const VB_W = 100;
const VB_H = 60;

// Each component is an inline glyph centred on (0,0), ~16 units wide.
function glyph(kind: PipingKind): ReactNode {
  switch (kind) {
    case 'tank':
      return (
        <g className="dg-pip-glyph">
          <rect x={-7} y={-8} width={14} height={16} rx={3} fill="none" />
          <line x1={-7} y1={3} x2={7} y2={3} className="dg-pip-fluid" />
        </g>
      );
    case 'pump':
      return (
        <g className="dg-pip-glyph">
          <circle cx={0} cy={0} r={7} fill="none" />
          {/* impeller vanes */}
          <line x1={0} y1={0} x2={6} y2={0} />
          <line x1={0} y1={0} x2={-3.5} y2={5.5} />
          <line x1={0} y1={0} x2={-3.5} y2={-5.5} />
        </g>
      );
    case 'valve':
      // Gate valve: two triangles meeting at a point (a bow-tie).
      return (
        <g className="dg-pip-glyph">
          <polygon points="-6,-5 -6,5 0,0" fill="none" />
          <polygon points="6,-5 6,5 0,0" fill="none" />
        </g>
      );
    case 'heater':
      return (
        <g className="dg-pip-glyph">
          <rect x={-8} y={-6} width={16} height={12} rx={2} fill="none" />
          {/* a sine coil */}
          <path d="M -6,0 q 1.5,-4 3,0 t 3,0 t 3,0" fill="none" />
        </g>
      );
    case 'filter':
      return (
        <g className="dg-pip-glyph">
          <polygon points="-6,-6 6,-6 0,7" fill="none" />
          <line x1={-3.4} y1={-2} x2={3.4} y2={-2} className="dg-pip-fluid" />
        </g>
      );
    case 'sensor':
      // Instrument bubble (ISA-style tag circle).
      return (
        <g className="dg-pip-glyph">
          <circle cx={0} cy={0} r={6.5} fill="none" />
          <line x1={-6.5} y1={0} x2={6.5} y2={0} className="dg-pip-thin" />
        </g>
      );
    case 'fitting':
      // An elbow / tee node.
      return (
        <g className="dg-pip-glyph">
          <circle cx={0} cy={0} r={2.4} className="dg-pip-fill" />
        </g>
      );
    default: // pipe — a plain in-line spool
      return (
        <g className="dg-pip-glyph">
          <rect x={-7} y={-2.6} width={14} height={5.2} rx={1.4} fill="none" />
        </g>
      );
  }
}

export function PipingSchematic({
  title,
  icon = 'sliders',
  iconColor = 'var(--insight)',
  components,
  lines,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;
  // Per-instance arrow marker id so two schematics in one answer don't share a def.
  const arrowId = `dg-pip-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;

  // Honour explicit coords; otherwise tile components on a centred grid.
  const pos = useMemo(() => {
    const n = Math.max(1, components.length);
    const cols = Math.min(n, Math.ceil(Math.sqrt(n) * 1.5));
    const rows = Math.ceil(n / cols);
    const cw = VB_W / (cols + 1);
    const ch = VB_H / (rows + 1);
    const m: Record<string, { x: number; y: number }> = {};
    components.forEach((c, i) => {
      if (c.x !== undefined && c.y !== undefined) {
        m[c.id] = { x: c.x, y: c.y };
      } else {
        const r = Math.floor(i / cols);
        const col = i % cols;
        m[c.id] = { x: cw * (col + 1), y: ch * (r + 1) };
      }
    });
    return m;
  }, [components]);

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
      <div className="dg-pip">
        <svg
          viewBox={`-8 -9 ${VB_W + 16} ${VB_H + 20}`}
          className="dg-pip-svg"
          role="img"
          aria-label={title || 'piping schematic'}
        >
          <defs>
            <marker id={arrowId} markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="dg-pip-arrowhead" />
            </marker>
          </defs>
          {/* connector lines under components, routed orthogonally with an elbow */}
          {lines.map((l, i) => {
            const a = pos[l.from];
            const b = pos[l.to];
            if (!a || !b) return null;
            const ex = b.x;
            const ey = a.y;
            return (
              <g key={i}>
                <polyline
                  points={`${a.x},${a.y} ${ex},${ey} ${b.x},${b.y}`}
                  className="dg-pip-line"
                  fill="none"
                  markerEnd={l.flow ? arrow : undefined}
                />
                {l.size && (
                  <text x={(a.x + ex) / 2} y={ey - 1.8} className="dg-pip-size" textAnchor="middle">
                    {l.size}
                  </text>
                )}
              </g>
            );
          })}
          {/* components */}
          {components.map((c) => {
            const p = pos[c.id];
            if (!p) return null;
            return (
              <g key={c.id} transform={`translate(${p.x} ${p.y})`}>
                {glyph(c.kind)}
                {c.label && (
                  <text x={0} y={13.5} className="dg-pip-lbl" textAnchor="middle">
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {caption && <p className="dg-pip-cap">{caption}</p>}
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
