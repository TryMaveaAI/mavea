import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TextfieldProps, FieldSpec } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TextfieldProps & { delay?: number };

function Field({ f, accent }: { f: FieldSpec; accent: string }) {
  const id = useId();
  const [val, setVal] = useState(f.value ?? '');
  const [focus, setFocus] = useState(false);
  const [show, setShow] = useState(false);
  const LIc = f.icon ? Icon[f.icon] : null;
  const state = f.state ?? 'default';
  const stateColor =
    state === 'error' ? 'var(--danger)' : state === 'success' ? 'var(--insight)' : accent;
  const type = f.password && !show ? 'password' : 'text';

  return (
    <div
      className={`tf-field tf-${state}`}
      style={{ ['--tf-c' as string]: stateColor } as CSSProperties}
    >
      <div className="tf-labelrow">
        <label className="tf-label" htmlFor={id}>
          {f.label}
        </label>
        {f.optional && <span className="tf-optional faint">Optional</span>}
      </div>
      <div className={`tf-input ${focus ? 'is-focus' : ''}`}>
        {LIc && <LIc className="ic tf-lead" />}
        <input
          id={id}
          className="tf-control"
          type={type}
          value={val}
          placeholder={f.placeholder}
          onChange={(e) => setVal(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {f.password ? (
          <button
            type="button"
            className="tf-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide' : 'Show'}
          >
            {show ? <Icon.eyeOff className="ic" /> : <Icon.eye className="ic" />}
          </button>
        ) : state === 'success' ? (
          <Icon.check className="ic tf-trail tf-ok" />
        ) : state === 'error' ? (
          <Icon.alert className="ic tf-trail tf-err" />
        ) : null}
      </div>
      {f.helper && (
        <div className="tf-helper">
          {state === 'error' && <Icon.alert className="ic" />}
          {state === 'success' && <Icon.check className="ic" />}
          {f.helper}
        </div>
      )}
    </div>
  );
}

export function Textfield({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  fields,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="tf-stack">
        {fields.map((f, i) => (
          <Field key={i} f={f} accent={color} />
        ))}
      </div>
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
