import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ToolCallsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ToolCallsProps & { delay?: number };

const STATUS: Record<string, { c: string; label: string }> = {
  ok: { c: 'var(--insight)', label: 'OK' },
  error: { c: 'var(--danger)', label: 'ERR' },
  pending: { c: 'var(--warning)', label: 'RUNNING' },
};

export function ToolCalls({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  calls,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // default: first call expanded
  const [open, setOpen] = useState<number>(0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-tc">
        {calls.map((call, i) => {
          const isOpen = open === i;
          const st = STATUS[call.status || 'ok'] || STATUS.ok;
          return (
            <div className={'ai-tc-call' + (isOpen ? ' is-open' : '')} key={i}>
              <button className="ai-tc-head" onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className="ai-tc-conn" aria-hidden />
                <span className="ai-tc-verb mono" style={{ color: iconColor }}>
                  {call.verb || 'call'}
                </span>
                <span className="ai-tc-name mono">{call.name}</span>
                <span className="ai-tc-spacer" />
                {typeof call.ms === 'number' && (
                  <span className="ai-tc-ms tab-num">{call.ms}ms</span>
                )}
                <span className="ai-tc-status" style={{ ['--c' as string]: st.c } as CSSProperties}>
                  {st.label}
                </span>
                <Icon.chevR className={'ai-cot-chev' + (isOpen ? ' is-open' : '')} />
              </button>
              {isOpen && (
                <div className="ai-tc-detail">
                  <div className="ai-tc-pane">
                    <div className="ai-tc-pane-label">
                      <Icon.arrowUp className="ic" /> Request
                    </div>
                    <pre className="ai-tc-code mono">{call.request}</pre>
                  </div>
                  <div className="ai-tc-pane">
                    <div className="ai-tc-pane-label">
                      <Icon.arrowDown className="ic" style={{ color: st.c }} /> Response
                    </div>
                    <pre className="ai-tc-code mono">{call.response}</pre>
                  </div>
                </div>
              )}
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
