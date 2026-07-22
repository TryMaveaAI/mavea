import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FormpanelProps, FormField } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FormpanelProps & { delay?: number };

const DEFAULT_FIELDS: FormField[] = [
  {
    key: 'name',
    label: 'Full name',
    type: 'text',
    placeholder: 'Ada Lovelace',
    value: 'Ada Lovelace',
    required: true,
  },
  {
    key: 'email',
    label: 'Work email',
    type: 'email',
    placeholder: 'you@company.com',
    required: true,
    hint: 'We’ll never share it.',
  },
  {
    key: 'role',
    label: 'Role',
    type: 'select',
    options: ['Engineer', 'Designer', 'PM', 'Founder'],
    value: 'Engineer',
  },
  { key: 'bio', label: 'Short bio', type: 'textarea', placeholder: 'A sentence about you…' },
];

function validate(f: FormField, v: string): string | null {
  if (f.required && !v.trim()) return `${f.label} is required`;
  if (f.type === 'email' && v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
    return 'Enter a valid email';
  return null;
}

export function Formpanel({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  heading = 'Profile details',
  fields = DEFAULT_FIELDS,
  submitLabel = 'Save changes',
  success = 'Profile saved successfully.',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of fields)
      o[f.key] = f.value ?? (f.type === 'select' ? (f.options?.[0] ?? '') : '');
    return o;
  });
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);

  const setField = (k: string, v: string) => {
    setVals((s) => ({ ...s, [k]: v }));
    const f = fields.find((x) => x.key === k);
    if (f && touched[k]) setErrs((e) => ({ ...e, [k]: validate(f, v) }));
    setDone(false);
  };

  const submit = () => {
    const next: Record<string, string | null> = {};
    const t: Record<string, boolean> = {};
    let ok = true;
    for (const f of fields) {
      const err = validate(f, vals[f.key] ?? '');
      next[f.key] = err;
      t[f.key] = true;
      if (err) ok = false;
    }
    setErrs(next);
    setTouched(t);
    if (ok) setDone(true);
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {heading && <div className="fp-heading">{heading}</div>}

      <div className="fp-fields">
        {fields.map((f) => {
          const err = errs[f.key];
          const val = vals[f.key] ?? '';
          return (
            <div className={`fp-field ${err ? 'err' : ''}`} key={f.key}>
              <label className="fp-label" htmlFor={`fp-${f.key}`}>
                {f.label}
                {f.required && <span className="fp-req">*</span>}
              </label>
              {f.type === 'select' ? (
                <div className="fp-select-wrap">
                  <select
                    id={`fp-${f.key}`}
                    className="fp-input fp-select"
                    value={val}
                    onChange={(e) => setField(f.key, e.target.value)}
                  >
                    {(f.options || []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <Icon.chevR className="fp-select-caret" />
                </div>
              ) : f.type === 'textarea' ? (
                <textarea
                  id={`fp-${f.key}`}
                  className="fp-input fp-textarea"
                  value={val}
                  placeholder={f.placeholder}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, [f.key]: true }));
                    setErrs((e) => ({ ...e, [f.key]: validate(f, val) }));
                  }}
                  rows={2}
                />
              ) : (
                <input
                  id={`fp-${f.key}`}
                  className="fp-input"
                  type={f.type === 'email' ? 'email' : 'text'}
                  value={val}
                  placeholder={f.placeholder}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, [f.key]: true }));
                    setErrs((e) => ({ ...e, [f.key]: validate(f, val) }));
                  }}
                />
              )}
              {err ? (
                <span className="fp-msg err">
                  <Icon.alert className="fp-msg-ic" /> {err}
                </span>
              ) : (
                f.hint && <span className="fp-msg hint">{f.hint}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="fp-actions">
        <button type="button" className={`fp-submit ${done ? 'done' : ''}`} onClick={submit}>
          {done ? <Icon.check className="ic" /> : <Icon.send className="ic" />}
          {done ? 'Saved' : submitLabel}
        </button>
        {done && (
          <span className="fp-success">
            <Icon.check className="fp-success-ic" /> {success}
          </span>
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
