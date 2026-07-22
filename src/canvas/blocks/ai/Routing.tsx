import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RoutingProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RoutingProps & { delay?: number };

export function Routing({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  query,
  classifier = 'router',
  choices,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const takenIdx = Math.max(
    0,
    choices.findIndex((c) => c.taken),
  );
  // default selection highlights the taken path; clicking inspects another branch
  const [sel, setSel] = useState<number>(takenIdx);

  const selected = choices[sel];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-ro">
        <div className="ai-ro-source">
          {query && <div className="ai-ro-query">{query}</div>}
          <div className="ai-ro-classifier">
            <Icon.sparkle className="ic" style={{ color: iconColor }} /> {classifier}
          </div>
        </div>

        <svg
          role="img"
          aria-label={title}
          className="ai-ro-wires"
          viewBox="0 0 40 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {choices.map((c, i) => {
            const y = ((i + 0.5) / choices.length) * 100;
            const on = c.taken;
            return (
              <path
                key={i}
                d={`M0 50 C 20 50, 20 ${y}, 40 ${y}`}
                fill="none"
                stroke={on ? c.color || 'var(--insight)' : 'var(--grid-strong)'}
                strokeWidth={on ? 2.4 : 1.4}
                strokeDasharray={on ? '0' : '3 3'}
              />
            );
          })}
        </svg>

        <div className="ai-ro-choices">
          {choices.map((c, i) => {
            const cc = c.color || (c.taken ? 'var(--insight)' : 'var(--text-muted)');
            return (
              <button
                key={i}
                className={
                  'ai-ro-choice' + (c.taken ? ' is-taken' : '') + (sel === i ? ' is-sel' : '')
                }
                style={{ ['--c' as string]: cc } as CSSProperties}
                onClick={() => setSel(i)}
              >
                <span className="ai-ro-choice-top">
                  <span className="ai-ro-choice-label">{c.label}</span>
                  {c.taken && (
                    <span className="ai-ro-taken">
                      <Icon.check className="ic" />
                    </span>
                  )}
                </span>
                {c.sub && <span className="ai-ro-choice-sub">{c.sub}</span>}
                {typeof c.score === 'number' && (
                  <span className="ai-ro-choice-meter">
                    <span style={{ width: `${c.score * 100}%`, background: cc }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && selected.reason && (
        <div
          className="ai-ro-reason"
          style={
            {
              ['--c' as string]:
                selected.color || (selected.taken ? 'var(--insight)' : 'var(--presence)'),
            } as CSSProperties
          }
        >
          <Icon.quote className="ic" />
          <span>
            <strong>{selected.label}</strong> —{' '}
            <span dangerouslySetInnerHTML={richInnerHtml(selected.reason)} />
          </span>
        </div>
      )}

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
