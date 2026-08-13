// Cast / relationship map — named people (or entities) placed on an auto-computed ring, joined by
// typed, colour-coded edges (ally, rival, family, love, mentor, betrays). The model supplies only
// the cast and who relates to whom; the geometry is derived here: nodes are grouped by faction so
// each side forms a contiguous arc, the ring radius and chip width scale to the node count (so a
// handful of characters and a dozen both stay legible), and every connector is trimmed to the chip
// rim and bowed slightly so reciprocal ties never sit on top of each other. Directed ties (mentor,
// betrays) carry an arrowhead toward their target; symmetric ties (ally, family, love, rival) don't.
// An edge that references a missing node is dropped rather than crashing the figure.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CastMapProps, CastMapNode, CastMapLink, CastMapEdgeKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CastMapProps & { delay?: number };

// The figure is drawn in a square user-space box and scaled to the card by the SVG viewBox, so it
// stays crisp at any column width. The ring is centred; PAD reserves room for the outermost chip.
const VIEW = 1000;
const CX = VIEW / 2;
const CY = VIEW / 2;
const NODE_H = 60; // chip height — fits a two-line name plus a one-line role
const PAD = 30; // gutter so an outer chip never clips the viewBox edge

// Edge colour by relationship kind. Kept to the design tokens so light/dark theming is automatic;
// a legend maps each used colour back to its meaning, so near hues stay distinguishable.
const KIND_COLOR: Record<CastMapEdgeKind, string> = {
  ally: 'var(--insight)',
  rival: 'var(--warning)',
  family: 'var(--presence-soft)',
  love: 'var(--presence)',
  mentor: 'var(--insight-soft)',
  betrays: 'var(--danger)',
  other: 'var(--text-muted)',
};
const KIND_LABEL: Record<CastMapEdgeKind, string> = {
  ally: 'Ally',
  rival: 'Rival',
  family: 'Family',
  love: 'Love',
  mentor: 'Mentor',
  betrays: 'Betrays',
  other: 'Linked',
};
// Asymmetric ties read one way, so they get an arrowhead; the rest are mutual and stay plain.
const DIRECTED = new Set<CastMapEdgeKind>(['mentor', 'betrays']);
// Dashing adds a second channel of difference so a mentor line never reads as an ally line, and a
// betrayal / loose tie looks provisional rather than solid.
const DASHED = new Set<CastMapEdgeKind>(['mentor', 'betrays', 'other']);

// Faction tints, assigned in first-seen order and cycled if a cast has more sides than colours.
const FACTION_TOKENS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

interface Placed extends CastMapNode {
  cx: number;
  cy: number;
  /** faction accent, or the neutral line token for an unaligned node */
  color: string;
  rx: number;
  ry: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Normalise a kind that arrived outside the known set to the neutral 'other' tint. */
function edgeKind(k: CastMapEdgeKind | undefined): CastMapEdgeKind {
  return k && k in KIND_COLOR ? k : 'other';
}

/** Trim a segment endpoint to the rim of a node's chip (approximated as an ellipse), so a
 *  connector meets the chip border instead of its centre and any arrowhead lands cleanly. */
function rim(
  node: Placed,
  towardX: number,
  towardY: number,
  out: boolean,
): { x: number; y: number } {
  const ang = Math.atan2(towardY - node.cy, towardX - node.cx);
  const s = out ? 1 : -1;
  // The extra 4px lifts the line just off the border so it doesn't kiss the stroke.
  return {
    x: node.cx + s * Math.cos(ang) * (node.rx + 4),
    y: node.cy + s * Math.sin(ang) * (node.ry + 4),
  };
}

export function CastMap({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  links,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  // Marker ids must be unique per instance so two maps on one canvas don't share arrowheads.
  const uid = useId().replace(/:/g, '');

  const { placed, factions } = useMemo(() => {
    const clean = (nodes ?? []).filter((n) => n && n.id && n.name);
    // Assign a colour to each faction in first-seen order (a legend explains them).
    const order: string[] = [];
    for (const n of clean) {
      const f = n.faction?.trim();
      if (f && !order.includes(f)) order.push(f);
    }
    const factionColor = new Map(
      order.map((f, i) => [f, FACTION_TOKENS[i % FACTION_TOKENS.length]]),
    );

    // A node's faction, normalised once so grouping and colour agree even on padded input.
    const facOf = (node: CastMapNode) => node.faction?.trim() || '';

    // Group nodes by faction so each side forms a contiguous arc; unaligned nodes trail the end.
    const grouped = [...clean].sort((a, b) => {
      const ai = facOf(a) ? order.indexOf(facOf(a)) : order.length;
      const bi = facOf(b) ? order.indexOf(facOf(b)) : order.length;
      return ai - bi;
    });

    const n = grouped.length;
    // Ring radius leaves room for the outer chip's half-height. A small cast sits on a comfortable
    // inset ring (centre breathing room); a crowded one spends that room to spread the chips out —
    // the ring grows toward the largest the box allows so a dozen-plus names don't collide.
    const MAX_R = VIEW / 2 - PAD - NODE_H / 2;
    const R = n <= 1 ? 0 : Math.min(MAX_R, MAX_R - 90 + Math.max(0, n - 10) * 10);
    // Chord between neighbours bounds the chip width so chips never overlap on a crowded ring.
    const chord = n > 1 ? 2 * R * Math.sin(Math.PI / n) : VIEW;
    const NODE_W = clamp(chord * 0.84, 104, 200);

    const out: Placed[] = grouped.map((node, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      return {
        ...node,
        cx: CX + Math.cos(a) * R,
        cy: CY + Math.sin(a) * R,
        color: factionColor.get(facOf(node)) || 'var(--line-strong)',
        rx: NODE_W / 2,
        ry: NODE_H / 2,
      };
    });
    return { placed: out, factions: order.map((f) => ({ name: f, color: factionColor.get(f)! })) };
  }, [nodes]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  // Only the endpoints that resolve, and never a self-loop (which the ring can't draw).
  const edges = useMemo(
    () =>
      (links ?? [])
        .map((l) => ({ link: l, a: byId.get(l.from), b: byId.get(l.to), kind: edgeKind(l.kind) }))
        .filter((e): e is { link: CastMapLink; a: Placed; b: Placed; kind: CastMapEdgeKind } =>
          Boolean(e.a && e.b && e.a !== e.b),
        ),
    [links, byId],
  );

  // Emit an arrowhead marker only for the directed tints actually present.
  const usedArrowKinds = useMemo(
    () => [...new Set(edges.filter((e) => DIRECTED.has(e.kind)).map((e) => e.kind))],
    [edges],
  );
  // Legend rows: only the relationship kinds this map actually uses.
  const usedKinds = useMemo(() => [...new Set(edges.map((e) => e.kind))], [edges]);

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

      {placed.length === 0 ? (
        <p className="cast-empty">No cast to map yet.</p>
      ) : (
        <div className="cast-stage">
          <svg
            className="cast-svg"
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title || 'Relationship map'}
          >
            <defs>
              {usedArrowKinds.map((k) => (
                <marker
                  key={k}
                  id={`cast-arrow-${uid}-${k}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" fill={KIND_COLOR[k]} />
                </marker>
              ))}
            </defs>

            {/* Edges under the chips so connectors never cross over a name. */}
            {edges.map((e, i) => (
              <Edge key={i} edge={e} uid={uid} />
            ))}

            {placed.map((p) => (
              <Chip key={p.id} node={p} />
            ))}
          </svg>
        </div>
      )}

      {(usedKinds.length > 0 || factions.length > 0) && (
        <div className="cast-legend">
          {usedKinds.map((k) => (
            <span key={`k-${k}`} className="cast-legend-item">
              <span
                className={`cast-swatch cast-swatch--line${DASHED.has(k) ? ' is-dashed' : ''}`}
                style={{ color: KIND_COLOR[k] }}
              />
              {KIND_LABEL[k]}
            </span>
          ))}
          {factions.map((f) => (
            <span key={`f-${f.name}`} className="cast-legend-item">
              <span className="cast-swatch" style={{ background: f.color }} />
              {f.name}
            </span>
          ))}
        </div>
      )}

      {caption && <p className="cast-caption">{caption}</p>}
      {footer && <div className="cast-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}

function Edge({
  edge,
  uid,
}: {
  edge: { link: CastMapLink; a: Placed; b: Placed; kind: CastMapEdgeKind };
  uid: string;
}) {
  const { a, b, kind, link } = edge;
  const s = rim(a, b.cx, b.cy, true);
  const t = rim(b, a.cx, a.cy, false);
  // A gentle bow keeps A→B and B→A from overlapping and softens the web.
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(64, len * 0.14);
  const bx = mx - (dy / len) * bow;
  const by = my + (dx / len) * bow;
  const color = KIND_COLOR[kind];
  const arrow = DIRECTED.has(kind) ? `url(#cast-arrow-${uid}-${kind})` : undefined;

  return (
    <g className="cast-edge">
      <path
        d={`M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${bx.toFixed(1)} ${by.toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}`}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeDasharray={DASHED.has(kind) ? '8 7' : undefined}
        markerEnd={arrow}
        opacity={0.82}
      />
      {link.label && (
        <g transform={`translate(${bx.toFixed(1)}, ${(by - 16).toFixed(1)})`}>
          <rect
            className="cast-edge-lbl-bg"
            x={-labelW(link.label) / 2}
            y={-11}
            width={labelW(link.label)}
            height={20}
            rx={6}
          />
          <text className="cast-edge-lbl" x={0} y={0} textAnchor="middle" dominantBaseline="middle">
            {truncate(link.label, 16)}
          </text>
        </g>
      )}
    </g>
  );
}

// Line heights must track the font sizes in styles.css (.cast-name 23px, .cast-role 16px) so the
// vertical-centring math and the painted text can't drift apart.
const NAME_LH = 27;
const ROLE_LH = 21;

function Chip({ node }: { node: Placed }) {
  const hasRole = !!node.role;
  // Tie the per-line character budget to the chip's ACTUAL width, not a fixed guess: a crowded ring
  // shrinks the chips, and a fixed 13-char line would then paint past the chip rim. ~11px/glyph at
  // the 23px name size; never loosen past the roomy-chip default, only tighten for narrow chips.
  const chipW = node.rx * 2;
  const perLine = Math.min(hasRole ? 15 : 13, Math.max(6, Math.round(chipW / 11)));
  const roleMax = Math.min(22, Math.max(8, Math.round(chipW / 8)));
  const lines = wrap(node.name, perLine, hasRole ? 1 : 2);
  const blockH = lines.length * NAME_LH + (hasRole ? ROLE_LH : 0);
  const top = node.cy - blockH / 2 + NAME_LH * 0.74;

  return (
    <g className="cast-node">
      <rect
        x={node.cx - node.rx}
        y={node.cy - node.ry}
        width={node.rx * 2}
        height={node.ry * 2}
        rx={14}
        className="cast-chip"
        style={{ stroke: node.color }}
      />
      {/* A short accent rail on the leading edge carries the faction colour. */}
      <rect
        x={node.cx - node.rx}
        y={node.cy - node.ry + 8}
        width={4}
        height={node.ry * 2 - 16}
        rx={2}
        fill={node.color}
      />
      <text className="cast-name" x={node.cx} textAnchor="middle">
        <title>{node.name}</title>
        {lines.map((ln, i) => (
          <tspan key={i} x={node.cx} y={top + i * NAME_LH}>
            {ln}
          </tspan>
        ))}
      </text>
      {hasRole && (
        <text
          className="cast-role"
          x={node.cx}
          y={top + lines.length * NAME_LH + 2}
          textAnchor="middle"
        >
          {truncate(node.role!, roleMax)}
        </text>
      )}
    </g>
  );
}

/** Rough pixel width for an edge-label pill's background, in viewBox units. */
function labelW(text: string): number {
  return Math.min(text.length, 16) * 9 + 14;
}

/** Greedy word-wrap to `maxLines`, ellipsising the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        truncated = true;
        cur = '';
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length) {
    const li = lines.length - 1;
    let last = lines[li];
    if (last.length > perLine) last = last.slice(0, perLine - 1).trimEnd();
    if (truncated || lines[li].length > perLine) last = last.replace(/[…\s]*$/, '') + '…';
    lines[li] = last;
  }
  return lines.length ? lines : [''];
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
