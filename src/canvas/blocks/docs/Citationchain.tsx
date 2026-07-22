import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CitationchainProps, CitationNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CitationchainProps & { delay?: number };

const STRENGTH: Record<string, { c: string; t: string }> = {
  strong: { c: 'var(--insight)', t: 'strong' },
  partial: { c: 'var(--warning)', t: 'partial' },
  weak: { c: 'var(--danger)', t: 'weak' },
};

function Node({ node, path, depth }: { node: CitationNode; path: string; depth: number }) {
  const hasKids = !!(node.children && node.children.length);
  // default-expanded for the first two levels so the revealed state shows the chain
  const [open, setOpen] = useState<boolean>(depth < 2);
  const col = node.color || (depth === 0 ? 'var(--presence)' : 'var(--insight)');
  const s = node.strength ? STRENGTH[node.strength] : null;

  return (
    <div className="cc-node" style={{ ['--rail' as string]: col } as CSSProperties}>
      <button
        className={`cc-row ${open ? 'open' : ''} ${hasKids ? 'has-kids' : 'leaf'}`}
        onClick={() => hasKids && setOpen((o) => !o)}
      >
        {/* depth-0 bullet is the root claim — the authored lead of the chain */}
        <span
          className="cc-bullet"
          style={{ background: col }}
          {...(depth === 0 ? { 'data-mark': 'circle' } : {})}
        />
        {hasKids && <Icon.chevR className={`cc-chev ${open ? 'open' : ''}`} />}
        <span className="cc-label" dangerouslySetInnerHTML={richInnerHtml(node.label)} />
        {node.cite && (
          <span className="cc-cite mono">
            <Icon.link className="cc-cite-ic" />
            {node.cite}
          </span>
        )}
        {s && (
          <span
            className="cc-strength"
            style={{ color: s.c, ['--sc' as string]: s.c } as CSSProperties}
          >
            {s.t}
          </span>
        )}
      </button>
      {hasKids && (
        <div className="cc-kids" data-open={open}>
          {open &&
            node.children!.map((c, i) => (
              <Node key={`${path}-${i}`} node={c} path={`${path}-${i}`} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

export function Citationchain({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  root,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cc-tree">
        <Node node={root} path="r" depth={0} />
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
