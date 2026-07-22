import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { ModelCompareProps } from './types';

type Props = ModelCompareProps & { delay?: number };

export function ModelCompare({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  prompt,
  outputs,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // default: all models visible
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [diff, setDiff] = useState<boolean>(true);

  const toggle = (i: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      // never hide the last visible model
      if (next.has(i)) next.delete(i);
      else if (outputs.length - next.size > 1) next.add(i);
      return next;
    });

  const visible = outputs.filter((_, i) => !hidden.has(i));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <button
          className={'ai-at-toggle' + (diff ? ' is-on' : '')}
          onClick={() => setDiff((v) => !v)}
        >
          <Icon.eye className="ic" /> Diff
        </button>
      </div>

      {prompt && (
        <div className="ai-mc-prompt">
          <span className="ai-mc-prompt-tag">PROMPT</span> {prompt}
        </div>
      )}

      <div className="ai-mc-tabs">
        {outputs.map((o, i) => {
          const on = !hidden.has(i);
          const c = o.color || 'var(--presence)';
          return (
            <button
              key={i}
              className={'ai-mc-tab' + (on ? ' is-on' : '')}
              style={{ ['--c' as string]: c } as CSSProperties}
              onClick={() => toggle(i)}
            >
              <span className="ai-mc-dot" />
              {o.model}
              {o.best && <Icon.check className="ai-mc-best" />}
            </button>
          );
        })}
      </div>

      <div
        className={'ai-mc-grid' + (diff ? '' : ' no-diff')}
        style={{ ['--cols' as string]: String(visible.length) } as CSSProperties}
      >
        {outputs.map((o, i) =>
          hidden.has(i) ? null : (
            <div
              className={'ai-mc-col' + (o.best ? ' is-best' : '')}
              key={i}
              style={{ ['--c' as string]: o.color || 'var(--presence)' } as CSSProperties}
            >
              <div className="ai-mc-col-head">
                <span className="ai-mc-dot" />
                <span className="ai-mc-model">{o.model}</span>
                {o.badge && <span className="ai-mc-badge">{o.badge}</span>}
              </div>
              <div className="ai-mc-text" dangerouslySetInnerHTML={richInnerHtml(o.text)} />
              {o.meta && o.meta.length > 0 && (
                <div className="ai-mc-meta">
                  {o.meta.map((m, mi) => (
                    <span key={mi}>
                      <span className="faint">{m.k}</span> <span className="tab-num">{m.v}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
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
