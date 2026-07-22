import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SpinnerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SpinnerProps & { delay?: number };

export function Spinner({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  caption,
  buttonLabel = 'Save changes',
  loadingLabel = 'Saving…',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [busy, setBusy] = useState(false);
  const [doneOnce, setDoneOnce] = useState(false);
  const tRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(tRef.current), []);

  const run = () => {
    if (busy) return;
    setBusy(true);
    setDoneOnce(false);
    tRef.current = window.setTimeout(() => {
      setBusy(false);
      setDoneOnce(true);
    }, 1900);
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sp-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sp-showcase">
        <div className="sp-cell">
          <span className="sp-ring sp-sm" />
          <span className="sp-cell-label faint">Small</span>
        </div>
        <div className="sp-cell">
          <span className="sp-ring sp-md" />
          <span className="sp-cell-label faint">Ring</span>
        </div>
        <div className="sp-cell">
          <span className="sp-dots">
            <i /> <i /> <i />
          </span>
          <span className="sp-cell-label faint">Dots</span>
        </div>
        <div className="sp-cell">
          <span className="sp-pulse" />
          <span className="sp-cell-label faint">Pulse</span>
        </div>
      </div>

      <div className="sp-bar-wrap">
        <span className="sp-bar-label faint">Indeterminate</span>
        <span className="sp-bar">
          <span className="sp-bar-fill" />
        </span>
      </div>

      <button
        type="button"
        className={`sp-btn ${busy ? 'busy' : ''} ${doneOnce ? 'done' : ''}`}
        onClick={run}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="sp-btn-spin" /> {loadingLabel}
          </>
        ) : doneOnce ? (
          <>
            <Icon.check /> Done
          </>
        ) : (
          buttonLabel
        )}
      </button>

      {caption && (
        <div className="sp-caption faint" dangerouslySetInnerHTML={richInnerHtml(caption)} />
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
