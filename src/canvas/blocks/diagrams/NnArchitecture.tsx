// NnArchitecture — a layered neural-network diagram. One column of nodes per layer, spaced
// evenly top-to-bottom within a fixed band so columns line up regardless of how many units each
// layer has. A wide layer is capped at a readable visual maximum (CAP) with a "+N more"
// indicator rather than one dot per unit — real layers run into the hundreds, and a dot-per-unit
// render would be both illegible and slow. Edges connect ADJACENT layers only, either dense
// (every visible node to every visible node next door) or sparse (a local band around each
// node's own index, for a lighter read on a wide network).
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NnArchitectureProps, NnLayer } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NnArchitectureProps & { delay?: number };

const VIEW_W = 1000;
const PAD_X = 90;
const HEADER_Y = 26;
const NODES_TOP = 62;
const BAND_H = 300;
const CAP = 9; // visual node cap per layer; CAP-1 real dots + one "+N more" slot beyond it
const NODE_R = 10;
const MORE_R = 13;

const NAME_MAX_CHARS = 13;
const ACT_MAX_CHARS = 16;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface VisibleLayer {
  layer: NnLayer;
  colX: number;
  /** Real (drawable) unit count after capping — excludes the "+N more" slot. */
  realCount: number;
  /** Total authored units, guarded to a non-negative integer. */
  totalUnits: number;
  hasMore: boolean;
  moreCount: number;
}

function safeUnits(units: unknown): number {
  const n = typeof units === 'number' ? units : Number(units);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function nodeY(index: number, count: number): number {
  if (count <= 0) return NODES_TOP + BAND_H / 2;
  return NODES_TOP + ((index + 0.5) / count) * BAND_H;
}

export function NnArchitecture({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  layers,
  connections = 'dense',
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const safeLayers = useMemo(() => (Array.isArray(layers) ? layers : []), [layers]);

  const columns: VisibleLayer[] = useMemo(() => {
    const n = safeLayers.length;
    return safeLayers.map((layer, i) => {
      const totalUnits = safeUnits(layer?.units);
      const hasMore = totalUnits > CAP;
      const realCount = hasMore ? CAP - 1 : totalUnits;
      const colX = n <= 1 ? VIEW_W / 2 : PAD_X + (i / (n - 1)) * (VIEW_W - PAD_X * 2);
      return {
        layer,
        colX,
        realCount,
        totalUnits,
        hasMore,
        moreCount: hasMore ? totalUnits - realCount : 0,
      };
    });
  }, [safeLayers]);

  // The count each column actually renders (real dots + one "+more" slot when capped) — used
  // for the shared per-column vertical spacing so a "+more" slot gets its own even row.
  const slotCount = (c: VisibleLayer) => c.realCount + (c.hasMore ? 1 : 0);

  // A valid highlight target: an existing layer index whose unit index lands on a REAL slot
  // (never the "+more" indicator, which represents units with no single position to trace).
  const hl = useMemo(() => {
    if (!highlight || !Number.isInteger(highlight.layer) || !Number.isInteger(highlight.unit)) {
      return null;
    }
    const col = columns[highlight.layer];
    if (!col || highlight.unit < 0 || highlight.unit >= col.realCount) return null;
    return { layer: highlight.layer, unit: highlight.unit };
  }, [highlight, columns]);

  const isHighlighted = (li: number, ui: number) => !!hl && hl.layer === li && hl.unit === ui;

  const edges = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; hi: boolean }[] = [];
    for (let li = 0; li < columns.length - 1; li++) {
      const a = columns[li];
      const b = columns[li + 1];
      const aSlots = slotCount(a);
      const bSlots = slotCount(b);
      for (let ai = 0; ai < a.realCount; ai++) {
        const y1 = nodeY(ai, aSlots);
        for (let bi = 0; bi < b.realCount; bi++) {
          if (connections === 'sparse' && Math.abs(ai - bi) > 1) continue;
          const y2 = nodeY(bi, bSlots);
          const hi = isHighlighted(li, ai) || isHighlighted(li + 1, bi);
          out.push({ x1: a.colX, y1, x2: b.colX, y2, hi });
        }
      }
    }
    // draw highlighted edges last so they never sit under a faint neighbor
    return out.sort((x, y) => Number(x.hi) - Number(y.hi));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isHighlighted closes over hl, already a dep
  }, [columns, connections, hl]);

  const vbH = NODES_TOP + BAND_H + 64;

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage nn-stage">
        <svg viewBox={`0 0 ${VIEW_W} ${vbH}`} className="dg-svg" role="img" aria-label={title}>
          {edges.map((e, i) => (
            <line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              className={e.hi ? 'nn-edge nn-edge-hi' : 'nn-edge'}
            />
          ))}

          {columns.map((c, li) => {
            const name =
              typeof c.layer?.name === 'string' && c.layer.name ? c.layer.name : `Layer ${li + 1}`;
            const slots = slotCount(c);
            return (
              <g key={li}>
                <text x={c.colX} y={HEADER_Y} className="nn-name" textAnchor="middle">
                  {name.length > NAME_MAX_CHARS && <title>{name}</title>}
                  {truncate(name, NAME_MAX_CHARS)}
                </text>
                {Array.from({ length: c.realCount }, (_, ui) => (
                  <circle
                    key={ui}
                    cx={c.colX}
                    cy={nodeY(ui, slots)}
                    r={NODE_R}
                    className={isHighlighted(li, ui) ? 'nn-node nn-node-hi' : 'nn-node'}
                  />
                ))}
                {c.hasMore && (
                  <g>
                    <circle
                      cx={c.colX}
                      cy={nodeY(c.realCount, slots)}
                      r={MORE_R}
                      className="nn-more-dot"
                    />
                    <text
                      x={c.colX}
                      y={nodeY(c.realCount, slots) + 4}
                      className="nn-more-label"
                      textAnchor="middle"
                    >
                      +{c.moreCount}
                    </text>
                  </g>
                )}
                <text
                  x={c.colX}
                  y={NODES_TOP + BAND_H + 26}
                  className="nn-meta"
                  textAnchor="middle"
                >
                  {c.totalUnits} unit{c.totalUnits === 1 ? '' : 's'}
                </text>
                {c.layer?.activation && (
                  <text
                    x={c.colX}
                    y={NODES_TOP + BAND_H + 44}
                    className="nn-meta nn-act"
                    textAnchor="middle"
                  >
                    {truncate(c.layer.activation, ACT_MAX_CHARS)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
