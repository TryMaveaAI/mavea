import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useTimeout } from '../../../hooks/useTimeout';
import type { ButtonbarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ButtonbarProps & { delay?: number };

const LABELS: Record<string, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  ghost: 'Ghost',
  outline: 'Outline',
  destructive: 'Destructive',
  icon: '',
  loading: 'Loading',
};

export function Buttonbar({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  buttons,
  hint = 'Try pressing any button.',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // last-pressed label drives the live hint; loading buttons spin briefly on click
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  // A loading button spins briefly, then settles — the timer self-cancels on unmount.
  useTimeout(() => setBusy(null), busy !== null ? 1400 : null);

  const press = (b: Props['buttons'][number], i: number) => {
    if (b.disabled) return;
    setLast(b.label || LABELS[b.variant] || b.variant);
    if (b.variant === 'loading') setBusy(i);
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--bb-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="bb-gallery">
        {buttons.map((b, i) => {
          const BIc = b.icon ? Icon[b.icon] : null;
          const loading = b.variant === 'loading' && busy === i;
          const cls =
            `bb-btn bb-${b.variant}` +
            (b.disabled ? ' is-disabled' : '') +
            (loading ? ' is-busy' : '');
          if (b.variant === 'icon') {
            const II = b.icon ? Icon[b.icon] || Icon.spark : Icon.spark;
            return (
              <button
                key={i}
                type="button"
                className={cls}
                disabled={b.disabled}
                aria-label={b.label || 'icon button'}
                onClick={() => press(b, i)}
              >
                <II className="ic" />
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={b.disabled}
              onClick={() => press(b, i)}
            >
              {loading ? <span className="bb-spin" aria-hidden /> : BIc && <BIc className="ic" />}
              <span>{loading ? 'Working…' : b.label || LABELS[b.variant]}</span>
            </button>
          );
        })}
      </div>

      <div className="bb-hint dim">
        {last ? (
          <>
            <Icon.check className="ic" style={{ color }} />
            <span>
              Pressed <strong style={{ color: 'var(--text-primary)' }}>{last}</strong>
            </span>
          </>
        ) : (
          hint
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
