import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { OrgChartProps, OrgNode } from './types';

type Props = OrgChartProps & { delay?: number };

export function OrgChart({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  rootId,
  nodes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const byId: Record<string, OrgNode> = {};
  nodes.forEach((n) => (byId[n.id] = n));

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  // `seen` guards against a model-emitted cycle (a node listing an ancestor as a child, or
  // itself) which would otherwise recurse until the stack overflows and hangs the tab. Each
  // node renders at most once — correct for an org chart, where a person has a single home.
  const renderNode = (id: string, depth: number, seen: Set<string>): ReactNode => {
    const node = byId[id];
    if (!node || seen.has(id)) return null;
    seen.add(id);
    const kids = (node.children || []).map((k) => byId[k]).filter(Boolean);
    const hasKids = kids.length > 0;
    const isCollapsed = !!collapsed[id];
    const accent = node.accent || 'var(--presence)';
    return (
      <div className="fl-org-branch" key={id}>
        <div
          // Root node (depth 0) is the org's named apex — the natural gesture target.
          data-mark={depth === 0 ? 'circle' : undefined}
          className={'fl-org-box' + (hasKids ? ' has-kids' : '')}
          style={{ ['--c' as string]: accent } as CSSProperties}
        >
          <div className="fl-org-name">{node.name}</div>
          {node.role && <div className="fl-org-role">{node.role}</div>}
          {hasKids && (
            <button
              className="fl-org-toggle"
              onClick={() => toggle(id)}
              aria-label="Toggle subtree"
            >
              {isCollapsed ? (
                <>
                  <Icon.plus className="ic" /> <span className="tab-num">{kids.length}</span>
                </>
              ) : (
                <Icon.x className="ic" />
              )}
            </button>
          )}
        </div>
        {hasKids && !isCollapsed && (
          <div className="fl-org-kids">{kids.map((k) => renderNode(k.id, depth + 1, seen))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-org">{renderNode(rootId, 0, new Set())}</div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
