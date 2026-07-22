import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { ShapeCardProps, ShapeEntry, ShapeKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ShapeCardProps & { delay?: number };

// Each figure is drawn in its own square cell viewBox.
const VB = 100;
const C = VB / 2;
const RAD = 38; // polygon circumradius

/** Regular-polygon vertices for `sides`, point-up, centred — computed, never hand-placed. */
function polygonPoints(sides: number): string {
  const start = -Math.PI / 2; // first vertex at the top
  return Array.from({ length: sides }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / sides;
    return `${(C + Math.cos(a) * RAD).toFixed(1)},${(C + Math.sin(a) * RAD).toFixed(1)}`;
  }).join(' ');
}

/** How many sides a named polygon has (used when the model doesn't give one). */
const POLY_SIDES: Partial<Record<ShapeKind, number>> = {
  triangle: 3,
  square: 4,
  rectangle: 4,
  pentagon: 5,
  hexagon: 6,
  octagon: 8,
};

/** Draw one figure for the given kind, computed from its geometry. */
function ShapeGlyph({ kind, color }: { kind: ShapeKind; color: string }): ReactNode {
  const fill = `color-mix(in oklab, ${color} 18%, transparent)`;
  const common = { fill, stroke: color, className: 'lr-sc-figure' };

  if (kind === 'circle') {
    return <circle cx={C} cy={C} r={RAD} {...common} />;
  }
  if (kind === 'rectangle') {
    return <rect x={C - 42} y={C - 26} width={84} height={52} rx={2} {...common} />;
  }
  if (kind === 'square') {
    return <rect x={C - 34} y={C - 34} width={68} height={68} rx={2} {...common} />;
  }
  if (kind === 'sphere') {
    return (
      <g>
        <circle cx={C} cy={C} r={RAD} {...common} />
        <ellipse cx={C} cy={C} rx={RAD} ry={RAD * 0.34} className="lr-sc-edge lr-sc-edge--hidden" />
      </g>
    );
  }
  if (kind === 'cube') {
    const s = 44;
    const dx = 18;
    const dy = -18;
    const x = C - s / 2 - dx / 2;
    const y = C + s / 2 - dy / 2;
    const off = (px: number, py: number) => `${(px + dx).toFixed(1)},${(py + dy).toFixed(1)}`;
    return (
      <g>
        {/* back face (dashed) */}
        <polygon
          points={`${off(x, y)} ${off(x + s, y)} ${off(x + s, y - s)} ${off(x, y - s)}`}
          className="lr-sc-face lr-sc-face--hidden"
        />
        {/* front face */}
        <polygon points={`${x},${y} ${x + s},${y} ${x + s},${y - s} ${x},${y - s}`} {...common} />
        {/* top + side */}
        <polygon
          points={`${x},${y - s} ${x + s},${y - s} ${off(x + s, y - s)} ${off(x, y - s)}`}
          className="lr-sc-face lr-sc-face--side"
          style={{ fill, stroke: color } as CSSProperties}
        />
        <polygon
          points={`${x + s},${y} ${off(x + s, y)} ${off(x + s, y - s)} ${x + s},${y - s}`}
          className="lr-sc-face lr-sc-face--side"
          style={{ fill, stroke: color } as CSSProperties}
        />
      </g>
    );
  }
  if (kind === 'cylinder') {
    const rx = 30;
    const ry = 10;
    const top = C - 30;
    const bot = C + 30;
    return (
      <g>
        <ellipse cx={C} cy={bot} rx={rx} ry={ry} className="lr-sc-edge lr-sc-edge--hidden" />
        <path
          d={`M ${C - rx} ${top} L ${C - rx} ${bot} A ${rx} ${ry} 0 0 0 ${C + rx} ${bot} L ${C + rx} ${top}`}
          {...common}
        />
        <ellipse cx={C} cy={top} rx={rx} ry={ry} {...common} />
      </g>
    );
  }
  if (kind === 'cone') {
    const rx = 30;
    const ry = 10;
    const bot = C + 30;
    const apexY = C - 34;
    return (
      <g>
        <path d={`M ${C - rx} ${bot} L ${C} ${apexY} L ${C + rx} ${bot}`} {...common} />
        <ellipse cx={C} cy={bot} rx={rx} ry={ry} {...common} />
      </g>
    );
  }
  if (kind === 'pyramid') {
    const s = 44;
    const dx = 16;
    const dy = -14;
    const x = C - s / 2 - dx / 2;
    const y = C + s / 2 - dy / 2;
    const apex = { x: C, y: y - s - 4 };
    const off = (px: number, py: number) => ({ x: px + dx, y: py + dy });
    const br = off(x + s, y);
    const bl = off(x, y);
    return (
      <g>
        <polygon
          points={`${x},${y} ${x + s},${y} ${br.x},${br.y} ${bl.x},${bl.y}`}
          className="lr-sc-face lr-sc-face--hidden"
        />
        <polygon points={`${x},${y} ${x + s},${y} ${apex.x},${apex.y}`} {...common} />
        <polygon
          points={`${x + s},${y} ${br.x},${br.y} ${apex.x},${apex.y}`}
          className="lr-sc-face lr-sc-face--side"
          style={{ fill, stroke: color } as CSSProperties}
        />
      </g>
    );
  }
  // a regular polygon (triangle / pentagon / hexagon / octagon)
  const sides = POLY_SIDES[kind] ?? 6;
  return <polygon points={polygonPoints(sides)} {...common} />;
}

// The three accent tokens cycle across the gallery cells.
const ACCENT_CYCLE = ['var(--presence)', 'var(--insight)', 'var(--warning)'] as const;

/** The attribute chips a shape carries — only the ones the model supplied are shown. */
function attrChips(s: ShapeEntry): { k: string; v: number }[] {
  const out: { k: string; v: number }[] = [];
  if (s.sides !== undefined) out.push({ k: 'Sides', v: s.sides });
  if (s.vertices !== undefined) out.push({ k: 'Vertices', v: s.vertices });
  if (s.faces !== undefined) out.push({ k: 'Faces', v: s.faces });
  if (s.edges !== undefined) out.push({ k: 'Edges', v: s.edges });
  return out;
}

export function ShapeCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  shapes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

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

      <ul className="lr-sc-grid">
        {shapes.map((s, i) => {
          const color = ACCENT_CYCLE[i % ACCENT_CYCLE.length];
          return (
            <li key={i} className="lr-sc-cell">
              <svg viewBox={`0 0 ${VB} ${VB}`} className="lr-sc-svg" role="img" aria-label={s.name}>
                <ShapeGlyph kind={s.kind} color={color} />
              </svg>
              <div className="lr-sc-name" style={{ color }}>
                {s.name}
              </div>
              {attrChips(s).length > 0 && (
                <div className="lr-sc-attrs">
                  {attrChips(s).map((a) => (
                    <span key={a.k} className="lr-sc-attr">
                      <i className="lr-sc-attr-k">{a.k}</i>
                      <b className="lr-sc-attr-v">{a.v}</b>
                    </span>
                  ))}
                </div>
              )}
              {s.example && <div className="lr-sc-example">{s.example}</div>}
            </li>
          );
        })}
      </ul>

      {caption && <p className="lr-sc-cap">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
