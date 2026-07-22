import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TextareaProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TextareaProps & { delay?: number };

export function Textarea({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  label = 'Message',
  placeholder = 'Write something…',
  value = '',
  max = 280,
  minRows = 3,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const id = useId();
  // floor the limit so a 0/invalid `max` can't produce a NaN/Infinity ratio (→ "NaN%" meter width)
  const cap = max > 0 ? max : 1;
  const [val, setVal] = useState(value.slice(0, cap));
  const [focus, setFocus] = useState(false);
  const used = val.length;
  const ratio = used / cap;
  // counter color escalates as the user approaches / hits the limit
  const counterColor =
    used >= cap ? 'var(--danger)' : ratio > 0.85 ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ta-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <label className="tf-label" htmlFor={id} style={{ display: 'block', marginBottom: 7 }}>
        {label}
      </label>
      <div className={`ta-wrap ${focus ? 'is-focus' : ''}`}>
        <textarea
          id={id}
          className="ta-control"
          value={val}
          placeholder={placeholder}
          rows={minRows}
          maxLength={cap}
          onChange={(e) => setVal(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          // auto-grow: let content drive height via field-sizing where available,
          // and a JS fallback that syncs scrollHeight on input
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.max(t.scrollHeight, 0) + 'px';
          }}
        />
        <div className="ta-foot">
          <div className="ta-meter" aria-hidden>
            <span
              className="ta-meter-fill"
              style={{ width: Math.min(100, ratio * 100) + '%', background: counterColor }}
            />
          </div>
          <span className="ta-count tab-num" style={{ color: counterColor }}>
            {used.toLocaleString()} / {cap.toLocaleString()}
          </span>
        </div>
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
