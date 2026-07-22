import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { EmptystateProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EmptystateProps & { delay?: number };

function Art({ kind, c }: { kind: NonNullable<EmptystateProps['art']>; c: string }): ReactNode {
  const common = {
    fill: 'none',
    stroke: c,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (kind === 'search')
    return (
      <>
        <circle
          cx="46"
          cy="46"
          r="22"
          stroke="var(--line-strong)"
          fill="var(--surface-glass)"
          strokeWidth="1.6"
        />
        <path d="M62 62 78 78" {...common} />
        <path d="M40 46h12M46 40v12" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  if (kind === 'inbox')
    return (
      <>
        <rect
          x="22"
          y="26"
          width="56"
          height="44"
          rx="6"
          stroke="var(--line-strong)"
          fill="var(--surface-glass)"
          strokeWidth="1.6"
        />
        <path
          d="M22 52h16l4 8h16l4-8h16"
          {...common}
          fill="color-mix(in oklab, var(--presence) 12%, transparent)"
        />
        <path d="M34 38h32M34 45h22" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  if (kind === 'spark')
    return (
      <>
        <circle
          cx="50"
          cy="48"
          r="26"
          stroke="var(--line-strong)"
          fill="var(--surface-glass)"
          strokeWidth="1.6"
        />
        <path
          d="M50 34l4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Z"
          fill="color-mix(in oklab, var(--presence) 16%, transparent)"
          stroke={c}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </>
    );
  // box
  return (
    <>
      <path
        d="M50 22 76 36v28L50 78 24 64V36L50 22Z"
        stroke="var(--line-strong)"
        fill="var(--surface-glass)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M24 36 50 50 76 36M50 50v28" {...common} />
      <path d="M37 29 63 43" stroke="var(--line-strong)" strokeWidth="1.4" strokeDasharray="3 4" />
    </>
  );
}

export function Emptystate({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  art = 'box',
  headline,
  copy,
  action,
  actionIcon = 'plus',
  secondary,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const ActionIc = Icon[actionIcon] || Icon.plus;
  const [done, setDone] = useState(false);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--es-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="es-body">
        <div className="es-art" aria-hidden>
          <svg viewBox="0 0 100 100" className="es-svg" aria-hidden="true">
            <Art kind={art} c={color} />
          </svg>
        </div>
        <div className="es-headline">{headline}</div>
        {copy && <div className="es-copy" dangerouslySetInnerHTML={richInnerHtml(copy)} />}

        <div className="es-actions">
          {action && (
            <button
              type="button"
              className={`es-btn ${done ? 'done' : ''}`}
              onClick={() => setDone((d) => !d)}
            >
              {done ? <Icon.check className="ic" /> : <ActionIc className="ic" />}
              {done ? 'Added' : action}
            </button>
          )}
          {secondary && (
            <button type="button" className="mini-btn">
              {secondary}
            </button>
          )}
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
