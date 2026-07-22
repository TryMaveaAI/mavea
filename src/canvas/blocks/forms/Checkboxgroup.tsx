import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CheckboxgroupProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CheckboxgroupProps & { delay?: number };

export function Checkboxgroup({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  allLabel = 'Select all',
  items,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const [checks, setChecks] = useState<boolean[]>(items.map((it) => !!it.checked));

  const selectable = items
    .map((it, i) => (it.disabled ? null : i))
    .filter((i): i is number => i != null);
  const onCount = selectable.filter((i) => checks[i]).length;
  const all = selectable.length > 0 && onCount === selectable.length;
  const some = onCount > 0 && !all;

  const toggle = (i: number) => {
    if (items[i].disabled) return;
    setChecks((c) => c.map((v, j) => (j === i ? !v : v)));
  };
  const toggleAll = () => {
    const target = !all; // if all → clear, else fill all selectable
    setChecks((c) => c.map((v, j) => (items[j].disabled ? v : target)));
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--cg-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <button
        type="button"
        className="cg-all"
        onClick={toggleAll}
        aria-checked={some ? 'mixed' : all}
        role="checkbox"
      >
        <span className={`cg-box ${all ? 'on' : ''} ${some ? 'mixed' : ''}`}>
          {all ? <Icon.check className="cg-tick" /> : some ? <span className="cg-dash" /> : null}
        </span>
        <span className="cg-all-label">{allLabel}</span>
        <span className="cg-count tab-num">
          {onCount}/{selectable.length}
        </span>
      </button>

      <div className="cg-sep" />

      <div className="cg-list">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={!!checks[i]}
            disabled={it.disabled}
            className={`cg-row ${checks[i] ? 'on' : ''} ${it.disabled ? 'is-disabled' : ''}`}
            onClick={() => toggle(i)}
          >
            <span className={`cg-box ${checks[i] ? 'on' : ''}`}>
              {checks[i] && <Icon.check className="cg-tick" />}
            </span>
            <span className="cg-meta">
              <span className="cg-label">{it.label}</span>
              {it.caption && <span className="cg-cap faint">{it.caption}</span>}
            </span>
          </button>
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
