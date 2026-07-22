import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { effectiveValue } from '../../lib/squarify';
import type { SunburstNode, SunburstProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SunburstProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--insight-soft)',
];

interface Arc {
  node: SunburstNode;
  a0: number;
  a1: number;
  ring: number;
  color: string;
  childIdx: number; // index within current focus's first level
}

const CX = 150,
  CY = 150,
  R0 = 46,
  RING = 34;

function polar(cx: number, cy: number, r: number, a: number) {
  return [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
}
function arcPath(a0: number, a1: number, rIn: number, rOut: number) {
  const [x0, y0] = polar(CX, CY, rOut, a0);
  const [x1, y1] = polar(CX, CY, rOut, a1);
  const [x2, y2] = polar(CX, CY, rIn, a1);
  const [x3, y3] = polar(CX, CY, rIn, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0} ${y0} A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}

function build(
  node: SunburstNode,
  a0: number,
  a1: number,
  ring: number,
  color: string,
  childIdx: number,
  acc: Arc[],
  maxRing: number,
) {
  if (ring > 0) acc.push({ node, a0, a1, ring, color, childIdx });
  if (ring >= maxRing || !node.children) return;
  // Spans are sized by each child's rolled-up value (its own value if a leaf, else the sum of
  // its descendants') — a container node authored with `value: 0` and its magnitude living
  // entirely in its children used to collapse to a zero-width wedge; effectiveValue fixes that.
  const total = node.children.reduce((s, c) => s + effectiveValue(c), 0) || 1;
  let a = a0;
  node.children.forEach((c, i) => {
    const span = ((a1 - a0) * effectiveValue(c)) / total;
    const col = ring === 0 ? PALETTE[i % PALETTE.length] : color;
    build(c, a, a + span, ring + 1, col, ring === 0 ? i : childIdx, acc, maxRing);
    a += span;
  });
}

export function Sunburst({
  title,
  icon = 'chart',
  iconColor = 'var(--insight)',
  root,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [path, setPath] = useState<number[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const focus = useMemo(() => {
    let n = root;
    for (const idx of path) if (n.children?.[idx]) n = n.children[idx];
    return n;
  }, [root, path]);

  const arcs = useMemo(() => {
    const acc: Arc[] = [];
    build(focus, 0, Math.PI * 2, 0, 'var(--presence)', -1, acc, 2);
    return acc;
  }, [focus]);

  const hovered = arcs.find((a) => a.node.label === hover);
  // Rolled up the same way as each wedge's span (see build()), so the center readout and every
  // legend row's % agree with what the rings actually show.
  const total = effectiveValue(focus) || 1;
  // Largest ring-1 arc is the dominant slice — Mavéa's drawn gesture circles it.
  const salientLabel = useMemo(() => {
    const ring1 = arcs.filter((a) => a.ring === 1);
    if (!ring1.length) return null;
    return ring1.reduce(
      (best, a) => (effectiveValue(a.node) > effectiveValue(best.node) ? a : best),
      ring1[0],
    ).node.label;
  }, [arcs]);
  // The legend row is what Mavéa's "circle" gesture hugs — a wide wedge's own bounding box
  // spans most of the whole sunburst, so lassoing that box would loop the hub and
  // neighbouring rings instead of the wedge itself; the legend row is a real, tightly-bounded
  // element instead.
  const salientLegendIdx = focus.children?.findIndex((c) => c.label === salientLabel) ?? -1;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c1-sun-wrap">
        <svg
          role="img"
          aria-label={title}
          viewBox="0 0 300 300"
          width="100%"
          className="c1-sunburst"
        >
          {arcs.map((a, i) => {
            const rIn = R0 + (a.ring - 1) * RING;
            const rOut = R0 + a.ring * RING - 3;
            const active = hover === a.node.label;
            const dim = hover && !active;
            const drillable = !!(a.ring === 1 && a.node.children?.length);
            return (
              <path
                key={i}
                d={arcPath(a.a0, a.a1, rIn, rOut)}
                fill={`color-mix(in oklab, ${a.color} ${active ? 70 : 38 - a.ring * 6}%, transparent)`}
                stroke={a.color}
                strokeWidth={active ? 1.6 : 0.8}
                opacity={dim ? 0.4 : 1}
                style={{
                  cursor: drillable ? 'pointer' : 'default',
                  transition: 'opacity var(--m-fast), fill var(--m-fast)',
                }}
                onMouseEnter={() => setHover(a.node.label)}
                onMouseLeave={() => setHover(null)}
                onClick={() => drillable && setPath([...path, a.childIdx])}
              />
            );
          })}
          {/* center hub — click to go up a level */}
          <circle
            cx={CX}
            cy={CY}
            r={R0 - 6}
            fill="var(--surface-elevated)"
            stroke="var(--line-strong)"
            style={{ cursor: path.length ? 'pointer' : 'default' }}
            onClick={() => path.length && setPath(path.slice(0, -1))}
          />
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="var(--text-primary)"
          >
            {focus.label}
          </text>
          <text
            x={CX}
            y={CY + 13}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            className="tab-num"
          >
            {path.length ? '‹ back' : unit + total.toLocaleString()}
          </text>
        </svg>

        <div className="c1-sun-legend">
          {(focus.children || []).map((c, i) => (
            <button
              key={i}
              className={'c1-legend-row' + (hover === c.label ? ' active' : '')}
              onMouseEnter={() => setHover(c.label)}
              onMouseLeave={() => setHover(null)}
              onClick={() => c.children?.length && setPath([...path, i])}
              data-mark={i === salientLegendIdx ? 'circle' : undefined}
            >
              <span className="c1-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="c1-legend-label">{c.label}</span>
              <span className="tab-num faint">
                {Math.round((effectiveValue(c) / total) * 100)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {hovered ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{hovered.node.label}</strong> · {unit}
            {effectiveValue(hovered.node).toLocaleString()} ·{' '}
            {Math.round((effectiveValue(hovered.node) / total) * 100)}% of {focus.label}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Click a slice to zoom · center to step back</span>
        )}
      </div>
    </div>
  );
}
