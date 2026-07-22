import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { DecisionTreeProps, DecisionNode, ClassCount } from './types';

type Props = DecisionTreeProps & { delay?: number };

// The old version rendered a single linear path — yes/no buttons stacked down the card — so it
// never read as a *tree*. This renders the actual branching structure: each question forks into
// its Yes and No subtrees with connector lines, the live path highlighted and the unchosen
// branches dimmed (still visible, so you see the whole decision space). Clicking a branch makes
// it the live path.
//
// ML-classifier mode (splitFeature/threshold/impurity/classDistribution/isLeaf) is layered on
// top of that same shape: a node with a learned split reads "feature ≤ threshold" instead of an
// authored question, and a node carrying class counts — split or leaf, exactly like a
// scikit-learn tree diagram's "value=[…]" box — shows them as a small stacked bar + legend. Every
// one of those fields is optional, so a plain yes/no node renders exactly as before.

/** Filters a class-count array down to entries the bar/legend/majority-label logic can trust —
 *  a real className string and a finite, non-negative count. Shared by `ClassBar` and the leaf's
 *  majority-class label so both agree on what counts as "real" data. */
function cleanClassDist(dist: ClassCount[] | undefined): ClassCount[] {
  return Array.isArray(dist)
    ? dist.filter(
        (c) => c && typeof c.className === 'string' && Number.isFinite(c.count) && c.count >= 0,
      )
    : [];
}

/** The class with the highest count — what a trained tree would actually predict at this node. */
function majorityClass(dist: ClassCount[]): ClassCount | null {
  return dist.reduce<ClassCount | null>(
    (best, c) => (!best || c.count > best.count ? c : best),
    null,
  );
}

/** A node's class counts as a proportional bar + legend chips. Guards its own input: a
 *  non-array, or one whose counts don't sum positive, renders nothing rather than a divide-by-
 *  zero bar or a blank legend row. */
function ClassBar({ dist }: { dist: ClassCount[] | undefined }) {
  const clean = cleanClassDist(dist);
  const total = clean.reduce((sum, c) => sum + c.count, 0);
  if (!clean.length || total <= 0) return null;

  return (
    <div className="fl-dt-classdist">
      <div className="fl-dt-classbar">
        {clean.map((c, i) => (
          <div
            key={c.className + i}
            className="fl-dt-classseg"
            style={
              {
                flexGrow: c.count,
                ['--seg-color' as string]:
                  c.color || FALLBACK_CLASS_COLORS[i % FALLBACK_CLASS_COLORS.length],
              } as CSSProperties
            }
            title={`${c.className}: ${c.count}`}
          />
        ))}
      </div>
      <div className="fl-dt-classchips">
        {clean.map((c, i) => (
          <span
            key={c.className + i}
            className="fl-dt-classchip m-stagger-item m-fade-rise"
            style={
              {
                ['--i' as string]: i,
                ['--dot-color' as string]:
                  c.color || FALLBACK_CLASS_COLORS[i % FALLBACK_CLASS_COLORS.length],
              } as CSSProperties
            }
          >
            {c.className} · {c.count}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rotation used when a class count has no explicit `color` — kept to design tokens, never hex. */
const FALLBACK_CLASS_COLORS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--presence-soft)',
];

interface BranchProps {
  node: DecisionNode | undefined;
  byId: Record<string, DecisionNode>;
  /** branch label leading into this node ('yes' | 'no'), or null for the root. */
  edge: 'yes' | 'no' | null;
  /** whether this node sits on the currently-selected path. */
  onPath: boolean;
  path: Record<string, 'yes' | 'no'>;
  choose: (id: string, branch: 'yes' | 'no') => void;
  guard: Set<string>;
  /** true only for the root node — the natural gesture target. */
  isRoot?: boolean;
}

function Branch({ node, byId, edge, onPath, path, choose, guard, isRoot }: BranchProps) {
  if (!node || guard.has(node.id)) return null;
  const nextGuard = new Set(guard).add(node.id);

  // `isLeaf` explicitly wins when set (an ML split node can carry a classDistribution too, so
  // "has class counts" can't stand in for leaf-ness); otherwise fall back to the original
  // outcome-based inference untouched.
  const isLeaf = node.isLeaf ?? (!!node.outcome && !node.yes && !node.no);
  const edgeClass = edge ? ` from-${edge}` : '';
  const dim = !onPath;

  if (isLeaf) {
    // A generic leaf always has `outcome`. An ML leaf may lean on `classDistribution` alone —
    // fall back to naming the majority class so the card never shows an icon next to blank text.
    const dist = cleanClassDist(node.classDistribution);
    const majority = majorityClass(dist);
    const label = node.outcome || majority?.className || '';
    if (!label && !dist.length) return null; // nothing to show at all — drop rather than render empty
    return (
      <div className={'fl-dt-branch-wrap' + edgeClass + (dim ? ' dimmed' : '')}>
        {edge && (
          <span className={'fl-dt-edge fl-dt-edge-' + edge}>{edge === 'yes' ? 'Yes' : 'No'}</span>
        )}
        {label && (
          <div
            className="fl-dt-outcome"
            style={
              {
                ['--c' as string]: node.outcomeColor || majority?.color || 'var(--insight)',
              } as CSSProperties
            }
          >
            <Icon.check className="ic" />
            <span>{label}</span>
          </div>
        )}
        <ClassBar dist={node.classDistribution} />
      </div>
    );
  }

  // A learned split reads as "feature ≤ threshold" in place of the authored question — the two
  // are mutually exclusive per node in practice (one tree is generic OR ML), but a node that
  // somehow sets both prefers the split condition, since it's the more specific signal.
  const splitLabel =
    node.splitFeature && Number.isFinite(node.threshold)
      ? `${node.splitFeature} ≤ ${formatValue(node.threshold as number, { decimals: 2 })}`
      : null;

  const chosen = path[node.id];
  return (
    <div className={'fl-dt-branch-wrap' + edgeClass + (dim ? ' dimmed' : '')}>
      {edge && (
        <span className={'fl-dt-edge fl-dt-edge-' + edge}>{edge === 'yes' ? 'Yes' : 'No'}</span>
      )}
      <div className="fl-dt-node" data-mark={isRoot ? 'circle' : undefined}>
        <div className="fl-dt-q">
          <span className="fl-dt-qmark">?</span>
          <div>
            <div className="fl-dt-qtext">{splitLabel || node.question}</div>
            {node.detail && <div className="fl-dt-detail">{node.detail}</div>}
            {Number.isFinite(node.impurity) && (
              <div className="fl-dt-impurity">
                {node.impurityMetric || 'gini'}{' '}
                {formatValue(node.impurity as number, { decimals: 3 })}
              </div>
            )}
          </div>
        </div>
        <div className="fl-dt-picks">
          {node.yes && byId[node.yes] && (
            <button
              className={'fl-dt-pick is-yes' + (chosen === 'yes' ? ' is-on' : '')}
              onClick={() => choose(node.id, 'yes')}
              aria-pressed={chosen === 'yes'}
            >
              <Icon.check className="ic" /> Yes
            </button>
          )}
          {node.no && byId[node.no] && (
            <button
              className={'fl-dt-pick is-no' + (chosen === 'no' ? ' is-on' : '')}
              onClick={() => choose(node.id, 'no')}
              aria-pressed={chosen === 'no'}
            >
              <Icon.x className="ic" /> No
            </button>
          )}
        </div>
        <ClassBar dist={node.classDistribution} />
      </div>
      {/* children: both subtrees, connected; the chosen one stays lit, the other dims */}
      <div className="fl-dt-children">
        {node.yes && byId[node.yes] && (
          <Branch
            node={byId[node.yes]}
            byId={byId}
            edge="yes"
            onPath={onPath && chosen === 'yes'}
            path={path}
            choose={choose}
            guard={nextGuard}
          />
        )}
        {node.no && byId[node.no] && (
          <Branch
            node={byId[node.no]}
            byId={byId}
            edge="no"
            onPath={onPath && chosen === 'no'}
            path={path}
            choose={choose}
            guard={nextGuard}
          />
        )}
      </div>
    </div>
  );
}

export function DecisionTree({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  rootId,
  nodes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const byId = useMemo(() => {
    const m: Record<string, DecisionNode> = {};
    nodes.forEach((n) => (m[n.id] = n));
    return m;
  }, [nodes]);

  // The selected path as node-id → branch. Defaults to following "yes" from the root so the
  // tree opens with a sensible live trail rather than fully collapsed.
  const [path, setPath] = useState<Record<string, 'yes' | 'no'>>(() => {
    const root = byId[rootId];
    return root && root.yes && byId[root.yes] ? { [rootId]: 'yes' } : {};
  });

  const choose = (id: string, branch: 'yes' | 'no') => setPath((p) => ({ ...p, [id]: branch }));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-dt">
        <Branch
          node={byId[rootId]}
          byId={byId}
          edge={null}
          onPath
          isRoot
          path={path}
          choose={choose}
          guard={new Set()}
        />
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
