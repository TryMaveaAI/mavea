// Radial blast-radius graph: a central node ringed by the files a change touches,
// with hot edges highlighting the ones most affected.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { CodeMapProps } from '../data/conversation';

type Props = CodeMapProps & { delay?: number };

export function CodeMap({
  title = 'What this change touches',
  center,
  nodes,
  footer,
  delay,
}: Props) {
  const safeNodes = Array.isArray(nodes) ? nodes.filter((node) => node?.label) : [];
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.layers className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="codemap" role="group" aria-label={title}>
        <div className="codemap-hub">
          <span className="codemap-hub-ring" aria-hidden="true" />
          <span className="codemap-hub-dot" aria-hidden="true" />
          <strong className="mono">{center}</strong>
        </div>
        <ul className="codemap-nodes">
          {safeNodes.map((node, index) => (
            <li
              className="codemap-node"
              data-hot={node.hot || undefined}
              key={`${node.label}-${index}`}
            >
              <span className="codemap-node-dot" aria-hidden="true" />
              <span className="codemap-node-copy">
                <strong className="mono">{node.label}</strong>
                {node.note && <span>{node.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
