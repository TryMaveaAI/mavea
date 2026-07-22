import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BadgesetProps, BadgeVariant } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BadgesetProps & { delay?: number };

const VARIANTS: { key: BadgeVariant; label: string }[] = [
  { key: 'solid', label: 'Solid' },
  { key: 'soft', label: 'Soft' },
  { key: 'outline', label: 'Outline' },
  { key: 'dot', label: 'Dot' },
];

export function Badgeset({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  badges,
  countIcon = 'bell',
  count = 3,
  countColor = 'var(--danger)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const CountIc = Icon[countIcon] || Icon.bell;
  // a global variant filter — flip every badge's render style at once
  const [variant, setVariant] = useState<BadgeVariant | null>(null);
  const [n, setN] = useState(count);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="bs-switch" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={variant === null}
          className={`bs-switch-btn ${variant === null ? 'on' : ''}`}
          onClick={() => setVariant(null)}
        >
          Mixed
        </button>
        {VARIANTS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="radio"
            aria-checked={variant === v.key}
            className={`bs-switch-btn ${variant === v.key ? 'on' : ''}`}
            onClick={() => setVariant(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="bs-row">
        {badges.map((b, i) => {
          const v = variant || b.variant || 'soft';
          const c = b.color || 'var(--presence)';
          const BIc = b.icon ? Icon[b.icon] : null;
          return (
            <span
              key={i}
              className={`bs-badge v-${v}`}
              style={{ ['--bg-c' as string]: c } as CSSProperties}
            >
              {v === 'dot' && <span className="bs-badge-dot" />}
              {BIc && <BIc className="bs-badge-ic" />}
              {b.label}
            </span>
          );
        })}
      </div>

      <div className="bs-count-row">
        <button
          type="button"
          className="bs-count-target"
          onClick={() => setN((x) => (x >= 9 ? 0 : x + 1))}
          title="Click to bump the count"
        >
          <CountIc className="bs-count-ic" />
          {n > 0 && (
            <span
              className="bs-count-badge"
              style={{ ['--cnt-c' as string]: countColor } as CSSProperties}
              key={n}
              // the unread count is the called-out numeric figure on this component
              data-mark="underline"
            >
              {n > 9 ? '9+' : n}
            </span>
          )}
        </button>
        <span className="bs-count-label faint">
          {n === 0 ? 'No new alerts' : `${n} unread alert${n === 1 ? '' : 's'}`}
        </span>
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
