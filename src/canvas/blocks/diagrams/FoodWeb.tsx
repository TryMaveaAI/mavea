// FoodWeb — an ecological food web. Organisms sit in horizontal tier bands (tier 0 at the
// bottom, each higher tier a step up the food chain, energy-pyramid convention read as a
// ladder rather than a triangle), joined by curved directional arrows from prey to predator.
// Tier names live in their own gutter column, left of where organisms ever plot, so a long
// tier name can never run under a node it doesn't belong to. Tier bands and organism x-slots
// are computed from the data, never eyeballed; a link only draws once both its endpoints
// resolve to a real organism, so a dangling reference just quietly doesn't draw an arrow
// instead of crashing.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FoodWebProps, FoodWebOrganism, FoodWebLink } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FoodWebProps & { delay?: number };

const VB_W = 640;
const PAD_X = 20;
const PAD_TOP = 20;
const PAD_BOT = 20;
const GUTTER_W = 96; // left column reserved for tier names — organisms never plot inside it
const TIER_H = 92;
const NODE_R = 22;
const LABEL_MAX = 13;
const PLOT_X0 = PAD_X + GUTTER_W;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
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

interface PlacedOrganism {
  id: string;
  label: string;
  tier: number;
  cx: number;
  cy: number;
}

export function FoodWeb({
  title,
  icon = 'globe',
  iconColor = 'var(--insight)',
  tiers,
  organisms,
  links,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;

  const safeTiers = useMemo(
    () => (Array.isArray(tiers) ? tiers.filter((t): t is string => typeof t === 'string') : []),
    [tiers],
  );

  const { placed, byId } = useMemo(() => {
    const lastTier = Math.max(0, safeTiers.length - 1);
    // Group by (clamped) tier first so each band's organisms get evenly spread x-slots —
    // a raw index into the whole list would bunch a tier's nodes toward one edge whenever an
    // earlier tier held more organisms than this one.
    const byTier = new Map<number, FoodWebOrganism[]>();
    (Array.isArray(organisms) ? organisms : []).forEach((raw, i) => {
      if (!raw || typeof raw !== 'object') return;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label) return;
      const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `org-${i}`;
      const tier = Number.isFinite(raw.tier)
        ? Math.min(lastTier, Math.max(0, Math.round(raw.tier)))
        : 0;
      const arr = byTier.get(tier) ?? [];
      arr.push({ id, label, tier });
      byTier.set(tier, arr);
    });

    const innerW = VB_W - PLOT_X0 - PAD_X;
    const out: PlacedOrganism[] = [];
    for (const [tier, list] of byTier) {
      // tier 0 sits at the bottom of the stack, reading up the food chain like a ladder.
      const cy = PAD_TOP + (lastTier - tier) * TIER_H + TIER_H / 2;
      list.forEach((org, i) => {
        const cx = PLOT_X0 + ((i + 0.5) / list.length) * innerW;
        out.push({ ...org, cx, cy });
      });
    }
    return { placed: out, byId: new Map(out.map((p) => [p.id, p])) };
  }, [organisms, safeTiers.length]);

  const safeLinks = useMemo(
    () =>
      (Array.isArray(links) ? links : [])
        .map((raw): { from: PlacedOrganism; to: PlacedOrganism } | null => {
          if (!raw || typeof raw !== 'object') return null;
          const l = raw as FoodWebLink;
          const from = byId.get(typeof l.from === 'string' ? l.from : '');
          const to = byId.get(typeof l.to === 'string' ? l.to : '');
          if (!from || !to || from.id === to.id) return null;
          return { from, to };
        })
        .filter((l): l is { from: PlacedOrganism; to: PlacedOrganism } => l !== null),
    [links, byId],
  );

  const vbH = Math.max(160, safeTiers.length * TIER_H + PAD_TOP + PAD_BOT);
  const lastTier = Math.max(0, safeTiers.length - 1);

  if (placed.length === 0) {
    return (
      <div
        className="card reveal dg-card"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <p className="fwb-empty">No organisms to diagram.</p>
      </div>
    );
  }

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage fwb-stage">
        <svg
          viewBox={`0 0 ${VB_W} ${vbH}`}
          className="dg-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="fwb-arrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="fwb-arrowhead" />
            </marker>
          </defs>

          {/* tier bands, lowest trophic level at the bottom; the name lives in its own gutter
              column so it can never run under an organism it doesn't belong to */}
          {safeTiers.map((tName, i) => {
            const y = PAD_TOP + (lastTier - i) * TIER_H;
            const lines = wrap(tName, 14, 2);
            const labelCy = y + TIER_H / 2 - ((lines.length - 1) * 12) / 2 + 4;
            return (
              <g key={i}>
                {i > 0 && (
                  <line x1={PAD_X} y1={y} x2={VB_W - PAD_X} y2={y} className="fwb-tier-line" />
                )}
                <text x={PAD_X} className="fwb-tier-lbl">
                  {lines.map((ln, li) => (
                    <tspan key={li} x={PAD_X} y={labelCy + li * 12}>
                      {ln}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
          <line
            x1={PLOT_X0 - 12}
            y1={PAD_TOP}
            x2={PLOT_X0 - 12}
            y2={vbH - PAD_BOT}
            className="fwb-gutter-line"
          />

          {/* prey → predator links, drawn as a gentle arc so overlapping pairs stay legible */}
          {safeLinks.map((l, i) => {
            const dx = l.to.cx - l.from.cx;
            const dy = l.to.cy - l.from.cy;
            const dist = Math.hypot(dx, dy) || 1;
            const bow = Math.min(40, dist * 0.22);
            const mx = (l.from.cx + l.to.cx) / 2 - (dy / dist) * bow;
            const my = (l.from.cy + l.to.cy) / 2 + (dx / dist) * bow;
            // trim both ends to the node rim so the arrow lands on the border, not the label
            const angFrom = Math.atan2(my - l.from.cy, mx - l.from.cx);
            const angTo = Math.atan2(my - l.to.cy, mx - l.to.cx);
            const sx = l.from.cx + Math.cos(angFrom) * NODE_R;
            const sy = l.from.cy + Math.sin(angFrom) * NODE_R;
            const tx = l.to.cx + Math.cos(angTo) * (NODE_R + 8);
            const ty = l.to.cy + Math.sin(angTo) * (NODE_R + 8);
            return (
              <path
                key={i}
                d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`}
                className="fwb-link"
                markerEnd="url(#fwb-arrow)"
              />
            );
          })}

          {placed.map((p) => (
            <g key={p.id}>
              <circle cx={p.cx} cy={p.cy} r={NODE_R} className="fwb-node" />
              <text x={p.cx} y={p.cy + NODE_R + 14} textAnchor="middle" className="fwb-node-lbl">
                {p.label.length > LABEL_MAX && <title>{p.label}</title>}
                {truncate(p.label, LABEL_MAX)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
