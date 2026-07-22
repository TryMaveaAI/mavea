import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SankeyProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SankeyProps & { delay?: number };

const W = 540,
  H = 300,
  PAD = 8,
  NODE_W = 12;

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

export function Sankey({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  links,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hover, setHover] = useState<string | null>(null); // node id or link id

  const model = useMemo(() => {
    const layers = Math.max(0, ...nodes.map((n) => n.layer)) + 1;
    const colX = (l: number) => PAD + (l / Math.max(1, layers - 1)) * (W - PAD * 2 - NODE_W);

    // total throughput per node (max of in/out)
    const flowOut = new Map<string, number>();
    const flowIn = new Map<string, number>();
    links.forEach((l) => {
      flowOut.set(l.source, (flowOut.get(l.source) || 0) + l.value);
      flowIn.set(l.target, (flowIn.get(l.target) || 0) + l.value);
    });
    const through = (id: string) => Math.max(flowOut.get(id) || 0, flowIn.get(id) || 0);

    // per-layer scale: stack nodes in each column
    const byLayer = new Map<number, typeof nodes>();
    nodes.forEach((n) => {
      const arr = byLayer.get(n.layer) || [];
      arr.push(n);
      byLayer.set(n.layer, arr);
    });
    // seed with 0 so an empty graph yields 0 (not -Infinity, which is truthy and survives `|| 1` below).
    const maxLayerTotal = Math.max(
      0,
      ...[...byLayer.values()].map((arr) => arr.reduce((s, n) => s + through(n.id), 0)),
    );
    const maxLayerCount = Math.max(0, ...[...byLayer.values()].map((arr) => arr.length));
    const trackH = H - PAD * 2 - 40; // vertical budget shared by node bars + inter-node gaps
    const MIN_GAP = 8;
    // Reserve gap space for the busiest layer up front so bar height itself never has to eat
    // into it after the fact — a scale derived from the bars alone can't overflow once gaps
    // are added on top of it.
    const gapBudget = MIN_GAP * Math.max(0, maxLayerCount - 1);
    const scale = (trackH - gapBudget) / (maxLayerTotal || 1); // px per unit

    const maxLayer = layers - 1;
    const pos = new Map<
      string,
      {
        x: number;
        y: number;
        h: number;
        color: string;
        label: string;
        total: number;
        isLast: boolean;
      }
    >();
    byLayer.forEach((arr, layer) => {
      const heights = arr.map((n) => Math.max(8, through(n.id) * scale));
      const sumH = heights.reduce((s, h) => s + h, 0);
      // Distribute whatever's left of the track over the gaps between this layer's nodes — a
      // sparse layer breathes freely, a dense one closes the gap toward 0. The 8px per-node
      // floor above means a layer with many low-value nodes can push sumH past trackH on its
      // own (scale is derived from the busiest layer, not this one); flooring the gap at a
      // fixed MIN_GAP regardless would add further overflow on top of that instead of
      // absorbing it, so the gap only ever shrinks to fit, never forced back up.
      const gap = arr.length > 1 ? Math.max(0, (trackH - sumH) / (arr.length - 1)) : 0;
      let y = PAD + 16;
      arr.forEach((n, i) => {
        const h = heights[i];
        pos.set(n.id, {
          x: colX(layer),
          y,
          h,
          color: n.color || PALETTE[(layer + i) % PALETTE.length],
          label: n.label,
          total: through(n.id),
          isLast: layer === maxLayer,
        });
        y += h + gap;
      });
    });

    // link geometry — track running offsets at source/target
    const srcOff = new Map<string, number>();
    const tgtOff = new Map<string, number>();
    const linkGeo = links.map((l, idx) => {
      const s = pos.get(l.source);
      const t = pos.get(l.target);
      // a link can reference an id that has no node; skip it rather than deref undefined.
      if (!s || !t) return null;
      const so = srcOff.get(l.source) || 0;
      const to = tgtOff.get(l.target) || 0;
      const sh = (l.value / (flowOut.get(l.source) || 1)) * s.h;
      const th = (l.value / (flowIn.get(l.target) || 1)) * t.h;
      srcOff.set(l.source, so + sh);
      tgtOff.set(l.target, to + th);
      const x0 = s.x + NODE_W,
        y0 = s.y + so + sh / 2;
      const x1 = t.x,
        y1 = t.y + to + th / 2;
      const mx = (x0 + x1) / 2;
      return {
        id: `${l.source}->${l.target}-${idx}`,
        source: l.source,
        target: l.target,
        value: l.value,
        thick: Math.max(1.5, (sh + th) / 2),
        color: s.color,
        d: `M${x0} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`,
      };
    });

    // Highest-throughput node is the main flow hub — Mavéa's drawn gesture circles it.
    const posEntries = [...pos.entries()];
    const salientId =
      posEntries.length > 0
        ? posEntries.reduce(
            (best, [id, n]) => (n.total > (pos.get(best)?.total ?? -1) ? id : best),
            posEntries[0][0],
          )
        : null;
    return {
      pos: [...pos.entries()],
      linkGeo: linkGeo.filter((l): l is NonNullable<typeof l> => l !== null),
      salientId,
    };
  }, [nodes, links]);

  const isLit = (linkId: string, src: string, tgt: string) =>
    !hover || hover === linkId || hover === src || hover === tgt;

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
        style={{ display: 'block' }}
      >
        {model.linkGeo.map((l) => {
          const lit = isLit(l.id, l.source, l.target);
          return (
            <path
              key={l.id}
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={l.thick}
              opacity={lit ? 0.42 : 0.08}
              style={{ transition: 'opacity var(--m-fast)' }}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {model.pos.map(([id, n]) => {
          const lit =
            !hover ||
            hover === id ||
            model.linkGeo.some((l) => l.id === hover && (l.source === id || l.target === id));
          return (
            <g
              key={id}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={n.h}
                rx={3}
                fill={n.color}
                opacity={lit ? 1 : 0.3}
                data-mark={id === model.salientId ? 'circle' : undefined}
                style={{ transition: 'opacity var(--m-fast)' }}
              />
              <text
                x={n.isLast ? n.x - 5 : n.x + NODE_W + 5}
                y={n.y + n.h / 2 + 4}
                fontSize="11.5"
                fill="var(--text-secondary)"
                textAnchor={n.isLast ? 'end' : 'start'}
                opacity={lit ? 1 : 0.4}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {hover && model.linkGeo.find((l) => l.id === hover) ? (
          (() => {
            const l = model.linkGeo.find((x) => x.id === hover)!;
            return (
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {model.pos.find(([id]) => id === l.source)?.[1].label} →{' '}
                  {model.pos.find(([id]) => id === l.target)?.[1].label}
                </strong>{' '}
                · {unit}
                {l.value.toLocaleString()}
              </span>
            );
          })()
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Hover a flow or node to trace the path</span>
        )}
      </div>
    </div>
  );
}
