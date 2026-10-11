import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlanDagProps, FlowStatus } from './types';
import { useBoxSize } from '../../lib/useBoxSize';
import { dagEdgePath } from './planDagLayout';

type Props = PlanDagProps & { delay?: number };

/** Arrowhead length in px. */
const HEAD = 7;

const statusColor = (s?: FlowStatus) =>
  s === 'done'
    ? 'var(--insight)'
    : s === 'active'
      ? 'var(--presence)'
      : s === 'blocked'
        ? 'var(--danger)'
        : s === 'risk'
          ? 'var(--warning)'
          : 'var(--text-muted)';

export function PlanDag({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  edges,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<string | null>(null);
  // Per-instance marker ids so two plan DAGs in one answer don't share arrowhead defs
  // (which would also cross their colors when one is active and the other isn't).
  const uid = useId().replace(/:/g, '');
  const arrowId = `fl-dag-arrow-${uid}`;
  const arrowOnId = `fl-dag-arrow-on-${uid}`;
  // Blocked node demands the most attention; fall back through active → risk → first node.
  const salientId = (() => {
    for (const status of ['blocked', 'active', 'risk'] as const) {
      const n = nodes.find((n) => n.status === status);
      if (n) return n.id;
    }
    return nodes[0]?.id ?? null;
  })();

  // floor at 1 so empty `nodes` (Math.max() -> -Infinity) can't poison the grid math
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1));
  const W = 100;
  const H = 100;
  const colGap = W / cols;
  const rowGap = H / rows;
  // Node width as a share of the stage: most of its column, leaving the rest for the connector.
  // Labels wrap to a second line before they are cut, so the node's height is a floor, not a box.
  const NW = Math.min(colGap * 0.76, 24);
  const NH = Math.min(rowGap * 0.5, 13);
  // Connectors are drawn in px so their heads stay square and stop at a rim; until the stage is
  // measured the percentages stand in for px.
  const [stageRef, stage] = useBoxSize<HTMLDivElement>();
  const PW = stage.w || 100;
  const PH = stage.h || 100;

  const xy = (col: number, row: number) => ({
    x: colGap * col + colGap / 2,
    y: rowGap * row + rowGap / 2,
  });

  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => (pos[n.id] = xy(n.col, n.row)));

  // upstream + downstream sets for the hovered node
  const related = useMemo(() => {
    if (!hover) return null;
    const up = new Set<string>();
    const down = new Set<string>();
    const walk = (id: string, dir: 'up' | 'down', seen: Set<string>) => {
      const next = edges.filter((e) => (dir === 'up' ? e.to === id : e.from === id));
      next.forEach((e) => {
        const adj = dir === 'up' ? e.from : e.to;
        const set = dir === 'up' ? up : down;
        if (!set.has(adj)) {
          set.add(adj);
          walk(adj, dir, seen);
        }
      });
    };
    walk(hover, 'up', up);
    walk(hover, 'down', down);
    return { up, down };
  }, [hover, edges]);

  const nodeState = (id: string): 'self' | 'up' | 'down' | 'dim' | 'none' => {
    if (!related) return 'none';
    if (id === hover) return 'self';
    if (related.up.has(id)) return 'up';
    if (related.down.has(id)) return 'down';
    return 'dim';
  };

  const edgeActive = (from: string, to: string) => {
    if (!related || !hover) return false;
    const chainUp =
      (related.up.has(from) || from === hover) && (related.up.has(to) || to === hover);
    const chainDown =
      (related.down.has(to) || to === hover) && (related.down.has(from) || from === hover);
    return chainUp || chainDown;
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-dag-scroll">
        <div className="fl-dag" ref={stageRef}>
          <svg role="img" aria-label={title} viewBox={`0 0 ${PW} ${PH}`} className="fl-dag-svg">
            <defs>
              {[
                [arrowId, 'var(--grid-strong)'],
                [arrowOnId, 'var(--presence)'],
              ].map(([id, fill]) => (
                <marker
                  key={id}
                  id={id}
                  markerUnits="userSpaceOnUse"
                  markerWidth={HEAD}
                  markerHeight={HEAD}
                  refX={HEAD}
                  refY={HEAD / 2}
                  orient="auto"
                >
                  <path d={`M0 0 L${HEAD} ${HEAD / 2} L0 ${HEAD} Z`} fill={fill} />
                </marker>
              ))}
            </defs>
            {edges.map((e, i) => {
              const a = pos[e.from];
              const b = pos[e.to];
              if (!a || !b) return null;
              const on = edgeActive(e.from, e.to);
              const px = (p: { x: number; y: number }) => ({
                x: (p.x / 100) * PW,
                y: (p.y / 100) * PH,
              });
              return (
                <path
                  key={i}
                  d={dagEdgePath(px(a), px(b), ((NW / 100) * PW) / 2)}
                  fill="none"
                  stroke={on ? 'var(--presence)' : 'var(--grid-strong)'}
                  strokeWidth={on ? 2 : 1.4}
                  markerEnd={on ? `url(#${arrowOnId})` : `url(#${arrowId})`}
                  opacity={related && !on ? 0.3 : 1}
                  className="fl-dag-edge"
                />
              );
            })}
          </svg>
          {nodes.map((n) => {
            const p = pos[n.id];
            const st = nodeState(n.id);
            return (
              <button
                key={n.id}
                className={'fl-dag-node st-' + st}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                style={
                  {
                    left: p.x + '%',
                    top: p.y + '%',
                    width: NW + '%',
                    minHeight: NH + '%',
                    ['--c' as string]: statusColor(n.status),
                  } as CSSProperties
                }
                aria-label={n.meta ? `${n.label} — ${n.meta}` : n.label}
              >
                <span className="fl-dag-dot" data-mark={n.id === salientId ? 'point' : undefined} />
                <span className="fl-dag-label">{n.label}</span>
                {n.meta && <span className="fl-dag-meta">{n.meta}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
