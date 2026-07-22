import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { withUnit } from '../../lib/format';
import { BlockEmpty } from '../../lib/BlockEmpty';
import { effectiveValue, squarify } from '../../lib/squarify';
import type { TreemapNode, TreemapProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TreemapProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
];

function colorOf(n: TreemapNode, i: number) {
  return n.color || PALETTE[i % PALETTE.length];
}

export function Treemap({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  root,
  unit = '',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [path, setPath] = useState<number[]>([]); // drilled-in path of child indices
  const [hover, setHover] = useState<string | null>(null);

  const current = useMemo(() => {
    let n: TreemapNode = root;
    for (const idx of path) {
      if (n.children && n.children[idx]) n = n.children[idx];
    }
    return n;
  }, [root, path]);

  const W = 540,
    H = 280;
  const children = useMemo(() => current.children || [], [current]);
  // Squarified layout sized by each node's rolled-up value (its own value if a leaf, else the
  // sum of its descendants') — a container node authored with `value: 0` and its magnitude
  // living entirely in its children now sizes correctly instead of collapsing to zero width.
  const rects = useMemo(() => squarify(children, 0, 0, W, H), [children]);
  const salientNode = rects[0]?.node;
  const breadcrumb = useMemo(() => {
    const crumbs: { label: string; depth: number }[] = [{ label: root.label, depth: -1 }];
    let n: TreemapNode = root;
    path.forEach((idx, d) => {
      if (n.children && n.children[idx]) {
        n = n.children[idx];
        crumbs.push({ label: n.label, depth: d });
      }
    });
    return crumbs;
  }, [root, path]);

  if (!root.children?.length || effectiveValue(root) <= 0) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c1-crumbs">
        {breadcrumb.map((c, i) => (
          <span key={i} className="c1-crumb-wrap">
            <button
              className={'c1-crumb' + (i === breadcrumb.length - 1 ? ' active' : '')}
              onClick={() => setPath(path.slice(0, i))}
            >
              {c.label}
            </button>
            {i < breadcrumb.length - 1 && <Icon.chevR className="c1-crumb-sep" />}
          </span>
        ))}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block' }}
        className="c1-treemap"
      >
        {rects.map((r, i) => {
          const drillable = !!(r.node.children && r.node.children.length);
          const active = hover === r.node.label;
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          return (
            <g
              // Re-keyed by drill path so navigating in/out remounts every cell and replays
              // the grow-in entrance — a bloom instead of an instant snap between levels.
              key={`${path.join('-')}::${i}`}
              className="c1-tm-cell"
              style={{ ['--i' as string]: i, transformOrigin: `${cx}px ${cy}px` } as CSSProperties}
              onMouseEnter={() => setHover(r.node.label)}
              onMouseLeave={() => setHover(null)}
              // squarify sorts by size, so a rect's position in `rects` is not its position
              // in `children` — drilling in must resolve the real index or it opens the wrong node.
              onClick={() => drillable && setPath([...path, children.indexOf(r.node)])}
            >
              <rect
                className="c1-tm-rect"
                x={r.x + 1.5}
                y={r.y + 1.5}
                width={Math.max(0, r.w - 3)}
                height={Math.max(0, r.h - 3)}
                rx={8}
                fill={`color-mix(in oklab, ${colorOf(r.node, i)} ${active ? 38 : 20}%, transparent)`}
                stroke={colorOf(r.node, i)}
                strokeWidth={active ? 2 : 1}
                data-mark={r.node === salientNode ? 'circle' : undefined}
                style={
                  {
                    cursor: drillable ? 'pointer' : 'default',
                    transform: active ? 'scale(1.015)' : undefined,
                    transformOrigin: `${cx}px ${cy}px`,
                  } as CSSProperties
                }
              />
              {r.w > 56 && r.h > 30 && (
                <>
                  <text
                    x={r.x + 12}
                    y={r.y + 24}
                    fontSize="13"
                    fontWeight="600"
                    fill="var(--text-primary)"
                  >
                    {r.node.label}
                  </text>
                  <text
                    x={r.x + 12}
                    y={r.y + 42}
                    fontSize="12"
                    fill="var(--text-secondary)"
                    className="tab-num"
                  >
                    {withUnit(effectiveValue(r.node), unit)}
                    {drillable ? ' ›' : ''}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div className="insight-summary" style={{ marginTop: 12 }}>
        {hover ? (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{hover}</strong> ·{' '}
            {withUnit(
              effectiveValue(children.find((c) => c.label === hover) ?? { value: 0 }),
              unit,
            )}
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">Click a region to drill in · breadcrumb to step back</span>
        )}
      </div>
    </div>
  );
}
