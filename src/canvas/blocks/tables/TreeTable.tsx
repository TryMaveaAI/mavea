import { useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Icon } from '../../../icons/icons';
import type { TreeTableProps, TreeNode } from './types';

type Props = TreeTableProps & { delay?: number };

function keyOf(path: number[]) {
  return path.join('.');
}

/** Parse a `TreeNode.value` (a free-form display string like "108" or "$1.2M") down to its
 *  numeric magnitude. Non-numeric text yields 0 rather than NaN so a rollup sum never poisons. */
function num(value: string | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

interface Rollup {
  /** A node's rolled-up magnitude: its own numeric `value` when that's non-zero, or the sum of its
   *  descendants' otherwise — mirrors squarify.ts's `effectiveValue`, adapted for TreeNode's
   *  string-typed `value`. Without this, a parent authored with `value: '0'` (or no value at all)
   *  and its real magnitude living entirely in its children rendered as an empty/zero row instead
   *  of reflecting what it actually contains. */
  value: number;
  /** Same rollup, for the 0..1 `pct` share that drives the inline bar. */
  pct: number | undefined;
}

/** Resolve every node's rollup up-front in one post-order pass, so a row reads its totals by
 *  lookup instead of re-walking its own subtree each time it renders. The pass covers collapsed
 *  branches too — a parent's total is whatever it contains, expanded or not. */
function rollupTree(nodes: TreeNode[]): Map<TreeNode, Rollup> {
  const byNode = new Map<TreeNode, Rollup>();
  const visit = (n: TreeNode): Rollup => {
    const kids = n.children?.map(visit) ?? [];
    const own = num(n.value);
    const value = own > 0 || !kids.length ? own : kids.reduce((sum, k) => sum + k.value, 0);
    const share = kids.reduce((s, k) => s + (k.pct ?? 0), 0);
    const rollup: Rollup = {
      value,
      pct: n.pct != null && n.pct > 0 ? n.pct : share > 0 ? share : n.pct,
    };
    byNode.set(n, rollup);
    return rollup;
  };
  nodes.forEach(visit);
  return byNode;
}

export function TreeTable({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  valueLabel = 'Value',
  nodes,
  accent = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  // seed open-set from each node's `open` flag.
  const [open, setOpen] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    const walk = (ns: TreeNode[], path: number[]) =>
      ns.forEach((n, i) => {
        const p = [...path, i];
        if (n.open && n.children?.length) seed.add(keyOf(p));
        if (n.children) walk(n.children, p);
      });
    walk(nodes, []);
    return seed;
  });

  const rollups = useMemo(() => rollupTree(nodes), [nodes]);

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const render = (ns: TreeNode[], path: number[], depth: number): ReactElement[] =>
    ns.flatMap((n, i) => {
      const p = [...path, i];
      const k = keyOf(p);
      const isOpen = open.has(k);
      const hasKids = !!n.children?.length;
      const col = n.color || accent;
      const roll = rollups.get(n);
      const pct = roll?.pct;
      // Own value if it carries real magnitude; otherwise the rolled-up children sum, formatted
      // to match how authored values read (a plain "108", not "108.0").
      const rolled = roll?.value ?? 0;
      const displayValue = num(n.value) > 0 ? n.value : rolled > 0 ? String(rolled) : n.value;
      const rows: ReactElement[] = [
        <div
          key={k}
          className={`tt-row ${hasKids ? 'parent' : 'leaf'} ${depth === 0 ? 'top' : ''}`}
          style={{ paddingLeft: 8 + depth * 18 }}
          onClick={hasKids ? () => toggle(k) : undefined}
          onKeyDown={
            hasKids
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(k);
                  }
                }
              : undefined
          }
          role={hasKids ? 'button' : undefined}
          tabIndex={hasKids ? 0 : undefined}
        >
          <span className={`tt-caret ${hasKids ? '' : 'hidden'} ${isOpen ? 'open' : ''}`}>
            <Icon.chevR />
          </span>
          <span className="tt-label">{n.label}</span>
          {n.tag && (
            <span
              className="tt-tag"
              style={{ color: col, borderColor: `color-mix(in oklab, ${col} 40%, transparent)` }}
            >
              {n.tag}
            </span>
          )}
          <span className="tt-spacer" />
          {pct != null && (
            <span className="tt-bar">
              <span
                className="tt-bar-fill"
                style={{ width: `${Math.round(pct * 100)}%`, background: col }}
              />
            </span>
          )}
          {displayValue != null && <span className="tt-val tab-num">{displayValue}</span>}
        </div>,
      ];
      if (hasKids && isOpen) rows.push(...render(n.children!, p, depth + 1));
      return rows;
    });

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="tt-header">
        <span className="tt-h-label">Item</span>
        <span className="tt-h-val">{valueLabel}</span>
      </div>
      <div className="tt">{render(nodes, [], 0)}</div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
