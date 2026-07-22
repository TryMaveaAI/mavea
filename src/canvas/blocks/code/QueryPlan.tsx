import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { QueryPlanProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = QueryPlanProps & { delay?: number };

const INDENT = 18;

// A database EXPLAIN plan as an indented operation tree: each node shows its operation, target/
// condition, and the row / cost / time metrics, with the bottleneck node flagged. Built from a
// flat, depth-tagged node list (pre-order), so the tree shape needs no nested prop.
export function QueryPlan({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  sql,
  nodes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const rows = nodes ?? [];
  const fmtRows = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {sql && <pre className="qp-sql">{sql}</pre>}

      <div className="qp-tree">
        {rows.map((n, i) => (
          <div
            key={i}
            className={`qp-node${n.slow ? ' slow' : ''}`}
            style={{ marginLeft: Math.max(0, n.depth ?? 0) * INDENT }}
          >
            <div className="qp-node-main">
              <span className="qp-op">{n.op}</span>
              {n.detail && <span className="qp-detail">{n.detail}</span>}
            </div>
            <div className="qp-metrics">
              {n.rows != null && (
                <span className="qp-metric">
                  {fmtRows(n.rows)}
                  <i> rows</i>
                </span>
              )}
              {n.cost != null && (
                <span className="qp-metric">
                  {n.cost}
                  <i> cost</i>
                </span>
              )}
              {n.timeMs != null && (
                <span className={`qp-metric${n.slow ? ' qp-hot' : ''}`}>
                  {n.timeMs}
                  <i> ms</i>
                </span>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="log-empty">No plan</div>}
      </div>

      {caption && <div className="term-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
