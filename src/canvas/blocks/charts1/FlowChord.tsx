import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { FlowChordProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FlowChordProps & { delay?: number };

// Node ring geometry, padded exactly the way LifeWheel pads its rim labels: the card clips
// with `overflow: hidden`, so a label has to live INSIDE the viewBox rather than lean on
// `overflow: visible` (which the card would clip anyway). CX/CY sit at the true center of the
// padded box; PAD_X is wider than PAD_Y because the longest labels land at the ring's left/right,
// not its top/bottom.
const CX = 200,
  CY = 150,
  R = 105;
const PAD_X = 90,
  PAD_Y = 42;
const VB_W = CX * 2 + PAD_X * 2;
const VB_H = CY * 2 + PAD_Y * 2;
const LABEL_R = R + 18;

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

interface ChordNode {
  id: string;
  label: string;
  color: string;
  angle: number;
  x: number;
  y: number;
}
interface ChordFlow {
  key: string;
  from: string;
  to: string;
  value: number;
  color: string;
  thick: number;
  d: string;
}

function angleFor(i: number, n: number): number {
  return (i / n) * Math.PI * 2 - Math.PI / 2;
}

// Circular relationship/flow diagram: nodes ring the card's perimeter and each flow is a single
// Bezier ribbon between its two endpoints, pulled toward the ring's center so it reads as an arc
// rather than a straight chord — the same curved-link idea Sankey already uses between its
// layered columns, just bent onto a circle instead of two x-columns. Ribbon width scales with
// `value`, mirroring Sankey's flow-width-by-value logic exactly.
export function FlowChord({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  flows,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<string | null>(null); // a node id or a flow key

  const model = useMemo(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];

    // Every node needs a stable id to be a flow endpoint. A generic-coerced block only
    // guarantees `label` survived (the itemShape's text field) — `id` itself can be missing
    // on a loose model reply, so fall back to the label, then a positional key, and de-dupe
    // (first wins) so two nodes never collide on the same id.
    const seen = new Set<string>();
    const raw: { id: string; label: string; color: string }[] = [];
    safeNodes.forEach((n, i) => {
      const rawId = typeof n?.id === 'string' ? n.id.trim() : '';
      const label = typeof n?.label === 'string' ? n.label.trim() : '';
      const id = rawId || label || `node-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      raw.push({ id, label: label || id, color: n?.color || PALETTE[raw.length % PALETTE.length] });
    });
    const built: ChordNode[] = raw.map((n, i) => {
      const a = angleFor(i, raw.length);
      return { ...n, angle: a, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });

    const byId = new Map(built.map((n) => [n.id, n]));
    const through = new Map<string, number>();
    const safeFlows = Array.isArray(flows) ? flows : [];
    const values = safeFlows
      .map((f) => (Number.isFinite(f?.value) ? (f.value as number) : 0))
      .filter((v) => v > 0);
    const maxValue = Math.max(1, ...values);

    const chordFlows: ChordFlow[] = [];
    safeFlows.forEach((f, i) => {
      const from = typeof f?.from === 'string' ? f.from.trim() : '';
      const to = typeof f?.to === 'string' ? f.to.trim() : '';
      const value = Number.isFinite(f?.value) ? (f.value as number) : 0;
      const a = byId.get(from);
      const b = byId.get(to);
      // Drop a flow this generic-coerced prop can't actually locate, references itself, or
      // carries no positive size — never guess an endpoint or a value the model didn't give.
      if (!a || !b || from === to || value <= 0) return;
      through.set(from, (through.get(from) || 0) + value);
      through.set(to, (through.get(to) || 0) + value);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Pull the control point 45% of the way toward the ring's center so the ribbon bows
      // inward like a chord instead of drawing a straight line across the circle.
      const qx = mx + (CX - mx) * 0.45;
      const qy = my + (CY - my) * 0.45;
      chordFlows.push({
        key: `${from}->${to}-${i}`,
        from,
        to,
        value,
        color: a.color,
        thick: 1.5 + (value / maxValue) * 9,
        d: `M${a.x} ${a.y} Q${qx} ${qy} ${b.x} ${b.y}`,
      });
    });

    // Highest-throughput node is the main hub — Mavéa's drawn gesture circles it, same
    // convention Sankey/Network use for their own salient mark.
    const salientId =
      built.length > 0
        ? built.reduce(
            (best, n) => ((through.get(n.id) || 0) > (through.get(best.id) || 0) ? n : best),
            built[0],
          ).id
        : null;

    return { nodes: built, flows: chordFlows, salientId };
  }, [nodes, flows]);

  if (model.nodes.length === 0) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  const isFlowLit = (f: ChordFlow) =>
    !hover || hover === f.key || hover === f.from || hover === f.to;
  const isNodeLit = (id: string) =>
    !hover ||
    hover === id ||
    model.flows.some((f) => f.key === hover && (f.from === id || f.to === id));

  const hoveredFlow = model.flows.find((f) => f.key === hover);
  const hoveredNode = model.nodes.find((n) => n.id === hover);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`${-PAD_X} ${-PAD_Y} ${VB_W} ${VB_H}`}
        className="c1-fc-svg"
      >
        {model.flows.map((f) => {
          const lit = isFlowLit(f);
          return (
            <path
              key={f.key}
              d={f.d}
              fill="none"
              stroke={f.color}
              strokeWidth={f.thick}
              opacity={lit ? 0.45 : 0.08}
              style={{ transition: 'opacity var(--m-fast)', cursor: 'pointer' }}
              onMouseEnter={() => setHover(f.key)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {model.nodes.map((n) => {
          const lit = isNodeLit(n.id);
          const active = hover === n.id;
          const lx = CX + LABEL_R * Math.cos(n.angle);
          const ly = CY + LABEL_R * Math.sin(n.angle);
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={active ? 7 : 5.5}
                fill={n.color}
                opacity={lit ? 1 : 0.3}
                stroke="var(--surface-default)"
                strokeWidth={2}
                data-mark={n.id === model.salientId ? 'circle' : undefined}
                style={{ transition: 'opacity var(--m-fast)' }}
              />
              <text
                x={lx}
                y={ly}
                textAnchor={Math.abs(lx - CX) < 10 ? 'middle' : lx > CX ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize="10.5"
                fill={active ? 'var(--text-primary)' : 'var(--text-secondary)'}
                opacity={lit ? 1 : 0.35}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {hoveredFlow ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {model.nodes.find((n) => n.id === hoveredFlow.from)?.label} →{' '}
              {model.nodes.find((n) => n.id === hoveredFlow.to)?.label}
            </strong>{' '}
            · {unit}
            {formatValue(hoveredFlow.value)}
          </span>
        ) : hoveredNode ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{hoveredNode.label}</strong>
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a node or flow to trace it</span>
        )}
      </div>
    </div>
  );
}
