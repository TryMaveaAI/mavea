import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NumberstepperProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NumberstepperProps & { delay?: number };

export function Numberstepper({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  label = 'Quantity',
  value = 4,
  min = 0,
  max = 99,
  step = 1,
  prefix = '',
  suffix = '',
  caption,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // floor step so a degenerate step={0} can't divide-by-zero into NaN on typed input
  const safeStep = step > 0 ? step : 1;
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const [val, setVal] = useState<number>(clamp(value));

  const bump = (d: number) => setVal((v) => clamp(v + d * safeStep));
  const atMin = val <= min;
  const atMax = val >= max;

  const onInput = (raw: string) => {
    if (raw === '' || raw === '-') {
      setVal(min);
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) setVal(clamp(Math.round(n / safeStep) * safeStep));
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

      {label && (
        <label className="pk-label" htmlFor={id}>
          {label}
        </label>
      )}

      <div className="ns-control">
        <button
          type="button"
          className="ns-btn"
          disabled={atMin}
          onClick={() => bump(-1)}
          aria-label="Decrease"
        >
          <Icon.x className="ns-btn-ic minus" />
        </button>
        <div className="ns-value-wrap">
          {prefix && <span className="ns-affix">{prefix}</span>}
          <input
            id={id}
            className="ns-value tab-num"
            inputMode="numeric"
            value={String(val)}
            onChange={(e) => onInput(e.target.value)}
          />
          {suffix && <span className="ns-affix">{suffix}</span>}
        </div>
        <button
          type="button"
          className="ns-btn"
          disabled={atMax}
          onClick={() => bump(1)}
          aria-label="Increase"
        >
          <Icon.plus className="ns-btn-ic" />
        </button>
      </div>

      <div className="ns-track">
        <span
          className="ns-track-fill"
          style={{ width: ((val - min) / (max - min || 1)) * 100 + '%' }}
        />
      </div>
      <div className="ns-bounds faint">
        <span>
          {prefix}
          {min}
          {suffix}
        </span>
        <span>
          {prefix}
          {max}
          {suffix}
        </span>
      </div>

      {caption && (
        <div className="ns-caption dim" dangerouslySetInnerHTML={richInnerHtml(caption)} />
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
