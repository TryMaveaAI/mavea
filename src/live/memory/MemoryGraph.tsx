// Obsidian-style knowledge graph for Mavéa's concept memory. Nodes = concept slugs;
// strong edges = same-turn co-occurrence (updatedAt within 200ms); weak edges = namespace
// hierarchy. Force layout runs in useMemo — pure math, no physics library, no DOM side-effects.
import { useMemo, useState, type ReactElement } from 'react';
import { isFactSource, type MemoryNode } from './store';
import { namespaceOf } from './groups';
import './memory-graph.css';

const GRAPH_W = 420;
const GRAPH_H = 300;
const MIN_USEFUL = 6;

// Design-system tokens only (no raw hex) — six distinguishable hues from the accent palette
// and its "soft" variants. The known namespaces get a fixed, memorable assignment; anything else
// (a namespace the model invented) hashes deterministically into the same set.
const NS_TOKENS: readonly string[] = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
  'var(--warning-soft)',
];
const NS_COLORS: Record<string, string> = {
  profile: NS_TOKENS[0],
  preferences: NS_TOKENS[3],
  topics: NS_TOKENS[1],
  threads: NS_TOKENS[4],
  projects: NS_TOKENS[2],
};

function nsColor(ns: string): string {
  return NS_COLORS[ns] ?? NS_TOKENS[hashNs(ns) % NS_TOKENS.length];
}

function hashNs(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface GraphEdge {
  a: string;
  b: string;
  cooccurred: boolean;
}

function computeEdges(nodes: MemoryNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const edgeKey = (a: string, b: string) => [a, b].sort().join('\0');

  // Co-occurrence means "saved in the same beat" (< 200ms apart), so sorting by save time
  // turns the old all-pairs scan into a short sliding window per node — the store grows
  // without bound as the user talks, and this keeps edge-building near-linear in it.
  const byTime = nodes.filter((n) => n.updatedAt > 0).sort((a, b) => a.updatedAt - b.updatedAt);
  for (let i = 0; i < byTime.length; i++) {
    for (let j = i + 1; j < byTime.length && byTime[j].updatedAt - byTime[i].updatedAt < 200; j++) {
      const k = edgeKey(byTime[i].concept, byTime[j].concept);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({ a: byTime[i].concept, b: byTime[j].concept, cooccurred: true });
      }
    }
  }

  const concepts = new Set(nodes.map((n) => n.concept));
  for (const node of nodes) {
    const parent = node.concept.split('.')[0];
    if (parent !== node.concept && concepts.has(parent)) {
      const k = edgeKey(node.concept, parent);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({ a: node.concept, b: parent, cooccurred: false });
      }
    }
  }

  return edges;
}

function forceLayout(
  nodes: MemoryNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const sorted = [...nodes].sort((a, b) => a.concept.localeCompare(b.concept));
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  sorted.forEach((n, i) => {
    const angle = (i / Math.max(1, sorted.length)) * Math.PI * 2;
    const initR = Math.min(GRAPH_W, GRAPH_H) * 0.3;
    positions.set(n.concept, {
      x: GRAPH_W / 2 + Math.cos(angle) * initR,
      y: GRAPH_H / 2 + Math.sin(angle) * initR,
      vx: 0,
      vy: 0,
    });
  });

  const pts = [...positions.values()];
  const DAMP = 0.82;
  // Once no node moved more than this in a pass, further passes only polish sub-pixel noise —
  // stop there instead of always paying the full all-pairs sweep 80 times. The graph grows
  // with everything the user has ever talked about, so the cap matters at the high end.
  const SETTLED = 0.4;

  for (let iter = 0; iter < 80; iter++) {
    const cool = 1 - iter / 80;
    const k = 0.08 * Math.sqrt((GRAPH_W * GRAPH_H) / Math.max(1, sorted.length));

    // Repulsion between all pairs
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = ((k * k) / dist) * 1.5;
        a.vx -= (dx / dist) * force * cool;
        a.vy -= (dy / dist) * force * cool;
        b.vx += (dx / dist) * force * cool;
        b.vy += (dy / dist) * force * cool;
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const a = positions.get(e.a);
      const b = positions.get(e.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = e.cooccurred ? 85 : 120;
      const force = (dist - ideal) * 0.05 * cool;
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    // Weak centre gravity
    for (const p of positions.values()) {
      p.vx += (GRAPH_W / 2 - p.x) * 0.006 * cool;
      p.vy += (GRAPH_H / 2 - p.y) * 0.006 * cool;
    }

    // Integrate, dampen, clamp
    let maxMove = 0;
    for (const p of pts) {
      const move = Math.abs(p.vx) + Math.abs(p.vy);
      if (move > maxMove) maxMove = move;
      p.x = Math.max(20, Math.min(GRAPH_W - 20, p.x + p.vx));
      p.y = Math.max(20, Math.min(GRAPH_H - 20, p.y + p.vy));
      p.vx *= DAMP;
      p.vy *= DAMP;
    }
    if (maxMove < SETTLED) break;
  }

  const result = new Map<string, { x: number; y: number }>();
  for (const [c, v] of positions) result.set(c, { x: v.x, y: v.y });
  return result;
}

export function MemoryGraph({ nodes }: { nodes: MemoryNode[] }): ReactElement {
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const edges = useMemo(() => computeEdges(nodes), [nodes]);
  const positions = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);

  const strongEdgeCount = edges.filter((e) => e.cooccurred).length;
  const focusedNode = focused ? nodes.find((n) => n.concept === focused) : null;

  if (nodes.length === 0) {
    return (
      <div className="mg-empty">
        Your knowledge graph appears here as you talk — start a conversation to add concepts.
      </div>
    );
  }

  return (
    <div className="mg-wrap">
      <svg
        className="mg-svg"
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        width="100%"
        height="auto"
        aria-label="Memory concept graph"
      >
        {edges.map((e, idx) => {
          const pa = positions.get(e.a);
          const pb = positions.get(e.b);
          if (!pa || !pb) return null;
          const highlighted = hover === e.a || hover === e.b;
          const baseOpacity = e.cooccurred ? 0.55 : 0.2;
          return (
            <line
              key={idx}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              className={'mg-edge' + (e.cooccurred ? ' mg-edge--strong' : '')}
              style={{
                opacity: hover ? (highlighted ? baseOpacity + 0.3 : 0.05) : baseOpacity,
              }}
            />
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.concept);
          if (!p) return null;
          const ns = namespaceOf(n);
          const color = nsColor(ns);
          const r = Math.max(7, Math.min(18, 7 + (n.body.length / 400) * 11));
          const isHovered = hover === n.concept;
          const isFocused = focused === n.concept;
          const label = n.concept.split('.').pop() ?? n.concept;
          // Provenance-honest rendering: grounded facts are solid; unconfirmed (model-inferred)
          // guesses are dimmed + dashed; procedural lessons (corrections) carry an accent ring.
          const grounded = isFactSource(n.source);
          const procedural = n.kind === 'procedural';
          const fillOpacity = isFocused ? 1 : grounded ? 0.82 : 0.42;
          const strokeColor = procedural || isFocused || !grounded ? color : 'none';
          const strokeWidth = procedural ? 2 : isFocused ? 1.5 : !grounded ? 1 : 0;

          return (
            <g
              key={n.concept}
              className="mg-node"
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHover(n.concept)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setFocused(isFocused ? null : n.concept)}
              style={{ opacity: hover && !isHovered ? 0.3 : 1 }}
            >
              <title>{`${n.concept} · ${grounded ? 'confirmed' : 'unconfirmed'}${procedural ? ' · lesson' : ''}`}</title>
              {isHovered && (
                <circle r={r + 5} fill={color} style={{ opacity: 0.15 }} aria-hidden="true" />
              )}
              <circle
                r={r}
                fill={color}
                style={{ opacity: fillOpacity }}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={grounded ? undefined : '3 2'}
                strokeOpacity={0.5}
              />
              <text
                className="mg-label"
                y={r + 13}
                textAnchor="middle"
                style={{
                  fill: color,
                  opacity: isHovered || isFocused ? 1 : 0.65,
                }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {focusedNode && (
        <div
          className="mg-detail"
          onClick={() => setFocused(null)}
          title="Click to close"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setFocused(null)}
        >
          <span className="mg-detail-concept">{focusedNode.concept}</span>
          <p className="mg-detail-body">{focusedNode.body}</p>
        </div>
      )}

      {nodes.length < MIN_USEFUL ? (
        <div className="mg-warmup">
          <div className="mg-warmup-track">
            <div
              className="mg-warmup-fill"
              style={{ width: `${(nodes.length / MIN_USEFUL) * 100}%` }}
            />
          </div>
          <span className="mg-warmup-label">
            {MIN_USEFUL - nodes.length} more{' '}
            {MIN_USEFUL - nodes.length === 1 ? 'concept' : 'concepts'} until your map fills in
          </span>
        </div>
      ) : (
        <p className="mg-foot">
          {strongEdgeCount} connection{strongEdgeCount !== 1 ? 's' : ''} across {nodes.length}{' '}
          concepts
        </p>
      )}
    </div>
  );
}
