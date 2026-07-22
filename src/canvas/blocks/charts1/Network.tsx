import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NetworkProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NetworkProps & { delay?: number };

const W = 520,
  H = 320,
  CX = 260,
  CY = 160;
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

export function Network({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  edges,
  layout = 'circle',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const cw = (W - 80) / Math.max(1, cols - 1 || 1);
      const rows = Math.ceil(nodes.length / cols);
      const ch = (H - 80) / Math.max(1, rows - 1 || 1);
      nodes.forEach((n, i) => {
        const c = i % cols,
          r = Math.floor(i / cols);
        pos.set(n.id, { x: 40 + c * cw, y: 40 + r * ch });
      });
    } else {
      const R = 120;
      nodes.forEach((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
      });
    }
    const adj = new Map<string, Set<string>>();
    nodes.forEach((n) => adj.set(n.id, new Set()));
    edges.forEach((e) => {
      adj.get(e.source)?.add(e.target);
      adj.get(e.target)?.add(e.source);
    });
    return { pos, adj };
  }, [nodes, edges, layout]);

  const neighbors = hover ? model.adj.get(hover) : null;
  const edgeLit = (e: { source: string; target: string }) =>
    !hover || e.source === hover || e.target === hover;
  const nodeLit = (id: string) => !hover || id === hover || !!neighbors?.has(id);
  const colorOf = (g?: number, c?: string) => c || PALETTE[(g || 0) % PALETTE.length];
  // Highest-degree node is the hub — Mavéa's drawn gesture circles it while talking.
  const salientId = useMemo(() => {
    if (!nodes.length) return null;
    return nodes.reduce((best, n) => {
      const degN = model.adj.get(n.id)?.size ?? 0;
      const degB = model.adj.get(best.id)?.size ?? 0;
      return degN > degB ? n : best;
    }, nodes[0]).id;
  }, [nodes, model.adj]);

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
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {edges.map((e, i) => {
          const a = model.pos.get(e.source),
            b = model.pos.get(e.target);
          if (!a || !b) return null;
          const lit = edgeLit(e);
          return (
            <line
              key={i}
              className="c1-network-edge"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={lit ? 'var(--hover-line)' : 'var(--grid-line)'}
              strokeWidth={lit && hover ? 1.8 : 1}
              opacity={lit ? 0.9 : 0.25}
              style={
                {
                  transition: 'all var(--m-fast)',
                  ['--i' as string]: i,
                  transformOrigin: `${(a.x + b.x) / 2}px ${(a.y + b.y) / 2}px`,
                } as CSSProperties
              }
            />
          );
        })}
        {nodes.map((n, i) => {
          const p = model.pos.get(n.id)!;
          const lit = nodeLit(n.id);
          const r = 7 + Math.min(7, (n.weight || 1) * 1.5);
          const col = colorOf(n.group, n.color);
          const isHover = hover === n.id;
          return (
            <g
              key={n.id}
              className="c1-network-node"
              style={
                {
                  cursor: 'pointer',
                  ['--i' as string]: i,
                  transformOrigin: `${p.x}px ${p.y}px`,
                } as CSSProperties
              }
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
            >
              {isHover && <circle cx={p.x} cy={p.y} r={r + 6} fill={col} opacity={0.18} />}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={col}
                opacity={lit ? 1 : 0.3}
                stroke="var(--surface-default)"
                strokeWidth={2}
                data-mark={n.id === salientId ? 'circle' : undefined}
                style={{ transition: 'opacity var(--m-fast)' }}
              />
              <text
                x={p.x}
                y={p.y - r - 5}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--text-secondary)"
                opacity={lit ? 1 : 0.3}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {hover ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {nodes.find((n) => n.id === hover)?.label}
            </strong>{' '}
            · {neighbors?.size || 0} connection{(neighbors?.size || 0) === 1 ? '' : 's'}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a node to light up its neighbors</span>
        )}
      </div>
    </div>
  );
}
