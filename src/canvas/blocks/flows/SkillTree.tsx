import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SkillTreeProps, SkillNode, SkillState } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SkillTreeProps & { delay?: number };

// A node's accent — locked recedes, available is outlined in presence, unlocked fills
// insight (earned), and a maxed skill glows gold/warning to read as the prized top rank.
const stateColor = (s?: SkillState) =>
  s === 'maxed'
    ? 'var(--warning)'
    : s === 'unlocked'
      ? 'var(--insight)'
      : s === 'available'
        ? 'var(--presence)'
        : 'var(--text-muted)';

export function SkillTree({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  nodes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const [hover, setHover] = useState<string | null>(null);
  // Per-instance ids so two skill trees in one answer don't share gradient/marker defs.
  const uid = useId().replace(/:/g, '');
  const reqId = `fl-sk-req-${uid}`;

  // Group nodes into their tier bands, then sort the tiers so band 0 sits at top. A node's
  // row is its rank among the present tiers (sparse tier numbers collapse to contiguous rows),
  // its column its index within the band — so the layout is fully computed from tier + order.
  const layout = useMemo(() => {
    const byTier = new Map<number, SkillNode[]>();
    nodes.forEach((n) => {
      const t = byTier.get(n.tier) ?? [];
      t.push(n);
      byTier.set(n.tier, t);
    });
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    const rows = Math.max(1, tiers.length);
    // x/y as 0..100 percentages; each band is a row, nodes spread evenly across the width.
    const pos: Record<string, { x: number; y: number }> = {};
    // Each node's own band size, so its rendered width can be capped to its actual share of
    // the row — a fixed percentage only worked for the 2-3-item demo fixture and let wider
    // bands (or longer labels) overlap their neighbors.
    const bandSize: Record<string, number> = {};
    const bands: { tier: number; y: number }[] = [];
    tiers.forEach((tier, row) => {
      const band = byTier.get(tier)!;
      const y = ((row + 0.5) / rows) * 100;
      bands.push({ tier, y });
      band.forEach((n, i) => {
        const x = ((i + 0.5) / band.length) * 100;
        pos[n.id] = { x, y };
        bandSize[n.id] = band.length;
      });
    });
    return { pos, bandSize, bands, rows };
  }, [nodes]);

  // The skills directly wired to the hovered node — its prerequisites AND its dependents.
  // Hovering traces both directions: what this skill needs, and what it unlocks next. Members
  // stay bright while everything else recedes, so the chosen branch reads cleanly.
  const linked = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    nodes.forEach((n) => {
      const reqs = n.requires ?? [];
      if (n.id === hover) reqs.forEach((r) => set.add(r));
      if (reqs.includes(hover)) set.add(n.id);
    });
    return set;
  }, [hover, nodes]);

  // A prerequisite edge is "lit" when either endpoint is the hovered node, so resting on a skill
  // traces exactly what it needs (and what it feeds into) without dimming the rest into illegibility.
  const isLit = (from: string, to: string) => hover != null && (from === hover || to === hover);

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
      {caption && <div className="fl-sk-cap">{caption}</div>}
      {/* The tree holds a minimum width its nodes stay legible at; on a narrow card this pans it. */}
      <div className="fl-sk-scroll">
        <div className="fl-sk" style={{ ['--rows' as string]: layout.rows } as CSSProperties}>
          <svg
            role="img"
            aria-label={title || 'Skill tree'}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="fl-sk-svg"
          >
            <defs>
              <marker id={reqId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0 0 L5 2.5 L0 5 Z" fill="var(--line-strong)" />
              </marker>
            </defs>
            {nodes.map((n) =>
              (n.requires ?? []).map((reqId2) => {
                const a = layout.pos[reqId2];
                const b = layout.pos[n.id];
                if (!a || !b) return null;
                const lit = isLit(reqId2, n.id);
                // curve out of the bottom of the prerequisite, into the top of the dependent
                const my = (a.y + b.y) / 2;
                return (
                  <path
                    key={reqId2 + '>' + n.id}
                    d={`M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={lit ? 'var(--presence)' : 'var(--line-strong)'}
                    strokeWidth={lit ? 1.1 : 0.6}
                    markerEnd={lit ? undefined : `url(#${reqId})`}
                    opacity={hover && !lit ? 0.3 : 1}
                    className="fl-sk-edge"
                  />
                );
              }),
            )}
          </svg>
          {layout.bands.map((band) => (
            <div
              key={band.tier}
              className="fl-sk-tier"
              style={{ top: band.y + '%' } as CSSProperties}
              aria-hidden
            />
          ))}
          {nodes.map((n) => {
            const p = layout.pos[n.id];
            if (!p) return null;
            const locked = n.state === 'locked';
            const dim = linked != null && !linked.has(n.id);
            // Each node may claim its even share of the band (minus a gutter so neighbors never
            // touch), floored so a lone wide node in a sparse band doesn't stretch to absurdity.
            const band = layout.bandSize[n.id] ?? 1;
            const maxW = Math.min(60, Math.max(22, 100 / band - 6));
            return (
              <button
                key={n.id}
                className={'fl-sk-node st-' + (n.state ?? 'locked') + (dim ? ' is-dim' : '')}
                aria-label={`${n.label}${n.cost ? ` — ${n.cost}` : ''}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                style={
                  {
                    left: p.x + '%',
                    top: p.y + '%',
                    ['--c' as string]: stateColor(n.state),
                    ['--max-node-w' as string]: maxW + '%',
                  } as CSSProperties
                }
              >
                <span className="fl-sk-icon">
                  {locked ? (
                    <Icon.lock className="ic" />
                  ) : n.state === 'maxed' ? (
                    <Icon.sparkle className="ic" />
                  ) : (
                    <Icon.check className="ic" />
                  )}
                </span>
                <span className="fl-sk-label">{n.label}</span>
                {n.cost && <span className="fl-sk-cost tab-num">{n.cost}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
