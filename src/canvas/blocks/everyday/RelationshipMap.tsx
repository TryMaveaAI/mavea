import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RelationshipTie, RelationshipMapProps, TieKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RelationshipMapProps & { delay?: number };

// Same fixed plot + circle/grid node-positioning algorithm as charts1/Network.tsx.
const W = 520,
  H = 320,
  CX = 260,
  CY = 160;
const NODE_R = 16;

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

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
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
    const pos = new Map<string, { x: number; y: number }>();
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(people.length));
      const cw = (W - 80) / Math.max(1, cols - 1 || 1);
      const rows = Math.ceil(people.length / cols);
      const ch = (H - 80) / Math.max(1, rows - 1 || 1);
      people.forEach((p, i) => {
        const c = i % cols,
          r = Math.floor(i / cols);
        pos.set(p.id, { x: 40 + c * cw, y: 40 + r * ch });
      });
    } else {
      const R = 120;
      people.forEach((p, i) => {
        const a = (i / Math.max(1, people.length)) * Math.PI * 2 - Math.PI / 2;
        pos.set(p.id, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
      });
    }
    const adj = new Map<string, Set<string>>();
    people.forEach((p) => adj.set(p.id, new Set()));
    ties.forEach((t) => {
      adj.get(t.source)?.add(t.target);
      adj.get(t.target)?.add(t.source);
    });
    return { pos, adj };
  }, [people, ties, layout]);

  const neighbors = hover ? model.adj.get(hover) : null;
  const edgeLit = (t: RelationshipTie) => !hover || t.source === hover || t.target === hover;
  const nodeLit = (id: string) => !hover || id === hover || !!neighbors?.has(id);
  // Highest-degree person is the hub — the natural gesture target while Mavéa talks.
  const salientId = useMemo(() => {
    if (!people.length) return null;
    return people.reduce((best, p) => {
      const degP = model.adj.get(p.id)?.size ?? 0;
      const degB = model.adj.get(best.id)?.size ?? 0;
      return degP > degB ? p : best;
    }, people[0]).id;
  }, [people, model.adj]);

  const kindsUsed = useMemo(
    () => [...new Set(ties.map((t) => t.kind))].filter((k): k is TieKind => k in KIND_STYLE),
    [ties],
  );

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

      <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} width="100%" className="rm-svg">
        {ties.map((t, i) => {
          const a = model.pos.get(t.source),
            b = model.pos.get(t.target);
          if (!a || !b) return null;
          const style = KIND_STYLE[t.kind] ?? KIND_STYLE.other;
          const lit = edgeLit(t);
          const mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line
                className="rm-edge m-stagger-item m-scale-in"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={style.color}
                strokeDasharray={style.dash}
                opacity={lit ? 0.9 : 0.2}
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <title>{t.label ? `${KIND_LABEL[t.kind]} · ${t.label}` : KIND_LABEL[t.kind]}</title>
              </line>
              {t.kind === 'romance' && (
                <path
                  d={HEART_D}
                  fill={style.color}
                  opacity={lit ? 1 : 0.3}
                  transform={`translate(${mx} ${my})`}
                />
              )}
            </g>
          );
        })}
        {people.map((p, i) => {
          const pt = model.pos.get(p.id);
          if (!pt) return null;
          const lit = nodeLit(p.id);
          const isHover = hover === p.id;
          const name = truncate(p.name, 12);
          return (
            <g
              key={p.id}
              className="rm-node m-stagger-item m-scale-in"
              style={{ ['--i' as string]: i } as CSSProperties}
              onMouseEnter={() => setHover(p.id)}
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
                data-mark={p.id === salientId ? 'circle' : undefined}
              />
              <text
                x={pt.x}
                y={pt.y + NODE_R + 13}
                textAnchor="middle"
                className="rm-node-label"
                opacity={lit ? 1 : 0.32}
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>

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
