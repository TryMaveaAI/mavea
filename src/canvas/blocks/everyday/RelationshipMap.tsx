import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RelationshipPerson, RelationshipTie, RelationshipMapProps, TieKind } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { routeEdge } from '../../lib/edgeDetour';

type Props = RelationshipMapProps & { delay?: number };

// Same fixed plot + circle/grid node-positioning algorithm as charts1/Network.tsx.
const W = 520,
  H = 320,
  CX = 260,
  CY = 160;
const NODE_R = 16;
/** How far a tie keeps from the centre of a person it does not join: the dot plus a gap. */
const EDGE_CLEARANCE = NODE_R + 6;

const KIND_STYLE: Record<TieKind, { color: string; dash?: string }> = {
  family: { color: 'var(--presence)' },
  ally: { color: 'var(--insight)', dash: '5 3' },
  rival: { color: 'var(--danger)', dash: '1.5 3' },
  romance: { color: 'var(--presence-soft)' },
  colleague: { color: 'var(--warning)' },
  other: { color: 'var(--text-muted)', dash: '2 3' },
};
const KIND_LABEL: Record<TieKind, string> = {
  family: 'Family',
  ally: 'Ally',
  rival: 'Rival',
  romance: 'Romance',
  colleague: 'Colleague',
  other: 'Other',
};
// A small heart silhouette, centred on its own origin — the romance marker drawn at an
// edge's midpoint instead of relying on color/dash alone to read as "this one's different".
const HEART_D =
  'M0 3.4 C0 1.1 -2.3 -0.5 -4 0.3 C-5.7 1.1 -5.7 3.4 -4 5.1 L0 9.1 L4 5.1 C5.7 3.4 5.7 1.1 4 0.3 C2.3 -0.5 0 1.1 0 3.4 Z';

interface NodeLabel {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

const LABEL_GAP = 6;
const LABEL_FS = 10.5; // .rm-node-label

/** A name placed just outside its dot along the ring's radius, anchored on the side facing
 *  away from the centre so its text grows outward rather than back over the dot. */
function outwardLabel(pt: { x: number; y: number }, angle: number): NodeLabel {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = NODE_R + LABEL_GAP;
  const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
  // Text sits on its baseline: shift down by about a cap height so the glyphs centre on the
  // radial point, and further out at the top and bottom where the name is stacked, not beside.
  const baseline = LABEL_FS * 0.35 + (anchor === 'middle' ? dy * LABEL_FS * 0.6 : 0);
  return { x: pt.x + dx * reach, y: pt.y + dy * reach + baseline, anchor };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface RenderPerson extends RelationshipPerson {
  /** Renderer-only identity. Model-authored ids may be blank or duplicated. */
  renderId: string;
}

interface RenderTie extends Omit<RelationshipTie, 'source' | 'target' | 'kind'> {
  source: string;
  target: string;
  kind: TieKind;
}

function aliasKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function tieKind(value: unknown): TieKind {
  return typeof value === 'string' && value in KIND_STYLE ? (value as TieKind) : 'other';
}

/**
 * Give every visible person a unique identity and resolve tie endpoints in one pass. LLM payloads
 * commonly omit ids, repeat a name as every id, or connect by name instead of id; none of those
 * should collapse the entire graph onto one coordinate. The index suffix makes uniqueness O(1)
 * per person, while the alias map keeps the first unambiguous id/name target stable.
 */
function normalizeRelationshipGraph(
  people: readonly RelationshipPerson[],
  ties: readonly RelationshipTie[],
): { people: RenderPerson[]; ties: RenderTie[] } {
  const aliases = new Map<string, string>();
  const normalizedPeople = people.map((person, index) => {
    const rawId = typeof person?.id === 'string' ? person.id.trim() : '';
    const rawName = typeof person?.name === 'string' ? person.name.trim() : '';
    const name = rawName || `Person ${index + 1}`;
    const base = rawId || aliasKey(name).replace(/[^a-z0-9]+/g, '-') || 'person';
    const renderId = `${base}:${index}`;
    for (const alias of [rawId, rawName]) {
      const key = aliasKey(alias);
      if (key && !aliases.has(key)) aliases.set(key, renderId);
    }
    return { ...person, id: rawId, name, renderId };
  });

  const normalizedTies = ties.flatMap((tie): RenderTie[] => {
    const source = aliases.get(aliasKey(tie?.source));
    const target = aliases.get(aliasKey(tie?.target));
    if (!source || !target || source === target) return [];
    return [{ ...tie, source, target, kind: tieKind(tie?.kind) }];
  });
  return { people: normalizedPeople, ties: normalizedTies };
}

// A typed people graph: who's connected to whom, and how. Ports Network's circle/grid
// layout wholesale; the difference is edges carry a relationship KIND (family/ally/rival/
// romance/colleague/other) instead of an unlabeled weight, styled by a legend below the SVG
// rather than a generic palette.
export function RelationshipMap({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  people = [],
  ties = [],
  layout = 'circle',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    const graph = normalizeRelationshipGraph(people, ties);
    const pos = new Map<string, { x: number; y: number }>();
    // Where each name sits relative to its dot. On the circle every tie is a chord, so it
    // leaves a dot heading INTO the ring — a name set radially outward is the one place no
    // tie can cross. The grid keeps names under the dots.
    const labelAt = new Map<string, NodeLabel>();
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(graph.people.length));
      const cw = (W - 80) / Math.max(1, cols - 1 || 1);
      const rows = Math.ceil(graph.people.length / cols);
      const ch = (H - 80) / Math.max(1, rows - 1 || 1);
      graph.people.forEach((p, i) => {
        const c = i % cols,
          r = Math.floor(i / cols);
        const pt = { x: 40 + c * cw, y: 40 + r * ch };
        pos.set(p.renderId, pt);
        labelAt.set(p.renderId, { x: pt.x, y: pt.y + NODE_R + 13, anchor: 'middle' });
      });
    } else {
      const R = 120;
      graph.people.forEach((p, i) => {
        const a = (i / Math.max(1, graph.people.length)) * Math.PI * 2 - Math.PI / 2;
        const pt = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
        pos.set(p.renderId, pt);
        labelAt.set(p.renderId, outwardLabel(pt, a));
      });
    }
    // Ties route around the people they do not join — on the grid a row's first and third dots
    // would otherwise be linked straight through the second.
    const routes = graph.ties.map((t) => {
      const a = pos.get(t.source),
        b = pos.get(t.target);
      if (!a || !b) return null;
      const others = graph.people
        .filter((p) => p.renderId !== t.source && p.renderId !== t.target)
        .flatMap((p) => pos.get(p.renderId) ?? []);
      return routeEdge(a, b, others, EDGE_CLEARANCE);
    });
    const adj = new Map<string, Set<string>>();
    graph.people.forEach((p) => adj.set(p.renderId, new Set()));
    graph.ties.forEach((t) => {
      adj.get(t.source)?.add(t.target);
      adj.get(t.target)?.add(t.source);
    });
    return { ...graph, pos, labelAt, routes, adj };
  }, [people, ties, layout]);

  const neighbors = hover ? model.adj.get(hover) : null;
  const edgeLit = (t: RenderTie) => !hover || t.source === hover || t.target === hover;
  const nodeLit = (id: string) => !hover || id === hover || !!neighbors?.has(id);
  // Highest-degree person is the hub — the natural gesture target while Mavéa talks.
  const salientId = useMemo(() => {
    if (!model.people.length) return null;
    return model.people.reduce((best, p) => {
      const degP = model.adj.get(p.renderId)?.size ?? 0;
      const degB = model.adj.get(best.renderId)?.size ?? 0;
      return degP > degB ? p : best;
    }, model.people[0]).renderId;
  }, [model.people, model.adj]);

  const kindsUsed = useMemo(() => [...new Set(model.ties.map((t) => t.kind))], [model.ties]);

  if (people.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div className="rm-note">No relationship data was given.</div>
      </div>
    );
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="canvas-figure">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="rm-svg"
        >
          {model.ties.map((t, i) => {
            const route = model.routes[i];
            if (!route) return null;
            const style = KIND_STYLE[t.kind] ?? KIND_STYLE.other;
            const lit = edgeLit(t);
            return (
              <g key={i}>
                <path
                  className="rm-edge m-stagger-item m-scale-in"
                  d={route.d}
                  fill="none"
                  stroke={style.color}
                  strokeDasharray={style.dash}
                  opacity={lit ? 0.9 : 0.2}
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <title>
                    {t.label ? `${KIND_LABEL[t.kind]} · ${t.label}` : KIND_LABEL[t.kind]}
                  </title>
                </path>
                {t.kind === 'romance' && (
                  <path
                    d={HEART_D}
                    fill={style.color}
                    opacity={lit ? 1 : 0.3}
                    transform={`translate(${route.mid.x} ${route.mid.y})`}
                  />
                )}
              </g>
            );
          })}
          {model.people.map((p, i) => {
            const pt = model.pos.get(p.renderId);
            if (!pt) return null;
            const lit = nodeLit(p.renderId);
            const isHover = hover === p.renderId;
            const name = truncate(p.name, 12);
            const label = model.labelAt.get(p.renderId) ?? {
              x: pt.x,
              y: pt.y + NODE_R + 13,
              anchor: 'middle' as const,
            };
            return (
              <g
                key={p.renderId}
                className="rm-node m-stagger-item m-scale-in"
                style={{ ['--i' as string]: i } as CSSProperties}
                onMouseEnter={() => setHover(p.renderId)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{p.role ? `${p.name} · ${p.role}` : p.name}</title>
                {isHover && <circle cx={pt.x} cy={pt.y} r={NODE_R + 6} className="rm-node-halo" />}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={NODE_R}
                  className="rm-node-dot"
                  opacity={lit ? 1 : 0.32}
                  data-mark={p.renderId === salientId ? 'circle' : undefined}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={label.anchor}
                  className="rm-node-label"
                  opacity={lit ? 1 : 0.32}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {kindsUsed.length > 0 && (
        <ul className="rm-legend" aria-label="Relationship key">
          {kindsUsed.map((k) => (
            <li key={k} className="rm-leg-item">
              {k === 'romance' ? (
                <svg viewBox="-6 -1 12 11" className="rm-leg-heart" aria-hidden="true">
                  <path d={HEART_D} transform="translate(0 0)" fill={KIND_STYLE[k].color} />
                </svg>
              ) : (
                <svg viewBox="0 0 20 8" className="rm-leg-swatch" aria-hidden="true">
                  <line
                    x1={1}
                    y1={4}
                    x2={19}
                    y2={4}
                    stroke={KIND_STYLE[k].color}
                    strokeDasharray={KIND_STYLE[k].dash}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      )}

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
