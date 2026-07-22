import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AgentTraceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AgentTraceProps & { delay?: number };

export function AgentTrace({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  // default: hide explored-but-rejected branches → clean "chosen path" view
  const [showAlts, setShowAlts] = useState<boolean>(false);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <button
          className={'ai-at-toggle' + (showAlts ? ' is-on' : '')}
          onClick={() => setShowAlts((v) => !v)}
        >
          <Icon.layers className="ic" /> {showAlts ? 'Explored' : 'Chosen path'}
        </button>
      </div>

      <div className="ai-at">
        {nodes.map((node, ni) => {
          const branches = showAlts ? node.branches : node.branches.filter((b) => b.chosen);
          return (
            <div className="ai-at-node" key={ni}>
              <div className="ai-at-step">
                <span className="ai-at-rail" aria-hidden />
                <span className="ai-at-stepnum tab-num">{ni + 1}</span>
                <div className="ai-at-decision">
                  <div className="ai-at-step-label">{node.step}</div>
                  <div className="ai-at-step-q">{node.decision}</div>
                </div>
              </div>
              <div className="ai-at-branches">
                {branches.map((b, bi) => {
                  const c = b.chosen ? b.color || 'var(--insight)' : 'var(--text-muted)';
                  return (
                    <div
                      className={'ai-at-branch' + (b.chosen ? ' is-chosen' : ' is-alt')}
                      key={bi}
                      style={{ ['--c' as string]: c } as CSSProperties}
                    >
                      <span className="ai-at-branch-mark">
                        {b.chosen ? <Icon.check className="ic" /> : <Icon.x className="ic" />}
                      </span>
                      <span className="ai-at-branch-label">{b.label}</span>
                      {b.note && <span className="ai-at-branch-note">{b.note}</span>}
                      {typeof b.score === 'number' && (
                        <span className="ai-at-branch-score tab-num">
                          {Math.round(b.score * 100)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
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
