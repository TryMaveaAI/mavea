import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StackTraceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StackTraceProps & { delay?: number };

// Renders a structured error report: error type + message, optional cause chain,
// stack frames with user-code callouts, and a plain-language fix suggestion.
// User frames get a distinct highlight so the relevant code path stands out
// immediately from library/runtime noise.
export function StackTrace({
  title,
  icon = 'alert',
  iconColor = 'var(--warning)',
  errorType,
  message,
  frames,
  cause,
  fix,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.alert;
  const frameList = frames ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="st-error-block">
        <div className="st-error-type">{errorType}</div>
        <div className="st-error-msg">{message}</div>
        {cause && <div className="st-cause">Caused by: {cause}</div>}
      </div>

      {frameList.length > 0 && (
        <div className="st-frames">
          <div className="st-frames-label">Call stack</div>
          {frameList.map((frame, i) => (
            <div key={i} className={`st-frame${frame.isUser ? ' user-code' : ''}`}>
              {/* min-width is a floor for small counts (1-2 digits) but must not clamp wider —
                  a 100+ frame trace needs 3+ digits, and the fixed 20px pushed later digits
                  into the file column. max-content lets the number claim exactly what it needs. */}
              <div className="st-frame-num" style={{ minWidth: 'max-content' }}>
                {i + 1}
              </div>
              <div className="st-file-col">
                <div className="st-file">
                  {frame.file}
                  {frame.line != null ? `:${frame.line}` : ''}
                  {frame.col != null ? `:${frame.col}` : ''}
                </div>
                {frame.fn && <div className="st-fn">{frame.fn}</div>}
                {frame.context && <div className="st-ctx">{frame.context}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {fix && (
        <div className="st-fix">
          <div className="st-fix-label">Suggested fix</div>
          <div>{fix}</div>
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
