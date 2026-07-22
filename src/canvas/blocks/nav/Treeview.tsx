import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TreeviewProps, TreeNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TreeviewProps & { delay?: number };

export function Treeview({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  nodes,
  selected,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  // seed open-set from nodes flagged `open`, keyed by path
  const seedOpen = new Set<string>();
  const seed = (list: TreeNode[], prefix: string) => {
    list.forEach((n, i) => {
      const path = `${prefix}/${i}`;
      if (n.children && n.children.length && n.open) seedOpen.add(path);
      if (n.children) seed(n.children, path);
    });
  };
  seed(nodes, '');

  const [open, setOpen] = useState<Set<string>>(seedOpen);
  const [sel, setSel] = useState<string | null>(selected ?? null);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (n: TreeNode, path: string, depth: number) => {
    const isFolder = !!(n.children && n.children.length);
    const isOpen = open.has(path);
    const selKey = path;
    const isSel = sel === selKey || (selected != null && sel == null && n.label === selected);
    const NIc = n.icon ? Icon[n.icon] : isFolder ? Icon.layers : Icon.doc;
    return (
      <div className="tv-node" key={path}>
        <button
          type="button"
          className={`tv-row ${isSel ? 'on' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            setSel(selKey);
            if (isFolder) toggle(path);
          }}
        >
          <span className={`tv-twist ${isFolder ? '' : 'leaf'} ${isOpen ? 'open' : ''}`}>
            {isFolder && <Icon.chevR className="ic" />}
          </span>
          <span className={`tv-ic ${isFolder ? 'folder' : 'file'}`}>
            <NIc className="ic" />
          </span>
          <span className="tv-label">{n.label}</span>
          {n.meta && <span className="tv-meta faint tab-num">{n.meta}</span>}
        </button>
        {isFolder && isOpen && (
          <div className="tv-children">
            {n.children!.map((c, i) => renderNode(c, `${path}/${i}`, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--nav-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="tv-tree" role="tree">
        {nodes.map((n, i) => renderNode(n, `/${i}`, 0))}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
