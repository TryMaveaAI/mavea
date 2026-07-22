import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DocoutlineProps, OutlineNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DocoutlineProps & { delay?: number };

interface FlatRow {
  node: OutlineNode;
  depth: number;
  path: string;
  hasKids: boolean;
  index: number;
}

function flatten(nodes: OutlineNode[], depth: number, base: string, out: FlatRow[]) {
  nodes.forEach((node, i) => {
    const path = `${base}-${i}`;
    const hasKids = !!(node.children && node.children.length);
    out.push({ node, depth, path, hasKids, index: out.length });
    if (hasKids) flatten(node.children!, depth + 1, path, out);
  });
}

export function Docoutline({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  docName,
  sections,
  activeIndex = 0,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    flatten(sections, 0, 'o', out);
    return out;
  }, [sections]);

  // clamp the requested index into [0, rows.length-1] so a stale/out-of-range
  // activeIndex (or an empty outline) never points past the rendered rows
  const [active, setActive] = useState<number>(Math.max(0, Math.min(activeIndex, rows.length - 1)));
  // collapsed set keyed by path; default fully expanded
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const maxW = Math.max(1, ...rows.map((r) => r.node.weight || 0));

  // a parent is hidden if any ancestor on its path is collapsed
  const isHidden = (path: string) =>
    Object.keys(collapsed).some((cp) => collapsed[cp] && path !== cp && path.startsWith(cp + '-'));

  const total = rows.length;
  const activeNum = active + 1;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="do-head">
        {docName && <span className="do-docname mono faint">{docName}</span>}
        <span className="do-progress tab-num faint">
          <span style={{ color: 'var(--presence)' }}>{activeNum}</span>/{total}
        </span>
      </div>

      <div className="do-list">
        {rows.map((r) => {
          if (isHidden(r.path)) return null;
          const on = active === r.index;
          const col = on ? 'var(--presence)' : 'var(--text-muted)';
          const isCol = !!collapsed[r.path];
          const w = ((r.node.weight || 0) / maxW) * 100;
          return (
            <div
              key={r.path}
              className={`do-row ${on ? 'on' : ''}`}
              style={{ ['--depth' as string]: Math.min(r.depth, 6) } as CSSProperties}
            >
              <span className="do-rail" />
              {r.hasKids ? (
                <button
                  className="do-twist"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => ({ ...c, [r.path]: !c[r.path] }));
                  }}
                  aria-label={isCol ? 'expand' : 'collapse'}
                >
                  <Icon.chevR className={`do-twist-ic ${isCol ? '' : 'open'}`} />
                </button>
              ) : (
                // active leaf dot is the called-out section; <=12px marker
                <span
                  className="do-dot"
                  style={{ background: col }}
                  {...(on ? { 'data-mark': 'point' } : {})}
                />
              )}
              <button className="do-jump" onClick={() => setActive(r.index)}>
                <span className="do-heading">{r.node.heading}</span>
                {(r.node.weight ?? 0) > 0 && (
                  <span className="do-wbar">
                    <span className="do-wfill" style={{ width: w + '%' }} />
                  </span>
                )}
                {r.node.loc && <span className="do-loc mono faint">{r.node.loc}</span>}
              </button>
            </div>
          );
        })}
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
