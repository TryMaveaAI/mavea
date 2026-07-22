import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { HttpExchangeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HttpExchangeProps & { delay?: number };

// HTTP verb → accent token. PUT/PATCH share the "mutate-in-place" warning hue.
const METHOD_COLOR: Record<string, string> = {
  GET: 'var(--presence)',
  POST: 'var(--insight)',
  PUT: 'var(--warning)',
  PATCH: 'var(--warning)',
  DELETE: 'var(--danger)',
};

// Map an HTTP status to its class accent: 2xx success, 3xx redirect, 4xx client, 5xx server.
function statusColor(status?: number): string {
  if (typeof status !== 'number') return 'var(--text-muted)';
  if (status >= 500) return 'var(--danger)';
  if (status >= 400) return 'var(--warning)';
  if (status >= 300) return 'var(--presence)';
  if (status >= 200) return 'var(--insight)';
  return 'var(--text-muted)';
}

export function HttpExchange({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  exchanges,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  // default: the first exchange with a body is expanded, else none
  const firstWithBody = exchanges.findIndex((e) => e.reqBody || e.respPreview);
  const [open, setOpen] = useState<number>(firstWithBody);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="ai-hx">
        {exchanges.map((ex, i) => {
          const sc = statusColor(ex.status);
          const mc = METHOD_COLOR[ex.method] || 'var(--text-secondary)';
          const hasDetail = !!(ex.reqBody || ex.respPreview);
          const isOpen = open === i;
          return (
            <div className={'ai-hx-row' + (isOpen ? ' is-open' : '')} key={i}>
              <button
                className="ai-hx-head"
                onClick={() => hasDetail && setOpen(isOpen ? -1 : i)}
                // a row with no payload is a static summary, not a toggle
                {...(hasDetail ? {} : { 'aria-disabled': true, tabIndex: -1 })}
              >
                <span
                  className="ai-hx-method mono"
                  style={{ ['--c' as string]: mc } as CSSProperties}
                >
                  {ex.method}
                </span>
                <span className="ai-hx-url mono">{ex.url}</span>
                <span className="ai-hx-spacer" />
                {typeof ex.durationMs === 'number' && (
                  <span className="ai-hx-ms tab-num">
                    {formatValue(ex.durationMs, { unit: 'ms', decimals: 0 })}
                  </span>
                )}
                {typeof ex.status === 'number' && (
                  <span
                    className="ai-hx-status tab-num"
                    style={{ ['--c' as string]: sc } as CSSProperties}
                    title={ex.statusText}
                  >
                    {ex.status}
                    {ex.statusText && <span className="ai-hx-status-text"> {ex.statusText}</span>}
                  </span>
                )}
                {hasDetail && <Icon.chevR className={'ai-cot-chev' + (isOpen ? ' is-open' : '')} />}
              </button>

              {ex.note && (
                <div className="ai-hx-note" style={{ ['--c' as string]: sc } as CSSProperties}>
                  <Icon.alert className="ic" /> <span>{ex.note}</span>
                </div>
              )}

              {hasDetail && isOpen && (
                <div className="ai-hx-detail">
                  {ex.reqBody && (
                    <div className="ai-hx-pane">
                      <div className="ai-hx-pane-label">
                        <Icon.arrowUp className="ic" /> Request
                      </div>
                      <pre className="ai-hx-code mono">{ex.reqBody}</pre>
                    </div>
                  )}
                  {ex.respPreview && (
                    <div className="ai-hx-pane">
                      <div className="ai-hx-pane-label">
                        <Icon.arrowDown className="ic" style={{ color: sc }} /> Response
                      </div>
                      <pre className="ai-hx-code mono">{ex.respPreview}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {caption && <div className="ai-hx-caption">{caption}</div>}

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
