import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { IssueTreeProps, IssueNode } from './types';

type Props = IssueTreeProps & { delay?: number };

// A MECE breakdown reads clearest when every branch at the same depth shares one color, so
// the eye can tell "these three are siblings" without following a single connector line.
// Four bands is enough for the shallow trees a real issue tree produces; a deeper one just
// cycles back to the top of the palette.
const DEPTH_PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
];

export function IssueTree({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  rootQuestion,
  nodes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const list = Array.isArray(nodes) ? nodes : [];

  const byId = new Map<string, IssueNode>();
  list.forEach((n) => {
    if (n && typeof n.id === 'string' && n.id) byId.set(n.id, n);
  });

  // The tree's shape is inferred entirely from the children references: whichever nodes no
  // OTHER node lists as a child are the branches hanging directly off `rootQuestion`. That
  // keeps the schema free of a separate rootId the model could set inconsistently with the
  // children arrays it also authored.
  const claimed = new Set<string>();
  list.forEach((n) =>
    (Array.isArray(n?.children) ? n.children : []).forEach((c) => claimed.add(c)),
  );
  const roots = list.filter((n) => n && typeof n.id === 'string' && !claimed.has(n.id));

  // One shared `seen` set across every root's traversal (not one per root) — a stray node
  // reachable from two different branches (a malformed non-tree DAG) still renders once,
  // and a genuine cycle (a node listing an ancestor, or itself) still terminates instead of
  // recursing until the stack overflows.
  const seen = new Set<string>();

  const renderNode = (id: string, depth: number): ReactNode => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    seen.add(id);
    const kidIds = Array.isArray(node.children) ? node.children : [];
    const kids = kidIds.map((k) => byId.get(k)).filter((k): k is IssueNode => !!k);
    const hasKids = kids.length > 0;
    const leaf = node.isLeaf ?? !hasKids;
    const accent = DEPTH_PALETTE[depth % DEPTH_PALETTE.length];
    return (
      <div className="fl-it-branch" key={id}>
        <div
          className={'fl-it-box' + (hasKids ? ' has-kids' : '')}
          style={{ ['--c' as string]: accent } as CSSProperties}
        >
          <div className="fl-it-label">{node.label || 'Untitled'}</div>
          {leaf && node.finding && <div className="fl-it-finding">{node.finding}</div>}
        </div>
        {hasKids && (
          <div className="fl-it-kids">{kids.map((k) => renderNode(k.id, depth + 1))}</div>
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
      {roots.length === 0 ? (
        <div className="fl-it-empty">No branches yet.</div>
      ) : (
        <div className="fl-it">
          <div className="fl-it-frame">
            <div className="fl-it-branch">
              <div className="fl-it-box fl-it-root has-kids">
                <div className="fl-it-label">{rootQuestion}</div>
              </div>
              <div className="fl-it-kids">{roots.map((n) => renderNode(n.id, 0))}</div>
            </div>
          </div>
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
