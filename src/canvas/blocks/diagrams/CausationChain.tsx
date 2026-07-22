// Causation chain — multiple CAUSES → a central EVENT → multiple CONSEQUENCES,
// read left→right. Each side groups short-term factors above long-term ones, and
// every connector's thickness + opacity tracks its weight, so the dominant drivers
// and effects read at a glance. Geometry is computed from the data: each column's
// nodes are distributed evenly down a track, the event is centred on the column
// midline, and connectors are drawn between the measured node edges (never eyeballed).
// Use for the causes & effects of a historical event/war/revolution, root-cause
// analysis, or policy-impact mapping.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { CausationChainProps, CausationLink, CausationTerm } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CausationChainProps & { delay?: number };

// --- viewBox geometry (units; the SVG scales to fit via width:100% in CSS) ---
const VB_W = 720;
const PAD_X = 18; // left/right gutter so flush card edges never clip
const PAD_TOP = 34; // room for the column-header row
const PAD_BOT = 18;
const COL_W = 190; // cause / consequence card width
const CARD_H = 46; // node card height
const ROW_GAP = 14; // vertical gap between stacked cards in a column
const GROUP_GAP = 16; // extra gap between the short-term and long-term groups
const EVENT_W = 168; // central event card width
const EVENT_H = 64;
const MIN_H = 210;
const NODE_LH = 13; // line height for a wrapped node label (fits two lines inside CARD_H)
const NODE_CHARS = 24; // characters that fit one line inside COL_W at the node font

// x-anchors (computed once; columns are flush to their gutters, event centred).
const CAUSE_X = PAD_X; // left edge of the cause column
const CONSEQ_X = VB_W - PAD_X - COL_W; // left edge of the consequence column
const EVENT_X = (VB_W - EVENT_W) / 2; // left edge of the central event card
const EVENT_CX = EVENT_X + EVENT_W / 2;

// Term tints — short-term reads as the immediate (insight) accent, long-term as the
// slower-burning (warning) accent; an unspecified term stays neutral.
const TERM_COLOR: Record<CausationTerm, string> = {
  short: 'var(--insight)',
  long: 'var(--warning)',
};
const TERM_LABEL: Record<CausationTerm, string> = {
  short: 'Short-term',
  long: 'Long-term',
};

interface Placed {
  link: CausationLink;
  /** card top-left in viewBox units */
  x: number;
  y: number;
  /** vertical centre of the card (connector anchor) */
  cy: number;
  color: string;
  /** stroke width mapped from the weight */
  sw: number;
  /** connector opacity mapped from the weight */
  op: number;
}

// Order a side so short-term factors sit above long-term ones, preserving the
// model's order within each group. Items with no term keep their given order between.
function ordered(items: CausationLink[]): { item: CausationLink; gap: boolean }[] {
  const rank = (t?: CausationTerm) => (t === 'short' ? 0 : t === 'long' ? 2 : 1);
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.term) - rank(b.item.term) || a.i - b.i)
    .map((e) => e.item);
  // Mark where the term changes so the layout can insert a small group gap.
  return sorted.map((item, i) => ({
    item,
    gap: i > 0 && rank(sorted[i - 1].term) !== rank(item.term),
  }));
}

export function CausationChain({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  event,
  causes,
  consequences,
  causesLabel = 'Causes',
  consequencesLabel = 'Consequences',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const model = useMemo(() => {
    const left = ordered(causes ?? []);
    const right = ordered(consequences ?? []);

    // A column's drawn height = its cards + inter-card gaps + the group gap(s).
    const colHeight = (rows: { gap: boolean }[]) =>
      rows.length === 0
        ? 0
        : rows.length * CARD_H +
          (rows.length - 1) * ROW_GAP +
          rows.filter((r) => r.gap).length * GROUP_GAP;

    const leftH = colHeight(left);
    const rightH = colHeight(right);
    const contentH = Math.max(leftH, rightH, EVENT_H);
    const vbH = Math.max(MIN_H, contentH + PAD_TOP + PAD_BOT);

    // Place a column's cards centred vertically within the content band.
    const placeColumn = (rows: { item: CausationLink; gap: boolean }[], x: number): Placed[] => {
      const h = colHeight(rows);
      let y = PAD_TOP + (vbH - PAD_TOP - PAD_BOT - h) / 2;
      const out: Placed[] = [];
      for (const { item, gap } of rows) {
        if (gap) y += GROUP_GAP;
        const w = Math.max(0, Math.min(1, item.weight ?? 0.5));
        out.push({
          link: item,
          x,
          y,
          cy: y + CARD_H / 2,
          color: item.term ? TERM_COLOR[item.term] : 'var(--text-secondary)',
          // Weight → connector emphasis: thicker + more opaque for stronger links.
          sw: scaleLinear([0, 1], [1.6, 6])(w),
          op: scaleLinear([0, 1], [0.3, 0.92])(w),
        });
        y += CARD_H + ROW_GAP;
      }
      return out;
    };

    const leftPlaced = placeColumn(left, CAUSE_X);
    const rightPlaced = placeColumn(right, CONSEQ_X);
    const eventY = PAD_TOP + (vbH - PAD_TOP - PAD_BOT - EVENT_H) / 2;
    const eventCY = eventY + EVENT_H / 2;

    return { vbH, leftPlaced, rightPlaced, eventY, eventCY };
  }, [causes, consequences]);

  const { vbH, leftPlaced, rightPlaced, eventY, eventCY } = model;

  // A smooth S-curve connector between two horizontal anchors (data-driven coords).
  const link = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1.toFixed(1)},${y1.toFixed(1)} C ${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };

  // Render one column of node cards (cause = anchor on right edge, conseq = left edge).
  const renderNodes = (placed: Placed[]) =>
    placed.map((p, i) => {
      const lines = wrapLabel(p.link.label);
      const top = p.cy - ((lines.length - 1) * NODE_LH) / 2;
      return (
        <g key={i}>
          <rect
            x={p.x}
            y={p.y}
            width={COL_W}
            height={CARD_H}
            rx={10}
            className="cau-node"
            style={{ stroke: p.color }}
          />
          {/* A left rail tints the card by term. */}
          <rect x={p.x} y={p.y} width={4} height={CARD_H} rx={2} fill={p.color} />
          {p.link.term && (
            <circle
              cx={p.x + COL_W - 11}
              cy={p.y + 11}
              r={3.5}
              fill={p.color}
              className="cau-term-dot"
            >
              <title>{TERM_LABEL[p.link.term]}</title>
            </circle>
          )}
          <text x={p.x + 14} className="cau-node-lbl" dominantBaseline="middle">
            <title>{p.link.label}</title>
            {lines.map((ln, li) => (
              <tspan key={li} x={p.x + 14} y={top + li * NODE_LH}>
                {ln}
              </tspan>
            ))}
          </text>
        </g>
      );
    });

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cau-wrap">
        <svg
          viewBox={`0 0 ${VB_W} ${vbH}`}
          className="cau-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="cau-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M1,1 L6,4 L1,7" className="cau-arrowhead" />
            </marker>
          </defs>

          {/* Column headers (own row, never on a node baseline). */}
          <text x={CAUSE_X + 14} y={18} className="cau-col-hdr" textAnchor="start">
            {causesLabel} →
          </text>
          <text x={EVENT_CX} y={18} className="cau-col-hdr cau-col-hdr--event" textAnchor="middle">
            Event
          </text>
          <text x={CONSEQ_X + COL_W - 14} y={18} className="cau-col-hdr" textAnchor="end">
            → {consequencesLabel}
          </text>

          {/* Cause → event connectors (drawn first, behind the cards). */}
          {leftPlaced.map((p, i) => (
            <path
              key={`lc${i}`}
              d={link(p.x + COL_W, p.cy, EVENT_X, eventCY)}
              className="cau-link"
              style={{ stroke: p.color, strokeWidth: p.sw, opacity: p.op }}
              markerEnd="url(#cau-arrow)"
            />
          ))}

          {/* Event → consequence connectors. */}
          {rightPlaced.map((p, i) => (
            <path
              key={`rc${i}`}
              d={link(EVENT_X + EVENT_W, eventCY, p.x, p.cy)}
              className="cau-link"
              style={{ stroke: p.color, strokeWidth: p.sw, opacity: p.op }}
              markerEnd="url(#cau-arrow)"
            />
          ))}

          {/* Central event card. */}
          <rect
            x={EVENT_X}
            y={eventY}
            width={EVENT_W}
            height={EVENT_H}
            rx={12}
            className="cau-event"
          />
          <text x={EVENT_CX} y={eventCY} className="cau-event-lbl" textAnchor="middle">
            {wrapEvent(event.label).map((line, li, arr) => (
              <tspan
                key={li}
                x={EVENT_CX}
                dy={li === 0 ? `${-((arr.length - 1) * 0.55)}em` : '1.1em'}
              >
                {line}
              </tspan>
            ))}
          </text>

          {/* Node cards on top of the connectors. */}
          {renderNodes(leftPlaced)}
          {renderNodes(rightPlaced)}
        </svg>
      </div>

      {/* Legend — only when at least one term is present. */}
      {hasTerms(causes, consequences) && (
        <div className="cau-legend">
          <span className="cau-legend-item">
            <span className="cau-swatch" style={{ background: TERM_COLOR.short }} /> Short-term
          </span>
          <span className="cau-legend-item">
            <span className="cau-swatch" style={{ background: TERM_COLOR.long }} /> Long-term
          </span>
          <span className="cau-legend-item cau-legend-item--weight">line weight = strength</span>
        </div>
      )}

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

/** Greedy word-wrap a node label to fit COL_W, max two lines, ellipsising the last if it overruns.
 *  Pure and bounded — a pathological single long word is hard-truncated, never looped. */
function wrapLabel(label: string, perLine = NODE_CHARS, maxLines = 2): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
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
  return lines.length ? lines : [label];
}

/** Split a longer event label onto up to two centred lines so it fits the card. */
function wrapEvent(label: string): string[] {
  const words = label.trim().split(/\s+/);
  if (words.length <= 2 || label.length <= 16) return [label];
  // Balance the break near the middle by character count.
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function hasTerms(a?: CausationLink[], b?: CausationLink[]): boolean {
  return [...(a ?? []), ...(b ?? [])].some((x) => x.term === 'short' || x.term === 'long');
}
